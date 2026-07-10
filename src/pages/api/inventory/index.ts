import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const adjustSchema = z.object({
  inventory_id: z.string().uuid(),
  change_amount: z.coerce.number().default(0),
  reason: z.string().min(1),
  warehouse_id: z.string().uuid().optional(),
  low_stock_threshold: z.coerce.number().int().min(0).optional()
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = adjustSchema.parse(data);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update inventory stock level, warehouse, and threshold
      const invRes = await client.query(
        `UPDATE inventory 
         SET stock_level = stock_level + $1, 
             warehouse_id = COALESCE($3, warehouse_id),
             low_stock_threshold = COALESCE($4, low_stock_threshold),
             updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [
          parsed.change_amount,
          parsed.inventory_id,
          parsed.warehouse_id || null,
          parsed.low_stock_threshold !== undefined ? parsed.low_stock_threshold : null
        ]
      );

      if (invRes.rowCount === 0) {
        throw new Error('Inventory record not found');
      }

      const updatedInventory = invRes.rows[0];

      // Map incoming reason to check constraint values: 'purchase', 'sales', 'adjustment', 'audit'
      let dbReason = 'adjustment';
      const reqReason = parsed.reason.toLowerCase();
      if (reqReason === 'purchase' || reqReason === 'restock') {
        dbReason = 'purchase';
      } else if (reqReason === 'sales' || reqReason === 'fulfillment') {
        dbReason = 'sales';
      } else if (reqReason === 'audit' || reqReason === 'correction' || reqReason === 'location_change' || reqReason === 'threshold_change') {
        dbReason = 'audit';
      }

      // Log the adjustment
      await client.query(
        `INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          updatedInventory.id,
          parsed.change_amount,
          updatedInventory.stock_level - parsed.change_amount,
          updatedInventory.stock_level,
          dbReason,
          locals.user?.id || null
        ]
      );

      // Log the adjustment to audit_logs
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'STOCK_ADJUST',
          'inventory',
          updatedInventory.id,
          `Adjusted stock by ${parsed.change_amount > 0 ? '+' : ''}${parsed.change_amount} (New stock: ${updatedInventory.stock_level}) for reason: ${parsed.reason}`,
          locals.user?.id || null
        ]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify(updatedInventory), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
