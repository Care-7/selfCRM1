import type { ActivityFilter, IssuedInvoice, ReceivedInvoice } from '../types';
import { round2 } from './finance';
import {
  formatAeatAmount,
  escapeCsvCell,
  getQuarterFromIsoDate,
} from '../services/aeatBooksExportService';

export type FiscalQuarter = '1T' | '2T' | '3T' | '4T';
export type TaxModelType = '303' | '130' | '111' | '115' | '390';

export interface TaxModelCasilla {
  code: string; // e.g. "[01]", "[03]", "[27]", etc.
  description: string;
  base?: number;
  ratePct?: number;
  amount: number;
}

export interface Model303Result {
  model: '303';
  year: number;
  quarter: FiscalQuarter;
  activityFilter?: ActivityFilter;

  // IVA Devengado
  base21: number;
  cuota21: number;
  base10: number;
  cuota10: number;
  base4: number;
  cuota4: number;
  totalBaseDevengada: number;
  totalCuotaDevengada: number; // [27]

  // IVA Deducible
  baseDeducible: number; // [28]
  cuotaDeducible: number; // [29]
  totalDeducir: number; // [45]

  // Resultado
  diferencia: number; // [46] = [27] - [45]
  resultadoLiquidacion: number; // [69] / [71]
  status: 'A ingresar' | 'A compensar / devolver';

  casillas: TaxModelCasilla[];
}

export interface Model130Result {
  model: '130';
  year: number;
  quarter: FiscalQuarter;
  activityFilter?: ActivityFilter;
  isApplicable: boolean;
  legalForm: string;
  note?: string;

  // Casillas Oficiales
  ingresosComputables: number; // [01]
  gastosDeducibles: number; // [02]
  rendimientoNeto: number; // [03] = [01] - [02]
  cuota20: number; // [04] = 20% de [03] (si > 0)
  pagosAnteriores: number; // [05] = suma de trimestres anteriores
  retencionesSoportadas: number; // [06] = retenciones clientes YTD
  totalIngresar: number; // [07] = MAX(0, [04] - [05] - [06])
  status: 'A ingresar' | 'Sin cuota a ingresar';

  casillas: TaxModelCasilla[];
}

export interface Model115Result {
  model: '115';
  year: number;
  quarter: FiscalQuarter;
  activityFilter?: ActivityFilter;

  perceptores: number; // [01]
  baseRetenciones: number; // [02]
  retencionesIngresadas: number; // [03]
  totalIngresar: number; // [05]
  status: 'A ingresar' | 'Sin retenciones';

  casillas: TaxModelCasilla[];
}

export interface Model111Result {
  model: '111';
  year: number;
  quarter: FiscalQuarter;
  activityFilter?: ActivityFilter;

  perceptores: number; // [07]
  baseRetenciones: number; // [08]
  retencionesPracticadas: number; // [09]
  totalIngresar: number; // [28]
  status: 'A ingresar' | 'Sin retenciones';

  casillas: TaxModelCasilla[];
}

export interface Model390Result {
  model: '390';
  year: number;
  activityFilter?: ActivityFilter;

  // IVA Devengado anual
  base21: number;
  cuota21: number;
  base10: number;
  cuota10: number;
  base4: number;
  cuota4: number;
  totalBaseDevengada: number;
  totalCuotaDevengada: number; // [33]

  // IVA Deducible anual
  baseDeducible: number; // [47]
  cuotaDeducible: number; // [48]
  totalCuotaDeducible: number; // [64]

  // Liquidación anual
  resultadoOrdinario: number; // [65] = [33] - [64]
  sumaIngresos303: number; // [84] = sum(303 trimestrales > 0)
  resultadoFinal: number; // [86] = regularización o a compensar
  status: 'A ingresar' | 'A compensar / regularizado';

  casillas: TaxModelCasilla[];
}

export interface CommonTaxModelParams {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  year: number;
  quarter: FiscalQuarter;
  activityFilter?: ActivityFilter;
  legalForm?: string;
}

/**
 * Extracts and normalizes fiscal amounts from an issued invoice.
 * Strictly ignores 'proforma' and 'albaran'.
 */
export function getFiscalIssuedAmounts(inv: IssuedInvoice) {
  let taxBase = inv.taxBase != null ? Number(inv.taxBase) : null;
  let vatTotal = inv.vatTotal != null ? Number(inv.vatTotal) : null;
  let irpfTotal = inv.irpfTotal != null ? Number(inv.irpfTotal) : null;
  let totalAmount = inv.totalAmount != null ? Number(inv.totalAmount) : null;

  if (taxBase === null || vatTotal === null || totalAmount === null) {
    const lines = inv.lines || [];
    taxBase = lines.reduce(
      (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
      0
    );
    const ivaRate = inv.ivaRate ?? 21;
    const irpfRate = inv.irpfRate ?? 0;
    vatTotal = round2(taxBase * (ivaRate / 100));
    irpfTotal = round2(taxBase * (irpfRate / 100));
    totalAmount = round2(taxBase + vatTotal - irpfTotal);
  }

  return {
    taxBase: round2(taxBase),
    vatTotal: round2(vatTotal),
    irpfTotal: round2(irpfTotal ?? 0),
    totalAmount: round2(totalAmount),
    vatRate: inv.ivaRate ?? 21,
    irpfRate: inv.irpfRate ?? 0,
  };
}

/**
 * Extracts and normalizes fiscal deductible amounts from a received invoice.
 */
export function getFiscalReceivedAmounts(rec: ReceivedInvoice) {
  const base = rec.baseAmount != null ? Number(rec.baseAmount) : 0;
  const vatRate = rec.ivaRate ?? 21;
  const irpfRate = rec.irpfRetainedRate ?? 0;
  const vatTotal = round2(base * (vatRate / 100));
  const irpfTotal = round2(base * (irpfRate / 100));

  const isDeductible = rec.deductible !== false;
  const deductibleVatPct = isDeductible
    ? (rec.deductibleVatPct != null ? Number(rec.deductibleVatPct) : 100)
    : 0;
  const deductibleExpensePct = isDeductible
    ? (rec.deductibleExpensePct != null ? Number(rec.deductibleExpensePct) : 100)
    : 0;

  const deductibleVat = round2(vatTotal * (deductibleVatPct / 100));
  const deductibleExpense = round2(base * (deductibleExpensePct / 100));
  const deductibleBaseVat = round2(base * (deductibleVatPct / 100));

  return {
    base: round2(base),
    vatRate,
    vatTotal,
    irpfRate,
    irpfTotal,
    deductibleVatPct,
    deductibleExpensePct,
    deductibleVat,
    deductibleExpense,
    deductibleBaseVat,
  };
}

/**
 * Checks if an invoice or expense matches the selected activity filter.
 */
function matchesActivity(
  itemActivity: string | undefined,
  itemActivityId: string | undefined,
  filter?: ActivityFilter
): boolean {
  if (!filter || filter === 'Todas las actividades' || filter === ('all' as any)) return true;
  return itemActivity === filter || itemActivityId === filter;
}

/**
 * Filter fiscal issued invoices (only 'normal' and 'rectificativa', strictly no proforma or albaran).
 */
function filterFiscalIssued(
  invoices: IssuedInvoice[],
  year: number,
  quarters: FiscalQuarter[],
  activityFilter?: ActivityFilter
) {
  return invoices.filter((inv) => {
    if (inv.documentType === 'proforma' || inv.documentType === 'albaran') return false;
    if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') return false;

    const date = inv.issueDate || '';
    if (date.slice(0, 4) !== String(year)) return false;

    const q = getQuarterFromIsoDate(date);
    if (!quarters.includes(q)) return false;

    return matchesActivity(inv.activity, inv.activityId, activityFilter);
  });
}

/**
 * Filter fiscal received invoices.
 */
function filterFiscalReceived(
  expenses: ReceivedInvoice[],
  year: number,
  quarters: FiscalQuarter[],
  activityFilter?: ActivityFilter
) {
  return expenses.filter((rec) => {
    const fiscalDate = rec.accountingDate || rec.issueDate || '';
    if (fiscalDate.slice(0, 4) !== String(year)) return false;

    const q = getQuarterFromIsoDate(fiscalDate);
    if (!quarters.includes(q)) return false;

    return matchesActivity(rec.activity, rec.activityId, activityFilter);
  });
}

/**
 * 1. MODELO 303: Autoliquidación Trimestral de IVA
 */
export function calculateModel303(params: CommonTaxModelParams): Model303Result {
  const { issuedInvoices, receivedInvoices, year, quarter, activityFilter } = params;

  const fiscalIssued = filterFiscalIssued(issuedInvoices, year, [quarter], activityFilter);
  const fiscalReceived = filterFiscalReceived(receivedInvoices, year, [quarter], activityFilter);

  let base21 = 0;
  let cuota21 = 0;
  let base10 = 0;
  let cuota10 = 0;
  let base4 = 0;
  let cuota4 = 0;

  for (const inv of fiscalIssued) {
    const { taxBase, vatTotal, vatRate } = getFiscalIssuedAmounts(inv);
    if (vatRate === 10) {
      base10 += taxBase;
      cuota10 += vatTotal;
    } else if (vatRate === 4) {
      base4 += taxBase;
      cuota4 += vatTotal;
    } else {
      // General 21% (or any other standard rate)
      base21 += taxBase;
      cuota21 += vatTotal;
    }
  }

  base21 = round2(base21);
  cuota21 = round2(cuota21);
  base10 = round2(base10);
  cuota10 = round2(cuota10);
  base4 = round2(base4);
  cuota4 = round2(cuota4);

  const totalBaseDevengada = round2(base21 + base10 + base4);
  const totalCuotaDevengada = round2(cuota21 + cuota10 + cuota4);

  let baseDeducible = 0;
  let cuotaDeducible = 0;

  for (const rec of fiscalReceived) {
    const { deductibleBaseVat, deductibleVat } = getFiscalReceivedAmounts(rec);
    baseDeducible += deductibleBaseVat;
    cuotaDeducible += deductibleVat;
  }

  baseDeducible = round2(baseDeducible);
  cuotaDeducible = round2(cuotaDeducible);
  const totalDeducir = cuotaDeducible;

  const diferencia = round2(totalCuotaDevengada - totalDeducir);
  const resultadoLiquidacion = diferencia;
  const status = resultadoLiquidacion > 0 ? 'A ingresar' : 'A compensar / devolver';

  const casillas: TaxModelCasilla[] = [
    { code: '[01]', description: 'Régimen general: Base imponible al 21%', base: base21, ratePct: 21, amount: base21 },
    { code: '[03]', description: 'Régimen general: Cuota repercutida al 21%', base: base21, ratePct: 21, amount: cuota21 },
    { code: '[04]', description: 'Régimen general: Base imponible al 10%', base: base10, ratePct: 10, amount: base10 },
    { code: '[06]', description: 'Régimen general: Cuota repercutida al 10%', base: base10, ratePct: 10, amount: cuota10 },
    { code: '[07]', description: 'Régimen general: Base imponible al 4%', base: base4, ratePct: 4, amount: base4 },
    { code: '[09]', description: 'Régimen general: Cuota repercutida al 4%', base: base4, ratePct: 4, amount: cuota4 },
    { code: '[27]', description: 'Total cuota devengada', amount: totalCuotaDevengada },
    { code: '[28]', description: 'Operaciones interiores corrientes: Base deducible', amount: baseDeducible },
    { code: '[29]', description: 'Operaciones interiores corrientes: Cuota deducible', amount: cuotaDeducible },
    { code: '[45]', description: 'Total a deducir', amount: totalDeducir },
    { code: '[46]', description: 'Resultado del régimen general (Diferencia)', amount: diferencia },
    { code: '[69]', description: 'Resultado de la liquidación', amount: resultadoLiquidacion },
    { code: '[71]', description: 'Total resultado de la autoliquidación', amount: resultadoLiquidacion },
  ];

  return {
    model: '303',
    year,
    quarter,
    activityFilter,
    base21,
    cuota21,
    base10,
    cuota10,
    base4,
    cuota4,
    totalBaseDevengada,
    totalCuotaDevengada,
    baseDeducible,
    cuotaDeducible,
    totalDeducir,
    diferencia,
    resultadoLiquidacion,
    status,
    casillas,
  };
}

/**
 * 2. MODELO 130: Pago Fraccionado IRPF Autónomos (Estimación Directa)
 * Regla de acumulación anual YTD (desde 01/01 hasta fin del trimestre actual).
 */
export function calculateModel130(params: CommonTaxModelParams): Model130Result {
  const { issuedInvoices, receivedInvoices, year, quarter, activityFilter, legalForm = 'autonomo' } = params;

  const isSociedad =
    legalForm === 'sl' ||
    legalForm === 'empresa' ||
    legalForm.toLowerCase().includes('sociedad') ||
    legalForm.toLowerCase().includes('s.l.');

  if (isSociedad) {
    return {
      model: '130',
      year,
      quarter,
      activityFilter,
      isApplicable: false,
      legalForm,
      note: 'No aplicable a Sociedades Limitadas — Tributa por Impuesto de Sociedades (Modelo 200 / 202)',
      ingresosComputables: 0,
      gastosDeducibles: 0,
      rendimientoNeto: 0,
      cuota20: 0,
      pagosAnteriores: 0,
      retencionesSoportadas: 0,
      totalIngresar: 0,
      status: 'Sin cuota a ingresar',
      casillas: [],
    };
  }

  // Quarters to accumulate up to the current quarter
  const quarterSequence: FiscalQuarter[] = ['1T', '2T', '3T', '4T'];
  const currentIndex = quarterSequence.indexOf(quarter);
  const quartersYTD = quarterSequence.slice(0, currentIndex + 1);

  const fiscalIssuedYTD = filterFiscalIssued(issuedInvoices, year, quartersYTD, activityFilter);
  const fiscalReceivedYTD = filterFiscalReceived(receivedInvoices, year, quartersYTD, activityFilter);

  // [01] Ingresos computables acumulados
  let ingresosComputables = 0;
  let retencionesSoportadas = 0;
  for (const inv of fiscalIssuedYTD) {
    const { taxBase, irpfTotal } = getFiscalIssuedAmounts(inv);
    ingresosComputables += taxBase;
    retencionesSoportadas += irpfTotal;
  }
  ingresosComputables = round2(ingresosComputables);
  retencionesSoportadas = round2(retencionesSoportadas);

  // [02] Gastos fiscalmente deducibles acumulados
  let gastosDeducibles = 0;
  for (const rec of fiscalReceivedYTD) {
    const { deductibleExpense } = getFiscalReceivedAmounts(rec);
    gastosDeducibles += deductibleExpense;
  }
  gastosDeducibles = round2(gastosDeducibles);

  // [03] Rendimiento neto acumulado
  const rendimientoNeto = round2(ingresosComputables - gastosDeducibles);

  // [04] 20% del rendimiento neto positivo
  const cuota20 = rendimientoNeto > 0 ? round2(rendimientoNeto * 0.2) : 0;

  // [05] Pagos fraccionados positivos ingresados en trimestres anteriores del mismo ejercicio
  let pagosAnteriores = 0;
  if (currentIndex > 0) {
    for (let i = 0; i < currentIndex; i++) {
      const prevQuarter = quarterSequence[i];
      // Recursive calculation for the previous quarter with autonomo legalForm
      const prevResult = calculateModel130({
        issuedInvoices,
        receivedInvoices,
        year,
        quarter: prevQuarter,
        activityFilter,
        legalForm: 'autonomo',
      });
      if (prevResult.totalIngresar > 0) {
        pagosAnteriores += prevResult.totalIngresar;
      }
    }
  }
  pagosAnteriores = round2(pagosAnteriores);

  // [07] Total liquidación = MAX(0, [04] - [05] - [06])
  const totalIngresar = round2(Math.max(0, cuota20 - pagosAnteriores - retencionesSoportadas));
  const status = totalIngresar > 0 ? 'A ingresar' : 'Sin cuota a ingresar';

  const casillas: TaxModelCasilla[] = [
    { code: '[01]', description: 'Ingresos computables acumulados del ejercicio', amount: ingresosComputables },
    { code: '[02]', description: 'Gastos fiscalmente deducibles acumulados del ejercicio', amount: gastosDeducibles },
    { code: '[03]', description: 'Rendimiento neto acumulado ([01] − [02])', amount: rendimientoNeto },
    { code: '[04]', description: '20% del rendimiento neto positivo (si casilla [03] > 0)', amount: cuota20 },
    { code: '[05]', description: 'A deducir: Pagos fraccionados ingresados en trimestres anteriores', amount: pagosAnteriores },
    { code: '[06]', description: 'A deducir: Retenciones e ingresos a cuenta soportados acumulados', amount: retencionesSoportadas },
    { code: '[07]', description: 'Total resultado a ingresar ([04] − [05] − [06])', amount: totalIngresar },
  ];

  return {
    model: '130',
    year,
    quarter,
    activityFilter,
    isApplicable: true,
    legalForm,
    ingresosComputables,
    gastosDeducibles,
    rendimientoNeto,
    cuota20,
    pagosAnteriores,
    retencionesSoportadas,
    totalIngresar,
    status,
    casillas,
  };
}

/**
 * 3. MODELO 115: Retenciones e ingresos a cuenta sobre arrendamientos de inmuebles urbanos (Cuenta PGC 621)
 */
export function calculateModel115(params: CommonTaxModelParams): Model115Result {
  const { receivedInvoices, year, quarter, activityFilter } = params;

  const fiscalReceived = filterFiscalReceived(receivedInvoices, year, [quarter], activityFilter);

  // Filter expenses belonging to 621 (rent) with IRPF withholdings
  const rentExpenses = fiscalReceived.filter((rec) => {
    const code = rec.pgcAccountCode || '';
    const hasWithholding = (rec.irpfRetainedRate && rec.irpfRetainedRate > 0) || (rec.baseAmount > 0 && rec.ivaRate !== undefined);
    return code === '621' && hasWithholding;
  });

  const distinctSuppliers = new Set<string>();
  let baseRetenciones = 0;
  let retencionesIngresadas = 0;

  for (const rec of rentExpenses) {
    const { base, irpfTotal } = getFiscalReceivedAmounts(rec);
    if (irpfTotal > 0) {
      const supplierKey = rec.supplierId || rec.supplierNif || rec.supplierName;
      if (supplierKey) distinctSuppliers.add(supplierKey);
      baseRetenciones += base;
      retencionesIngresadas += irpfTotal;
    }
  }

  const perceptores = distinctSuppliers.size;
  baseRetenciones = round2(baseRetenciones);
  retencionesIngresadas = round2(retencionesIngresadas);
  const totalIngresar = retencionesIngresadas;
  const status = totalIngresar > 0 ? 'A ingresar' : 'Sin retenciones';

  const casillas: TaxModelCasilla[] = [
    { code: '[01]', description: 'Número de perceptores (arrendadores)', amount: perceptores },
    { code: '[02]', description: 'Base de las retenciones e ingresos a cuenta', amount: baseRetenciones },
    { code: '[03]', description: 'Retenciones e ingresos a cuenta practicados', amount: retencionesIngresadas },
    { code: '[05]', description: 'Total resultado a ingresar', amount: totalIngresar },
  ];

  return {
    model: '115',
    year,
    quarter,
    activityFilter,
    perceptores,
    baseRetenciones,
    retencionesIngresadas,
    totalIngresar,
    status,
    casillas,
  };
}

/**
 * 4. MODELO 111: Retenciones sobre rendimientos del trabajo y de actividades económicas (Cuentas profesionales 623 y otras distintas de 621)
 */
export function calculateModel111(params: CommonTaxModelParams): Model111Result {
  const { receivedInvoices, year, quarter, activityFilter } = params;

  const fiscalReceived = filterFiscalReceived(receivedInvoices, year, [quarter], activityFilter);

  // Filter expenses with IRPF withholdings NOT belonging to 621 (e.g. 623 professional services)
  const nonRentExpenses = fiscalReceived.filter((rec) => {
    const code = rec.pgcAccountCode || '';
    return code !== '621';
  });

  const distinctSuppliers = new Set<string>();
  let baseRetenciones = 0;
  let retencionesPracticadas = 0;

  for (const rec of nonRentExpenses) {
    const { base, irpfTotal } = getFiscalReceivedAmounts(rec);
    if (irpfTotal > 0) {
      const supplierKey = rec.supplierId || rec.supplierNif || rec.supplierName;
      if (supplierKey) distinctSuppliers.add(supplierKey);
      baseRetenciones += base;
      retencionesPracticadas += irpfTotal;
    }
  }

  const perceptores = distinctSuppliers.size;
  baseRetenciones = round2(baseRetenciones);
  retencionesPracticadas = round2(retencionesPracticadas);
  const totalIngresar = retencionesPracticadas;
  const status = totalIngresar > 0 ? 'A ingresar' : 'Sin retenciones';

  const casillas: TaxModelCasilla[] = [
    { code: '[07]', description: 'Actividades económicas: Número de perceptores', amount: perceptores },
    { code: '[08]', description: 'Actividades económicas: Base de las retenciones', amount: baseRetenciones },
    { code: '[09]', description: 'Actividades económicas: Importe de las retenciones', amount: retencionesPracticadas },
    { code: '[28]', description: 'Total resultado a ingresar', amount: totalIngresar },
  ];

  return {
    model: '111',
    year,
    quarter,
    activityFilter,
    perceptores,
    baseRetenciones,
    retencionesPracticadas,
    totalIngresar,
    status,
    casillas,
  };
}

/**
 * 5. MODELO 390: Declaración Resumen Anual de IVA
 * Consolida 1T + 2T + 3T + 4T para todo el año fiscal.
 */
export function calculateModel390(params: Omit<CommonTaxModelParams, 'quarter'>): Model390Result {
  const { issuedInvoices, receivedInvoices, year, activityFilter } = params;

  const allQuarters: FiscalQuarter[] = ['1T', '2T', '3T', '4T'];
  const fiscalIssuedAnnual = filterFiscalIssued(issuedInvoices, year, allQuarters, activityFilter);
  const fiscalReceivedAnnual = filterFiscalReceived(receivedInvoices, year, allQuarters, activityFilter);

  let base21 = 0;
  let cuota21 = 0;
  let base10 = 0;
  let cuota10 = 0;
  let base4 = 0;
  let cuota4 = 0;

  for (const inv of fiscalIssuedAnnual) {
    const { taxBase, vatTotal, vatRate } = getFiscalIssuedAmounts(inv);
    if (vatRate === 10) {
      base10 += taxBase;
      cuota10 += vatTotal;
    } else if (vatRate === 4) {
      base4 += taxBase;
      cuota4 += vatTotal;
    } else {
      base21 += taxBase;
      cuota21 += vatTotal;
    }
  }

  base21 = round2(base21);
  cuota21 = round2(cuota21);
  base10 = round2(base10);
  cuota10 = round2(cuota10);
  base4 = round2(base4);
  cuota4 = round2(cuota4);

  const totalBaseDevengada = round2(base21 + base10 + base4);
  const totalCuotaDevengada = round2(cuota21 + cuota10 + cuota4);

  let baseDeducible = 0;
  let cuotaDeducible = 0;

  for (const rec of fiscalReceivedAnnual) {
    const { deductibleBaseVat, deductibleVat } = getFiscalReceivedAmounts(rec);
    baseDeducible += deductibleBaseVat;
    cuotaDeducible += deductibleVat;
  }

  baseDeducible = round2(baseDeducible);
  cuotaDeducible = round2(cuotaDeducible);
  const totalCuotaDeducible = cuotaDeducible;

  // Resultado ordinario anual
  const resultadoOrdinario = round2(totalCuotaDevengada - totalCuotaDeducible);

  // Suma de resultados a ingresar en las autoliquidaciones 303 trimestrales del año
  let sumaIngresos303 = 0;
  for (const q of allQuarters) {
    const mod303 = calculateModel303({
      issuedInvoices,
      receivedInvoices,
      year,
      quarter: q,
      activityFilter,
    });
    if (mod303.resultadoLiquidacion > 0) {
      sumaIngresos303 += mod303.resultadoLiquidacion;
    }
  }
  sumaIngresos303 = round2(sumaIngresos303);

  // Resultado final de regularización
  const resultadoFinal =
    resultadoOrdinario > 0
      ? round2(Math.max(0, resultadoOrdinario - sumaIngresos303))
      : resultadoOrdinario;

  const status = resultadoFinal > 0 ? 'A ingresar' : 'A compensar / regularizado';

  const casillas: TaxModelCasilla[] = [
    { code: '[01]', description: 'Operaciones ordinarias: Base imponible al 21%', base: base21, ratePct: 21, amount: base21 },
    { code: '[03]', description: 'Operaciones ordinarias: Cuota repercutida al 21%', base: base21, ratePct: 21, amount: cuota21 },
    { code: '[04]', description: 'Operaciones ordinarias: Base imponible al 10%', base: base10, ratePct: 10, amount: base10 },
    { code: '[06]', description: 'Operaciones ordinarias: Cuota repercutida al 10%', base: base10, ratePct: 10, amount: cuota10 },
    { code: '[07]', description: 'Operaciones ordinarias: Base imponible al 4%', base: base4, ratePct: 4, amount: base4 },
    { code: '[09]', description: 'Operaciones ordinarias: Cuota repercutida al 4%', base: base4, ratePct: 4, amount: cuota4 },
    { code: '[33]', description: 'Total base y cuota devengada', base: totalBaseDevengada, amount: totalCuotaDevengada },
    { code: '[47]', description: 'Operaciones interiores corrientes: Base deducible', amount: baseDeducible },
    { code: '[48]', description: 'Operaciones interiores corrientes: Cuota deducible', amount: cuotaDeducible },
    { code: '[64]', description: 'Total cuota deducible', amount: totalCuotaDeducible },
    { code: '[65]', description: 'Resultado régimen general anual', amount: resultadoOrdinario },
    { code: '[84]', description: 'Suma de ingresos realizados en las autoliquidaciones (Modelo 303)', amount: sumaIngresos303 },
    { code: '[86]', description: 'Resultado final de la liquidación anual', amount: resultadoFinal },
  ];

  return {
    model: '390',
    year,
    activityFilter,
    base21,
    cuota21,
    base10,
    cuota10,
    base4,
    cuota4,
    totalBaseDevengada,
    totalCuotaDevengada,
    baseDeducible,
    cuotaDeducible,
    totalCuotaDeducible,
    resultadoOrdinario,
    sumaIngresos303,
    resultadoFinal,
    status,
    casillas,
  };
}

/**
 * Exports official Tax Model Casillas to standardized Spanish Excel CSV format.
 * (UTF-8 BOM, semicolon separator, comma decimal).
 */
export function exportTaxModelDraftCsv(
  model: TaxModelType,
  year: number,
  period: string,
  casillas: TaxModelCasilla[]
): string {
  const headers = [
    'Modelo',
    'Ejercicio',
    'Periodo',
    'Casilla_AEAT',
    'Descripcion_Oficial',
    'Base_Imponible',
    'Tipo_Pct',
    'Importe_Cuota',
  ];

  const rows = casillas.map((c) => [
    escapeCsvCell(`Modelo ${model}`),
    escapeCsvCell(String(year)),
    escapeCsvCell(period),
    escapeCsvCell(c.code),
    escapeCsvCell(c.description),
    formatAeatAmount(c.base ?? null),
    c.ratePct != null ? formatAeatAmount(c.ratePct) : '',
    formatAeatAmount(c.amount),
  ]);

  return '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
}

/**
 * Triggers in-browser download of the draft CSV file.
 */
export function downloadTaxModelDraftCsv(
  model: TaxModelType,
  year: number,
  period: string,
  casillas: TaxModelCasilla[]
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const csvContent = exportTaxModelDraftCsv(model, year, period, casillas);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Borrador_AEAT_Modelo_${model}_${year}_${period}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
