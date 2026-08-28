import type { APIRoute } from 'astro';
import { withTransaction } from '../../../lib/db';
import { createSanitizedOrderSnapshot } from '../../../lib/auditSnapshot';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const snapshot = body.snapshot;
    const targetLocation = body.targetLocation === 'bin' ? 'bin' : 'active';
    const isDeleted = targetLocation === 'bin';

    if (!snapshot || !snapshot.customer_name) {
      return new Response(JSON.stringify({ error: 'Valid snapshot data is required' }), { status: 400 });
    }

    const restoredInvoice = await withTransaction(async (client) => {
      // Manage Duplication with clean -REC, -REC-01, -REC-02 sequential suffixes
      const origInvoiceNumber = snapshot.invoice_number || 'DOC-ORDER';
      const baseNo = origInvoiceNumber.replace(/-REC(-\d+)?$/, '');

      const existingLike = await client.query(
        "SELECT invoice_number FROM invoices WHERE invoice_number = $1 OR invoice_number LIKE $2",
        [baseNo, `${baseNo}-REC%`]
      );
      const existingNums = new Set(existingLike.rows.map((r: any) => r.invoice_number));

      let newInvoiceNumber = `${baseNo}-REC`;
      if (existingNums.has(newInvoiceNumber)) {
        let counter = 1;
        while (existingNums.has(`${baseNo}-REC-${String(counter).padStart(2, '0')}`)) {
          counter++;
        }
        newInvoiceNumber = `${baseNo}-REC-${String(counter).padStart(2, '0')}`;
      }

      const subtotal = Number(snapshot.subtotal) || 0;
      const taxAmount = Number(snapshot.tax_amount) || 0;
      const discountAmount = Number(snapshot.discount_amount) || 0;
      const totalAmount = Number(snapshot.total_amount) || 0;

      let pTerms = snapshot.payment_terms || null;
      if (typeof pTerms !== 'string' && pTerms !== null) {
        pTerms = JSON.stringify(pTerms);
      }

      const destinationLabel = isDeleted ? 'Bin (Trash)' : 'Active Orders';
      const recoveryTimestamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const auditDisclaimer = `[AUDIT RECOVERY]: Restored on ${recoveryTimestamp} to ${destinationLabel}. Original Reference Document: ${baseNo}. Immutable audit snapshot preserved.`;

      const insertRes = await client.query(
        `INSERT INTO invoices (
          invoice_number, customer_name, customer_email, customer_phone, 
          company_name, company_vat, billing_address, shipping_address, 
          order_type, source_division, issue_date, due_date, 
          signatory_incharge, payment_status, discount_type, discount_value, 
          subtotal, gst_amount, discount_amount, total_amount, 
          internal_notes, show_images, lpo_number, payment_terms, quotation_ref, is_deleted
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING *`,
        [
          newInvoiceNumber,
          snapshot.customer_name,
          snapshot.customer_email || null,
          snapshot.customer_phone || null,
          snapshot.company_name || null,
          snapshot.trn_number || null,
          snapshot.billing_address || null,
          snapshot.shipping_address || null,
          snapshot.order_type || 'standard',
          snapshot.source_division || 'DTL',
          new Date().toISOString().split('T')[0],
          snapshot.due_date ? String(snapshot.due_date).split('T')[0] : null,
          snapshot.signatory_incharge || 'Authorized Signatory',
          'draft',
          'fixed',
          0,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          snapshot.notes ? `${auditDisclaimer} | Note: ${snapshot.notes}` : auditDisclaimer,
          false,
          snapshot.lpo_number || null,
          pTerms,
          snapshot.quotation_ref || `Ref: ${baseNo}`,
          isDeleted
        ]
      );
      const newInv = insertRes.rows[0];

      const items = snapshot.items || [];
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items (
            invoice_id, product_id, catalogue_ref, description, tech_spec, 
            quantity, unit_price, tax_type, tax_value, tax_amount, total_price
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            newInv.id,
            item.product_id || null,
            item.catalogue_ref || null,
            item.description || 'Restored Item',
            item.tech_spec || null,
            Number(item.quantity) || 1,
            Number(item.unit_price) || 0,
            item.tax_type || 'percentage',
            Number(item.tax_value) || 5,
            Number(item.tax_amount) || 0,
            Number(item.total_price) || 0
          ]
        );
      }

      const newSnapshot = createSanitizedOrderSnapshot(newInv, items);
      await client.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id, snapshot)
         VALUES ($1, 'invoices', $2, $3, $4, $5)`,
        [
          'INVOICE_RESTORE_AUDIT',
          newInv.id,
          `Restored document ${newInv.invoice_number} to ${destinationLabel} from audit snapshot of ${baseNo}`,
          locals.user?.id || null,
          JSON.stringify(newSnapshot)
        ]
      );

      return { ...newInv, targetLocation };
    });

    return new Response(JSON.stringify({ success: true, invoice: restoredInvoice, targetLocation }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Failed to restore invoice from audit snapshot:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
};
