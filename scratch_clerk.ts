import fs from 'fs';
import path from 'path';

// Parse .env manually to load CLERK_SECRET_KEY
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmedLine.substring(0, eqIdx).trim();
      const val = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  }
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error('CLERK_SECRET_KEY is not defined in .env');
  process.exit(1);
}

async function checkClerkAndDb() {
  const email = 'sales@delightgroupllc.com';
  console.log(`--- Checking Clerk User: ${email} ---`);
  
  try {
    // 1. Fetch user from Clerk API
    const response = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Clerk API returned ${response.status}: ${errText}`);
    }

    const users = await response.json() as any[];
    console.log(`Clerk API search returned ${users.length} user(s).`);

    if (users.length === 0) {
      console.log('No user found in Clerk with this email.');
      console.log('--- Checking DB anyway ---');
    } else {
      const clerkUser = users[0];
      console.log('Clerk User Details:');
      console.log(`- ID: ${clerkUser.id}`);
      console.log(`- Name: ${clerkUser.first_name} ${clerkUser.last_name}`);
      console.log(`- Created At: ${new Date(clerkUser.created_at).toISOString()}`);
      console.log(`- Metadata:`, JSON.stringify(clerkUser.public_metadata));
    }

    // 2. Connect to local DB and check status
    const { query } = await import('./src/lib/db');
    
    const dbUserRes = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (dbUserRes.rows.length === 0) {
      console.log('\nUser is NOT present in local PostgreSQL users table yet.');
      
      if (users.length > 0) {
        const clerkUser = users[0];
        const clerkId = clerkUser.id;
        const name = `${clerkUser.first_name || ''} ${clerkUser.last_name || ''}`.trim() || 'Admin User';
        
        console.log(`We can pre-provision this user in the PostgreSQL database!`);
        console.log(`Inserting into users table: ${clerkId}, ${email}, ${name}...`);
        await query(
          "INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
          [clerkId, email, name]
        );
        
        console.log('Assigning admin role...');
        const adminRoleRes = await query("SELECT id FROM roles WHERE name = 'admin'");
        if (adminRoleRes.rows.length > 0) {
          const roleId = adminRoleRes.rows[0].id;
          await query(
            "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [clerkId, roleId]
          );
          console.log('✅ User successfully pre-provisioned and linked to admin role in database!');
        } else {
          console.warn('❌ Could not find admin role in database to link.');
        }
      }
    } else {
      const dbUser = dbUserRes.rows[0];
      console.log('\nUser IS present in local PostgreSQL database:');
      console.log(`- DB User ID: ${dbUser.id}`);
      console.log(`- DB User Name: ${dbUser.name}`);
      console.log(`- DB Suspended Status: ${dbUser.is_suspended}`);
      
      // Check roles
      const rolesRes = await query(
        `SELECT r.name 
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
         WHERE ur.user_id = $1`,
        [dbUser.id]
      );
      const roles = rolesRes.rows.map(r => r.name);
      console.log(`- DB Roles: ${roles.join(', ') || 'NONE'}`);

      if (!roles.includes('admin')) {
        console.log('User does not have admin role. Elevating now...');
        const adminRoleRes = await query("SELECT id FROM roles WHERE name = 'admin'");
        if (adminRoleRes.rows.length > 0) {
          const roleId = adminRoleRes.rows[0].id;
          await query(
            "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [dbUser.id, roleId]
          );
          console.log('✅ Elevated user to ADMIN successfully!');
        } else {
          console.warn('❌ Could not find admin role in database to link.');
        }
      } else {
        console.log('✅ User already has ADMIN role in database.');
      }
    }

  } catch (err: any) {
    console.error('Error during diagnostics:', err.message);
  }
  process.exit(0);
}

checkClerkAndDb();
