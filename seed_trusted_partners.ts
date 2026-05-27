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

// Partner data from the `partners` table (only non-deleted: is_deleted = false)
// Mapped to the trusted_partners schema
const PARTNERS = [
  {
    name: 'Legrand',
    logo_url: 'https://iili.io/BQpzsRa.png',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'SYV',
    logo_url: 'https://iili.io/BQpz6UF.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Lutron',
    logo_url: 'https://iili.io/BQpztxR.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'SOLUX LIGHTING',
    logo_url: 'https://iili.io/BpaUlOQ.png',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'DELIGHT GREENSCAPES',
    logo_url: 'https://iili.io/Bpa6buj.jpg',
    website_url: 'https://www.delightgroupllc.com/delightgreenscapes',
    visible_on: ['dgs'],
    status: 'active',
  },
  {
    name: 'DELIGHT TECHNICAL LIGHTING',
    logo_url: 'https://iili.io/Bpa6tyb.jpg',
    website_url: 'https://www.delightgroupllc.com/delighttechnicallighting',
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  // Also include some of the well-known brands (soft-deleted from old system but worth having)
  {
    name: 'Osram Technical',
    logo_url: 'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&q=80&w=400&h=400',
    website_url: 'https://www.osram.com',
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Philips Hue Professional',
    logo_url: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400',
    website_url: 'https://www.philips-hue.com',
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Hunter Irrigation',
    logo_url: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400&h=400',
    website_url: 'https://www.hunterindustries.com',
    visible_on: ['home', 'greenscapes'],
    status: 'active',
  },
  {
    name: 'Lutron Controls',
    logo_url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=400&h=400',
    website_url: 'https://www.lutron.com',
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'ZCL',
    logo_url: 'https://iili.io/BQpziHg.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Thorn',
    logo_url: 'https://iili.io/BQpzLOJ.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Pelsan',
    logo_url: 'https://iili.io/BQpzDVp.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'HansGreen',
    logo_url: 'https://iili.io/BQpzpfI.jpg',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
  {
    name: 'Cortem Group',
    logo_url: 'https://iili.io/BQpI9UX.png',
    website_url: null,
    visible_on: ['home', 'dtl'],
    status: 'active',
  },
];

function inferDivision(visible_on: string[]): string {
  const hasDtl = visible_on.includes('dtl') || visible_on.includes('lighting');
  const hasDgs = visible_on.includes('dgs') || visible_on.includes('greenscapes');
  if (hasDtl && hasDgs) return 'both';
  if (hasDgs) return 'dgs';
  return 'dtl'; // default
}

async function seed() {
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    console.log('Starting trusted_partners seeding...\n');

    // Step 1: Ensure table exists (from schema)
    await client.query(`
      CREATE TABLE IF NOT EXISTS trusted_partners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        logo_url TEXT NOT NULL,
        website_url TEXT,
        visibility_pages JSONB DEFAULT '[]'::jsonb NOT NULL,
        display_style TEXT DEFAULT 'grid' NOT NULL CHECK (display_style IN ('grid', 'list', 'scroll')),
        status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);

    // Step 2: Add division column if missing
    await client.query(`
      ALTER TABLE trusted_partners DROP CONSTRAINT IF EXISTS trusted_partners_status_check;
    `);
    await client.query(`
      ALTER TABLE trusted_partners ADD CONSTRAINT trusted_partners_status_check
        CHECK (status IN ('active', 'inactive', 'archived'));
    `);
    await client.query(`
      ALTER TABLE trusted_partners ADD COLUMN IF NOT EXISTS division TEXT DEFAULT 'dtl'
        CHECK (division IN ('dtl', 'dgs', 'both'));
    `);

    console.log('Schema ready. Inserting partners...\n');

    let inserted = 0;
    let skipped = 0;

    for (const p of PARTNERS) {
      const division = inferDivision(p.visible_on);
      const visibility_pages = JSON.stringify(p.visible_on);

      const result = await client.query(
        `INSERT INTO trusted_partners (name, logo_url, website_url, visibility_pages, display_style, status, division)
         VALUES ($1, $2, $3, $4, 'grid', $5, $6)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [p.name, p.logo_url, p.website_url, visibility_pages, p.status, division]
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✓ Inserted: ${p.name}`);
        inserted++;
      } else {
        console.log(`  – Skipped (already exists): ${p.name}`);
        skipped++;
      }
    }

    console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
    console.log('\nVerifying current trusted_partners count...');
    const countRes = await client.query('SELECT COUNT(*) FROM trusted_partners');
    console.log(`  Total rows in trusted_partners: ${countRes.rows[0].count}`);

  } catch (err) {
    console.error('Error seeding trusted_partners:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
