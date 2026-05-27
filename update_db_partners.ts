import fs from 'fs';
import path from 'path';

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

async function update() {
  const { pool } = await import('./src/lib/db');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trusted_partners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        logo_url TEXT NOT NULL,
        website_url TEXT,
        visibility_pages JSONB DEFAULT '[]'::jsonb NOT NULL,
        display_style TEXT DEFAULT 'grid' NOT NULL CHECK (display_style IN ('grid', 'list', 'scroll')),
        status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    
    console.log('Successfully added trusted_partners');
  } catch (err) {
    console.error('Failed', err);
  } finally {
    await pool.end();
  }
}
update();
