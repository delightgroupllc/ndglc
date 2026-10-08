require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update projects constraint
    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_division_check');
    await client.query("ALTER TABLE projects ADD CONSTRAINT projects_division_check CHECK (division = ANY (ARRAY['dtl'::text, 'dgs'::text, 'dv'::text]))");

    // 2. Update downloads constraint
    await client.query('ALTER TABLE downloads DROP CONSTRAINT IF EXISTS downloads_division_check');
    await client.query("ALTER TABLE downloads ADD CONSTRAINT downloads_division_check CHECK (division = ANY (ARRAY['dtl'::text, 'dgs'::text, 'dv'::text]))");

    // 3. Update section_images constraint
    await client.query('ALTER TABLE section_images DROP CONSTRAINT IF EXISTS section_images_division_check');
    await client.query("ALTER TABLE section_images ADD CONSTRAINT section_images_division_check CHECK (division = ANY (ARRAY['dtl'::text, 'dgs'::text, 'dv'::text]))");

    // 4. Update articles constraint
    await client.query('ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_division_check');
    await client.query("ALTER TABLE articles ADD CONSTRAINT articles_division_check CHECK (division = ANY (ARRAY['dtl'::text, 'dgs'::text, 'both'::text, 'dv'::text]))");

    console.log('✅ Constraints updated');

    // 5. Seed Projects
    const projects = [
      {
        title: 'Al Tayer Group Corporate HQ & Retail Flagships',
        client_name: 'Al Tayer Group',
        description: 'Complete SIRA-compliant 4K IP CCTV surveillance, facial recognition access control, and centralized command monitoring across flagship headquarters and retail stores.',
        division: 'dv',
        featured_image: '/images/delightvision/cctv.jpg',
        status: 'active',
        featured: true,
        completion_date: '2025-08-15'
      },
      {
        title: 'Dubai Harbour Cruise Terminal Access & ANPR Integration',
        client_name: 'Dubai Harbour Cruise Terminal',
        description: 'High-speed automated boom barriers, UHF long-range RFID vehicle identification, and high-definition ANPR cameras for maritime and passenger terminal gate control.',
        division: 'dv',
        featured_image: '/images/delightvision/turnstile-gate.webp',
        status: 'active',
        featured: true,
        completion_date: '2025-05-20'
      },
      {
        title: 'Amazon UAE Fulfillment Center Structured Cabling Backbone',
        client_name: 'Amazon UAE Logistics',
        description: 'Multi-gigabit Cat6A structured cabling, high-density fiber optic backbone splicing, and enterprise server rack containment for mission-critical logistics operations.',
        division: 'dv',
        featured_image: '/images/delightvision/structured-cabling-michigan.jpg',
        status: 'active',
        featured: true,
        completion_date: '2025-03-10'
      },
      {
        title: 'Reel Cinemas Video Analytics & Crowd Heatmap System',
        client_name: 'Reel Cinemas',
        description: 'Intelligent AI crowd monitoring, queue management analytics, and discrete SIRA-certified dome surveillance across premier cinema entertainment complexes.',
        division: 'dv',
        featured_image: '/images/delightvision/centralmonitoring.jpg',
        status: 'active',
        featured: true,
        completion_date: '2024-11-28'
      }
    ];

    for (const p of projects) {
      const existing = await client.query('SELECT id FROM projects WHERE title = $1', [p.title]);
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO projects (title, client_name, description, division, featured_image, status, featured, completion_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [p.title, p.client_name, p.description, p.division, p.featured_image, p.status, p.featured, p.completion_date]);
        console.log('  + Added project:', p.title);
      }
    }

    // 6. Seed Downloads
    const downloads = [
      {
        title: 'Delight Vision Integrated Security & ELV Solutions Profile 2026',
        division: 'dv',
        type: 'pdf',
        file_size: '4.8 MB',
        url: '/images/delightvision/cctv.jpg',
        status: 'active'
      },
      {
        title: 'SIRA Regulatory Standards & Video Surveillance Architectural Specs',
        division: 'dv',
        type: 'pdf',
        file_size: '3.2 MB',
        url: '/images/delightvision/smart-security.jpg',
        status: 'active'
      },
      {
        title: 'AI Dome & PTZ Surveillance Hardware Technical Datasheets',
        division: 'dv',
        type: 'pdf',
        file_size: '5.5 MB',
        url: '/images/delightvision/centralmonitoring.jpg',
        status: 'active'
      }
    ];

    for (const d of downloads) {
      const existing = await client.query('SELECT id FROM downloads WHERE title = $1', [d.title]);
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO downloads (title, division, type, file_size, url, status)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [d.title, d.division, d.type, d.file_size, d.url, d.status]);
        console.log('  + Added download:', d.title);
      }
    }

    // 7. Seed Articles from QuantaSec Blogs
    const articles = [
      {
        title: 'Smart Security: Why Your Business Needs AI-Driven CCTV in 2026',
        slug: 'smart-security-ai-cctv-2026',
        summary: 'Explore how deep-learning video analytics, automatic license plate recognition, and real-time behavioral alerts transform traditional passive monitoring into active threat prevention.',
        content: 'In modern commercial and industrial developments, conventional CCTV is no longer sufficient. SIRA regulations now mandate high-definition retention, intelligent event detection, and real-time monitoring dispatch. AI-driven surveillance enables proactive incident mitigation before escalation occurs.',
        division: 'dv',
        type: 'project_blog',
        status: 'published',
        featured_image: '/images/delightvision/smart-security.jpg'
      },
      {
        title: 'Technical Strength: The Backbone of Reliable ELV Systems',
        slug: 'technical-strength-reliable-elv-systems',
        summary: 'A deep dive into why robust structured cabling, Fluke-certified fiber backbones, and clean rack architecture are vital for preventing intermittent signal drops and system failures.',
        content: 'Behind every reliable camera feed and access door lies a meticulously designed structured cabling plant. From Cat6A high-bandwidth data paths to low-loss single-mode fiber backbones, precision cable management guarantees uninterrupted facility operations.',
        division: 'dv',
        type: 'project_blog',
        status: 'published',
        featured_image: '/images/delightvision/structured-cabling-michigan.jpg'
      }
    ];

    for (const a of articles) {
      const existing = await client.query('SELECT id FROM articles WHERE slug = $1', [a.slug]);
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO articles (title, slug, summary, content, division, type, status, featured_image, published_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [a.title, a.slug, a.summary, a.content, a.division, a.type, a.status, a.featured_image]);
        console.log('  + Added article:', a.title);
      }
    }

    await client.query('COMMIT');
    console.log('🚀 All migrations and seed data completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during migration:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
