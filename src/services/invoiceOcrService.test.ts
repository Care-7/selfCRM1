import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExtractedAmounts,
  matchSupplierByTaxId,
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
