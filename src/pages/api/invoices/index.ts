import type { APIRoute } from 'astro';
import { query, withTransaction, exportTableAsCSV } from '../../../lib/db';
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
  payment_status: z.enum(['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft']).default('unpaid'),
  discount_type: z.enum(['percentage', 'fixed']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  internal_notes: z.string().optional(),
  lpo_number: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'At least one line item is required'),
});

export const GET: APIRoute = async ({ url }) => {
  try {
    // Support ?export=csv
    if (url.searchParams.get('export') === 'csv') {
      const csv = await exportTableAsCSV('invoices',
        ['invoice_number', 'customer_name', 'company_name', 'company_vat', 'customer_email', 'customer_phone',
         'order_type', 'source_division', 'issue_date', 'due_date', 'subtotal',
         'gst_amount', 'discount_amount', 'total_amount', 'payment_status', 'internal_notes', 'created_at']
      );
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="invoices-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    const res = await query(`
      SELECT i.*,
        (SELECT JSON_AGG(it ORDER BY it.id) FROM (SELECT * FROM invoice_items WHERE invoice_id = i.id) it) as items_list
      FROM invoices i
      ORDER BY i.created_at DESC
    `);
    return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const parsed = invoiceSchema.parse(data);

    // Calculate totals
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

    const rand = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `INV-${new Date().getFullYear()}-${rand}`;

    // ACID transaction
    const invoice = await withTransaction(async (client) => {
      // Upsert customer
      await client.query(
        `INSERT INTO customers (name, email, phone, billing_address, shipping_address)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, customers.email),
            phone = COALESCE(EXCLUDED.phone, customers.phone),
            billing_address = COALESCE(EXCLUDED.billing_address, customers.billing_address)`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null, parsed.billing_address || null, parsed.shipping_address || null]
      );

      const invRes = await client.query(
        `INSERT INTO invoices (
          invoice_number, customer_name, customer_email, customer_phone, company_name, company_vat,
          billing_address, shipping_address, order_type, source_division,
          issue_date, due_date, subtotal, gst_amount, discount_type, discount_value, discount_amount, total_amount,
          payment_status, internal_notes, show_images, lpo_number, payment_terms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        RETURNING *`,
        [invoice_number, parsed.customer_name, parsed.customer_email || null,
         parsed.customer_phone || null, parsed.company_name || null, parsed.company_vat || null,
         parsed.billing_address || null, parsed.shipping_address || null,
         parsed.order_type, parsed.source_division || null,
         parsed.issue_date, parsed.due_date || null,
         subtotal, totalTax, parsed.discount_type, parsed.discount_value, discount, total_amount, parsed.payment_status,
         parsed.internal_notes || null, parsed.show_images, parsed.lpo_number || null, parsed.payment_terms || null]
      );
      const inv = invRes.rows[0];

      // Check for duplicate items in the same invoice
      const seen = new Set<string>();
      for (const item of parsed.items) {
        const key = `${item.description.toLowerCase().trim()}|${item.catalogue_ref || ''}`;
        if (seen.has(key)) {
          throw new Error(`Duplicate line item detected: "${item.description}". Please consolidate quantities.`);
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
          [inv.id, item.product_id || null, item.catalogue_ref || null, item.description,
           item.tech_spec || null, item.quantity, item.unit_price, item.tax_type, item.tax_value,
           lineTax, lineTotal + lineTax, resolvedImage]
        );
      }

      // Inventory Deduction Logic
      const shouldDeduct = parsed.payment_status === 'paid' || parsed.order_type === 'delivery_note';
      if (shouldDeduct) {
        for (const item of parsed.items) {
          if (!item.product_id) continue;
          
          const invRes = await client.query('SELECT id, stock_level FROM inventory WHERE product_id = $1 FOR UPDATE', [item.product_id]);
          if (invRes.rows.length > 0) {
            const inventory = invRes.rows[0];
            const newStock = inventory.stock_level - item.quantity;
            
            await client.query('UPDATE inventory SET stock_level = $1, updated_at = NOW() WHERE id = $2', [newStock, inventory.id]);
            
            await client.query(`
              INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
              VALUES ($1, $2, $3, $4, 'sales', null)
            `, [inventory.id, -item.quantity, inventory.stock_level, newStock]);
          }
        }
        
        await client.query('UPDATE invoices SET inventory_deducted = true WHERE id = $1', [inv.id]);
        inv.inventory_deducted = true;
      }

      return inv;
    });

    return new Response(JSON.stringify(invoice), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Invoice POST error:', error);
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: error.errors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
