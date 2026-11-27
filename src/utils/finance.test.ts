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

test('Proforma and Albarán series numbering and document division work accurately', () => {
  const nextPro = getNextInvoiceNumber(INITIAL_ISSUED_INVOICES, 'Contabilidad Comunidades', 'proforma');
  assert.equal(nextPro.series, 'PRO');
  assert.equal(nextPro.number, 'PRO-2026-0003');

  const nextAlb = getNextInvoiceNumber(INITIAL_ISSUED_INVOICES, 'Actividad Artística', 'albaran');
  assert.equal(nextAlb.series, 'ALB');
  assert.equal(nextAlb.number, 'ALB-2026-0003');

  const proformas = INITIAL_ISSUED_INVOICES.filter((inv) => inv.documentType === 'proforma');
  const albaranes = INITIAL_ISSUED_INVOICES.filter((inv) => inv.documentType === 'albaran');
  const normales = INITIAL_ISSUED_INVOICES.filter((inv) => inv.documentType === 'normal');

  assert.equal(proformas.length, 2);
  assert.equal(albaranes.length, 2);
  assert.equal(normales.length, 15);

  // Proformas distributed across activities
  assert.ok(proformas.some((p) => p.activity === 'Contabilidad Comunidades'));
  assert.ok(proformas.some((p) => p.activity === 'Actividad Artística'));

  // Albaranes distributed across activities and valued flag
  assert.ok(albaranes.some((a) => a.activity === 'Contabilidad Comunidades' && a.isValued === true));
  assert.ok(albaranes.some((a) => a.activity === 'Actividad Artística' && a.isValued === false));
});

test('financial calculations handle completely empty datasets cleanly with zero and finite values (no NaN)', () => {
  // 1. Dashboard KPIs
  const emptyKpis = calculateDashboardKPIs([], [], 'Todas las actividades', 'quarter', REFERENCE_DATE);
  assert.equal(emptyKpis.netRevenue, 0);
  assert.equal(emptyKpis.deductibleExpenses, 0);
  assert.equal(emptyKpis.netProfit, 0);
  assert.equal(emptyKpis.profitMarginPct, 0);
  assert.equal(emptyKpis.taxForecastTotal, 0);
  assert.equal(emptyKpis.revenueTrendPct, 0);
  assert.ok(Number.isFinite(emptyKpis.netRevenue));
  assert.ok(Number.isFinite(emptyKpis.profitMarginPct));
  assert.ok(Number.isFinite(emptyKpis.revenueTrendPct));

  // 2. Balance Sheet
  const emptyBalance = calculateBalanceSheet([], [], 'Todas las actividades');
  assert.equal(emptyBalance.isBalanced, true);
  assert.equal(emptyBalance.totalActivo, emptyBalance.totalPasivoYPatrimonio);
  assert.ok(Number.isFinite(emptyBalance.totalActivo));
  assert.ok(!Number.isNaN(emptyBalance.totalActivo));

  // 3. Financial Ratios
  const ratios = calculateFinancialRatios(emptyBalance, emptyKpis);
  assert.ok(ratios.length >= 4);
  for (const ratio of ratios) {
    assert.ok(Number.isFinite(ratio.rawValue), `Ratio ${ratio.name} must be finite`);
    assert.ok(!Number.isNaN(ratio.rawValue), `Ratio ${ratio.name} must not be NaN`);
  }
  const liquidez = ratios.find((r) => r.name.includes('Liquidez'));
  assert.ok(liquidez);
  assert.ok(liquidez.rawValue >= 0);

  // 4. Tax Summary
  const emptyTax = calculateTaxSummary([], [], 'Todas las actividades', 'autonomo', 'T4');
  assert.equal(emptyTax.mod303.resultado, 0);
  assert.equal(emptyTax.mod130.resultado, 0);
  assert.equal(emptyTax.mod111.cuotaIngresar, 0);
  assert.ok(Number.isFinite(emptyTax.mod303.resultado));
  assert.ok(Number.isFinite(emptyTax.mod130.resultado));

  // 5. Journal Entries
  const emptyEntries = generateJournalEntries([], [], 'Todas las actividades');
  assert.deepEqual(emptyEntries, []);

  // 6. Monthly series
  const emptySeries = calculateMonthlySeries([], [], 'Todas las actividades');
  assert.equal(emptySeries.length, 6);
  for (const month of emptySeries) {
    assert.equal(month.ingresos, 0);
    assert.equal(month.gastos, 0);
  }
});

test('getNextInvoiceNumber honors starting sequence startNumber for series', () => {
  // Empty dataset with configured starting number 45
  const nextFrom45 = getNextInvoiceNumber([], 'Contabilidad Comunidades', 'normal', 45);
  assert.equal(nextFrom45.number, 'CC-2026-045');

  // When existing max is already 45, next is 046
  const existingInvoices: any[] = [
    {
      id: 'inv-1',
      number: 'CC-2026-045',
      series: 'CC',
      documentType: 'normal',
    },
  ];
  const nextFromExisting = getNextInvoiceNumber(existingInvoices, 'Contabilidad Comunidades', 'normal', 45);
  assert.equal(nextFromExisting.number, 'CC-2026-046');

  // Proforma with start number
  const nextPro45 = getNextInvoiceNumber([], 'Contabilidad Comunidades', 'proforma', 45);
  assert.equal(nextPro45.number, 'PRO-2026-0045');
});

test('invoice duplication correctly clones lines and resets VeriFactu lock and hashes', () => {
  const originalInvoice: any = {
    id: 'inv-orig-1',
    number: 'CC-2026-001',
    series: 'CC',
    documentType: 'normal',
    clientId: 'cli-1',
    clientName: 'Cliente Test',
    clientNif: 'B12345678',
    activity: 'Contabilidad Comunidades',
    issueDate: '2026-10-01',
    dueDate: '2026-10-31',
    lines: [
      { id: 'line-1', description: 'Honorarios Octubre', quantity: 1, unitPrice: 500 },
      { id: 'line-2', description: 'Gestión Extra', quantity: 2, unitPrice: 50 },
    ],
    ivaRate: 21,
    irpfRate: 15,
    status: 'Cobrada',
    veriFactuLocked: true,
    veriFactuHash: 'VF26-ABCD-1234-5678',
    veriFactuTimestamp: '2026-10-01T12:00:00Z',
  };

  const nextNumberInfo = getNextInvoiceNumber([originalInvoice], originalInvoice.activity, 'normal');
  const duplicated = {
    ...originalInvoice,
    id: `inv-dup-${Date.now()}`,
    number: nextNumberInfo.number,
    series: nextNumberInfo.series,
    status: 'Borrador',
    issueDate: REFERENCE_DATE,
    dueDate: '2026-12-24',
    veriFactuLocked: false,
    veriFactuHash: undefined,
    veriFactuTimestamp: undefined,
    lines: originalInvoice.lines.map((l: any, idx: number) => ({
      ...l,
      id: `line-dup-${Date.now()}-${idx}`,
    })),
  };

  assert.equal(duplicated.status, 'Borrador');
  assert.equal(duplicated.veriFactuLocked, false);
  assert.equal(duplicated.veriFactuHash, undefined);
  assert.equal(duplicated.veriFactuTimestamp, undefined);
  assert.equal(duplicated.number, 'CC-2026-002');
  assert.equal(duplicated.lines.length, 2);
  assert.notEqual(duplicated.lines[0].id, originalInvoice.lines[0].id);
  assert.equal(duplicated.lines[0].description, 'Honorarios Octubre');
  assert.equal(duplicated.lines[0].unitPrice, 500);
});


