import { query } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      process.env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

async function backfillPlacement() {
  console.log('Starting ideal_room backfill for all products...');
  const res = await query('SELECT p.id, p.name, c.name as cat_name FROM products p LEFT JOIN categories c ON p.category_id = c.id');
  const products = res.rows;
  console.log(`Total products to process: ${products.length}`);

  let updatedCount = 0;
  for (const p of products) {
    const name = (p.name || '').toLowerCase();
    const cat = (p.cat_name || '').toLowerCase();

    let rooms: string[] = [];

    // Bathroom / Humidity / Outdoor
    if (name.includes('bathroom') || name.includes('ip65') || name.includes('ip68') || name.includes('waterproof')) {
      rooms.push('Bathroom', 'Outdoor Patio');
    }
    // Outdoor / Garden / Facade / Planter
    if (name.includes('outdoor') || name.includes('garden') || name.includes('bollard') || name.includes('facade') || name.includes('spike') || name.includes('grass') || name.includes('tree') || name.includes('planter') || name.includes('pot') || cat.includes('planter') || cat.includes('landscape') || cat.includes('outdoor')) {
      rooms.push('Outdoor Patio', 'Entrance & Hallway');
    }
    // Living / Foyer / Office Plants
    if (name.includes('ficus') || name.includes('monstera') || name.includes('strelitzia') || name.includes('olive') || name.includes('plant') || name.includes('green') || name.includes('aglaonema') || name.includes('cordyline') || name.includes('lyrata')) {
      rooms.push('Living Room', 'Executive Office', 'Entrance & Hallway');
    }
    // Bedroom / Pendant / Decorative
    if (name.includes('bedroom') || name.includes('bed') || name.includes('pendant') || name.includes('chandelier') || name.includes('table lamp') || name.includes('sconce')) {
      rooms.push('Bedroom', 'Living Room');
    }
    // Spotlights / Downlights / Office / Dining
    if (name.includes('spotlight') || name.includes('downlight') || name.includes('track') || name.includes('linear') || name.includes('led') || cat.includes('lighting')) {
      rooms.push('Living Room', 'Dining Room', 'Executive Office');
    }

    // Fallbacks
    if (rooms.length === 0) {
      if (cat.includes('green') || cat.includes('landscape') || cat.includes('pot') || cat.includes('plant')) {
        rooms = ['Living Room', 'Outdoor Patio', 'Entrance & Hallway'];
      } else {
        rooms = ['Living Room', 'Bedroom', 'Executive Office'];
      }
    }

    const uniqueRooms = Array.from(new Set(rooms)).join(', ');
    await query('UPDATE products SET ideal_room = $1 WHERE id = $2', [uniqueRooms, p.id]);
    updatedCount++;
  }

  console.log(`✅ Successfully updated ideal_room placement for ${updatedCount} products!`);
  
  const sample = await query('SELECT name, ideal_room FROM products LIMIT 10');
  console.log('SAMPLE UPDATED PRODUCTS:', sample.rows);

  process.exit(0);
}

backfillPlacement().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
