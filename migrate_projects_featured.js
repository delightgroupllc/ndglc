import pg from 'pg';
import { config } from 'dotenv';
config();
const { Pool } = pg;
const dbUrl = (process.env.DATABASE_URL || '').split('?')[0];
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE NOT NULL');
  console.log('DONE: featured column added to projects');
} catch(e) {
  console.error('ERR featured:', e.message);
}
try {
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb");
  console.log('DONE: gallery_images ensured on projects');
} catch(e) {
  console.error('ERR gallery_images:', e.message);
}
await pool.end();
console.log('Migration complete');
