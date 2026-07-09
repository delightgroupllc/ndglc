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
        AND (
          p.name ILIKE '%Luminance%' 
          OR p.sku ILIKE 'LMN%' 
          OR p.name IN ('L3/2', 'ML', 'D2', 'D3', 'D4', 'D5', 'D6', 'FL1', 'L2', 'P1', 'S1', 'L1', 'NL')
          OR p.name ILIKE '%Aluminium%'
          OR p.name ILIKE '%Mean Well%'
          OR p.name ILIKE '%Transformer%'
        )
    `);
    
    const dtlDiv = await query(`SELECT id FROM divisions WHERE slug = 'delighttechnicallighting'`);
    const lightCat = await query(`SELECT id FROM categories WHERE slug = 'commercial-lighting'`); 
    const catId = lightCat.rows.length ? lightCat.rows[0].id : (await query(`SELECT id FROM categories WHERE slug = 'indoor-lighting'`)).rows[0].id;
    const dtlId = dtlDiv.rows[0].id;

    const updates = [];
    let counter = Date.now(); // Guarantees uniqueness for testing!

    for (const row of badProducts.rows) {
      const newSku = `SKU-DTL-LIG-${counter}`;
      
      await query(`
        UPDATE products 
        SET sku = $1, division_id = $2, category_id = $3
        WHERE id = $4
      `, [newSku, dtlId, catId, row.id]);
      
      updates.push({
        name: row.name,
        oldSku: row.sku,
        newSku
      });
      counter++;
    }

    return new Response(JSON.stringify({ success: true, updatedCount: updates.length, updates }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  }
};
