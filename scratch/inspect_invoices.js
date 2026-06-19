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

async function inspect() {
  const { pool } = await import('../src/lib/db.js');
  const client = await pool.connect();
  try {
    const tables = ['invoices'];
    for (const table of tables) {
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      console.log(`\n── ${table} (${res.rowCount} cols) ──────────────`);
      for (const col of res.rows) {
        console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(30)} nullable=${col.is_nullable}`);
      }
    }
  } catch (err) {
    console.error('Inspect failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}
inspect();
