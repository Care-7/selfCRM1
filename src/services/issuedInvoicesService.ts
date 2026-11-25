import { supabase } from '../lib/supabase';
import type {
  IssuedInvoiceRow,
  IssueInvoiceAtomicInput,
  IssuedInvoiceDocumentType,
  IssuedInvoicePaymentStatus,
} from '../types/database';
import { mapDatabaseError, isValidUuid } from './databaseErrors';

/**
 * Service layer for Issued Invoices (Facturas Emitidas, Proformas, Albaranes, Rectificativas)
 * with strict VeriFactu (RD 1007/2023) immutability and atomic sequential issuance.
 */

export interface ListIssuedInvoicesFilter {
  documentType?: IssuedInvoiceDocumentType;
  activityId?: string;
  paymentStatus?: IssuedInvoicePaymentStatus;
}

/**
 * Fetches all issued invoices belonging to the active organization.
 */
export async function listIssuedInvoices(
  organizationId: string,
  filter?: ListIssuedInvoicesFilter
): Promise<IssuedInvoiceRow[]> {
  if (!organizationId || !isValidUuid(organizationId)) {
    return [];
  }

  let query = (supabase.from('issued_invoices') as any)
    .select('*')
    .eq('organization_id', organizationId);

  if (filter?.documentType) {
    query = query.eq('document_type', filter.documentType);
  }
  if (filter?.activityId && isValidUuid(filter.activityId)) {
    query = query.eq('activity_id', filter.activityId);
  }
  if (filter?.paymentStatus) {
    query = query.eq('payment_status', filter.paymentStatus);
  }

  const { data, error } = await query
    .order('issue_date', { ascending: false })
    .order('sequence_number', { ascending: false });

  if (error) {
    throw new Error(mapDatabaseError(error, 'factura'));
  }

  return (data as IssuedInvoiceRow[]) || [];
}

/**
 * Atomically issues a document (Normal, Rectificativa, Proforma, Albarán)
 * using the concurrency-safe PostgreSQL stored procedure public.issue_invoice_atomic.
 */
export async function issueInvoice(
  input: IssueInvoiceAtomicInput
): Promise<IssuedInvoiceRow> {
  if (!input.organization_id || !isValidUuid(input.organization_id)) {
    throw new Error('Identificador de organización no válido.');
  }
  if (!input.series?.trim()) {
    throw new Error('La serie de facturación es obligatoria.');
  }
  if (!input.lines || !Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error('La factura debe contener al menos una línea de concepto.');
  }

  const cleanActivityId = isValidUuid(input.activity_id) ? input.activity_id : null;
  const cleanClientId = isValidUuid(input.client_id) ? input.client_id : null;
  const cleanRectifiedId = isValidUuid(input.rectified_invoice_id) ? input.rectified_invoice_id : null;
  const cleanConvertedId = isValidUuid(input.converted_from_id) ? input.converted_from_id : null;

  const { data, error } = await (supabase.rpc as any)('issue_invoice_atomic', {
    p_organization_id: input.organization_id,
    p_series: input.series.trim().toUpperCase(),
    p_document_type: input.document_type,
    p_issuer_snapshot: input.issuer_snapshot,
    p_client_snapshot: input.client_snapshot,
    p_lines: input.lines,
    p_tax_base: Number(input.tax_base),
    p_vat_total: Number(input.vat_total),
    p_irpf_total: Number(input.irpf_total),
    p_total_amount: Number(input.total_amount),
    p_activity_id: cleanActivityId,
    p_client_id: cleanClientId,
    p_issue_date: input.issue_date || new Date().toISOString().split('T')[0],
    p_due_date: input.due_date || null,
    p_payment_status: input.payment_status || 'pending',
    p_payment_method: input.payment_method || null,
    p_notes: input.notes || null,
    p_rectified_invoice_id: cleanRectifiedId,
    p_rectification_reason: input.rectification_reason || null,
    p_converted_from_id: cleanConvertedId,
    p_is_migrated: input.is_migrated ?? false,
  });

  if (error) {
    throw new Error(mapDatabaseError(error, 'factura'));
  }

  return data as IssuedInvoiceRow;
}

/**
 * Updates the payment status of an invoice.
 * This is explicitly permitted on VeriFactu-locked invoices by the database immutability trigger.
 */
export async function updateInvoicePaymentStatus(
  invoiceId: string,
  organizationId: string,
  status: IssuedInvoicePaymentStatus,
  paidAt?: string | null,
  paymentMethod?: string | null
): Promise<IssuedInvoiceRow> {
  if (!invoiceId || !isValidUuid(invoiceId)) {
    throw new Error('Identificador de factura no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const payload: Record<string, any> = {
    payment_status: status,
    paid_at: status === 'paid' ? (paidAt || new Date().toISOString()) : null,
  };

  if (paymentMethod !== undefined) {
    payload.payment_method = paymentMethod;
  }

  const { data, error } = await (supabase.from('issued_invoices') as any)
    .update(payload)
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'factura'));
  }

  return data as IssuedInvoiceRow;
}

/**
 * Deletes a non-fiscal draft document (Proforma or Albarán).
 * Any attempt to delete a VeriFactu-locked document is rejected by both application and database layers.
 */
export async function deleteNonFiscalDocument(
  invoiceId: string,
  organizationId: string
): Promise<void> {
  if (!invoiceId || !isValidUuid(invoiceId)) {
    throw new Error('Identificador de documento no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  // Pre-check document type and locked status
  const { data: doc, error: fetchError } = await (supabase.from('issued_invoices') as any)
    .select('document_type, verifactu_locked')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchError || !doc) {
    throw new Error('No se encontró el documento o no tiene permisos para acceder a él.');
  }

  if (doc.verifactu_locked) {
    throw new Error(
      'Inmutabilidad VeriFactu (RD 1007/2023): Las facturas emitidas no pueden eliminarse. Emita una factura rectificativa.'
    );
  }

  const { error } = await (supabase.from('issued_invoices') as any)
    .delete()
    .eq('id', invoiceId)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(mapDatabaseError(error, 'factura'));
  }
}

/**
 * Converts a Proforma or Albarán into a legally valid Normal Invoice,
 * assigning a new sequential number in the normal series, locking it with VeriFactu SHA-256,
 * and linking converted_from_id without modifying or deleting the original document.
 */
export async function convertDraftDocumentToNormal(
  sourceDocId: string,
  organizationId: string,
  normalSeries: string,
  normalActivityId?: string | null
): Promise<IssuedInvoiceRow> {
  if (!sourceDocId || !isValidUuid(sourceDocId)) {
    throw new Error('Identificador de documento de origen no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }
  if (!normalSeries?.trim()) {
    throw new Error('La serie de facturación normal es obligatoria.');
  }

  // 1. Fetch source document
  const { data: sourceDoc, error: fetchErr } = await (supabase.from('issued_invoices') as any)
    .select('*')
    .eq('id', sourceDocId)
    .eq('organization_id', organizationId)
    .single();

  if (fetchErr || !sourceDoc) {
    throw new Error('No se encontró el documento de origen para convertir.');
  }

  if (sourceDoc.document_type !== 'proforma' && sourceDoc.document_type !== 'albaran') {
    throw new Error('Solo se pueden convertir proformas o albaranes a factura ordinaria.');
  }

  // 2. Issue normal invoice linking to source
  const normalInvoice = await issueInvoice({
    organization_id: organizationId,
    series: normalSeries.trim().toUpperCase(),
    document_type: 'normal',
    activity_id: normalActivityId || sourceDoc.activity_id,
    client_id: sourceDoc.client_id,
    issuer_snapshot: sourceDoc.issuer_snapshot,
    client_snapshot: sourceDoc.client_snapshot,
    lines: sourceDoc.lines,
    tax_base: sourceDoc.tax_base,
    vat_total: sourceDoc.vat_total,
    irpf_total: sourceDoc.irpf_total,
    total_amount: sourceDoc.total_amount,
    issue_date: new Date().toISOString().split('T')[0],
    due_date: sourceDoc.due_date,
    payment_status: 'pending',
    notes: `Factura generada a partir de ${sourceDoc.document_type === 'proforma' ? 'Proforma' : 'Albarán'} ${sourceDoc.invoice_number}`,
    converted_from_id: sourceDocId,
    is_migrated: false,
  });

  return normalInvoice;
}
