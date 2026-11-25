import { supabase } from '../lib/supabase';
import type { Contact } from '../types';
import { round2 } from '../utils/finance';
import { normalizeTaxId } from './databaseErrors';

export interface ExtractedExpenseData {
  supplier_name: string;
  supplier_tax_id: string;
  supplier_invoice_number: string;
  issue_date: string;
  tax_base: number;
  vat_rate: number;
  vat_total: number;
  irpf_rate: number;
  irpf_total: number;
  total_amount: number;
  suggested_pgc_category: string;
  description: string;
  has_multiple_vat_rates: boolean;
}

export interface ExpenseValidationResult {
  isValid: boolean;
  expectedTotal: number;
  actualTotal: number;
  difference: number;
  warnings: string[];
}

/**
 * Converts a browser File or Blob into a base64 encoded string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Validates extracted expense totals using pure double-entry balance check (tax_base + vat - irpf === total).
 * Accepts up to 0.02 € of mathematical rounding tolerance.
 */
export function validateExtractedAmounts(
  data: Partial<ExtractedExpenseData>
): ExpenseValidationResult {
  const taxBase = round2(Number(data.tax_base ?? 0));
  const vatTotal = round2(Number(data.vat_total ?? 0));
  const irpfTotal = round2(Number(data.irpf_total ?? 0));
  const actualTotal = round2(Number(data.total_amount ?? 0));

  const expectedTotal = round2(taxBase + vatTotal - irpfTotal);
  const difference = round2(Math.abs(actualTotal - expectedTotal));
  const warnings: string[] = [];

  // Rounding tolerance: 0.02 €
  const isValid = difference <= 0.02;

  if (!isValid) {
    warnings.push(
      `Descuadre matemático de ${difference} €: Base (${taxBase} €) + IVA (${vatTotal} €) - IRPF (${irpfTotal} €) = ${expectedTotal} €, pero el total extraído indica ${actualTotal} €. Revisa los importes.`
    );
  }

  if (data.has_multiple_vat_rates) {
    warnings.push(
      'La factura contiene múltiples tipos de IVA desglosados. Se ha sugerido el tipo predominante; verifica que el desglose contable sea el deseado.'
    );
  }

  if (taxBase <= 0) {
    warnings.push('La base imponible extraída es inferior o igual a 0 €.');
  }

  if (actualTotal <= 0) {
    warnings.push('El importe total extraído es inferior o igual a 0 €.');
  }

  return {
    isValid,
    expectedTotal,
    actualTotal,
    difference,
    warnings,
  };
}

/**
 * Matches an extracted tax ID against existing suppliers in the active tenant organization.
 */
export function matchSupplierByTaxId(
  extractedTaxId: string,
  suppliers: Contact[]
): Contact | undefined {
  if (!extractedTaxId || !suppliers?.length) return undefined;
  const cleanExtracted = normalizeTaxId(extractedTaxId);
  if (!cleanExtracted) return undefined;

  return suppliers.find((s) => normalizeTaxId(s.nif) === cleanExtracted);
}

/**
 * Calls the Supabase Edge Function parse-expense-document with the uploaded file.
 * Requires user authentication via session token.
 */
export async function parseExpenseDocument(file: File): Promise<ExtractedExpenseData> {
  const fileBase64 = await fileToBase64(file);
  const mimeType = file.type || 'application/pdf';

  const { data, error } = await supabase.functions.invoke('parse-expense-document', {
    body: {
      fileBase64,
      mimeType,
      fileName: file.name,
    },
  });

  if (error) {
    throw new Error(
      error.message ||
        'Error de comunicación con el servicio de lectura IA de Supabase.'
    );
  }

  if (!data?.success || !data?.data) {
    throw new Error(
      data?.error ||
        'La función de extracción no pudo interpretar los datos del documento.'
    );
  }

  const raw = data.data;

  return {
    supplier_name: String(raw.supplier_name || '').trim(),
    supplier_tax_id: normalizeTaxId(String(raw.supplier_tax_id || '')),
    supplier_invoice_number: String(raw.supplier_invoice_number || '').trim(),
    issue_date: String(raw.issue_date || new Date().toISOString().split('T')[0]).trim(),
    tax_base: round2(Number(raw.tax_base || 0)),
    vat_rate: Number(raw.vat_rate ?? 21),
    vat_total: round2(Number(raw.vat_total || 0)),
    irpf_rate: Number(raw.irpf_rate ?? 0),
    irpf_total: round2(Number(raw.irpf_total || 0)),
    total_amount: round2(Number(raw.total_amount || 0)),
    suggested_pgc_category: String(raw.suggested_pgc_category || '629').trim(),
    description: String(raw.description || '').trim(),
    has_multiple_vat_rates: Boolean(raw.has_multiple_vat_rates),
  };
}
