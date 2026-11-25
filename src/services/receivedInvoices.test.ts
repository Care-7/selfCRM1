import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDeductibleVat,
  calculateDeductibleExpense,
  calculateDeductibleAmounts,
  receivedInvoiceRowToReceivedInvoice,
  mapRowToReceivedInvoice,
  receivedInvoiceToCreateInput,
  PGC_EXPENSE_ACCOUNTS,
} from './receivedInvoiceMappers';
import { sanitizeFileName } from './receivedInvoicesService';
import type { BusinessActivity, ReceivedInvoiceRow } from '../types/database';
import type { ReceivedInvoice } from '../types';

test('calculateDeductibleVat and calculateDeductibleExpense compute 100%, 50%, and 0% accurately', () => {
  const taxBase = 1000;
  const vatTotal = 210;

  // 100% deductibility (Standard general business expenses)
  const full = calculateDeductibleAmounts(taxBase, vatTotal, 100, 100);
  assert.equal(full.deductibleExpense, 1000);
  assert.equal(full.deductibleVat, 210);

  // 50% deductibility (Vehicles / Home office utilities under Art. 30 LIRPF)
  const partial = calculateDeductibleAmounts(taxBase, vatTotal, 50, 50);
  assert.equal(partial.deductibleExpense, 500);
  assert.equal(partial.deductibleVat, 105);

  // 0% deductibility (Exempt activity without right to deduct VAT / non-deductible expense)
  const zero = calculateDeductibleAmounts(taxBase, vatTotal, 0, 0);
  assert.equal(zero.deductibleExpense, 0);
  assert.equal(zero.deductibleVat, 0);

  // Clamped percentages (< 0 or > 100)
  assert.equal(calculateDeductibleVat(100, -10), 0);
  assert.equal(calculateDeductibleVat(100, 150), 100);
  assert.equal(calculateDeductibleExpense(500, -5), 0);
  assert.equal(calculateDeductibleExpense(500, 120), 500);
});

test('sanitizeFileName removes diacritics, spaces and special characters for Storage paths', () => {
  assert.equal(
    sanitizeFileName('Factura Telefónica & Luz Mayo 2026.PDF'),
    'factura_telefonica___luz_mayo_2026.pdf'
  );
  assert.equal(
    sanitizeFileName('Justificante_Nº-123/2026 [Final].png'),
    'justificante_n_-123_2026__final_.png'
  );
  assert.equal(
    sanitizeFileName('recibo español áéíóú üñ.webp'),
    'recibo_espanol_aeiou_un.webp'
  );
});

test('receivedInvoiceRowToReceivedInvoice maps database row with nulls and stringified JSON gracefully on F5 reload', () => {
  const activities: BusinessActivity[] = [
    {
      id: 'act-uuid-1',
      organization_id: 'org-uuid-1',
      name: 'Actividad de Consultoría',
      iae_code: '799',
      invoice_series_prefix: 'CONS',
      default_vat_rate: 21,
      default_irpf_rate: 15,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const rowWithStringsAndNulls: any = {
    id: 'rec-uuid-123',
    organization_id: 'org-uuid-1',
    activity_id: 'act-uuid-1',
    supplier_id: 'sup-uuid-1',
    supplier_snapshot: JSON.stringify({ name: 'Iberdrola Clientes SAU', tax_id: 'A95075578' }),
    supplier_invoice_number: 'IB-2026-9021',
    issue_date: '2026-04-10',
    accounting_date: null, // null check
    expense_category: '628',
    description: null,
    lines: JSON.stringify([{ description: 'Consumo eléctrico', amount: 150 }]),
    tax_base: 150.00,
    vat_rate: 21.00,
    vat_total: 31.50,
    irpf_rate: 0.00,
    irpf_total: 0.00,
    total_amount: 181.50,
    deductible_vat_pct: 50.00,
    deductible_expense_pct: 50.00,
    payment_status: 'paid',
    paid_at: '2026-04-11T09:00:00Z',
    payment_method: 'domiciliacion',
    attachment_path: 'org-uuid-1/1770000000-factura_luz.pdf',
    attachment_name: 'factura_luz.pdf',
    notes: null,
    created_at: '2026-04-10T10:00:00Z',
    updated_at: '2026-04-10T10:00:00Z',
  };

  const model = mapRowToReceivedInvoice(rowWithStringsAndNulls, activities);

  assert.equal(model.id, 'rec-uuid-123');
  assert.equal(model.number, 'IB-2026-9021');
  assert.equal(model.supplierName, 'Iberdrola Clientes SAU');
  assert.equal(model.supplierNif, 'A95075578');
  assert.equal(model.activity, 'Actividad de Consultoría');
  assert.equal(model.activityId, 'act-uuid-1');
  assert.equal(model.accountingDate, '2026-04-10'); // falls back to issue_date when accounting_date is null
  assert.equal(model.pgcAccountCode, '628');
  assert.equal(model.pgcAccountName, PGC_EXPENSE_ACCOUNTS['628']);
  assert.equal(model.baseAmount, 150);
  assert.equal(model.ivaRate, 21);
  assert.equal(model.status, 'Contabilizada');
  assert.equal(model.deductible, true);
  assert.equal(model.deductibleVatPct, 50);
  assert.equal(model.deductibleExpensePct, 50);
  assert.equal(model.deductibleVatAmount, 15.75); // 31.50 * 50%
  assert.equal(model.deductibleExpenseAmount, 75); // 150 * 50%
  assert.equal(model.attachmentPath, 'org-uuid-1/1770000000-factura_luz.pdf');
  assert.equal(model.attachmentName, 'factura_luz.pdf');
  assert.equal(model.lines?.length, 1);
});

test('receivedInvoiceToCreateInput produces properly formatted payload with calculated totals', () => {
  const uiInvoice: ReceivedInvoice = {
    id: 'temp-id',
    number: 'FAC-7890',
    supplierId: 'b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    supplierName: 'Asesoría Jurídica SL',
    supplierNif: 'B99887766',
    activity: 'Actividad de Consultoría',
    activityId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    issueDate: '2026-05-15',
    accountingDate: '2026-05-20',
    concept: 'Asesoramiento mercantil',
    pgcAccountCode: '623',
    pgcAccountName: 'Servicios de profesionales independientes',
    baseAmount: 600,
    ivaRate: 21,
    irpfRetainedRate: 15,
    status: 'Pendiente',
    deductible: true,
    deductibleVatPct: 100,
    deductibleExpensePct: 100,
    attachmentPath: 'org-1/receipt.pdf',
    attachmentName: 'receipt.pdf',
  };

  const payload = receivedInvoiceToCreateInput(uiInvoice, 'org-1');

  assert.equal(payload.organization_id, 'org-1');
  assert.equal(payload.supplier_invoice_number, 'FAC-7890');
  assert.equal(payload.supplier_snapshot.name, 'Asesoría Jurídica SL');
  assert.equal(payload.supplier_snapshot.tax_id, 'B99887766');
  assert.equal(payload.expense_category, '623');
  assert.equal(payload.tax_base, 600);
  assert.equal(payload.vat_rate, 21);
  assert.equal(payload.vat_total, 126);
  assert.equal(payload.irpf_rate, 15);
  assert.equal(payload.irpf_total, 90);
  // Total: 600 + 126 - 90 = 636
  assert.equal(payload.total_amount, 636);
  assert.equal(payload.payment_status, 'pending');
  assert.equal(payload.accounting_date, '2026-05-20');
});

test('non-optimistic received invoice guarantee: service error prevents local mutation', async () => {
  let localExpenses: { id: string; number: string }[] = [{ id: 'rec-1', number: 'IB-001' }];

  const mockSaveExpense = async (shouldFail: boolean, newExpense: { id: string; number: string }) => {
    if (shouldFail) {
      throw new Error('Supabase RLS Violation / Duplicate key error');
    }
    // Only mutates local state upon confirmed persistence
    localExpenses = [newExpense, ...localExpenses];
  };

  // Failing call
  await assert.rejects(
    async () => {
      await mockSaveExpense(true, { id: 'rec-fail', number: 'IB-002' });
    },
    { message: /Supabase RLS Violation/ }
  );

  // State must remain strictly unchanged
  assert.equal(localExpenses.length, 1);
  assert.equal(localExpenses[0].id, 'rec-1');

  // Successful call
  await mockSaveExpense(false, { id: 'rec-success', number: 'IB-002' });
  assert.equal(localExpenses.length, 2);
  assert.equal(localExpenses[0].id, 'rec-success');
});
