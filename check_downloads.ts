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
    const rows = await client.query(`SELECT title, status, division, file_size FROM downloads ORDER BY created_at`);
    console.log('\ndownloads rows:');
    for (const r of rows.rows) {
      console.log(`  status=${r.status?.padEnd(8)} division=${r.division?.padEnd(6)} size=${r.file_size?.padEnd(8)} title=${r.title?.substring(0, 50)}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
run();
