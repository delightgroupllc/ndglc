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

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = projectSchema.parse(data);

    const res = await query(
      `UPDATE projects 
       SET title = $1, client_name = $2, description = $3, completion_date = $4, featured_image = $5, division = $6, status = $7, featured = $8, gallery_images = $9
       WHERE id = $10 RETURNING *`,
      [
        parsed.title, 
        parsed.client_name, 
        parsed.description, 
        parsed.completion_date || null, 
        parsed.featured_image || null,
        parsed.division,
        parsed.status,
        parsed.featured,
        JSON.stringify(parsed.gallery_images),
        id
      ]
    );

    if (res.rowCount === 0) {
      throw new Error('Project not found');
    }

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

    const res = await query(`DELETE FROM projects WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
