import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      process.env[trimmedLine.substring(0, eqIdx).trim()] = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

async function run() {
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='settings' ORDER BY ordinal_position`);
    console.log('settings columns:', cols.rows);
    
    const rows = await client.query(`SELECT * FROM settings LIMIT 20`);
    console.log('\nExisting settings rows:');
    for (const r of rows.rows) console.log(' ', JSON.stringify(r));
  } finally {
    client.release();
    await pool.end();
  }
}
run();
