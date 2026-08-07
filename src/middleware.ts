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
  // IP-based Rate Limiter Check (Excluding static resource APIs)
  const isResourceApi = context.url.pathname.startsWith('/api/resources/');
  if (!isResourceApi) {
    const ip = context.clientAddress || '127.0.0.1';
    const isApi = context.url.pathname.startsWith('/api/');
    const limit = isApi ? 300 : 600;
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
  }

  const { userId, sessionClaims } = auth();

  interface ClerkSessionClaims {
    email?: string;
    primary_email?: string;
    fullName?: string;
    name?: string;
  }

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
        let email = '';
        let name = '';
        let clerkRoles: string[] = [];

        try {
          const { createClerkClient } = await import('@clerk/backend');
          const clerkSecretKey = process.env.CLERK_SECRET_KEY || import.meta.env?.CLERK_SECRET_KEY;
          const clerk = createClerkClient({ secretKey: clerkSecretKey });
          const clerkUser = await clerk.users.getUser(userId);
          email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress || '';
          name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
          
          // Read metadata roles
          const metaRole = (clerkUser.publicMetadata as any)?.role;
          const metaRoles = (clerkUser.publicMetadata as any)?.roles;
          if (Array.isArray(metaRoles)) {
            clerkRoles = metaRoles.map(String);
          } else if (metaRole) {
            clerkRoles = [String(metaRole)];
          }
        } catch (clerkErr) {
          console.error('Failed to fetch user details from Clerk Backend API during sync:', clerkErr);
          // Fallback to session claims if API call fails
          const claims = sessionClaims as unknown as ClerkSessionClaims;
          email = claims?.email || claims?.primary_email || '';
          name = claims?.fullName || claims?.name || '';
        }

        if (!name) {
          name = email ? email.split('@')[0] : 'New User';
        }

        // Handle unique constraint on email if old seed/user data exists
        if (email) {
          await query('DELETE FROM users WHERE email = $1', [email]);
        }

        // Synchronize and insert user
        const insertRes = await query(
          'INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *',
          [userId, email, name]
        );
        localUser = insertRes.rows[0];
        console.log(`Synced new Clerk authenticated user: ${name} (${userId})`);

        // Assign roles, promoting admin emails automatically or using Clerk metadata
        const isAdminEmail = email === 'sales@delightgroupllc.com';
        if (isAdminEmail && !clerkRoles.includes('admin')) {
          clerkRoles.push('admin');
        }
        if (clerkRoles.length === 0) {
          clerkRoles.push('user');
        }

        for (const r of clerkRoles) {
          const roleRes = await query("SELECT id FROM roles WHERE name = $1", [r]);
          if (roleRes.rows[0]) {
            await query(
              'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [userId, roleRes.rows[0].id]
            );
            console.log(`Assigned role "${r}" to new user ${email} during sync.`);
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

            // Sync roles from Clerk publicMetadata
            let clerkRoles: string[] = [];
            const metaRole = (clerkUser.publicMetadata as any)?.role;
            const metaRoles = (clerkUser.publicMetadata as any)?.roles;
            if (Array.isArray(metaRoles)) {
              clerkRoles = metaRoles.map(String);
            } else if (metaRole) {
              clerkRoles = [String(metaRole)];
            }

            const isAdminEmail = email === 'sales@delightgroupllc.com';
            if (isAdminEmail && !clerkRoles.includes('admin')) {
              clerkRoles.push('admin');
            }

            for (const r of clerkRoles) {
              const roleRes = await query("SELECT id FROM roles WHERE name = $1", [r]);
              if (roleRes.rows[0]) {
                await query(
                  'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                  [userId, roleRes.rows[0].id]
                );
                console.log(`Self-heal: Synced role "${r}" from Clerk metadata to database for user ${email}`);
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

  // Secure API mutation routes
  if (context.url.pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(context.request.method)) {
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const path = context.url.pathname;
    const permissions = context.locals.permissions;
    const roles = context.locals.roles;

    const isAdmin = roles.includes('admin');
    const isModerator = roles.includes('moderator');
    const isFinance = roles.includes('finance');
    const isSecurity = roles.includes('security');

    if (!isAdmin) {
      // Admin only modules
      if (
        path.startsWith('/api/users') ||
        path.startsWith('/api/permissions') ||
        path.startsWith('/api/merge') ||
        (path.startsWith('/api/legal') && !isFinance) ||
        path.startsWith('/api/settings')
      ) {
         return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }

      // Role/Permission-based modules
      if (
        (path.startsWith('/api/products') && !permissions.includes('products.create') && !isModerator) ||
        (path.startsWith('/api/categories') && !isModerator) ||
        ((path.startsWith('/api/inventory') || path.startsWith('/api/warehouses')) && !permissions.includes('inventory.manage') && !isModerator) ||
        (path.startsWith('/api/companies') && !permissions.includes('companies.manage') && !isModerator)
      ) {
         return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
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
    const isFinance = roles.includes('finance');
    const isSecurity = roles.includes('security');

    // Protect administrative modules
    if (!isAdmin) {
      if (
        (path.startsWith('/dashboard/logs') && !isSecurity) ||
        (path.startsWith('/dashboard/permissions') && !isSecurity) ||
        (path.startsWith('/dashboard/finance-legal') && !isFinance) ||
        path.startsWith('/dashboard/users')
      ) {
        return new Response('Access Denied: System Administrator privileges are required to access this portal section.', { status: 403 });
      }

      if (
        (path.startsWith('/dashboard/products') && !permissions.includes('products.create') && !isModerator) ||
        (path.startsWith('/dashboard/categories') && !isModerator) ||
        ((path.startsWith('/dashboard/inventory') || path.startsWith('/dashboard/warehouses')) && !permissions.includes('inventory.manage') && !isModerator)
      ) {
        return new Response('Access Denied: You do not have permissions to perform management actions on this module.', { status: 403 });
      }
    }
  }

  return next();
});
