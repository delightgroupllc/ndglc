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
  try {
    const prodCountRes = await pool.query("SELECT COUNT(*) FROM products");
    const invCountRes = await pool.query("SELECT COUNT(*) FROM inventory");
    const missingRes = await pool.query(`
      SELECT p.id, p.name, p.sku 
      FROM products p 
      LEFT JOIN inventory i ON i.product_id = p.id 
      WHERE i.id IS NULL
    `);

    console.log(`Total Products in DB  : ${prodCountRes.rows[0].count}`);
    console.log(`Total Inventory Rows  : ${invCountRes.rows[0].count}`);
    console.log(`Products without Inv  : ${missingRes.rows.length}`);
    if (missingRes.rows.length > 0) {
      console.log("Missing products:", missingRes.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
