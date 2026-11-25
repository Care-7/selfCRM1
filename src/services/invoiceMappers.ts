import type {
  ActivityType,
  DocumentType,
  InvoiceLine,
  IrpfRate,
  IssuedInvoice,
  IssuedInvoiceStatus,
} from '../types';
import type {
  BusinessActivity,
  ClientRow,
  InvoiceLineItem,
  IssuedInvoiceRow,
  IssuerSnapshot,
  ClientSnapshot,
  Organization,
  Profile,
} from '../types/database';

/**
 * Transforms a Supabase IssuedInvoiceRow into the frontend UI IssuedInvoice model.
 * Preserves all VeriFactu metadata, document type and snapshots.
 */
export function invoiceRowToIssuedInvoice(
  row: IssuedInvoiceRow,
  activities: BusinessActivity[] = []
): IssuedInvoice {
  const matchedActivity = activities.find((a) => a.id === row.activity_id);
  const activityName =
    matchedActivity?.name || (activities[0]?.name ?? 'Actividad Principal');

  // Map database lines to UI InvoiceLine array
  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  const lines: InvoiceLine[] = rawLines.map((l: any, idx: number) => ({
    id: l.id || `line-${row.id}-${idx}`,
    description: l.description || '',
    quantity: Number(l.quantity ?? 1),
    unitPrice: Number(l.unit_price ?? 0),
  }));

  // Derive predominant tax rates from lines or totals
  const firstLine = rawLines[0];
  const ivaRate = (
    firstLine?.vat_rate != null
      ? Number(firstLine.vat_rate)
      : row.tax_base > 0
      ? Math.round((Number(row.vat_total) / Number(row.tax_base)) * 100)
      : 21
  ) as 21 | 10 | 0;

  const irpfRate = (
    firstLine?.irpf_rate != null
      ? Number(firstLine.irpf_rate)
      : row.tax_base > 0
      ? Math.round((Number(row.irpf_total) / Number(row.tax_base)) * 100)
      : 0
  ) as IrpfRate;

  // Map status according to document type
  let status: IssuedInvoiceStatus = 'Pendiente';
  if (row.payment_status === 'paid') {
    status = 'Cobrada';
  } else if (row.document_type === 'proforma') {
    status = row.notes?.includes('[Convertida') ? 'Convertida' : 'Pendiente';
  } else if (row.document_type === 'albaran') {
    status = row.notes?.includes('[Convertida') ? 'Facturado' : 'Pendiente';
  } else if (!row.verifactu_locked) {
    status = 'Borrador';
  }

  return {
    id: row.id,
    number: row.invoice_number,
    series: row.series,
    sequenceNumber: row.sequence_number,
    documentType: row.document_type as DocumentType,
    isValued: true,
    clientId: row.client_id || '',
    clientName: row.client_snapshot?.name || 'Cliente sin nombre',
    clientNif: row.client_snapshot?.tax_id || '',
    activity: activityName as ActivityType,
    activityId: row.activity_id || undefined,
    issueDate: row.issue_date,
    dueDate: row.due_date || row.issue_date,
    lines,
    ivaRate: ivaRate === 10 || ivaRate === 0 ? ivaRate : 21,
    irpfRate: irpfRate === 7 || irpfRate === 0 ? irpfRate : 15,
    status,
    veriFactuLocked: Boolean(row.verifactu_locked),
    veriFactuHash: row.verifactu_hash || undefined,
    verifactuPrevHash: row.verifactu_prev_hash || undefined,
    veriFactuTimestamp: row.verifactu_timestamp || undefined,
    verifactuQrUrl: row.verifactu_qr_url || undefined,
    verifactuStatus: row.verifactu_status,
    isMigrated: Boolean(row.is_migrated),
    convertedFromId: row.converted_from_id || undefined,
    rectifiedInvoiceId: row.rectified_invoice_id || undefined,
    rectificationReason: row.rectification_reason || undefined,
    issuerSnapshot: row.issuer_snapshot,
    clientSnapshot: row.client_snapshot,
    taxBase: Number(row.tax_base),
    vatTotal: Number(row.vat_total),
    irpfTotal: Number(row.irpf_total),
    totalAmount: Number(row.total_amount),
  };
}

/**
 * Creates an immutable snapshot of issuer fiscal details for an invoice.
 */
export function createIssuerSnapshot(
  org: Organization | null | undefined,
  profile?: Profile | null
): IssuerSnapshot {
  return {
    name: org?.name || profile?.full_name || 'Mi Organización',
    tax_id: org?.tax_id || '',
    legal_form: org?.legal_form,
    email: profile?.email || undefined,
  };
}

/**
 * Creates an immutable snapshot of client fiscal details for an invoice.
 */
export function createClientSnapshot(client: {
  name: string;
  tax_id?: string | null;
  nif?: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
}): ClientSnapshot {
  return {
    name: client.name.trim(),
    tax_id: (client.tax_id || client.nif || '').trim().toUpperCase(),
    address: client.address?.trim() || undefined,
    email: client.email?.trim() || undefined,
    phone: client.phone?.trim() || undefined,
  };
}

/**
 * Converts UI InvoiceLine items into database InvoiceLineItem structures.
 */
export function convertInvoiceLinesToDbItems(
  lines: InvoiceLine[],
  vatRate: number,
  irpfRate: number
): InvoiceLineItem[] {
  return lines.map((line, idx) => {
    const qty = Number(line.quantity || 1);
    const price = Number(line.unitPrice || 0);
    const taxBase = Math.round(qty * price * 100) / 100;
    const vatAmount = Math.round(taxBase * (vatRate / 100) * 100) / 100;
    const irpfAmount = Math.round(taxBase * (irpfRate / 100) * 100) / 100;
    const total = Math.round((taxBase + vatAmount - irpfAmount) * 100) / 100;

    return {
      id: line.id || `line-${Date.now()}-${idx}`,
      description: line.description.trim(),
      quantity: qty,
      unit_price: price,
      vat_rate: vatRate,
      irpf_rate: irpfRate,
      tax_base: taxBase,
      vat_amount: vatAmount,
      irpf_amount: irpfAmount,
      total,
    };
  });
}
