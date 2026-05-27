const fs = require('fs');
const path = require('path');
const pg = require('pg');

// Load .env variables
const envPath = path.join(process.cwd(), '.env');
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

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("No DATABASE_URL found in .env file!");
    return;
  }

  // Strip ?sslmode=...
  const cleanedUrl = databaseUrl.split('?')[0];
  const isRemote = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
  
  const pool = new pg.Pool({
    connectionString: cleanedUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    const res = await client.query("SELECT id, title, slug, division, status, featured_image FROM articles ORDER BY created_at DESC");
    console.log(`\n── Total Articles: ${res.rowCount} ──────────────`);
    for (const art of res.rows) {
      console.log(`- Title : ${art.title}`);
      console.log(`  ID    : ${art.id}`);
      console.log(`  Slug  : ${art.slug}`);
      console.log(`  Status: ${art.status}`);
      console.log(`  Div   : ${art.division}`);
      console.log(`  Image : ${art.featured_image}`);
      console.log('──────────────────────────────────────');
    }
  } catch (err) {
    console.error('Inspection failed:', err.message || err);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
