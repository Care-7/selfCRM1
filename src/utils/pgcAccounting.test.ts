import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePgcJournalEntries,
  generateAccountingSnapshot,
  exportJournalCsv,
  generateGeneralLedger,
  exportGeneralLedgerCsv,
} from './pgcAccounting';
import type { Contact, IssuedInvoice, ReceivedInvoice } from '../types';

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

test('subaccount assignment uses contact account_code in journal entries for emission, cobro, gasto and pago', () => {
  const clients: Contact[] = [
    {
      id: 'client-1',
      name: 'CASA 2A-ODED COHEN',
      nif: 'Y1234567X',
      accountCode: '4300002',
      email: 'oded@example.com',
      address: 'Calle Mayor 1',
      activity: 'General',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      historicalVolume: 0,
      kind: 'cliente',
    },
  ];

  const suppliers: Contact[] = [
    {
      id: 'sup-1',
      name: 'PROVEEDOR SL',
      nif: 'B99887766',
      accountCode: '4100010',
      email: 'prov@example.com',
      address: 'Poligono Industrial 4',
      activity: 'General',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      historicalVolume: 0,
      kind: 'proveedor',
    },
  ];

  const issued: IssuedInvoice[] = [
    {
      id: 'inv-oded',
      number: 'FAC-100',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'client-1',
      clientName: 'CASA 2A-ODED COHEN',
      clientNif: 'Y1234567X',
      activity: 'General',
      issueDate: '2026-03-01',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-prov',
      number: 'EXP-100',
      supplierId: 'sup-1',
      supplierName: 'PROVEEDOR SL',
      supplierNif: 'B99887766',
      activity: 'General',
      issueDate: '2026-03-05',
      accountingDate: '2026-03-05',
      concept: 'Servicios de asesoría',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios de profesionales independientes',
      baseAmount: 500,
      ivaRate: 21,
      paymentStatus: 'paid',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      status: 'Contabilizada',
    },
  ];

  const entries = generatePgcJournalEntries(issued, received, 'Todas las actividades', clients, suppliers);

  // Check emission entry
  const emissionEntry = entries.find((e) => e.id === 'entry-inv-inv-oded');
  assert.ok(emissionEntry);
  const clientLine = emissionEntry.lines.find((l) => l.accountCode === '4300002');
  assert.ok(clientLine, 'Should use 4300002 instead of 430');
  assert.equal(clientLine.accountName, '4300002 - CASA 2A-ODED COHEN');
  assert.equal(clientLine.debe, 1210);

  // Check cobro entry
  const cobroEntry = entries.find((e) => e.id === 'entry-pay-inv-oded');
  assert.ok(cobroEntry);
  const cobroClientLine = cobroEntry.lines.find((l) => l.accountCode === '4300002');
  assert.ok(cobroClientLine, 'Cobro entry must credit 4300002');
  assert.equal(cobroClientLine.haber, 1210);

  // Check expense entry
  const expEntry = entries.find((e) => e.id === 'entry-exp-exp-prov');
  assert.ok(expEntry);
  const supLine = expEntry.lines.find((l) => l.accountCode === '4100010');
  assert.ok(supLine, 'Should use 4100010 instead of 410');
  assert.equal(supLine.accountName, '4100010 - PROVEEDOR SL');

  // Check pago entry
  const pagoEntry = entries.find((e) => e.id === 'entry-exppay-exp-prov');
  assert.ok(pagoEntry);
  const pagoSupLine = pagoEntry.lines.find((l) => l.accountCode === '4100010');
  assert.ok(pagoSupLine, 'Pago entry must debit 4100010');
});

test('Balance Sheet properly groups multiple 430* and 410* subaccounts and keeps Activo === Pasivo + Patrimonio Neto', () => {
  const clients: Contact[] = [
    {
      id: 'c1',
      name: 'Cliente Alpha',
      nif: 'A11111111',
      accountCode: '4300001',
      email: 'a@test.com',
      address: '',
      activity: 'General',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      historicalVolume: 0,
      kind: 'cliente',
    },
    {
      id: 'c2',
      name: 'Cliente Beta',
      nif: 'B22222222',
      accountCode: '4300002',
      email: 'b@test.com',
      address: '',
      activity: 'General',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      historicalVolume: 0,
      kind: 'cliente',
    },
  ];

  const suppliers: Contact[] = [
    {
      id: 's1',
      name: 'Proveedor Gamma',
      nif: 'G33333333',
      accountCode: '4100005',
      email: 'g@test.com',
      address: '',
      activity: 'General',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      historicalVolume: 0,
      kind: 'proveedor',
    },
  ];

  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-1',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente Alpha',
      clientNif: 'A11111111',
      activity: 'General',
      issueDate: '2026-04-10',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 2000,
      vatTotal: 420,
      totalAmount: 2420,
      status: 'Pendiente', // unpaid -> saldo deudor in 4300001
      veriFactuLocked: true,
    },
    {
      id: 'inv-2',
      number: 'FAC-2',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c2',
      clientName: 'Cliente Beta',
      clientNif: 'B22222222',
      activity: 'General',
      issueDate: '2026-04-15',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
      status: 'Pendiente', // unpaid -> saldo deudor in 4300002
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-1',
      number: 'EXP-1',
      supplierId: 's1',
      supplierName: 'Proveedor Gamma',
      supplierNif: 'G33333333',
      activity: 'General',
      issueDate: '2026-04-20',
      accountingDate: '2026-04-20',
      concept: 'Mantenimiento',
      pgcAccountCode: '622',
      pgcAccountName: 'Reparaciones y conservación',
      baseAmount: 600,
      ivaRate: 21,
      paymentStatus: 'pending', // unpaid -> saldo acreedor in 4100005
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      status: 'Contabilizada',
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    period: 'ALL',
    clients,
    suppliers,
  });

  const { balanceSheet, trialBalance } = snapshot;

  assert.equal(balanceSheet.isBalanced, true, 'Balance sheet must balance strictly');
  assert.equal(trialBalance.isBalanced, true, 'Trial balance must balance strictly');

  // Total clients in Activo Corriente should be 2420 + 1210 = 3630
  const clientAssetItem = balanceSheet.activoCorriente.find((i) => i.code === '430');
  assert.ok(clientAssetItem);
  assert.equal(clientAssetItem.amount, 3630);

  // Total creditors in Pasivo Corriente should be 600 + 126 = 726
  const provLiabilityItem = balanceSheet.pasivoCorriente.find((i) => i.code === '410');
  assert.ok(provLiabilityItem);
  assert.equal(provLiabilityItem.amount, 726);

  assert.equal(
    balanceSheet.totalActivo,
    balanceSheet.totalPasivoYPatrimonio,
    `Activo (${balanceSheet.totalActivo}) must equal Pasivo+PN (${balanceSheet.totalPasivoYPatrimonio})`
  );
});

test('generateGeneralLedger calculates accurate chronological running balances and closing balances per account', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-1',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'A11111111',
      activity: 'General',
      issueDate: '2026-01-10',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
      status: 'Cobrada', // Emission on 2026-01-10, cobro on 2026-01-10
      veriFactuLocked: true,
    },
    {
      id: 'inv-2',
      number: 'FAC-2',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'A11111111',
      activity: 'General',
      issueDate: '2026-02-15',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 500,
      vatTotal: 105,
      totalAmount: 605,
      status: 'Pendiente', // Emission only
      veriFactuLocked: true,
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: issued,
    receivedInvoices: [],
    year: 2026,
  });

  const ledger = generateGeneralLedger(snapshot);

  assert.ok(ledger.accounts.length > 0);
  const clientAccount = ledger.accountMap['430'];
  assert.ok(clientAccount, 'Account 430 should exist in General Ledger');

  // Movements in 430:
  // 1. Emission FAC-1: Debe 1210, Haber 0 -> runningBalance 1210 (D)
  // 2. Cobro FAC-1: Debe 0, Haber 1210 -> runningBalance 0 (C)
  // 3. Emission FAC-2: Debe 605, Haber 0 -> runningBalance 605 (D)
  assert.equal(clientAccount.movements.length, 3);
  assert.equal(clientAccount.movements[0].debe, 1210);
  assert.equal(clientAccount.movements[0].runningBalance, 1210);
  assert.equal(clientAccount.movements[0].balanceType, 'D');

  assert.equal(clientAccount.movements[1].haber, 1210);
  assert.equal(clientAccount.movements[1].runningBalance, 0);
  assert.equal(clientAccount.movements[1].balanceType, 'C');

  assert.equal(clientAccount.movements[2].debe, 605);
  assert.equal(clientAccount.movements[2].runningBalance, 605);
  assert.equal(clientAccount.movements[2].balanceType, 'D');

  assert.equal(clientAccount.totalDebit, 1815);
  assert.equal(clientAccount.totalCredit, 1210);
  assert.equal(clientAccount.closingBalance, 605);
  assert.equal(clientAccount.closingBalanceType, 'D');
});

test('exportGeneralLedgerCsv outputs official UTF-8 BOM CSV with semicolons and comma decimals', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-csv',
      number: 'FAC-CSV',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente CSV',
      clientNif: 'A11111111',
      activity: 'General',
      issueDate: '2026-05-20',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 100,
      vatTotal: 21,
      totalAmount: 121,
      status: 'Pendiente',
      veriFactuLocked: true,
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: issued,
    receivedInvoices: [],
    year: 2026,
  });

  const ledger = generateGeneralLedger(snapshot);
  const csv = exportGeneralLedgerCsv(ledger, '430');

  assert.equal(csv.charCodeAt(0), 0xfeff, 'Must start with UTF-8 BOM');
  assert.ok(csv.includes('Cuenta;Descripcion_Cuenta;Fecha;Asiento;Documento;Concepto;Debe;Haber;Saldo;D_H'));
  assert.ok(csv.includes('430;Clientes;20/05/2026;1;FAC-CSV;Emisión Factura FAC-CSV;121,00;0,00;121,00;D'));
});

test('manual journal entries integrate into snapshot, mayor and maintain double entry balance', () => {
  const manualEntries = [
    {
      id: 'man-1',
      organizationId: 'org-1',
      entryNumber: 'MAN-001',
      entryDate: '2026-01-02',
      concept: 'Constitución y aportación inicial capital',
      documentNumber: 'ESCRITURA-1',
      sourceType: 'manual' as const,
      isManual: true,
      lines: [
        { accountCode: '572', accountName: 'Bancos', debe: 10000, haber: 0 },
        { accountCode: '100', accountName: 'Capital Social', debe: 0, haber: 10000 },
      ],
      totalDebe: 10000,
      totalHaber: 10000,
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-01-02T10:00:00Z',
    },
    {
      id: 'man-2',
      organizationId: 'org-1',
      entryNumber: 'MAN-002',
      entryDate: '2026-01-10',
      concept: 'Adquisición de equipamiento informático',
      documentNumber: 'FACT-PC',
      sourceType: 'manual' as const,
      isManual: true,
      lines: [
        { accountCode: '217', accountName: 'Equipos para procesos de información', debe: 2500, haber: 0 },
        { accountCode: '572', accountName: 'Bancos', debe: 0, haber: 2500 },
      ],
      totalDebe: 2500,
      totalHaber: 2500,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-10T10:00:00Z',
    },
  ];

  const snapshot = generateAccountingSnapshot({
    issuedInvoices: [],
    receivedInvoices: [],
    manualEntries,
    year: 2026,
  });

  // Verify journal entries contains manual entries
  assert.equal(snapshot.journalEntries.length, 2);
  assert.equal(snapshot.journalEntries[0].concept, 'Constitución y aportación inicial capital');
  assert.equal(snapshot.journalEntries[0].isManual, true);
  assert.equal(snapshot.journalEntries[0].sourceType, 'manual');

  // Verify trial balance contains accounts 100, 217, 572
  const tb100 = snapshot.trialBalance.rows.find((r) => r.accountCode === '100');
  const tb217 = snapshot.trialBalance.rows.find((r) => r.accountCode === '217');
  const tb572 = snapshot.trialBalance.rows.find((r) => r.accountCode === '572');

  assert.ok(tb100, 'Trial balance must include account 100');
  assert.equal(tb100?.creditBalance, 10000);

  assert.ok(tb217, 'Trial balance must include account 217');
  assert.equal(tb217?.debitBalance, 2500);

  assert.ok(tb572, 'Trial balance must include account 572');
  assert.equal(tb572?.sumDebit, 10000);
  assert.equal(tb572?.sumCredit, 2500);
  assert.equal(tb572?.debitBalance, 7500);

  // Verify Balance Sheet: Activo (2500 Inmovilizado + 7500 Tesorería) = 10000 === Patrimonio Neto (10000 Capital)
  assert.equal(snapshot.balanceSheet.totalActivo, 10000);
  assert.equal(snapshot.balanceSheet.totalPasivoYPatrimonio, 10000);
  assert.equal(snapshot.balanceSheet.isBalanced, true);

  // Verify General Ledger
  const ledger = generateGeneralLedger(snapshot);
  const account217 = ledger.accountMap['217'];
  assert.ok(account217);
  assert.equal(account217.closingBalance, 2500);
  assert.equal(account217.closingBalanceType, 'D');

  const account572 = ledger.accountMap['572'];
  assert.ok(account572);
  assert.equal(account572.closingBalance, 7500);
  assert.equal(account572.closingBalanceType, 'D');
});


