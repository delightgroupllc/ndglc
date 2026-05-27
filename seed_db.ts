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

async function seed() {
  const { pool } = await import('./src/lib/db');
  const client = await pool.connect();
  try {
    console.log('Starting DB seeding...');
    await client.query('BEGIN;');

    // Ensure organizations exist first
    console.log('Ensuring organizations exist...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id   INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE
      );
    `);
    await client.query(`
      INSERT INTO organizations (id, name, slug) VALUES
      (1, 'Delight Group', 'delight-group'),
      (2, 'Delight Greenscapes', 'delight-greenscapes'),
      (3, 'Delight Technical Lighting', 'delight-technical-lighting')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 1. disclaimers
    console.log('Seeding disclaimers...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS disclaimers (
        id           INTEGER PRIMARY KEY,
        slug         TEXT UNIQUE NOT NULL,
        title        TEXT NOT NULL,
        content      TEXT,
        updated_at   TIMESTAMPTZ
      );
    `);
    await client.query(`
      INSERT INTO disclaimers (id, slug, title, content, updated_at) VALUES
      (5, 'privacy-policy', 'Privacy Policy', 'We value your privacy and protect your data.OKAy', '2026-05-02 12:17:00.952613+00'),
      (6, 'terms-of-use', 'Terms of Use', 'By using this site, you agree to our terms.', '2026-05-01 00:28:20.867455+00'),
      (7, 'cookie-policy', 'Cookie Policy', 'We use cookies to improve your experience.', '2026-05-01 00:28:20.867455+00'),
      (9, 'terms-and-conditions', 'Terms and Conditions', '<h2>1.The Acceptance of Terms</h2><p>By accessing or using our services, you agree to be bound by these Terms and Conditions.</p><h2>2. Use of Services</h2><p>You agree to use our services only for lawful purposes and in accordance with these Terms.</p><h2>3. Intellectual Property</h2><p>All content and materials available through our services are the property of Delight Group LLC or its licensors.</p>', '2026-05-01 20:19:13.032484+00')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. terms_and_conditions
    console.log('Seeding terms_and_conditions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS terms_and_conditions (
        id              INTEGER PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id),
        section_title   TEXT NOT NULL,
        content         TEXT,
        order_index     INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ
      );
    `);
    await client.query(`
      INSERT INTO terms_and_conditions (id, organization_id, section_title, content, order_index, created_at) VALUES
      (6,  2, 'Payment Terms',       'All payments are due within 30 days of invoice date.',             0, '2026-04-30 20:43:27.760931+00'),
      (7,  2, 'Warranty',            'Standard 12-month warranty applies to all technical equipment.',   1, '2026-04-30 20:43:27.760931+00'),
      (8,  3, 'Payment Terms',       'All payments are due within 30 days of invoice date.',             0, '2026-04-30 20:43:28.019007+00'),
      (9,  3, 'Warranty',            'Standard 12-month warranty applies to all technical equipment.',   1, '2026-04-30 20:43:28.019007+00'),
      (10, 1, 'General Terms',       'These general terms apply to all transactions and agreements.',    1, '2026-05-01 00:28:20.251704+00'),
      (11, 1, 'Payment Obligations', 'Payments are due within 15 days of invoice date unless stated otherwise.', 2, '2026-05-01 00:28:20.251704+00'),
      (12, 1, 'Warranty & Liability','All products carry a standard 12-month manufacturer warranty.',   3, '2026-05-01 00:28:20.251704+00'),
      (13, 1, 'Payment Terms',       'Payment is due within 30 days of invoice date.',                  1, '2026-05-01 20:16:03.687712+00'),
      (14, 1, 'Delivery',            'Standard delivery time is 2-4 weeks from order confirmation.',    2, '2026-05-01 20:16:03.687712+00')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 3. catalogues
    console.log('Seeding catalogues...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalogues (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id INTEGER REFERENCES organizations(id),
        file_name       TEXT NOT NULL,
        slug            TEXT UNIQUE,
        category        TEXT,
        description     TEXT,
        file_size       TEXT,
        download_link   TEXT,
        is_active       BOOLEAN DEFAULT false,
        display_order   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT now(),
        is_deleted      BOOLEAN DEFAULT false,
        deleted_at      TIMESTAMPTZ,
        status          TEXT DEFAULT 'draft'
      );
    `);
    await client.query(`
      INSERT INTO catalogues (id, organization_id, file_name, slug, category, description, file_size, download_link, is_active, display_order, created_at, is_deleted, deleted_at, status) VALUES
      ('9c63d790-48cc-4a1e-8a8d-745269487942', 1, 'DELIGHT TECHNICAL LIGHTING OUTDOOR CATALOG',  'delight-technical-lighting-outdoor-catalog',  'Lighting',    NULL,                                          '13 MB',  'https://drive.google.com/uc?export=download&id=1zze_8hJtWiJ6J4siJAaD6isKpGKXQH82', true,  0, '2026-05-18 11:15:22.451291+00', false, NULL,                          'published'),
      ('c260d374-7dff-4a62-9668-471759c7635c', 1, 'DELIGHT TECHNICAL LIGHTING INDOOR CATALOG',   'delight-technical-lighting-indoor-catalog',   'Lighting',    NULL,                                          '19 M.B', 'https://drive.google.com/uc?export=download&id=1KaLTQlCwTV4SG4RzigTpqyxT9LYwzeD-', true,  0, '2026-05-18 11:15:57.003153+00', false, NULL,                          'published'),
      ('0ebe8714-1a79-43ea-89b3-65c83fac3d69', 1, 'DELIGHT TECHNICAL LIGHTING COMPLETE CATALOG', 'delight-technical-lighting-complete-catalog', 'Lighting',    NULL,                                          '388 MB', 'https://drive.google.com/uc?export=download&id=19fmDEn5YXhWFktjsKsU3jgQRMPRlym4D', false, 0, '2026-05-16 07:16:04.936767+00', false, NULL,                          'draft'),
      ('c80ddb83-da44-4ea9-a3db-1e58486739d1', 1, 'DELIGHT TECHNICAL LIGHTING COMPANY PROFILE',  'delight-technical-lighting-company-profile',  'Lighting',    NULL,                                          '13 M.B', 'https://drive.google.com/uc?export=download&id=1Rg3ILW4mFMYfeYLCt754KCFMRCHsQfCr', true,  0, '2026-05-07 18:29:00.395586+00', false, NULL,                          'published'),
      ('a7f47a28-87e1-4aaf-a4f1-bbaa85165fff', 1, 'DELIGHT GREENSCAPES CATALOG',                 'delight-greenscapes-catalog',                 'Landscaping', NULL,                                          '42 MB',  'https://drive.google.com/uc?export=download&id=178K2oFfRdqAICqygObFnlbXA5AdSLbNU', true,  0, '2026-05-18 17:16:35.435672+00', false, NULL,                          'published'),
      ('540d0ffd-8b8e-46d5-a00e-21d76cf77dad', 1, 'Lighting Catalog 2026',                        'lighting-catalog-2026',                        'Lighting',    'Full range of technical lighting solutions',   '24MB',   'https://example.com/lighting.pdf',                                              true,  0, '2026-05-01 00:28:16.761739+00', false, NULL,                          'draft'),
      ('81de5156-715d-491b-a440-90e2c371f9d5', 1, 'Technical Solutions 2026',                     'technical-solutions-2026',                     'Technical',   'Custom engineering and infrastructure solutions', NULL, 'https://example.com/tech.pdf',                                                  true,  0, '2026-05-01 00:28:16.761739+00', true,  '2026-05-18 17:16:55.449588+00', 'draft'),
      ('6b069ea3-fbdc-4d17-8228-a4d4bd5d190b', 1, 'Greenscapes Brochure',                        'greenscapes-brochure',                        'Greenscapes', 'Sustainable landscaping materials and designs','2MB',    'https://drive.google.com/uc?export=download&id=1lRaaW_w8y7gR0MryFz4vBsMQEzIZbCRm', true,  0, '2026-05-01 00:28:16.761739+00', true,  '2026-05-18 17:16:44.811491+00', 'published'),
      ('272dcbf4-14e8-478d-b3b3-bb3ef604bd82', 1, 'other',  'other',  'uuyfl',       'kkk',        '1gb',  'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', false, 0, '2026-05-05 10:04:02.593631+00', true,  '2026-05-16 07:15:14.526998+00', 'archived'),
      ('62a9e76a-8997-487c-959f-20c61b617c23', 1, '222',    '222',    'Maintenance', '2',          '1',    'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', true,  0, '2026-05-05 10:19:12.993115+00', true,  '2026-05-05 18:01:25.621942+00', 'published'),
      ('a27bdce4-cfba-4a21-a94f-5832b4df94ba', 1, 'TESTTER','testter', 'Lighting',   'A',          '1MB',  'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', true,  0, '2026-05-05 10:02:57.99279+00',  true,  '2026-05-05 18:01:53.392531+00', 'published'),
      ('c41fc998-0b28-4e5b-b7f9-b9bff46a7371', 1, 'ATEST',  'atest',  'Landscaping', 'Test',      '1',    'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', true,  0, '2026-05-05 09:53:50.753827+00', true,  '2026-05-05 18:01:08.15018+00',  'published'),
      ('e2c06289-a35f-40c5-b822-bc2bf4e81dc3', 1, 'Fi',     'fi',     'Maintenance', 'eefas',      '1gb',  'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', false, 0, '2026-05-05 10:21:07.258058+00', true,  '2026-05-16 07:15:10.808019+00', 'draft'),
      ('eda19940-5a95-4daa-8179-68248ea98cc1', 1, 'Hero',   'hero',   'Landscaping', 'image flower','22MB', 'https://media.fioredesigns.com/uploads/2026/02/ruscus-and-salal-greenery.avif', true,  0, '2026-05-05 09:42:52.850021+00', true,  '2026-05-05 09:53:18.49928+00',  'published' )
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. partners
    console.log('Seeding partners...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id              INTEGER PRIMARY KEY,
        organization_id INTEGER REFERENCES organizations(id),
        name            TEXT NOT NULL,
        logo_url        TEXT,
        website_url     TEXT,
        description     TEXT,
        visible_on      TEXT[],
        is_active       BOOLEAN DEFAULT true,
        display_order   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT now(),
        testimonial     TEXT,
        is_deleted      BOOLEAN DEFAULT false,
        deleted_at      TIMESTAMPTZ,
        status          TEXT,
        updated_at      TIMESTAMPTZ
      );
    `);
    await client.query(`
      INSERT INTO partners (id, organization_id, name, logo_url, website_url, description, visible_on, is_active, display_order, created_at, testimonial, is_deleted, deleted_at, status, updated_at) VALUES
      (1,  NULL, 'Premium Lighting Corp',   '/logos/lighting.png',    'https://example.com', 'Global leader in architectural lighting',          ARRAY['home','dtl'],  true, 1, '2026-05-01 17:38:22.462291+00', NULL, true,  '2026-05-02 20:14:22.229261+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (2,  NULL, 'Eco Landscapes Ltd',      '/logos/landscape.png',   'https://example.com', 'Sustainable landscaping solutions',                 ARRAY['home','dgs'],  true, 2, '2026-05-01 17:38:22.462291+00', NULL, true,  '2026-05-02 20:26:09.543721+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (3,  NULL, 'Smart Automation Inc',    '/logos/automation.png',  'https://example.com', 'Advanced building automation systems',              ARRAY['dtl'],         true, 3, '2026-05-01 17:38:22.462291+00', NULL, true,  '2026-05-02 20:25:57.398181+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (13, 1, 'Osram Technical',          'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&q=80&w=400&h=400', 'https://www.osram.com',         'World-leading provider of technical lighting modules and smart lighting solutions.',             ARRAY['home','lighting'],    true, 1, '2026-05-02 19:56:37.10968+00',  'Delight Group has been our most reliable integration partner in the Middle East.', true, '2026-05-05 16:49:27.666302+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (14, 1, 'Philips Hue Professional', 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400', 'https://www.philips-hue.com',   'Advanced wireless lighting systems and ecosystem integration for high-end residential projects.', ARRAY['home','lighting'],    true, 2, '2026-05-02 19:56:37.382263+00', 'Exceptional craftsmanship in every installation.',                                true, '2026-05-05 16:49:22.56623+00',  'active', '2026-05-05 12:41:41.644975+00'),
      (15, 1, 'Hunter Irrigation',        'https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&q=80&w=400&h=400','https://www.hunterindustries.com','Pioneers in efficient irrigation technology and sustainable water management.',              ARRAY['home','greenscapes'], true, 3, '2026-05-02 19:56:37.637207+00', 'The Greenscapes division understands sustainable architecture better than anyone.',true, '2026-05-05 16:49:05.615023+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (16, 1, 'Lutron Controls',          'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=400&h=400', 'https://www.lutron.com',        'Global leader in automated automated controls and shading solutions.',                         ARRAY['home','lighting'],    true, 4, '2026-05-02 19:56:37.902146+00', 'Reliable, professional, and technical experts.',                                  true, '2026-05-05 16:49:33.139285+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (17, 1, 'Sustainable Seeds Co.',    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=400&h=400', 'https://example.com',          'Organic seed suppliers seed resilient flora.',                                                 ARRAY['home','greenscapes'], true, 5, '2026-05-02 19:56:38.295956+00', 'Our partnership has flourished through shared values of biodiversity.',           true, '2026-05-05 16:48:53.372964+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (18, 1, 'ABB Smart Buildings',      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=400&h=400', 'https://global.abb',           'Providing industrial-grade building automation and power management.',                         ARRAY['home'],               true, 6, '2026-05-02 19:56:38.562226+00', 'The synergy between our tech and Delight''s vision is unmatched.',               true, '2026-05-05 16:49:38.452843+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (19, 1, 'DALI Alliance',            'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80&w=400&h=400', 'https://www.dali-alliance.org', 'Standardizing digital lighting control for large-scale commercial infrastructures.',            ARRAY['home','lighting'],    true, 7, '2026-05-02 19:56:38.809162+00', 'Advancing lighting standards across the UAE.',                                    true, '2026-05-05 16:49:47.014773+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (20, 1, 'Eco-Irrigate UAE',         'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&q=80&w=400&h=400', 'https://example.com',          'Local experts in gray-water recycling and solar-powered irrigation.',                         ARRAY['home'],               false,8, '2026-05-02 19:56:39.08596+00',  'A visionary approach to desert landscaping.',                                     true, '2026-05-05 16:49:52.02193+00',  NULL,     '2026-05-05 13:07:10.673445+00'),
      (21, 1, 'Schréder Lighting',        'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=400&h=400', 'https://www.schreder.com',      'Experts in urban and public space lighting for safe and beautiful cities.',                    ARRAY['home','lighting'],    true, 9, '2026-05-02 19:56:39.340517+00', 'The technical depth of the DTL team is world-class.',                             true, '2026-05-05 16:49:10.570505+00', 'active', '2026-05-05 12:41:41.644975+00'),
      (22, 1, 'A',                        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR0iayVchoRvHdg6Pz4N9gm0z5k-DOT3evJKA&s',   NULL,                            'a',                                                                                            ARRAY['home','dtl','dgs'],   true, 10,'2026-05-05 13:06:33.640358+00', 'a',                                                                               true, '2026-05-05 16:49:15.803267+00', NULL,     '2026-05-05 13:06:54.743999+00'),
      (23, 1, 'Test',                     NULL,                                                                                                 NULL,                            NULL,                                                                                           NULL,                        true, 0, '2026-05-05 15:53:37.380918+00', NULL,                                                                              true, '2026-05-05 16:49:00.834643+00', 'active', '2026-05-05 15:53:37.380918+00'),
      (24, 1, 'ZCL',                      'https://iili.io/BQpziHg.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:43:34.670059+00', NULL,                                                                              true, '2026-05-16 06:59:14.444736+00', NULL,     '2026-05-05 16:44:06.701323+00'),
      (25, 1, 'Thorn',                    'https://iili.io/BQpzLOJ.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:44:38.648274+00', NULL,                                                                              true, '2026-05-16 06:59:10.153524+00', 'active', '2026-05-05 16:44:38.648274+00'),
      (29, 1, 'Pelsan',                   'https://iili.io/BQpzDVp.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:47:40.242144+00', NULL,                                                                              true, '2026-05-16 06:58:44.067165+00', 'active', '2026-05-05 16:47:40.242144+00'),
      (30, 1, 'HansGreen',                'https://iili.io/BQpzpfI.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:47:59.787698+00', NULL,                                                                              true, '2026-05-16 06:59:35.040233+00', 'active', '2026-05-05 16:47:59.787698+00'),
      (31, 1, 'Cortem Group',             'https://iili.io/BQpI9UX.png',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:48:43.895211+00', NULL,                                                                              true, '2026-05-16 06:58:38.911906+00', 'active', '2026-05-05 16:48:43.895211+00'),
      (26, 1, 'Legrand',                  'https://iili.io/BQpzsRa.png',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:45:26.209013+00', NULL, false, NULL, 'active', '2026-05-05 16:45:26.209013+00'),
      (27, 1, 'SYV',                      'https://iili.io/BQpz6UF.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:45:40.874191+00', NULL, false, NULL, 'active', '2026-05-05 16:45:40.874191+00'),
      (28, 1, 'Lutron',                   'https://iili.io/BQpztxR.jpg',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-05 16:45:56.892302+00', NULL, false, NULL, 'active', '2026-05-05 16:45:56.892302+00'),
      (32, 1, 'Phillips lighting',        'https://iili.io/BQpIJJn.png',                                                                       NULL,                            NULL,                                                                                           ARRAY[]::TEXT[],             false,0, '2026-05-05 16:50:13.395892+00', NULL, false, NULL, NULL,     '2026-05-16 09:29:03.304902+00'),
      (33, 1, 'SOLUX LIGHTING',           'https://iili.io/BpaUlOQ.png',                                                                       NULL,                            NULL,                                                                                           ARRAY['home','dtl'],         true, 0, '2026-05-16 09:31:27.250343+00', NULL, false, NULL, 'active', '2026-05-16 09:31:27.250343+00'),
      (34, 1, 'DELIGHT GREENSCAPES',      'https://iili.io/Bpa6buj.jpg',                                                                       'https://www.delightgroupllc.com/delightgreenscapes',  NULL,                                                                   ARRAY['dgs'],                true, 0, '2026-05-16 09:38:35.785163+00', NULL, false, NULL, 'active', '2026-05-16 09:38:35.785163+00'),
      (35, 1, 'DELIGHT TECHNICAL LIGHTING','https://iili.io/Bpa6tyb.jpg',                                                                      'https://www.delightgroupllc.com/delighttechnicallighting', NULL,                                                              ARRAY['home','dtl'],         true, 0, '2026-05-16 09:39:41.57677+00',  NULL, false, NULL, 'active', '2026-05-16 09:39:41.57677+00')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query('COMMIT;');
    console.log('Successfully seeded database tables!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error seeding database:', err);
  } finally {
    client.release();
    await pool.end();
  }
}
seed();
