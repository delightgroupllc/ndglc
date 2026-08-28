/**
 * Utility helper to build sanitized, lightweight JSON snapshots of orders
 * for immutable audit trail retention.
 * Strictly excludes massive Base64 image strings to keep database storage tiny.
 */
export function createSanitizedOrderSnapshot(invoice: any, items: any[] = []) {
  if (!invoice) return null;

  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    order_type: invoice.order_type,
    source_division: invoice.source_division || 'DTL',
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email || '',
    customer_phone: invoice.customer_phone || '',
    trn_number: invoice.trn_number || '',
    company_name: invoice.company_name || '',
    currency: invoice.currency || 'AED',
    subtotal: Number(invoice.subtotal) || 0,
    tax_amount: Number(invoice.tax_amount) || 0,
    discount_amount: Number(invoice.discount_amount) || 0,
    total_amount: Number(invoice.total_amount) || 0,
    payment_status: invoice.payment_status || 'unpaid',
    payment_terms: invoice.payment_terms || '',
    lpo_number: invoice.lpo_number || '',
    signatory_incharge: invoice.signatory_incharge || '',
    due_date: invoice.due_date || null,
    issue_date: invoice.issue_date || invoice.created_at || new Date().toISOString(),
    notes: invoice.notes || '',
    internal_notes: invoice.internal_notes || '',
    items_count: items?.length || 0,
    items: (items || []).map((item: any) => ({
      product_id: item.product_id || null,
      catalogue_ref: item.catalogue_ref || null,
      description: item.description || '',
      tech_spec: item.tech_spec || null,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      tax_type: item.tax_type || 'percentage',
      tax_value: Number(item.tax_value) || 5,
      tax_amount: Number(item.tax_amount) || 0,
      total_price: Number(item.total_price) || 0,
      has_image: Boolean(item.item_image)
    }))
  };
}
