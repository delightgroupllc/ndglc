import { query } from './src/lib/db.ts'; 
async function check() { 
  try {
    const res = await query('SELECT p.sku, d.name as division_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN divisions d ON c.division_id = d.id LIMIT 5'); 
    console.log("Via Category:", res.rows); 
    const res2 = await query('SELECT p.sku, d.name as division_name FROM products p LEFT JOIN divisions d ON p.division_id = d.id LIMIT 5');
    console.log("Via Product division_id:", res2.rows);
  } catch(e) {
    console.log(e);
  }
  process.exit(); 
} 
check();
