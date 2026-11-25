import type { IssuedInvoice, ReceivedInvoice } from '../types';
import { round2 } from './finance';
import { getQuarterFromIsoDate } from '../services/aeatBooksExportService';

export type FiscalQuarter = '1T' | '2T' | '3T' | '4T';

export interface CashflowForecastParams {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  year: number;
  quarter: FiscalQuarter;
  legalForm?: 'autonomo' | 'sl' | 'other' | string;
  activityId?: string;
  referenceDate?: string;
}

export interface CashflowForecastResult {
  year: number;
  quarter: FiscalQuarter;
  legalForm: string;

  // 1. Tesorería Operativa del Periodo
  collectedIncome: number;
  pendingReceivables: number;
  overdueReceivables: number;
  totalReceivables: number;
  paidExpenses: number;
  pendingPayables: number;
  overduePayables: number;
  totalPayables: number;
  currentCashBalance: number; // Cobros cobrados − Pagos pagados

  // 2. Reserva Fiscal Estimada del Trimestre
  vatCollected: number; // IVA Repercutido (facturas emitidas)
  vatDeductible: number; // IVA Soportado Deducible (gastos)
  vatBalance: number; // Estimación Modelo 303 (Repercutido − Deducible)
  computableIncome: number; // Base imponible facturas emitidas
  deductibleExpenseIrpf: number; // Base gastos deducibles IRPF
  netOperatingProfit: number; // computableIncome − deductibleExpenseIrpf
  withholdingsCollected: number; // Retenciones practicadas al emisor (emitidas)
  irpfProvision: number; // Estimación Modelo 130 (20% neto − retenciones) (0 si SL)
  withholdingsPayable: number; // Estimación Modelo 111/115 (retenciones a profesionales/alquiler)
  recommendedTaxReserve: number; // MAX(0, vatBalance) + MAX(0, irpfProvision) + MAX(0, withholdingsPayable)
  taxDeadline: string; // "20 de abril", "20 de julio", "20 de octubre", "30 de enero"
  taxDeadlineDate: string; // ISO date "YYYY-MM-DD"

  // 3. Liquidez Neta Real tras Impuestos
  netFreeCashflow: number; // (collectedIncome - paidExpenses) + totalReceivables - totalPayables - recommendedTaxReserve
}

/**
 * Returns deadline string and ISO date for a given year and quarter in Spanish tax calendar.
 */
export function getAeatTaxDeadline(year: number, quarter: FiscalQuarter): { label: string; isoDate: string } {
  switch (quarter) {
    case '1T':
      return { label: '20 de abril', isoDate: `${year}-04-20` };
    case '2T':
      return { label: '20 de julio', isoDate: `${year}-07-20` };
    case '3T':
      return { label: '20 de octubre', isoDate: `${year}-10-20` };
    case '4T':
      return { label: `30 de enero de ${year + 1}`, isoDate: `${year + 1}-01-30` };
  }
}

/**
 * Computes exact quarterly cashflow and tax reserve forecast from live issued and received invoices.
 * Stricly adheres to AEAT fiscal rules and multi-tenant isolation.
 */
export function calculateCashflowTaxForecast(params: CashflowForecastParams): CashflowForecastResult {
  const {
    issuedInvoices,
    receivedInvoices,
    year,
    quarter,
    legalForm = 'autonomo',
    activityId,
    referenceDate = '2026-11-25',
  } = params;

  const isCompany = legalForm === 'sl';

  // 1. Filter issued invoices: ONLY fiscal (normal & rectificativa), excluding proforma and albaran
  const quarterIssued = issuedInvoices.filter((inv) => {
    if (inv.documentType === 'proforma' || inv.documentType === 'albaran') {
      return false;
    }
    if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') {
      return false;
    }

    const invYear = parseInt((inv.issueDate || '').slice(0, 4), 10);
    if (invYear !== year) return false;

    const invQuarter = getQuarterFromIsoDate(inv.issueDate);
    if (invQuarter !== quarter) return false;

    if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
      if (inv.activityId && inv.activityId !== activityId && inv.activity !== activityId) {
        return false;
      }
      if (!inv.activityId && inv.activity !== activityId) {
        return false;
      }
    }

    return true;
  });

  // 2. Filter received invoices: by accountingDate (fiscal deduction date)
  const quarterReceived = receivedInvoices.filter((exp) => {
    const fiscalDate = exp.accountingDate || exp.issueDate || '';
    const expYear = parseInt(fiscalDate.slice(0, 4), 10);
    if (expYear !== year) return false;

    const expQuarter = getQuarterFromIsoDate(fiscalDate);
    if (expQuarter !== quarter) return false;

    if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
      if (exp.activityId && exp.activityId !== activityId && exp.activity !== activityId) {
        return false;
      }
      if (!exp.activityId && exp.activity !== activityId) {
        return false;
      }
    }

    return true;
  });

  // 3. Operational Treasury (Cobros & Pagos)
  let collectedIncome = 0;
  let pendingReceivables = 0;
  let overdueReceivables = 0;

  quarterIssued.forEach((inv) => {
    const total = inv.totalAmount != null ? Number(inv.totalAmount) : 0;
    const isPaid = inv.status === 'Cobrada';

    if (isPaid) {
      collectedIncome += total;
    } else {
      const isOverdue = inv.dueDate ? inv.dueDate < referenceDate : false;
      if (isOverdue) {
        overdueReceivables += total;
      } else {
        pendingReceivables += total;
      }
    }
  });

  let paidExpenses = 0;
  let pendingPayables = 0;
  let overduePayables = 0;

  quarterReceived.forEach((exp) => {
    const base = Number(exp.baseAmount ?? 0);
    const vat = (base * Number(exp.ivaRate ?? 21)) / 100;
    const irpf = (base * Number(exp.irpfRetainedRate ?? 0)) / 100;
    const total = base + vat - irpf;

    if (exp.paymentStatus === 'paid') {
      paidExpenses += total;
    } else if (exp.paymentStatus === 'overdue') {
      overduePayables += total;
    } else {
      pendingPayables += total;
    }
  });

  collectedIncome = round2(collectedIncome);
  pendingReceivables = round2(pendingReceivables);
  overdueReceivables = round2(overdueReceivables);
  const totalReceivables = round2(pendingReceivables + overdueReceivables);

  paidExpenses = round2(paidExpenses);
  pendingPayables = round2(pendingPayables);
  overduePayables = round2(overduePayables);
  const totalPayables = round2(pendingPayables + overduePayables);

  const currentCashBalance = round2(collectedIncome - paidExpenses);

  // 4. Tax Reserve Breakdown (Reserva Fiscal AEAT)
  // IVA: Mod. 303
  let vatCollected = 0;
  let computableIncome = 0;
  let withholdingsCollected = 0;

  quarterIssued.forEach((inv) => {
    vatCollected += inv.vatTotal != null ? Number(inv.vatTotal) : 0;
    computableIncome += inv.taxBase != null ? Number(inv.taxBase) : 0;
    withholdingsCollected += inv.irpfTotal != null ? Number(inv.irpfTotal) : 0;
  });

  let vatDeductible = 0;
  let deductibleExpenseIrpf = 0;
  let withholdingsPayable = 0;

  quarterReceived.forEach((exp) => {
    const base = Number(exp.baseAmount ?? 0);
    const vatRate = Number(exp.ivaRate ?? 21);
    const rawVat = (base * vatRate) / 100;

    const vatPct = exp.deductibleVatPct != null ? Number(exp.deductibleVatPct) : 100;
    const dedVat = exp.deductibleVatAmount != null ? Number(exp.deductibleVatAmount) : (rawVat * vatPct) / 100;
    vatDeductible += dedVat;

    const expPct = exp.deductibleExpensePct != null ? Number(exp.deductibleExpensePct) : 100;
    const dedExp = exp.deductibleExpenseAmount != null ? Number(exp.deductibleExpenseAmount) : (base * expPct) / 100;
    deductibleExpenseIrpf += dedExp;

    const irpfRate = Number(exp.irpfRetainedRate ?? 0);
    const rawIrpf = (base * irpfRate) / 100;
    withholdingsPayable += rawIrpf;
  });

  vatCollected = round2(vatCollected);
  vatDeductible = round2(vatDeductible);
  const vatBalance = round2(vatCollected - vatDeductible);

  computableIncome = round2(computableIncome);
  deductibleExpenseIrpf = round2(deductibleExpenseIrpf);
  const netOperatingProfit = round2(computableIncome - deductibleExpenseIrpf);
  withholdingsCollected = round2(withholdingsCollected);

  // IRPF Provision (Modelo 130): 20% on positive net profit minus already withheld amounts
  let irpfProvision = 0;
  if (!isCompany) {
    const grossTax = Math.max(0, netOperatingProfit) * 0.2;
    irpfProvision = round2(Math.max(0, grossTax - withholdingsCollected));
  }

  withholdingsPayable = round2(withholdingsPayable);

  // Recommended Tax Reserve: sum of positive amounts to deposit
  const recommendedTaxReserve = round2(
    Math.max(0, vatBalance) + Math.max(0, irpfProvision) + Math.max(0, withholdingsPayable)
  );

  const deadline = getAeatTaxDeadline(year, quarter);

  // 5. Net Free Cashflow after tax reserve
  // (collectedIncome - paidExpenses) + totalReceivables - totalPayables - recommendedTaxReserve
  const netFreeCashflow = round2(
    currentCashBalance + totalReceivables - totalPayables - recommendedTaxReserve
  );

  return {
    year,
    quarter,
    legalForm,
    collectedIncome,
    pendingReceivables,
    overdueReceivables,
    totalReceivables,
    paidExpenses,
    pendingPayables,
    overduePayables,
    totalPayables,
    currentCashBalance,
    vatCollected,
    vatDeductible,
    vatBalance,
    computableIncome,
    deductibleExpenseIrpf,
    netOperatingProfit,
    withholdingsCollected,
    irpfProvision,
    withholdingsPayable,
    recommendedTaxReserve,
    taxDeadline: deadline.label,
    taxDeadlineDate: deadline.isoDate,
    netFreeCashflow,
  };
}
