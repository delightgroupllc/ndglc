import type { APIRoute } from 'astro';
import { pool, query, withTransaction } from '../../../lib/db';
import { z } from 'zod';
import { optimizeAndSaveImage } from '../../../lib/imageOptimizer';
import { createSanitizedOrderSnapshot } from '../../../lib/auditSnapshot';

const itemSchema = z.object({
  description: z.string().min(1, 'Item name is required'),
  product_id: z.string().optional().nullable(),
  catalogue_ref: z.string().optional().nullable(),
  tech_spec: z.string().optional().nullable(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Unit price cannot be negative'),
  tax_type: z.enum(['percentage', 'fixed']).default('percentage'),
  tax_value: z.number().min(0).default(5),
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
  order_type: z.enum(['standard', 'quotation', 'proforma', 'service', 'recurring', 'lpo', 'tax_invoice', 'inquiry', 'delivery_note', 'sample_order', 'commercial_invoice', 'payment']).default('standard'),
  source_division: z.enum(['DTL', 'DGS', 'both']).optional().nullable(),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional().nullable().or(z.literal('')),
  signatory_incharge: z.string().min(1, 'Signatory Incharge is required'),
  payment_status: z.enum(['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft']).default('unpaid'),
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

    const res = await query(`
      SELECT i.*,
        (SELECT JSON_AGG(it ORDER BY it.id) FROM (SELECT * FROM invoice_items WHERE invoice_id = i.id) it) as items_list
      FROM invoices i
      WHERE i.id = $1
    `, [id]);

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

    const updated = await withTransaction(async (client) => {
      const currentRes = await client.query('SELECT order_type, invoice_number, payment_status FROM invoices WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        throw new Error('Invoice not found');
      }
      const current = currentRes.rows[0];

      let newInvoiceNumber = current.invoice_number;
      if (parsed.order_type !== current.order_type) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        let prefix = 'INV';
        if (parsed.order_type === 'quotation') prefix = 'EST';
        else if (parsed.order_type === 'lpo' || parsed.order_type === 'proforma') prefix = 'PRO';
        else if (parsed.order_type === 'delivery_note') prefix = 'DLN';
        else if (parsed.order_type === 'sample_order') prefix = 'SMP';
        newInvoiceNumber = `${prefix}-${new Date().getFullYear()}-${rand}`;
      }

      // Upsert company
      let companyId = null;
      if (parsed.company_name) {
        const checkComp = await client.query('SELECT id FROM companies WHERE name = $1', [parsed.company_name]);
        if (checkComp.rowCount > 0) {
          companyId = checkComp.rows[0].id;
          await client.query(
            `UPDATE companies SET
               vat_number = COALESCE($1, vat_number),
               billing_address = COALESCE($2, billing_address),
               shipping_address = COALESCE($3, shipping_address)
             WHERE id = $4`,
            [parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null, companyId]
          );
        } else {
          let compCode = null;
          const codesRes = await client.query("SELECT code FROM companies WHERE code LIKE 'COM-%'");
          let max = 1000;
          codesRes.rows.forEach(r => {
            const num = parseInt(r.code.replace('COM-', ''), 10);
            if (!isNaN(num) && num > max) max = num;
          });
          compCode = `COM-${max + 1}`;
          const compRes = await client.query(
            `INSERT INTO companies (name, vat_number, billing_address, shipping_address, code)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [parsed.company_name, parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null, compCode]
          );
          companyId = compRes.rows[0].id;
        }
      }

      // Upsert customer
      await client.query(
        `INSERT INTO customers (name, email, phone, company_name, company_id, company_vat, billing_address, shipping_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, customers.email),
            phone = COALESCE(EXCLUDED.phone, customers.phone),
            company_name = COALESCE(EXCLUDED.company_name, customers.company_name),
            company_id = COALESCE(EXCLUDED.company_id, customers.company_id),
            company_vat = COALESCE(EXCLUDED.company_vat, customers.company_vat),
            billing_address = COALESCE(EXCLUDED.billing_address, customers.billing_address),
            shipping_address = COALESCE(EXCLUDED.shipping_address, customers.shipping_address)`,
        [parsed.customer_name, parsed.customer_email || null, parsed.customer_phone || null, parsed.company_name || null, companyId, parsed.company_vat || null, parsed.billing_address || null, parsed.shipping_address || null]
      );

      const res = await client.query(
        `UPDATE invoices SET
          invoice_number = $1, customer_name = $2, customer_email = $3, customer_phone = $4,
          company_name = $5, company_vat = $6, billing_address = $7, shipping_address = $8,
          order_type = $9, source_division = $10, issue_date = $11, due_date = $12,
          subtotal = $13, gst_amount = $14, discount_type = $15, discount_value = $16,
          discount_amount = $17, total_amount = $18, payment_status = $19, internal_notes = $20,
          show_images = $21, lpo_number = $22, payment_terms = $23, signatory_incharge = $24,
          updated_at = NOW()
        WHERE id = $25 RETURNING *`,
        [newInvoiceNumber, parsed.customer_name, parsed.customer_email || null,
         parsed.customer_phone || null, parsed.company_name || null, parsed.company_vat || null,
         parsed.billing_address || null, parsed.shipping_address || null,
         parsed.order_type, parsed.source_division || null,
         parsed.issue_date, parsed.due_date || parsed.issue_date,
         subtotal, totalTax, parsed.discount_type, parsed.discount_value, discount, total_amount, parsed.payment_status,
         parsed.internal_notes || null, parsed.show_images, parsed.lpo_number || null, parsed.payment_terms || null,
         parsed.signatory_incharge, id]
      );

      // Recreate invoice items
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

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

        let productId = item.product_id;
        let resolvedImage = null;

        if (productId) {
          const verifyRes = await client.query('SELECT sku FROM products WHERE id = $1', [productId]);
          if (verifyRes.rows.length > 0) {
            const dbSku = verifyRes.rows[0].sku || '';
            const itemSku = (item.catalogue_ref || '').trim();
            if (itemSku && dbSku.toLowerCase() !== itemSku.toLowerCase()) {
              productId = null;
            }
          } else {
            productId = null;
          }
        }

        if (!productId) {
          let matchedProd = null;
          if (item.catalogue_ref) {
            const pSku = await client.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1', [item.catalogue_ref]);
            if (pSku.rows.length > 0) matchedProd = pSku.rows[0];
          } else {
            const pName = await client.query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) LIMIT 1', [item.description]);
            if (pName.rows.length > 0) matchedProd = pName.rows[0];
          }

          if (matchedProd) {
            productId = matchedProd.id;
          } else {
            const divRes = await client.query("SELECT id FROM divisions ORDER BY name ASC LIMIT 1");
            const catRes = await client.query("SELECT id FROM categories ORDER BY name ASC LIMIT 1");
            const divisionId = divRes.rows[0]?.id || null;
            const categoryId = catRes.rows[0]?.id || null;

            const sku = item.catalogue_ref || `PROD-${Math.floor(100000 + Math.random() * 900000)}`;
            let slug = item.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Math.floor(100000 + Math.random() * 900000)}`;
            if (item.catalogue_ref) {
              const cleanSku = item.catalogue_ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              slug = `${slug}-${cleanSku}`;
            } else {
              slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
            }

            const insProdRes = await client.query(
              `INSERT INTO products (category_id, division_id, name, sku, slug, description, specifications, featured, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [categoryId, divisionId, item.description, sku.toUpperCase(), slug, 'Auto-created from invoice', '[]', false, 'active']
            );
            productId = insProdRes.rows[0].id;

            await client.query(
              `INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold)
               VALUES ($1, 0, (SELECT id FROM warehouses ORDER BY name ASC LIMIT 1), 10)`,
              [productId]
            );
          }
        }

        if (productId) {
          const checkImgRes = await client.query('SELECT image_url FROM products WHERE id = $1', [productId]);
          if (checkImgRes.rows.length > 0 && !checkImgRes.rows[0].image_url) {
            const itemImg = item.item_image || item.image; // check both properties just in case
            if (itemImg && itemImg.startsWith('data:image/')) {
              try {
                await client.query(
                  `INSERT INTO product_images (product_id, url, is_primary) VALUES ($1, $2, true)`,
                  [productId, itemImg]
                );
                await client.query(
                  `UPDATE products SET image_url = $1 WHERE id = $2`,
                  [itemImg, productId]
                );
              } catch (imgErr) {
                console.error('Error copying existing image to product:', imgErr);
              }
            }
          }
        }

        if (item.image_base64 && productId) {
          try {
            resolvedImage = await optimizeAndSaveImage(item.image_base64, productId);
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
      const shouldDeduct = parsed.payment_status === 'paid' || parsed.order_type === 'delivery_note' || parsed.order_type === 'sample_order';
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
      let detailsMsg = `Updated details of document ${current.invoice_number}`;
      let actionType = 'INVOICE_UPDATE';

      if (parsed.order_type !== current.order_type) {
        detailsMsg = `Converted document ${current.invoice_number} from ${current.order_type} to ${parsed.order_type} (New Document No: ${newInvoiceNumber})`;
        actionType = 'INVOICE_CONVERT';
      } else if (parsed.payment_status !== current.payment_status) {
        detailsMsg = `Status of document ${current.invoice_number} set to ${parsed.payment_status}`;
        actionType = 'STATUS_CHANGE';
      }

      const snapshot = createSanitizedOrderSnapshot(res.rows[0], parsed.items);

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
         VALUES ($1, 'invoices', $2, $3, $4, $5)`,
        [actionType, id, detailsMsg, locals.user?.id || null, JSON.stringify(snapshot)]
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
        const currentRes = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) throw new Error('Invoice not found');
        const current = currentRes.rows[0];

        const updatedInvRes = await client.query('UPDATE invoices SET payment_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [data.payment_status, id]);
        const updatedInv = updatedInvRes.rows[0];
        
        if (data.payment_status === 'cancelled') {
          if (current.inventory_deducted) {
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

        const itemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
        const snapshot = createSanitizedOrderSnapshot(updatedInv, itemsRes.rows);

        const detailsMsg = `Status of document ${current.invoice_number} set to ${data.payment_status}`;
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
           VALUES ('STATUS_CHANGE', 'invoices', $1, $2, $3, $4)`,
          [id, detailsMsg, locals.user?.id || null, JSON.stringify(snapshot)]
        );
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    
    if (data.order_type) {
      const currentRes = await query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
      }
      const current = currentRes.rows[0];
      const oldType = current.order_type;
      let newInvoiceNumber = current.invoice_number;

      if (data.order_type === 'quotation') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN|SMP)-/, 'EST-');
      } else if (data.order_type === 'lpo' || data.order_type === 'proforma') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN|SMP)-/, 'PRO-');
      } else if (data.order_type === 'delivery_note') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN|SMP)-/, 'DLN-');
      } else if (data.order_type === 'sample_order') {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN|SMP)-/, 'SMP-');
      } else {
        newInvoiceNumber = newInvoiceNumber.replace(/^(INV|EST|PRO|DLN|SMP)-/, 'INV-');
      }

      await withTransaction(async (client) => {
        const updateRes = await client.query(
          'UPDATE invoices SET order_type = $1, invoice_number = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
          [data.order_type, newInvoiceNumber, id]
        );
        
        const itemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
        const snapshot = createSanitizedOrderSnapshot(updateRes.rows[0], itemsRes.rows);

        const detailsMsg = `Converted document ${current.invoice_number} from ${oldType} to ${data.order_type} (New Document No: ${newInvoiceNumber})`;
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
           VALUES ('INVOICE_CONVERT', 'invoices', $1, $2, $3, $4)`,
          [id, detailsMsg, locals.user?.id || null, JSON.stringify(snapshot)]
        );
      });

      return new Response(JSON.stringify({ success: true, invoice_number: newInvoiceNumber }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (data.is_archived !== undefined) {
      const currentRes = await query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
      }
      const current = currentRes.rows[0];

      const updateRes = await query('UPDATE invoices SET is_archived = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [data.is_archived, id]);
      const itemsRes = await query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
      const snapshot = createSanitizedOrderSnapshot(updateRes.rows[0], itemsRes.rows);

      const actionText = data.is_archived ? 'Archived' : 'Restored from archive';
      const detailsMsg = `${actionText} document ${current.invoice_number}`;
      await query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
         VALUES ($1, 'invoices', $2, $3, $4, $5)`,
        [data.is_archived ? 'INVOICE_ARCHIVE' : 'INVOICE_RESTORE', id, detailsMsg, locals.user?.id || null, JSON.stringify(snapshot)]
      );

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (data.is_deleted !== undefined) {
      await withTransaction(async (client) => {
        const currentRes = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) throw new Error('Invoice not found');
        const current = currentRes.rows[0];

        const updateRes = await client.query('UPDATE invoices SET is_deleted = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [data.is_deleted, id]);
        
        if (data.is_deleted === true) {
          if (current.inventory_deducted) {
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

        const itemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
        const snapshot = createSanitizedOrderSnapshot(updateRes.rows[0], itemsRes.rows);

        const actionText = data.is_deleted ? 'Moved to Trash' : 'Restored from Trash';
        const detailsMsg = `${actionText} document ${current.invoice_number}`;
        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
           VALUES ($1, 'invoices', $2, $3, $4, $5)`,
          [data.is_deleted ? 'INVOICE_TRASH' : 'INVOICE_RESTORE', id, detailsMsg, locals.user?.id || null, JSON.stringify(snapshot)]
        );
      });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Field not provided' }), { status: 400 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const id = params.id;
    if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Fetch full order & items before permanent deletion to preserve complete snapshot
      const currentRes = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
      }
      const invoiceData = currentRes.rows[0];
      const itemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
      const itemsData = itemsRes.rows;
      const snapshot = createSanitizedOrderSnapshot(invoiceData, itemsData);

      await client.query('DELETE FROM invoices WHERE id = $1', [id]);

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
         VALUES ('INVOICE_DELETE', 'invoices', $1, $2, $3, $4)`,
        [id, `Permanently deleted document ${invoiceData.invoice_number} (Customer: ${invoiceData.customer_name}, Total: ${invoiceData.total_amount})`, locals.user?.id || null, JSON.stringify(snapshot)]
      );

      await client.query('COMMIT');
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
