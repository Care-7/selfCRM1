import type {
  ActivityType,
  IrpfRate,
  IvaRate,
  ReceivedInvoice,
  ReceivedInvoiceStatus,
} from '../types';
import type {
  BusinessActivity,
  CreateReceivedInvoiceInput,
  ReceivedInvoicePaymentStatus,
  ReceivedInvoiceRow,
} from '../types/database';
import { round2 } from '../utils/finance';

/**
 * Standard PGC Chart of Accounts dictionary for Spanish expenses (Grupo 6).
 */
export const PGC_EXPENSE_ACCOUNTS: Record<string, string> = {
  '600': 'Compras de mercaderías',
  '602': 'Compras de otros aprovisionamientos',
  '607': 'Trabajos realizados por otras empresas',
  '621': 'Arrendamientos y cánones',
  '622': 'Reparaciones y conservación',
  '623': 'Servicios de profesionales independientes',
  '624': 'Transportes',
  '625': 'Primas de seguros',
  '626': 'Servicios bancarios y similares',
  '627': 'Publicidad, propaganda y relaciones públicas',
  '628': 'Suministros',
  '629': 'Otros servicios (software y oficina)',
};

/**
 * Calculates effectively deductible VAT amount according to fiscal deductibility percentage.
 */
export function calculateDeductibleVat(vatTotal: number, deductibleVatPct: number = 100): number {
  const cleanPct = Math.max(0, Math.min(100, Number(deductibleVatPct ?? 100)));
  return round2((Number(vatTotal || 0) * cleanPct) / 100);
}

/**
 * Calculates effectively deductible expense amount for IRPF / IS according to fiscal deductibility percentage.
 */
export function calculateDeductibleExpense(taxBase: number, deductibleExpensePct: number = 100): number {
  const cleanPct = Math.max(0, Math.min(100, Number(deductibleExpensePct ?? 100)));
  return round2((Number(taxBase || 0) * cleanPct) / 100);
}

/**
 * Combined calculation of deductible amounts.
 */
export function calculateDeductibleAmounts(
  taxBase: number,
  vatTotal: number,
  deductibleExpensePct: number = 100,
  deductibleVatPct: number = 100
): { deductibleExpense: number; deductibleVat: number } {
  return {
    deductibleExpense: calculateDeductibleExpense(taxBase, deductibleExpensePct),
    deductibleVat: calculateDeductibleVat(vatTotal, deductibleVatPct),
  };
}

/**
 * Transforms a Supabase ReceivedInvoiceRow into the frontend ReceivedInvoice model.
 * Resilient to null values or stringified JSONB fields on F5 reload.
 */
export function receivedInvoiceRowToReceivedInvoice(
  row: ReceivedInvoiceRow,
  activities: BusinessActivity[] = []
): ReceivedInvoice {
  const matchedActivity = activities.find((a) => a.id === row.activity_id);
  const activityName =
    matchedActivity?.name || (activities[0]?.name ?? 'Actividad Principal');

  // Parse supplier snapshot safely
  let supplierSnapshot = row.supplier_snapshot;
  if (typeof supplierSnapshot === 'string') {
    try {
      supplierSnapshot = JSON.parse(supplierSnapshot);
    } catch {
      supplierSnapshot = { name: 'Proveedor desconocido', tax_id: '' };
    }
  }

  // Parse lines safely
  let lines = row.lines;
  if (typeof lines === 'string') {
    try {
      lines = JSON.parse(lines);
    } catch {
      lines = [];
    }
  }

  const taxBase = round2(Number(row.tax_base ?? 0));
  const vatRate = Number(row.vat_rate ?? 21) as IvaRate;
  const vatTotal = round2(Number(row.vat_total ?? 0));
  const irpfRate = Number(row.irpf_rate ?? 0) as IrpfRate;
  const dedVatPct = Number(row.deductible_vat_pct ?? 100);
  const dedExpPct = Number(row.deductible_expense_pct ?? 100);

  const { deductibleExpense, deductibleVat } = calculateDeductibleAmounts(
    taxBase,
    vatTotal,
    dedExpPct,
    dedVatPct
  );

  const pgcCode = row.expense_category || '629';
  const pgcName = PGC_EXPENSE_ACCOUNTS[pgcCode] || 'Otros servicios';

  const status: ReceivedInvoiceStatus =
    row.payment_status === 'paid' ? 'Contabilizada' : 'Pendiente';

  return {
    id: row.id,
    number: row.supplier_invoice_number,
    supplierId: row.supplier_id || '',
    supplierName: supplierSnapshot?.name || 'Proveedor desconocido',
    supplierNif: supplierSnapshot?.tax_id || '',
    activity: activityName as ActivityType,
    activityId: row.activity_id || undefined,
    issueDate: row.issue_date,
    accountingDate: row.accounting_date || row.issue_date,
    concept: row.description || pgcName,
    pgcAccountCode: pgcCode,
    pgcAccountName: pgcName,
    baseAmount: taxBase,
    ivaRate: vatRate === 10 || vatRate === 4 || vatRate === 0 ? vatRate : 21,
    irpfRetainedRate: irpfRate === 15 || irpfRate === 7 ? irpfRate : 0,
    status,
    deductible: dedExpPct > 0 || dedVatPct > 0,
    deductibleVatPct: dedVatPct,
    deductibleExpensePct: dedExpPct,
    deductibleVatAmount: deductibleVat,
    deductibleExpenseAmount: deductibleExpense,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    attachmentPath: row.attachment_path,
    attachmentName: row.attachment_name,
    notes: row.notes,
    lines: Array.isArray(lines) ? lines : [],
    supplierSnapshot,
  };
}

export { receivedInvoiceRowToReceivedInvoice as mapRowToReceivedInvoice };

/**
 * Converts a UI ReceivedInvoice model into a Supabase CreateReceivedInvoiceInput payload.
 */
export function receivedInvoiceToCreateInput(
  invoice: ReceivedInvoice,
  organizationId: string
): CreateReceivedInvoiceInput {
  const taxBase = round2(Number(invoice.baseAmount || 0));
  const vatRate = Number(invoice.ivaRate || 0);
  const vatTotal = round2((taxBase * vatRate) / 100);
  const irpfRate = Number(invoice.irpfRetainedRate || 0);
  const irpfTotal = round2((taxBase * irpfRate) / 100);
  const totalAmount = round2(taxBase + vatTotal - irpfTotal);

  const paymentStatus: ReceivedInvoicePaymentStatus =
    invoice.paymentStatus || (invoice.status === 'Contabilizada' ? 'paid' : 'pending');

  return {
    organization_id: organizationId,
    activity_id: invoice.activityId || null,
    supplier_id: invoice.supplierId || null,
    supplier_snapshot: {
      name: invoice.supplierName.trim(),
      tax_id: invoice.supplierNif.trim().toUpperCase(),
    },
    supplier_invoice_number: invoice.number.trim(),
    issue_date: invoice.issueDate,
    accounting_date: invoice.accountingDate || invoice.issueDate,
    expense_category: invoice.pgcAccountCode || '629',
    description: invoice.concept.trim(),
    lines: invoice.lines || [],
    tax_base: taxBase,
    vat_rate: vatRate,
    vat_total: vatTotal,
    irpf_rate: irpfRate,
    irpf_total: irpfTotal,
    total_amount: totalAmount,
    deductible_vat_pct: invoice.deductibleVatPct ?? 100,
    deductible_expense_pct: invoice.deductibleExpensePct ?? 100,
    payment_status: paymentStatus,
    paid_at: paymentStatus === 'paid' ? (invoice.paidAt || new Date().toISOString()) : null,
    payment_method: invoice.paymentMethod || null,
    attachment_path: invoice.attachmentPath || null,
    attachment_name: invoice.attachmentName || null,
    notes: invoice.notes || null,
  };
}
