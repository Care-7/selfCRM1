import type { ActivityType, Contact, IssuedInvoice, ReceivedInvoice } from '../types';
import type { CreateManualJournalEntryInput, ManualJournalLineDb } from '../types/database';
import { parseCsvText, stripBom } from './csvImport';
import { formatCurrency, round2 } from './finance';
import { PGC_ACCOUNT_NAMES } from './pgcAccounting';
import {
  findDuplicateIssuedInvoice,
  findDuplicateReceivedInvoice,
  findDuplicateJournalEntries,
} from './duplicateDetector';

export interface ParsedHistoricalIssuedResult {
  validInvoices: IssuedInvoice[];
  invalidRows: { rowNumber: number; reason: string; raw: Record<string, string> }[];
  duplicateWarnings: { invoiceNumber: string; clientName: string; reason: string }[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

export interface ParsedHistoricalReceivedResult {
  validInvoices: ReceivedInvoice[];
  invalidRows: { rowNumber: number; reason: string; raw: Record<string, string> }[];
  duplicateWarnings: { invoiceNumber: string; supplierName: string; reason: string }[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

export interface ParsedContaSolJournalResult {
  validEntries: CreateManualJournalEntryInput[];
  invalidEntries: { entryNumber: string; reason: string; linesCount: number }[];
  skippedCommercialLinesCount: number;
  duplicateWarnings: { entryNumber: string; date: string; reason: string }[];
  summary: {
    totalEntries: number;
    validEntries: number;
    invalidEntries: number;
    duplicates: number;
  };
}

/**
 * Normalizes number strings from Spanish CSV ('1.234,56' -> 1234.56)
 */
export function parseSpanishNumber(val: string | number | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : round2(val);
  if (!val) return 0;
  let s = String(val).trim();
  // If format is like 1.234,56 (dot thousands, comma decimals)
  if (s.includes(',') && s.includes('.')) {
    if (s.indexOf('.') < s.indexOf(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : round2(n);
}

/**
 * Normalizes dates from various formats (YYYYMMDD, DD/MM/YYYY, YYYY-MM-DD) into YYYY-MM-DD
 */
export function parseHistoricalDate(val: string | undefined | null, fallback = '2026-01-01'): string {
  if (!val) return fallback;
  const s = String(val).trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return fallback;
}

/**
 * Helper to normalize column header names for fuzzy matching.
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parses historical issued invoices CSV.
 */
export function parseHistoricalIssuedInvoicesCsv(
  csvText: string,
  options: {
    clients: Contact[];
    existingInvoices?: IssuedInvoice[];
    defaultActivity?: ActivityType;
  }
): ParsedHistoricalIssuedResult {
  const { headers, rows } = parseCsvText(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return {
      validInvoices: [],
      invalidRows: [],
      duplicateWarnings: [],
      summary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
    };
  }

  const normHeaders = headers.map(normalizeHeader);

  // Column detection
  const colIndex = {
    number: normHeaders.findIndex((h) => h.includes('numero') || h.includes('factura') || h === 'num' || h === 'doc'),
    date: normHeaders.findIndex((h) => h.includes('fechaemision') || (h.includes('fecha') && !h.includes('venc'))),
    dueDate: normHeaders.findIndex((h) => h.includes('fechavenc') || h.includes('vencimiento') || h.includes('plazo')),
    clientName: normHeaders.findIndex((h) => h.includes('nombre') || h.includes('cliente') || h.includes('razon')),
    clientNif: normHeaders.findIndex((h) => h.includes('nif') || h.includes('cif') || h.includes('taxid')),
    concept: normHeaders.findIndex((h) => h.includes('concepto') || h.includes('descripcion') || h.includes('linea')),
    taxBase: normHeaders.findIndex((h) => h.includes('base') || h.includes('subtotal') || h.includes('imponible')),
    ivaRate: normHeaders.findIndex((h) => h.includes('iva') || h.includes('tipoiva') || h.includes('vat')),
    irpfRate: normHeaders.findIndex((h) => h.includes('irpf') || h.includes('retencion')),
    total: normHeaders.findIndex((h) => h.includes('total') || h.includes('importe')),
  };

  const validInvoices: IssuedInvoice[] = [];
  const invalidRows: ParsedHistoricalIssuedResult['invalidRows'] = [];
  const duplicateWarnings: ParsedHistoricalIssuedResult['duplicateWarnings'] = [];

  rows.forEach((row, idx) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = row[i] || '';
    });

    const invNum = (colIndex.number >= 0 ? row[colIndex.number] : '')?.trim() || `HIST-${idx + 1}`;
    const dateRaw = colIndex.date >= 0 ? row[colIndex.date] : '';
    const issueDate = parseHistoricalDate(dateRaw, '2025-01-01');
    const dueDate = colIndex.dueDate >= 0 && row[colIndex.dueDate]
      ? parseHistoricalDate(row[colIndex.dueDate], issueDate)
      : issueDate;

    const rawClientName = (colIndex.clientName >= 0 ? row[colIndex.clientName] : '')?.trim();
    const rawClientNif = (colIndex.clientNif >= 0 ? row[colIndex.clientNif] : '')?.trim();

    if (!rawClientName && !rawClientNif) {
      invalidRows.push({
        rowNumber: idx + 2,
        reason: 'Se requiere al menos el Nombre o el NIF del cliente.',
        raw,
      });
      return;
    }

    // Match client
    const matchedClient = options.clients.find(
      (c) =>
        (rawClientNif && c.nif && c.nif.toUpperCase() === rawClientNif.toUpperCase()) ||
        (rawClientName && c.name.toLowerCase() === rawClientName.toLowerCase())
    );

    const clientName = matchedClient ? matchedClient.name : rawClientName || 'Cliente Migrado';
    const clientNif = matchedClient ? matchedClient.nif : rawClientNif || '';
    const clientId = matchedClient ? matchedClient.id : `client-hist-${idx + 1}`;

    const concept = (colIndex.concept >= 0 ? row[colIndex.concept] : '')?.trim() || 'Servicios profesionales';
    const baseAmount = parseSpanishNumber(colIndex.taxBase >= 0 ? row[colIndex.taxBase] : 0);
    const ivaRate = (colIndex.ivaRate >= 0 ? parseSpanishNumber(row[colIndex.ivaRate]) : 21) as any;
    const irpfRate = (colIndex.irpfRate >= 0 ? parseSpanishNumber(row[colIndex.irpfRate]) : 0) as any;

    if (baseAmount <= 0) {
      invalidRows.push({
        rowNumber: idx + 2,
        reason: 'La Base Imponible debe ser superior a 0 €.',
        raw,
      });
      return;
    }

    const ivaAmount = round2(baseAmount * (ivaRate / 100));
    const irpfAmount = round2(baseAmount * (irpfRate / 100));
    const total = round2(baseAmount + ivaAmount - irpfAmount);

    // Duplicate check
    if (options.existingInvoices && options.existingInvoices.length > 0) {
      const dup = findDuplicateIssuedInvoice({
        invoiceNumber: invNum,
        clientName,
        issueDate,
        total,
        existingInvoices: options.existingInvoices,
      });
      if (dup) {
        duplicateWarnings.push({
          invoiceNumber: invNum,
          clientName,
          reason: dup.reason,
        });
      }
    }

    const series = invNum.includes('-') ? invNum.split('-')[0] : 'HIST';

    const invoice: IssuedInvoice = {
      id: `migrated-issued-${idx + 1}-${Date.now()}`,
      number: invNum,
      series,
      documentType: 'normal',
      clientId,
      clientName,
      clientNif,
      activity: options.defaultActivity || 'Actividad Principal',
      issueDate,
      dueDate,
      lines: [
        {
          id: `line-${idx + 1}`,
          description: concept,
          concept,
          quantity: 1,
          unitPrice: baseAmount,
          taxBase: baseAmount,
          ivaRate,
          ivaAmount,
          irpfRate,
          irpfAmount,
          total,
        },
      ],
      ivaRate,
      irpfRate,
      status: 'Cobrada',
      veriFactuLocked: true,
      veriFactuHash: `HIST-HASH-${invNum}`,
      isMigrated: true,
      taxBase: baseAmount,
      vatTotal: ivaAmount,
      irpfTotal: irpfAmount,
      totalAmount: total,
    };

    validInvoices.push(invoice);
  });

  return {
    validInvoices,
    invalidRows,
    duplicateWarnings,
    summary: {
      total: rows.length,
      valid: validInvoices.length,
      invalid: invalidRows.length,
      duplicates: duplicateWarnings.length,
    },
  };
}

/**
 * Parses historical received invoices (expenses) CSV.
 */
export function parseHistoricalReceivedInvoicesCsv(
  csvText: string,
  options: {
    suppliers: Contact[];
    existingInvoices?: ReceivedInvoice[];
    defaultActivity?: ActivityType;
  }
): ParsedHistoricalReceivedResult {
  const { headers, rows } = parseCsvText(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return {
      validInvoices: [],
      invalidRows: [],
      duplicateWarnings: [],
      summary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
    };
  }

  const normHeaders = headers.map(normalizeHeader);

  const colIndex = {
    number: normHeaders.findIndex((h) => h.includes('numero') || h.includes('factura') || h === 'num' || h === 'doc'),
    date: normHeaders.findIndex((h) => h.includes('fechaemision') || (h.includes('fecha') && !h.includes('contable'))),
    accountingDate: normHeaders.findIndex((h) => h.includes('fechacontable') || h.includes('registro')),
    supplierName: normHeaders.findIndex((h) => h.includes('nombre') || h.includes('proveedor') || h.includes('razon')),
    supplierNif: normHeaders.findIndex((h) => h.includes('nif') || h.includes('cif') || h.includes('taxid')),
    concept: normHeaders.findIndex((h) => h.includes('concepto') || h.includes('descripcion')),
    pgcCode: normHeaders.findIndex((h) => h.includes('cuenta') || h.includes('pgc') || h.includes('subcuenta')),
    taxBase: normHeaders.findIndex((h) => h.includes('base') || h.includes('subtotal') || h.includes('imponible')),
    ivaRate: normHeaders.findIndex((h) => h.includes('iva') || h.includes('tipoiva') || h.includes('vat')),
    irpfRate: normHeaders.findIndex((h) => h.includes('irpf') || h.includes('retencion')),
    total: normHeaders.findIndex((h) => h.includes('total') || h.includes('importe')),
  };

  const validInvoices: ReceivedInvoice[] = [];
  const invalidRows: ParsedHistoricalReceivedResult['invalidRows'] = [];
  const duplicateWarnings: ParsedHistoricalReceivedResult['duplicateWarnings'] = [];

  rows.forEach((row, idx) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = row[i] || '';
    });

    const invNum = (colIndex.number >= 0 ? row[colIndex.number] : '')?.trim() || `GASTO-HIST-${idx + 1}`;
    const dateRaw = colIndex.date >= 0 ? row[colIndex.date] : '';
    const issueDate = parseHistoricalDate(dateRaw, '2025-01-01');
    const accountingDate = colIndex.accountingDate >= 0 && row[colIndex.accountingDate]
      ? parseHistoricalDate(row[colIndex.accountingDate], issueDate)
      : issueDate;

    const rawSupplierName = (colIndex.supplierName >= 0 ? row[colIndex.supplierName] : '')?.trim();
    const rawSupplierNif = (colIndex.supplierNif >= 0 ? row[colIndex.supplierNif] : '')?.trim();

    if (!rawSupplierName && !rawSupplierNif) {
      invalidRows.push({
        rowNumber: idx + 2,
        reason: 'Se requiere al menos el Nombre o el NIF del proveedor.',
        raw,
      });
      return;
    }

    const matchedSupplier = options.suppliers.find(
      (s) =>
        (rawSupplierNif && s.nif && s.nif.toUpperCase() === rawSupplierNif.toUpperCase()) ||
        (rawSupplierName && s.name.toLowerCase() === rawSupplierName.toLowerCase())
    );

    const supplierName = matchedSupplier ? matchedSupplier.name : rawSupplierName || 'Proveedor Migrado';
    const supplierNif = matchedSupplier ? matchedSupplier.nif : rawSupplierNif || '';
    const supplierId = matchedSupplier ? matchedSupplier.id : `supp-hist-${idx + 1}`;

    const rawPgc = (colIndex.pgcCode >= 0 ? row[colIndex.pgcCode] : '')?.trim() || '629';
    const pgcAccountCode = rawPgc.length >= 3 ? rawPgc.slice(0, 3) : '629';
    const pgcAccountName = PGC_ACCOUNT_NAMES[pgcAccountCode] || 'Otros servicios';
    const concept = (colIndex.concept >= 0 ? row[colIndex.concept] : '')?.trim() || pgcAccountName;

    const baseAmount = parseSpanishNumber(colIndex.taxBase >= 0 ? row[colIndex.taxBase] : 0);
    const ivaRate = (colIndex.ivaRate >= 0 ? parseSpanishNumber(row[colIndex.ivaRate]) : 21) as any;
    const irpfRate = (colIndex.irpfRate >= 0 ? parseSpanishNumber(row[colIndex.irpfRate]) : 0) as any;

    if (baseAmount <= 0) {
      invalidRows.push({
        rowNumber: idx + 2,
        reason: 'La Base Imponible debe ser superior a 0 €.',
        raw,
      });
      return;
    }

    const ivaAmount = round2(baseAmount * (ivaRate / 100));
    const irpfAmount = round2(baseAmount * (irpfRate / 100));
    const total = round2(baseAmount + ivaAmount - irpfAmount);

    // Duplicate check
    if (options.existingInvoices && options.existingInvoices.length > 0) {
      const dup = findDuplicateReceivedInvoice({
        supplierNif,
        supplierName,
        invoiceNumber: invNum,
        issueDate,
        total,
        existingInvoices: options.existingInvoices,
      });
      if (dup) {
        duplicateWarnings.push({
          invoiceNumber: invNum,
          supplierName,
          reason: dup.reason,
        });
      }
    }

    const received: ReceivedInvoice = {
      id: `migrated-received-${idx + 1}-${Date.now()}`,
      number: invNum,
      supplierId,
      supplierName,
      supplierNif,
      activity: options.defaultActivity || 'Actividad Principal',
      issueDate,
      accountingDate,
      concept,
      pgcAccountCode,
      pgcAccountName,
      baseAmount,
      ivaRate,
      irpfRetainedRate: irpfRate,
      status: 'Contabilizada',
      deductible: true,
      deductibleVatPct: 100,
      deductibleExpensePct: 100,
      deductibleVatAmount: ivaAmount,
      deductibleExpenseAmount: baseAmount,
      paymentStatus: 'paid',
      isMigrated: true,
    };

    validInvoices.push(received);
  });

  return {
    validInvoices,
    invalidRows,
    duplicateWarnings,
    summary: {
      total: rows.length,
      valid: validInvoices.length,
      invalid: invalidRows.length,
      duplicates: duplicateWarnings.length,
    },
  };
}

/**
 * Parses ContaSol journal entries from F_APU.csv
 * Format columns: ASIAPU, FECAPU, CUEAPU, CONAPU, DOCAPU, D-HAPU, IMEAPU (or IMPAPU)
 */
export function parseContaSolJournalCsv(
  csvText: string,
  options: {
    omitCommercialAccounts?: boolean;
    organizationId?: string;
  } = {}
): ParsedContaSolJournalResult {
  const { headers, rows } = parseCsvText(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return {
      validEntries: [],
      invalidEntries: [],
      skippedCommercialLinesCount: 0,
      duplicateWarnings: [],
      summary: { totalEntries: 0, validEntries: 0, invalidEntries: 0, duplicates: 0 },
    };
  }

  const normHeaders = headers.map(normalizeHeader);

  const colIndex = {
    asiapu: normHeaders.findIndex((h) => h === 'asiapu' || h.includes('asiento')),
    fecapu: normHeaders.findIndex((h) => h === 'fecapu' || h.includes('fecha')),
    cueapu: normHeaders.findIndex((h) => h === 'cueapu' || h.includes('cuenta')),
    conapu: normHeaders.findIndex((h) => h === 'conapu' || h.includes('concepto')),
    docapu: normHeaders.findIndex((h) => h === 'docapu' || h.includes('documento') || h.includes('doc')),
    dhapu: normHeaders.findIndex((h) => h === 'dhapu' || h === 'dh' || h.includes('debehaber')),
    imeapu: normHeaders.findIndex((h) => h === 'imeapu' || h === 'impapu' || h.includes('importe')),
  };

  if (colIndex.asiapu < 0 || colIndex.cueapu < 0 || colIndex.dhapu < 0 || colIndex.imeapu < 0) {
    return {
      validEntries: [],
      invalidEntries: [
        {
          entryNumber: 'TODOS',
          reason: 'El archivo CSV no contiene las columnas requeridas de ContaSol F_APU (ASIAPU, CUEAPU, D-HAPU, IMEAPU/IMPAPU).',
          linesCount: 0,
        },
      ],
      skippedCommercialLinesCount: 0,
      duplicateWarnings: [],
      summary: { totalEntries: 0, validEntries: 0, invalidEntries: 1, duplicates: 0 },
    };
  }

  let skippedCommercialLinesCount = 0;

  // Group raw rows by ASIAPU + FECAPU
  const groupedEntries = new Map<string, Array<{
    date: string;
    accountCode: string;
    concept: string;
    docNumber: string;
    debe: number;
    haber: number;
    lineIdx: number;
  }>>();

  rows.forEach((row, idx) => {
    const asiapu = (row[colIndex.asiapu] || `ENTRY-${idx + 1}`).trim();
    const fecapuRaw = colIndex.fecapu >= 0 ? row[colIndex.fecapu] : '';
    const date = parseHistoricalDate(fecapuRaw, '2025-01-01');
    const cueapu = (row[colIndex.cueapu] || '').trim();
    const conapu = (colIndex.conapu >= 0 ? row[colIndex.conapu] : '')?.trim() || 'Asiento importado';
    const docapu = (colIndex.docapu >= 0 ? row[colIndex.docapu] : '')?.trim() || '';
    const dh = (row[colIndex.dhapu] || 'D').trim().toUpperCase();
    const amount = parseSpanishNumber(row[colIndex.imeapu]);

    if (!cueapu || amount <= 0) return;

    // Check if commercial account to omit
    if (
      options.omitCommercialAccounts &&
      (cueapu.startsWith('430') || cueapu.startsWith('400') || cueapu.startsWith('410'))
    ) {
      skippedCommercialLinesCount++;
      return;
    }

    const debe = dh === 'D' ? amount : 0;
    const haber = dh === 'H' ? amount : 0;

    const groupKey = `${asiapu}_${date}`;
    if (!groupedEntries.has(groupKey)) {
      groupedEntries.set(groupKey, []);
    }
    groupedEntries.get(groupKey)!.push({
      date,
      accountCode: cueapu,
      concept: conapu,
      docNumber: docapu,
      debe,
      haber,
      lineIdx: idx,
    });
  });

  const validEntries: CreateManualJournalEntryInput[] = [];
  const invalidEntries: ParsedContaSolJournalResult['invalidEntries'] = [];

  groupedEntries.forEach((rawLines, groupKey) => {
    if (rawLines.length === 0) return;

    const [entryNum, date] = groupKey.split('_');
    const concept = rawLines[0]?.concept || `Asiento histórico #${entryNum}`;
    const docNumber = rawLines.find((l) => Boolean(l.docNumber))?.docNumber || undefined;

    let totalDebe = 0;
    let totalHaber = 0;

    const lines: ManualJournalLineDb[] = rawLines.map((l) => {
      totalDebe = round2(totalDebe + l.debe);
      totalHaber = round2(totalHaber + l.haber);
      const prefix3 = l.accountCode.slice(0, 3);
      const defaultName = PGC_ACCOUNT_NAMES[l.accountCode] || PGC_ACCOUNT_NAMES[prefix3] || `Cuenta ${l.accountCode}`;

      return {
        accountCode: l.accountCode,
        accountName: defaultName,
        debit: l.debe,
        credit: l.haber,
        concept: l.concept,
        account_code: l.accountCode,
        account_name: defaultName,
        debe: l.debe,
        haber: l.haber,
      };
    });

    if (lines.length < 2) {
      invalidEntries.push({
        entryNumber: entryNum,
        reason: 'El asiento debe tener al menos 2 líneas.',
        linesCount: lines.length,
      });
      return;
    }

    const diff = Math.abs(round2(totalDebe - totalHaber));
    if (diff > 0.05) {
      invalidEntries.push({
        entryNumber: entryNum,
        reason: `Descuadre contable detectado: Debe (${formatCurrency(totalDebe)}) !== Haber (${formatCurrency(totalHaber)}).`,
        linesCount: lines.length,
      });
      return;
    }

    // Small rounding adjustment on the last line if diff <= 0.05
    if (diff > 0) {
      const lastLine = lines[lines.length - 1];
      if (totalDebe > totalHaber) {
        lastLine.credit = round2(lastLine.credit + diff);
        lastLine.haber = lastLine.credit;
      } else {
        lastLine.debit = round2(lastLine.debit + diff);
        lastLine.debe = lastLine.debit;
      }
    }

    validEntries.push({
      organization_id: options.organizationId || '00000000-0000-0000-0000-000000000000',
      entry_number: entryNum,
      entry_date: date,
      concept,
      document_number: docNumber,
      source: 'imported',
      source_type: 'imported',
      lines,
    });
  });

  return {
    validEntries,
    invalidEntries,
    skippedCommercialLinesCount,
    duplicateWarnings: [],
    summary: {
      totalEntries: groupedEntries.size,
      validEntries: validEntries.length,
      invalidEntries: invalidEntries.length,
      duplicates: 0,
    },
  };
}
