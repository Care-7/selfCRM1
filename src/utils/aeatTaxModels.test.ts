import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IssuedInvoice, ReceivedInvoice } from '../types';
import {
  calculateModel303,
  calculateModel130,
  calculateModel111,
  calculateModel115,
  calculateModel390,
  exportTaxModelDraftCsv,
} from './aeatTaxModels';

// Mock datasets for testing
function createMockIssued(): IssuedInvoice[] {
  return [
    // 1T: Normal 21%
    {
      id: 'inv-1',
      number: 'FAC-2026-0001',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-15',
      dueDate: '2026-02-15',
      lines: [{ id: 'l1', description: 'Servicio A', quantity: 1, unitPrice: 1000 }],
      taxBase: 1000,
      ivaRate: 21,
      vatTotal: 210,
      irpfRate: 15,
      irpfTotal: 150,
      totalAmount: 1060,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
    // 1T: Rectificativa 21% (negative base)
    {
      id: 'inv-2',
      number: 'REC-2026-0001',
      series: 'REC',
      documentType: 'rectificativa',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-02-10',
      dueDate: '2026-02-10',
      lines: [{ id: 'l2', description: 'Abono parcial', quantity: 1, unitPrice: -200 }],
      taxBase: -200,
      ivaRate: 21,
      vatTotal: -42,
      irpfRate: 15,
      irpfTotal: -30,
      totalAmount: -212,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
    // 1T: Reduced 10%
    {
      id: 'inv-3',
      number: 'FAC-2026-0002',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c2',
      clientName: 'Cliente Arte',
      clientNif: 'A87654321',
      activity: 'Actividad General',
      issueDate: '2026-03-05',
      dueDate: '2026-04-05',
      lines: [{ id: 'l3', description: 'Obra arte', quantity: 1, unitPrice: 500 }],
      taxBase: 500,
      ivaRate: 10,
      vatTotal: 50,
      irpfRate: 0,
      irpfTotal: 0,
      totalAmount: 550,
      status: 'Pendiente',
      veriFactuLocked: true,
    },
    // 1T: Super-reduced 4%
    {
      id: 'inv-4',
      number: 'FAC-2026-0003',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c3',
      clientName: 'Cliente Libro',
      clientNif: 'B99999999',
      activity: 'Actividad General',
      issueDate: '2026-03-20',
      dueDate: '2026-04-20',
      lines: [{ id: 'l4', description: 'Libro técnico', quantity: 1, unitPrice: 100 }],
      taxBase: 100,
      ivaRate: 4,
      vatTotal: 4,
      irpfRate: 0,
      irpfTotal: 0,
      totalAmount: 104,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
    // Strictly excluded: Proforma & Albaran in 1T
    {
      id: 'pro-1',
      number: 'PRO-2026-0001',
      series: 'PRO',
      documentType: 'proforma',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-01-10',
      dueDate: '2026-02-10',
      lines: [{ id: 'lp1', description: 'Presupuesto', quantity: 1, unitPrice: 5000 }],
      taxBase: 5000,
      ivaRate: 21,
      vatTotal: 1050,
      irpfRate: 0,
      irpfTotal: 0,
      totalAmount: 6050,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
    {
      id: 'alb-1',
      number: 'ALB-2026-0001',
      series: 'ALB',
      documentType: 'albaran',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-02-01',
      dueDate: '2026-03-01',
      lines: [{ id: 'la1', description: 'Material entregado', quantity: 1, unitPrice: 3000 }],
      taxBase: 3000,
      ivaRate: 21,
      vatTotal: 630,
      irpfRate: 0,
      irpfTotal: 0,
      totalAmount: 3630,
      status: 'Pendiente',
      veriFactuLocked: false,
    },
    // 2T: Normal 21%
    {
      id: 'inv-5',
      number: 'FAC-2026-0004',
      series: 'FAC',
      documentType: 'normal',
      clientId: 'c1',
      clientName: 'Cliente Uno',
      clientNif: 'B12345678',
      activity: 'Actividad General',
      issueDate: '2026-04-15',
      dueDate: '2026-05-15',
      lines: [{ id: 'l5', description: 'Servicio Mayo', quantity: 1, unitPrice: 2000 }],
      taxBase: 2000,
      ivaRate: 21,
      vatTotal: 420,
      irpfRate: 15,
      irpfTotal: 300,
      totalAmount: 2120,
      status: 'Cobrada',
      veriFactuLocked: true,
    },
  ];
}

function createMockReceived(): ReceivedInvoice[] {
  return [
    // 1T: Suministros (628) 21% IVA 100% deducible
    {
      id: 'rec-1',
      number: 'SUP-001',
      supplierId: 's1',
      supplierName: 'Electricidad SA',
      supplierNif: 'A11111111',
      activity: 'Actividad General',
      issueDate: '2026-01-20',
      accountingDate: '2026-01-20',
      concept: 'Electricidad oficina',
      pgcAccountCode: '628',
      pgcAccountName: 'Suministros',
      baseAmount: 300,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
    },
    // 1T: Alquiler oficina (621) con retención 19% IRPF (Modelo 115)
    {
      id: 'rec-2',
      number: 'ALQ-001',
      supplierId: 's2',
      supplierName: 'Arrendador Inmuebles SL',
      supplierNif: 'B22222222',
      activity: 'Actividad General',
      issueDate: '2026-02-01',
      accountingDate: '2026-02-01',
      concept: 'Alquiler sede',
      pgcAccountCode: '621',
      pgcAccountName: 'Arrendamientos y cánones',
      baseAmount: 1000,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
    },
    // 1T: Servicios profesionales (623) con retención 15% IRPF (Modelo 111)
    {
      id: 'rec-3',
      number: 'PROF-001',
      supplierId: 's3',
      supplierName: 'Abogado Perez',
      supplierNif: '12345678Z',
      activity: 'Actividad General',
      issueDate: '2026-02-20',
      accountingDate: '2026-02-20',
      concept: 'Asesoría jurídica',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios de profesionales independientes',
      baseAmount: 400,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
    },
    // 1T: Gasto con 50% deducibilidad IVA (vehículo turismo)
    {
      id: 'rec-4',
      number: 'GAS-001',
      supplierId: 's4',
      supplierName: 'Gasolinera',
      supplierNif: 'B44444444',
      activity: 'Actividad General',
      issueDate: '2026-03-10',
      accountingDate: '2026-03-10',
      concept: 'Combustible',
      pgcAccountCode: '629',
      pgcAccountName: 'Otros servicios',
      baseAmount: 100,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 50,
      deductibleExpensePct: 50,
    },
    // 2T: Gasto profesional (623)
    {
      id: 'rec-5',
      number: 'PROF-002',
      supplierId: 's3',
      supplierName: 'Abogado Perez',
      supplierNif: '12345678Z',
      activity: 'Actividad General',
      issueDate: '2026-05-10',
      accountingDate: '2026-05-10',
      concept: 'Asesoría Mayo',
      pgcAccountCode: '623',
      pgcAccountName: 'Servicios de profesionales independientes',
      baseAmount: 500,
      ivaRate: 21,
      irpfRetainedRate: 15,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
    },
  ];
}

test('Modelo 303: calculates IVA Devengado and Deducible accurately with rate breakdown and rectificativas', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  const m303 = calculateModel303({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
  });

  // Check Devengado 21%: 1000 - 200 = 800 base; 210 - 42 = 168 cuota
  assert.equal(m303.base21, 800);
  assert.equal(m303.cuota21, 168);

  // Devengado 10%: 500 base, 50 cuota
  assert.equal(m303.base10, 500);
  assert.equal(m303.cuota10, 50);

  // Devengado 4%: 100 base, 4 cuota
  assert.equal(m303.base4, 100);
  assert.equal(m303.cuota4, 4);

  // Total cuota devengada: 168 + 50 + 4 = 222 [27]
  assert.equal(m303.totalCuotaDevengada, 222);

  // Check Deducible:
  // rec-1: 300 base, 63 cuota (100%)
  // rec-2: 1000 base, 210 cuota (100%)
  // rec-3: 400 base, 84 cuota (100%)
  // rec-4: 100 base * 50% = 50 base, 21 * 50% = 10.5 cuota
  // Total base deducible: 300 + 1000 + 400 + 50 = 1750
  // Total cuota deducible: 63 + 210 + 84 + 10.5 = 367.50
  assert.equal(m303.baseDeducible, 1750);
  assert.equal(m303.cuotaDeducible, 367.5);
  assert.equal(m303.totalDeducir, 367.5);

  // Resultado [46]: 222 - 367.5 = -145.50 (a compensar)
  assert.equal(m303.diferencia, -145.5);
  assert.equal(m303.resultadoLiquidacion, -145.5);
  assert.equal(m303.status, 'A compensar / devolver');

  // Verify proformas and albaranes (5000€ and 3000€) were strictly excluded
  assert.ok(m303.totalBaseDevengada < 2000, 'Proforma and Albarán must not be counted in Devengado');
});

test('Modelo 130: calculates YTD accumulated income, expenses, previous payments and withholdings', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  // Test 1T for Autónomo
  const m130_1T = calculateModel130({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'autonomo',
  });

  assert.equal(m130_1T.isApplicable, true);
  // Ingresos 1T: 1000 - 200 + 500 + 100 = 1400 [01]
  assert.equal(m130_1T.ingresosComputables, 1400);

  // Gastos 1T: 300 + 1000 + 400 + (100 * 50%) = 1750 [02]
  assert.equal(m130_1T.gastosDeducibles, 1750);

  // Rendimiento neto [03]: 1400 - 1750 = -350
  assert.equal(m130_1T.rendimientoNeto, -350);

  // Cuota 20% [04]: 0 (neto negativo)
  assert.equal(m130_1T.cuota20, 0);

  // Pagos anteriores [05]: 0 en 1T
  assert.equal(m130_1T.pagosAnteriores, 0);

  // Retenciones soportadas [06]: 150 - 30 = 120
  assert.equal(m130_1T.retencionesSoportadas, 120);

  // Total ingresar [07]: 0
  assert.equal(m130_1T.totalIngresar, 0);
  assert.equal(m130_1T.status, 'Sin cuota a ingresar');

  // Test 2T for Autónomo (Accumulated YTD 1T + 2T)
  const m130_2T = calculateModel130({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '2T',
    legalForm: 'autonomo',
  });

  // Ingresos YTD: 1400 (1T) + 2000 (2T) = 3400
  assert.equal(m130_2T.ingresosComputables, 3400);

  // Gastos YTD: 1750 (1T) + 500 (2T) = 2250
  assert.equal(m130_2T.gastosDeducibles, 2250);

  // Rendimiento neto YTD: 3400 - 2250 = 1150
  assert.equal(m130_2T.rendimientoNeto, 1150);

  // Cuota 20%: 1150 * 0.20 = 230
  assert.equal(m130_2T.cuota20, 230);

  // Pagos anteriores (de 1T): 0
  assert.equal(m130_2T.pagosAnteriores, 0);

  // Retenciones YTD: 120 (1T) + 300 (2T) = 420
  assert.equal(m130_2T.retencionesSoportadas, 420);

  // Total ingresar: MAX(0, 230 - 0 - 420) = 0 (retenciones exceden la cuota)
  assert.equal(m130_2T.totalIngresar, 0);
});

test('Modelo 130: marks isApplicable = false for Sociedad Limitada (SL)', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  const m130_sl = calculateModel130({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
    legalForm: 'sl',
  });

  assert.equal(m130_sl.isApplicable, false);
  assert.ok(m130_sl.note?.includes('Sociedades Limitadas'));
  assert.equal(m130_sl.totalIngresar, 0);
  assert.equal(m130_sl.casillas.length, 0);
});

test('Modelos 111 y 115: accurately split withholdings between Urban Rent (621) and Professional Services (623)', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  // 1. Modelo 115 (Urban rent - account 621)
  const m115 = calculateModel115({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
  });

  // Only rec-2 is 621 with withholding
  assert.equal(m115.perceptores, 1);
  assert.equal(m115.baseRetenciones, 1000);
  assert.equal(m115.retencionesIngresadas, 150); // 1000 * 15%
  assert.equal(m115.totalIngresar, 150);
  assert.equal(m115.status, 'A ingresar');

  // 2. Modelo 111 (Non-rent, e.g. professional 623)
  const m111 = calculateModel111({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
  });

  // Only rec-3 is 623 with withholding
  assert.equal(m111.perceptores, 1);
  assert.equal(m111.baseRetenciones, 400);
  assert.equal(m111.retencionesPracticadas, 60); // 400 * 15%
  assert.equal(m111.totalIngresar, 60);
  assert.equal(m111.status, 'A ingresar');
});

test('Modelo 390: consolidates all 4 quarters and cross-checks with Modelo 303 results', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  const m390 = calculateModel390({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
  });

  // Annual bases:
  // Base 21: (1000 - 200) + 2000 = 2800; Cuota 21: (210 - 42) + 420 = 588
  assert.equal(m390.base21, 2800);
  assert.equal(m390.cuota21, 588);

  // Base 10: 500; Cuota 10: 50
  assert.equal(m390.base10, 500);
  assert.equal(m390.cuota10, 50);

  // Base 4: 100; Cuota 4: 4
  assert.equal(m390.base4, 100);
  assert.equal(m390.cuota4, 4);

  // Total devengado [33]: 588 + 50 + 4 = 642
  assert.equal(m390.totalCuotaDevengada, 642);

  // Annual deducible:
  // 1T: 367.50 cuota
  // 2T: rec-5 base 500 * 21% = 105 cuota
  // Total deducible [64]: 367.50 + 105 = 472.50
  assert.equal(m390.totalCuotaDeducible, 472.5);

  // Resultado ordinario [65]: 642 - 472.50 = 169.50
  assert.equal(m390.resultadoOrdinario, 169.5);

  // Compare with 303 for 2T:
  const m303_2T = calculateModel303({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '2T',
  });
  // In 2T: devengado = 420, deducible = 105 -> resultado = 315 > 0
  assert.equal(m303_2T.resultadoLiquidacion, 315);

  // Suma ingresos 303 [84]: in 1T was -145.5 (<= 0), in 2T was 315 (> 0). Sum = 315
  assert.equal(m390.sumaIngresos303, 315);

  // Regularization final result [86]: Math.max(0, 169.50 - 315) = 0
  assert.equal(m390.resultadoFinal, 0);
});

test('exportTaxModelDraftCsv: formats CSV with UTF-8 BOM, semicolons and comma decimals for Spanish Excel', () => {
  const issued = createMockIssued();
  const received = createMockReceived();

  const m303 = calculateModel303({
    issuedInvoices: issued,
    receivedInvoices: received,
    year: 2026,
    quarter: '1T',
  });

  const csv = exportTaxModelDraftCsv('303', 2026, '1T', m303.casillas);

  assert.ok(csv.startsWith('\uFEFF'), 'Must contain UTF-8 BOM');
  assert.ok(csv.includes('Modelo 303;2026;1T;[01];'));
  assert.ok(csv.includes('800,00;21,00;800,00'), 'Numbers must be formatted with comma decimal');
});
