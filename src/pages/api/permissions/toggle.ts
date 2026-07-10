import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const toggleSchema = z.object({
  role_name: z.string().min(1),
  permission_name: z.string().min(1),
  enable: z.boolean()
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = toggleSchema.parse(data);

    // Enforce admin authorization
    const userRoles = locals.roles || [];
    if (!userRoles.includes('admin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin role required.' }), { status: 403 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get role ID
      const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', [parsed.role_name]);
      if (roleRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: `Role '${parsed.role_name}' not found` }), { status: 404 });
      }
      const roleId = roleRes.rows[0].id;

      // Get permission ID
      const permRes = await client.query('SELECT id FROM permissions WHERE name = $1', [parsed.permission_name]);
      if (permRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: `Permission '${parsed.permission_name}' not found` }), { status: 404 });
      }
      const permId = permRes.rows[0].id;

      if (parsed.enable) {
        // Insert mapping
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleId, permId]
        );
      } else {
        // Delete mapping
        await client.query(
          `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
          [roleId, permId]
        );
      }

      // Log to audit logs
      const actionDetails = parsed.enable
        ? `Granted permission '${parsed.permission_name}' to role '${parsed.role_name}'`
        : `Revoked permission '${parsed.permission_name}' from role '${parsed.role_name}'`;

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['PERMISSION_TOGGLE', 'permissions', permId, actionDetails, locals.user?.id || null]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
