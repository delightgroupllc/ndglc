import type { APIRoute } from 'astro';
import { query, withTransaction, exportTableAsCSV } from '../../../lib/db';
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
  payment_status: z.enum(['paid', 'partially_paid', 'unpaid', 'overdue', 'cancelled', 'draft']).default('unpaid'),
  discount_type: z.enum(['percentage', 'fixed']).default('fixed'),
  discount_value: z.number().min(0).default(0),
  internal_notes: z.string().optional(),
  lpo_number: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  bypassDuplicateCheck: z.boolean().optional(),
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();

    if (data.duplicateFrom) {
      const sourceId = data.duplicateFrom;
      const invRes = await query('SELECT * FROM invoices WHERE id = $1', [sourceId]);
      if (invRes.rows.length === 0) {
        return new Response(JSON.stringify({ error: 'Source invoice not found' }), { status: 404 });
      }
      const sourceInv = invRes.rows[0];

      const itemsRes = await query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC', [sourceId]);
      const sourceItems = itemsRes.rows;

      const baseInvoiceNo = sourceInv.invoice_number.split('-DUP-')[0];
      const dupCountRes = await query(
        `SELECT invoice_number FROM invoices WHERE invoice_number = $1 OR invoice_number LIKE $2`,
        [baseInvoiceNo, `${baseInvoiceNo}-DUP-%`]
      );
      
      let nextSuffix = 1;
      dupCountRes.rows.forEach((row: any) => {
        const parts = row.invoice_number.split('-DUP-');
        if (parts.length > 1) {
          const suffixNum = parseInt(parts[1], 10);
          if (!isNaN(suffixNum) && suffixNum >= nextSuffix) {
            nextSuffix = suffixNum + 1;
          }
        }
      });
      const newInvoiceNumber = `${baseInvoiceNo}-DUP-${String(nextSuffix).padStart(2, '0')}`;

      const duplicateInvoice = await withTransaction(async (client) => {
        const insertRes = await client.query(
          `INSERT INTO invoices (
            invoice_number, customer_name, customer_email, customer_phone, company_name, company_vat,
            billing_address, shipping_address, order_type, source_division,
            issue_date, due_date, subtotal, gst_amount, discount_type, discount_value, discount_amount, total_amount,
            payment_status, internal_notes, show_images, lpo_number, payment_terms, signatory_incharge
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
          RETURNING *`,
          [
            newInvoiceNumber, sourceInv.customer_name, sourceInv.customer_email || null,
            sourceInv.customer_phone || null, sourceInv.company_name || null, sourceInv.company_vat || null,
            sourceInv.billing_address || null, sourceInv.shipping_address || null,
            sourceInv.order_type, sourceInv.source_division || null,
            sourceInv.issue_date, sourceInv.due_date,
            sourceInv.subtotal, sourceInv.gst_amount, sourceInv.discount_type, sourceInv.discount_value, sourceInv.discount_amount, sourceInv.total_amount,
            'draft',
            sourceInv.internal_notes || null, sourceInv.show_images, sourceInv.lpo_number || null, sourceInv.payment_terms || null, sourceInv.signatory_incharge || null
          ]
        );
        const newInv = insertRes.rows[0];

        for (const item of sourceItems) {
          await client.query(
            `INSERT INTO invoice_items (invoice_id, product_id, catalogue_ref, description, tech_spec, quantity, unit_price, tax_type, tax_value, tax_amount, total_price, item_image)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              newInv.id, item.product_id || null, item.catalogue_ref || null, item.description,
              item.tech_spec || null, item.quantity, item.unit_price, item.tax_type, item.tax_value,
              item.tax_amount, item.total_price, item.item_image
            ]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
           VALUES ($1, $2, $3, $4, $5)`,
          ['INVOICE_DUPLICATE', 'invoices', newInv.id, `Duplicated order from reference document ${sourceInv.invoice_number} (New Document: ${newInv.invoice_number})`, locals.user?.id || null]
        );

        return newInv;
      });

      return new Response(JSON.stringify(duplicateInvoice), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

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

    if (!data.bypassDuplicateCheck) {
      const today = new Date().toISOString().split('T')[0];
      const dupInvoiceRes = await query(
        `SELECT id, invoice_number FROM invoices 
         WHERE customer_name = $1 
         AND total_amount = $2 
         AND issue_date = $3 
         AND is_deleted = false 
         LIMIT 1`,
        [parsed.customer_name, total_amount, parsed.issue_date || today]
      );
      if (dupInvoiceRes.rows.length > 0) {
        return new Response(JSON.stringify({ 
          duplicateWarning: true, 
          error: `An identical invoice (${dupInvoiceRes.rows[0].invoice_number}) was already created today for ${parsed.customer_name} with total ${total_amount}. Do you want to proceed anyway?` 
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const rand = Math.floor(1000 + Math.random() * 9000);
    let prefix = 'INV';
    if (parsed.order_type === 'quotation') prefix = 'EST';
    else if (parsed.order_type === 'lpo' || parsed.order_type === 'proforma') prefix = 'PRO';
    else if (parsed.order_type === 'delivery_note') prefix = 'DLN';
    const invoice_number = `${prefix}-${new Date().getFullYear()}-${rand}`;

    // ACID transaction
    const invoice = await withTransaction(async (client) => {
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
          // Generate unique company code
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

      const invRes = await client.query(
        `INSERT INTO invoices (
          invoice_number, customer_name, customer_email, customer_phone, company_name, company_vat,
          billing_address, shipping_address, order_type, source_division,
          issue_date, due_date, subtotal, gst_amount, discount_type, discount_value, discount_amount, total_amount,
          payment_status, internal_notes, show_images, lpo_number, payment_terms, signatory_incharge
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        RETURNING *`,
        [invoice_number, parsed.customer_name, parsed.customer_email || null,
         parsed.customer_phone || null, parsed.company_name || null, parsed.company_vat || null,
         parsed.billing_address || null, parsed.shipping_address || null,
         parsed.order_type, parsed.source_division || null,
         parsed.issue_date, parsed.due_date || parsed.issue_date,
         subtotal, totalTax, parsed.discount_type, parsed.discount_value, discount, total_amount, parsed.payment_status,
         parsed.internal_notes || null, parsed.show_images, parsed.lpo_number || null, parsed.payment_terms || null,
         parsed.signatory_incharge]
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

        // Dynamically resolve product
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
            // Auto-create product
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

            // Initialize inventory row
            await client.query(
              `INSERT INTO inventory (product_id, stock_level, warehouse_id, low_stock_threshold)
               VALUES ($1, 0, (SELECT id FROM warehouses ORDER BY name ASC LIMIT 1), 10)`,
              [productId]
            );

          }
        } // Close if (!productId)

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
          [inv.id, productId, item.catalogue_ref || null, item.description,
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

      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['CREATE', 'invoices', inv.id, `Created document ${inv.invoice_number} for customer ${inv.customer_name} (Order Type: ${inv.order_type}, Total: ${inv.total_amount})`, locals.user?.id || null]
      );

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
