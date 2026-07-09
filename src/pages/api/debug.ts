import type { APIRoute } from 'astro';
import { query } from '../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const badProducts = await query(`
      SELECT p.id, p.name, p.sku, d.slug as div, c.slug as cat 
      FROM products p
      JOIN divisions d ON p.division_id = d.id
      JOIN categories c ON p.category_id = c.id
      WHERE d.slug = 'delightgreenscapes' AND c.slug = 'planters-pots'
    `);
    
    return new Response(JSON.stringify({ 
      badProducts: badProducts.rows
    }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
  }
};
