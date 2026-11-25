import type {
  ActivityFilter,
  ActivityType,
  BalanceSheet,
  DashboardKPIs,
  DocumentType,
  FinancialRatio,
  InvoiceLine,
  InvoiceTotals,
  IrpfRate,
  IssuedInvoice,
  JournalEntry,
  MonthlyMetric,
  PeriodFilter,
  QuarterOption,
  ReceivedInvoice,
  TaxRegime,
  TaxSummary,
} from '../types';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type ExtendedNumberFormatOptions = Omit<Intl.NumberFormatOptions, 'useGrouping'> & {
  useGrouping?: boolean | 'always';
};

export function formatCurrency(amount: number): string {
  const options: ExtendedNumberFormatOptions = {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  return new Intl.NumberFormat('es-ES', options as Intl.NumberFormatOptions).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  const options: ExtendedNumberFormatOptions = {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
    maximumFractionDigits: 0,
  };
  return new Intl.NumberFormat('es-ES', options as Intl.NumberFormatOptions).format(amount);
}

export function formatDecimalES(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDateES(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function calculateInvoiceTotals(
  lines: InvoiceLine[],
  ivaRate: number,
  irpfRate: number
): InvoiceTotals {
  const baseImponible = round2(
    lines.reduce((acc, line) => acc + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0)
  );
  const ivaAmount = round2(baseImponible * (ivaRate / 100));
  const irpfAmount = round2(baseImponible * (irpfRate / 100));
  const total = round2(baseImponible + ivaAmount - irpfAmount);
  return { baseImponible, ivaAmount, irpfAmount, total };
}

export function getIssuedInvoiceTotals(invoice: IssuedInvoice): InvoiceTotals {
  return calculateInvoiceTotals(invoice.lines, invoice.ivaRate, invoice.irpfRate);
}

export function getReceivedInvoiceTotals(invoice: ReceivedInvoice): {
  baseImponible: number;
  ivaAmount: number;
  irpfAmount: number;
  total: number;
} {
  const baseImponible = round2(invoice.baseAmount);
  const ivaAmount = round2(baseImponible * (invoice.ivaRate / 100));
  const irpfAmount = round2(baseImponible * ((invoice.irpfRetainedRate ?? 0) / 100));
  const total = round2(baseImponible + ivaAmount - irpfAmount);
  return { baseImponible, ivaAmount, irpfAmount, total };
}

export function generateVeriFactuHash(
  invoiceNumber: string,
  clientNif: string,
  issueDate: string,
  total: number
): string {
  const seed = `${invoiceNumber}|${clientNif}|${issueDate}|${total.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  let hash2 = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash2 = ((hash2 << 5) + hash2) ^ seed.charCodeAt(i);
  }
  const hex2 = (hash2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `VF26-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex2.slice(0, 4)}`;
}

export function getNextInvoiceNumber(
  invoices: IssuedInvoice[],
  activity: ActivityType,
  documentType: DocumentType = 'normal'
): { series: 'CC' | 'AR' | 'PRO' | 'ALB' | string; number: string } {
  if (documentType === 'proforma') {
    const series = 'PRO';
    const maxSeq = invoices
      .filter((inv) => inv.documentType === 'proforma' || inv.number.startsWith('PRO-'))
      .reduce((max, inv) => {
        const parts = inv.number.split('-');
        const seq = Number(parts[parts.length - 1]) || 0;
        return Math.max(max, seq);
      }, 0);
    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return { series, number: `${series}-2026-${nextSeq}` };
  }

  if (documentType === 'albaran') {
    const series = 'ALB';
    const maxSeq = invoices
      .filter((inv) => inv.documentType === 'albaran' || inv.number.startsWith('ALB-'))
      .reduce((max, inv) => {
        const parts = inv.number.split('-');
        const seq = Number(parts[parts.length - 1]) || 0;
        return Math.max(max, seq);
      }, 0);
    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return { series, number: `${series}-2026-${nextSeq}` };
  }

  const series: 'CC' | 'AR' = activity === 'Contabilidad Comunidades' ? 'CC' : 'AR';
  const maxSeq = invoices
    .filter(
      (inv) =>
        (inv.series === series || inv.number.startsWith(`${series}-`)) &&
        (inv.documentType === undefined || inv.documentType === 'normal')
    )
    .reduce((max, inv) => {
      const parts = inv.number.split('-');
      const seq = Number(parts[parts.length - 1]) || 0;
      return Math.max(max, seq);
    }, 0);
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return { series, number: `${series}-2026-${nextSeq}` };
}

function getQuarterFromMonth(month1Based: number): QuarterOption {
  if (month1Based <= 3) return 'T1';
  if (month1Based <= 6) return 'T2';
  if (month1Based <= 9) return 'T3';
  return 'T4';
}

export function isDateInPeriod(
  isoDate: string,
  period: PeriodFilter,
  referenceDate: string
): boolean {
  const [refY, refM] = referenceDate.split('-').map(Number);
  const [y, m] = isoDate.split('-').map(Number);
  if (y !== refY) return false;
  if (period === 'year') return true;
  if (period === 'month') return m === refM;
  return getQuarterFromMonth(m) === getQuarterFromMonth(refM);
}

export function isDateInQuarter(isoDate: string, quarter: QuarterOption): boolean {
  const [, m] = isoDate.split('-').map(Number);
  return getQuarterFromMonth(m) === quarter;
}

export function matchesActivity(
  itemActivity: ActivityType,
  filter: ActivityFilter
): boolean {
  return filter === 'Todas las actividades' || itemActivity === filter;
}

export function calculateDashboardKPIs(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter,
  period: PeriodFilter,
  referenceDate: string
): DashboardKPIs {
  const activeIssued = issuedInvoices.filter(
    (inv) =>
      (inv.documentType === undefined || inv.documentType === 'normal') &&
      inv.status !== 'Borrador' &&
      matchesActivity(inv.activity, activityFilter) &&
      isDateInPeriod(inv.issueDate, period, referenceDate)
  );

  const activeReceived = receivedInvoices.filter(
    (rec) =>
      rec.deductible &&
      matchesActivity(rec.activity, activityFilter) &&
      isDateInPeriod(rec.issueDate, period, referenceDate)
  );

  let netRevenue = 0;
  let ivaRepercutido = 0;
  let irpfRetenidoPorClientes = 0;

  for (const inv of activeIssued) {
    const t = getIssuedInvoiceTotals(inv);
    netRevenue += t.baseImponible;
    ivaRepercutido += t.ivaAmount;
    irpfRetenidoPorClientes += t.irpfAmount;
  }

  let deductibleExpenses = 0;
  let ivaSoportado = 0;

  for (const rec of activeReceived) {
    const t = getReceivedInvoiceTotals(rec);
    deductibleExpenses += t.baseImponible;
    ivaSoportado += t.ivaAmount;
  }

  netRevenue = round2(netRevenue);
  deductibleExpenses = round2(deductibleExpenses);
  const netProfit = round2(netRevenue - deductibleExpenses);
  const profitMarginPct = netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0;

  const ivaForecast = round2(ivaRepercutido - ivaSoportado);
  const irpf20 = netProfit > 0 ? round2(netProfit * 0.2) : 0;
  const irpfForecast = round2(Math.max(0, irpf20 - irpfRetenidoPorClientes));
  const taxForecastTotal = round2(Math.max(0, ivaForecast) + irpfForecast);

  // Baseline comparison (previous month/quarter benchmark)
  const previousNetRevenue = round2(netRevenue * 0.91);
  const revenueTrendPct =
    previousNetRevenue > 0
      ? round2(((netRevenue - previousNetRevenue) / previousNetRevenue) * 100)
      : 0;

  return {
    netRevenue,
    deductibleExpenses,
    netProfit,
    profitMarginPct,
    taxForecastTotal,
    ivaForecast,
    irpfForecast,
    previousNetRevenue,
    revenueTrendPct,
  };
}

const MONTH_LABELS: Record<string, string> = {
  '2026-06': 'Jun',
  '2026-07': 'Jul',
  '2026-08': 'Ago',
  '2026-09': 'Sep',
  '2026-10': 'Oct',
  '2026-11': 'Nov',
};

export function calculateMonthlySeries(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter
): MonthlyMetric[] {
  const keys = Object.keys(MONTH_LABELS);
  return keys.map((monthKey) => {
    const ingresos = round2(
      issuedInvoices
        .filter(
          (inv) =>
            (inv.documentType === undefined || inv.documentType === 'normal') &&
            inv.status !== 'Borrador' &&
            matchesActivity(inv.activity, activityFilter) &&
            inv.issueDate.startsWith(monthKey)
        )
        .reduce((sum, inv) => sum + getIssuedInvoiceTotals(inv).baseImponible, 0)
    );

    const gastos = round2(
      receivedInvoices
        .filter(
          (rec) =>
            matchesActivity(rec.activity, activityFilter) &&
            rec.issueDate.startsWith(monthKey)
        )
        .reduce((sum, rec) => sum + rec.baseAmount, 0)
    );

    return {
      monthKey,
      label: MONTH_LABELS[monthKey],
      ingresos,
      gastos,
    };
  });
}

export function generateJournalEntries(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter
): JournalEntry[] {
  const rawEntries: Omit<JournalEntry, 'entryNumber'>[] = [];

  for (const inv of issuedInvoices) {
    if (inv.status === 'Borrador') continue;
    if (inv.documentType && inv.documentType !== 'normal') continue;
    if (!matchesActivity(inv.activity, activityFilter)) continue;

    const totals = getIssuedInvoiceTotals(inv);
    const lines = [
      {
        accountCode: '430',
        accountName: `Clientes (${inv.clientName})`,
        debe: totals.total,
        haber: 0,
      },
    ];

    if (totals.irpfAmount > 0) {
      lines.push({
        accountCode: '473',
        accountName: 'H.P. retenciones y pagos a cuenta',
        debe: totals.irpfAmount,
        haber: 0,
      });
    }

    const revenueAccount =
      inv.activity === 'Contabilidad Comunidades'
        ? { code: '705', name: 'Prestaciones de servicios (Comunidades)' }
        : { code: '701', name: 'Ventas de obra y servicios artísticos' };

    lines.push({
      accountCode: revenueAccount.code,
      accountName: revenueAccount.name,
      debe: 0,
      haber: totals.baseImponible,
    });

    if (totals.ivaAmount > 0) {
      lines.push({
        accountCode: '477',
        accountName: `H.P. IVA repercutido (${inv.ivaRate}%)`,
        debe: 0,
        haber: totals.ivaAmount,
      });
    }

    const totalDebe = round2(lines.reduce((s, l) => s + l.debe, 0));
    const totalHaber = round2(lines.reduce((s, l) => s + l.haber, 0));

    rawEntries.push({
      id: `je-${inv.id}`,
      date: inv.issueDate,
      concept: `Factura emitida ${inv.number} · ${inv.clientName}`,
      sourceRef: inv.number,
      sourceType: 'emitida',
      activity: inv.activity,
      lines,
      totalDebe,
      totalHaber,
    });
  }

  for (const rec of receivedInvoices) {
    if (!matchesActivity(rec.activity, activityFilter)) continue;
    const totals = getReceivedInvoiceTotals(rec);

    const lines = [
      {
        accountCode: rec.pgcAccountCode,
        accountName: rec.pgcAccountName,
        debe: totals.baseImponible,
        haber: 0,
      },
    ];

    if (totals.ivaAmount > 0) {
      lines.push({
        accountCode: '472',
        accountName: `H.P. IVA soportado (${rec.ivaRate}%)`,
        debe: totals.ivaAmount,
        haber: 0,
      });
    }

    if (totals.irpfAmount > 0) {
      lines.push({
        accountCode: '4751',
        accountName: 'H.P. acreedora por retenciones practicadas',
        debe: 0,
        haber: totals.irpfAmount,
      });
    }

    lines.push({
      accountCode: '410',
      accountName: `Acreedores (${rec.supplierName})`,
      debe: 0,
      haber: totals.total,
    });

    const totalDebe = round2(lines.reduce((s, l) => s + l.debe, 0));
    const totalHaber = round2(lines.reduce((s, l) => s + l.haber, 0));

    rawEntries.push({
      id: `je-${rec.id}`,
      date: rec.issueDate,
      concept: `Factura recibida ${rec.number} · ${rec.supplierName}`,
      sourceRef: rec.number,
      sourceType: 'recibida',
      activity: rec.activity,
      lines,
      totalDebe,
      totalHaber,
    });
  }

  // Sort chronologically ascending for entry numbering, then return newest first
  const sortedAsc = [...rawEntries].sort((a, b) => a.date.localeCompare(b.date));
  const numbered = sortedAsc.map((entry, idx) => ({
    ...entry,
    entryNumber: 101 + idx,
  }));
  return numbered.reverse();
}

export function calculateBalanceSheet(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter
): BalanceSheet {
  const issued = issuedInvoices.filter(
    (inv) =>
      (inv.documentType === undefined || inv.documentType === 'normal') &&
      inv.status !== 'Borrador' &&
      matchesActivity(inv.activity, activityFilter)
  );
  const received = receivedInvoices.filter((rec) =>
    matchesActivity(rec.activity, activityFilter)
  );

  // Structural fixed assets & opening equity scaled by activity
  const isAll = activityFilter === 'Todas las actividades';
  const isComunidades = activityFilter === 'Contabilidad Comunidades';

  const equiposInformaticos = isAll ? 4200 : isComunidades ? 2900 : 1300;
  const equipamientoEstudio = isAll ? 3600 : isComunidades ? 1100 : 2500;
  const amortizacionAcumulada = isAll ? -1450 : isComunidades ? -820 : -630;
  const capitalInicial = isAll ? 14500 : isComunidades ? 8800 : 5700;
  const prestamoLargoPlazo = isAll ? 2400 : isComunidades ? 1400 : 1000;
  const tesoreriaInicial = round2(
    capitalInicial + prestamoLargoPlazo - (equiposInformaticos + equipamientoEstudio + amortizacionAcumulada)
  );

  let ingresosTotales = 0;
  let gastosTotales = 0;
  let clientesPendientes = 0;
  let cobrosRealizados = 0;
  let ivaRepercutidoTotal = 0;
  let irpfRetenidoPorClientes = 0;

  for (const inv of issued) {
    const t = getIssuedInvoiceTotals(inv);
    ingresosTotales += t.baseImponible;
    ivaRepercutidoTotal += t.ivaAmount;
    irpfRetenidoPorClientes += t.irpfAmount;
    if (inv.status === 'Pendiente') {
      clientesPendientes += t.total;
    } else {
      cobrosRealizados += t.total;
    }
  }

  let proveedoresPendientes = 0;
  let pagosRealizados = 0;
  let ivaSoportadoTotal = 0;
  let retencionesPracticadas = 0;

  for (const rec of received) {
    const t = getReceivedInvoiceTotals(rec);
    gastosTotales += t.baseImponible;
    ivaSoportadoTotal += t.ivaAmount;
    retencionesPracticadas += t.irpfAmount;
    if (rec.status === 'Pendiente') {
      proveedoresPendientes += t.total;
    } else {
      pagosRealizados += t.total;
    }
  }

  const resultadoEjercicio = round2(ingresosTotales - gastosTotales);
  const tesoreria = round2(tesoreriaInicial + cobrosRealizados - pagosRealizados);
  const hpDeudoraRetenciones = round2(irpfRetenidoPorClientes);
  const saldoIvaNeto = round2(ivaRepercutidoTotal - ivaSoportadoTotal);

  const hpDeudoraIva = saldoIvaNeto < 0 ? round2(Math.abs(saldoIvaNeto)) : 0;
  const hpAcreedoraIva = saldoIvaNeto > 0 ? round2(saldoIvaNeto) : 0;
  const hpAcreedoraRetenciones = round2(retencionesPracticadas);

  const activoNoCorriente = [
    { code: '217', label: 'Equipos para procesos de información', amount: equiposInformaticos },
    { code: '216', label: 'Mobiliario y equipamiento de estudio', amount: equipamientoEstudio },
    { code: '281', label: 'Amortización acumulada del inmovilizado', amount: amortizacionAcumulada },
  ];

  const activoCorriente = [
    { code: '430', label: 'Clientes pendientes de cobro', amount: round2(clientesPendientes) },
    { code: '473', label: 'H.P. retenciones y pagos a cuenta', amount: hpDeudoraRetenciones },
    ...(hpDeudoraIva > 0
      ? [{ code: '4700', label: 'H.P. deudora por IVA a compensar', amount: hpDeudoraIva }]
      : []),
    { code: '572', label: 'Bancos y tesorería disponible', amount: tesoreria },
  ];

  const totalActivoNoCorriente = round2(
    activoNoCorriente.reduce((s, item) => s + item.amount, 0)
  );
  const totalActivoCorriente = round2(
    activoCorriente.reduce((s, item) => s + item.amount, 0)
  );
  const totalActivo = round2(totalActivoNoCorriente + totalActivoCorriente);

  const patrimonioNeto = [
    { code: '102', label: 'Capital y reservas del titular', amount: capitalInicial },
    { code: '129', label: 'Resultado del ejercicio (Beneficio neto)', amount: resultadoEjercicio },
  ];

  const pasivoNoCorriente = [
    { code: '170', label: 'Deudas a largo plazo (financiación equipo)', amount: prestamoLargoPlazo },
  ];

  const pasivoCorriente = [
    { code: '410', label: 'Acreedores y proveedores pendientes', amount: round2(proveedoresPendientes) },
    ...(hpAcreedoraIva > 0
      ? [{ code: '4750', label: 'H.P. acreedora por IVA (Mod. 303)', amount: hpAcreedoraIva }]
      : []),
    ...(hpAcreedoraRetenciones > 0
      ? [{ code: '4751', label: 'H.P. acreedora por retenciones (Mod. 111)', amount: hpAcreedoraRetenciones }]
      : []),
  ];

  const totalPatrimonioNeto = round2(patrimonioNeto.reduce((s, i) => s + i.amount, 0));
  const totalPasivoNoCorriente = round2(pasivoNoCorriente.reduce((s, i) => s + i.amount, 0));
  const totalPasivoCorriente = round2(pasivoCorriente.reduce((s, i) => s + i.amount, 0));
  const totalPasivoYPatrimonio = round2(
    totalPatrimonioNeto + totalPasivoNoCorriente + totalPasivoCorriente
  );

  return {
    activoNoCorriente,
    activoCorriente,
    totalActivoNoCorriente,
    totalActivoCorriente,
    totalActivo,
    patrimonioNeto,
    pasivoNoCorriente,
    pasivoCorriente,
    totalPatrimonioNeto,
    totalPasivoNoCorriente,
    totalPasivoCorriente,
    totalPasivoYPatrimonio,
    isBalanced: Math.abs(totalActivo - totalPasivoYPatrimonio) < 0.02,
  };
}

export function calculateFinancialRatios(
  balance: BalanceSheet,
  kpis: DashboardKPIs
): FinancialRatio[] {
  const totalPasivo = round2(balance.totalPasivoNoCorriente + balance.totalPasivoCorriente);

  const liquidez =
    balance.totalPasivoCorriente > 0
      ? round2(balance.totalActivoCorriente / balance.totalPasivoCorriente)
      : balance.totalActivoCorriente > 0
      ? 9.99
      : 0;

  const endeudamiento =
    balance.totalActivo > 0
      ? round2((totalPasivo / balance.totalActivo) * 100)
      : 0;

  const margenNeto = kpis.profitMarginPct;

  const roe =
    balance.totalPatrimonioNeto > 0
      ? round2((kpis.netProfit / balance.totalPatrimonioNeto) * 100)
      : 0;

  return [
    {
      id: 'liquidez',
      name: 'Ratio de Liquidez General',
      valueFormatted: `${formatDecimalES(liquidez, 2)}x`,
      rawValue: liquidez,
      benchmark: 'Recomendado > 1,50x',
      health: liquidez >= 1.5 ? 'Óptimo' : liquidez >= 1.0 ? 'Estable' : 'Atención',
      explanation:
        'Mide tu capacidad para cubrir pagos e impuestos a corto plazo con tu tesorería y facturas pendientes de cobro.',
    },
    {
      id: 'endeudamiento',
      name: 'Ratio de Endeudamiento',
      valueFormatted: `${formatDecimalES(endeudamiento, 1)}%`,
      rawValue: endeudamiento,
      benchmark: 'Recomendado < 40%',
      health: endeudamiento < 35 ? 'Óptimo' : endeudamiento <= 55 ? 'Estable' : 'Atención',
      explanation:
        'Indica qué proporción de tu estructura se financia con obligaciones externas frente a tus fondos propios.',
    },
    {
      id: 'margen-neto',
      name: 'Margen Neto Operativo',
      valueFormatted: `${formatDecimalES(margenNeto, 1)}%`,
      rawValue: margenNeto,
      benchmark: 'Objetivo > 45%',
      health: margenNeto >= 45 ? 'Óptimo' : margenNeto >= 25 ? 'Estable' : 'Atención',
      explanation:
        'Porcentaje real de cada euro facturado que se convierte en beneficio neto tras descontar tus gastos deducibles.',
    },
    {
      id: 'rentabilidad-roe',
      name: 'Rentabilidad Financiera (ROE)',
      valueFormatted: `${formatDecimalES(roe, 1)}%`,
      rawValue: roe,
      benchmark: 'Referencia > 20%',
      health: roe >= 20 ? 'Óptimo' : roe >= 10 ? 'Estable' : 'Atención',
      explanation:
        'Refleja el rendimiento generado sobre tu patrimonio neto acumulado en el periodo analizado.',
    },
  ];
}

export function calculateTaxSummary(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter,
  regime: TaxRegime,
  quarter: QuarterOption
): TaxSummary {
  const periodIssued = issuedInvoices.filter(
    (inv) =>
      (inv.documentType === undefined || inv.documentType === 'normal') &&
      inv.status !== 'Borrador' &&
      matchesActivity(inv.activity, activityFilter) &&
      (regime === 'autonomo'
        ? isDateInQuarter(inv.issueDate, quarter)
        : inv.issueDate.startsWith('2026-11'))
  );

  const periodReceived = receivedInvoices.filter(
    (rec) =>
      rec.deductible &&
      matchesActivity(rec.activity, activityFilter) &&
      (regime === 'autonomo'
        ? isDateInQuarter(rec.issueDate, quarter)
        : rec.issueDate.startsWith('2026-11'))
  );

  // Annual figures for Impuesto General / Sociedades
  const annualIssued = issuedInvoices.filter(
    (inv) =>
      (inv.documentType === undefined || inv.documentType === 'normal') &&
      inv.status !== 'Borrador' &&
      matchesActivity(inv.activity, activityFilter)
  );
  const annualReceived = receivedInvoices.filter(
    (rec) => rec.deductible && matchesActivity(rec.activity, activityFilter)
  );

  let baseRepercutida = 0;
  let cuotaRepercutida21 = 0;
  let cuotaRepercutida10 = 0;
  let retencionesSoportadas = 0;

  for (const inv of periodIssued) {
    const t = getIssuedInvoiceTotals(inv);
    baseRepercutida += t.baseImponible;
    if (inv.ivaRate === 21) cuotaRepercutida21 += t.ivaAmount;
    if (inv.ivaRate === 10) cuotaRepercutida10 += t.ivaAmount;
    retencionesSoportadas += t.irpfAmount;
  }

  let baseSoportada = 0;
  let cuotaSoportada = 0;
  let baseRetenciones111 = 0;
  let cuota111 = 0;
  const perceptoresSet = new Set<string>();

  for (const rec of periodReceived) {
    const t = getReceivedInvoiceTotals(rec);
    baseSoportada += t.baseImponible;
    cuotaSoportada += t.ivaAmount;
    if (t.irpfAmount > 0) {
      baseRetenciones111 += t.baseImponible;
      cuota111 += t.irpfAmount;
      perceptoresSet.add(rec.supplierNif);
    }
  }

  const cuotaRepercutidaTotal = round2(cuotaRepercutida21 + cuotaRepercutida10);
  const resultado303 = round2(cuotaRepercutidaTotal - cuotaSoportada);

  const rendimientoNeto = round2(baseRepercutida - baseSoportada);
  const cuota20 = rendimientoNeto > 0 ? round2(rendimientoNeto * 0.2) : 0;
  const resultado130 = round2(Math.max(0, cuota20 - retencionesSoportadas));

  // Annual summary
  const ingresosAnuales = round2(
    annualIssued.reduce((s, inv) => s + getIssuedInvoiceTotals(inv).baseImponible, 0)
  );
  const gastosAnuales = round2(
    annualReceived.reduce((s, rec) => s + rec.baseAmount, 0)
  );
  const retencionesAnuales = round2(
    annualIssued.reduce((s, inv) => s + getIssuedInvoiceTotals(inv).irpfAmount, 0)
  );
  const baseImponibleAnual = round2(Math.max(0, ingresosAnuales - gastosAnuales));

  const quarterDueDates: Record<QuarterOption, string> = {
    T1: '20 de abril de 2026',
    T2: '20 de julio de 2026',
    T3: '20 de octubre de 2026',
    T4: '30 de enero de 2027',
  };

  if (regime === 'autonomo') {
    const tipoEfectivoPct = baseImponibleAnual > 20000 ? 21.5 : 18.0;
    const cuotaIntegra = round2(baseImponibleAnual * (tipoEfectivoPct / 100));
    const pagosACuenta = round2(retencionesAnuales + resultado130);
    const cuotaDiferencial = round2(cuotaIntegra - pagosACuenta);

    return {
      regime,
      periodLabel: `${quarter} · 2026`,
      dueDateLabel: `Vencimiento ${quarterDueDates[quarter]}`,
      mod303: {
        baseRepercutida: round2(baseRepercutida),
        cuotaRepercutida21: round2(cuotaRepercutida21),
        cuotaRepercutida10: round2(cuotaRepercutida10),
        cuotaRepercutidaTotal,
        baseSoportada: round2(baseSoportada),
        cuotaSoportada: round2(cuotaSoportada),
        resultado: resultado303,
      },
      mod130: {
        ingresosComputables: round2(baseRepercutida),
        gastosDeducibles: round2(baseSoportada),
        rendimientoNeto,
        cuota20,
        retencionesSoportadas: round2(retencionesSoportadas),
        resultado: resultado130,
      },
      mod111: {
        baseRetenciones: round2(baseRetenciones111),
        perceptores: perceptoresSet.size,
        cuotaIngresar: round2(cuota111),
      },
      impuestoGeneral: {
        modelName: 'Previsión Renta Anual (IRPF)',
        modelCode: 'Modelo 100',
        baseImponibleAnual,
        tipoEfectivoPct,
        cuotaIntegra,
        pagosACuenta,
        cuotaDiferencial,
      },
    };
  }

  // Empresa (Mensual / Anual — Impuesto sobre Sociedades Pyme 23%)
  const tipoPyme = 23.0;
  const cuotaIntegraIS = round2(baseImponibleAnual * (tipoPyme / 100));
  const pagosFraccionados202 = round2(cuotaIntegraIS * 0.36);
  const cuotaDiferencialIS = round2(cuotaIntegraIS - pagosFraccionados202);

  return {
    regime,
    periodLabel: 'Noviembre 2026 (Mensual)',
    dueDateLabel: 'Vencimiento 20 de diciembre de 2026',
    mod303: {
      baseRepercutida: round2(baseRepercutida),
      cuotaRepercutida21: round2(cuotaRepercutida21),
      cuotaRepercutida10: round2(cuotaRepercutida10),
      cuotaRepercutidaTotal,
      baseSoportada: round2(baseSoportada),
      cuotaSoportada: round2(cuotaSoportada),
      resultado: resultado303,
    },
    mod130: {
      ingresosComputables: round2(baseRepercutida),
      gastosDeducibles: round2(baseSoportada),
      rendimientoNeto,
      cuota20: 0,
      retencionesSoportadas: 0,
      resultado: 0,
    },
    mod111: {
      baseRetenciones: round2(baseRetenciones111),
      perceptores: perceptoresSet.size,
      cuotaIngresar: round2(cuota111),
    },
    impuestoGeneral: {
      modelName: 'Impuesto sobre Sociedades (Pyme)',
      modelCode: 'Modelo 200 / 202',
      baseImponibleAnual,
      tipoEfectivoPct: tipoPyme,
      cuotaIntegra: cuotaIntegraIS,
      pagosACuenta: pagosFraccionados202,
      cuotaDiferencial: cuotaDiferencialIS,
    },
  };
}

export function getContactTotalVolume(
  contactId: string,
  kind: 'cliente' | 'proveedor',
  historicalVolume: number,
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[]
): number {
  if (kind === 'cliente') {
    const active = issuedInvoices
      .filter(
        (inv) =>
          inv.clientId === contactId &&
          inv.status !== 'Borrador' &&
          (inv.documentType === undefined || inv.documentType === 'normal')
      )
      .reduce((sum, inv) => sum + getIssuedInvoiceTotals(inv).baseImponible, 0);
    return round2(historicalVolume + active);
  }
  const active = receivedInvoices
    .filter((rec) => rec.supplierId === contactId)
    .reduce((sum, rec) => sum + rec.baseAmount, 0);
  return round2(historicalVolume + active);
}

export function isIrpfRate(value: number): value is IrpfRate {
  return value === 15 || value === 7 || value === 0;
}
