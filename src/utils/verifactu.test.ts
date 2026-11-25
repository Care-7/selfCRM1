import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerifactuCanonicalString,
  computeVerifactuSha256,
  buildVerifactuQrUrl,
  verifyInvoiceChain,
  formatVerifactuDate,
  formatVerifactuAmount,
  type MinimalVerifactuInvoice,
} from './verifactu';

test('formatVerifactuDate converts YYYY-MM-DD and Date objects to Spanish DD-MM-YYYY', () => {
  assert.equal(formatVerifactuDate('2026-11-25'), '25-11-2026');
  assert.equal(formatVerifactuDate('25-11-2026'), '25-11-2026');
  const d = new Date(2026, 0, 15); // 15 Jan 2026
  assert.equal(formatVerifactuDate(d), '15-01-2026');
});

test('formatVerifactuAmount formats monetary values to 2 decimal places with dot separator', () => {
  assert.equal(formatVerifactuAmount(120), '120.00');
  assert.equal(formatVerifactuAmount(120.5), '120.50');
  assert.equal(formatVerifactuAmount('120,75'), '120.75');
  assert.equal(formatVerifactuAmount(0), '0.00');
});

test('buildVerifactuCanonicalString generates canonical payload in strict RD 1007/2023 format', () => {
  const canonical = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'COM-2026-0001',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 105.0,
    totalAmount: 605.0,
    prevHash: '',
    isoTimestamp: '2026-11-25T13:00:00Z',
  });

  const expected =
    'IDEmisorFactura=B99887762' +
    '&NumSerieFactura=COM-2026-0001' +
    '&FechaExpedicionFactura=25-11-2026' +
    '&TipoFactura=F1' +
    '&CuotaTotal=105.00' +
    '&ImporteTotal=605.00' +
    '&HuellaAnterior=' +
    '&FechaHoraHusoGenRegistro=2026-11-25T13:00:00Z';

  assert.equal(canonical, expected);
});

test('computeVerifactuSha256 produces deterministic 64-character uppercase hexadecimal digest', async () => {
  const input =
    'IDEmisorFactura=B99887762&NumSerieFactura=COM-2026-0001&FechaExpedicionFactura=25-11-2026&TipoFactura=F1&CuotaTotal=105.00&ImporteTotal=605.00&HuellaAnterior=&FechaHoraHusoGenRegistro=2026-11-25T13:00:00Z';

  const hashAsync = await computeVerifactuSha256(input);

  assert.equal(hashAsync.length, 64);
  assert.equal(hashAsync, hashAsync.toUpperCase());
  assert.match(hashAsync, /^[0-9A-F]{64}$/);

  // Assert determinism
  const hashAgain = await computeVerifactuSha256(input);
  assert.equal(hashAsync, hashAgain);
});

test('buildVerifactuQrUrl formats official AEAT verification URL with encoded query parameters', () => {
  const qrUrl = buildVerifactuQrUrl({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'COM-2026-0001',
    issueDate: '2026-11-25',
    totalAmount: 605.0,
  });

  assert.ok(
    qrUrl.startsWith(
      'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/ZZ01.shtml'
    )
  );
  assert.ok(qrUrl.includes('nif=B99887762'));
  assert.ok(qrUrl.includes('numserie=COM-2026-0001'));
  assert.ok(qrUrl.includes('fecha=25-11-2026'));
  assert.ok(qrUrl.includes('importe=605.00'));
});

test('verifyInvoiceChain successfully verifies a 3-invoice chained sequence', async () => {
  const ts1 = '2026-11-25T10:00:00Z';
  const ts2 = '2026-11-25T11:00:00Z';
  const ts3 = '2026-11-25T12:00:00Z';

  // Invoice 1
  const c1 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'EXP-0001',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 21.0,
    totalAmount: 121.0,
    prevHash: '',
    isoTimestamp: ts1,
  });
  const h1 = await computeVerifactuSha256(c1);

  // Invoice 2
  const c2 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'EXP-0002',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 42.0,
    totalAmount: 242.0,
    prevHash: h1,
    isoTimestamp: ts2,
  });
  const h2 = await computeVerifactuSha256(c2);

  // Invoice 3 (Rectificativa R1)
  const c3 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'REC-0001',
    issueDate: '2026-11-25',
    invoiceType: 'R1',
    vatTotal: -21.0,
    totalAmount: -121.0,
    prevHash: h2,
    isoTimestamp: ts3,
  });
  const h3 = await computeVerifactuSha256(c3);

  const chain: MinimalVerifactuInvoice[] = [
    {
      id: 'inv-1',
      invoice_number: 'EXP-0001',
      series: 'EXP',
      sequence_number: 1,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121,
      verifactu_locked: true,
      verifactu_hash: h1,
      verifactu_prev_hash: '',
      verifactu_timestamp: ts1,
    },
    {
      id: 'inv-2',
      invoice_number: 'EXP-0002',
      series: 'EXP',
      sequence_number: 2,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 200,
      vat_total: 42,
      total_amount: 242,
      verifactu_locked: true,
      verifactu_hash: h2,
      verifactu_prev_hash: h1,
      verifactu_timestamp: ts2,
    },
    {
      id: 'inv-3',
      invoice_number: 'REC-0001',
      series: 'REC',
      sequence_number: 1,
      document_type: 'rectificativa',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: -100,
      vat_total: -21,
      total_amount: -121,
      verifactu_locked: true,
      verifactu_hash: h3,
      verifactu_prev_hash: h2,
      verifactu_timestamp: ts3,
    },
  ];

  const result = await verifyInvoiceChain(chain);
  assert.equal(result.isValid, true);
  assert.equal(result.verifiedCount, 3);
});

test('verifyInvoiceChain fails immediately if an intermediate invoice total is altered by 1 cent', async () => {
  const ts1 = '2026-11-25T10:00:00Z';
  const ts2 = '2026-11-25T11:00:00Z';

  const c1 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'EXP-0001',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 21.0,
    totalAmount: 121.0,
    prevHash: '',
    isoTimestamp: ts1,
  });
  const h1 = await computeVerifactuSha256(c1);

  const c2 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'EXP-0002',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 21.0,
    totalAmount: 121.0,
    prevHash: h1,
    isoTimestamp: ts2,
  });
  const h2 = await computeVerifactuSha256(c2);

  const chain: MinimalVerifactuInvoice[] = [
    {
      id: 'inv-1',
      invoice_number: 'EXP-0001',
      series: 'EXP',
      sequence_number: 1,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121,
      verifactu_locked: true,
      verifactu_hash: h1,
      verifactu_prev_hash: '',
      verifactu_timestamp: ts1,
    },
    {
      id: 'inv-2',
      invoice_number: 'EXP-0002',
      series: 'EXP',
      sequence_number: 2,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121.01, // Tampered: +0.01 €
      verifactu_locked: true,
      verifactu_hash: h2,
      verifactu_prev_hash: h1,
      verifactu_timestamp: ts2,
    },
  ];

  const result = await verifyInvoiceChain(chain);
  assert.equal(result.isValid, false);
  assert.equal(result.brokenInvoiceId, 'inv-2');
  assert.match(result.error || '', /Alteración de integridad/);
});

test('verifyInvoiceChain fails if the cryptographic chain link is broken (prev_hash altered)', async () => {
  const ts1 = '2026-11-25T10:00:00Z';
  const ts2 = '2026-11-25T11:00:00Z';

  const c1 = buildVerifactuCanonicalString({
    issuerTaxId: 'B99887762',
    invoiceNumber: 'EXP-0001',
    issueDate: '2026-11-25',
    invoiceType: 'F1',
    vatTotal: 21.0,
    totalAmount: 121.0,
    prevHash: '',
    isoTimestamp: ts1,
  });
  const h1 = await computeVerifactuSha256(c1);

  const chain: MinimalVerifactuInvoice[] = [
    {
      id: 'inv-1',
      invoice_number: 'EXP-0001',
      series: 'EXP',
      sequence_number: 1,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121,
      verifactu_locked: true,
      verifactu_hash: h1,
      verifactu_prev_hash: '',
      verifactu_timestamp: ts1,
    },
    {
      id: 'inv-2',
      invoice_number: 'EXP-0002',
      series: 'EXP',
      sequence_number: 2,
      document_type: 'normal',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762', name: 'Emisor SL' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121,
      verifactu_locked: true,
      verifactu_hash: 'SOME_FAKE_HASH',
      verifactu_prev_hash: 'WRONG_PREV_HASH', // Broken chain link
      verifactu_timestamp: ts2,
    },
  ];

  const result = await verifyInvoiceChain(chain);
  assert.equal(result.isValid, false);
  assert.equal(result.brokenInvoiceId, 'inv-2');
  assert.match(result.error || '', /Ruptura en la cadena criptográfica/);
});

test('verifyInvoiceChain ignores proformas, albaranes and migrated documents', async () => {
  const chain: MinimalVerifactuInvoice[] = [
    {
      id: 'prof-1',
      invoice_number: 'PRO-0001',
      series: 'PRO',
      sequence_number: 1,
      document_type: 'proforma',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762' },
      tax_base: 100,
      vat_total: 21,
      total_amount: 121,
      verifactu_locked: false,
    },
    {
      id: 'alb-1',
      invoice_number: 'ALB-0001',
      series: 'ALB',
      sequence_number: 1,
      document_type: 'albaran',
      issue_date: '2026-11-25',
      issuer_snapshot: { tax_id: 'B99887762' },
      tax_base: 100,
      vat_total: 0,
      total_amount: 100,
      verifactu_locked: false,
    },
  ];

  const result = await verifyInvoiceChain(chain);
  assert.equal(result.isValid, true);
  assert.equal(result.verifiedCount, 0);
});
