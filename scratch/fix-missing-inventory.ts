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
    console.log('Fixing missing inventory rows...');
    await client.query('BEGIN');

    const res = await client.query(`
      INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold)
      SELECT p.id, 0, (SELECT id FROM warehouses WHERE name = 'Warehouse Alpha' LIMIT 1), 10
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE i.id IS NULL
      RETURNING *
    `);
    
    console.log(`Initialized inventory for ${res.rowCount} missing products.`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to fix missing inventory:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
