import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Parse .env manually BEFORE evaluating db connection to avoid ESM order problems
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    
    const eqIdx = trimmedLine.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmedLine.substring(0, eqIdx).trim();
      const val = trimmedLine.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  }
}

async function main() {
  console.log('🚀 Initiating Database Mega Seeding Process...\n');

  // Dynamic import of the pre-configured db pool and query function
  const { query, pool } = await import('./db');
  const client = await pool.connect();

  try {
    // ══════════════════════════════════════════════
    // STEP 1: Verify Schema Tables
    // ══════════════════════════════════════════════
    console.log('1️⃣ Verifying database core tables via schema.sql...');
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      console.log('  ✓ Core database tables verified/created successfully.');
    } else {
      console.warn('  ⚠️ schema.sql not found at project root. Skipping initialization.');
    }

    // ══════════════════════════════════════════════
    // STEP 2: Apply Historic Database Migrations
    // ══════════════════════════════════════════════
    console.log('\n2️⃣ Applying all historic database migrations (ALTER TABLE)...');
    
    // projects table columns
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE NOT NULL;');
    await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;");

    // downloads table columns
    await client.query('ALTER TABLE downloads ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT NULL;');
    await client.query("ALTER TABLE downloads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'archived'));");
    await client.query("ALTER TABLE downloads ADD COLUMN IF NOT EXISTS division TEXT DEFAULT 'dtl' CHECK (division IN ('dtl', 'dgs'));");
    await client.query('ALTER TABLE downloads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();');

    // trusted_partners table columns & constraints
    await client.query('ALTER TABLE trusted_partners DROP CONSTRAINT IF EXISTS trusted_partners_status_check;');
    await client.query("ALTER TABLE trusted_partners ADD CONSTRAINT trusted_partners_status_check CHECK (status IN ('active', 'inactive', 'archived'));");
    await client.query("ALTER TABLE trusted_partners ADD COLUMN IF NOT EXISTS division TEXT DEFAULT 'dtl' CHECK (division IN ('dtl', 'dgs', 'both'));");

    // section_images table columns
    await client.query("ALTER TABLE section_images ADD COLUMN IF NOT EXISTS folder_path TEXT DEFAULT '/' NOT NULL;");

    // invoices table columns
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_vat TEXT;');
    await client.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'fixed';");
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0;');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_images BOOLEAN DEFAULT FALSE;');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;');
    await client.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'standard';");
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_division TEXT;');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0;');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;');
    await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN DEFAULT FALSE NOT NULL;');

    // invoice_items table columns
    await client.query("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'percentage';");
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_value DOUBLE PRECISION DEFAULT 5;');
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS item_image TEXT;');
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS catalogue_ref TEXT;');
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tech_spec TEXT;');
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION DEFAULT 5;');
    await client.query('ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0;');

    // Ensure organizations, disclaimers, terms_and_conditions exist (legacy support)
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE
      );
      CREATE TABLE IF NOT EXISTS disclaimers (
        id INTEGER PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        updated_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS terms_and_conditions (
        id INTEGER PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id),
        section_title TEXT NOT NULL,
        content TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ
      );
    `);

    console.log('  ✓ Historic migrations applied successfully.');

    // ══════════════════════════════════════════════
    // STEP 3: Seed Roles & Permissions
    // ══════════════════════════════════════════════
    console.log('\n3️⃣ Seeding roles & permissions (idempotently)...');
    const roles = [
      { name: 'admin', description: 'System Administrator with full corporate controls' },
      { name: 'moderator', description: 'Business Moderator with catalog and CRM manager permissions' },
      { name: 'user', description: 'Standard Client/Partner customer portal access' }
    ];
    
    const roleIds: Record<string, string> = {};
    for (const r of roles) {
      const res = await client.query(
        'INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id',
        [r.name, r.description]
      );
      roleIds[r.name] = res.rows[0].id;
    }

    const permissions = [
      { name: 'products.create', description: 'Create new catalog products' },
      { name: 'products.update', description: 'Update catalog products and specifications' },
      { name: 'products.delete', description: 'Remove catalog products' },
      { name: 'users.manage', description: 'Manage user roles, tags, and suspension states' },
      { name: 'inventory.manage', description: 'Manage stock levels, locations, and low thresholds' },
      { name: 'invoices.manage', description: 'Generate, edit, and pay corporate invoices' },
      { name: 'downloads.manage', description: 'Create and edit secure download attachments' },
      { name: 'contacts.manage', description: 'Manage CRM customer enquiries and resolve statuses' },
      { name: 'logs.view', description: 'View system audit logs' }
    ];

    const permIds: Record<string, string> = {};
    for (const p of permissions) {
      const res = await client.query(
        'INSERT INTO permissions (name, description) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id',
        [p.name, p.description]
      );
      permIds[p.name] = res.rows[0].id;
    }

    // Map Role Permissions
    await client.query('DELETE FROM role_permissions;');
    for (const permId of Object.values(permIds)) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleIds['admin'], permId]
      );
    }

    const modPerms = ['products.create', 'products.update', 'inventory.manage', 'downloads.manage', 'contacts.manage'];
    for (const pName of modPerms) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleIds['moderator'], permIds[pName]]
      );
    }
    console.log('  ✓ Corporate Roles and Permissions mapped.');

    // Seed customer tags
    const tags = ['client', 'partner', 'VIP', 'supplier'];
    for (const t of tags) {
      await client.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [t]);
    }
    console.log('  ✓ Customer tags seeded.');

    // ══════════════════════════════════════════════
    // STEP 4: Seed Divisions & Categories
    // ══════════════════════════════════════════════
    console.log('\n4️⃣ Seeding divisions & categories...');
    const divisions = [
      { 
        name: 'Delight Technical Lighting', 
        slug: 'delighttechnicallighting', 
        description: 'Indoor & outdoor architectural lighting fixtures sourced from premium global brands, supplied UAE-wide.' 
      },
      { 
        name: 'Delight Greenscapes', 
        slug: 'delightgreenscapes', 
        description: 'Curated indoor & outdoor plants, designer pots, and bespoke planters supplied to residences and hotels across the UAE.' 
      }
    ];
    
    const divIds: Record<string, string> = {};
    for (const d of divisions) {
      const res = await client.query(
        'INSERT INTO divisions (name, slug, description) VALUES ($1, $2, $3) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description RETURNING id',
        [d.name, d.slug, d.description]
      );
      divIds[d.slug] = res.rows[0].id;
    }

    const categories = [
      // DTL (Technical Lighting)
      { divisionSlug: 'delighttechnicallighting', name: 'Indoor Technical Lighting', slug: 'indoor-lighting', order: 1, seoTitle: 'Indoor Technical Lighting UAE', seoDesc: 'Premium spotlight tracks, downlights, and linear profiles.' },
      { divisionSlug: 'delighttechnicallighting', name: 'Outdoor & Facade Lighting', slug: 'outdoor-lighting', order: 2, seoTitle: 'Outdoor Landscape & Facade Lighting UAE', seoDesc: 'IP67 uplights, garden spike spotlights, and architectural floodlights.' },
      { divisionSlug: 'delighttechnicallighting', name: 'Commercial & Office Lighting', slug: 'commercial-lighting', order: 3, seoTitle: 'Commercial & Office Lighting Solutions Dubai', seoDesc: 'Corporate office high-performance linear and custom ceiling lights.' },
      { divisionSlug: 'delighttechnicallighting', name: 'Smart Controls & Systems', slug: 'smart-lighting', order: 4, seoTitle: 'Smart DALI & Lutron Controls UAE', seoDesc: 'Advanced lighting control and automated home dimming systems.' },
      // DGS (Greenscapes)
      { divisionSlug: 'delightgreenscapes', name: 'Curated Indoor Plants', slug: 'indoor-plants', order: 1, seoTitle: 'Curated Indoor Plants Dubai', seoDesc: 'Stunning statement foliage, fiddle leaf figs, and office plants.' },
      { divisionSlug: 'delightgreenscapes', name: 'Architectural Planters & Pots', slug: 'planters-pots', order: 2, seoTitle: 'Designer Planters & Fiberglass Pots UAE', seoDesc: 'Premium fiberglass pots, UV-resistant custom planters, and ceramics.' },
      { divisionSlug: 'delightgreenscapes', name: 'Outdoor Arid-Zone Plants', slug: 'outdoor-landscaping', order: 3, seoTitle: 'Outdoor Desert Landscape Plants Dubai', seoDesc: 'Acclimated arid-zone trees, desert palms, shrubs, and climbers.' },
      { divisionSlug: 'delightgreenscapes', name: 'Premium Soils & Bio-Nutrition', slug: 'gardening-supplies', order: 4, seoTitle: 'Organic Soils & Biological Fertilizers UAE', seoDesc: 'Custom biological substrates, organic potting soil, and plant nutrition.' }
    ];

    const catIds: Record<string, string> = {};
    for (const c of categories) {
      const divId = divIds[c.divisionSlug];
      const res = await client.query(
        'INSERT INTO categories (division_id, name, slug, display_order, seo_title, seo_description) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order RETURNING id',
        [divId, c.name, c.slug, c.order, c.seoTitle, c.seoDesc]
      );
      catIds[c.slug] = res.rows[0].id;
    }
    console.log('  ✓ Corporate divisions and categories created.');

    // ══════════════════════════════════════════════
    // STEP 5: Seed Products with Rich Variations
    // ══════════════════════════════════════════════
    console.log('\n5️⃣ Seeding high-fidelity products with variations (SKUs, images, stock)...');
    
    const productsData = [
      // Category: DTL Indoor Lighting
      {
        catSlug: 'indoor-lighting',
        divSlug: 'delighttechnicallighting',
        name: 'AeroTrack-12 Magnetic Spotlight System',
        baseSku: 'SKU-DLT-LGT-001',
        baseSlug: 'aerotrack-spotlight',
        description: 'Architectural grade magnetic track spotlight system, featuring warm-dimming Bridgelux LEDs and high CRI (>90) for outstanding retail and residential interiors.',
        ideal_room: 'Living Room, Showroom, Retail Display',
        featured: true,
        variations: [
          {
            suffix: 'B15',
            specifications: [
              { key: 'Color Finish', value: 'Anodized Matte Black' },
              { key: 'Wattage Output', value: '15 Watts COB LED' },
              { key: 'Color Temperature', value: '3000K Warm White' },
              { key: 'Beam Angle', value: '24 Degrees Spot' },
              { key: 'CRI Metric', value: 'CRI > 92 (High Fidelity)' },
              { key: 'Dimming Protocol', value: 'DALI-2 / 0-10V Dimming Support' }
            ],
            stock: 45,
            warehouse: 'Al Quoz Logistics Hub'
          },
          {
            suffix: 'W24',
            specifications: [
              { key: 'Color Finish', value: 'Alabaster Matte White' },
              { key: 'Wattage Output', value: '24 Watts COB LED' },
              { key: 'Color Temperature', value: 'Warm-Dim (2700K - 1800K)' },
              { key: 'Beam Angle', value: '36 Degrees Medium Flood' },
              { key: 'CRI Metric', value: 'CRI > 95' },
              { key: 'Dimming Protocol', value: 'Phase-Cut / Triac Dimming' }
            ],
            stock: 80,
            warehouse: 'Jebel Ali Depot B'
          }
        ],
        images: [
          'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=80'
        ]
      },
      // Category: DTL Outdoor Lighting
      {
        catSlug: 'outdoor-lighting',
        divSlug: 'delighttechnicallighting',
        name: 'SolarPath-65 Landscape Inground Spike',
        baseSku: 'SKU-DLT-LGT-002',
        baseSlug: 'solarpath-inground',
        description: 'IP67 weather-sealed landscape spike spotlight, engineered from structural grade 316 marine stainless steel to counter high humidity, heat, and salinity in coastal GCC soil environments.',
        ideal_room: 'Façades & Garden, Outdoor Pathway, Turf Spikes',
        featured: true,
        variations: [
          {
            suffix: 'S15',
            specifications: [
              { key: 'IP Waterproof Rating', value: 'IP67 Weatherproof Sealed' },
              { key: 'Chassis Material', value: 'Grade 316 Marine Stainless Steel' },
              { key: 'Operating Voltage', value: '24V DC Low Voltage (Safe)' },
              { key: 'Beam Angle', value: '15 Degrees Narrow Spotlight' },
              { key: 'Color Temp', value: '2700K Ultra Warm White' },
              { key: 'Lumens Output', value: '1200 lm' }
            ],
            stock: 35,
            warehouse: 'Al Quoz Logistics Hub'
          },
          {
            suffix: 'M60',
            specifications: [
              { key: 'IP Waterproof Rating', value: 'IP67 Weatherproof Sealed' },
              { key: 'Chassis Material', value: 'Polished Marine Bronze' },
              { key: 'Operating Voltage', value: '24V DC Low Voltage' },
              { key: 'Beam Angle', value: '60 Degrees Wide Flood' },
              { key: 'Color Temp', value: '3000K Warm White' },
              { key: 'Lumens Output', value: '1800 lm' }
            ],
            stock: 50,
            warehouse: 'Al Quoz Logistics Hub'
          }
        ],
        images: [
          'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=800&q=80'
        ]
      },
      // Category: DGS Indoor Plants
      {
        catSlug: 'indoor-plants',
        divSlug: 'delightgreenscapes',
        name: 'Ficus Lyrata Standard (Fiddle Leaf Fig)',
        baseSku: 'SKU-DGS-PLT-001',
        baseSlug: 'ficus-lyrata',
        description: 'Premium architectural statement foliage plant, fully acclimated to local UAE desert air conditioning parameters. Features thick, glossy violin-shaped leaves on tall sturdy single stems.',
        ideal_room: 'Living Room, Office Lobby, Hotel Reception',
        featured: true,
        variations: [
          {
            suffix: 'S150',
            specifications: [
              { key: 'Botanical Family', value: 'Moraceae' },
              { key: 'Approx. Height', value: '1.5m to 1.7m Standard' },
              { key: 'Pot Dimension', value: '30cm Nursery Container' },
              { key: 'Solar Requirement', value: 'Bright, indirect morning sunlight' },
              { key: 'Irrigation Pattern', value: 'Once every 7 to 10 days (Allow soil to dry)' },
              { key: 'Origin', value: 'Acclimated in Desert Group Nursery UAE' }
            ],
            stock: 65,
            warehouse: 'Wahat Al Sahraa Plant Depot'
          },
          {
            suffix: 'XL240',
            specifications: [
              { key: 'Botanical Family', value: 'Moraceae' },
              { key: 'Approx. Height', value: '2.2m to 2.5m Specimen Tree' },
              { key: 'Pot Dimension', value: '50cm Ceramic Premium Vase' },
              { key: 'Solar Requirement', value: 'Bright, indirect filtered light' },
              { key: 'Irrigation Pattern', value: 'Once every 8 days (Check moisture)' },
              { key: 'Origin', value: 'Acclimated in Desert Group Nursery UAE' }
            ],
            stock: 20,
            warehouse: 'Wahat Al Sahraa Plant Depot'
          }
        ],
        images: [
          'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1597055181300-e3633a207518?auto=format&fit=crop&w=800&q=80'
        ]
      },
      // Category: DGS Planters & Pots
      {
        catSlug: 'planters-pots',
        divSlug: 'delightgreenscapes',
        name: 'Elegance Fiberglass Planter (Matte)',
        baseSku: 'SKU-DGS-POT-002',
        baseSlug: 'elegance-fiberglass-planter',
        description: 'Architectural-grade double-walled reinforced fiberglass planter, engineered with advanced UV-inhibitors to resist cracking and color fading under intensive direct GCC solar exposure.',
        ideal_room: 'Outdoor Patio, Executive Suite, Residential Balcony',
        featured: true,
        variations: [
          {
            suffix: 'SLT-L',
            specifications: [
              { key: 'Raw Material', value: 'UV-Stabilized Double-Walled Fiberglass' },
              { key: 'Color Finish', value: 'Textured Matte Slate Grey' },
              { key: 'Planter Size', value: 'Large (50cm Dia x 100cm Height)' },
              { key: 'Net Weight', value: '8.5 kg (Empty)' },
              { key: 'Water Drainage', value: 'Pre-drilled bottom holes with rubber plugs' },
              { key: 'Thermal Defense', value: 'Double-walled airspace acts as root insulation' }
            ],
            stock: 110,
            warehouse: 'Jebel Ali Supply Hub'
          },
          {
            suffix: 'WHT-M',
            specifications: [
              { key: 'Raw Material', value: 'UV-Stabilized Double-Walled Fiberglass' },
              { key: 'Color Finish', value: 'Sleek Matte Alabaster White' },
              { key: 'Planter Size', value: 'Medium (40cm Dia x 75cm Height)' },
              { key: 'Net Weight', value: '5.2 kg (Empty)' },
              { key: 'Water Drainage', value: 'Pre-drilled bottom holes' },
              { key: 'Thermal Defense', value: 'Double-walled airspace acts as root insulation' }
            ],
            stock: 140,
            warehouse: 'Jebel Ali Supply Hub'
          }
        ],
        images: [
          'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1524486361537-8ad156b40098?auto=format&fit=crop&w=800&q=80'
        ]
      }
    ];

    const seededProductIds: string[] = [];

    for (const p of productsData) {
      const catId = catIds[p.catSlug];
      const divId = divIds[p.divSlug];

      for (const v of p.variations) {
        const SKU = `${p.baseSku}-${v.suffix}`;
        const SLUG = `${p.baseSlug}-${v.suffix.toLowerCase()}`;
        const NAME = `${p.name} (${v.specifications.find(s => s.key.includes('Finish') || s.key.includes('Height') || s.key.includes('Size'))?.value || v.suffix})`;
        
        const res = await client.query(
          `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status, ideal_room)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'active', $9)
           ON CONFLICT (sku) 
           DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, specifications = EXCLUDED.specifications, featured = EXCLUDED.featured, ideal_room = EXCLUDED.ideal_room
           RETURNING id`,
          [catId, divId, NAME, SKU, SLUG, p.description, JSON.stringify(v.specifications), p.featured, p.ideal_room]
        );
        
        const productId = res.rows[0].id;
        seededProductIds.push(productId);

        // Seed Product Images
        for (let i = 0; i < p.images.length; i++) {
          const isPrimary = i === 0;
          await client.query(
            'INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [productId, p.images[i], isPrimary]
          );
        }

        // Seed Inventory
        await client.query(
          `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
           VALUES ($1, $2, $3, 10)
           ON CONFLICT (product_id) 
           DO UPDATE SET stock_level = EXCLUDED.stock_level, warehouse_location = EXCLUDED.warehouse_location`,
          [productId, v.stock, v.warehouse]
        );
      }
    }
    console.log(`  ✓ Seeded ${seededProductIds.length} product variations with inventory & images.`);

    // ══════════════════════════════════════════════
    // STEP 6: Seed Trusted Partners
    // ══════════════════════════════════════════════
    console.log('\n6️⃣ Seeding corporate trusted partners (manufacturers, builders)...');
    const partnersData = [
      { name: 'Legrand', logo_url: 'https://iili.io/BQpzsRa.png', website_url: 'https://www.legrand.com', visible_on: ['home', 'dtl'], division: 'dtl' },
      { name: 'SYV', logo_url: 'https://iili.io/BQpz6UF.jpg', website_url: null, visible_on: ['home', 'dtl'], division: 'dtl' },
      { name: 'Lutron', logo_url: 'https://iili.io/BQpztxR.jpg', website_url: 'https://www.lutron.com', visible_on: ['home', 'dtl'], division: 'dtl' },
      { name: 'SOLUX LIGHTING', logo_url: 'https://iili.io/BpaUlOQ.png', website_url: 'https://solux.com', visible_on: ['home', 'dtl'], division: 'dtl' },
      { name: 'DELIGHT GREENSCAPES', logo_url: 'https://iili.io/Bpa6buj.jpg', website_url: 'https://www.delightgroupllc.com/delightgreenscapes', visible_on: ['dgs'], division: 'dgs' },
      { name: 'DELIGHT TECHNICAL LIGHTING', logo_url: 'https://iili.io/Bpa6tyb.jpg', website_url: 'https://www.delightgroupllc.com/delighttechnicallighting', visible_on: ['home', 'dtl'], division: 'both' },
      { name: 'Osram Technical', logo_url: 'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&q=80&w=400&h=400', website_url: 'https://www.osram.com', visible_on: ['home', 'dtl'], division: 'dtl' },
      { name: 'Hunter Irrigation', logo_url: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400&h=400', website_url: 'https://www.hunterindustries.com', visible_on: ['home', 'greenscapes'], division: 'dgs' }
    ];

    for (const p of partnersData) {
      await client.query(
        `INSERT INTO trusted_partners (name, logo_url, website_url, visibility_pages, display_style, status, division)
         VALUES ($1, $2, $3, $4::jsonb, 'grid', 'active', $5)
         ON CONFLICT (name) 
         DO UPDATE SET logo_url = EXCLUDED.logo_url, website_url = EXCLUDED.website_url, visibility_pages = EXCLUDED.visibility_pages, division = EXCLUDED.division`,
        [p.name, p.logo_url, p.website_url, JSON.stringify(p.visible_on), p.division]
      );
    }
    console.log('  ✓ Seeded trusted partners.');

    // ══════════════════════════════════════════════
    // STEP 7: Seed Download Center Catalogs
    // ══════════════════════════════════════════════
    console.log('\n7️⃣ Seeding catalog downloads center...');
    const downloadsData = [
      { title: 'DELIGHT TECHNICAL LIGHTING OUTDOOR CATALOG', url: 'https://drive.google.com/uc?export=download&id=1zze_8hJtWiJ6J4siJAaD6isKpGKXQH82', type: 'catalog', file_size: '13 MB', status: 'active', division: 'dtl' },
      { title: 'DELIGHT TECHNICAL LIGHTING INDOOR CATALOG', url: 'https://drive.google.com/uc?export=download&id=1KaLTQlCwTV4SG4RzigTpqyxT9LYwzeD-', type: 'catalog', file_size: '19 MB', status: 'active', division: 'dtl' },
      { title: 'DELIGHT TECHNICAL LIGHTING COMPLETE CATALOG', url: 'https://drive.google.com/uc?export=download&id=19fmDEn5YXhWFktjsKsU3jgQRMPRlym4D', type: 'catalog', file_size: '388 MB', status: 'hidden', division: 'dtl' },
      { title: 'DELIGHT TECHNICAL LIGHTING COMPANY PROFILE', url: 'https://drive.google.com/uc?export=download&id=1Rg3ILW4mFMYfeYLCt754KCFMRCHsQfCr', type: 'pdf', file_size: '13 MB', status: 'active', division: 'dtl' },
      { title: 'DELIGHT GREENSCAPES CATALOG', url: 'https://drive.google.com/uc?export=download&id=178K2oFfRdqAICqygObFnlbXA5AdSLbNU', type: 'catalog', file_size: '42 MB', status: 'active', division: 'dgs' }
    ];

    for (const d of downloadsData) {
      const exists = await client.query(
        `SELECT id FROM downloads WHERE LOWER(title) = LOWER($1) LIMIT 1`,
        [d.title]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        console.log(`  – Skipped catalog (exists): ${d.title}`);
        continue;
      }
      await client.query(
        `INSERT INTO downloads (title, url, type, file_size, status, division)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [d.title, d.url, d.type, d.file_size, d.status, d.division]
      );
    }
    console.log('  ✓ Seeded catalog PDFs.');

    // ══════════════════════════════════════════════
    // STEP 8: Seed Portfolio Projects
    // ══════════════════════════════════════════════
    console.log('\n8️⃣ Seeding portfolio architectural projects...');
    const projectsData = [
      {
        title: 'The Al Barari Contemporary Luxury Villa',
        client_name: 'H.E. Al Maktoum Family Office',
        description: 'Bespoke integration of magnetic smart track channels, miniature low-glare accent spots, and warm-dimming Bridgelux systems to illuminate contemporary residential high-ceilings.',
        completion_date: '2025-09-12',
        featured_image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1200',
        division: 'dtl',
        status: 'active',
        featured: true,
        gallery: [
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=600',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=600'
        ]
      },
      {
        title: 'Downtown Dubai High-Rise Luxury Penthouse',
        client_name: 'Emaar Properties PJSC',
        description: 'Warm-dimming magnetic track spotlights and recessed bezel downlights calibrated to optimize Dubai skyline panoramas.',
        completion_date: '2026-02-18',
        featured_image: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=1200',
        division: 'dtl',
        status: 'active',
        featured: false,
        gallery: []
      },
      {
        title: 'The Opus Commercial & Tech Showroom',
        client_name: 'Omniyat Properties / Zaha Hadid',
        description: 'High-performance architectural linear solutions and facade structures with complete DALI automated dimming systems.',
        completion_date: '2025-12-05',
        featured_image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200',
        division: 'dtl',
        status: 'active',
        featured: true,
        gallery: []
      },
      {
        title: 'Emirates Hills Biological Garden Oasis',
        client_name: 'Private B2B Client Residence',
        description: 'Holistic residential garden master plan incorporating mature acclimated palm trees, desert flora beds, biological greywater smart irrigation piping, and luxury pools.',
        completion_date: '2025-11-20',
        featured_image: 'https://images.unsplash.com/photo-1558904541-efa8c1a68fb6?auto=format&fit=crop&q=80&w=1200',
        division: 'dgs',
        status: 'active',
        featured: true,
        gallery: [
          'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=600',
          'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&q=80&w=600'
        ]
      },
      {
        title: 'Jumeirah Luxury Mansion Bio-Pond Garden',
        client_name: 'Lootah Premium Developments',
        description: 'Stunning luxury bio-ponds, water filtration waterfalls, acclimated arid-zone trees, and premium double-walled fiberglass planters.',
        completion_date: '2026-03-01',
        featured_image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1200',
        division: 'dgs',
        status: 'active',
        featured: true,
        gallery: []
      },
      {
        title: 'Dubai Hills Championship Golf Links',
        client_name: 'Dubai Hills Golf Club',
        description: 'Championship-grade turf sports-science grass construction, computerized soil hydration monitors, and ecological graywater conservation.',
        completion_date: '2024-10-15',
        featured_image: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=1200',
        division: 'dgs',
        status: 'active',
        featured: false,
        gallery: []
      }
    ];

    const seededProjectIds: Record<string, string> = {};

    for (const p of projectsData) {
      const exists = await client.query(
        `SELECT id FROM projects WHERE LOWER(title) = LOWER($1) LIMIT 1`,
        [p.title]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        const id = exists.rows[0].id;
        await client.query(
          `UPDATE projects SET description = $1, featured_image = $2, featured = $3, gallery_images = $4::jsonb
           WHERE id = $5`,
          [p.description, p.featured_image, p.featured, JSON.stringify(p.gallery), id]
        );
        seededProjectIds[p.title] = id;
        console.log(`  – Updated portfolio project (exists): ${p.title}`);
        continue;
      }

      const res = await client.query(
        `INSERT INTO projects (title, client_name, description, completion_date, featured_image, division, status, featured, gallery_images)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id`,
        [p.title, p.client_name, p.description, p.completion_date, p.featured_image, p.division, p.status, p.featured, JSON.stringify(p.gallery)]
      );
      seededProjectIds[p.title] = res.rows[0].id;
    }
    console.log('  ✓ Seeded portfolio projects.');

    // ══════════════════════════════════════════════
    // STEP 9: Seed Articles (Blogs, Press, Events)
    // ══════════════════════════════════════════════
    console.log('\n9️⃣ Seeding corporate articles (press releases, events, blogs)...');
    const articlesData = [
      {
        title: 'Delight Group Secures Landmark UAE Infrastructure Lighting Project',
        slug: 'delight-wins-landmark-infrastructure-lighting',
        content: '<h2>Pioneering Smart City Architectural Lighting</h2><p>Delight Technical Lighting has officially been awarded the primary corporate supply contract for the UAE new urban corridor development. The project incorporates sustainable, zero-emission DALI-2 controls and architectural-grade solar inground fittings engineered to resist coastal conditions.</p>',
        summary: 'Supply contract awarded for landmark city lighting, incorporating advanced DALI-2 and high-durability marine components.',
        featured_image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=600',
        type: 'press_release',
        division: 'dtl',
        status: 'published',
        published_at: new Date('2026-05-15')
      },
      {
        title: 'Delight Group Light & Green Expo 2026',
        slug: 'delight-light-green-expo-2026',
        content: '<h2>Showcasing Advanced Architectural Synergy</h2><p>Join our biological nursery engineers and structural lighting experts in Al Quoz, Dubai for a deep dive into integration workflows. We will display live demonstrations of warm-dimming and smart irrigation controllers.</p>',
        summary: 'Annual corporate tech showcase demonstrating live integrations of architectural plants, planters, and high-CRI spotlights.',
        featured_image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=600',
        type: 'event',
        division: 'both',
        status: 'published',
        published_at: new Date('2026-06-20')
      },
      {
        title: 'The Science of Arid Horticultures and Smart Soil Systems',
        slug: 'science-arid-horticultures-soil',
        content: '<h2>Biological Substrates & Desert Flora</h2><p>Acclimatizing premium vegetation within the GCC region represents a biological challenge. Our engineers discuss root thermal defense, double-walled planter insulated designs, and graywater smart recycling strategies.</p>',
        summary: 'Technical guide on desert landscaping biological success, mature tree root insulation, and advanced biological graywater nutrition.',
        featured_image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&q=80&w=600',
        type: 'project_blog',
        division: 'dgs',
        status: 'published',
        published_at: new Date('2026-05-10')
      }
    ];

    for (const a of articlesData) {
      await client.query(
        `INSERT INTO articles (title, slug, content, summary, featured_image, type, division, status, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug) 
         DO UPDATE SET content = EXCLUDED.content, summary = EXCLUDED.summary, featured_image = EXCLUDED.featured_image, status = EXCLUDED.status, published_at = EXCLUDED.published_at`,
        [a.title, a.slug, a.content, a.summary, a.featured_image, a.type, a.division, a.status, a.published_at]
      );
    }
    console.log('  ✓ Seeded articles & events.');

    // ══════════════════════════════════════════════
    // STEP 10: Seed Section Configurator Images
    // ══════════════════════════════════════════════
    console.log('\n🔟 Seeding section images config tables...');
    const sectionImagesData = [
      // DTL Hero
      { division: 'dtl', section: 'hero', image_url: 'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=1600&q=80', alt_text: 'Premium Indoor Spotlight Track Design', display_order: 1, folder_path: '/hero' },
      // DTL Discover by rooms
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', alt_text: 'Living Room Architectural Lighting', display_order: 1, folder_path: '/rooms' },
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=800&q=80', alt_text: 'Modernist Kitchen Recessed Downlighting', display_order: 2, folder_path: '/rooms' },
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80', alt_text: 'Minimalist Bed Chamber Accent Lighting', display_order: 3, folder_path: '/rooms' },
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=800&q=80', alt_text: 'Facade Spotlight IP67 garden spikes', display_order: 4, folder_path: '/rooms' },
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80', alt_text: 'Premium Executive Corporate Offices', display_order: 5, folder_path: '/rooms' },
      { division: 'dtl', section: 'discover_by_rooms', image_url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=80', alt_text: 'Luxury Residential Entry Lobbies', display_order: 6, folder_path: '/rooms' },
      // DGS Hero
      { division: 'dgs', section: 'hero', image_url: 'https://images.unsplash.com/photo-1558904541-efa8c1a68fb6?auto=format&fit=crop&w=1600&q=80', alt_text: 'Lush Botanical Gardens Emirates Hills', display_order: 1, folder_path: '/hero' }
    ];

    for (const s of sectionImagesData) {
      const exists = await client.query(
        `SELECT id FROM section_images WHERE division = $1 AND section = $2 AND image_url = $3 LIMIT 1`,
        [s.division, s.section, s.image_url]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        continue;
      }
      await client.query(
        `INSERT INTO section_images (division, section, image_url, alt_text, source, display_order, is_active, folder_path)
         VALUES ($1, $2, $3, $4, 'unsplash', $5, TRUE, $6)`,
        [s.division, s.section, s.image_url, s.alt_text, s.display_order, s.folder_path]
      );
    }
    console.log('  ✓ Configurator section images seeded.');

    // ══════════════════════════════════════════════
    // STEP 11: Seed Settings & Dynamic Homepages Setup
    // ══════════════════════════════════════════════
    console.log('\n1️⃣1️⃣ Seeding company settings & B2B homeconfigs...');
    
    // Core parameters
    const settings = [
      { key: 'company_name', value: 'Delight Group LLC' },
      { key: 'company_address', value: 'Delight Group Building, Al Quoz Industrial Area 3, Dubai, UAE' },
      { key: 'contact_email', value: 'sales@delightgroupllc.com' },
      { key: 'contact_phone', value: '+971 (4) 555-0100' },
      { key: 'gst_rate', value: '5' } // 5% UAE VAT default
    ];

    for (const s of settings) {
      await client.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [s.key, s.value]
      );
    }

    // Dynamic Homepage configurations
    const dtlHomepageProjects = [
      seededProjectIds['The Al Barari Contemporary Luxury Villa'],
      seededProjectIds['Downtown Dubai Luxury Penthouse'],
      seededProjectIds['The Opus Commercial & Tech Showroom']
    ].filter(Boolean);

    const dgsHomepageProjects = [
      seededProjectIds['Emirates Hills Biological Garden Oasis'],
      seededProjectIds['Jumeirah Luxury Mansion Bio-Pond Garden'],
      seededProjectIds['Dubai Hills Championship Golf Links']
    ].filter(Boolean);

    await client.query(
      "INSERT INTO settings (key, value) VALUES ('dtl_homepage_projects', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(dtlHomepageProjects)]
    );
    await client.query(
      "INSERT INTO settings (key, value) VALUES ('dgs_homepage_projects', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(dgsHomepageProjects)]
    );

    const roomsList = [
      { name: 'Living Room', iconUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Kitchen', iconUrl: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bedrooms', iconUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Façades & Garden', iconUrl: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=400&q=80' },
      { name: 'Commercial Spaces', iconUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=400&q=80' },
      { name: 'Retail Lobbies', iconUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=400&q=80' }
    ];

    await client.query(
      "INSERT INTO settings (key, value) VALUES ('rooms', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(roomsList)]
    );

    const dtlSetup = {
      hero: {
        imageUrl: 'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=1600&q=80',
        title: 'Every Corner Deserves\nPERFECT LIGHTING.',
        subtitle: 'B2B supply of architectural downlights and high-CRI magnetic track spotlights across the UAE.',
        showCta: true,
        ctaText: 'View B2B Catalog',
        ctaUrl: '/delighttechnicallighting/indoor-lighting'
      },
      discover: {
        enabled: true,
        display: 'grid',
        title: 'Discover by Architectural Spaces',
        max_items: 6
      },
      trending: {
        enabled: true,
        title: 'Browse New Arrivals & Trending Telemetries',
        promoImageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=80',
        promoTitle: 'Complimentary B2B Lighting Engineering',
        promoSubtitle: 'Custom luxury dialux designs provided for approved commercial partners.',
        max_items: 4
      },
      facts: [
        { label: 'Corporate Projects Completed', value: '1,200+' },
        { label: 'Technical Lighting Fixtures', value: '4.5K+' },
        { label: 'Automated Installations', value: '18K+' },
        { label: 'Accredited B2B Partners', value: '150+' }
      ],
      instagram: {
        enabled: true,
        title: 'Architectural Spotlights on Instagram',
        subtitle: '@delighttechnicallighting',
        ctaText: 'Follow DTL',
        ctaUrl: 'https://instagram.com',
        posts: [
          'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=150',
          'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=150',
          'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=150',
          'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=150'
        ]
      }
    };

    const dgsSetup = {
      hero: {
        imageUrl: 'https://images.unsplash.com/photo-1558904541-efa8c1a68fb6?auto=format&fit=crop&w=1600&q=80',
        title: 'Building Breathtaking Arid Spaces',
        subtitle: 'Pioneering sustainable UAE landscape engineering, biological plant nursery, and smart irrigation turf.',
        showCta: true,
        ctaText: 'Explore Solutions',
        ctaUrl: '#services'
      },
      accreditation: {
        enabled: true,
        title: "Accredited Member of UK's British Association of Landscape Industries (BALI)",
        subtitle: "We uphold the absolute highest standards of biological landscape science, turf drainage, and horticulture design."
      },
      facts: [
        { label: 'Years of UAE Heritage', value: '38+' },
        { label: 'Championship Turf Golf Fields', value: '12' },
        { label: 'Active Nursery Acres (Wahat)', value: '450+' },
        { label: 'Premium Projects Landscaped', value: '6,200+' }
      ]
    };

    await client.query(
      "INSERT INTO settings (key, value) VALUES ('dtl_setup', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(dtlSetup)]
    );
    await client.query(
      "INSERT INTO settings (key, value) VALUES ('dgs_setup', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(dgsSetup)]
    );
    console.log('  ✓ System company configurations initialized.');

    // ══════════════════════════════════════════════
    // STEP 12: Seed CRM Contacts & Enquiries
    // ══════════════════════════════════════════════
    console.log('\n1️⃣2️⃣ Seeding active CRM contact inquiries...');
    const contactsData = [
      { name: 'Eng. Ahmed Mansoor', email: 'ahmed@nakheel.ae', phone: '+971 50 123 4567', message: 'Requesting quote and Dialux lighting blueprint design for 14 villas in Palm Jebel Ali.', inquiry_type: 'sales', is_resolved: false },
      { name: 'Sarah Jenkins', email: 's.jenkins@sobha.ae', phone: '+971 52 987 6543', message: 'Looking for bulk wholesale catalog supply rates of Ficus Lyrata standard potted in Alabaster fiberglass planters.', inquiry_type: 'partnership', is_resolved: false },
      { name: 'Robert Carter', email: 'r.carter@damac.ae', phone: '+971 4 444 8888', message: 'Support needed regarding low stock threshold alerts on inventory log integrations.', inquiry_type: 'support', is_resolved: true }
    ];

    for (const c of contactsData) {
      const exists = await client.query(
        `SELECT id FROM contacts WHERE email = $1 AND message = $2 LIMIT 1`,
        [c.email, c.message]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        continue;
      }
      await client.query(
        `INSERT INTO contacts (name, email, phone, message, inquiry_type, is_resolved)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.name, c.email, c.phone, c.message, c.inquiry_type, c.is_resolved]
      );
    }
    console.log('  ✓ Seeded CRM contacts.');

    // ══════════════════════════════════════════════
    // STEP 13: Seed B2B Customers & Invoices
    // ══════════════════════════════════════════════
    console.log('\n1️⃣3️⃣ Seeding professional B2B invoices and items...');
    
    // Seed B2B Customer Profiles
    const customersData = [
      { name: 'Nakheel PJSC', email: 'procure@nakheel.ae', phone: '+971 4 375 9000', billing: 'Nakheel Sales Center, Dubai Marina, Dubai, UAE', shipping: 'Palm Jumeirah Construction Zone C' },
      { name: 'Sobha Realty Group', email: 'invoices@sobha.ae', phone: '+971 4 400 0000', billing: 'Sobha Hartland Sales Gallery, Dubai, UAE', shipping: 'Hartland Phase II Site Office' }
    ];

    const customerIds: Record<string, string> = {};
    for (const c of customersData) {
      const res = await client.query(
        `INSERT INTO customers (name, email, phone, billing_address, shipping_address)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [c.name, c.email, c.phone, c.billing, c.shipping]
      );
      customerIds[c.name] = res.rows[0].id;
    }

    // Seed Invoice 1: Paid DTL Lighting
    const inv1Res = await client.query(
      `INSERT INTO invoices (
         invoice_number, customer_name, customer_email, customer_phone, issue_date, due_date,
         billing_address, shipping_address, payment_status, inventory_deducted,
         subtotal, gst_amount, total_amount, company_vat, discount_type, discount_value,
         discount_amount, show_images, company_name, order_type, source_division, internal_notes
       ) VALUES (
         'INV-2026-0001', 'Nakheel PJSC', 'procure@nakheel.ae', '+971 4 375 9000', '2026-05-10', '2026-06-10',
         'Nakheel Sales Center, Dubai Marina, Dubai, UAE', 'Palm Jumeirah Construction Zone C', 'paid', TRUE,
         6700.00, 335.00, 7035.00, 'TRN-100293847500003', 'fixed', 0, 0, TRUE, 'Nakheel Procurement', 'standard', 'dtl',
         'Initial B2B contract for lighting hardware supply.'
       ) ON CONFLICT (invoice_number) DO UPDATE SET payment_status = EXCLUDED.payment_status RETURNING id`
    );
    const inv1Id = inv1Res.rows[0].id;

    // Fetch AeroTrack-12 Black 15W id
    const track1Res = await client.query("SELECT id FROM products WHERE sku = 'SKU-DLT-LGT-001-B15'");
    const track1Id = track1Res.rows[0]?.id || null;

    await client.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, tax_type, tax_value, tax_rate, tax_amount)
       VALUES ($1, $2, 'AeroTrack-12 Magnetic Spotlight System (Matte Black, 15W)', 20, 250.00, 5000.00, 'percentage', 5, 5, 250.00)`,
      [inv1Id, track1Id]
    );
    
    // Fetch SolarPath spike light id
    const spike1Res = await client.query("SELECT id FROM products WHERE sku = 'SKU-DLT-LGT-002-S15'");
    const spike1Id = spike1Res.rows[0]?.id || null;

    await client.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, tax_type, tax_value, tax_rate, tax_amount)
       VALUES ($1, $2, 'SolarPath-65 Landscape Inground Spike (Stainless Steel, 15°)', 10, 170.00, 1700.00, 'percentage', 5, 5, 85.00)`,
      [inv1Id, spike1Id]
    );

    // Seed Invoice 2: Unpaid DGS Greenscapes
    const inv2Res = await client.query(
      `INSERT INTO invoices (
         invoice_number, customer_name, customer_email, customer_phone, issue_date, due_date,
         billing_address, shipping_address, payment_status, inventory_deducted,
         subtotal, gst_amount, total_amount, company_vat, discount_type, discount_value,
         discount_amount, show_images, company_name, order_type, source_division, internal_notes
       ) VALUES (
         'INV-2026-0002', 'Sobha Realty Group', 'invoices@sobha.ae', '+971 4 400 0000', '2026-05-20', '2026-06-20',
         'Sobha Hartland Sales Gallery, Dubai, UAE', 'Hartland Phase II Site Office', 'unpaid', FALSE,
         8200.00, 410.00, 8610.00, 'TRN-100845920300002', 'percentage', 10, 820.00, TRUE, 'Sobha Corporate Supply', 'standard', 'dgs',
         'Nursery delivery and planter logistics. Waiting for client confirmation.'
       ) ON CONFLICT (invoice_number) DO UPDATE SET payment_status = EXCLUDED.payment_status RETURNING id`
    );
    const inv2Id = inv2Res.rows[0].id;

    // Fetch Fiddle Leaf Fig XL id
    const figRes = await client.query("SELECT id FROM products WHERE sku = 'SKU-DLT-PLT-001-XL240'");
    const figId = figRes.rows[0]?.id || null;

    await client.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, tax_type, tax_value, tax_rate, tax_amount)
       VALUES ($1, $2, 'Ficus Lyrata Standard (Fiddle Leaf Fig XL Specimen, Ceramic Pot)', 8, 450.00, 3600.00, 'percentage', 5, 5, 180.00)`,
      [inv2Id, figId]
    );

    // Fetch Fiberglass Planter Large Slate id
    const potRes = await client.query("SELECT id FROM products WHERE sku = 'SKU-DLT-POT-002-SLT-L'");
    const potId = potRes.rows[0]?.id || null;

    await client.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, tax_type, tax_value, tax_rate, tax_amount)
       VALUES ($1, $2, 'Elegance Fiberglass Planter (Matte Slate, Large)', 20, 230.00, 4600.00, 'percentage', 5, 5, 230.00)`,
      [inv2Id, potId]
    );

    console.log('  ✓ Seeded B2B invoices and line items.');

    // ══════════════════════════════════════════════
    // STEP 14: Provision Clerk Administrator User
    // ══════════════════════════════════════════════
    console.log('\n1️⃣4️⃣ Attempting Clerk API integration to pre-provision administrator user...');
    const secretKey = process.env.CLERK_SECRET_KEY;
    const adminEmails = ['sales@delighgroupllc.com', 'sales@delightgroupllc.com'];
    let clerkProvisionedCount = 0;

    if (secretKey) {
      for (const email of adminEmails) {
        try {
          const response = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
            headers: {
              'Authorization': `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const users = await response.json() as any[];
            if (users && users.length > 0) {
              const clerkUser = users[0];
              const clerkId = clerkUser.id;
              const name = `${clerkUser.first_name || ''} ${clerkUser.last_name || ''}`.trim() || 'Administrator';
              
              // Pre-provision user record
              await client.query(
                `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
                [clerkId, email, name]
              );

              // Assign admin role
              await client.query(
                `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [clerkId, roleIds['admin']]
              );

              console.log(`  ✓ Successfully pre-provisioned Clerk user in local DB: ${email} (ID: ${clerkId})`);
              clerkProvisionedCount++;
            } else {
              console.log(`  – No active Clerk record found for: ${email}`);
            }
          } else {
            console.warn(`  ❌ Clerk API returned HTTP ${response.status} for search.`);
          }
        } catch (clerkErr: any) {
          console.warn(`  ⚠️ Clerk API lookup failed for ${email}: ${clerkErr.message}`);
        }
      }
    } else {
      console.log('  ℹ CLERK_SECRET_KEY is not defined in .env. Skipping direct Clerk API lookup.');
      console.log('  ℹ Fallback check in src/middleware.ts will automatically elevate your B2B account to admin upon first sign-in.');
    }

    console.log('\n✅ Database Mega Seeding Process Finished Successfully! All configurations initialized.');

  } catch (err) {
    console.error('\n❌ Fatal error during database seeding:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('🔌 Database connection pool gracefully released.');
  }
}

main().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
