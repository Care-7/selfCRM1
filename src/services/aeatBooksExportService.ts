import type { IssuedInvoice, ReceivedInvoice } from '../types';
import type { BusinessActivity } from '../types/database';

export type AeatExportPeriod = 'ALL' | '1T' | '2T' | '3T' | '4T';

export interface ExportAeatBookParams {
  year: number;
  period: AeatExportPeriod;
  activityId?: string;
  activities?: BusinessActivity[];
}

/**
 * Normalizes date from YYYY-MM-DD or ISO string to DD/MM/YYYY for AEAT official books.
 */
export function formatAeatDate(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Formats a decimal number with 2 decimals and comma decimal separator for Spanish AEAT / Excel.
 * Does not include thousands separators to maintain standard CSV parsing.
 * Example: 1250.5 -> "1250,50"
 */
export function formatAeatAmount(val: number | null | undefined): string {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
  return num.toFixed(2).replace('.', ',');
}

/**
 * Safely escapes a string for standard CSV format with semicolon delimiter.
 */
export function escapeCsvCell(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).trim();
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Returns the Spanish quarter string ('1T' | '2T' | '3T' | '4T') for a YYYY-MM-DD date string.
 */
export function getQuarterFromIsoDate(isoDate: string): '1T' | '2T' | '3T' | '4T' {
  if (!isoDate || isoDate.length < 7) return '1T';
  const month = parseInt(isoDate.slice(5, 7), 10);
  if (month >= 1 && month <= 3) return '1T';
  if (month >= 4 && month <= 6) return '2T';
  if (month >= 7 && month <= 9) return '3T';
  return '4T';
}

/**
 * Generates official Libro Registro de Facturas Expedidas CSV conforming to AEAT specifications.
 * CRITICAL RULE: Strictly excludes 'proforma' and 'albaran'.
 * Includes ONLY 'normal' and 'rectificativa' (including historical is_migrated).
 */
export function generateIssuedBookCsv(
  invoices: IssuedInvoice[],
  params: ExportAeatBookParams
): string {
  const { year, period, activityId, activities = [] } = params;

  // Header conforming to AEAT Unified Book specifications
  const headers = [
    'Ejercicio',
    'Periodo',
    'Actividad_IAE',
    'Fecha_Expedicion',
    'Tipo_Factura_AEAT',
    'Serie_Numero',
    'NIF_Destinatario',
    'Nombre_Destinatario',
    'Base_Imponible',
    'Tipo_IVA',
    'Cuota_IVA_Repercutida',
    'Retencion_IRPF',
    'Total_Factura',
    'Estado_Cobro',
    'Estado_VeriFactu',
    'Huella_SHA256',
  ];

  // 1. Filter: strictly fiscal invoices only
  const fiscalInvoices = invoices.filter((inv) => {
    // Strictly exclude proformas and albaranes
    if (inv.documentType === 'proforma' || inv.documentType === 'albaran') {
      return false;
    }
    // Only normal and rectificativa
    if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') {
      return false;
    }

    // Filter by year
    const invYear = parseInt((inv.issueDate || '').slice(0, 4), 10);
    if (invYear !== year) return false;

    // Filter by period
    if (period !== 'ALL') {
      const invQuarter = getQuarterFromIsoDate(inv.issueDate);
      if (invQuarter !== period) return false;
    }

    // Filter by activity
    if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
      if (inv.activityId && inv.activityId !== activityId && inv.activity !== activityId) {
        return false;
      }
      if (!inv.activityId && inv.activity !== activityId) {
        return false;
      }
    }

    return true;
  });

  // Sort chronologically by date and sequence
  fiscalInvoices.sort((a, b) => {
    const dateCmp = (a.issueDate || '').localeCompare(b.issueDate || '');
    if (dateCmp !== 0) return dateCmp;
    return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
  });

  // Map to CSV rows
  const rows = fiscalInvoices.map((inv) => {
    const invQuarter = getQuarterFromIsoDate(inv.issueDate);
    const matchedActivity = activities.find(
      (act) => act.id === inv.activityId || act.name === inv.activity
    );
    const activityCode = matchedActivity?.iae_code || matchedActivity?.name || inv.activity || 'General';

    const tipoAeat = inv.documentType === 'rectificativa' ? 'R1' : 'F1';
    const clientNif = inv.clientSnapshot?.tax_id || inv.clientNif || '';
    const clientName = inv.clientSnapshot?.name || inv.clientName || '';

    // Monetary figures
    const taxBase = inv.taxBase != null ? Number(inv.taxBase) : 0;
    const vatRate = inv.ivaRate ?? 21;
    const vatTotal = inv.vatTotal != null ? Number(inv.vatTotal) : 0;
    const irpfTotal = inv.irpfTotal != null ? Number(inv.irpfTotal) : 0;
    const totalAmount = inv.totalAmount != null ? Number(inv.totalAmount) : 0;

    const paymentStatus = inv.status === 'Cobrada' ? 'Cobrada' : 'Pendiente';
    const verifactuStatus =
      inv.veriFactuLocked && !inv.isMigrated
        ? 'Sello VeriFactu'
        : inv.isMigrated
        ? 'Histórica Migrada'
        : 'No Aplicable';

    return [
      escapeCsvCell(String(year)),
      escapeCsvCell(invQuarter),
      escapeCsvCell(activityCode),
      escapeCsvCell(formatAeatDate(inv.issueDate)),
      escapeCsvCell(tipoAeat),
      escapeCsvCell(inv.number),
      escapeCsvCell(clientNif),
      escapeCsvCell(clientName),
      formatAeatAmount(taxBase),
      formatAeatAmount(vatRate),
      formatAeatAmount(vatTotal),
      formatAeatAmount(irpfTotal),
      formatAeatAmount(totalAmount),
      escapeCsvCell(paymentStatus),
      escapeCsvCell(verifactuStatus),
      escapeCsvCell(inv.veriFactuHash || ''),
    ].join(';');
  });

  // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
  return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
}

/**
 * Generates official Libro Registro de Facturas Recibidas CSV conforming to AEAT specifications.
 * Filters strictly by accounting_date (registration/fiscal deduction date).
 */
export function generateReceivedBookCsv(
  expenses: ReceivedInvoice[],
  params: ExportAeatBookParams
): string {
  const { year, period, activityId, activities = [] } = params;

  const headers = [
    'Ejercicio',
    'Periodo',
    'Actividad_IAE',
    'Fecha_Expedicion',
    'Fecha_Registro_Contable',
    'Num_Factura_Proveedor',
    'NIF_Expedidor',
    'Nombre_Expedidor',
    'Cuenta_PGC',
    'Base_Imponible',
    'Tipo_IVA',
    'Cuota_IVA_Soportado',
    'Pct_IVA_Deducible',
    'Cuota_IVA_Deducible',
    'Retencion_IRPF',
    'Pct_Gasto_Deducible',
    'Gasto_Deducible_IRPF',
    'Total_Factura',
    'Estado_Pago',
  ];

  const filteredExpenses = expenses.filter((exp) => {
    // Fiscal deduction date is accountingDate (with issueDate fallback)
    const fiscalDate = exp.accountingDate || exp.issueDate || '';
    const expYear = parseInt(fiscalDate.slice(0, 4), 10);
    if (expYear !== year) return false;

    if (period !== 'ALL') {
      const expQuarter = getQuarterFromIsoDate(fiscalDate);
      if (expQuarter !== period) return false;
    }

    if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
      if (exp.activityId && exp.activityId !== activityId && exp.activity !== activityId) {
        return false;
      }
      if (!exp.activityId && exp.activity !== activityId) {
        return false;
      }
    }

    return true;
  });

  // Sort chronologically by accounting date
  filteredExpenses.sort((a, b) => {
    const dateA = a.accountingDate || a.issueDate || '';
    const dateB = b.accountingDate || b.issueDate || '';
    return dateA.localeCompare(dateB);
  });

  const rows = filteredExpenses.map((exp) => {
    const fiscalDate = exp.accountingDate || exp.issueDate || '';
    const expQuarter = getQuarterFromIsoDate(fiscalDate);

    const matchedActivity = activities.find(
      (act) => act.id === exp.activityId || act.name === exp.activity
    );
    const activityCode = matchedActivity?.iae_code || matchedActivity?.name || exp.activity || 'General';

    const supplierNif = exp.supplierSnapshot?.tax_id || exp.supplierNif || '';
    const supplierName = exp.supplierSnapshot?.name || exp.supplierName || '';

    const baseAmount = Number(exp.baseAmount ?? 0);
    const vatRate = Number(exp.ivaRate ?? 21);
    const vatTotal = (baseAmount * vatRate) / 100;

    const deductibleVatPct = exp.deductibleVatPct != null ? Number(exp.deductibleVatPct) : 100;
    const deductibleVatAmount =
      exp.deductibleVatAmount != null
        ? Number(exp.deductibleVatAmount)
        : (vatTotal * deductibleVatPct) / 100;

    const irpfRate = Number(exp.irpfRetainedRate ?? 0);
    const irpfTotal = (baseAmount * irpfRate) / 100;

    const deductibleExpensePct = exp.deductibleExpensePct != null ? Number(exp.deductibleExpensePct) : 100;
    const deductibleExpenseAmount =
      exp.deductibleExpenseAmount != null
        ? Number(exp.deductibleExpenseAmount)
        : (baseAmount * deductibleExpensePct) / 100;

    const totalAmount = baseAmount + vatTotal - irpfTotal;
    const paymentStatus = exp.paymentStatus === 'paid' ? 'Pagada' : 'Pendiente';

    return [
      escapeCsvCell(String(year)),
      escapeCsvCell(expQuarter),
      escapeCsvCell(activityCode),
      escapeCsvCell(formatAeatDate(exp.issueDate)),
      escapeCsvCell(formatAeatDate(fiscalDate)),
      escapeCsvCell(exp.number),
      escapeCsvCell(supplierNif),
      escapeCsvCell(supplierName),
      escapeCsvCell(exp.pgcAccountCode || '629'),
      formatAeatAmount(baseAmount),
      formatAeatAmount(vatRate),
      formatAeatAmount(vatTotal),
      formatAeatAmount(deductibleVatPct),
      formatAeatAmount(deductibleVatAmount),
      formatAeatAmount(irpfTotal),
      formatAeatAmount(deductibleExpensePct),
      formatAeatAmount(deductibleExpenseAmount),
      formatAeatAmount(totalAmount),
      escapeCsvCell(paymentStatus),
    ].join(';');
  });

  return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
}

/**
 * Triggers downloading the CSV file in the browser environment.
 */
export function downloadCsvFile(content: string, fileName: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Triggers download of the AEAT Issued Invoices Book.
 */
export function downloadIssuedBookCsv(
  invoices: IssuedInvoice[],
  params: ExportAeatBookParams
): { success: boolean; fileName: string; content: string } {
  const content = generateIssuedBookCsv(invoices, params);
  const fileName = `Libro_Registro_Facturas_Expedidas_AEAT_${params.year}_${params.period}.csv`;
  const success = downloadCsvFile(content, fileName);
  return { success, fileName, content };
}

/**
 * Triggers download of the AEAT Received Invoices Book.
 */
export function downloadReceivedBookCsv(
  expenses: ReceivedInvoice[],
  params: ExportAeatBookParams
): { success: boolean; fileName: string; content: string } {
  const content = generateReceivedBookCsv(expenses, params);
  const fileName = `Libro_Registro_Facturas_Recibidas_AEAT_${params.year}_${params.period}.csv`;
  const success = downloadCsvFile(content, fileName);
  return { success, fileName, content };
}
