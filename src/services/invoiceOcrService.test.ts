import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExtractedAmounts,
  matchSupplierByTaxId,
  extractFunctionErrorMessage,
  normalizeExtractedOcrData,
  type ExtractedExpenseData,
} from './invoiceOcrService';
import type { Contact } from '../types';

test('validateExtractedAmounts passes for exact mathematical balance', () => {
  const data: Partial<ExtractedExpenseData> = {
    tax_base: 100,
    vat_total: 21,
    irpf_total: 0,
    total_amount: 121,
    has_multiple_vat_rates: false,
  };

  const result = validateExtractedAmounts(data);
  assert.equal(result.isValid, true);
  assert.equal(result.difference, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.expectedTotal, 121);
});

test('validateExtractedAmounts accepts rounding tolerance up to 0.02 € without error', () => {
  // Line-by-line rounding can produce 0.01 € difference
  const dataWith1CentDiff: Partial<ExtractedExpenseData> = {
    tax_base: 100,
    vat_total: 21.01,
    irpf_total: 0,
    total_amount: 121.02, // 100 + 21.01 = 121.01 -> 0.01 diff
    has_multiple_vat_rates: false,
  };

  const result1 = validateExtractedAmounts(dataWith1CentDiff);
  assert.equal(result1.isValid, true);
  assert.equal(result1.difference, 0.01);
  assert.equal(result1.warnings.length, 0);

  // 0.02 € diff
  const dataWith2CentDiff: Partial<ExtractedExpenseData> = {
    tax_base: 50,
    vat_total: 10.50,
    irpf_total: 0,
    total_amount: 60.52, // 50 + 10.50 = 60.50 -> 0.02 diff
    has_multiple_vat_rates: false,
  };

  const result2 = validateExtractedAmounts(dataWith2CentDiff);
  assert.equal(result2.isValid, true);
  assert.equal(result2.difference, 0.02);
  assert.equal(result2.warnings.length, 0);
});

test('validateExtractedAmounts flags discrepancy when difference exceeds 0.02 €', () => {
  const badData: Partial<ExtractedExpenseData> = {
    tax_base: 100,
    vat_total: 21,
    irpf_total: 15,
    total_amount: 150, // Expected: 100 + 21 - 15 = 106 -> Diff: 44
    has_multiple_vat_rates: false,
  };

  const result = validateExtractedAmounts(badData);
  assert.equal(result.isValid, false);
  assert.equal(result.difference, 44);
  assert.equal(result.expectedTotal, 106);
  assert.equal(result.actualTotal, 150);
  assert.equal(result.warnings.some((w) => w.includes('Descuadre matemático de 44 €')), true);
});

test('validateExtractedAmounts includes warning for multiple VAT rates', () => {
  const multiVatData: Partial<ExtractedExpenseData> = {
    tax_base: 200,
    vat_total: 30, // Mixed 21% and 10%
    irpf_total: 0,
    total_amount: 230,
    has_multiple_vat_rates: true,
  };

  const result = validateExtractedAmounts(multiVatData);
  assert.equal(result.isValid, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes('múltiples tipos de IVA'), true);
});

test('matchSupplierByTaxId normalizes tax IDs with hyphens, spaces and case', () => {
  const suppliers: Contact[] = [
    {
      id: 'sup-1',
      name: 'Telefónica de España SA',
      nif: 'A-28015865',
      email: 'facturas@telefonica.es',
      address: 'Gran Vía 28, Madrid',
      historicalVolume: 0,
      kind: 'proveedor',
      activity: 'Actividad Principal',
      status: 'Activo',
      defaultIva: 21,
      defaultIrpf: 0,
    },
    {
      id: 'sup-2',
      name: 'Gestoría Asesores SL',
      nif: 'B 12345678',
      email: 'contacto@asesores.es',
      address: 'Calle Mayor 1, Madrid',
      historicalVolume: 0,
      kind: 'proveedor',
      activity: 'Actividad Artística',
      status: 'Activo',
      defaultIva: 21,
      defaultIrpf: 15,
    },
  ];

  // Match with clean uppercase
  const match1 = matchSupplierByTaxId('A28015865', suppliers);
  assert.equal(match1?.id, 'sup-1');

  // Match with lowercase and spaces
  const match2 = matchSupplierByTaxId('  b12345678  ', suppliers);
  assert.equal(match2?.id, 'sup-2');

  // Match with hyphens in search query
  const match3 = matchSupplierByTaxId('B-12-345678', suppliers);
  assert.equal(match3?.id, 'sup-2');

  // Non-existent supplier returns undefined
  const noMatch = matchSupplierByTaxId('B99999999', suppliers);
  assert.equal(noMatch, undefined);
});

test('validateExtractedAmounts handles missing or null fields gracefully', () => {
  const emptyData: Partial<ExtractedExpenseData> = {};
  const result = validateExtractedAmounts(emptyData);

  assert.equal(result.isValid, true); // 0 === 0
  assert.equal(result.difference, 0);
  assert.equal(result.warnings.length, 2); // base <= 0 and total <= 0
});

test('extractFunctionErrorMessage extracts readable Spanish message from FunctionsHttpError context', async () => {
  // 1. Context with .json() method (typical Response object)
  const mockErrorWithJson = {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      json: async () => ({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' }),
    },
  };
  const msg1 = await extractFunctionErrorMessage(mockErrorWithJson);
  assert.equal(msg1, 'Sesión no válida o caducada. Vuelve a iniciar sesión.');

  // 2. Context with .text() containing JSON string
  const mockErrorWithTextJson = {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      text: async () => JSON.stringify({ error: 'Cuota de uso de Gemini API agotada temporalmente.' }),
    },
  };
  const msg2 = await extractFunctionErrorMessage(mockErrorWithTextJson);
  assert.equal(msg2, 'Cuota de uso de Gemini API agotada temporalmente.');

  // 3. Context as plain object
  const mockErrorWithObject = {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      error: 'Variables de entorno de Supabase no configuradas en Edge Function.',
    },
  };
  const msg3 = await extractFunctionErrorMessage(mockErrorWithObject);
  assert.equal(msg3, 'Variables de entorno de Supabase no configuradas en Edge Function.');

  // 4. Fallback when context parsing fails or returns non-2xx string
  const mockGenericError = {
    message: 'Edge Function returned a non-2xx status code',
  };
  const msg4 = await extractFunctionErrorMessage(mockGenericError);
  assert.equal(
    msg4,
    'Error al procesar el documento con el servicio de IA de Supabase. Revisa el archivo e inténtalo de nuevo.'
  );

  // 5. Direct error message when it does not contain non-2xx
  const mockNetworkError = {
    message: 'Failed to fetch',
  };
  const msg5 = await extractFunctionErrorMessage(mockNetworkError);
  assert.equal(msg5, 'Failed to fetch');
});

test('normalizeExtractedOcrData handles tickets with null or missing fields safely', () => {
  // Typical cash receipt / ticket where supplier NIF, invoice number and IRPF are null
  const rawTicket = {
    supplier_name: 'Restaurante Madrid Centro',
    supplier_tax_id: null,
    supplier_invoice_number: null,
    issue_date: '2026-04-12',
    tax_base: 41.32,
    vat_rate: 10,
    vat_total: 4.13,
    irpf_rate: null,
    irpf_total: null,
    total_amount: 45.45,
    suggested_pgc_category: '629',
    description: 'Comida menú del día',
    has_multiple_vat_rates: false,
  };

  const normalized = normalizeExtractedOcrData(rawTicket);

  assert.equal(normalized.supplier_name, 'Restaurante Madrid Centro');
  assert.equal(normalized.supplier_tax_id, '');
  assert.equal(normalized.supplier_invoice_number, '');
  assert.equal(normalized.issue_date, '2026-04-12');
  assert.equal(normalized.tax_base, 41.32);
  assert.equal(normalized.vat_rate, 10);
  assert.equal(normalized.vat_total, 4.13);
  assert.equal(normalized.irpf_rate, 0);
  assert.equal(normalized.irpf_total, 0);
  assert.equal(normalized.total_amount, 45.45);
  assert.equal(normalized.suggested_pgc_category, '629');
  assert.equal(normalized.description, 'Comida menú del día');
  assert.equal(normalized.has_multiple_vat_rates, false);

  // When total_amount is 0 or null but base and VAT are present, calculates total automatically
  const rawWithoutTotal = {
    supplier_name: 'Taxi Madrid',
    tax_base: 20,
    vat_rate: 10,
    vat_total: 2,
    total_amount: null,
  };
  const normalizedCalc = normalizeExtractedOcrData(rawWithoutTotal);
  assert.equal(normalizedCalc.total_amount, 22);

  // When input is null or non-object, returns safe defaults
  const normalizedNull = normalizeExtractedOcrData(null);
  assert.equal(normalizedNull.supplier_name, '');
  assert.equal(normalizedNull.total_amount, 0);
  assert.equal(normalizedNull.suggested_pgc_category, '629');
});

