require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function seedDelightVision() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🚀 Seeding Delight Vision division, categories, and products...');

    // 1. Ensure 'delightvision' division exists
    const divRes = await client.query(`
      INSERT INTO divisions (name, slug, description)
      VALUES (
        'Delight Vision',
        'delightvision',
        'AI-powered CCTV surveillance, smart access control, gate barriers, structured cabling, and integrated ELV solutions engineered for precision, scalability, and UAE regulatory compliance.'
      )
      ON CONFLICT (slug) DO UPDATE 
      SET name = EXCLUDED.name, description = EXCLUDED.description
      RETURNING id;
    `);
    const divId = divRes.rows[0].id;
    console.log(`✅ Division Delight Vision ID: ${divId}`);

    // 2. Insert the 8 Core Categories
    const categoriesData = [
      {
        name: 'CCTV Surveillance Systems',
        slug: 'cctv-surveillance-systems',
        image_url: '/images/delightvision/cctv.jpg',
        seo_title: 'SIRA-Compliant CCTV Surveillance Systems UAE | Delight Vision',
        seo_description: 'High-definition IP & hybrid CCTV installation, AI video analytics, ANPR, and 24/7 centralized monitoring compliant with SIRA guidelines.',
        display_order: 1
      },
      {
        name: 'Access Control & Time Attendance',
        slug: 'access-control',
        image_url: '/images/delightvision/accesscontrol.jpg',
        seo_title: 'Biometric Access Control & Time Attendance Systems UAE | Delight Vision',
        seo_description: 'Facial recognition, fingerprint biometrics, RFID card readers, and mobile BLE access integrated with HRMS & payroll.',
        display_order: 2
      },
      {
        name: 'Gate Barrier & Turnstile Solutions',
        slug: 'gate-barrier',
        image_url: '/images/delightvision/turnstile-gate.webp',
        seo_title: 'Automatic Gate Barriers & Speed Turnstiles UAE | Delight Vision',
        seo_description: 'High-speed boom barriers, optical turnstiles, flap barriers, and long-range UHF RFID vehicle access for communities and commercial facilities.',
        display_order: 3
      },
      {
        name: 'Structured Cabling & Networks',
        slug: 'structured-cabling',
        image_url: '/images/delightvision/structured-cabling-michigan.jpg',
        seo_title: 'Structured Cabling & Fiber Optic Infrastructure UAE | Delight Vision',
        seo_description: 'Enterprise Cat6/6A copper cabling, single-mode and multi-mode fiber optic backbone, server rack dressing, and cable certification.',
        display_order: 4
      },
      {
        name: 'Intercom & Video Door Phone Systems',
        slug: 'intercom-video-doorph',
        image_url: '/images/delightvision/videocam.jpg',
        seo_title: 'IP Intercom & Video Door Phone Solutions UAE | Delight Vision',
        seo_description: 'Multi-tenant residential IP video intercoms, luxury villa door stations, mobile app remote door release, and SIP PBX integration.',
        display_order: 5
      },
      {
        name: 'Annual Maintenance Contracts (AMC)',
        slug: 'annual-maintenance-contracts',
        image_url: '/images/delightvision/amc.jpg',
        seo_title: 'SIRA Certified AMC & ELV System Maintenance UAE | Delight Vision',
        seo_description: 'Comprehensive & non-comprehensive security maintenance contracts, periodic preventive audits, SIRA certificate renewals, and 24/7 SLA.',
        display_order: 6
      },
      {
        name: 'System Upgrade & Retrofits',
        slug: 'system-upgrade-retrofits',
        image_url: '/images/delightvision/retrofit.jpeg',
        seo_title: 'ELV & Security System Retrofit & Migration UAE | Delight Vision',
        seo_description: 'Zero-downtime analog-to-IP CCTV migrations, biometric reader modernizations, and network capacity expansions.',
        display_order: 7
      },
      {
        name: 'Integration & Central Monitoring',
        slug: 'integration-central-monitoring',
        image_url: '/images/delightvision/centralmonitoring.jpg',
        seo_title: 'PSIM Central Monitoring & Command Centers UAE | Delight Vision',
        seo_description: 'Unified command center integration, Video Management Software (VMS), and multi-site alarm monitoring on a single pane of glass.',
        display_order: 8
      }
    ];

    const categoryMap = {};

    for (const cat of categoriesData) {
      const catRes = await client.query(`
        INSERT INTO categories (division_id, name, slug, image_url, seo_title, seo_description, display_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) DO UPDATE 
        SET division_id = EXCLUDED.division_id,
            name = EXCLUDED.name,
            image_url = EXCLUDED.image_url,
            seo_title = EXCLUDED.seo_title,
            seo_description = EXCLUDED.seo_description,
            display_order = EXCLUDED.display_order
        RETURNING id;
      `, [divId, cat.name, cat.slug, cat.image_url, cat.seo_title, cat.seo_description, cat.display_order]);
      categoryMap[cat.slug] = catRes.rows[0].id;
      console.log(`  📁 Category: ${cat.name} (${cat.slug}) -> ${categoryMap[cat.slug]}`);
    }

    // 3. Insert Systems & Products for Delight Vision
    const productsData = [
      {
        category_slug: 'cctv-surveillance-systems',
        name: 'HawkEye 4K Ultra-HD AI Dome Camera',
        sku: 'SKU-DV-CAM-001',
        slug: 'dv-hawkeye-4k-ai-dome',
        description: 'Vandal-resistant 4K IP dome camera with deep learning perimeter protection, face detection, smart IR illumination up to 40m, and full SIRA compliance.',
        image_url: '/images/delightvision/cctv.jpg',
        featured: true,
        specifications: {
          resolution: '4K Ultra HD (3840 x 2160)',
          analytics: 'AI Perimeter Protection, Tripwire, Face Capture',
          lens: '2.8mm - 12mm Motorized Varifocal',
          protection: 'IP67 Weatherproof, IK10 Vandal-Proof',
          night_vision: 'Smart IR up to 40 meters',
          compliance: 'SIRA Certified'
        }
      },
      {
        category_slug: 'cctv-surveillance-systems',
        name: 'Sentra 360° AI Smart PTZ Camera',
        sku: 'SKU-DV-CAM-002',
        slug: 'dv-sentra-360-smart-ptz',
        description: 'High-speed pan-tilt-zoom camera featuring 32x optical zoom, auto-tracking of vehicles and pedestrians, laser illumination up to 150m, and rugged outdoor casing.',
        image_url: '/images/delightvision/smart-security.jpg',
        featured: true,
        specifications: {
          zoom: '32x Optical Zoom, 16x Digital Zoom',
          tracking: 'Deep Learning Auto-Tracking 2.0',
          night_vision: 'Laser IR up to 150 meters',
          sensor: '1/1.8" STARVIS CMOS Ultra Low-Light',
          rotation: '360° Endless Pan, -20° to 90° Tilt',
          compliance: 'SIRA Compliant'
        }
      },
      {
        category_slug: 'cctv-surveillance-systems',
        name: 'Aegis Pro 8MP Long-Range Bullet Camera',
        sku: 'SKU-DV-CAM-003',
        slug: 'dv-aegis-pro-8mp-bullet',
        description: 'Heavy-duty perimeter surveillance camera with built-in heater/blower, long-range illumination, WDR 120dB, and intelligent perimeter alarms.',
        image_url: '/images/delightvision/cctv.webp',
        featured: true,
        specifications: {
          resolution: '8MP Ultra HD @ 30fps',
          ir_range: 'Up to 80m Smart IR',
          wdr: '120dB True Wide Dynamic Range',
          casing: 'All-Metal IP67 Aluminum Alloy',
          audio: 'Built-in Mic & Alarm I/O'
        }
      },
      {
        category_slug: 'cctv-surveillance-systems',
        name: 'Matrix Enterprise 64-Channel 4K NVR Server',
        sku: 'SKU-DV-CAM-004',
        slug: 'dv-matrix-enterprise-64ch-nvr',
        description: 'Carrier-grade network video recorder supporting up to 64 IP channels, RAID 0/1/5/6/10 data redundancy, 8 SATA hard drive bays, and dual redundant power supplies.',
        image_url: '/images/delightvision/centralmonitoring.jpg',
        featured: true,
        specifications: {
          channels: 'Up to 64 IP Video Channels',
          throughput: '384 Mbps Incoming Bandwidth',
          storage: '8 SATA Bays (Up to 128TB)',
          raid: 'RAID 0, 1, 5, 6, 10 Supported',
          redundancy: 'Dual Hot-Swappable Power Supplies',
          sira: 'Pre-configured for SIRA Police Monitoring Portal'
        }
      },
      {
        category_slug: 'access-control',
        name: 'BioPass Touchless Facial & RFID Access Terminal',
        sku: 'SKU-DV-ACC-001',
        slug: 'dv-biopass-facial-rfid-terminal',
        description: 'Fast dual-camera facial recognition terminal with live spoof detection, RFID card reader, QR code scanner, and seamless attendance integration.',
        image_url: '/images/delightvision/accesscontrol.jpg',
        featured: true,
        specifications: {
          authentication: 'Face, RFID Card (Mifare/DESFire), PIN, QR Code',
          recognition_speed: '< 0.2 seconds',
          capacity: '50,000 Faces, 100,000 Cards',
          connectivity: 'TCP/IP, Wi-Fi, RS485, Wiegand',
          screen: '7-inch IPS Capacitive Touchscreen'
        }
      },
      {
        category_slug: 'gate-barrier',
        name: 'Veloce High-Speed Automatic Boom Barrier',
        sku: 'SKU-DV-GAT-001',
        slug: 'dv-veloce-high-speed-boom-barrier',
        description: 'Brushless DC motor vehicle gate barrier with 1.5s opening speed, integrated LED boom arm, anti-collision loop sensor, and UHF RFID long-range integration.',
        image_url: '/images/delightvision/turnstile-gate.webp',
        featured: true,
        specifications: {
          motor: '24V DC Brushless Servo Motor',
          opening_time: '1.2s - 3.0s Adjustable',
          boom_length: 'Up to 6 Meters with LED Strip',
          duty_cycle: '100% Continuous Duty (5M MCBF)',
          integration: 'UHF Long-Range Reader, ANPR Camera, Push Button'
        }
      },
      {
        category_slug: 'structured-cabling',
        name: 'OptiCore 24-Port Category 6A Shielded Patch Panel',
        sku: 'SKU-DV-CAB-001',
        slug: 'dv-opticore-cat6a-patch-panel',
        description: '1U 19-inch high-density Cat6A 10Gbps FTP patch panel with rear cable management bar, grounding wire, and gold-plated contacts.',
        image_url: '/images/delightvision/structured-cabling-michigan.jpg',
        featured: false,
        specifications: {
          standard: 'TIA/EIA-568.2-D Cat6A 10GBASE-T',
          ports: '24 Shielded RJ45 Ports',
          rack_mount: '1U Standard 19" Rack',
          certification: 'Fluke Channel & Permanent Link Tested'
        }
      },
      {
        category_slug: 'intercom-video-doorph',
        name: 'VisionVue Multi-Tenant IP Video Intercom Master Station',
        sku: 'SKU-DV-INT-001',
        slug: 'dv-visionvue-ip-video-intercom',
        description: 'All-metal flush-mount outdoor intercom station with 1080p wide-angle camera, IC card reader, digital directory keypad, and iOS/Android app integration.',
        image_url: '/images/delightvision/videocam.jpg',
        featured: true,
        specifications: {
          camera: '2MP Full HD 140° Wide Angle with Night IR',
          display: '10-inch Full Touch Screen',
          access: 'PIN, RFID Card, Mobile App, Facial Scan',
          connectivity: 'PoE, Ethernet, SIP 2.0 PBX'
        }
      }
    ];

    for (const prod of productsData) {
      const catId = categoryMap[prod.category_slug];
      if (!catId) continue;

      await client.query(`
        INSERT INTO products (
          category_id, division_id, name, sku, slug, description,
          image_url, featured, specifications, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
        ON CONFLICT (sku) DO UPDATE 
        SET category_id = EXCLUDED.category_id,
            division_id = EXCLUDED.division_id,
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            featured = EXCLUDED.featured,
            specifications = EXCLUDED.specifications,
            status = 'active';
      `, [
        catId,
        divId,
        prod.name,
        prod.sku,
        prod.slug,
        prod.description,
        prod.image_url,
        prod.featured,
        JSON.stringify(prod.specifications)
      ]);
      console.log(`  📦 Product: ${prod.name} (${prod.sku})`);
    }

    // Ensure trusted_partners allows 'dv' division
    await client.query(`
      ALTER TABLE trusted_partners DROP CONSTRAINT IF EXISTS trusted_partners_division_check;
      ALTER TABLE trusted_partners ADD CONSTRAINT trusted_partners_division_check 
      CHECK (division = ANY (ARRAY['dtl'::text, 'dgs'::text, 'both'::text, 'dv'::text]));
    `);

    // 4. Seed Trusted Enterprise Partners for Delight Vision
    const enterprisePartners = [
      { name: 'Al Tayer Real Estate', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Bloomingdale’s UAE', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f8?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Harvey Nichols Dubai', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1582037928769-181f2644ecb7?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Amazon UAE Fulfillment', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1523474255658-4af61825044d?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Reel Cinemas', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'GymNation UAE', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Dubai Harbour Cruise Terminal', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&q=80&w=400&h=400' },
      { name: 'Provis Real Estate', division: 'dv', status: 'active', display_style: 'grid', logo_url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400&h=400' }
    ];

    for (const partner of enterprisePartners) {
      await client.query(`
        INSERT INTO trusted_partners (name, division, status, display_style, logo_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name) DO UPDATE 
        SET division = EXCLUDED.division,
            status = EXCLUDED.status,
            display_style = EXCLUDED.display_style,
            logo_url = EXCLUDED.logo_url;
      `, [partner.name, partner.division, partner.status, partner.display_style, partner.logo_url]);
    }
    console.log('✅ Seeded 8 Enterprise Partners for Delight Vision!');

    await client.query('COMMIT');
    console.log('🎉 Delight Vision database seeding completed successfully!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding error:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDelightVision();
