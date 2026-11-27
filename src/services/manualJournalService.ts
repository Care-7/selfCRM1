import { supabase } from '../lib/supabase';
import type {
  CreateManualJournalEntryInput,
  ManualJournalEntryRow,
  ManualJournalLineDb,
} from '../types/database';
import type { ManualJournalEntry, ManualJournalLine } from '../types';
import { round2 } from '../utils/finance';
import { isValidUuid, mapDatabaseError } from './databaseErrors';

/**
 * Validates that a journal entry is strictly balanced (Debe === Haber)
 * and contains at least two lines.
 */
export function validateManualJournalLines(lines: ManualJournalLine[]): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  errorMessage?: string;
} {
  if (!lines || lines.length < 2) {
    return {
      isValid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      errorMessage: 'El asiento debe contener al menos 2 apuntes contables (partida doble).',
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.accountCode?.trim()) {
      return {
        isValid: false,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        errorMessage: `La línea ${i + 1} no tiene una cuenta contable asignada.`,
      };
    }
  }

  const totalDebit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const difference = round2(Math.abs(totalDebit - totalCredit));

  if (difference >= 0.005) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: `El asiento está descuadrado: Debe (${totalDebit.toFixed(2)} €) !== Haber (${totalCredit.toFixed(2)} €). Descuadre: ${difference.toFixed(2)} €.`,
    };
  }

  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

/**
 * Maps a database row to the UI ManualJournalEntry model.
 */
export function mapRowToManualJournalEntry(row: ManualJournalEntryRow): ManualJournalEntry {
  const lines: ManualJournalLine[] = Array.isArray(row.lines)
    ? row.lines.map((l) => ({
        accountCode: String(l.accountCode || l.account_code || ''),
        accountName: String(l.accountName || l.account_name || ''),
        debit: Number(l.debit ?? l.debe) || 0,
        credit: Number(l.credit ?? l.haber) || 0,
        debe: Number(l.debe ?? l.debit) || 0,
        haber: Number(l.haber ?? l.credit) || 0,
        concept: l.concept ? String(l.concept) : undefined,
      }))
    : [];

  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit ?? l.debe ?? 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? l.haber ?? 0), 0));

  return {
    id: row.id,
    organizationId: row.organization_id,
    activityId: row.activity_id || undefined,
    date: row.entry_date,
    entryDate: row.entry_date,
    documentNumber: row.document_number || undefined,
    concept: row.concept,
    source: row.source || 'manual',
    sourceType: row.source || 'manual',
    lines,
    totalDebit,
    totalCredit,
    createdAt: row.created_at,
  };
}

export const manualJournalEntryRowToDomain = mapRowToManualJournalEntry;

/**
 * Fetches all manual and imported journal entries for an organization.
 */
export async function fetchManualJournalEntries(organizationId: string): Promise<ManualJournalEntry[]> {
  if (!organizationId) return [];

  const { data, error } = await (supabase
    .from('manual_journal_entries') as any)
    .select('*')
    .eq('organization_id', organizationId)
    .order('entry_date', { ascending: false });

  if (error) {
    throw new Error(mapDatabaseError(error, 'asiento contable'));
  }

  return ((data as ManualJournalEntryRow[]) || []).map(mapRowToManualJournalEntry);
}

/**
 * Creates and persists a new manual journal entry.
 */
export async function createManualJournalEntry(
  input: CreateManualJournalEntryInput
): Promise<ManualJournalEntry> {
  const validation = validateManualJournalLines(input.lines);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage);
  }

  if (!input.concept?.trim()) {
    throw new Error('El concepto del asiento es obligatorio.');
  }

  if (!input.entry_date?.trim()) {
    throw new Error('La fecha del asiento es obligatoria.');
  }

  const sanitizedActivityId = isValidUuid(input.activity_id) ? input.activity_id : null;

  const payload = {
    organization_id: input.organization_id,
    activity_id: sanitizedActivityId,
    entry_date: input.entry_date,
    document_number: input.document_number?.trim() || null,
    concept: input.concept.trim(),
    source: input.source || 'manual',
    lines: input.lines.map((l) => ({
      accountCode: l.accountCode.trim(),
      accountName: l.accountName.trim(),
      debit: round2(Number(l.debit) || 0),
      credit: round2(Number(l.credit) || 0),
      concept: l.concept?.trim() || null,
    })),
  };

  const { data, error } = await (supabase
    .from('manual_journal_entries') as any)
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'asiento contable'));
  }

  return mapRowToManualJournalEntry(data as ManualJournalEntryRow);
}

/**
 * Deletes a manual or imported journal entry.
 */
export async function deleteManualJournalEntry(id: string): Promise<void> {
  if (!id) return;

  const { error } = await (supabase
    .from('manual_journal_entries') as any)
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(mapDatabaseError(error, 'asiento contable'));
  }
}

/**
 * Bulk imports multiple journal entries (e.g. from historical CSV / ContaSol).
 */
export async function bulkImportManualJournalEntries(
  organizationId: string,
  entries: Array<Omit<CreateManualJournalEntryInput, 'organization_id'>>
): Promise<ManualJournalEntry[]> {
  if (!organizationId || entries.length === 0) return [];

  const payloads = entries.map((entry) => {
    const val = validateManualJournalLines(entry.lines);
    if (!val.isValid) {
      throw new Error(`Error en asiento "${entry.concept}": ${val.errorMessage}`);
    }

    return {
      organization_id: organizationId,
      activity_id: isValidUuid(entry.activity_id) ? entry.activity_id : null,
      entry_date: entry.entry_date,
      document_number: entry.document_number?.trim() || null,
      concept: entry.concept.trim(),
      source: 'imported' as const,
      lines: entry.lines.map((l) => ({
        accountCode: l.accountCode.trim(),
        accountName: l.accountName.trim(),
        debit: round2(Number(l.debit) || 0),
        credit: round2(Number(l.credit) || 0),
        concept: l.concept?.trim() || null,
      })),
    };
  });

  const { data, error } = await (supabase
    .from('manual_journal_entries') as any)
    .insert(payloads)
    .select('*');

  if (error) {
    throw new Error(mapDatabaseError(error, 'asiento contable'));
  }

  return ((data as ManualJournalEntryRow[]) || []).map(mapRowToManualJournalEntry);
}
