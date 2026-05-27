import { query } from '../lib/db';

export async function GET() {
  const domain = 'https://www.delightgroupllc.com';
  
  // 1. Static Pages
  const staticPages = [
    '',
    '/about',
    '/contact',
    '/downloads',
    '/privacy',
    '/terms',
    '/delighttechnicallighting',
    '/delightgreenscapes'
  ];

  // 2. Fetch all products and categories dynamically from DB
  let dynamicUrls: string[] = [];
  try {
    const prodsRes = await query(`
      SELECT p.slug as prod_slug, c.slug as cat_slug, d.slug as div_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN divisions d ON d.id = p.division_id
      WHERE p.status = 'active'
    `);
    
    prodsRes.rows.forEach(p => {
      dynamicUrls.push(`/${p.div_slug}/${p.cat_slug}/${p.prod_slug}`);
    });

    const catsRes = await query(`
      SELECT c.slug as cat_slug, d.slug as div_slug
      FROM categories c
      JOIN divisions d ON d.id = c.division_id
    `);
    
    catsRes.rows.forEach(c => {
      dynamicUrls.push(`/${c.div_slug}/${c.cat_slug}`);
    });
  } catch (err) {
    console.error('Error fetching sitemap paths:', err);
  }

  const allUrls = [...staticPages, ...dynamicUrls];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allUrls.map(url => `
  <url>
    <loc>${domain}${url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${url === '' ? 'daily' : 'weekly'}</changefreq>
    <priority>${url === '' ? '1.0' : (url.split('/').length <= 2 ? '0.8' : '0.6')}</priority>
  </url>`).join('')}
</urlset>`;

  return new Response(sitemapXml.trim(), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
