import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const userSchema = z.object({
  action: z.enum(['suspend'])
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = userSchema.parse(data);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      if (parsed.action === 'suspend') {
        const curRes = await client.query('SELECT is_suspended FROM users WHERE id = $1', [id]);
        if (curRes.rowCount === 0) throw new Error('User not found');
        
        const currentSuspended = curRes.rows[0].is_suspended;
        const newSuspendedState = !currentSuspended;

        await client.query(
          'UPDATE users SET is_suspended = $1, updated_at = NOW() WHERE id = $2',
          [newSuspendedState, id]
        );

        // Log audit details
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ($1, 'users', $2, $3, $4)`,
          [newSuspendedState ? 'USER_SUSPEND' : 'USER_UNSUSPEND', id, `Changed suspended state to ${newSuspendedState}`, locals.user?.id || null]
        );

        await client.query('COMMIT');
        return new Response(JSON.stringify({ is_suspended: newSuspendedState }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      throw new Error("Invalid action");
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
