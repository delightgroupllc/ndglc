import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const userSchema = z.object({
  action: z.enum(['suspend', 'roles']),
  roles: z.array(z.string()).optional()
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = userSchema.parse(data);

    // Enforce admin access
    const currentUserRoles = locals.roles || [];
    if (!currentUserRoles.includes('admin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin privilege required.' }), { status: 403 });
    }

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

        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ($1, 'users', $2, $3, $4)`,
          [newSuspendedState ? 'USER_SUSPEND' : 'USER_UNSUSPEND', id, `Changed suspended state to ${newSuspendedState}`, locals.user?.id || null]
        );

        await client.query('COMMIT');
        return new Response(JSON.stringify({ is_suspended: newSuspendedState }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (parsed.action === 'roles' && parsed.roles) {
        // Delete existing roles
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
        
        // Insert new roles
        for (const roleName of parsed.roles) {
          const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', [roleName]);
          if (roleRes.rowCount > 0) {
            await client.query(
              'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [id, roleRes.rows[0].id]
            );
          }
        }

        // Get user info for logging
        const userRes = await client.query('SELECT name, email FROM users WHERE id = $1', [id]);
        if (userRes.rowCount === 0) throw new Error('User not found');
        const userObj = userRes.rows[0];

        // Audit log
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ('USER_ROLES_UPDATE', 'users', $1, $2, $3)`,
          [id, `Updated roles for ${userObj.name} (${userObj.email}) to: ${parsed.roles.join(', ')}`, locals.user?.id || null]
        );

        await client.query('COMMIT');
        return new Response(JSON.stringify({ roles: parsed.roles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
