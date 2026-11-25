import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashflowTaxForecast, getAeatTaxDeadline } from './cashflowForecast';
import type { IssuedInvoice, ReceivedInvoice } from '../types';

test('getAeatTaxDeadline returns correct labels and deadlines', () => {
  assert.deepEqual(getAeatTaxDeadline(2026, '1T'), { label: '20 de abril', isoDate: '2026-04-20' });
  assert.deepEqual(getAeatTaxDeadline(2026, '2T'), { label: '20 de julio', isoDate: '2026-07-20' });
  assert.deepEqual(getAeatTaxDeadline(2026, '3T'), { label: '20 de octubre', isoDate: '2026-10-20' });
  assert.deepEqual(getAeatTaxDeadline(2026, '4T'), { label: '30 de enero de 2027', isoDate: '2027-01-30' });
});

test('calculateCashflowTaxForecast excludes proformas and albaranes from taxes and cashflow', () => {
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
      issueDate: '2026-01-15',
      dueDate: '2026-02-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
    {
      id: 'inv-prof',
      number: 'PROF-001',
      series: 'PROF',
      documentType: 'proforma',
      clientId: 'c1',
      clientName: 'Cliente Proforma',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-20',
      dueDate: '',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 10000,
      vatTotal: 2100,
      totalAmount: 12100,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
    {
      id: 'inv-alb',
      number: 'ALB-001',
      series: 'ALB',
      documentType: 'albaran',
      clientId: 'c1',
      clientName: 'Cliente Albaran',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-25',
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
  ];

  const received: ReceivedInvoice[] = [];

  const res = calculateCashflowTaxForecast({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'autonomo',
  });

  // Collected income must ONLY be 1210, not 12100 or 6050
  assert.equal(res.collectedIncome, 1210);
  assert.equal(res.totalReceivables, 0);
  assert.equal(res.vatCollected, 210);
  assert.equal(res.computableIncome, 1000);
});

test('calculateCashflowTaxForecast computes exact Mod. 130 for Autónomo vs 0 for SL', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'FAC-001',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente 1',
      clientNif: 'B12345678',
      activity: 'Actividad Artística',
      issueDate: '2026-02-01',
      dueDate: '2026-03-01',
      lines: [],
      ivaRate: 21,
      irpfRate: 15,
      taxBase: 2000,
      vatTotal: 420,
      irpfTotal: 300, // 15% withheld
      totalAmount: 2120, // 2000 + 420 - 300
      status: 'Cobrada',
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-1',
      number: 'G-001',
      supplierId: 's1',
      supplierName: 'Proveedor 1',
      supplierNif: 'B99999999',
      activity: 'Actividad Artística',
      issueDate: '2026-02-10',
      accountingDate: '2026-02-10',
      concept: 'Material taller',
      pgcAccountCode: '600',
      pgcAccountName: 'Compras',
      baseAmount: 500,
      ivaRate: 21,
      irpfRetainedRate: 0,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'paid',
    },
  ];

  // 1. Autónomo:
  // Net profit = 2000 - 500 = 1500 €
  // 20% on 1500 = 300 €
  // Withholdings on issued invoices = 300 €
  // Mod. 130 provision = 300 - 300 = 0 €
  const autonomoRes = calculateCashflowTaxForecast({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'autonomo',
  });

  assert.equal(autonomoRes.vatCollected, 420);
  assert.equal(autonomoRes.vatDeductible, 105); // 21% of 500
  assert.equal(autonomoRes.vatBalance, 315); // 420 - 105
  assert.equal(autonomoRes.netOperatingProfit, 1500);
  assert.equal(autonomoRes.withholdingsCollected, 300);
  assert.equal(autonomoRes.irpfProvision, 0); // 300 - 300
  assert.equal(autonomoRes.recommendedTaxReserve, 315); // 315 (IVA) + 0 (IRPF) + 0 (111)

  // 2. Empresa SL:
  // irpfProvision must strictly be 0
  const slRes = calculateCashflowTaxForecast({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'sl',
  });
  assert.equal(slRes.irpfProvision, 0);
  assert.equal(slRes.vatBalance, 315);
  assert.equal(slRes.recommendedTaxReserve, 315);
});

test('calculateCashflowTaxForecast correctly accounts for pending receivables and withholdings payable (Mod 111)', () => {
  const issued: IssuedInvoice[] = [
    {
      id: 'inv-pending',
      number: 'FAC-002',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c2',
      clientName: 'Cliente Deudor',
      clientNif: 'B22222222',
      activity: 'General',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      taxBase: 1000,
      vatTotal: 210,
      irpfTotal: 0,
      totalAmount: 1210,
      status: 'Pendiente',
      veriFactuLocked: true,
    },
  ];

  const received: ReceivedInvoice[] = [
    {
      id: 'exp-prof',
      number: 'G-PROF',
      supplierId: 's-prof',
      supplierName: 'Abogado Laboral',
      supplierNif: '22334455A',
      activity: 'General',
      issueDate: '2026-03-05',
      accountingDate: '2026-03-05',
      concept: 'Minuta abogado',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios profesionales',
      baseAmount: 1000,
      ivaRate: 21,
      irpfRetainedRate: 15, // Retención Mod. 111: 150 €
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      paymentStatus: 'pending',
    },
  ];

  const res = calculateCashflowTaxForecast({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'autonomo',
    referenceDate: '2026-03-15',
  });

  assert.equal(res.collectedIncome, 0);
  assert.equal(res.pendingReceivables, 1210);
  assert.equal(res.totalReceivables, 1210);
  assert.equal(res.paidExpenses, 0);
  assert.equal(res.pendingPayables, 1060); // 1000 + 210 - 150
  assert.equal(res.totalPayables, 1060);
  assert.equal(res.withholdingsPayable, 150); // Mod. 111
  assert.equal(res.vatCollected, 210);
  assert.equal(res.vatDeductible, 210);
  assert.equal(res.vatBalance, 0); // 210 - 210
  assert.equal(res.netOperatingProfit, 0); // 1000 - 1000
  assert.equal(res.irpfProvision, 0);
  assert.equal(res.recommendedTaxReserve, 150); // 0 (IVA) + 0 (IRPF) + 150 (Mod 111)

  // Net Free Cashflow: (collectedIncome 0 - paidExpenses 0) + receivables 1210 - payables 1060 - reserve 150 = 0 €
  assert.equal(res.netFreeCashflow, 0);
});
