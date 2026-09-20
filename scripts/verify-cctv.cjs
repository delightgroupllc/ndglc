require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  try {
    const catsRes = await pool.query(
      "SELECT c.id, c.name, c.slug, d.name as division, (SELECT count(*) FROM products p WHERE p.category_id = c.id) as product_count FROM categories c JOIN divisions d ON d.id = c.division_id WHERE d.slug = 'delighttechnicallighting' ORDER BY c.display_order ASC"
    );
    console.log('\n--- DTL CATEGORIES ---');
    console.table(catsRes.rows);

    const invRes = await pool.query(
      `SELECT p.name, p.sku, c.name as category, i.stock_level, i.low_stock_threshold, w.name as warehouse
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN inventory i ON i.product_id = p.id
       JOIN warehouses w ON w.id = i.warehouse_id
       WHERE c.slug LIKE 'cctv%'
       ORDER BY p.sku ASC`
    );
    console.log('\n--- CCTV PRODUCTS & INVENTORY ---');
    console.table(invRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

verify();
