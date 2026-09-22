import { query } from './db';

export interface AuditEvent {
  id: string;
  type: 'origin' | 'source' | 'convert' | 'status' | 'update' | 'payment' | 'archive' | 'current';
  title: string;
  description: string;
  timestamp: string | null;
  formattedTime: string;
  user?: string;
  badgeColor?: string;
}

export interface InvoiceAuditTrailResult {
  success: boolean;
  invoice_id: string;
  invoice_number: string;
  current_status: string;
  order_type: string;
  timeline: string[];
  events: AuditEvent[];
}

/**
 * Formats a Date object or ISO string into `YYYY-MM-DD HH:mm` in Asia/Dubai timezone.
 */
export function formatAuditTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(dt);

    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const min = parts.find(p => p.type === 'minute')?.value;
    return `${y}-${m}-${day} ${hour}:${min}`;
  } catch (e) {
    // Fallback if timezone not supported
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }
}

/**
 * Retrieve comprehensive order audit trail from source origin, duplication,
 * stage conversions, status updates, to current status.
 */
export async function getInvoiceAuditTrail(invoiceIdOrNum: string): Promise<InvoiceAuditTrailResult> {
  // 1. Fetch Invoice
  const invRes = await query(
    `SELECT id, invoice_number, order_type, payment_status, quotation_ref, issue_date, created_at, updated_at
     FROM invoices
     WHERE id::text = $1 OR invoice_number = $1
     LIMIT 1`,
    [invoiceIdOrNum]
  );

  if (invRes.rows.length === 0) {
    throw new Error(`Invoice '${invoiceIdOrNum}' not found`);
  }

  const inv = invRes.rows[0];
  const invoiceId = inv.id;
  const currentNum = inv.invoice_number;
  const currentStatus = inv.payment_status || 'draft';
  const currentOrderType = inv.order_type || 'standard';

  // 2. Fetch all audit logs for this invoice
  const logsRes = await query(
    `SELECT al.id, al.action, al.entity_id, al.details, al.timestamp, al.user_id,
            COALESCE(u.name, 'System') as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.entity_type = 'invoices'
       AND (al.entity_id = $1 OR al.entity_id = $2)
     ORDER BY al.timestamp ASC`,
    [invoiceId, currentNum]
  );
  const logs = logsRes.rows;

  // 3. Fetch any payment transactions
  const transRes = await query(
    `SELECT t.id, t.amount, t.payment_method, t.transaction_ref, t.transaction_date, t.created_at,
            t.notes, COALESCE(t.recorded_by, 'System') as recorded_by
     FROM transactions t
     WHERE t.invoice_id = $1
     ORDER BY t.transaction_date ASC, t.created_at ASC`,
    [invoiceId]
  );
  const transactions = transRes.rows;

  const events: AuditEvent[] = [];
  const timeline: string[] = [];

  // 4. Determine Source Track (Duplication or Initial Creation)
  const dupLog = logs.find((l: any) => l.action === 'INVOICE_DUPLICATE' || (l.details && l.details.toLowerCase().includes('duplicated order from reference document')));
  
  if (dupLog) {
    // Extract source reference number from log details: e.g. "Duplicated order from reference document EST-2026-3675 (New Document: EST-2026-3675-DUP-01)"
    const match = dupLog.details.match(/reference document\s+([A-Za-z0-9\-_]+)/i);
    const initialDocMatch = dupLog.details.match(/\(New Document:\s*([A-Za-z0-9\-_]+)\)/i);
    const sourceRef = match ? match[1] : null;
    const initialDoc = initialDocMatch ? initialDocMatch[1] : null;

    if (sourceRef) {
      // Check if source reference document exists in DB
      const sourceDocRes = await query(
        `SELECT id, invoice_number, order_type, payment_status, created_at, issue_date
         FROM invoices
         WHERE invoice_number = $1 LIMIT 1`,
        [sourceRef]
      );
      if (sourceDocRes.rows.length > 0) {
        const srcDoc = sourceDocRes.rows[0];
        const originTime = formatAuditTime(srcDoc.created_at || srcDoc.issue_date);
        const originTitle = 'Origin Reference';
        const originDesc = `${srcDoc.invoice_number} created as ${srcDoc.order_type.toUpperCase()}`;
        events.push({
          id: `origin-${srcDoc.id}`,
          type: 'origin',
          title: originTitle,
          description: originDesc,
          timestamp: srcDoc.created_at || srcDoc.issue_date,
          formattedTime: originTime,
          user: 'System',
          badgeColor: 'purple'
        });
        timeline.push(`✦ [${originTime}] - ${originTitle}: ${originDesc}`);
      }
    }

    // Add duplication source event
    const dupTime = formatAuditTime(dupLog.timestamp);
    const dupTitle = 'Order Source';
    const dupDesc = sourceRef
      ? `Duplicated from reference document ${sourceRef}${initialDoc ? ` (Initial Doc: ${initialDoc})` : ''}`
      : (dupLog.details || 'Duplicated order created');

    events.push({
      id: dupLog.id,
      type: 'source',
      title: dupTitle,
      description: dupDesc,
      timestamp: dupLog.timestamp,
      formattedTime: dupTime,
      user: dupLog.user_name,
      badgeColor: 'blue'
    });
    timeline.push(`✦ [${dupTime}] - ${dupTitle}: ${dupDesc}`);
  } else if (currentNum.includes('-DUP-')) {
    // Invoice number has -DUP- but no explicit INVOICE_DUPLICATE log
    const baseRef = currentNum.split('-DUP-')[0];
    const sourceDocRes = await query(
      `SELECT id, invoice_number, order_type, created_at, issue_date FROM invoices WHERE invoice_number = $1 LIMIT 1`,
      [baseRef]
    );

    if (sourceDocRes.rows.length > 0) {
      const srcDoc = sourceDocRes.rows[0];
      const originTime = formatAuditTime(srcDoc.created_at || srcDoc.issue_date);
      const originTitle = 'Origin Reference';
      const originDesc = `${srcDoc.invoice_number} created as ${srcDoc.order_type.toUpperCase()}`;
      events.push({
        id: `origin-${srcDoc.id}`,
        type: 'origin',
        title: originTitle,
        description: originDesc,
        timestamp: srcDoc.created_at || srcDoc.issue_date,
        formattedTime: originTime,
        user: 'System',
        badgeColor: 'purple'
      });
      timeline.push(`✦ [${originTime}] - ${originTitle}: ${originDesc}`);
    }

    const dupTime = formatAuditTime(inv.created_at || inv.issue_date);
    const dupTitle = 'Order Source';
    const dupDesc = `Duplicated from reference document ${baseRef} (Document: ${currentNum})`;
    events.push({
      id: `source-${inv.id}`,
      type: 'source',
      title: dupTitle,
      description: dupDesc,
      timestamp: inv.created_at || inv.issue_date,
      formattedTime: dupTime,
      user: 'System',
      badgeColor: 'blue'
    });
    timeline.push(`✦ [${dupTime}] - ${dupTitle}: ${dupDesc}`);
  } else if (inv.quotation_ref) {
    // Created from quotation reference
    const sourceTime = formatAuditTime(inv.created_at || inv.issue_date);
    const sourceTitle = 'Order Source';
    const sourceDesc = `Generated from quotation reference ${inv.quotation_ref}`;
    events.push({
      id: `source-${inv.id}`,
      type: 'source',
      title: sourceTitle,
      description: sourceDesc,
      timestamp: inv.created_at || inv.issue_date,
      formattedTime: sourceTime,
      user: 'System',
      badgeColor: 'blue'
    });
    timeline.push(`✦ [${sourceTime}] - ${sourceTitle}: ${sourceDesc}`);
  } else {
    // Normal initial creation
    const createLog = logs.find((l: any) => l.action === 'CREATE');
    const createTime = formatAuditTime(createLog ? createLog.timestamp : (inv.created_at || inv.issue_date));
    const createTitle = 'Order Generated';
    
    let createDesc = `${currentNum} created as ${currentOrderType.toUpperCase()} (${currentStatus.toUpperCase()})`;
    if (createLog && createLog.details) {
      // Extract order type if mentioned
      const typeMatch = createLog.details.match(/Order Type:\s*([A-Za-z0-9\-_]+)/i);
      if (typeMatch) {
        createDesc = `${currentNum} created as ${typeMatch[1].toUpperCase()} (DRAFT)`;
      }
    }

    events.push({
      id: createLog ? createLog.id : `create-${inv.id}`,
      type: 'source',
      title: createTitle,
      description: createDesc,
      timestamp: createLog ? createLog.timestamp : (inv.created_at || inv.issue_date),
      formattedTime: createTime,
      user: createLog ? createLog.user_name : 'System',
      badgeColor: 'indigo'
    });
    timeline.push(`✦ [${createTime}] - ${createTitle}: ${createDesc}`);
  }

  // 5. Process intermediate logs (Conversions, Status Changes, Updates, Archive)
  for (const log of logs) {
    // Skip the duplicate log if already handled
    if (dupLog && log.id === dupLog.id) continue;
    // Skip create log if already handled
    if (log.action === 'CREATE') continue;

    const timeStr = formatAuditTime(log.timestamp);

    if (log.action === 'INVOICE_CONVERT') {
      const title = 'Order Converted';
      // Clean up description if standard pattern
      let desc = log.details || 'Order type converted';
      const convertMatch = desc.match(/Converted document\s+([A-Za-z0-9\-_]+)\s+from\s+(\w+)\s+to\s+(\w+)(?:\s*\(New Document No:\s*([A-Za-z0-9\-_]+)\))?/i);
      if (convertMatch) {
        const fromType = convertMatch[2].toUpperCase();
        const toType = convertMatch[3].toUpperCase();
        const newNo = convertMatch[4] || currentNum;
        desc = `Converted from ${fromType} to ${toType} (Document No: ${newNo})`;
      }

      events.push({
        id: log.id,
        type: 'convert',
        title,
        description: desc,
        timestamp: log.timestamp,
        formattedTime: timeStr,
        user: log.user_name,
        badgeColor: 'amber'
      });
      timeline.push(`✦ [${timeStr}] - ${title}: ${desc}`);
    } else if (log.action === 'STATUS_CHANGE') {
      const title = 'Status Updated';
      let desc = log.details || 'Status changed';
      const statusMatch = desc.match(/set to\s+([A-Za-z0-9_\-]+)/i);
      if (statusMatch) {
        desc = `Status set to ${statusMatch[1].toUpperCase()}`;
      }

      events.push({
        id: log.id,
        type: 'status',
        title,
        description: desc,
        timestamp: log.timestamp,
        formattedTime: timeStr,
        user: log.user_name,
        badgeColor: 'emerald'
      });
      timeline.push(`✦ [${timeStr}] - ${title}: ${desc}`);
    } else if (log.action === 'INVOICE_UPDATE' || log.action === 'UPDATE') {
      const title = 'Order Updated';
      const desc = log.details || 'Order details updated';
      events.push({
        id: log.id,
        type: 'update',
        title,
        description: desc,
        timestamp: log.timestamp,
        formattedTime: timeStr,
        user: log.user_name,
        badgeColor: 'slate'
      });
      timeline.push(`✦ [${timeStr}] - ${title}: ${desc}`);
    } else if (log.action === 'INVOICE_ARCHIVE') {
      const title = 'Order Archived';
      const desc = log.details || 'Document archived';
      events.push({
        id: log.id,
        type: 'archive',
        title,
        description: desc,
        timestamp: log.timestamp,
        formattedTime: timeStr,
        user: log.user_name,
        badgeColor: 'rose'
      });
      timeline.push(`✦ [${timeStr}] - ${title}: ${desc}`);
    } else if (log.action === 'INVOICE_RESTORE') {
      const title = 'Order Restored';
      const desc = log.details || 'Document restored from archive';
      events.push({
        id: log.id,
        type: 'archive',
        title,
        description: desc,
        timestamp: log.timestamp,
        formattedTime: timeStr,
        user: log.user_name,
        badgeColor: 'teal'
      });
      timeline.push(`✦ [${timeStr}] - ${title}: ${desc}`);
    }
  }

  // 6. Include Payment Transactions if any exist
  for (const t of transactions) {
    const txTime = formatAuditTime(t.transaction_date || t.created_at);
    const amountStr = Number(t.amount).toLocaleString('en-AE', { minimumFractionDigits: 2 });
    const methodStr = (t.payment_method || 'Payment').replace(/_/g, ' ');
    const title = 'Payment Recorded';
    const desc = `Payment of AED ${amountStr} recorded via ${methodStr}${t.transaction_ref ? ` (Ref: ${t.transaction_ref})` : ''}`;

    events.push({
      id: `tx-${t.id}`,
      type: 'payment',
      title,
      description: desc,
      timestamp: t.transaction_date || t.created_at,
      formattedTime: txTime,
      user: t.recorded_by,
      badgeColor: 'emerald'
    });
    timeline.push(`✦ [${txTime}] - ${title}: ${desc}`);
  }

  // Sort intermediate events (after origin and source) chronologically if any timestamps were out of order
  // Note: events[0] (and events[1] if origin exists) are the source track.

  // 7. Add Current Status as terminal item
  const currentStatusStr = currentStatus.toUpperCase();
  events.push({
    id: `current-${inv.id}`,
    type: 'current',
    title: 'Current Status',
    description: currentStatusStr,
    timestamp: inv.updated_at || null,
    formattedTime: formatAuditTime(inv.updated_at),
    badgeColor: currentStatus === 'paid' ? 'emerald' : (currentStatus === 'draft' ? 'slate' : 'cyan')
  });
  timeline.push(`✦ [Current Status] - ${currentStatusStr}`);

  return {
    success: true,
    invoice_id: invoiceId,
    invoice_number: currentNum,
    current_status: currentStatus,
    order_type: currentOrderType,
    timeline,
    events
  };
}
