import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateInvoicePdf,
  downloadInvoicePdf,
  sanitizePdfFileName,
} from './invoicePdfService';
import type { IssuedInvoice } from '../types';

function createMockInvoice(overrides: Partial<IssuedInvoice> = {}): IssuedInvoice {
  return {
    id: 'inv-test-1',
    number: 'CC-2026-0001',
    series: 'CC-2026',
    sequenceNumber: 1,
    documentType: 'normal',
    clientId: 'cli-1',
    clientName: 'Cliente Ejemplo S.L.',
    clientNif: 'B12345678',
    activity: 'Contabilidad Comunidades',
    issueDate: '2026-03-15',
    dueDate: '2026-04-15',
    lines: [
      { id: 'l-1', description: 'Servicios contables mensuales', quantity: 1, unitPrice: 100 },
      { id: 'l-2', description: 'Asesoría fiscal trimestral', quantity: 2, unitPrice: 50 },
    ],
    ivaRate: 21,
    irpfRate: 0,
    status: 'Pendiente',
    veriFactuLocked: true,
    veriFactuHash: 'D9B1842838C61D4C667468175510617F6A34F9AE157A3D365314782F482F62DA',
    veriFactuTimestamp: '2026-03-15T10:00:00Z',
    verifactuQrUrl: 'https://sede.agenciatributaria.gob.es/test',
    isMigrated: false,
    issuerSnapshot: {
      name: 'Mi Empresa Asesores S.L.',
      tax_id: 'B99887766',
      address: 'Calle Mayor 10',
      city: 'Madrid',
      postal_code: '28001',
      email: 'facturacion@miempresa.com',
      iban: 'ES9121000418450200051332',
    },
    clientSnapshot: {
      name: 'Cliente Ejemplo S.L.',
      tax_id: 'B12345678',
      address: 'Gran Vía 45',
      city: 'Madrid',
      postal_code: '28013',
      email: 'contabilidad@cliente.com',
    },
    taxBase: 200,
    vatTotal: 42,
    irpfTotal: 0,
    totalAmount: 242,
    ...overrides,
  };
}

test('sanitizePdfFileName normalizes and removes invalid characters', () => {
  assert.equal(
    sanitizePdfFileName('CC/2026/0001', 'Acme Corp S.L.'),
    'CC-2026-0001_Acme_Corp_S.L..pdf'
  );

  // Removes diacritics and special characters
  assert.equal(
    sanitizePdfFileName('REC:2026*002', 'Construcción & Diseño?'),
    'REC-2026-002_Construccion_&_Diseno.pdf'
  );

  // Handles missing or empty client name
  assert.equal(sanitizePdfFileName('ALB-0005', ''), 'ALB-0005.pdf');
  assert.equal(sanitizePdfFileName('', 'Cliente'), 'Factura_Cliente.pdf');
});

test('generateInvoicePdf generates valid %PDF- header for normal VeriFactu locked invoice', () => {
  const inv = createMockInvoice({
    documentType: 'normal',
    veriFactuLocked: true,
    isMigrated: false,
  });

  const doc = generateInvoicePdf(inv);
  const arrayBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  const header = String.fromCharCode(...bytes.slice(0, 5));

  assert.equal(header, '%PDF-');
  assert.ok(bytes.length > 1000, 'PDF should have significant binary content');
  assert.equal(doc.getNumberOfPages(), 1);
});

test('generateInvoicePdf generates valid PDF for rectificativa invoice', () => {
  const inv = createMockInvoice({
    documentType: 'rectificativa',
    number: 'REC-2026-0001',
    rectifiedInvoiceId: 'CC-2026-0001',
    rectificationReason: 'Corrección de tipo de IVA aplicado',
    veriFactuLocked: true,
    isMigrated: false,
  });

  const doc = generateInvoicePdf(inv);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const header = String.fromCharCode(...bytes.slice(0, 5));

  assert.equal(header, '%PDF-');
  assert.ok(bytes.length > 1000);
});

test('generateInvoicePdf generates valid PDF for proforma and albaran without crashing', () => {
  // Proforma
  const proforma = createMockInvoice({
    documentType: 'proforma',
    number: 'PROF-2026-0001',
    veriFactuLocked: false,
  });
  const docPro = generateInvoicePdf(proforma);
  assert.equal(String.fromCharCode(...new Uint8Array(docPro.output('arraybuffer')).slice(0, 5)), '%PDF-');

  // Albarán non-valued
  const albaranNonValued = createMockInvoice({
    documentType: 'albaran',
    number: 'ALB-2026-0001',
    isValued: false,
    veriFactuLocked: false,
  });
  const docAlb = generateInvoicePdf(albaranNonValued);
  assert.equal(String.fromCharCode(...new Uint8Array(docAlb.output('arraybuffer')).slice(0, 5)), '%PDF-');
});

test('generateInvoicePdf generates valid PDF for migrated invoice (isMigrated === true)', () => {
  const migratedInv = createMockInvoice({
    documentType: 'normal',
    number: 'FAC-2025-0999',
    isMigrated: true,
    veriFactuLocked: true,
  });

  const doc = generateInvoicePdf(migratedInv);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
});

test('generateInvoicePdf handles completely missing optional fields gracefully', () => {
  const minimalInvoice: IssuedInvoice = {
    id: 'inv-min-1',
    number: 'INV-MIN-01',
    series: 'CC',
    documentType: 'normal',
    clientId: 'cli-x',
    clientName: '',
    clientNif: '',
    activity: 'Actividad Principal',
    issueDate: '2026-01-01',
    dueDate: '',
    lines: [],
    ivaRate: 21,
    irpfRate: 0,
    status: 'Pendiente',
    veriFactuLocked: false,
  };

  const doc = generateInvoicePdf(minimalInvoice);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  assert.equal(doc.getNumberOfPages(), 1);
});

test('generateInvoicePdf automatically paginates invoices with many lines', () => {
  const manyLines = Array.from({ length: 45 }, (_, i) => ({
    id: `line-${i + 1}`,
    description: `Concepto extendido de facturación con desglose de servicios prestados número ${i + 1}`,
    quantity: 1,
    unitPrice: 25,
  }));

  const largeInvoice = createMockInvoice({
    lines: manyLines,
    taxBase: 45 * 25,
    vatTotal: 45 * 25 * 0.21,
    totalAmount: 45 * 25 * 1.21,
  });

  const doc = generateInvoicePdf(largeInvoice);
  assert.ok(doc.getNumberOfPages() > 1, `Large invoice should have multiple pages, got ${doc.getNumberOfPages()}`);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
});

test('downloadInvoicePdf returns valid blob, fileName and success', () => {
  const inv = createMockInvoice();
  const result = downloadInvoicePdf(inv);

  assert.equal(result.success, true);
  assert.equal(result.fileName, 'CC-2026-0001_Cliente_Ejemplo_S.L..pdf');
  assert.ok(result.blob instanceof Blob);
  assert.ok(result.blob.size > 1000);
});
