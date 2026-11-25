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
export function fileToBase64(file: File | Blob): Promise<string> {
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
 * Resizes an image file if larger than 1.2 MB using an offscreen canvas.
 * Scales down to max 1800px on the longest dimension and JPEG quality 0.85.
 * In non-browser environments (tests) or if canvas fails, falls back safely to original file.
 */
export async function optimizeImageIfNeeded(
  file: File
): Promise<{ base64: string; mimeType: string }> {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const isImage = file.type?.startsWith('image/');
  const isLarge = file.size > 1.2 * 1024 * 1024;

  if (!isBrowser || !isImage || !isLarge) {
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type || 'image/jpeg' };
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          let { width, height } = img;
          const maxDimension = 1800;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            fileToBase64(file).then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          resolve({ base64, mimeType: 'image/jpeg' });
        } catch {
          fileToBase64(file).then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }));
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        fileToBase64(file).then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }));
      };

      img.src = objectUrl;
    } catch {
      fileToBase64(file).then((b64) => resolve({ base64: b64, mimeType: file.type || 'image/jpeg' }));
    }
  });
}

/**
 * Extracts human-readable Spanish error messages from Supabase FunctionsHttpError.
 * Reads JSON or text body from error.context to replace generic "non-2xx status code" errors.
 */
export async function extractFunctionErrorMessage(error: any): Promise<string> {
  if (!error) {
    return 'Error desconocido al invocar la función de lectura.';
  }

  // 1. Check if error has context (Supabase FunctionsHttpError)
  if (error.context) {
    try {
      if (typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) {
          return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
        }
        if (body?.message) return body.message;
      } else if (typeof error.context.text === 'function') {
        const text = await error.context.text();
        try {
          const body = JSON.parse(text);
          if (body?.error) {
            return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
          }
          if (body?.message) return body.message;
        } catch {
          if (text && text.trim().length > 0) return text;
        }
      } else if (typeof error.context === 'object') {
        if (error.context.error) {
          return typeof error.context.error === 'string'
            ? error.context.error
            : JSON.stringify(error.context.error);
        }
        if (error.context.message) return error.context.message;
      }
    } catch {
      // Continue to direct message check
    }
  }

  // 2. If direct error.message is informative and not the raw non-2xx code, return it
  const msg = error.message;
  if (msg && typeof msg === 'string' && !msg.toLowerCase().includes('non-2xx status code')) {
    return msg;
  }

  return 'Error al procesar el documento con el servicio de IA de Supabase. Revisa el archivo e inténtalo de nuevo.';
}

/**
 * Normalizes raw OCR output from Gemini, handling null/undefined fields typical of tickets and receipts.
 */
export function normalizeExtractedOcrData(raw: any): ExtractedExpenseData {
  if (!raw || typeof raw !== 'object') {
    return {
      supplier_name: '',
      supplier_tax_id: '',
      supplier_invoice_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      tax_base: 0,
      vat_rate: 21,
      vat_total: 0,
      irpf_rate: 0,
      irpf_total: 0,
      total_amount: 0,
      suggested_pgc_category: '629',
      description: '',
      has_multiple_vat_rates: false,
    };
  }

  const taxBase =
    typeof raw.tax_base === 'number' && Number.isFinite(raw.tax_base)
      ? round2(raw.tax_base)
      : 0;

  const vatRate =
    typeof raw.vat_rate === 'number' && Number.isFinite(raw.vat_rate)
      ? raw.vat_rate
      : 21;

  const vatTotal =
    typeof raw.vat_total === 'number' && Number.isFinite(raw.vat_total)
      ? round2(raw.vat_total)
      : 0;

  const irpfRate =
    typeof raw.irpf_rate === 'number' && Number.isFinite(raw.irpf_rate)
      ? raw.irpf_rate
      : 0;

  const irpfTotal =
    typeof raw.irpf_total === 'number' && Number.isFinite(raw.irpf_total)
      ? round2(raw.irpf_total)
      : 0;

  let totalAmount =
    typeof raw.total_amount === 'number' && Number.isFinite(raw.total_amount)
      ? round2(raw.total_amount)
      : 0;

  if (totalAmount === 0 && (taxBase > 0 || vatTotal > 0)) {
    totalAmount = round2(taxBase + vatTotal - irpfTotal);
  }

  return {
    supplier_name: String(raw.supplier_name ?? '').trim(),
    supplier_tax_id: normalizeTaxId(String(raw.supplier_tax_id ?? '')),
    supplier_invoice_number: String(raw.supplier_invoice_number ?? '').trim(),
    issue_date: String(raw.issue_date || new Date().toISOString().split('T')[0]).trim(),
    tax_base: taxBase,
    vat_rate: vatRate,
    vat_total: vatTotal,
    irpf_rate: irpfRate,
    irpf_total: irpfTotal,
    total_amount: totalAmount,
    suggested_pgc_category: String(raw.suggested_pgc_category || '629').trim(),
    description: String(raw.description ?? '').trim(),
    has_multiple_vat_rates: Boolean(raw.has_multiple_vat_rates),
  };
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
 * Handles client-side compression for large images and error extraction for non-2xx responses.
 */
export async function parseExpenseDocument(file: File): Promise<ExtractedExpenseData> {
  // Validate PDF size limit (max 6 MB)
  if (file.type === 'application/pdf' && file.size > 6 * 1024 * 1024) {
    throw new Error(
      'El archivo PDF supera el tamaño máximo permitido de 6 MB. Por favor, sube un documento más ligero o una imagen comprimida.'
    );
  }

  // Optimize image if needed (> 1.2 MB)
  const { base64: fileBase64, mimeType } = await optimizeImageIfNeeded(file);

  const { data, error } = await supabase.functions.invoke('parse-expense-document', {
    body: {
      fileBase64,
      mimeType,
      fileName: file.name,
    },
  });

  if (error) {
    const errorMsg = await extractFunctionErrorMessage(error);
    throw new Error(errorMsg);
  }

  if (!data?.success || !data?.data) {
    throw new Error(
      data?.error ||
        'La función de extracción no pudo interpretar los datos del documento.'
    );
  }

  return normalizeExtractedOcrData(data.data);
}
