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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Adding column "division" to legal_artifacts...');
    await client.query(`
      ALTER TABLE legal_artifacts ADD COLUMN IF NOT EXISTS division VARCHAR(10) DEFAULT NULL;
    `);

    console.log('Categorizing existing legal artifacts...');
    // DGS disclaimers are the ones with 'dgs' prefix or title includes 'DGS' or were recently seeded
    await client.query(`
      UPDATE legal_artifacts 
      SET division = 'dgs' 
      WHERE identifier LIKE 'dgs%' 
         OR title LIKE '%DGS%'
         OR identifier IN ('warranty', 'Liability', 'Force Majeure:');
    `);

    // DTL disclaimers are the other general clauses
    await client.query(`
      UPDATE legal_artifacts 
      SET division = 'dtl' 
      WHERE division IS NULL 
        AND identifier NOT IN ('privacy-policy', 'cookie-policy', 'terms-of-use', 'terms-and-conditions', 'disclaimer', 'delivery-note-disclaimer');
    `);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
