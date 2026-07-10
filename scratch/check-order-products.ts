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
    // Check total invoice items
    const itemsRes = await pool.query("SELECT COUNT(*) FROM invoice_items");
    console.log(`Total Invoice Items in DB: ${itemsRes.rows[0].count}`);

    // Check items with NULL product_id
    const nullProdRes = await pool.query("SELECT COUNT(*) FROM invoice_items WHERE product_id IS NULL");
    console.log(`Invoice Items with NULL product_id: ${nullProdRes.rows[0].count}`);

    // Check items where product_id does not exist in products table
    const orphanedRes = await pool.query(`
      SELECT ii.id, ii.invoice_id, ii.description, ii.catalogue_ref, ii.product_id
      FROM invoice_items ii
      LEFT JOIN products p ON p.id = ii.product_id
      WHERE ii.product_id IS NOT NULL AND p.id IS NULL
    `);
    console.log(`Orphaned Invoice Items (invalid product_id): ${orphanedRes.rows.length}`);
    if (orphanedRes.rows.length > 0) {
      console.log("Orphaned items:", orphanedRes.rows);
    }

    // Check unique products used in invoices
    const distinctInvoicedRes = await pool.query(`
      SELECT DISTINCT ii.product_id, p.name, p.sku
      FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
    `);
    console.log(`Distinct products used in active orders: ${distinctInvoicedRes.rows.length}`);
    console.log("Invoiced products list:");
    console.table(distinctInvoicedRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
