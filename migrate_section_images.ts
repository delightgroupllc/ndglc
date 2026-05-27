import { query } from './src/lib/db';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

console.log('DATABASE_URL:', process.env.DATABASE_URL);

/**
 * Migration: Add section_images table for DTL/DGS image configurator
 * Run with: npx tsx migrate_section_images.ts
 */

async function migrate() {
  try {
    console.log('Creating section_images table...');

    // Create table
    await query(`
      CREATE TABLE IF NOT EXISTS section_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        division TEXT NOT NULL CHECK (division IN ('dtl', 'dgs')),
        section TEXT NOT NULL CHECK (section IN ('hero', 'discover_by_rooms', 'featured_products', 'projects', 'instagram')),
        image_url TEXT NOT NULL,
        alt_text TEXT,
        source TEXT DEFAULT 'unsplash' NOT NULL CHECK (source IN ('unsplash', 'pexels', 'custom')),
        source_id TEXT,
        display_order INTEGER DEFAULT 0 NOT NULL,
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);

    console.log('✓ Table created');

    // Create index
    await query(`
      CREATE INDEX IF NOT EXISTS idx_section_images_division_section 
      ON section_images(division, section, is_active);
    `);

    console.log('✓ Index created');

    // Seed with sample images (optional)
    console.log('Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Add UNSPLASH_ACCESS_KEY to .env (get from https://unsplash.com/developers)');
    console.log('2. Restart the dev server');
    console.log('3. Visit /dashboard/dtl-images to manage images');

  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate().then(() => process.exit(0));
