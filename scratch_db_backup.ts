import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';

const envPath = '.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      process.env[trimmedLine.substring(0, eqIdx).trim()] = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const databaseUrl = process.env.DATABASE_URL || '';
const cleanedUrl = databaseUrl.split('?')[0];

const pool = new Pool({
  connectionString: cleanedUrl || undefined,
  ssl: { rejectUnauthorized: false }
});

async function backup() {
  const tables = ['companies', 'customers', 'invoices', 'invoice_items', 'products', 'product_images'];
  const client = await pool.connect();
  const backupData: Record<string, any> = {};

  try {
    console.log('Starting backup of tables:', tables.join(', '));
    for (const table of tables) {
      const res = await client.query(`SELECT * FROM ${table}`);
      backupData[table] = res.rows;
      console.log(`Backed up ${res.rows.length} rows from ${table}`);
    }
    
    const backupPath = `scratch/backup_${Date.now()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log('Backup written successfully to:', backupPath);
  } catch (err) {
    console.error('Backup failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

backup();
