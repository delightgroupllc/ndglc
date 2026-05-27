import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const projectSchema = z.object({
  title: z.string().min(1),
  client_name: z.string().min(1),
  description: z.string().min(1),
  completion_date: z.string().optional(),
  featured_image: z.string().url().optional().or(z.literal('')),
  division: z.enum(['dtl', 'dgs']).default('dtl'),
  status: z.enum(['active', 'archived']).default('active'),
  featured: z.boolean().default(false),
  gallery_images: z.array(z.string().url()).optional().default([])
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = projectSchema.parse(data);

    const res = await query(
      `INSERT INTO projects (title, client_name, description, completion_date, featured_image, division, status, featured, gallery_images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        parsed.title, 
        parsed.client_name, 
        parsed.description, 
        parsed.completion_date || null, 
        parsed.featured_image || null,
        parsed.division,
        parsed.status,
        parsed.featured,
        JSON.stringify(parsed.gallery_images)
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
