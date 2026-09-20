require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function seedCCTV() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get DTL division ID
    const divRes = await client.query("SELECT id FROM divisions WHERE slug = 'delighttechnicallighting' LIMIT 1");
    if (divRes.rows.length === 0) {
      throw new Error("Division 'delighttechnicallighting' not found!");
    }
    const dtlId = divRes.rows[0].id;
    console.log('Found DTL Division ID:', dtlId);

    // 2. Get default warehouse
    const whRes = await client.query("SELECT id, name FROM warehouses ORDER BY name ASC LIMIT 1");
    const defaultWhId = whRes.rows[0]?.id;
    console.log('Default Warehouse:', whRes.rows[0]?.name, defaultWhId);

    // 3. Define categories
    const categories = [
      {
        name: 'CCTV & Security Cameras',
        slug: 'cctv-cameras',
        display_order: 1,
        image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=800',
        seo_title: 'Commercial & Residential CCTV Security Cameras UAE | DTL',
        seo_description: 'High-performance AI surveillance cameras, vandal-proof dome systems, and enterprise security systems from Delight Technical Lighting.'
      },
      {
        name: 'IP & Dome Cameras',
        slug: 'cctv-ip-dome',
        display_order: 2,
        image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=800',
        seo_title: 'Vandal-Proof 4K IP Dome Cameras | DTL CCTV',
        seo_description: 'Ultra HD 4K IK10 vandal-resistant dome cameras with Sony Starvis sensor and Smart IR for indoor and outdoor commercial facilities.'
      },
      {
        name: 'PTZ & AI Smart Cameras',
        slug: 'cctv-ptz-smart',
        display_order: 3,
        image_url: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&q=80&w=800',
        seo_title: 'Pan-Tilt-Zoom 360 AI Cameras | DTL CCTV',
        seo_description: 'High-speed 30x optical zoom 360-degree PTZ cameras with automated tracking and laser night vision.'
      },
      {
        name: 'Outdoor Bullet Cameras',
        slug: 'cctv-bullet-outdoor',
        display_order: 4,
        image_url: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&q=80&w=800',
        seo_title: 'Long-Range Outdoor Bullet Surveillance Cameras | DTL CCTV',
        seo_description: 'Heavy-duty weatherproof IP67 bullet cameras with 80m IR and license plate recognition for perimeters and gates.'
      },
      {
        name: 'NVR & Video Storage Systems',
        slug: 'cctv-nvr-storage',
        display_order: 5,
        image_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=800',
        seo_title: 'Enterprise 4K Network Video Recorders (NVR) | DTL CCTV',
        seo_description: 'Commercial 32-channel and 64-channel NVR recording systems with RAID storage and SIRA compliance.'
      }
    ];

    const catIdMap = {};
    for (const cat of categories) {
      const existing = await client.query(
        "SELECT id FROM categories WHERE slug = $1 LIMIT 1",
        [cat.slug]
      );
      if (existing.rows.length > 0) {
        catIdMap[cat.slug] = existing.rows[0].id;
        await client.query(
          `UPDATE categories 
           SET name = $1, display_order = $2, image_url = $3, seo_title = $4, seo_description = $5, division_id = $6
           WHERE id = $7`,
          [cat.name, cat.display_order, cat.image_url, cat.seo_title, cat.seo_description, dtlId, existing.rows[0].id]
        );
        console.log(`Updated category ${cat.name} (${existing.rows[0].id})`);
      } else {
        const ins = await client.query(
          `INSERT INTO categories (division_id, name, slug, display_order, image_url, seo_title, seo_description)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [dtlId, cat.name, cat.slug, cat.display_order, cat.image_url, cat.seo_title, cat.seo_description]
        );
        catIdMap[cat.slug] = ins.rows[0].id;
        console.log(`Created category ${cat.name} (${ins.rows[0].id})`);
      }
    }

    // 4. Define seed CCTV products
    const products = [
      {
        name: 'DTL HawkEye 4K Ultra-HD AI Dome Camera',
        sku: 'SKU-DTL-CAM-001',
        slug: 'dtl-hawkeye-4k-ai-dome-camera',
        category_slug: 'cctv-ip-dome',
        description: 'Vandal-proof IK10 indoor/outdoor 4K dome camera equipped with a Sony Starvis CMOS sensor, Smart IR up to 40m, AI deep-learning human and vehicle classification, and PoE power. SIRA compliance certified for commercial buildings and luxury residences across the UAE.',
        specifications: [
          { key: 'Resolution', value: '4K Ultra HD (3840 x 2160)' },
          { key: 'Sensor', value: '1/2.8" Sony Starvis CMOS' },
          { key: 'Lens', value: '2.8mm Fixed Wide Angle (108° FOV)' },
          { key: 'Night Vision', value: 'Smart IR Matrix up to 40m' },
          { key: 'Ingress Protection', value: 'IP67 Weatherproof / IK10 Vandal-Proof' },
          { key: 'Power', value: 'PoE (802.3af) / 12V DC' },
          { key: 'AI Analytics', value: 'Human & Vehicle Target Classification' },
          { key: 'Compliance', value: 'UAE SIRA & NDAA Compliant' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=800',
        stock: 45
      },
      {
        name: 'DTL Sentra 360° AI Smart PTZ Camera',
        sku: 'SKU-DTL-CAM-002',
        slug: 'dtl-sentra-360-ai-ptz-camera',
        category_slug: 'cctv-ptz-smart',
        description: 'High-speed pan-tilt-zoom 4K camera with 30x optical zoom, continuous 360-degree endless rotation, autotracking AI, and laser-assisted night vision up to 150 meters. Engineered for villa perimeters, public facilities, and commercial towers.',
        specifications: [
          { key: 'Resolution', value: '4K 8MP (30fps)' },
          { key: 'Optical Zoom', value: '30x Optical, 16x Digital' },
          { key: 'Pan / Tilt Range', value: '360° Endless Pan, -15° to 90° Tilt' },
          { key: 'Night Vision', value: 'Laser IR + Color at Night up to 150m' },
          { key: 'Ingress Protection', value: 'IP67 All-Weather Metal Housing' },
          { key: 'Tracking', value: 'Deep Learning Smart Auto-Tracking 3.0' },
          { key: 'Audio', value: 'Two-Way Audio with Built-in Siren' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&q=80&w=800',
        stock: 22
      },
      {
        name: 'DTL Aegis Pro 8MP Long-Range Bullet Camera',
        sku: 'SKU-DTL-CAM-003',
        slug: 'dtl-aegis-pro-8mp-bullet-camera',
        category_slug: 'cctv-bullet-outdoor',
        description: 'Heavy-duty outdoor bullet camera with 80m IR illumination, motorized varifocal lens (2.7mm - 13.5mm), license plate recognition (LPR/ANPR) capability, and ruggedized aluminum chassis. Ideal for facility entry gates, perimeters, and parking complexes.',
        specifications: [
          { key: 'Resolution', value: '8MP (3840 x 2160) at 25fps' },
          { key: 'Lens', value: '2.7-13.5mm Motorized Varifocal' },
          { key: 'IR Range', value: 'Smart EXIR 80m' },
          { key: 'Detection', value: 'License Plate (LPR) & Intrusion Perimeter' },
          { key: 'Operating Temp', value: '-30°C to +65°C (Gulf Climate Certified)' },
          { key: 'Housing', value: 'Full Heavy-Duty Aluminum (IP67)' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&q=80&w=800',
        stock: 35
      },
      {
        name: 'DTL Matrix Enterprise 32-Channel 4K NVR',
        sku: 'SKU-DTL-CAM-004',
        slug: 'dtl-matrix-enterprise-32ch-nvr',
        category_slug: 'cctv-nvr-storage',
        description: 'Commercial-grade 32-channel network video recorder supporting up to 32TB storage, dual 4K HDMI outputs, built-in PoE ports, H.265+ compression, and central management software with mobile remote streaming.',
        specifications: [
          { key: 'Channels', value: '32 IP Channels' },
          { key: 'Incoming Bandwidth', value: '320 Mbps' },
          { key: 'Storage Capacity', value: '4 SATA Ports, up to 32TB RAID' },
          { key: 'Video Output', value: 'Dual 4K HDMI + VGA' },
          { key: 'PoE Ports', value: '16 Independent PoE Network Interfaces' },
          { key: 'Remote Access', value: 'iOS/Android Delight Security App & CMS' },
          { key: 'Warranty', value: '3 Years Commercial Warranty' }
        ],
        featured: false,
        image_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=800',
        stock: 18
      },
      {
        name: 'DTL Thermal Perimeter Bi-Spectrum Guard Camera',
        sku: 'SKU-DTL-CAM-005',
        slug: 'dtl-thermal-perimeter-bi-spectrum-guard',
        category_slug: 'cctv-cameras',
        description: 'Dual-lens bi-spectrum camera combining thermal sensor imaging with an optical 4K camera. Capable of zero-light heat signature detection, fire detection, and long-range perimeter intrusion warnings through heavy dust, fog, and darkness.',
        specifications: [
          { key: 'Thermal Resolution', value: '256 x 192 Uncooled Vanadium Oxide' },
          { key: 'Optical Resolution', value: '4K 8MP Starlight CMOS' },
          { key: 'Detection Range', value: 'Human detection up to 250m, Vehicle up to 600m' },
          { key: 'Fire Alarm', value: 'Early Temperature Exception Warning' },
          { key: 'Weather Rating', value: 'IP67 Weatherproof / NEMA 4X' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=800',
        stock: 12
      }
    ];

    for (const p of products) {
      const catId = catIdMap[p.category_slug];
      const prodCheck = await client.query("SELECT id FROM products WHERE LOWER(sku) = LOWER($1)", [p.sku]);

      let prodId;
      if (prodCheck.rows.length > 0) {
        prodId = prodCheck.rows[0].id;
        await client.query(
          `UPDATE products 
           SET name = $1, slug = $2, description = $3, specifications = $4, featured = $5, category_id = $6, division_id = $7, image_url = $8, status = 'active'
           WHERE id = $9`,
          [p.name, p.slug, p.description, JSON.stringify(p.specifications), p.featured, catId, dtlId, p.image_url, prodId]
        );
        console.log(`Updated product ${p.name} (${prodId})`);
      } else {
        const ins = await client.query(
          `INSERT INTO products (name, sku, slug, description, specifications, featured, status, category_id, division_id, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9) RETURNING id`,
          [p.name, p.sku, p.slug, p.description, JSON.stringify(p.specifications), p.featured, catId, dtlId, p.image_url]
        );
        prodId = ins.rows[0].id;
        console.log(`Created product ${p.name} (${prodId})`);
      }

      // Upsert product_images
      await client.query("DELETE FROM product_images WHERE product_id = $1", [prodId]);
      await client.query(
        "INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, TRUE)",
        [prodId, p.image_url]
      );

      // Upsert inventory
      const invCheck = await client.query("SELECT id FROM inventory WHERE product_id = $1", [prodId]);
      if (invCheck.rows.length > 0) {
        await client.query(
          "UPDATE inventory SET stock_level = $1, warehouse_id = $2, low_stock_threshold = 10, updated_at = NOW() WHERE product_id = $3",
          [p.stock, defaultWhId, prodId]
        );
      } else {
        await client.query(
          "INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold) VALUES ($1, $2, $3, 10)",
          [prodId, p.stock, defaultWhId]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Successfully seeded CCTV categories, products, and inventory under DTL!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding CCTV expansion:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedCCTV();
