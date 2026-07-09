require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const custRes = await pool.query('SELECT code, name FROM customers ORDER BY created_at DESC LIMIT 20');
    console.log('CUSTOMERS:');
    console.table(custRes.rows);

    const compRes = await pool.query('SELECT code, name FROM companies ORDER BY created_at DESC LIMIT 20');
    console.log('\nCOMPANIES:');
    console.table(compRes.rows);

    const usrRes = await pool.query('SELECT id, name, role FROM users ORDER BY created_at DESC LIMIT 20');
    console.log('\nUSERS:');
    console.table(usrRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
