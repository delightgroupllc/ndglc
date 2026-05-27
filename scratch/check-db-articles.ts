import fs from 'fs';
import path from 'path';

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
  const { pool } = await import('../src/lib/db');
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
  } catch (err: any) {
    console.error('Inspection failed:', err?.message || err);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
