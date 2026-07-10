import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const transferSchema = z.object({
  product_id: z.string().uuid(),
  from_warehouse_id: z.string().uuid(),
  to_warehouse_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive("Transfer quantity must be positive"),
  reason: z.string().min(1, "Reason is required")
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = transferSchema.parse(data);

    if (parsed.from_warehouse_id === parsed.to_warehouse_id) {
      return new Response(JSON.stringify({ error: 'Source and destination warehouses must be different' }), { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Get current stock at source warehouse
      const srcRes = await client.query(
        `SELECT * FROM inventory 
         WHERE product_id = $1 AND warehouse_id = $2`,
        [parsed.product_id, parsed.from_warehouse_id]
      );

      if (srcRes.rows.length === 0 || srcRes.rows[0].stock_level < parsed.quantity) {
        return new Response(JSON.stringify({ 
          error: `Insufficient stock at source warehouse. Available: ${srcRes.rows[0]?.stock_level || 0}` 
        }), { status: 400 });
      }

      const srcInventory = srcRes.rows[0];

      // 2. Deduct stock from source warehouse
      const updatedSrcRes = await client.query(
        `UPDATE inventory 
         SET stock_level = stock_level - $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [parsed.quantity, srcInventory.id]
      );
      const updatedSrcInventory = updatedSrcRes.rows[0];

      // Log source deduction
      await client.query(
        `INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          srcInventory.id,
          -parsed.quantity,
          srcInventory.stock_level,
          updatedSrcInventory.stock_level,
          'audit',
          locals.user?.id || null
        ]
      );

      // 3. Add stock to destination warehouse (insert if not exists, update if exists)
      const destRes = await client.query(
        `SELECT * FROM inventory 
         WHERE product_id = $1 AND warehouse_id = $2`,
        [parsed.product_id, parsed.to_warehouse_id]
      );

      let updatedDestInventory;
      if (destRes.rows.length === 0) {
        // Create new inventory row in destination
        const newDestRes = await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, stock_level, low_stock_threshold)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [parsed.product_id, parsed.to_warehouse_id, parsed.quantity, 10]
        );
        updatedDestInventory = newDestRes.rows[0];

        // Log destination addition
        await client.query(
          `INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            updatedDestInventory.id,
            parsed.quantity,
            0,
            parsed.quantity,
            'audit',
            locals.user?.id || null
          ]
        );
      } else {
        const destInventory = destRes.rows[0];
        const updatedDestRes = await client.query(
          `UPDATE inventory 
           SET stock_level = stock_level + $1, updated_at = NOW()
           WHERE id = $2 RETURNING *`,
          [parsed.quantity, destInventory.id]
        );
        updatedDestInventory = updatedDestRes.rows[0];

        // Log destination addition
        await client.query(
          `INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            destInventory.id,
            parsed.quantity,
            destInventory.stock_level,
            updatedDestInventory.stock_level,
            'audit',
            locals.user?.id || null
          ]
        );
      }

      // Get product name, source name, and destination name for a readable audit log
      const infoRes = await client.query(
        `SELECT 
          (SELECT name FROM products WHERE id = $1) as prod_name,
          (SELECT name FROM warehouses WHERE id = $2) as src_name,
          (SELECT name FROM warehouses WHERE id = $3) as dest_name`,
        [parsed.product_id, parsed.from_warehouse_id, parsed.to_warehouse_id]
      );
      const info = infoRes.rows[0];

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'STOCK_TRANSFER',
          'transfer',
          parsed.product_id,
          `Transferred ${parsed.quantity} units of "${info.prod_name || 'Product'}" from "${info.src_name || 'Source Warehouse'}" to "${info.dest_name || 'Destination Warehouse'}". Reason: ${parsed.reason}`,
          locals.user?.id || null
        ]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify({ 
        message: 'Stock transferred successfully',
        source: updatedSrcInventory,
        destination: updatedDestInventory
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 550 });
  }
};
