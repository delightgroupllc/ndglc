import type { APIRoute } from 'astro';
import { query } from '../../../../lib/db';

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'Invoice ID is required' }), { status: 400 });

    const { print_layout_config } = await request.json();
    if (!print_layout_config) {
      return new Response(JSON.stringify({ error: 'print_layout_config payload is required' }), { status: 400 });
    }

    await query(
      'UPDATE invoices SET print_layout_config = $1 WHERE id = $2',
      [JSON.stringify(print_layout_config), id]
    );

    return new Response(JSON.stringify({ success: true, message: 'Print settings saved successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
