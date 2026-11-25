import { supabase } from '../lib/supabase';
import type {
  CreateReceivedInvoiceInput,
  ReceivedInvoicePaymentStatus,
  ReceivedInvoiceRow,
  UpdateReceivedInvoiceInput,
} from '../types/database';
import { mapDatabaseError, isValidUuid } from './databaseErrors';

const EXPENSE_STORAGE_BUCKET = 'expense-documents';

/**
 * Sanitizes a file name for secure and cross-platform storage paths.
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-zA-Z0-9._-]/g, '_') // replace non-alphanumeric chars
    .toLowerCase();
}

/**
 * Uploads an expense receipt (PDF, image) to private Supabase Storage
 * under `{organizationId}/{timestamp}-{sanitizedFileName}`.
 */
export async function uploadExpenseDocument(
  organizationId: string,
  file: File
): Promise<{ path: string; name: string }> {
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const cleanName = sanitizeFileName(file.name || 'justificante.pdf');
  const path = `${organizationId}/${Date.now()}-${cleanName}`;

  const { data, error } = await supabase.storage
    .from(EXPENSE_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al subir el justificante: ${error.message}`);
  }

  return {
    path: data?.path || path,
    name: file.name,
  };
}

/**
 * Generates a temporary signed URL for downloading or viewing a private receipt document.
 */
export async function getExpenseDocumentSignedUrl(
  path: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  if (!path?.trim()) {
    throw new Error('Ruta de archivo no especificada.');
  }

  const { data, error } = await supabase.storage
    .from(EXPENSE_STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Error al generar enlace seguro de descarga: ${error?.message || 'Archivo no encontrado'}`);
  }

  return data.signedUrl;
}

/**
 * Deletes a receipt document from private storage.
 */
export async function deleteExpenseDocument(path: string): Promise<void> {
  if (!path?.trim()) return;

  const { error } = await supabase.storage
    .from(EXPENSE_STORAGE_BUCKET)
    .remove([path]);

  if (error) {
    console.error('Error al eliminar archivo de storage:', error);
  }
}

/**
 * Fetches all received invoices / expenses belonging to the active organization.
 */
export async function listReceivedInvoices(
  organizationId: string,
  filter?: { activityId?: string; paymentStatus?: ReceivedInvoicePaymentStatus }
): Promise<ReceivedInvoiceRow[]> {
  if (!organizationId || !isValidUuid(organizationId)) {
    return [];
  }

  let query = (supabase.from('received_invoices') as any)
    .select('*')
    .eq('organization_id', organizationId);

  if (filter?.activityId && isValidUuid(filter.activityId)) {
    query = query.eq('activity_id', filter.activityId);
  }

  if (filter?.paymentStatus) {
    query = query.eq('payment_status', filter.paymentStatus);
  }

  const { data, error } = await query
    .order('accounting_date', { ascending: false })
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(mapDatabaseError(error, 'gasto'));
  }

  return (data as ReceivedInvoiceRow[]) || [];
}

/**
 * Creates a new received invoice / expense in Supabase.
 * Strictly non-optimistic: throws immediately on failure.
 */
export async function createReceivedInvoice(
  input: CreateReceivedInvoiceInput
): Promise<ReceivedInvoiceRow> {
  if (!input.organization_id || !isValidUuid(input.organization_id)) {
    throw new Error('Identificador de organización no válido.');
  }
  if (!input.supplier_invoice_number?.trim()) {
    throw new Error('El número de factura del proveedor es obligatorio.');
  }
  if (input.tax_base === undefined || isNaN(Number(input.tax_base))) {
    throw new Error('La base imponible es obligatoria.');
  }

  const cleanActivityId = isValidUuid(input.activity_id) ? input.activity_id : null;
  const cleanSupplierId = isValidUuid(input.supplier_id) ? input.supplier_id : null;

  const payload = {
    organization_id: input.organization_id,
    activity_id: cleanActivityId,
    supplier_id: cleanSupplierId,
    supplier_snapshot: input.supplier_snapshot,
    supplier_invoice_number: input.supplier_invoice_number.trim(),
    issue_date: input.issue_date || new Date().toISOString().split('T')[0],
    accounting_date: input.accounting_date || input.issue_date || new Date().toISOString().split('T')[0],
    expense_category: input.expense_category || '629',
    description: input.description?.trim() || null,
    lines: input.lines || [],
    tax_base: Number(input.tax_base),
    vat_rate: Number(input.vat_rate ?? 21),
    vat_total: Number(input.vat_total ?? 0),
    irpf_rate: Number(input.irpf_rate ?? 0),
    irpf_total: Number(input.irpf_total ?? 0),
    total_amount: Number(input.total_amount ?? input.tax_base),
    deductible_vat_pct: Number(input.deductible_vat_pct ?? 100),
    deductible_expense_pct: Number(input.deductible_expense_pct ?? 100),
    payment_status: input.payment_status || 'pending',
    paid_at: input.paid_at || null,
    payment_method: input.payment_method || null,
    attachment_path: input.attachment_path || null,
    attachment_name: input.attachment_name || null,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await (supabase.from('received_invoices') as any)
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'gasto'));
  }

  return data as ReceivedInvoiceRow;
}

/**
 * Updates an existing received invoice in Supabase.
 */
export async function updateReceivedInvoice(
  id: string,
  organizationId: string,
  input: UpdateReceivedInvoiceInput
): Promise<ReceivedInvoiceRow> {
  if (!id || !isValidUuid(id)) {
    throw new Error('Identificador de factura recibida no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const payload: Record<string, any> = {};

  if (input.activity_id !== undefined) {
    payload.activity_id = isValidUuid(input.activity_id) ? input.activity_id : null;
  }
  if (input.supplier_id !== undefined) {
    payload.supplier_id = isValidUuid(input.supplier_id) ? input.supplier_id : null;
  }
  if (input.supplier_snapshot !== undefined) {
    payload.supplier_snapshot = input.supplier_snapshot;
  }
  if (input.supplier_invoice_number !== undefined) {
    payload.supplier_invoice_number = input.supplier_invoice_number.trim();
  }
  if (input.issue_date !== undefined) {
    payload.issue_date = input.issue_date;
  }
  if (input.accounting_date !== undefined) {
    payload.accounting_date = input.accounting_date;
  }
  if (input.expense_category !== undefined) {
    payload.expense_category = input.expense_category;
  }
  if (input.description !== undefined) {
    payload.description = input.description?.trim() || null;
  }
  if (input.lines !== undefined) {
    payload.lines = input.lines;
  }
  if (input.tax_base !== undefined) {
    payload.tax_base = Number(input.tax_base);
  }
  if (input.vat_rate !== undefined) {
    payload.vat_rate = Number(input.vat_rate);
  }
  if (input.vat_total !== undefined) {
    payload.vat_total = Number(input.vat_total);
  }
  if (input.irpf_rate !== undefined) {
    payload.irpf_rate = Number(input.irpf_rate);
  }
  if (input.irpf_total !== undefined) {
    payload.irpf_total = Number(input.irpf_total);
  }
  if (input.total_amount !== undefined) {
    payload.total_amount = Number(input.total_amount);
  }
  if (input.deductible_vat_pct !== undefined) {
    payload.deductible_vat_pct = Number(input.deductible_vat_pct);
  }
  if (input.deductible_expense_pct !== undefined) {
    payload.deductible_expense_pct = Number(input.deductible_expense_pct);
  }
  if (input.payment_status !== undefined) {
    payload.payment_status = input.payment_status;
  }
  if (input.paid_at !== undefined) {
    payload.paid_at = input.paid_at;
  }
  if (input.payment_method !== undefined) {
    payload.payment_method = input.payment_method;
  }
  if (input.attachment_path !== undefined) {
    payload.attachment_path = input.attachment_path;
  }
  if (input.attachment_name !== undefined) {
    payload.attachment_name = input.attachment_name;
  }
  if (input.notes !== undefined) {
    payload.notes = input.notes?.trim() || null;
  }

  const { data, error } = await (supabase.from('received_invoices') as any)
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'gasto'));
  }

  return data as ReceivedInvoiceRow;
}

/**
 * Deletes a received invoice and optionally removes its stored attachment.
 */
export async function deleteReceivedInvoice(
  id: string,
  organizationId: string
): Promise<void> {
  if (!id || !isValidUuid(id)) {
    throw new Error('Identificador de factura recibida no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  // Pre-fetch attachment path to clean up storage
  const { data: existing } = await (supabase.from('received_invoices') as any)
    .select('attachment_path')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single();

  if (existing?.attachment_path) {
    await deleteExpenseDocument(existing.attachment_path);
  }

  const { error } = await (supabase.from('received_invoices') as any)
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(mapDatabaseError(error, 'gasto'));
  }
}

/**
 * Updates the payment status of a received invoice.
 */
export async function updateReceivedInvoicePaymentStatus(
  id: string,
  organizationId: string,
  status: ReceivedInvoicePaymentStatus,
  paidAt?: string | null
): Promise<ReceivedInvoiceRow> {
  return updateReceivedInvoice(id, organizationId, {
    payment_status: status,
    paid_at: status === 'paid' ? (paidAt || new Date().toISOString()) : null,
  });
}
