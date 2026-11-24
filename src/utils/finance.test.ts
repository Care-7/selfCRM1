import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalanceSheet,
  calculateDashboardKPIs,
  calculateFinancialRatios,
  calculateInvoiceTotals,
  calculateMonthlySeries,
  calculateTaxSummary,
  generateJournalEntries,
  generateVeriFactuHash,
  getNextInvoiceNumber,
} from './finance';
import {
  INITIAL_ISSUED_INVOICES,
  INITIAL_RECEIVED_INVOICES,
  REFERENCE_DATE,
} from '../data/mockData';

test('calculateInvoiceTotals computes Spanish IVA (21%/10%/0%) and IRPF (15%/7%/0%) accurately', () => {
  const lines = [
    { id: '1', description: 'Contabilidad mensual', quantity: 2, unitPrice: 500 },
    { id: '2', description: 'Cierre fiscal', quantity: 1, unitPrice: 250 },
  ];

  // 1250 base + 21% IVA (262.50) - 15% IRPF (187.50) = 1325.00
  const standard = calculateInvoiceTotals(lines, 21, 15);
  assert.equal(standard.baseImponible, 1250);
  assert.equal(standard.ivaAmount, 262.5);
  assert.equal(standard.irpfAmount, 187.5);
  assert.equal(standard.total, 1325);

  // Reduced art IVA 10% + 7% IRPF
  const art = calculateInvoiceTotals([{ id: 'a', description: 'Obra', quantity: 1, unitPrice: 1000 }], 10, 7);
  assert.equal(art.ivaAmount, 100);
  assert.equal(art.irpfAmount, 70);
  assert.equal(art.total, 1030);

  // Exempt 0% IVA + 0% IRPF
  const exempt = calculateInvoiceTotals([{ id: 'e', description: 'Formación', quantity: 3, unitPrice: 120 }], 0, 0);
  assert.equal(exempt.baseImponible, 360);
  assert.equal(exempt.ivaAmount, 0);
  assert.equal(exempt.total, 360);
});

test('global activity and period filters change Dashboard KPIs deterministically', () => {
  const allQuarter = calculateDashboardKPIs(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades',
    'quarter',
    REFERENCE_DATE
  );
  const artQuarter = calculateDashboardKPIs(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Actividad Artística',
    'quarter',
    REFERENCE_DATE
  );
  const comQuarter = calculateDashboardKPIs(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Contabilidad Comunidades',
    'quarter',
    REFERENCE_DATE
  );

  // Sum of both activities equals total
  assert.equal(
    Math.round((artQuarter.netRevenue + comQuarter.netRevenue) * 100) / 100,
    allQuarter.netRevenue
  );
  assert.equal(
    Math.round((artQuarter.deductibleExpenses + comQuarter.deductibleExpenses) * 100) / 100,
    allQuarter.deductibleExpenses
  );
  assert.equal(allQuarter.netProfit, Math.round((allQuarter.netRevenue - allQuarter.deductibleExpenses) * 100) / 100);

  // Year period must have >= quarter revenue
  const allYear = calculateDashboardKPIs(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades',
    'year',
    REFERENCE_DATE
  );
  assert.ok(allYear.netRevenue > allQuarter.netRevenue);
});

test('every auto-generated journal entry in Libro Diario is strictly balanced (Debe === Haber)', () => {
  const entries = generateJournalEntries(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades'
  );
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.equal(
      entry.totalDebe,
      entry.totalHaber,
      `Entry ${entry.sourceRef} must balance (Debe ${entry.totalDebe} !== Haber ${entry.totalHaber})`
    );
  }
});

test('Balance de Situación always balances (Activo === Pasivo + Patrimonio Neto) across all activity filters', () => {
  for (const filter of [
    'Todas las actividades',
    'Contabilidad Comunidades',
    'Actividad Artística',
  ] as const) {
    const balance = calculateBalanceSheet(
      INITIAL_ISSUED_INVOICES,
      INITIAL_RECEIVED_INVOICES,
      filter
    );
    assert.equal(balance.isBalanced, true, `Balance sheet must balance for ${filter}`);
    assert.equal(balance.totalActivo, balance.totalPasivoYPatrimonio);

    const kpis = calculateDashboardKPIs(
      INITIAL_ISSUED_INVOICES,
      INITIAL_RECEIVED_INVOICES,
      filter,
      'year',
      REFERENCE_DATE
    );
    const ratios = calculateFinancialRatios(balance, kpis);
    assert.equal(ratios.length, 4);
  }
});

test('Tax summary calculates Mod. 303, 130, 111 and General Tax for both Autónomo and Empresa regimes', () => {
  const autonomo = calculateTaxSummary(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades',
    'autonomo',
    'T4'
  );
  assert.equal(autonomo.impuestoGeneral.modelCode, 'Modelo 100');
  assert.equal(
    autonomo.mod303.resultado,
    Math.round((autonomo.mod303.cuotaRepercutidaTotal - autonomo.mod303.cuotaSoportada) * 100) / 100
  );
  assert.ok(autonomo.mod111.cuotaIngresar > 0);

  const empresa = calculateTaxSummary(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades',
    'empresa',
    'T4'
  );
  assert.equal(empresa.impuestoGeneral.modelCode, 'Modelo 200 / 202');
  assert.equal(empresa.impuestoGeneral.tipoEfectivoPct, 23);
});

test('VeriFactu hash and sequential invoice numbering work deterministically', () => {
  const hash1 = generateVeriFactuHash('CC-2026-018', 'H28491023', '2026-11-24', 1000);
  const hash2 = generateVeriFactuHash('CC-2026-018', 'H28491023', '2026-11-24', 1000);
  assert.equal(hash1, hash2);
  assert.ok(hash1.startsWith('VF26-'));

  const nextCC = getNextInvoiceNumber(INITIAL_ISSUED_INVOICES, 'Contabilidad Comunidades');
  assert.equal(nextCC.series, 'CC');
  assert.equal(nextCC.number, 'CC-2026-018');

  const nextAR = getNextInvoiceNumber(INITIAL_ISSUED_INVOICES, 'Actividad Artística');
  assert.equal(nextAR.series, 'AR');
  assert.equal(nextAR.number, 'AR-2026-010');

  const series = calculateMonthlySeries(
    INITIAL_ISSUED_INVOICES,
    INITIAL_RECEIVED_INVOICES,
    'Todas las actividades'
  );
  assert.equal(series.length, 6);
});
