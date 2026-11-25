import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIssuedBookCsv,
  generateReceivedBookCsv,
  formatAeatDate,
  formatAeatAmount,
  escapeCsvCell,
  getQuarterFromIsoDate,
} from './aeatBooksExportService';
import type { IssuedInvoice, ReceivedInvoice } from '../types';

test('formatAeatDate converts YYYY-MM-DD to DD/MM/YYYY', () => {
  assert.equal(formatAeatDate('2026-03-15'), '15/03/2026');
  assert.equal(formatAeatDate('2026-10-01T12:00:00Z'), '01/10/2026');
  assert.equal(formatAeatDate(''), '');
});

test('formatAeatAmount formats with 2 decimals and comma without thousand separators', () => {
  assert.equal(formatAeatAmount(1250.5), '1250,50');
  assert.equal(formatAeatAmount(0), '0,00');
  assert.equal(formatAeatAmount(-42.1), '-42,10');
});

test('getQuarterFromIsoDate returns exact Spanish quarter', () => {
  assert.equal(getQuarterFromIsoDate('2026-01-15'), '1T');
  assert.equal(getQuarterFromIsoDate('2026-03-31'), '1T');
  assert.equal(getQuarterFromIsoDate('2026-04-01'), '2T');
  assert.equal(getQuarterFromIsoDate('2026-06-30'), '2T');
  assert.equal(getQuarterFromIsoDate('2026-07-01'), '3T');
  assert.equal(getQuarterFromIsoDate('2026-09-30'), '3T');
  assert.equal(getQuarterFromIsoDate('2026-10-01'), '4T');
  assert.equal(getQuarterFromIsoDate('2026-12-31'), '4T');
});

test('generateIssuedBookCsv strictly excludes proforma and albaran and formats valid AEAT CSV', () => {
  const invoices: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'CC-2026-0001',
      series: 'CC-2026',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente Uno S.L.',
      clientNif: 'B12345678',
      activity: 'Actividad Empresarial',
      issueDate: '2026-02-10',
      dueDate: '2026-03-10',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      irpfTotal: 0,
      totalAmount: 1210,
      status: 'Cobrada',
      veriFactuLocked: true,
      veriFactuHash: 'HASH123456',
      isMigrated: false,
    },
    {
      id: 'inv-rec',
      number: 'REC-2026-0001',
      series: 'REC-2026',
      documentType: 'rectificativa',
      clientId: 'c1',
      clientName: 'Cliente Uno S.L.',
      clientNif: 'B12345678',
      activity: 'Actividad Empresarial',
      issueDate: '2026-02-15',
      dueDate: '2026-03-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: -200,
      vatTotal: -42,
      irpfTotal: 0,
      totalAmount: -242,
      status: 'Pendiente',
      veriFactuLocked: true,
      veriFactuHash: 'HASHREC',
      isMigrated: false,
    },
    {
      id: 'inv-prof',
      number: 'PROF-2026-0001',
      series: 'PROF-2026',
      documentType: 'proforma',
      clientId: 'c1',
      clientName: 'Cliente Proforma S.L.',
      clientNif: 'B99999999',
      activity: 'Actividad Empresarial',
      issueDate: '2026-02-20',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 5000,
      vatTotal: 1050,
      totalAmount: 6050,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
    {
      id: 'inv-alb',
      number: 'ALB-2026-0001',
      series: 'ALB-2026',
      documentType: 'albaran',
      clientId: 'c1',
      clientName: 'Cliente Albaran S.L.',
      clientNif: 'B88888888',
      activity: 'Actividad Empresarial',
      issueDate: '2026-02-22',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 3000,
      vatTotal: 630,
      totalAmount: 3630,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
  ];

  const csv = generateIssuedBookCsv(invoices, { year: 2026, period: '1T' });

  // 1. Check UTF-8 BOM
  assert.equal(csv.charCodeAt(0), 0xfeff, 'Must start with UTF-8 BOM character');

  // 2. Check lines
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3, 'Header + 2 fiscal invoices (normal + rectificativa)');

  // 3. Check headers and separator
  assert.ok(lines[0].startsWith('\uFEFFEjercicio;Periodo;Actividad_IAE;'));

  // 4. Verify proforma and albaran are strictly excluded
  assert.ok(!csv.includes('PROF-2026-0001'), 'Proforma must never be included');
  assert.ok(!csv.includes('ALB-2026-0001'), 'Albarán must never be included');

  // 5. Verify normal invoice row
  assert.ok(csv.includes('2026;1T;Actividad Empresarial;10/02/2026;F1;CC-2026-0001;B12345678;Cliente Uno S.L.;1000,00;21,00;210,00;0,00;1210,00;Cobrada;Sello VeriFactu;HASH123456'));

  // 6. Verify rectificativa has R1
  assert.ok(csv.includes(';R1;REC-2026-0001;'));
});

test('generateReceivedBookCsv respects accounting_date and applies deductibility percentages', () => {
  const expenses: ReceivedInvoice[] = [
    {
      id: 'exp-1',
      number: 'SUP-001',
      supplierId: 's1',
      supplierName: 'Suministros Eléctricos S.A.',
      supplierNif: 'A11223344',
      activity: 'Actividad Principal',
      issueDate: '2026-01-20',
      accountingDate: '2026-04-05', // Deferred: Q2 accounting date!
      concept: 'Electricidad nave',
      pgcAccountCode: '628',
      pgcAccountName: 'Suministros',
      baseAmount: 100,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 50, // 50% vehicle/mixed rule
      deductibleExpensePct: 50,
      paymentStatus: 'paid',
    },
    {
      id: 'exp-2',
      number: 'PROF-002',
      supplierId: 's2',
      supplierName: 'Abogado Consultor',
      supplierNif: '12345678Z',
      activity: 'Actividad Principal',
      issueDate: '2026-02-10',
      accountingDate: '2026-02-10', // Q1
      concept: 'Asesoría legal',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios profesionales',
      baseAmount: 200,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'paid',
    },
  ];

  // Q1 export: exp-1 was issued in Jan, but accounting_date is in April (Q2), so ONLY exp-2 must be present in Q1
  const q1Csv = generateReceivedBookCsv(expenses, { year: 2026, period: '1T' });
  assert.ok(!q1Csv.includes('SUP-001'), 'Deferred expense must not be included in Q1');
  assert.ok(q1Csv.includes('PROF-002'), 'Q1 expense must be included in Q1');

  // Q2 export: exp-1 should be present in Q2
  const q2Csv = generateReceivedBookCsv(expenses, { year: 2026, period: '2T' });
  assert.ok(q2Csv.includes('SUP-001'), 'Deferred expense must appear in Q2');
  // Check 50% deductibility in row:
  // Base 100,00; Tipo IVA 21,00; Cuota IVA Soportado 21,00; Pct IVA Ded 50,00; Cuota IVA Ded 10,50
  assert.ok(q2Csv.includes(';100,00;21,00;21,00;50,00;10,50;0,00;50,00;50,00;121,00;Pagada'));
});
