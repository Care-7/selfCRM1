import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceRowToIssuedInvoice,
  createIssuerSnapshot,
  createClientSnapshot,
  convertInvoiceLinesToDbItems,
} from './invoiceMappers';
import type { IssuedInvoiceRow, BusinessActivity } from '../types/database';
import type { InvoiceLine } from '../types';

test('invoiceRowToIssuedInvoice correctly maps a normal VeriFactu locked invoice', () => {
  const activities: BusinessActivity[] = [
    {
      id: 'd9b2d67d-6f77-44aa-b413-5683921b79f1',
      organization_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      name: 'Actividad de Consultoría',
      iae_code: '799',
      invoice_series_prefix: 'CONS',
      default_vat_rate: 21,
      default_irpf_rate: 15,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const row: IssuedInvoiceRow = {
    id: 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b',
    organization_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    activity_id: 'd9b2d67d-6f77-44aa-b413-5683921b79f1',
    client_id: 'f3a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b7c',
    document_type: 'normal',
    series: 'CONS-2026',
    sequence_number: 1,
    invoice_number: 'CONS-2026-0001',
    issue_date: '2026-03-15',
    due_date: '2026-04-15',
    paid_at: null,
    issuer_snapshot: {
      name: 'Carlos Asesor SL',
      tax_id: 'B12345678',
      legal_form: 'SL',
      email: 'carlos@empresa.es',
    },
    client_snapshot: {
      name: 'Cliente Alpha SL',
      tax_id: 'B87654321',
      address: 'Calle Mayor 1',
    },
    lines: [
      {
        id: 'line-1',
        description: 'Servicios de asesoramiento fiscal',
        quantity: 2,
        unit_price: 500,
        vat_rate: 21,
        irpf_rate: 15,
        tax_base: 1000,
        vat_amount: 210,
        irpf_amount: 150,
        total: 1060,
      },
    ],
    tax_base: 1000,
    vat_total: 210,
    irpf_total: 150,
    total_amount: 1060,
    payment_status: 'pending',
    payment_method: 'transferencia',
    notes: 'Pago a 30 días',
    verifactu_locked: true,
    verifactu_hash: 'A'.repeat(64),
    verifactu_prev_hash: '',
    verifactu_timestamp: '2026-03-15T10:00:00Z',
    verifactu_qr_url: 'https://sede.agenciatributaria.gob.es/test',
    verifactu_status: 'generated',
    rectified_invoice_id: null,
    rectification_reason: null,
    converted_from_id: null,
    is_migrated: false,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
  };

  const invoice = invoiceRowToIssuedInvoice(row, activities);

  assert.equal(invoice.id, row.id);
  assert.equal(invoice.number, 'CONS-2026-0001');
  assert.equal(invoice.series, 'CONS-2026');
  assert.equal(invoice.sequenceNumber, 1);
  assert.equal(invoice.documentType, 'normal');
  assert.equal(invoice.clientName, 'Cliente Alpha SL');
  assert.equal(invoice.clientNif, 'B87654321');
  assert.equal(invoice.activity, 'Actividad de Consultoría');
  assert.equal(invoice.activityId, 'd9b2d67d-6f77-44aa-b413-5683921b79f1');
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0].description, 'Servicios de asesoramiento fiscal');
  assert.equal(invoice.lines[0].quantity, 2);
  assert.equal(invoice.lines[0].unitPrice, 500);
  assert.equal(invoice.ivaRate, 21);
  assert.equal(invoice.irpfRate, 15);
  assert.equal(invoice.status, 'Pendiente');
  assert.equal(invoice.veriFactuLocked, true);
  assert.equal(invoice.veriFactuHash, 'A'.repeat(64));
  assert.equal(invoice.verifactuQrUrl, 'https://sede.agenciatributaria.gob.es/test');
  assert.equal(invoice.taxBase, 1000);
  assert.equal(invoice.vatTotal, 210);
  assert.equal(invoice.irpfTotal, 150);
  assert.equal(invoice.totalAmount, 1060);
});

test('invoiceRowToIssuedInvoice correctly maps a Rectificativa invoice', () => {
  const row: IssuedInvoiceRow = {
    id: 'rect-uuid-1234',
    organization_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    activity_id: null,
    client_id: null,
    document_type: 'rectificativa',
    series: 'RECT-2026',
    sequence_number: 1,
    invoice_number: 'RECT-2026-0001',
    issue_date: '2026-03-20',
    due_date: '2026-03-20',
    paid_at: '2026-03-20T12:00:00Z',
    issuer_snapshot: { name: 'Empresa Emisora', tax_id: 'B12345678' },
    client_snapshot: { name: 'Cliente Rectificado', tax_id: 'B99999999' },
    lines: [
      {
        id: 'line-rect-1',
        description: 'Abono total factura CONS-2026-0001 por devolución',
        quantity: -1,
        unit_price: 500,
        vat_rate: 21,
        irpf_rate: 15,
        tax_base: -500,
        vat_amount: -105,
        irpf_amount: -75,
        total: -530,
      },
    ],
    tax_base: -500,
    vat_total: -105,
    irpf_total: -75,
    total_amount: -530,
    payment_status: 'paid',
    payment_method: null,
    notes: null,
    verifactu_locked: true,
    verifactu_hash: 'B'.repeat(64),
    verifactu_prev_hash: 'A'.repeat(64),
    verifactu_timestamp: '2026-03-20T12:00:00Z',
    verifactu_qr_url: null,
    verifactu_status: 'generated',
    rectified_invoice_id: 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b',
    rectification_reason: 'Devolución completa de mercancía / anulación de servicio',
    converted_from_id: null,
    is_migrated: false,
    created_at: '2026-03-20T12:00:00Z',
    updated_at: '2026-03-20T12:00:00Z',
  };

  const invoice = invoiceRowToIssuedInvoice(row, []);

  assert.equal(invoice.documentType, 'rectificativa');
  assert.equal(invoice.status, 'Cobrada'); // payment_status 'paid' overrides
  assert.equal(invoice.rectifiedInvoiceId, 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b');
  assert.equal(
    invoice.rectificationReason,
    'Devolución completa de mercancía / anulación de servicio'
  );
  assert.equal(invoice.totalAmount, -530);
  assert.equal(invoice.lines[0].quantity, -1);
  assert.equal(invoice.veriFactuLocked, true);
  assert.equal(invoice.verifactuPrevHash, 'A'.repeat(64));
});

test('invoiceRowToIssuedInvoice preserves 0% tax exemptions', () => {
  const row: IssuedInvoiceRow = {
    id: 'exempt-uuid-1234',
    organization_id: 'org-1',
    activity_id: null,
    client_id: null,
    document_type: 'normal',
    series: 'F-2026',
    sequence_number: 2,
    invoice_number: 'F-2026-0002',
    issue_date: '2026-03-22',
    due_date: '2026-03-22',
    paid_at: null,
    issuer_snapshot: { name: 'Formador', tax_id: '12345678Z' },
    client_snapshot: { name: 'Academia', tax_id: 'B11223344' },
    lines: [
      {
        id: 'line-ex-1',
        description: 'Cursos formativos reglados (exentos de IVA)',
        quantity: 1,
        unit_price: 1200,
        vat_rate: 0,
        irpf_rate: 0,
        tax_base: 1200,
        vat_amount: 0,
        irpf_amount: 0,
        total: 1200,
      },
    ],
    tax_base: 1200,
    vat_total: 0,
    irpf_total: 0,
    total_amount: 1200,
    payment_status: 'pending',
    payment_method: null,
    notes: null,
    verifactu_locked: false,
    verifactu_hash: null,
    verifactu_prev_hash: null,
    verifactu_timestamp: null,
    verifactu_qr_url: null,
    verifactu_status: 'not_applicable',
    rectified_invoice_id: null,
    rectification_reason: null,
    converted_from_id: null,
    is_migrated: false,
    created_at: '2026-03-22T10:00:00Z',
    updated_at: '2026-03-22T10:00:00Z',
  };

  const invoice = invoiceRowToIssuedInvoice(row, []);
  assert.equal(invoice.ivaRate, 0);
  assert.equal(invoice.irpfRate, 0);
  assert.equal(invoice.status, 'Borrador');
});

test('createIssuerSnapshot extracts details properly', () => {
  const org = {
    id: 'org-1',
    name: 'Consultoría Balear SL',
    tax_id: 'B07123456',
    legal_form: 'sl' as const,
    tax_periodicity: 'quarterly' as const,
    created_at: '',
    updated_at: '',
  };
  const profile = {
    id: 'user-1',
    organization_id: 'org-1',
    full_name: 'Joan Oliver',
    email: 'joan@balear.es',
    role: 'owner' as const,
    is_superadmin: false,
    created_at: '',
    updated_at: '',
  };

  const snapshot = createIssuerSnapshot(org, profile);
  assert.equal(snapshot.name, 'Consultoría Balear SL');
  assert.equal(snapshot.tax_id, 'B07123456');
  assert.equal(snapshot.legal_form, 'sl');
  assert.equal(snapshot.email, 'joan@balear.es');
});

test('createClientSnapshot trims and normalizes tax ID', () => {
  const snapshot = createClientSnapshot({
    name: '   María García Santos   ',
    nif: '  01234567l  ',
    address: '  C/ Gran Vía 12  ',
    email: '  maria@example.com  ',
  });

  assert.equal(snapshot.name, 'María García Santos');
  assert.equal(snapshot.tax_id, '01234567L');
  assert.equal(snapshot.address, 'C/ Gran Vía 12');
  assert.equal(snapshot.email, 'maria@example.com');
});

test('convertInvoiceLinesToDbItems calculates taxes and rounds correctly', () => {
  const uiLines: InvoiceLine[] = [
    {
      id: 'ui-1',
      description: 'Honorarios profesionales',
      quantity: 3,
      unitPrice: 150.33,
    },
    {
      id: 'ui-2',
      description: 'Gastos de gestión',
      quantity: 1,
      unitPrice: 50,
    },
  ];

  const dbLines = convertInvoiceLinesToDbItems(uiLines, 21, 15);
  assert.equal(dbLines.length, 2);

  // Line 1: 3 * 150.33 = 450.99
  // VAT 21%: 450.99 * 0.21 = 94.7079 -> 94.71
  // IRPF 15%: 450.99 * 0.15 = 67.6485 -> 67.65
  // Total: 450.99 + 94.71 - 67.65 = 478.05
  assert.equal(dbLines[0].tax_base, 450.99);
  assert.equal(dbLines[0].vat_amount, 94.71);
  assert.equal(dbLines[0].irpf_amount, 67.65);
  assert.equal(dbLines[0].total, 478.05);

  // Line 2: 1 * 50 = 50
  // VAT 21%: 10.50
  // IRPF 15%: 7.50
  // Total: 50 + 10.50 - 7.50 = 53
  assert.equal(dbLines[1].tax_base, 50);
  assert.equal(dbLines[1].vat_amount, 10.5);
  assert.equal(dbLines[1].irpf_amount, 7.5);
  assert.equal(dbLines[1].total, 53);
});
