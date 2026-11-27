import type {
  IssuedInvoice,
  ManualJournalEntry,
  ReceivedInvoice,
} from '../types';
import type { PgcJournalEntry } from './pgcAccounting';
import { formatCurrency, round2 } from './finance';

export interface DuplicateJournalMatch {
  existingId: string;
  entryNumber?: number | string;
  date: string;
  concept: string;
  documentNumber?: string;
  amount: number;
  reason: string;
  duplicateEntry: PgcJournalEntry | ManualJournalEntry;
}

export interface DuplicateReceivedInvoiceMatch {
  existingId: string;
  number: string;
  supplierName: string;
  issueDate: string;
  totalAmount: number;
  reason: string;
  duplicateInvoice: ReceivedInvoice;
}

export interface DuplicateIssuedInvoiceMatch {
  existingId: string;
  number: string;
  clientName: string;
  issueDate: string;
  totalAmount: number;
  reason: string;
  duplicateInvoice: IssuedInvoice;
}

export type DuplicateInvoiceResult = DuplicateIssuedInvoiceMatch;
export type DuplicateReceivedInvoiceResult = DuplicateReceivedInvoiceMatch;
export type DuplicateJournalResult = DuplicateJournalMatch;

/**
 * Normalizes strings by trimming and lowercasing for fuzzy/exact matching.
 */
function normalize(str?: string | null): string {
  return (str || '').trim().toLowerCase();
}

/**
 * Normalizes tax identification strings (removes hyphens, spaces, uppercase).
 */
function normalizeTaxId(taxId?: string | null): string {
  return (taxId || '').replace(/[\s\-_.]/g, '').toUpperCase();
}

/**
 * Detects if a candidate journal entry duplicates an existing automatic or manual journal entry.
 * Supports both:
 * 1) findDuplicateJournalEntries(candidate, existingEntries) -> DuplicateJournalMatch[]
 * 2) findDuplicateJournalEntries({ ...candidate, existingEntries }) -> DuplicateJournalMatch & DuplicateJournalMatch[] | null
 */
export function findDuplicateJournalEntries(
  arg1: {
    id?: string;
    currentEntryId?: string;
    date: string;
    concept?: string;
    documentNumber?: string;
    lines: Array<{ accountCode: string; debit?: number; credit?: number; debe?: number; haber?: number }>;
    existingEntries?: Array<PgcJournalEntry | ManualJournalEntry>;
  },
  arg2?: Array<PgcJournalEntry | ManualJournalEntry>
): any {
  const isSingleArg = !arg2;
  const existingEntries = arg2 || arg1.existingEntries || [];
  const candidate = arg1;
  const excludeId = candidate.id || candidate.currentEntryId;

  const matches: DuplicateJournalMatch[] = [];
  const candidateDoc = normalize(candidate.documentNumber);
  const candidateTotalDebe = round2(
    candidate.lines.reduce((s, l) => s + (Number(l.debit ?? l.debe) || 0), 0)
  );
  const candidateAccounts = new Set(
    candidate.lines.map((l) => l.accountCode.trim()).filter(Boolean)
  );

  for (const existing of existingEntries) {
    if (excludeId && existing.id === excludeId) continue;

    const existingDate = (existing as any).date || (existing as any).entryDate || '';
    const existingDoc = normalize((existing as any).documentNumber || '');
    const existingConcept = existing.concept || '';
    const existingTotal = Number(
      (existing as any).totalDebe ??
      (existing as any).totalDebit ??
      (existing as any).totalAmount ??
      ('lines' in existing ? (existing.lines as any[]).reduce((s, l) => s + (Number(l.debit ?? l.debe) || 0), 0) : 0)
    ) || 0;

    // 1. Same non-empty document number
    if (candidateDoc && existingDoc && candidateDoc === existingDoc) {
      matches.push({
        existingId: existing.id,
        entryNumber: 'entryNumber' in existing ? existing.entryNumber : undefined,
        date: existingDate,
        concept: existingConcept,
        documentNumber: 'documentNumber' in existing ? existing.documentNumber : undefined,
        amount: existingTotal,
        reason: `Mismo número de documento o factura ("${candidate.documentNumber}")`,
        duplicateEntry: existing,
      });
      continue;
    }

    // 2. Same date + identical amount (+- 0.01 €) + at least one common account
    const isSameDate = candidate.date && existingDate && candidate.date === existingDate;
    const isSameAmount = Math.abs(candidateTotalDebe - existingTotal) <= 0.01 && candidateTotalDebe > 0;

    if (isSameDate && isSameAmount) {
      const existingAccounts = 'lines' in existing
        ? existing.lines.map((l) => l.accountCode.trim())
        : [];
      const hasCommonAccount = existingAccounts.some((acc) => candidateAccounts.has(acc));

      if (hasCommonAccount) {
        matches.push({
          existingId: existing.id,
          entryNumber: 'entryNumber' in existing ? existing.entryNumber : undefined,
          date: existingDate,
          concept: existingConcept,
          documentNumber: 'documentNumber' in existing ? existing.documentNumber : undefined,
          amount: existingTotal,
          reason: `Misma fecha (${candidate.date}), mismo importe (${formatCurrency(candidateTotalDebe)}) y cuentas coincidentes`,
          duplicateEntry: existing,
        });
        continue;
      }
    }
  }

  if (matches.length === 0) {
    return isSingleArg ? null : [];
  }

  const first = matches[0];
  const result: any = matches;
  result.reason = first.reason;
  result.duplicateEntry = first.duplicateEntry;
  result.existingId = first.existingId;

  return isSingleArg ? Object.assign(first, { matches }) : result;
}

/**
 * Detects if a candidate received invoice (expense) duplicates an existing received invoice.
 * Supports both:
 * 1) findDuplicateReceivedInvoice(candidate, existingInvoices) -> DuplicateReceivedInvoiceMatch[]
 * 2) findDuplicateReceivedInvoice({ ...candidate, existingInvoices }) -> DuplicateReceivedInvoiceMatch | null
 */
export function findDuplicateReceivedInvoice(
  arg1: {
    id?: string;
    currentInvoiceId?: string;
    supplierId?: string | null;
    supplierNif?: string | null;
    supplierName?: string | null;
    supplierInvoiceNumber?: string | null;
    invoiceNumber?: string | null;
    number?: string | null;
    issueDate: string;
    total?: number;
    totalAmount?: number;
    existingInvoices?: ReceivedInvoice[];
  },
  arg2?: ReceivedInvoice[]
): any {
  const isSingleArg = !arg2;
  const existingInvoices = arg2 || arg1.existingInvoices || [];
  const candidate = arg1;
  const excludeId = candidate.id || candidate.currentInvoiceId;

  const matches: DuplicateReceivedInvoiceMatch[] = [];
  const candidateSupId = candidate.supplierId;
  const candidateNif = normalizeTaxId(candidate.supplierNif);
  const candidateName = normalize(candidate.supplierName);
  const candidateNum = normalize(candidate.supplierInvoiceNumber || candidate.invoiceNumber || candidate.number);
  const candidateTotal = round2(Number(candidate.totalAmount ?? candidate.total) || 0);

  for (const existing of existingInvoices) {
    if (excludeId && existing.id === excludeId) continue;

    const existingNif = normalizeTaxId(existing.supplierNif);
    const existingName = normalize(existing.supplierName);
    const existingNum = normalize(existing.number);
    const existingTotal = round2(
      Number(existing.totalAmount ?? (existing as any).total ?? (existing.baseAmount * (1 + (existing.ivaRate || 0) / 100))) || 0
    );

    const isSameSupplier =
      (candidateSupId && existing.supplierId && candidateSupId === existing.supplierId) ||
      (candidateNif && existingNif && candidateNif === existingNif) ||
      (candidateName && existingName && candidateName === existingName);

    // 1. Same supplier + identical invoice number
    if (isSameSupplier && candidateNum && existingNum && candidateNum === existingNum) {
      matches.push({
        existingId: existing.id,
        number: existing.number,
        supplierName: existing.supplierName,
        issueDate: existing.issueDate,
        totalAmount: existingTotal,
        reason: `Mismo proveedor y mismo número de factura ("${existing.number}")`,
        duplicateInvoice: existing,
      });
      continue;
    }

    // 2. Same supplier + exact same issue date + exact same total amount (+- 0.02 €)
    const isSameDate = candidate.issueDate && existing.issueDate && candidate.issueDate === existing.issueDate;
    const isSameTotal = Math.abs(candidateTotal - existingTotal) <= 0.05 && candidateTotal > 0;

    if (isSameSupplier && isSameDate && isSameTotal) {
      matches.push({
        existingId: existing.id,
        number: existing.number,
        supplierName: existing.supplierName,
        issueDate: existing.issueDate,
        totalAmount: existingTotal,
        reason: `Mismo proveedor en la misma fecha (${candidate.issueDate}) con el mismo importe (${formatCurrency(candidateTotal)})`,
        duplicateInvoice: existing,
      });
      continue;
    }
  }

  if (matches.length === 0) {
    return isSingleArg ? null : [];
  }

  const first = matches[0];
  const result: any = matches;
  result.reason = first.reason;
  result.duplicateInvoice = first.duplicateInvoice;
  result.existingId = first.existingId;

  return isSingleArg ? Object.assign(first, { matches }) : result;
}

/**
 * Detects if a candidate issued invoice duplicates an existing issued invoice.
 * Supports both:
 * 1) findDuplicateIssuedInvoice(candidate, existingInvoices) -> DuplicateIssuedInvoiceMatch[]
 * 2) findDuplicateIssuedInvoice({ ...candidate, existingInvoices }) -> DuplicateIssuedInvoiceMatch | null
 */
export function findDuplicateIssuedInvoice(
  arg1: {
    id?: string;
    currentInvoiceId?: string;
    clientId?: string | null;
    clientNif?: string | null;
    clientName?: string | null;
    invoiceNumber?: string | null;
    number?: string | null;
    issueDate: string;
    total?: number;
    totalAmount?: number;
    concept?: string | null;
    existingInvoices?: IssuedInvoice[];
  },
  arg2?: IssuedInvoice[]
): any {
  const isSingleArg = !arg2;
  const existingInvoices = arg2 || arg1.existingInvoices || [];
  const candidate = arg1;
  const excludeId = candidate.id || candidate.currentInvoiceId;

  const matches: DuplicateIssuedInvoiceMatch[] = [];
  const candidateClientId = candidate.clientId;
  const candidateNif = normalizeTaxId(candidate.clientNif);
  const candidateName = normalize(candidate.clientName);
  const candidateNum = normalize(candidate.invoiceNumber || candidate.number);
  const candidateTotal = round2(Number(candidate.totalAmount ?? candidate.total) || 0);

  for (const existing of existingInvoices) {
    if (excludeId && existing.id === excludeId) continue;

    const existingNif = normalizeTaxId(existing.clientNif);
    const existingName = normalize(existing.clientName);
    const existingNum = normalize(existing.number);
    const existingTotal = round2(Number(existing.totalAmount ?? (existing as any).total) || 0);

    // 1. Exact same invoice number
    if (candidateNum && existingNum && candidateNum === existingNum) {
      matches.push({
        existingId: existing.id,
        number: existing.number,
        clientName: existing.clientName,
        issueDate: existing.issueDate,
        totalAmount: existingTotal,
        reason: `Mismo número de factura ("${existing.number}") ya registrado`,
        duplicateInvoice: existing,
      });
      continue;
    }

    // 2. Same client + exact same issue date + exact same total amount (+- 0.02 €)
    const isSameClient =
      (candidateClientId && existing.clientId && candidateClientId === existing.clientId) ||
      (candidateNif && existingNif && candidateNif === existingNif) ||
      (candidateName && existingName && candidateName === existingName);

    const isSameDate = candidate.issueDate && existing.issueDate && candidate.issueDate === existing.issueDate;
    const isSameTotal = Math.abs(candidateTotal - existingTotal) <= 0.05 && candidateTotal > 0;

    if (isSameClient && isSameDate && isSameTotal) {
      matches.push({
        existingId: existing.id,
        number: existing.number,
        clientName: existing.clientName,
        issueDate: existing.issueDate,
        totalAmount: existingTotal,
        reason: `Mismo cliente en la misma fecha (${candidate.issueDate}) con el mismo importe (${formatCurrency(candidateTotal)})`,
        duplicateInvoice: existing,
      });
      continue;
    }
  }

  if (matches.length === 0) {
    return isSingleArg ? null : [];
  }

  const first = matches[0];
  const result: any = matches;
  result.reason = first.reason;
  result.duplicateInvoice = first.duplicateInvoice;
  result.existingId = first.existingId;

  return isSingleArg ? Object.assign(first, { matches }) : result;
}
