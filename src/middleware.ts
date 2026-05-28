import { clerkMiddleware } from '@clerk/astro/server';
import { query } from './lib/db';

// High-fidelity sliding-window IP rate limiter
interface RequestLog {
  timestamps: number[];
}
const rateLimitMap = new Map<string, RequestLog>();

// Prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, log] of rateLimitMap.entries()) {
      log.timestamps = log.timestamps.filter(t => now - t < 60000);
      if (log.timestamps.length === 0) {
        rateLimitMap.delete(ip);
      }
    }
  }, 180000);
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  // IP-based Rate Limiter Check
  const ip = context.clientAddress || '127.0.0.1';
  const isApi = context.url.pathname.startsWith('/api/');
  const limit = isApi ? 60 : 120;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { timestamps: [] });
  }
  const log = rateLimitMap.get(ip)!;
  log.timestamps = log.timestamps.filter(t => now - t < 60000);

  if (log.timestamps.length >= limit) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `API / Page request threshold exceeded (${limit} req/min). Please try again later.`
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60'
        }
      }
    );
  }
  log.timestamps.push(now);

  const { userId, sessionClaims } = auth();

  // Initialize default locals
  context.locals.user = null;
  context.locals.roles = [];
  context.locals.permissions = [];
  context.locals.tags = [];

  if (userId) {
    try {
      // Check if the user exists in our local PostgreSQL database
      const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
      let localUser = userRes.rows[0];

      if (!localUser) {
        // Extract info from Clerk session claims
        let email = (sessionClaims as any)?.email || (sessionClaims as any)?.primary_email || '';
        let name = (sessionClaims as any)?.fullName || (sessionClaims as any)?.name || '';

        // If email or name is missing, fetch from Clerk API using Backend SDK
        if (!email || !name) {
          try {
            const { createClerkClient } = await import('@clerk/backend');
            const clerkSecretKey = process.env.CLERK_SECRET_KEY || import.meta.env?.CLERK_SECRET_KEY;
            const clerk = createClerkClient({ secretKey: clerkSecretKey });
            const clerkUser = await clerk.users.getUser(userId);
            email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress || '';
            name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
          } catch (clerkErr) {
            console.error('Failed to fetch user details from Clerk Backend API during sync:', clerkErr);
          }
        }

        if (!name) {
          name = email ? email.split('@')[0] : 'New User';
        }

        // Synchronize and insert user
        const insertRes = await query(
          'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *',
          [userId, email, name]
        );
        localUser = insertRes.rows[0];
        console.log(`Synced new Clerk authenticated user: ${name} (${userId})`);

        // Assign the default customer 'user' role, promoting admin emails automatically
        const isAdminEmail = email === 'sales@delightgroupllc.com' || email === 'sales@delightgroupllc.com';
        const roleNameToAssign = isAdminEmail ? 'admin' : 'user';
        const roleRes = await query("SELECT id FROM roles WHERE name = $1", [roleNameToAssign]);
        if (roleRes.rows[0]) {
          await query(
            'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, roleRes.rows[0].id]
          );
          if (isAdminEmail) {
            console.log(`Successfully elevated incoming user ${email} to admin role during session sync.`);
          }
        }
      }

      // Self-heal: If user exists in local DB but has empty email (common when switching Clerk instances/JWT config)
      if (localUser && (!localUser.email || localUser.name === 'New User')) {
        try {
          const { createClerkClient } = await import('@clerk/backend');
          const clerkSecretKey = process.env.CLERK_SECRET_KEY || import.meta.env?.CLERK_SECRET_KEY;
          const clerk = createClerkClient({ secretKey: clerkSecretKey });
          const clerkUser = await clerk.users.getUser(userId);
          const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress || '';
          const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email.split('@')[0] || 'New User';

          if (email || name) {
            const updateRes = await query(
              `UPDATE users 
               SET email = COALESCE(NULLIF($1, ''), email), 
                   name = CASE WHEN name = 'New User' AND $2 <> '' THEN $2 ELSE name END 
               WHERE id = $3 RETURNING *`,
              [email, name, userId]
            );
            localUser = updateRes.rows[0];
            console.log(`Self-healed Clerk user info for ${userId}: ${email} (${name})`);

            // Check if they should be admin
            const isAdminEmail = email === 'sales@delightgroupllc.com' || email === 'sales@delightgroupllc.com';
            if (isAdminEmail) {
              const rolesRes = await query(
                `SELECT r.name 
                 FROM roles r
                 JOIN user_roles ur ON ur.role_id = r.id
                 WHERE ur.user_id = $1`,
                [userId]
              );
              const currentRoles = rolesRes.rows.map(row => row.name);
              if (!currentRoles.includes('admin')) {
                const adminRoleRes = await query("SELECT id FROM roles WHERE name = 'admin'");
                if (adminRoleRes.rows[0]) {
                  await query(
                    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [userId, adminRoleRes.rows[0].id]
                  );
                  console.log(`Self-heal: Successfully elevated incoming user ${email} to admin role.`);
                }
              }
            }
          }
        } catch (healErr) {
          console.error('Failed to self-heal user details from Clerk:', healErr);
        }
      }

      // Enforce suspension check
      if (localUser.is_suspended) {
        if (context.url.pathname.startsWith('/dashboard')) {
          return new Response('Access Denied: Your account has been suspended by an administrator.', { status: 403 });
        }
      }

      context.locals.user = localUser;

      // Load roles from database
      const rolesRes = await query(
        `SELECT r.name 
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
         WHERE ur.user_id = $1`,
        [userId]
      );
      context.locals.roles = rolesRes.rows.map(row => row.name);

      // Load permissions (roles permissions + direct overrides)
      const rolePermsRes = await query(
        `SELECT DISTINCT p.name 
         FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         JOIN user_roles ur ON ur.role_id = rp.role_id
         WHERE ur.user_id = $1`,
        [userId]
      );
      const permissionsSet = new Set<string>(rolePermsRes.rows.map(row => row.name));

      const overridesRes = await query(
        `SELECT p.name, up.type
         FROM user_permissions up
         JOIN permissions p ON up.permission_id = p.id
         WHERE up.user_id = $1`,
        [userId]
      );
      for (const override of overridesRes.rows) {
        if (override.type === 'allow') {
          permissionsSet.add(override.name);
        } else if (override.type === 'deny') {
          permissionsSet.delete(override.name);
        }
      }
      context.locals.permissions = Array.from(permissionsSet);

      // Load user tags
      const tagsRes = await query(
        `SELECT t.name 
         FROM tags t
         JOIN user_tags ut ON ut.tag_id = t.id
         WHERE ut.user_id = $1`,
        [userId]
      );
      context.locals.tags = tagsRes.rows.map(row => row.name);

    } catch (err) {
      console.error('Error in authentication middleware sync:', err);
    }
  }

  // Secure all dashboard sub-routes
  if (context.url.pathname.startsWith('/dashboard')) {
    if (!userId) {
      return context.redirect('/login');
    }

    const path = context.url.pathname;
    const permissions = context.locals.permissions;
    const roles = context.locals.roles;

    const isAdmin = roles.includes('admin');
    const isModerator = roles.includes('moderator');

    // Protect administrative modules
    if (!isAdmin) {
      if (
        path.startsWith('/dashboard/logs') ||
        path.startsWith('/dashboard/permissions') ||
        path.startsWith('/dashboard/users')
      ) {
        return new Response('Access Denied: System Administrator privileges are required to access this portal section.', { status: 403 });
      }

      if (
        (path.startsWith('/dashboard/products') && !permissions.includes('products.create') && !isModerator) ||
        (path.startsWith('/dashboard/categories') && !isModerator) ||
        (path.startsWith('/dashboard/inventory') && !permissions.includes('inventory.manage') && !isModerator)
      ) {
        return new Response('Access Denied: You do not have permissions to perform management actions on this module.', { status: 403 });
      }
    }
  }

  return next();
});
