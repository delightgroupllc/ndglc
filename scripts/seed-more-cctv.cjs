require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function seedMoreCCTV() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get DTL division ID
    const divRes = await client.query("SELECT id FROM divisions WHERE slug = 'delighttechnicallighting' LIMIT 1");
    if (divRes.rows.length === 0) {
      throw new Error("Division 'delighttechnicallighting' not found!");
    }
    const dtlId = divRes.rows[0].id;

    // 2. Get warehouses
    const whRes = await client.query("SELECT id, name FROM warehouses ORDER BY name ASC");
    const warehouses = whRes.rows;
    console.log('Available warehouses:', warehouses.map(w => `${w.name} (${w.id})`));

    const whAlpha = warehouses.find(w => w.name.includes('Alpha'))?.id || warehouses[0].id;
    const storeB = warehouses.find(w => w.name.includes('StoreB'))?.id || warehouses[0].id;

    // 3. Get category IDs map
    const catRes = await client.query(
      "SELECT id, slug, name FROM categories WHERE division_id = $1",
      [dtlId]
    );
    const catIdMap = {};
    catRes.rows.forEach(c => {
      catIdMap[c.slug] = c.id;
    });

    // 4. Products to seed
    const products = [
      {
        name: 'DTL Panoramic 360° Fisheye Network Camera 12MP',
        sku: 'SKU-DTL-CAM-006',
        slug: 'dtl-panoramic-360-fisheye-12mp',
        category_slug: 'cctv-ip-dome',
        description: 'Ceiling-mounted 12 Megapixel 360-degree fisheye camera with hardware de-warping, built-in dual microphone array, and heat mapping for luxury boutique retail, banks, and hotel lobbies.',
        specifications: [
          { key: 'Resolution', value: '12MP Ultra-HD (4000 x 3000)' },
          { key: 'Lens', value: '1.29mm 360° Panoramic Fisheye' },
          { key: 'Dewarping', value: 'Client & Hardware On-Board Dewarping' },
          { key: 'Night Vision', value: '15m Smart IR Matrix' },
          { key: 'Audio', value: 'Built-in Dual Microphone & Speaker' },
          { key: 'Ingress Protection', value: 'IP66 Weatherproof / IK10 Vandal-Resistant' },
          { key: 'Analytics', value: 'Heatmap & People Counting' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186156a?auto=format&fit=crop&q=80&w=800',
        stock: 28,
        warehouse_id: whAlpha
      },
      {
        name: 'DTL SolarGuard 4G/LTE Wireless Perimeter Camera',
        sku: 'SKU-DTL-CAM-007',
        slug: 'dtl-solarguard-4g-wireless-camera',
        category_slug: 'cctv-bullet-outdoor',
        description: 'Off-grid standalone solar-powered surveillance unit with built-in 4G LTE cellular connectivity, 60W monocrystalline solar panel, 30Ah rechargeable lithium battery, and radar PIR human motion wake-up.',
        specifications: [
          { key: 'Resolution', value: '4K 8MP (3840 x 2160)' },
          { key: 'Solar & Battery', value: '60W Monocrystalline + 30Ah Lithium' },
          { key: 'Connectivity', value: 'Standalone 4G LTE Sim Card' },
          { key: 'Night Vision', value: '30m Full-Color Starlight Night Vision' },
          { key: 'PIR Detection', value: 'Dual PIR Radar Motion Trigger (0.2s wake)' },
          { key: 'Weather Rating', value: 'IP67 Extreme Weatherproof' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=800',
        stock: 15,
        warehouse_id: storeB
      },
      {
        name: 'DTL Titan 64-Channel Ultra-NVR Enterprise Server',
        sku: 'SKU-DTL-CAM-008',
        slug: 'dtl-titan-64ch-ultra-nvr-server',
        category_slug: 'cctv-nvr-storage',
        description: 'Carrier-grade 64-channel 4K network video recorder featuring 8 SATA HDD bays up to 96TB, dual redundant power supplies, hot-swappable RAID 0/1/5/6/10, SIRA compliance 90-day retention support.',
        specifications: [
          { key: 'Channels', value: '64 IP Channels up to 12MP' },
          { key: 'Bandwidth', value: '512 Mbps Incoming Bandwidth' },
          { key: 'Storage Capacity', value: '8 SATA Bays, up to 96TB RAID' },
          { key: 'Redundancy', value: 'Dual Hot-Swap Power Supply Unit' },
          { key: 'Compliance', value: 'SIRA Certified 90-Day UAE Retention' },
          { key: 'Network', value: 'Dual Gigabit SFP+ Fiber Uplink' }
        ],
        featured: false,
        image_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&q=80&w=800',
        stock: 8,
        warehouse_id: whAlpha
      },
      {
        name: 'DTL Lumina Full-Color 24/7 Night-Vision Turret Camera',
        sku: 'SKU-DTL-CAM-009',
        slug: 'dtl-lumina-full-color-24-7-turret',
        category_slug: 'cctv-cameras',
        description: 'Advanced F1.0 super-aperture turret camera delivering vivid full-color video 24/7 even in near-pitch darkness without requiring aggressive white floodlights. Perfect for residential villa gardens and luxury facade monitoring.',
        specifications: [
          { key: 'Resolution', value: '4K 8MP Ultra-HD' },
          { key: 'Aperture', value: 'F1.0 Super Aperture Sensor' },
          { key: 'Color Night Vision', value: 'Full-Color at 0.0005 Lux' },
          { key: 'Fill Light', value: '30m Warm Soft Ambiance LED' },
          { key: 'Audio', value: 'Built-in Noise-Cancelling Mic' },
          { key: 'Analytics', value: 'Deep-Learning Human/Vehicle Filtering' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=800',
        stock: 38,
        warehouse_id: storeB
      },
      {
        name: 'DTL Interceptor AI License Plate Recognition (ANPR) Bullet',
        sku: 'SKU-DTL-CAM-010',
        slug: 'dtl-interceptor-anpr-bullet-camera',
        category_slug: 'cctv-bullet-outdoor',
        description: 'Dedicated traffic and gate checkpoint camera featuring embedded optical character recognition (OCR) for UAE, GCC, and international vehicle license plates at speeds up to 120 km/h.',
        specifications: [
          { key: 'Resolution', value: '4MP High-Frame Rate (60fps)' },
          { key: 'Algorithm', value: 'Embedded UAE/GCC License Plate OCR' },
          { key: 'Lens', value: 'Motorized 8-32mm Varifocal Highway Zoom' },
          { key: 'IR Illumination', value: '100m Smart IR with Shutter Sync' },
          { key: 'Barrier Control', value: 'Integrated Wiegand & Relay Barrier Trigger' },
          { key: 'Housing', value: 'Heavy IP67 / IK10 Aluminum Chassis' }
        ],
        featured: false,
        image_url: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&q=80&w=800',
        stock: 20,
        warehouse_id: whAlpha
      },
      {
        name: 'DTL Orbit Compact Mini-PTZ Tracking Camera',
        sku: 'SKU-DTL-CAM-011',
        slug: 'dtl-orbit-compact-mini-ptz',
        category_slug: 'cctv-ptz-smart',
        description: 'Discreet architectural mini-PTZ camera with 5x optical zoom, 350° pan, and smart auto-patrol tracking. Blends effortlessly into luxury retail ceilings, museum galleries, and upscale residential interiors.',
        specifications: [
          { key: 'Resolution', value: '4MP Ultra-Low Light' },
          { key: 'Optical Zoom', value: '5x Optical (2.7 - 13.5mm)' },
          { key: 'Pan & Tilt', value: '350° Pan / 90° Tilt Endless' },
          { key: 'Night Vision', value: '20m Smart IR' },
          { key: 'Audio', value: 'Built-in Two-Way Speaker & Mic' },
          { key: 'Power', value: 'Standard PoE (802.3af)' }
        ],
        featured: false,
        image_url: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&q=80&w=800',
        stock: 25,
        warehouse_id: storeB
      },
      {
        name: 'DTL SafeGuard Elevator Corner Wedge Camera',
        sku: 'SKU-DTL-CAM-012',
        slug: 'dtl-safeguard-elevator-corner-camera',
        category_slug: 'cctv-ip-dome',
        description: 'Triangular corner-mount camera specifically designed for elevator cabs and tight commercial vestibules. Anti-ligature tamper-proof construction with an ultra-wide 135° horizontal field of view.',
        specifications: [
          { key: 'Resolution', value: '5MP High-Definition' },
          { key: 'FOV', value: '135° Ultra-Wide Corner Coverage' },
          { key: 'Design', value: 'Anti-Ligature Anti-Tamper Wedge' },
          { key: 'IR', value: 'Invisible 940nm Stealth IR (No Red Glow)' },
          { key: 'Vandal Rating', value: 'IK10+ Heavy Vandal Resistance' }
        ],
        featured: false,
        image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&q=80&w=800',
        stock: 18,
        warehouse_id: whAlpha
      },
      {
        name: 'DTL Vulkan Explosion-Proof Heavy-Industrial Camera',
        sku: 'SKU-DTL-CAM-013',
        slug: 'dtl-vulkan-explosion-proof-industrial-camera',
        category_slug: 'cctv-cameras',
        description: 'ATEX and IECEx certified explosion-proof 316L stainless steel camera designed for harsh oil & gas, chemical processing, fuel storage facilities, and heavy industrial ports across the UAE.',
        specifications: [
          { key: 'Resolution', value: '4K 8MP Starlight CMOS' },
          { key: 'Certifications', value: 'ATEX / IECEx Zone 1/21 Explosion-Proof' },
          { key: 'Material', value: '316L Marine-Grade Stainless Steel' },
          { key: 'Night Vision', value: '50m Smart Matrix IR' },
          { key: 'Accessories', value: 'Integrated Wiper & Air Purge Blade' },
          { key: 'Operating Temp', value: '-40°C to +75°C Industrial Range' }
        ],
        featured: true,
        image_url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=800',
        stock: 7,
        warehouse_id: whAlpha
      }
    ];

    for (const p of products) {
      const catId = catIdMap[p.category_slug] || catIdMap['cctv-cameras'];
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
        console.log(`Updated product: ${p.name}`);
      } else {
        const ins = await client.query(
          `INSERT INTO products (name, sku, slug, description, specifications, featured, status, category_id, division_id, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9) RETURNING id`,
          [p.name, p.sku, p.slug, p.description, JSON.stringify(p.specifications), p.featured, catId, dtlId, p.image_url]
        );
        prodId = ins.rows[0].id;
        console.log(`Created product: ${p.name}`);
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
          [p.stock, p.warehouse_id, prodId]
        );
      } else {
        await client.query(
          "INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold) VALUES ($1, $2, $3, 10)",
          [prodId, p.stock, p.warehouse_id]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully seeded ${products.length} additional CCTV products with inventory!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding additional CCTV cameras:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedMoreCCTV();
