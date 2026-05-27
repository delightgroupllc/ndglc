import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const adjustSchema = z.object({
  inventory_id: z.string().uuid(),
  change_amount: z.coerce.number().refine(val => val !== 0, { message: "Change amount cannot be zero" }),
  reason: z.string().min(1),
  warehouse_location: z.string().optional()
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = adjustSchema.parse(data);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update inventory stock level
      const invRes = await client.query(
        `UPDATE inventory 
         SET stock_level = stock_level + $1, updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [parsed.change_amount, parsed.inventory_id]
      );

      if (invRes.rowCount === 0) {
        throw new Error('Inventory record not found');
      }

      const updatedInventory = invRes.rows[0];

      // Log the adjustment
      await client.query(
        `INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          updatedInventory.id,
          parsed.change_amount,
          updatedInventory.stock_level - parsed.change_amount,
          updatedInventory.stock_level,
          parsed.reason,
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
