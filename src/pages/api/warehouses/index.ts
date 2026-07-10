import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").toUpperCase(),
  address: z.string().optional()
});

export const GET: APIRoute = async () => {
  try {
    const res = await pool.query('SELECT * FROM warehouses ORDER BY name ASC');
    return new Response(JSON.stringify(res.rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = warehouseSchema.parse(data);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO warehouses (name, code, address)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [parsed.name, parsed.code, parsed.address || null]
      );
      const newWh = res.rows[0];

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['CREATE', 'warehouse', newWh.id, `Created storehouse ${newWh.name} (${newWh.code})`, locals.user?.id || null]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify(newWh), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
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
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: 'Warehouse with this Name or Code already exists.' }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
