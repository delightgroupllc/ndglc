import type { APIRoute } from 'astro';
import { pool } from '../../../lib/db';
import { z } from 'zod';

const overrideSchema = z.object({
  user_email: z.string().email(),
  permission_name: z.string().min(1),
  type: z.enum(['allow', 'deny'])
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = overrideSchema.parse(data);

    // Enforce admin authorization
    const userRoles = locals.roles || [];
    if (!userRoles.includes('admin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin role required.' }), { status: 403 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find user ID by email
      const userRes = await client.query('SELECT id, name FROM users WHERE email = $1', [parsed.user_email]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: `User with email '${parsed.user_email}' not found` }), { status: 404 });
      }
      const user = userRes.rows[0];

      // Get permission ID
      const permRes = await client.query('SELECT id FROM permissions WHERE name = $1', [parsed.permission_name]);
      if (permRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: `Permission '${parsed.permission_name}' not found` }), { status: 404 });
      }
      const permId = permRes.rows[0].id;

      // Upsert override
      await client.query(
        `INSERT INTO user_permissions (user_id, permission_id, type)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, permission_id) 
         DO UPDATE SET type = EXCLUDED.type`,
        [user.id, permId, parsed.type]
      );

      // Log to audit logs
      const actionDetails = `Created user permission override: set '${parsed.permission_name}' to '${parsed.type}' for user ${user.name} (${parsed.user_email})`;

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['PERMISSION_OVERRIDE_ADD', 'permissions', permId, actionDetails, locals.user?.id || null]
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

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const parsed = z.object({
      user_id: z.string().min(1),
      permission_id: z.string().min(1)
    }).parse(data);

    // Enforce admin authorization
    const userRoles = locals.roles || [];
    if (!userRoles.includes('admin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin role required.' }), { status: 403 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT name, email FROM users WHERE id = $1', [parsed.user_id]);
      const userName = userRes.rows[0]?.name || 'Unknown User';
      const userEmail = userRes.rows[0]?.email || '';

      const permRes = await client.query('SELECT name FROM permissions WHERE id = $1', [parsed.permission_id]);
      const permName = permRes.rows[0]?.name || 'Unknown Permission';

      // Delete override
      await client.query(
        `DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2`,
        [parsed.user_id, parsed.permission_id]
      );

      // Log to audit logs
      const actionDetails = `Revoked permission override for '${permName}' from user ${userName} (${userEmail})`;

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['PERMISSION_OVERRIDE_DELETE', 'permissions', parsed.permission_id, actionDetails, locals.user?.id || null]
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
