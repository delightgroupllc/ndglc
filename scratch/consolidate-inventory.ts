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

async function run() {
  const { pool } = await import('../src/lib/db.js');
  const client = await pool.connect();
  try {
    console.log('Consolidating all products into Warehouse Alpha...');
    await client.query('BEGIN');

    // Get the ID of Warehouse Alpha
    const defWhRes = await client.query("SELECT id FROM warehouses WHERE name = 'Warehouse Alpha' LIMIT 1");
    if (defWhRes.rows.length === 0) {
      throw new Error("Warehouse Alpha not found");
    }
    const whId = defWhRes.rows[0].id;

    // Update all inventory records to Warehouse Alpha
    const res = await client.query("UPDATE inventory SET warehouse_id = $1", [whId]);
    console.log(`Successfully consolidated ${res.rowCount} inventory items into Warehouse Alpha.`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Consolidation failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
