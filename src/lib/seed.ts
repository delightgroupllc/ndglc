import fs from 'fs';
import path from 'path';

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
  console.log('Starting database seeding...');
  
  // Dynamic import of the pre-configured db pool and query function
  const { query, pool } = await import('./db');
  
  const client = {
    connect: async () => {
      console.log('Connected to database successfully via SSL pool.');
    },
    query: query,
    end: async () => {
      await pool.end();
      console.log('Database pool connection closed.');
    }
  };

  try {
    await client.connect();
    console.log('Connected to database successfully.');

    // 1. Read and execute schema.sql
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    console.log(`Reading schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Executing schema.sql queries...');
    await client.query(schemaSql);
    console.log('Database tables verified/created successfully.');

    // 2. Seed Roles
    console.log('Seeding standard roles...');
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
    console.log('Roles seeded.');

    // 3. Seed Permissions
    console.log('Seeding permissions...');
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
    console.log('Permissions seeded.');

    // 4. Map Role Permissions (Admin gets all, Moderator gets catalog/inventory/contacts/downloads)
    console.log('Mapping role permissions...');
    
    // Clear existing mappings to avoid duplicate issues on re-run
    await client.query('DELETE FROM role_permissions');

    // Admin Mappings
    for (const permId of Object.values(permIds)) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleIds['admin'], permId]
      );
    }

    // Moderator Mappings
    const modPerms = [
      'products.create', 'products.update',
      'inventory.manage', 'downloads.manage',
      'contacts.manage'
    ];
    for (const pName of modPerms) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleIds['moderator'], permIds[pName]]
      );
    }
    console.log('Role Permissions mapped.');

    // 5. Seed Tags
    console.log('Seeding customer tags...');
    const tags = ['client', 'partner', 'VIP', 'supplier'];
    for (const t of tags) {
      await client.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [t]);
    }
    console.log('Customer tags seeded.');

    // 6. Seed Divisions
    console.log('Seeding divisions...');
    const divisions = [
      { 
        name: 'Delight Technical Lighting', 
        slug: 'delighttechnicallighting', 
        description: 'Indoor & outdoor architectural lighting fixtures sourced from premium global brands, supplied UAE-wide for residences, offices, and commercial projects.' 
      },
      { 
        name: 'Delight Greenscapes', 
        slug: 'delightgreenscapes', 
        description: 'Curated indoor & outdoor plants, designer pots, and bespoke planters supplied to residences, offices, hotels, and prestigious developments across the UAE.' 
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
    console.log('Divisions seeded.');

    // 7. Seed Categories
    console.log('Seeding categories...');
    const categories = [
      // DTL (Technical Lighting)
      { 
        divisionSlug: 'delighttechnicallighting', 
        name: 'Indoor Technical Lighting', 
        slug: 'indoor-lighting', 
        order: 1, 
        seoTitle: 'Indoor Technical Lighting & Spotlights UAE', 
        seoDesc: 'Premium indoor spotlight tracks, architectural downlights, and downlighting fixtures.' 
      },
      { 
        divisionSlug: 'delighttechnicallighting', 
        name: 'Outdoor & Facade Lighting', 
        slug: 'outdoor-lighting', 
        order: 2, 
        seoTitle: 'Outdoor Landscape & Facade Lighting UAE', 
        seoDesc: 'Inground pathways uplights, IP67 garden spikes, and architectural facade lighting fixtures.' 
      },
      // DGS (Greenscapes)
      { 
        divisionSlug: 'delightgreenscapes', 
        name: 'Curated Indoor Plants', 
        slug: 'indoor-plants', 
        order: 1, 
        seoTitle: 'Curated Indoor Plants & Specimen Trees Dubai', 
        seoDesc: 'Lush fiddle leaf figs, air-purifying indoor monsteras, and corporate office greens.' 
      },
      { 
        divisionSlug: 'delightgreenscapes', 
        name: 'Architectural Planters & Pots', 
        slug: 'planters-pots', 
        order: 2, 
        seoTitle: 'Designer Planters & Fiberglass Pots UAE', 
        seoDesc: 'Premium fiberglass planters, smart-watering designer pots, and ceramic garden vases.' 
      }
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
    console.log('Categories seeded.');

    // 8. Seed Products
    console.log('Seeding products...');
    const products = [
      // DTL Spotlight
      {
        catSlug: 'indoor-lighting',
        divSlug: 'delighttechnicallighting',
        name: 'AeroTrack-12 Magnetic Spotlight System',
        sku: 'SKU-DLT-LGT-001',
        slug: 'aerotrack-spotlight',
        description: 'Architectural magnetic track spotlight system, featuring warm-dimming Bridgelux LEDs and high CRI (>90) for outstanding retail and residential interiors.',
        specifications: JSON.stringify([
          { key: 'Light Source', value: 'High-CRI Bridgelux COB LED' },
          { key: 'Color Rendering', value: 'CRI > 90' },
          { key: 'Dimming Type', value: 'Triac / 0-10V / DALI dimmable' },
          { key: 'Beam Angle', value: '15° / 24° / 36° Adjustable' }
        ]),
        featured: true
      },
      // DTL Outdoor Inground
      {
        catSlug: 'outdoor-lighting',
        divSlug: 'delighttechnicallighting',
        name: 'SolarPath-65 Landscape Inground Spike',
        sku: 'SKU-DLT-LGT-002',
        slug: 'solarpath-inground',
        description: 'IP67 weather-sealed landscape spike spotlight, engineered from structural marine stainless steel to counter high temperatures and salinity in coastal Emirate soils.',
        specifications: JSON.stringify([
          { key: 'Ingress Protection', value: 'IP67 Waterproof rating' },
          { key: 'Body Material', value: 'Grade 316 Marine Stainless Steel' },
          { key: 'Voltage Input', value: '24V DC Low Voltage' },
          { key: 'Color Temp', value: '3000K Warm White' }
        ]),
        featured: false
      },
      // DGS Plant
      {
        catSlug: 'indoor-plants',
        divSlug: 'delightgreenscapes',
        name: 'Ficus Lyrata Standard (Fiddle Leaf Fig)',
        sku: 'SKU-DLT-PLT-001',
        slug: 'ficus-lyrata',
        description: 'Premium statement foliage plant, fully acclimated to local UAE environments, outstanding for premium villa lobbies and corporate office interiors.',
        specifications: JSON.stringify([
          { key: 'Common Name', value: 'Fiddle Leaf Fig' },
          { key: 'Approx. Height', value: '1.8m to 2.2m' },
          { key: 'Light Requirement', value: 'Bright, indirect indoor light' },
          { key: 'Watering Frequency', value: 'Once every 7-10 days' }
        ]),
        featured: true
      },
      // DGS Planter
      {
        catSlug: 'planters-pots',
        divSlug: 'delightgreenscapes',
        name: 'Elegance Fiberglass Planter (Matte Slate)',
        sku: 'SKU-DLT-POT-002',
        slug: 'elegance-fiberglass-planter',
        description: 'Architectural grade double-walled fiberglass planter in sleek matte slate finish, engineered to resist UV solar fade under intense Middle Eastern sun exposures.',
        specifications: JSON.stringify([
          { key: 'Material', value: 'Reinforced Double-Walled Fiberglass' },
          { key: 'Finish Type', value: 'Matte UV-Resistant Slate Grey' },
          { key: 'Dimensions', value: '45cm Diameter x 90cm Height' },
          { key: 'Environment', value: 'Suitable for both indoor & outdoor lobbies' }
        ]),
        featured: true
      }
    ];

    for (const p of products) {
      const catId = catIds[p.catSlug];
      const divId = divIds[p.divSlug];
      
      const res = await client.query(
        `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         ON CONFLICT (sku) 
         DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, specifications = EXCLUDED.specifications, featured = EXCLUDED.featured
         RETURNING id`,
        [catId, divId, p.name, p.sku, p.slug, p.description, p.specifications, p.featured]
      );
      
      const productId = res.rows[0].id;

      // Seed Product Image
      const imageUrl = p.divSlug === 'delighttechnicallighting' 
        ? 'https://images.unsplash.com/photo-1565814636199-ae8133055c1c?auto=format&fit=crop&w=800&q=80' // modern designer lights
        : 'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=800&q=80'; // minimalist gorgeous plants
      
      await client.query(
        'INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
        [productId, imageUrl]
      );

      // Seed Inventory
      const stock = p.divSlug === 'delighttechnicallighting' ? 45 : 120;
      await client.query(
        `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
         VALUES ($1, $2, 'Dubai Depot South', 15)
         ON CONFLICT (product_id) DO NOTHING`,
        [productId, stock]
      );
    }
    console.log('Products, product images, and initial inventory seeded.');

    // 9. Seed settings
    console.log('Seeding system settings...');
    const settings = [
      { key: 'company_name', value: 'Delight Group LLC' },
      { key: 'company_address', value: 'Delight Group Building, Al Quoz Industrial Area 3, Dubai, UAE' },
      { key: 'contact_email', value: 'info@delightgroupllc.ae' },
      { key: 'contact_phone', value: '+971 (4) 555-0100' },
      { key: 'gst_rate', value: '5' } // 5% UAE VAT default
    ];

    for (const s of settings) {
      await client.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [s.key, s.value]
      );
    }
    console.log('System settings seeded.');

    console.log('Database seeding successfully finished!');
  } catch (err) {
    console.error('Error during database seeding:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
