import type { APIRoute } from 'astro';
import { query, withTransaction } from '../../../lib/db';
import { z } from 'zod';
import { optimizeAndSaveImage } from '../../../lib/imageOptimizer';

const itemSchema = z.object({
  description: z.string().min(1, 'Item name is required'),
  product_id: z.string().optional().nullable(),
  catalogue_ref: z.string().optional().nullable(),
  tech_spec: z.string().optional().nullable(),
  quantity: z.number({ 
    required_error: 'Quantity is required',
    invalid_type_error: 'Quantity must be a valid number' 
  }).int('Quantity must be an integer').min(1, 'Quantity must be at least 1'),
  unit_price: z.number({ 
    required_error: 'Unit price is required',
    invalid_type_error: 'Unit price must be a valid number' 
  }).min(0, 'Unit price cannot be negative'),
  tax_type: z.enum(['percentage', 'fixed']).default('percentage'),
  tax_value: z.number({ 
    invalid_type_error: 'Tax value must be a valid number' 
  }).min(0, 'Tax value cannot be negative').default(5),
  image_base64: z.string().optional().nullable(),
});

const invoiceSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
  customer_phone: z.string().regex(/^\+?[\d\s\-()]{7,25}$/, 'Invalid phone number format').optional().nullable().or(z.literal('')),
  company_name: z.string().optional().nullable().or(z.literal('')),
  company_vat: z.string().regex(/^[a-zA-Z0-9\s\-]+$/, 'Only alphanumeric characters allowed').optional().nullable().or(z.literal('')),
  show_images: z.boolean().default(false),
  billing_address: z.string().optional().nullable().or(z.literal('')),
  shipping_address: z.string().optional().nullable().or(z.literal('')),
  order_type: z.enum(['standard', 'quotation', 'proforma', 'service', 'recurring', 'lpo', 'tax_invoice', 'inquiry', 'delivery_note', 'commercial_invoice', 'payment']).default('standard'),
  source_division: z.enum(['DTL', 'DGS', 'both']).optional().nullable(),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional().nullable().or(z.literal('')),
  signatory_incharge: z.string().min(1, 'Signatory Incharge is required'),
  payment_status: z.enum(['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft']),
  discount_type: z.enum(['percentage', 'fixed']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  internal_notes: z.string().optional(),
  lpo_number: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'At least one line item is required'),
});

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const res = await query(
      `SELECT i.*, 
        (SELECT JSON_AGG(it ORDER BY it.id) FROM (SELECT * FROM invoice_items WHERE invoice_id = i.id) it) as items_list
       FROM invoices i WHERE i.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};


export const PUT: APIRoute = async ({ params, request, locals }) => {
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
      // Verify invoice exists before modifying and retrieve current invoice_number and order_type
      const check = await client.query('SELECT order_type, invoice_number FROM invoices WHERE id = $1 FOR UPDATE', [id]);
      if (check.rows.length === 0) throw new Error('Invoice not found');
      
      const current = check.rows[0];
      let newInvoiceNumber = current.invoice_number;

      if (parsed.order_type !== current.order_type) {
        if (parsed.order_type === 'quotation') {
          newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'EST-');
        } else if (parsed.order_type === 'lpo' || parsed.order_type === 'proforma') {
          newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'PRO-');
        } else if (parsed.order_type === 'delivery_note') {
          newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'DLN-');
        } else {
          newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'INV-');
        }
      }

      // Upsert customer
      await client.query(
        `INSERT INTO customers (name, email, phone, company_name, billing_address, shipping_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET
           email = COALESCE(EXCLUDED.email, customers.email),
           phone = COALESCE(EXCLUDED.phone, customers.phone),
           company_name = COALESCE(EXCLUDED.company_name, customers.company_name),
           billing_address = COALESCE(EXCLUDED.billing_address, customers.billing_address)`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null,
        parsed.company_name || null, parsed.billing_address || null, parsed.shipping_address || null]
      );

      const res = await client.query(
        `UPDATE invoices SET
          customer_name=$1, customer_email=$2, customer_phone=$3, company_name=$4, company_vat=$5,
          billing_address=$6, shipping_address=$7, order_type=$8, source_division=$9,
          issue_date=$10, due_date=$11, subtotal=$12, gst_amount=$13,
          discount_type=$14, discount_value=$15, discount_amount=$16, total_amount=$17, payment_status=$18,
          internal_notes=$19, show_images=$20, lpo_number=$21, payment_terms=$22, signatory_incharge=$23, 
          invoice_number=$24, updated_at=NOW()
         WHERE id=$25 RETURNING *`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null,
        parsed.company_name || null, parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null,
        parsed.order_type, parsed.source_division || null, parsed.issue_date, parsed.due_date || parsed.issue_date,
        subtotal, totalTax, parsed.discount_type, parsed.discount_value, discount, total_amount, parsed.payment_status,
        parsed.internal_notes || null, parsed.show_images, parsed.lpo_number || null, parsed.payment_terms || null, parsed.signatory_incharge, 
        newInvoiceNumber, id]
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

        // Dynamically resolve product
        let productId = item.product_id;
        let resolvedImage = null;

        if (!productId) {
          // Check if SKU or Name already exists
          let matchedProd = null;
          if (item.catalogue_ref) {
            const pSku = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1', [item.catalogue_ref]);
            if (pSku.rows.length > 0) matchedProd = pSku.rows[0];
          }
          if (!matchedProd) {
            const pName = await client.query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) LIMIT 1', [item.description]);
            if (pName.rows.length > 0) matchedProd = pName.rows[0];
          }

          if (matchedProd) {
            productId = matchedProd.id;
          } else {
            // Auto-create product
            const divRes = await client.query("SELECT id FROM divisions ORDER BY name ASC LIMIT 1");
            const catRes = await client.query("SELECT id FROM categories ORDER BY name ASC LIMIT 1");
            const divisionId = divRes.rows[0]?.id || null;
            const categoryId = catRes.rows[0]?.id || null;

            const sku = item.catalogue_ref || `PROD-${Math.floor(100000 + Math.random() * 900000)}`;
            const slug = item.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Math.floor(100000 + Math.random() * 900000)}`;

            const insProdRes = await client.query(
              `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [categoryId, divisionId, item.description, sku.toUpperCase(), slug, 'Auto-created from invoice', '[]', false, 'active']
            );
            productId = insProdRes.rows[0].id;

            // Initialize inventory row
            await client.query(
              `INSERT INTO inventory (product_id, stock_level, warehouse_location, low_stock_threshold)
               VALUES ($1, 0, 'Warehouse A', 10)`,
              [productId]
            );

          }

        } // Close if (!productId)

        // Handle image upload if exists (optimized with sharp) - works for existing products too!
        if (item.image_base64 && productId) {
          try {
            resolvedImage = await optimizeAndSaveImage(item.image_base64, productId);

            // Clean up old primary images for this product
            await client.query(
              `UPDATE product_images SET is_primary = false WHERE product_id = $1`,
              [productId]
            );

            await client.query(
              `INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, true)`,
              [productId, resolvedImage]
            );
            
            await client.query(
              `UPDATE products SET image_url = $1 WHERE id = $2`,
              [resolvedImage, productId]
            );
          } catch (imgErr) {
            console.error('Error saving optimized product image:', imgErr);
          }
        }

        if (productId && !resolvedImage) {
          const imgRes = await client.query(
            `SELECT url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1`,
            [productId]
          );
          if (imgRes.rows.length > 0) {
            resolvedImage = imgRes.rows[0].url;
          }
        }

        if (!resolvedImage) {
          resolvedImage = '/no-image.svg';
        }

        await client.query(
          `INSERT INTO invoice_items (invoice_id, product_id, catalogue_ref, description, tech_spec, quantity, unit_price, tax_type, tax_value, tax_amount, total_price, item_image)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, productId, item.catalogue_ref || null, item.description,
            item.tech_spec || null, item.quantity, item.unit_price, item.tax_type, item.tax_value,
            lineTax, lineTotal + lineTax, resolvedImage]
        );
      }

      // Inventory Deduction Logic
      const shouldDeduct = parsed.payment_status === 'paid' || parsed.order_type === 'delivery_note';
      const prevInvoice = await client.query('SELECT inventory_deducted, order_type, payment_status, invoice_number FROM invoices WHERE id = $1', [id]);
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

      // Add audit log record for this edit
      let detailsMsg = 'Order details updated';
      let actionType = 'INVOICE_UPDATE';

      if (parsed.order_type !== current.order_type) {
        detailsMsg = `Converted document ${current.invoice_number} from ${current.order_type} to ${parsed.order_type} (New Document No: ${newInvoiceNumber})`;
        actionType = 'INVOICE_CONVERT';
      } else if (parsed.payment_status !== current.payment_status) {
        detailsMsg = `Status set to ${parsed.payment_status}`;
        actionType = 'STATUS_CHANGE';
      }

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, 'invoices', $2, $3, $4)`,
        [actionType, id, detailsMsg, locals.user?.id || null]
      );

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

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
    const data = await request.json();
    if (data.payment_status) {
      const validStatuses = ['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft'];
      if (!validStatuses.includes(data.payment_status)) {
        return new Response(JSON.stringify({ error: 'Invalid payment status' }), { status: 400 });
      }

      await withTransaction(async (client) => {
        await client.query('UPDATE invoices SET payment_status = $1, updated_at = NOW() WHERE id = $2', [data.payment_status, id]);
        
        if (data.payment_status === 'cancelled') {
          const invCheck = await client.query('SELECT inventory_deducted FROM invoices WHERE id = $1', [id]);
          if (invCheck.rows[0]?.inventory_deducted) {
            const itemsRes = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL', [id]);
            for (const item of itemsRes.rows) {
              const stockRes = await client.query('SELECT id, stock_level FROM inventory WHERE product_id = $1 FOR UPDATE', [item.product_id]);
              if (stockRes.rows.length > 0) {
                const inv = stockRes.rows[0];
                const newStock = inv.stock_level + item.quantity;
                await client.query('UPDATE inventory SET stock_level = $1, updated_at = NOW() WHERE id = $2', [newStock, inv.id]);
                await client.query(`
                  INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
                  VALUES ($1, $2, $3, $4, 'order cancelled', $5)
                `, [inv.id, item.quantity, inv.stock_level, newStock, locals.user?.id || null]);
              }
            }
            await client.query('UPDATE invoices SET inventory_deducted = false WHERE id = $1', [id]);
          }
        }
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.order_type) {
      const currentRes = await query('SELECT order_type, invoice_number FROM invoices WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
      }
      const current = currentRes.rows[0];
      const oldType = current.order_type;
      let newInvoiceNumber = current.invoice_number;

      if (data.order_type === 'quotation') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'EST-');
      } else if (data.order_type === 'lpo' || data.order_type === 'proforma') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'PRO-');
      } else if (data.order_type === 'delivery_note') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'DLN-');
      } else {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN)-/, 'INV-');
      }

      await withTransaction(async (client) => {
        await client.query(
          'UPDATE invoices SET order_type = $1, invoice_number = $2, updated_at = NOW() WHERE id = $3',
          [data.order_type, newInvoiceNumber, id]
        );
        
        const detailsMsg = `Converted document ${current.invoice_number} from ${oldType} to ${data.order_type} (New Document No: ${newInvoiceNumber})`;
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ('INVOICE_CONVERT', 'invoices', $1, $2, $3)`,
          [id, detailsMsg, locals.user?.id || null]
        );
      });

      return new Response(JSON.stringify({ success: true, invoice_number: newInvoiceNumber }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.is_archived !== undefined) {
      await query('UPDATE invoices SET is_archived = $1, updated_at = NOW() WHERE id = $2', [data.is_archived, id]);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.is_deleted !== undefined) {
      await withTransaction(async (client) => {
        await client.query('UPDATE invoices SET is_deleted = $1, updated_at = NOW() WHERE id = $2', [data.is_deleted, id]);
        
        if (data.is_deleted === true) {
          const invCheck = await client.query('SELECT inventory_deducted FROM invoices WHERE id = $1', [id]);
          if (invCheck.rows[0]?.inventory_deducted) {
            const itemsRes = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL', [id]);
            for (const item of itemsRes.rows) {
              const stockRes = await client.query('SELECT id, stock_level FROM inventory WHERE product_id = $1 FOR UPDATE', [item.product_id]);
              if (stockRes.rows.length > 0) {
                const inv = stockRes.rows[0];
                const newStock = inv.stock_level + item.quantity;
                await client.query('UPDATE inventory SET stock_level = $1, updated_at = NOW() WHERE id = $2', [newStock, inv.id]);
                await client.query(`
                  INSERT INTO inventory_logs (inventory_id, change_amount, previous_stock, new_stock, reason, user_id)
                  VALUES ($1, $2, $3, $4, 'order deleted', $5)
                `, [inv.id, item.quantity, inv.stock_level, newStock, locals.user?.id || null]);
              }
            }
            await client.query('UPDATE invoices SET inventory_deducted = false WHERE id = $1', [id]);
          }
        }
      });
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
