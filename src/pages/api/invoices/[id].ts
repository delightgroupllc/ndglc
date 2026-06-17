import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';

const itemSchema = z.object({
  description: z.string().min(1, 'Item name is required'),
  product_id: z.string().optional().nullable(),
  catalogue_ref: z.string().optional().nullable(),
  tech_spec: z.string().optional().nullable(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Unit price cannot be negative'),
  tax_type: z.enum(['percentage', 'fixed']).default('percentage'),
  tax_value: z.number().min(0).default(5),
});

const invoiceSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')),
  customer_phone: z.string().optional(),
  company_name: z.string().optional(),
  company_vat: z.string().optional().nullable(),
  show_images: z.boolean().default(false),
  billing_address: z.string().optional(),
  shipping_address: z.string().optional(),
  order_type: z.enum(['standard', 'quotation', 'proforma', 'service', 'recurring', 'lpo', 'tax_invoice', 'inquiry', 'delivery_note', 'commercial_invoice', 'payment']).default('standard'),
  source_division: z.enum(['DTL', 'DGS', 'both']).optional().nullable(),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional(),
  payment_status: z.enum(['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft']),
  discount_type: z.enum(['percentage', 'fixed']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  internal_notes: z.string().optional(),
  lpo_number: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'At least one line item is required'),
});

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const data = await request.json();
    const parsed = invoiceSchema.parse(data);

    let subtotal = 0;
    let totalTax = 0;
    for (const item of parsed.items) {
      const lineTotal = item.quantity * item.unit_price;
      subtotal += lineTotal;
      if (item.tax_type === 'percentage') {
        totalTax += lineTotal * (item.tax_value / 100);
      } else {
        totalTax += item.tax_value;
      }
    }

    let discount = 0;
    if (parsed.discount_type === 'percentage') {
      discount = subtotal * (parsed.discount_value / 100);
    } else {
      discount = parsed.discount_value;
    }
    const total_amount = Math.max(0, subtotal + totalTax - discount);

    const updated = await withTransaction(async (client) => {
      // Verify invoice exists before modifying
      const check = await client.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [id]);
      if (check.rows.length === 0) throw new Error('Invoice not found');

      // Upsert customer
      await client.query(
        `INSERT INTO customers (name, email, phone, billing_address, shipping_address)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, customers.email),
           phone = COALESCE(EXCLUDED.phone, customers.phone),
           billing_address = COALESCE(EXCLUDED.billing_address, customers.billing_address)`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null,
        parsed.billing_address || null, parsed.shipping_address || null]
      );

      const res = await client.query(
        `UPDATE invoices SET
          customer_name=$1, customer_email=$2, customer_phone=$3, company_name=$4, company_vat=$5,
          billing_address=$6, shipping_address=$7, order_type=$8, source_division=$9,
          issue_date=$10, due_date=$11, subtotal=$12, gst_amount=$13,
          discount_type=$14, discount_value=$15, discount_amount=$16, total_amount=$17, payment_status=$18,
          internal_notes=$19, show_images=$20, lpo_number=$21, payment_terms=$22, updated_at=NOW()
         WHERE id=$23 RETURNING *`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null,
        parsed.company_name || null, parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null,
        parsed.order_type, parsed.source_division || null, parsed.issue_date, parsed.due_date || null,
        subtotal, totalTax, parsed.discount_type, parsed.discount_value, discount, total_amount, parsed.payment_status,
        parsed.internal_notes || null, parsed.show_images, parsed.lpo_number || null, parsed.payment_terms || null, id]
      );

      // Wipe and re-insert items (simpler + ACID-safe)
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

      // Duplicate line item check
      const seen = new Set<string>();
      for (const item of parsed.items) {
        const key = `${item.description.toLowerCase().trim()}|${item.catalogue_ref || ''}`;
        if (seen.has(key)) {
          throw new Error(`Duplicate line item: "${item.description}". Consolidate quantities.`);
        }
        seen.add(key);

        const lineTotal = item.quantity * item.unit_price;
        let lineTax = 0;
        if (item.tax_type === 'percentage') {
          lineTax = lineTotal * (item.tax_value / 100);
        } else {
          lineTax = item.tax_value;
        }

        // Dynamically resolve product thumbnail image
        let resolvedImage = null;
        if (item.product_id) {
          const imgRes = await client.query(
            `SELECT url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1`,
            [item.product_id]
          );
          if (imgRes.rows.length > 0) {
            resolvedImage = imgRes.rows[0].url;
          }
        }

        await client.query(
          `INSERT INTO invoice_items (invoice_id, product_id, catalogue_ref, description, tech_spec, quantity, unit_price, tax_type, tax_value, tax_amount, total_price, item_image)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, item.product_id || null, item.catalogue_ref || null, item.description,
            item.tech_spec || null, item.quantity, item.unit_price, item.tax_type, item.tax_value,
            lineTax, lineTotal + lineTax, resolvedImage]
        );
      }

      // Inventory Deduction Logic
      const shouldDeduct = parsed.payment_status === 'paid' || parsed.order_type === 'delivery_note';
      const prevInvoice = await client.query('SELECT inventory_deducted FROM invoices WHERE id = $1', [id]);
      const alreadyDeducted = prevInvoice.rows[0]?.inventory_deducted;

      if (shouldDeduct && !alreadyDeducted) {
        for (const item of parsed.items) {
          if (!item.product_id) continue;
          
          const invRes = await client.query('SELECT id, stock_level FROM inventory WHERE product_id = $1 FOR UPDATE', [item.product_id]);
          if (invRes.rows.length > 0) {
            const inv = invRes.rows[0];
            const newStock = inv.stock_level - item.quantity;
            
            await client.query('UPDATE inventory SET stock_level = $1, updated_at = NOW() WHERE id = $2', [newStock, inv.id]);
            
            await client.query(`
              INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
              VALUES ($1, $2, $3, $4, 'sales', null)
            `, [inv.id, -item.quantity, inv.stock_level, newStock]);
          }
        }
        
        await client.query('UPDATE invoices SET inventory_deducted = true WHERE id = $1', [id]);
        res.rows[0].inventory_deducted = true;
      }

      return res.rows[0];
    });

    return new Response(JSON.stringify(updated), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
    const data = await request.json();
    if (data.order_type) {
      await query('UPDATE invoices SET order_type = $1, updated_at = NOW() WHERE id = $2', [data.order_type, id]);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Field not provided' }), { status: 400 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
    const res = await query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
    if (res.rows.length === 0) return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
