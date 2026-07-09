import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;`);
    console.log('Successfully added is_archived and is_deleted to invoices table!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
