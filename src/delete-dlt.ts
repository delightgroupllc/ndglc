import { query } from './lib/db';
async function del() {
  try {
    const res = await query(`DELETE FROM products WHERE sku ILIKE '%DLT%' RETURNING sku`);
    console.log('Deleted:', res.rows.length, 'items');
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
del();
