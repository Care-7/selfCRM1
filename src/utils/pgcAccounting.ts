import type {
  ActivityFilter,
  IssuedInvoice,
  ReceivedInvoice,
} from '../types';
import { round2 } from './finance';
import { getQuarterFromIsoDate, formatAeatDate, formatAeatAmount, escapeCsvCell } from '../services/aeatBooksExportService';

export const PGC_ACCOUNT_NAMES: Record<string, string> = {
  '129': 'Resultado del ejercicio',
  '410': 'Acreedores por prestaciones de servicios',
  '430': 'Clientes',
  '4700': 'H.P., deudora por IVA a compensar',
  '472': 'H.P., IVA soportado',
  '473': 'H.P., retenciones y pagos a cuenta',
  '4750': 'H.P., acreedora por IVA (Mod. 303)',
  '4751': 'H.P., acreedora por retenciones practicadas (Mod. 111)',
  '477': 'H.P., IVA repercutido',
  '572': 'Bancos e instituciones de crédito c/c',
  '600': 'Compras de mercaderías',
  '621': 'Arrendamientos y cánones',
  '622': 'Reparaciones y conservación',
  '623': 'Servicios de profesionales independientes',
  '624': 'Transportes',
  '625': 'Primas de seguros',
  '626': 'Servicios bancarios y similares',
  '627': 'Publicidad, propaganda y relaciones públicas',
  '628': 'Suministros (electricidad, agua, telecomunicaciones)',
  '629': 'Otros servicios',
  '700': 'Ventas de mercaderías',
  '705': 'Prestaciones de servicios',
};

export function getPgcAccountName(code: string): string {
  if (PGC_ACCOUNT_NAMES[code]) return PGC_ACCOUNT_NAMES[code];
  if (code.startsWith('6')) return `Gastos (${code})`;
  if (code.startsWith('7')) return `Ingresos (${code})`;
  if (code.startsWith('4')) return `Cuentas a cobrar / pagar (${code})`;
  return `Cuenta ${code}`;
}

export interface PgcJournalLine {
  accountCode: string;
  accountName: string;
  debe: number;
  haber: number;
}

export interface PgcJournalEntry {
  id: string;
  entryNumber: number;
  date: string; // YYYY-MM-DD
  concept: string;
  documentNumber: string;
  sourceType: 'emitida' | 'cobro' | 'recibida' | 'pago';
  activity: string;
  activityId?: string;
  lines: PgcJournalLine[];
  totalDebe: number;
  totalHaber: number;
  isBalanced: boolean;
}

export interface PgcTrialBalanceRow {
  accountCode: string;
  accountName: string;
  sumDebit: number;
  sumCredit: number;
  debitBalance: number;
  creditBalance: number;
}

export interface PgcTrialBalance {
  rows: PgcTrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  totalDebitBalance: number;
  totalCreditBalance: number;
  isBalanced: boolean;
}

export interface PgcProfitAndLoss {
  operatingRevenue: number;
  operatingExpenses: number;
  netOperatingProfit: number;
  netMarginPct: number;
  revenueBreakdown: { code: string; name: string; amount: number }[];
  expenseBreakdown: { code: string; name: string; amount: number }[];
}

export interface PgcBalanceSheetItem {
  code: string;
  label: string;
  amount: number;
}

export interface PgcBalanceSheet {
  activoCorriente: PgcBalanceSheetItem[];
  totalActivoCorriente: number;
  totalActivo: number;
  patrimonioNeto: PgcBalanceSheetItem[];
  totalPatrimonioNeto: number;
  pasivoCorriente: PgcBalanceSheetItem[];
  totalPasivoCorriente: number;
  totalPasivoYPatrimonio: number;
  isBalanced: boolean;
}

export interface PgcFinancialRatios {
  liquidezGeneral: number; // Activo Corriente / Pasivo Corriente
  margenNetoPct: number; // Beneficio neto / Ingresos * 100
  periodoMedioCobroDias: number; // (Clientes / FacturacionTotal) * 365
  periodoMedioPagoDias: number; // (Proveedores / GastosTotal) * 365
  endeudamientoPct: number; // Total Pasivo / Total Activo * 100
}

export type PgcAccountingPeriod = 'ALL' | '1T' | '2T' | '3T' | '4T';

export interface PgcAccountingSnapshot {
  year: number;
  period: PgcAccountingPeriod;
  activityFilter: ActivityFilter;
  journalEntries: PgcJournalEntry[];
  trialBalance: PgcTrialBalance;
  profitAndLoss: PgcProfitAndLoss;
  balanceSheet: PgcBalanceSheet;
  financialRatios: PgcFinancialRatios;
}

export interface GenerateAccountingParams {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  year?: number;
  period?: 'ALL' | '1T' | '2T' | '3T' | '4T';
  activityFilter?: ActivityFilter;
}

/**
 * Deterministically generates all PGC double-entry journal entries from issued and received invoices.
 * Strictly excludes proformas and albaranes.
 * Implements NRV 12ª (non-deductible VAT as greater expense in group 6).
 */
export function generatePgcJournalEntries(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter = 'Todas las actividades'
): PgcJournalEntry[] {
  const rawEntries: Omit<PgcJournalEntry, 'entryNumber'>[] = [];

  // 1. Process Issued Invoices (only normal and rectificativa)
  const fiscalIssued = issuedInvoices.filter((inv) => {
    if (inv.documentType === 'proforma' || inv.documentType === 'albaran') return false;
    if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') return false;
    if (activityFilter !== 'Todas las actividades' && inv.activity !== activityFilter && inv.activityId !== activityFilter) {
      return false;
    }
    return true;
  });

  for (const inv of fiscalIssued) {
    const taxBase = inv.taxBase != null ? Number(inv.taxBase) : 0;
    const vatTotal = inv.vatTotal != null ? Number(inv.vatTotal) : 0;
    const irpfTotal = inv.irpfTotal != null ? Number(inv.irpfTotal) : 0;
    const totalAmount = inv.totalAmount != null ? Number(inv.totalAmount) : 0;

    const lines: PgcJournalLine[] = [];

    if (totalAmount >= 0) {
      // Normal positive invoice
      lines.push({
        accountCode: '430',
        accountName: getPgcAccountName('430'),
        debe: round2(totalAmount),
        haber: 0,
      });

      if (irpfTotal > 0) {
        lines.push({
          accountCode: '473',
          accountName: getPgcAccountName('473'),
          debe: round2(irpfTotal),
          haber: 0,
        });
      }

      const salesAccount = inv.activity?.toLowerCase().includes('comunidades') ? '705' : '705';
      lines.push({
        accountCode: salesAccount,
        accountName: getPgcAccountName(salesAccount),
        debe: 0,
        haber: round2(taxBase),
      });

      if (vatTotal > 0) {
        lines.push({
          accountCode: '477',
          accountName: getPgcAccountName('477'),
          debe: 0,
          haber: round2(vatTotal),
        });
      }
    } else {
      // Rectificativa / Negative credit note
      // Invert entries to keep positive values and perfect balance
      const absBase = round2(Math.abs(taxBase));
      const absVat = round2(Math.abs(vatTotal));
      const absTotal = round2(Math.abs(totalAmount));
      const absIrpf = round2(Math.abs(irpfTotal));

      const salesAccount = '705';
      lines.push({
        accountCode: salesAccount,
        accountName: getPgcAccountName(salesAccount),
        debe: absBase,
        haber: 0,
      });

      if (absVat > 0) {
        lines.push({
          accountCode: '477',
          accountName: getPgcAccountName('477'),
          debe: absVat,
          haber: 0,
        });
      }

      lines.push({
        accountCode: '430',
        accountName: getPgcAccountName('430'),
        debe: 0,
        haber: absTotal,
      });

      if (absIrpf > 0) {
        lines.push({
          accountCode: '473',
          accountName: getPgcAccountName('473'),
          debe: 0,
          haber: absIrpf,
        });
      }
    }

    const totalDebe = round2(lines.reduce((s, l) => s + l.debe, 0));
    const totalHaber = round2(lines.reduce((s, l) => s + l.haber, 0));

    rawEntries.push({
      id: `entry-inv-${inv.id}`,
      date: inv.issueDate,
      concept: `Emisión ${inv.documentType === 'rectificativa' ? 'Factura Rectificativa' : 'Factura'} ${inv.number}`,
      documentNumber: inv.number,
      sourceType: 'emitida',
      activity: inv.activity,
      activityId: inv.activityId,
      lines,
      totalDebe,
      totalHaber,
      isBalanced: Math.abs(totalDebe - totalHaber) < 0.01,
    });

    // Collection entry if paid
    if (inv.status === 'Cobrada') {
      const isNegative = totalAmount < 0;
      const amount = round2(Math.abs(totalAmount));

      const cobroLines: PgcJournalLine[] = !isNegative
        ? [
            {
              accountCode: '572',
              accountName: getPgcAccountName('572'),
              debe: amount,
              haber: 0,
            },
            {
              accountCode: '430',
              accountName: getPgcAccountName('430'),
              debe: 0,
              haber: amount,
            },
          ]
        : [
            {
              accountCode: '430',
              accountName: getPgcAccountName('430'),
              debe: amount,
              haber: 0,
            },
            {
              accountCode: '572',
              accountName: getPgcAccountName('572'),
              debe: 0,
              haber: amount,
            },
          ];

      rawEntries.push({
        id: `entry-pay-${inv.id}`,
        date: inv.issueDate,
        concept: `Cobro ${inv.number} en cuenta bancaria`,
        documentNumber: inv.number,
        sourceType: 'cobro',
        activity: inv.activity,
        activityId: inv.activityId,
        lines: cobroLines,
        totalDebe: amount,
        totalHaber: amount,
        isBalanced: true,
      });
    }
  }

  // 2. Process Received Invoices / Expenses
  const fiscalReceived = receivedInvoices.filter((exp) => {
    if (activityFilter !== 'Todas las actividades' && exp.activity !== activityFilter && exp.activityId !== activityFilter) {
      return false;
    }
    return true;
  });

  for (const exp of fiscalReceived) {
    const fiscalDate = exp.accountingDate || exp.issueDate || '';
    const base = Number(exp.baseAmount ?? 0);
    const vatRate = Number(exp.ivaRate ?? 21);
    const rawVat = round2((base * vatRate) / 100);

    const deductibleVatPct = exp.deductibleVatPct != null ? Number(exp.deductibleVatPct) : 100;
    const deductibleVat = round2((rawVat * deductibleVatPct) / 100);
    // NRV 12ª PGC: Non-deductible VAT is recognized as higher expense in group 6
    const nonDeductibleVat = round2(rawVat - deductibleVat);
    const expenseAmount = round2(base + nonDeductibleVat);

    const irpfRate = Number(exp.irpfRetainedRate ?? 0);
    const irpfAmount = round2((base * irpfRate) / 100);
    const totalPayable = round2(base + rawVat - irpfAmount);

    const expenseCategory = exp.pgcAccountCode || '629';
    const lines: PgcJournalLine[] = [];

    lines.push({
      accountCode: expenseCategory,
      accountName: getPgcAccountName(expenseCategory),
      debe: expenseAmount,
      haber: 0,
    });

    if (deductibleVat > 0) {
      lines.push({
        accountCode: '472',
        accountName: getPgcAccountName('472'),
        debe: deductibleVat,
        haber: 0,
      });
    }

    lines.push({
      accountCode: '410',
      accountName: getPgcAccountName('410'),
      debe: 0,
      haber: totalPayable,
    });

    if (irpfAmount > 0) {
      lines.push({
        accountCode: '4751',
        accountName: getPgcAccountName('4751'),
        debe: 0,
        haber: irpfAmount,
      });
    }

    const totalDebe = round2(lines.reduce((s, l) => s + l.debe, 0));
    const totalHaber = round2(lines.reduce((s, l) => s + l.haber, 0));

    rawEntries.push({
      id: `entry-exp-${exp.id}`,
      date: fiscalDate,
      concept: `Registro gasto ${exp.number} · ${exp.concept || exp.supplierName}`,
      documentNumber: exp.number,
      sourceType: 'recibida',
      activity: exp.activity,
      activityId: exp.activityId,
      lines,
      totalDebe,
      totalHaber,
      isBalanced: Math.abs(totalDebe - totalHaber) < 0.01,
    });

    // Payment entry if paid
    if (exp.paymentStatus === 'paid') {
      const paymentDate = exp.paidAt ? exp.paidAt.slice(0, 10) : fiscalDate;
      const pagoLines: PgcJournalLine[] = [
        {
          accountCode: '410',
          accountName: getPgcAccountName('410'),
          debe: totalPayable,
          haber: 0,
        },
        {
          accountCode: '572',
          accountName: getPgcAccountName('572'),
          debe: 0,
          haber: totalPayable,
        },
      ];

      rawEntries.push({
        id: `entry-exppay-${exp.id}`,
        date: paymentDate,
        concept: `Pago gasto ${exp.number} por banco`,
        documentNumber: exp.number,
        sourceType: 'pago',
        activity: exp.activity,
        activityId: exp.activityId,
        lines: pagoLines,
        totalDebe: totalPayable,
        totalHaber: totalPayable,
        isBalanced: true,
      });
    }
  }

  // Sort chronologically ascending and assign entry numbers
  rawEntries.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return rawEntries.map((entry, idx) => ({
    ...entry,
    entryNumber: idx + 1,
  }));
}

/**
 * Computes complete PGC Trial Balance (Sumas y Saldos), P&L, Balance Sheet and Financial Ratios.
 */
export function generateAccountingSnapshot(params: GenerateAccountingParams): PgcAccountingSnapshot {
  const {
    issuedInvoices,
    receivedInvoices,
    year = 2026,
    period = 'ALL',
    activityFilter = 'Todas las actividades',
  } = params;

  // Filter input invoices by period before building snapshot
  const filteredIssued = issuedInvoices.filter((inv) => {
    if (inv.documentType === 'proforma' || inv.documentType === 'albaran') return false;
    if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') return false;

    const invYear = parseInt((inv.issueDate || '').slice(0, 4), 10);
    if (year !== undefined && invYear !== year) return false;

    if (period !== 'ALL') {
      if (getQuarterFromIsoDate(inv.issueDate) !== period) return false;
    }

    if (activityFilter !== 'Todas las actividades' && inv.activity !== activityFilter && inv.activityId !== activityFilter) {
      return false;
    }
    return true;
  });

  const filteredReceived = receivedInvoices.filter((exp) => {
    const fiscalDate = exp.accountingDate || exp.issueDate || '';
    const expYear = parseInt(fiscalDate.slice(0, 4), 10);
    if (year !== undefined && expYear !== year) return false;

    if (period !== 'ALL') {
      if (getQuarterFromIsoDate(fiscalDate) !== period) return false;
    }

    if (activityFilter !== 'Todas las actividades' && exp.activity !== activityFilter && exp.activityId !== activityFilter) {
      return false;
    }
    return true;
  });

  const journalEntries = generatePgcJournalEntries(filteredIssued, filteredReceived, activityFilter);

  // 1. Build Trial Balance (Sumas y Saldos)
  const accountMap = new Map<string, { sumDebit: number; sumCredit: number }>();

  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      const current = accountMap.get(line.accountCode) || { sumDebit: 0, sumCredit: 0 };
      current.sumDebit = round2(current.sumDebit + line.debe);
      current.sumCredit = round2(current.sumCredit + line.haber);
      accountMap.set(line.accountCode, current);
    }
  }

  const sortedCodes = Array.from(accountMap.keys()).sort();
  const trialRows: PgcTrialBalanceRow[] = sortedCodes.map((code) => {
    const acc = accountMap.get(code)!;
    const debitBalance = acc.sumDebit > acc.sumCredit ? round2(acc.sumDebit - acc.sumCredit) : 0;
    const creditBalance = acc.sumCredit > acc.sumDebit ? round2(acc.sumCredit - acc.sumDebit) : 0;

    return {
      accountCode: code,
      accountName: getPgcAccountName(code),
      sumDebit: acc.sumDebit,
      sumCredit: acc.sumCredit,
      debitBalance,
      creditBalance,
    };
  });

  const totalDebit = round2(trialRows.reduce((s, r) => s + r.sumDebit, 0));
  const totalCredit = round2(trialRows.reduce((s, r) => s + r.sumCredit, 0));
  const totalDebitBalance = round2(trialRows.reduce((s, r) => s + r.debitBalance, 0));
  const totalCreditBalance = round2(trialRows.reduce((s, r) => s + r.creditBalance, 0));

  const trialBalance: PgcTrialBalance = {
    rows: trialRows,
    totalDebit,
    totalCredit,
    totalDebitBalance,
    totalCreditBalance,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.02 && Math.abs(totalDebitBalance - totalCreditBalance) < 0.02,
  };

  // 2. Build Profit and Loss (Pérdidas y Ganancias)
  const revenueRows = trialRows.filter((r) => r.accountCode.startsWith('7'));
  const expenseRows = trialRows.filter((r) => r.accountCode.startsWith('6'));

  const operatingRevenue = round2(revenueRows.reduce((s, r) => s + r.creditBalance, 0));
  const operatingExpenses = round2(expenseRows.reduce((s, r) => s + r.debitBalance, 0));
  const netOperatingProfit = round2(operatingRevenue - operatingExpenses);
  const netMarginPct = operatingRevenue > 0 ? round2((netOperatingProfit / operatingRevenue) * 100) : 0;

  const profitAndLoss: PgcProfitAndLoss = {
    operatingRevenue,
    operatingExpenses,
    netOperatingProfit,
    netMarginPct,
    revenueBreakdown: revenueRows.map((r) => ({
      code: r.accountCode,
      name: r.accountName,
      amount: r.creditBalance,
    })),
    expenseBreakdown: expenseRows.map((r) => ({
      code: r.accountCode,
      name: r.accountName,
      amount: r.debitBalance,
    })),
  };

  // 3. Build Balance Sheet (Balance de Situación)
  // Assets (Activo Corriente)
  const clientAcc = trialRows.find((r) => r.accountCode === '430');
  const hpRetAcc = trialRows.find((r) => r.accountCode === '473');
  const bankAcc = trialRows.find((r) => r.accountCode === '572');
  const vatSopAcc = trialRows.find((r) => r.accountCode === '472');
  const vatRepAcc = trialRows.find((r) => r.accountCode === '477');

  const vatSopBalance = vatSopAcc?.debitBalance || 0;
  const vatRepBalance = vatRepAcc?.creditBalance || 0;
  const netVatDiff = round2(vatSopBalance - vatRepBalance);

  const activoCorriente: PgcBalanceSheetItem[] = [];

  const clientBalance = clientAcc?.debitBalance || 0;
  if (clientBalance > 0 || trialRows.length === 0) {
    activoCorriente.push({
      code: '430',
      label: getPgcAccountName('430'),
      amount: clientBalance,
    });
  }

  const retBalance = hpRetAcc?.debitBalance || 0;
  if (retBalance > 0) {
    activoCorriente.push({
      code: '473',
      label: getPgcAccountName('473'),
      amount: retBalance,
    });
  }

  if (netVatDiff > 0) {
    activoCorriente.push({
      code: '4700',
      label: getPgcAccountName('4700'),
      amount: netVatDiff,
    });
  }

  const bankBalance = bankAcc?.debitBalance || 0;
  activoCorriente.push({
    code: '572',
    label: getPgcAccountName('572'),
    amount: bankBalance,
  });

  const totalActivoCorriente = round2(activoCorriente.reduce((s, i) => s + i.amount, 0));
  const totalActivo = totalActivoCorriente;

  // Equity (Patrimonio Neto)
  const patrimonioNeto: PgcBalanceSheetItem[] = [
    {
      code: '129',
      label: getPgcAccountName('129'),
      amount: netOperatingProfit,
    },
  ];
  const totalPatrimonioNeto = netOperatingProfit;

  // Liabilities (Pasivo Corriente)
  const provAcc = trialRows.find((r) => r.accountCode === '410');
  const retPractAcc = trialRows.find((r) => r.accountCode === '4751');

  const pasivoCorriente: PgcBalanceSheetItem[] = [];
  const provBalance = provAcc?.creditBalance || 0;
  if (provBalance > 0 || trialRows.length === 0) {
    pasivoCorriente.push({
      code: '410',
      label: getPgcAccountName('410'),
      amount: provBalance,
    });
  }

  if (netVatDiff < 0) {
    pasivoCorriente.push({
      code: '4750',
      label: getPgcAccountName('4750'),
      amount: round2(Math.abs(netVatDiff)),
    });
  }

  const retPractBalance = retPractAcc?.creditBalance || 0;
  if (retPractBalance > 0) {
    pasivoCorriente.push({
      code: '4751',
      label: getPgcAccountName('4751'),
      amount: retPractBalance,
    });
  }

  const totalPasivoCorriente = round2(pasivoCorriente.reduce((s, i) => s + i.amount, 0));
  const totalPasivoYPatrimonio = round2(totalPatrimonioNeto + totalPasivoCorriente);

  const balanceSheet: PgcBalanceSheet = {
    activoCorriente,
    totalActivoCorriente,
    totalActivo,
    patrimonioNeto,
    totalPatrimonioNeto,
    pasivoCorriente,
    totalPasivoCorriente,
    totalPasivoYPatrimonio,
    isBalanced: Math.abs(totalActivo - totalPasivoYPatrimonio) < 0.02,
  };

  // 4. Financial Ratios
  const liquidezGeneral =
    totalPasivoCorriente > 0
      ? round2(totalActivoCorriente / totalPasivoCorriente)
      : totalActivoCorriente > 0
      ? 9.99
      : 0;

  const endeudamientoPct =
    totalActivo > 0 ? round2((totalPasivoCorriente / totalActivo) * 100) : 0;

  const periodoMedioCobroDias =
    operatingRevenue > 0
      ? round2((clientBalance / (operatingRevenue * 1.21)) * 365)
      : 0;

  const periodoMedioPagoDias =
    operatingExpenses > 0
      ? round2((provBalance / (operatingExpenses * 1.21)) * 365)
      : 0;

  const financialRatios: PgcFinancialRatios = {
    liquidezGeneral,
    margenNetoPct: netMarginPct,
    periodoMedioCobroDias,
    periodoMedioPagoDias,
    endeudamientoPct,
  };

  return {
    year,
    period,
    activityFilter,
    journalEntries,
    trialBalance,
    profitAndLoss,
    balanceSheet,
    financialRatios,
  };
}

/**
 * Generates an official UTF-8 BOM CSV export of the Libro Diario for accounting software imports.
 */
export function exportJournalCsv(entries: PgcJournalEntry[]): string {
  const headers = [
    'Asiento',
    'Fecha',
    'Cuenta',
    'Descripcion_Cuenta',
    'Concepto',
    'Documento',
    'Debe',
    'Haber',
  ];

  const rows: string[] = [];

  for (const entry of entries) {
    for (const line of entry.lines) {
      rows.push(
        [
          escapeCsvCell(String(entry.entryNumber)),
          escapeCsvCell(formatAeatDate(entry.date)),
          escapeCsvCell(line.accountCode),
          escapeCsvCell(line.accountName),
          escapeCsvCell(entry.concept),
          escapeCsvCell(entry.documentNumber),
          formatAeatAmount(line.debe),
          formatAeatAmount(line.haber),
        ].join(';')
      );
    }
  }

  return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
}

/**
 * Triggers downloading the Journal CSV file in browser environment.
 */
export function downloadJournalCsv(
  entries: PgcJournalEntry[],
  fileName = 'Libro_Diario_PGC.csv'
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const csvContent = exportJournalCsv(entries);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
