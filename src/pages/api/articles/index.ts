import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const articleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().or(z.literal('')),
  content: z.string().min(1),
  featured_image: z.string().optional().or(z.literal('')),
  type: z.enum(['press_release', 'event', 'project_blog']).default('press_release'),
  division: z.enum(['dtl', 'dgs', 'both']).default('both'),
  status: z.enum(['published', 'draft', 'archived']).default('draft'),
  show_footer: z.boolean().default(true),
  footer_brand: z.string().optional().nullable().or(z.literal('')),
  footer_address: z.string().optional().nullable().or(z.literal('')),
  footer_cta: z.string().optional().nullable().or(z.literal(''))
});

export const GET: APIRoute = async ({ url }) => {
  try {
    const division = url.searchParams.get('division');
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');

    let sql = 'SELECT * FROM articles WHERE 1=1';
    const params: any[] = [];

    if (division) {
      params.push(division);
      sql += ` AND (division = $${params.length} OR division = 'both')`;
    }
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const res = await query(sql, params);
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = articleSchema.parse(data);

    // Auto-generate clean unique slug from title
    let slug = parsed.title.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    // Check if slug exists, add random suffix if duplicate
    const check = await query("SELECT id FROM articles WHERE slug = $1", [slug]);
    if (check.rows.length > 0) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const publishedAt = parsed.status === 'published' ? new Date() : null;

    const res = await query(
      `INSERT INTO articles (title, slug, content, summary, featured_image, type, division, status, published_at, show_footer, footer_brand, footer_address, footer_cta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        parsed.title,
        slug,
        parsed.content,
        parsed.summary || null,
        parsed.featured_image || null,
        parsed.type,
        parsed.division,
        parsed.status,
        publishedAt,
        parsed.show_footer,
        parsed.footer_brand || null,
        parsed.footer_address || null,
        parsed.footer_cta || null
      ]
    );

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
