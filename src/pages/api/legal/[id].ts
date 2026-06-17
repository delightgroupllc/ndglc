import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const artifactSchema = z.object({
  title: z.string().min(1),
  identifier: z.string().min(1),
  type: z.enum(['public', 'order_clause', 'both']),
  content: z.string().min(1)
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const data = await request.json();
    const parsed = artifactSchema.parse(data);

    const res = await query(
      `UPDATE legal_artifacts SET title = $1, identifier = $2, type = $3, content = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
      [parsed.title, parsed.identifier, parsed.type, parsed.content, id]
    );

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Artifact not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.code === '23505') {
      return new Response(JSON.stringify({ error: 'Identifier already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) throw new Error("ID required");

    const res = await query(`DELETE FROM legal_artifacts WHERE id = $1 RETURNING id`, [id]);

    if (res.rowCount === 0) {
      return new Response(JSON.stringify({ error: 'Artifact not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
