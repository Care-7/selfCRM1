import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePgcJournalEntries,
  generateAccountingSnapshot,
  exportJournalCsv,
} from './pgcAccounting';
import type { IssuedInvoice, ReceivedInvoice } from '../types';

test('generatePgcJournalEntries ensures Debe === Haber in every entry without exception', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-001',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-10',
      dueDate: '2026-02-10',
      lines: [],
      ivaRate: 21,
      irpfRate: 15, // Has IRPF
      taxBase: 1000,
      vatTotal: 210,
      irpfTotal: 150,
      totalAmount: 1060, // 1000 + 210 - 150
      status: 'Cobrada', // Triggers cobro entry
      veriFactuLocked: true,
    },
    {
      id: 'inv-rec',
      number: 'REC-001',
      series: 'REC',
      documentType: 'rectificativa',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-15',
      dueDate: '2026-02-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: -300,
      vatTotal: -63,
      irpfTotal: 0,
      totalAmount: -363,
      status: 'Pendiente',
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-1',
      number: 'G-001',
      supplierId: 's1',
      supplierName: 'Proveedor 1',
      supplierNif: 'A99999999',
      activity: 'Actividad General',
      issueDate: '2026-01-20',
      accountingDate: '2026-01-20',
      concept: 'Alquiler local',
      pgcAccountCode: '621',
      pgcAccountName: 'Arrendamientos y cánones',
      baseAmount: 800,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'paid', // Triggers pago entry
    },
  ];

  const entries = generatePgcJournalEntries(issued, received);

  assert.equal(entries.length, 5, 'Should generate 2 emission, 1 credit note, 1 collection and 1 payment entry');

  for (const entry of entries) {
    assert.equal(entry.isBalanced, true, `Entry #${entry.entryNumber} (${entry.concept}) must be balanced`);
    assert.equal(entry.totalDebe, entry.totalHaber, `Debe (${entry.totalDebe}) must match Haber (${entry.totalHaber}) in entry #${entry.entryNumber}`);
  }
});

test('NRV 12ª PGC: Non-deductible VAT is recognized as higher expense in group 6', () => {
  const received: ReceivedInvoice[] = [
    {
      id: 'exp-vehicle',
      number: 'VEH-001',
      supplierId: 's-veh',
      supplierName: 'Gasolinera S.A.',
      supplierNif: 'A12345678',
      activity: 'General',
      issueDate: '2026-02-01',
      accountingDate: '2026-02-01',
      concept: 'Combustible turismo mixto',
      pgcAccountCode: '628',
      pgcAccountName: 'Suministros',
      baseAmount: 100,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 50, // 50% vehicle rule
      deductibleExpensePct: 50,
      paymentStatus: 'pending',
    },
  ];

  const entries = generatePgcJournalEntries([], received);
  const entry = entries[0];

  // Base: 100 €. Total VAT: 21 €.
  // Deductible VAT: 50% of 21 = 10.50 € (account 472)
  // Non-deductible VAT: 10.50 € (added to account 628: 100 + 10.50 = 110.50 €)
  // Account 410 (Acreedor): 121 €
  const line628 = entry.lines.find((l) => l.accountCode === '628')!;
  const line472 = entry.lines.find((l) => l.accountCode === '472')!;
  const line410 = entry.lines.find((l) => l.accountCode === '410')!;

  assert.equal(line628.debe, 110.5);
  assert.equal(line472.debe, 10.5);
  assert.equal(line410.haber, 121);
  assert.equal(entry.totalDebe, 121);
  assert.equal(entry.totalHaber, 121);
  assert.equal(entry.isBalanced, true);
});

test('generateAccountingSnapshot guarantees Activo === Patrimonio Neto + Pasivo', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-001',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'B12345678',
      activity: 'General',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1500,
      vatTotal: 315,
      totalAmount: 1815,
      status: 'Cobrada', // Bank +1815, Clientes 0
      veriFactuLocked: true,
    },
    {
      id: 'inv-2',
      number: 'FAC-002',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c2',
      clientName: 'Cliente 2',
      clientNif: 'B22222222',
      activity: 'General',
      issueDate: '2026-03-15',
      dueDate: '2026-04-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 15,
      taxBase: 1000,
      vatTotal: 210,
      irpfTotal: 150,
      totalAmount: 1060,
      status: 'Pendiente', // Clientes +1060, HP Retenciones 473 +150
      veriFactuLocked: true,
    },
    {
      id: 'inv-rec',
      number: 'REC-001',
      series: 'REC',
      documentType: 'rectificativa',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'B12345678',
      activity: 'General',
      issueDate: '2026-03-20',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: -200,
      vatTotal: -42,
      totalAmount: -242,
      status: 'Pendiente', // Clientes -242
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-1',
      number: 'G-001',
      supplierId: 's1',
      supplierName: 'Asesoría',
      supplierNif: 'B33333333',
      activity: 'General',
      issueDate: '2026-03-10',
      accountingDate: '2026-03-10',
      concept: 'Gestión mensual',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios profesionales',
      baseAmount: 400,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'paid', // Bank -424, 4751 +60
    },
    {
      id: 'exp-2',
      number: 'G-002',
      supplierId: 's2',
      supplierName: 'Software Cloud',
      supplierNif: 'B44444444',
      activity: 'General',
      issueDate: '2026-03-25',
      accountingDate: '2026-03-25',
      concept: 'Servidores cloud',
      pgcAccountCode: '629',
      pgcAccountName: 'Otros servicios',
      baseAmount: 300,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'pending', // 410 +363
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    period: '1T',
  });

  // Verify Trial Balance
  assert.equal(snapshot.trialBalance.isBalanced, true);
  assert.equal(snapshot.trialBalance.totalDebit, snapshot.trialBalance.totalCredit);
  assert.equal(snapshot.trialBalance.totalDebitBalance, snapshot.trialBalance.totalCreditBalance);

  // Fundamental Accounting Equation
  const { balanceSheet } = snapshot;
  assert.equal(balanceSheet.isBalanced, true);
  assert.equal(
    balanceSheet.totalActivo,
    balanceSheet.totalPasivoYPatrimonio,
    `Total Activo (${balanceSheet.totalActivo}) must equal Total Pasivo + PN (${balanceSheet.totalPasivoYPatrimonio})`
  );
});

test('generateAccountingSnapshot strictly excludes proforma and albaran', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'prof-1',
      number: 'PROF-001',
      series: 'PROF',
      documentType: 'proforma',
      clientId: 'c1',
      clientName: 'Cliente Proforma',
      clientNif: 'B11111111',
      activity: 'General',
      issueDate: '2026-01-10',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 50000,
      vatTotal: 10500,
      totalAmount: 60500,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
    {
      id: 'alb-1',
      number: 'ALB-001',
      series: 'ALB',
      documentType: 'albaran',
      clientId: 'c2',
      clientName: 'Cliente Albaran',
      clientNif: 'B22222222',
      activity: 'General',
      issueDate: '2026-01-12',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 30000,
      vatTotal: 6300,
      totalAmount: 36300,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: issued,
    receivedInvoices: [],
    year: 2026,
    period: 'ALL',
  });

  assert.equal(snapshot.journalEntries.length, 0, 'No journal entries should be created for proformas or albaranes');
  assert.equal(snapshot.profitAndLoss.operatingRevenue, 0);
  assert.equal(snapshot.balanceSheet.totalActivo, 0);
  assert.equal(snapshot.balanceSheet.totalPasivoYPatrimonio, 0);
  assert.equal(snapshot.balanceSheet.isBalanced, true);
});

test('generateAccountingSnapshot protects all financial ratios against NaN and Infinity with empty dataset', () => {
  const snapshot = generateAccountingSnapshot({
    issuedInvoices: [],
    receivedInvoices: [],
    year: 2026,
    period: 'ALL',
  });

  const { financialRatios, balanceSheet } = snapshot;

  assert.equal(Number.isNaN(financialRatios.liquidezGeneral), false);
  assert.equal(Number.isFinite(financialRatios.liquidezGeneral), true);
  assert.equal(financialRatios.liquidezGeneral, 0);

  assert.equal(Number.isNaN(financialRatios.margenNetoPct), false);
  assert.equal(Number.isFinite(financialRatios.margenNetoPct), true);
  assert.equal(financialRatios.margenNetoPct, 0);

  assert.equal(Number.isNaN(financialRatios.periodoMedioCobroDias), false);
  assert.equal(Number.isFinite(financialRatios.periodoMedioCobroDias), true);
  assert.equal(financialRatios.periodoMedioCobroDias, 0);

  assert.equal(Number.isNaN(financialRatios.periodoMedioPagoDias), false);
  assert.equal(Number.isFinite(financialRatios.periodoMedioPagoDias), true);
  assert.equal(financialRatios.periodoMedioPagoDias, 0);

  assert.equal(balanceSheet.isBalanced, true);
  assert.equal(balanceSheet.totalActivo, 0);
  assert.equal(balanceSheet.totalPasivoYPatrimonio, 0);
});

test('exportJournalCsv outputs valid UTF-8 BOM with semicolon separator and DD/MM/YYYY dates', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-001',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'General',
      issueDate: '2026-05-15',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
      status: 'Pendiente',
      veriFactuLocked: true,
    },
  ];

  const entries = generatePgcJournalEntries(issued, []);
  const csv = exportJournalCsv(entries);

  assert.equal(csv.charCodeAt(0), 0xfeff, 'Must start with UTF-8 BOM');
  assert.ok(csv.includes('Asiento;Fecha;Cuenta;Descripcion_Cuenta;Concepto;Documento;Debe;Haber'));
  assert.ok(csv.includes('15/05/2026;430;Clientes;Emisión Factura FAC-001;FAC-001;1210,00;0,00'));
});
