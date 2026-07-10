import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const warehouseSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  code: z.string().min(1, "Code is required").toUpperCase().optional(),
  address: z.string().optional(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
  is_default: z.boolean().optional()
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'Warehouse ID is required' }), { status: 400 });

    const data = await request.json();
    const parsed = warehouseSchema.parse(data);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch current state
      const currentRes = await client.query('SELECT * FROM warehouses WHERE id = $1', [id]);
      if (currentRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: 'Warehouse not found' }), { status: 404 });
      }
      const current = currentRes.rows[0];

      if (parsed.is_default === true) {
        // Set all other warehouses as non-default
        await client.query('UPDATE warehouses SET is_default = FALSE');
      }

      const res = await client.query(
        `UPDATE warehouses 
         SET name = COALESCE($1, name), 
             code = COALESCE($2, code), 
             address = COALESCE($3, address),
             status = COALESCE($4, status),
             is_default = COALESCE($5, is_default)
         WHERE id = $6 
         RETURNING *`,
        [
          parsed.name || null,
          parsed.code || null,
          parsed.address !== undefined ? parsed.address : null,
          parsed.status || null,
          parsed.is_default !== undefined ? parsed.is_default : null,
          id
        ]
      );
      const updated = res.rows[0];

      let details = `Updated storehouse ${updated.name}.`;
      let action = 'UPDATE';
      if (parsed.status && parsed.status !== current.status) {
        details = `Changed storehouse status of ${updated.name} from '${current.status}' to '${parsed.status}'.`;
        action = parsed.status === 'deleted' ? 'TRASH' : parsed.status.toUpperCase();
      } else if (parsed.is_default === true && !current.is_default) {
        details = `Set storehouse ${updated.name} (${updated.code}) as default.`;
        action = 'SET_DEFAULT';
      }

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [action, 'warehouse', id, details, locals.user?.id || null]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify(updated), {
        status: 200,
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

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const { id } = params;
    if (!id) return new Response(JSON.stringify({ error: 'Warehouse ID is required' }), { status: 400 });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query('DELETE FROM warehouses WHERE id = $1 RETURNING *', [id]);
      if (res.rowCount === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: 'Warehouse not found' }), { status: 404 });
      }
      const deleted = res.rows[0];

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['DELETE', 'warehouse', id, `Permanently deleted storehouse ${deleted.name} (${deleted.code})`, locals.user?.id || null]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify({ message: 'Warehouse deleted successfully' }), { status: 200 });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
