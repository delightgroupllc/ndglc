import fs from 'fs';
import path from 'path';

// Parse .env manually
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

async function diagnose() {
  console.log('--- DATABASE DIAGNOSTIC START ---');
  try {
    // Dynamic import to ensure .env variables are loaded BEFORE src/lib/db.ts is evaluated!
    const { query } = await import('./src/lib/db');
    
    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables found in database:', res.rows.map(r => r.table_name));
  } catch (err: any) {
    console.error('Error querying tables:', err.message);
  }
  console.log('--- DATABASE DIAGNOSTIC END ---');
  process.exit(0);
}

diagnose();
