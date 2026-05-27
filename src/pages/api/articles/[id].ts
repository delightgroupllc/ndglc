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

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = articleSchema.parse(data);

    // Get current published_at state to preserve or set
    const currentRes = await query("SELECT status, published_at FROM articles WHERE id = $1", [id]);
    if (currentRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }
    
    const current = currentRes.rows[0];
    let publishedAt = current.published_at;
    if (parsed.status === 'published' && current.status !== 'published') {
      publishedAt = new Date();
    } else if (parsed.status !== 'published') {
      publishedAt = null;
    }

    const res = await query(
      `UPDATE articles 
       SET title = $1, content = $2, summary = $3, featured_image = $4, type = $5, division = $6, status = $7, published_at = $8,
           show_footer = $9, footer_brand = $10, footer_address = $11, footer_cta = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        parsed.title,
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
        parsed.footer_cta || null,
        id
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

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const res = await query(`DELETE FROM articles WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
