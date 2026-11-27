import type {
  ActivityFilter,
  Contact,
  IssuedInvoice,
  ManualJournalEntry,
  ReceivedInvoice,
} from '../types';
import { round2 } from './finance';
import { getQuarterFromIsoDate, formatAeatDate, formatAeatAmount, escapeCsvCell } from '../services/aeatBooksExportService';

export const PGC_ACCOUNT_NAMES: Record<string, string> = {
  '100': 'Capital social',
  '102': 'Capital',
  '112': 'Reserva legal',
  '113': 'Reservas voluntarias',
  '120': 'Remanente',
  '121': 'Resultados negativos de ejercicios anteriores',
  '129': 'Resultado del ejercicio',
  '170': 'Deudas a largo plazo con entidades de crédito',
  '210': 'Terrenos y bienes naturales',
  '211': 'Construcciones',
  '213': 'Maquinaria',
  '216': 'Mobiliario',
  '217': 'Equipos para procesos de información',
  '281': 'Amortización acumulada del inmovilizado material',
  '300': 'Mercaderías',
  '400': 'Proveedores',
  '407': 'Anticipos a proveedores',
  '410': 'Acreedores por prestaciones de servicios',
  '430': 'Clientes',
  '438': 'Anticipos de clientes',
  '440': 'Deudores',
  '460': 'Anticipos de remuneraciones',
  '465': 'Remuneraciones pendientes de pago',
  '4700': 'H.P., deudora por IVA a compensar',
  '472': 'H.P., IVA soportado',
  '473': 'H.P., retenciones y pagos a cuenta',
  '4750': 'H.P., acreedora por IVA (Mod. 303)',
  '4751': 'H.P., acreedora por retenciones practicadas (Mod. 111)',
  '476': 'Organismos de la Seguridad Social acreedores',
  '477': 'H.P., IVA repercutido',
  '520': 'Deudas a corto plazo con entidades de crédito',
  '5201': 'Deudas a corto plazo con entidades de crédito',
  '551': 'Cuenta corriente con socios y administradores',
  '570': 'Caja, euros',
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
  if (code.startsWith('430') || code.startsWith('43')) return `Clientes (${code})`;
  if (code.startsWith('410') || code.startsWith('400') || code.startsWith('41') || code.startsWith('40')) {
    return `Proveedores / Acreedores (${code})`;
  }
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
  sourceType: 'emitida' | 'cobro' | 'recibida' | 'pago' | 'manual' | 'imported';
  activity: string;
  activityId?: string;
  lines: PgcJournalLine[];
  totalDebe: number;
  totalHaber: number;
  isBalanced: boolean;
  isManual?: boolean;
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
  clients?: Contact[];
  suppliers?: Contact[];
  manualEntries?: ManualJournalEntry[];
}

export interface PgcLedgerMovement {
  id: string;
  entryNumber: number;
  date: string;
  concept: string;
  documentNumber: string;
  sourceType: 'emitida' | 'cobro' | 'recibida' | 'pago' | 'manual' | 'imported';
  debe: number;
  haber: number;
  runningBalance: number;
  balanceType: 'D' | 'H' | 'C';
  signedBalance: number;
}

export interface PgcLedgerAccount {
  accountCode: string;
  accountName: string;
  movements: PgcLedgerMovement[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingBalanceType: 'D' | 'H' | 'C';
}

export interface PgcGeneralLedger {
  accounts: PgcLedgerAccount[];
  accountMap: Record<string, PgcLedgerAccount>;
  totalDebitAll: number;
  totalCreditAll: number;
}

export interface GenerateLedgerOptions {
  accountCode?: string;
  search?: string;
}

/**
 * Deterministically generates all PGC double-entry journal entries from issued and received invoices.
 * Strictly excludes proformas and albaranes.
 * Implements NRV 12ª (non-deductible VAT as greater expense in group 6).
 */
export function generatePgcJournalEntries(
  issuedInvoices: IssuedInvoice[],
  receivedInvoices: ReceivedInvoice[],
  activityFilter: ActivityFilter = 'Todas las actividades',
  clients?: Contact[],
  suppliers?: Contact[],
  manualEntries?: ManualJournalEntry[]
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

    let clientAccountCode = '430';
    let clientAccountName = getPgcAccountName('430');
    if (clients && clients.length > 0) {
      const matchedClient = clients.find(
        (c) =>
          (inv.clientId && c.id === inv.clientId) ||
          (inv.clientNif && c.nif && c.nif.trim().toUpperCase() === inv.clientNif.trim().toUpperCase()) ||
          (inv.clientName && c.name.trim().toLowerCase() === inv.clientName.trim().toLowerCase())
      );
      if (matchedClient?.accountCode) {
        clientAccountCode = matchedClient.accountCode.trim();
        clientAccountName = `${clientAccountCode} - ${inv.clientName || matchedClient.name}`;
      }
    }

    const lines: PgcJournalLine[] = [];

    if (totalAmount >= 0) {
      // Normal positive invoice
      lines.push({
        accountCode: clientAccountCode,
        accountName: clientAccountName,
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
        accountCode: clientAccountCode,
        accountName: clientAccountName,
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
              accountCode: clientAccountCode,
              accountName: clientAccountName,
              debe: 0,
              haber: amount,
            },
          ]
        : [
            {
              accountCode: clientAccountCode,
              accountName: clientAccountName,
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

    let supplierAccountCode = '410';
    let supplierAccountName = getPgcAccountName('410');
    if (suppliers && suppliers.length > 0) {
      const matchedSupplier = suppliers.find(
        (s) =>
          (exp.supplierId && s.id === exp.supplierId) ||
          (exp.supplierNif && s.nif && s.nif.trim().toUpperCase() === exp.supplierNif.trim().toUpperCase()) ||
          (exp.supplierName && s.name.trim().toLowerCase() === exp.supplierName.trim().toLowerCase())
      );
      if (matchedSupplier?.accountCode) {
        supplierAccountCode = matchedSupplier.accountCode.trim();
        supplierAccountName = `${supplierAccountCode} - ${exp.supplierName || matchedSupplier.name}`;
      }
    }

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
      accountCode: supplierAccountCode,
      accountName: supplierAccountName,
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
          accountCode: supplierAccountCode,
          accountName: supplierAccountName,
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

  // 3. Process Manual and Imported Journal Entries
  if (manualEntries && manualEntries.length > 0) {
    for (const me of manualEntries) {
      if (activityFilter !== 'Todas las actividades') {
        if (me.activity && me.activity !== activityFilter && me.activityId !== activityFilter) {
          continue;
        }
      }

      const lines: PgcJournalLine[] = me.lines.map((l) => ({
        accountCode: l.accountCode.trim(),
        accountName: l.accountName?.trim() || getPgcAccountName(l.accountCode.trim()),
        debe: round2(Number(l.debe ?? l.debit) || 0),
        haber: round2(Number(l.haber ?? l.credit) || 0),
      }));

      const totalDebe = round2(lines.reduce((s, l) => s + l.debe, 0));
      const totalHaber = round2(lines.reduce((s, l) => s + l.haber, 0));

      rawEntries.push({
        id: me.id,
        date: me.date || me.entryDate || '',
        concept: me.concept,
        documentNumber: me.documentNumber || '',
        sourceType: me.source || me.sourceType || 'manual',
        activity: me.activity || '',
        activityId: me.activityId,
        lines,
        totalDebe,
        totalHaber,
        isBalanced: Math.abs(totalDebe - totalHaber) < 0.01,
        isManual: true,
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
    clients,
    suppliers,
    manualEntries = [],
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

  const filteredManual = (manualEntries || []).filter((me) => {
    const entryDate = me.date || me.entryDate || '';
    const entryYear = parseInt(entryDate.slice(0, 4), 10);
    if (year !== undefined && entryYear !== year) return false;

    if (period !== 'ALL') {
      if (getQuarterFromIsoDate(entryDate) !== period) return false;
    }

    if (activityFilter !== 'Todas las actividades') {
      if (me.activity && me.activity !== activityFilter && me.activityId !== activityFilter) {
        return false;
      }
    }
    return true;
  });

  const journalEntries = generatePgcJournalEntries(
    filteredIssued,
    filteredReceived,
    activityFilter,
    clients,
    suppliers,
    filteredManual
  );

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
  // Group client and supplier subaccounts
  const clientRows = trialRows.filter(
    (r) =>
      (r.accountCode === '430' ||
        r.accountCode.startsWith('430') ||
        r.accountCode.startsWith('43')) &&
      r.accountCode !== '438'
  );
  const provRows = trialRows.filter(
    (r) =>
      (r.accountCode === '410' ||
        r.accountCode === '400' ||
        r.accountCode.startsWith('410') ||
        r.accountCode.startsWith('400') ||
        r.accountCode.startsWith('41') ||
        r.accountCode.startsWith('40')) &&
      r.accountCode !== '407'
  );

  const totalClientDebit = round2(clientRows.reduce((s, r) => s + r.debitBalance, 0));
  const totalClientCredit = round2(clientRows.reduce((s, r) => s + r.creditBalance, 0));

  const totalProvCredit = round2(provRows.reduce((s, r) => s + r.creditBalance, 0));
  const totalProvDebit = round2(provRows.reduce((s, r) => s + r.debitBalance, 0));

  const hpRetAcc = trialRows.find((r) => r.accountCode === '473');
  const bankAcc = trialRows.find((r) => r.accountCode === '572');
  const vatSopAcc = trialRows.find((r) => r.accountCode === '472');
  const vatRepAcc = trialRows.find((r) => r.accountCode === '477');

  const vatSopBalance = vatSopAcc?.debitBalance || 0;
  const vatRepBalance = vatRepAcc?.creditBalance || 0;
  const netVatDiff = round2(vatSopBalance - vatRepBalance);

  const activoCorriente: PgcBalanceSheetItem[] = [];

  if (totalClientDebit > 0 || trialRows.length === 0) {
    activoCorriente.push({
      code: '430',
      label: 'Clientes por ventas y prestaciones de servicios',
      amount: totalClientDebit,
    });
  }

  if (totalProvDebit > 0) {
    activoCorriente.push({
      code: '407',
      label: 'Anticipos a proveedores',
      amount: totalProvDebit,
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

  const bankDebit = bankAcc?.debitBalance || 0;
  const bankCredit = bankAcc?.creditBalance || 0;
  if (bankCredit <= 0 || bankDebit > 0 || trialRows.length === 0) {
    activoCorriente.push({
      code: '572',
      label: getPgcAccountName('572'),
      amount: bankDebit,
    });
  }

  // Equity (Patrimonio Neto)
  const patrimonioNeto: PgcBalanceSheetItem[] = [
    {
      code: '129',
      label: getPgcAccountName('129'),
      amount: netOperatingProfit,
    },
  ];

  // Liabilities (Pasivo Corriente)
  const retPractAcc = trialRows.find((r) => r.accountCode === '4751');

  const pasivoCorriente: PgcBalanceSheetItem[] = [];
  if (totalProvCredit > 0 || trialRows.length === 0) {
    pasivoCorriente.push({
      code: '410',
      label: 'Acreedores por prestaciones de servicios',
      amount: totalProvCredit,
    });
  }

  if (totalClientCredit > 0) {
    pasivoCorriente.push({
      code: '438',
      label: 'Anticipos de clientes',
      amount: totalClientCredit,
    });
  }

  if (bankCredit > 0) {
    pasivoCorriente.push({
      code: '5201',
      label: 'Deudas a corto plazo con entidades de crédito',
      amount: bankCredit,
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

  // Generalized classification for any additional accounts from manual entries
  // (e.g. 100 Capital Social, 217 Equipos informáticos, 300 Mercaderías, 465 Remuneraciones, 520 Préstamos)
  const isHandledCode = (code: string) => {
    if (code.startsWith('6') || code.startsWith('7')) return true;
    if (code === '472' || code === '477' || code === '473' || code === '4751' || code === '572' || code === '129') return true;
    if ((code === '430' || code.startsWith('430') || code.startsWith('43')) && code !== '438') return true;
    if ((code === '410' || code === '400' || code.startsWith('410') || code.startsWith('400') || code.startsWith('41') || code.startsWith('40')) && code !== '407') return true;
    return false;
  };

  const otherRows = trialRows.filter((r) => !isHandledCode(r.accountCode));

  for (const r of otherRows) {
    if (r.accountCode.startsWith('1')) {
      if (r.creditBalance > 0) {
        patrimonioNeto.push({
          code: r.accountCode,
          label: r.accountName,
          amount: r.creditBalance,
        });
      }
      if (r.debitBalance > 0) {
        patrimonioNeto.push({
          code: r.accountCode,
          label: r.accountName,
          amount: -r.debitBalance,
        });
      }
    } else if (r.accountCode.startsWith('2') || r.accountCode.startsWith('3')) {
      if (r.debitBalance > 0) {
        activoCorriente.push({
          code: r.accountCode,
          label: r.accountName,
          amount: r.debitBalance,
        });
      }
      if (r.creditBalance > 0) {
        activoCorriente.push({
          code: r.accountCode,
          label: r.accountName,
          amount: -r.creditBalance,
        });
      }
    } else {
      if (r.debitBalance > 0) {
        activoCorriente.push({
          code: r.accountCode,
          label: r.accountName,
          amount: r.debitBalance,
        });
      }
      if (r.creditBalance > 0) {
        pasivoCorriente.push({
          code: r.accountCode,
          label: r.accountName,
          amount: r.creditBalance,
        });
      }
    }
  }

  const totalActivoCorriente = round2(activoCorriente.reduce((s, i) => s + i.amount, 0));
  const totalActivo = totalActivoCorriente;

  const totalPatrimonioNeto = round2(patrimonioNeto.reduce((s, i) => s + i.amount, 0));

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
      ? round2((totalClientDebit / (operatingRevenue * 1.21)) * 365)
      : 0;

  const periodoMedioPagoDias =
    operatingExpenses > 0
      ? round2((totalProvCredit / (operatingExpenses * 1.21)) * 365)
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

/**
 * Generates the General Ledger (Libro Mayor) from a PGC snapshot or journal entries.
 * Calculates line-by-line chronological running balances and closing balances per account.
 */
export function generateGeneralLedger(
  snapshotOrEntries: PgcAccountingSnapshot | PgcJournalEntry[],
  options?: GenerateLedgerOptions
): PgcGeneralLedger {
  const entries: PgcJournalEntry[] = Array.isArray(snapshotOrEntries)
    ? snapshotOrEntries
    : snapshotOrEntries.journalEntries;

  // Group lines by accountCode
  const accountLinesMap = new Map<
    string,
    { accountName: string; lines: Array<{ entry: PgcJournalEntry; line: PgcJournalLine; index: number }> }
  >();

  for (const entry of entries) {
    entry.lines.forEach((line, index) => {
      if (!accountLinesMap.has(line.accountCode)) {
        accountLinesMap.set(line.accountCode, { accountName: line.accountName, lines: [] });
      }
      accountLinesMap.get(line.accountCode)!.lines.push({ entry, line, index });
    });
  }

  const allAccounts: PgcLedgerAccount[] = [];
  const accountMap: Record<string, PgcLedgerAccount> = {};
  let totalDebitAll = 0;
  let totalCreditAll = 0;

  const sortedAccountCodes = Array.from(accountLinesMap.keys()).sort();

  for (const code of sortedAccountCodes) {
    const info = accountLinesMap.get(code)!;
    // Sort chronologically ascending by date, then entryNumber, then line index
    const sortedLines = [...info.lines].sort((a, b) => {
      const dateCmp = a.entry.date.localeCompare(b.entry.date);
      if (dateCmp !== 0) return dateCmp;
      const numCmp = a.entry.entryNumber - b.entry.entryNumber;
      if (numCmp !== 0) return numCmp;
      return a.index - b.index;
    });

    let runningSigned = 0;
    let accountTotalDebit = 0;
    let accountTotalCredit = 0;
    const movements: PgcLedgerMovement[] = [];

    for (let i = 0; i < sortedLines.length; i++) {
      const { entry, line, index } = sortedLines[i];
      accountTotalDebit = round2(accountTotalDebit + line.debe);
      accountTotalCredit = round2(accountTotalCredit + line.haber);
      runningSigned = round2(runningSigned + line.debe - line.haber);

      const runningBalance = Math.abs(runningSigned);
      const balanceType: 'D' | 'H' | 'C' =
        runningSigned > 0.005 ? 'D' : runningSigned < -0.005 ? 'H' : 'C';

      movements.push({
        id: `m-${entry.id}-${code}-${index}-${i}`,
        entryNumber: entry.entryNumber,
        date: entry.date,
        concept: entry.concept,
        documentNumber: entry.documentNumber,
        sourceType: entry.sourceType,
        debe: line.debe,
        haber: line.haber,
        runningBalance,
        balanceType,
        signedBalance: runningSigned,
      });
    }

    const netClosing = round2(accountTotalDebit - accountTotalCredit);
    const closingBalance = Math.abs(netClosing);
    const closingBalanceType: 'D' | 'H' | 'C' =
      netClosing > 0.005 ? 'D' : netClosing < -0.005 ? 'H' : 'C';

    totalDebitAll = round2(totalDebitAll + accountTotalDebit);
    totalCreditAll = round2(totalCreditAll + accountTotalCredit);

    const accountObj: PgcLedgerAccount = {
      accountCode: code,
      accountName: info.accountName,
      movements,
      totalDebit: accountTotalDebit,
      totalCredit: accountTotalCredit,
      closingBalance,
      closingBalanceType,
    };

    allAccounts.push(accountObj);
    accountMap[code] = accountObj;
  }

  // Apply optional filtering
  let filteredAccounts = allAccounts;
  if (options?.accountCode) {
    const target = options.accountCode.trim().toLowerCase();
    filteredAccounts = filteredAccounts.filter(
      (a) => a.accountCode.toLowerCase() === target || a.accountCode.toLowerCase().startsWith(target)
    );
  }

  if (options?.search) {
    const q = options.search.trim().toLowerCase();
    filteredAccounts = filteredAccounts.filter(
      (a) =>
        a.accountCode.toLowerCase().includes(q) ||
        a.accountName.toLowerCase().includes(q) ||
        a.movements.some(
          (m) =>
            m.concept.toLowerCase().includes(q) ||
            m.documentNumber.toLowerCase().includes(q)
        )
    );
  }

  return {
    accounts: filteredAccounts,
    accountMap,
    totalDebitAll,
    totalCreditAll,
  };
}

/**
 * Generates an official UTF-8 BOM CSV export of the General Ledger (Libro Mayor).
 */
export function exportGeneralLedgerCsv(
  ledger: PgcGeneralLedger,
  selectedAccountCode?: string
): string {
  const headers = [
    'Cuenta',
    'Descripcion_Cuenta',
    'Fecha',
    'Asiento',
    'Documento',
    'Concepto',
    'Debe',
    'Haber',
    'Saldo',
    'D_H',
  ];

  const rows: string[] = [];
  const targetAccounts = selectedAccountCode
    ? ledger.accounts.filter(
        (a) =>
          a.accountCode === selectedAccountCode ||
          a.accountCode.startsWith(selectedAccountCode)
      )
    : ledger.accounts;

  for (const account of targetAccounts) {
    for (const m of account.movements) {
      rows.push(
        [
          escapeCsvCell(account.accountCode),
          escapeCsvCell(account.accountName),
          escapeCsvCell(formatAeatDate(m.date)),
          escapeCsvCell(String(m.entryNumber)),
          escapeCsvCell(m.documentNumber),
          escapeCsvCell(m.concept),
          formatAeatAmount(m.debe),
          formatAeatAmount(m.haber),
          formatAeatAmount(m.runningBalance),
          escapeCsvCell(m.balanceType),
        ].join(';')
      );
    }
  }

  return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
}

/**
 * Triggers downloading the General Ledger CSV file in browser environment.
 */
export function downloadGeneralLedgerCsv(
  ledger: PgcGeneralLedger,
  selectedAccountCode?: string,
  fileName?: string
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const finalFileName =
    fileName ||
    (selectedAccountCode
      ? `Libro_Mayor_Cuenta_${selectedAccountCode}.csv`
      : 'Libro_Mayor_PGC.csv');
  const csvContent = exportGeneralLedgerCsv(ledger, selectedAccountCode);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', finalFileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

