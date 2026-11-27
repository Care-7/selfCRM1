import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { Contact, ManualJournalEntry, ManualJournalLine } from '../types';
import type { PgcJournalEntry } from '../utils/pgcAccounting';
import { getPgcAccountName } from '../utils/pgcAccounting';
import { formatCurrency, round2 } from '../utils/finance';
import {
  findDuplicateJournalEntries,
  type DuplicateJournalMatch,
} from '../utils/duplicateDetector';
import { validateManualJournalLines } from '../services/manualJournalService';

interface ManualJournalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: {
    date: string;
    documentNumber?: string;
    concept: string;
    activityId?: string;
    lines: ManualJournalLine[];
  }) => Promise<void> | void;
  clients?: Contact[];
  suppliers?: Contact[];
  activities?: Array<{ id: string; name: string }>;
  existingEntries?: Array<PgcJournalEntry | ManualJournalEntry>;
  defaultDate?: string;
}

export function ManualJournalModal({
  isOpen,
  onClose,
  onSave,
  clients = [],
  suppliers = [],
  activities = [],
  existingEntries = [],
  defaultDate,
}: ManualJournalModalProps) {
  const today = useMemo(() => defaultDate || new Date().toISOString().slice(0, 10), [defaultDate]);

  const [date, setDate] = useState(today);
  const [documentNumber, setDocumentNumber] = useState('');
  const [concept, setConcept] = useState('');
  const [activityId, setActivityId] = useState<string>('');
  const [lines, setLines] = useState<ManualJournalLine[]>([
    { accountCode: '572', accountName: getPgcAccountName('572'), debit: 0, credit: 0 },
    { accountCode: '', accountName: '', debit: 0, credit: 0 },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateJournalMatch[] | null>(null);

  // Combined contacts for quick search
  const searchableContacts = useMemo(() => {
    return [
      ...clients.map((c) => ({
        ...c,
        defaultAccount: c.accountCode || '430',
        kindLabel: 'Cliente',
      })),
      ...suppliers.map((s) => ({
        ...s,
        defaultAccount: s.accountCode || '410',
        kindLabel: 'Proveedor',
      })),
    ];
  }, [clients, suppliers]);

  // Validation & Balances
  const validation = useMemo(() => {
    return validateManualJournalLines(lines);
  }, [lines]);

  const isBalanced = validation.isValid;

  // Handle adding line
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { accountCode: '', accountName: '', debit: 0, credit: 0 },
    ]);
  };

  // Handle removing line
  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Handle line change
  const handleLineChange = (
    index: number,
    field: keyof ManualJournalLine,
    value: string | number
  ) => {
    setLines((prev) => {
      const next = [...prev];
      const target = { ...next[index] };

      if (field === 'debit') {
        const num = round2(Number(value) || 0);
        target.debit = num;
        if (num > 0) target.credit = 0; // standard double-entry convenience
      } else if (field === 'credit') {
        const num = round2(Number(value) || 0);
        target.credit = num;
        if (num > 0) target.debit = 0;
      } else if (field === 'accountCode') {
        const code = String(value).trim();
        target.accountCode = code;
        target.accountName = getPgcAccountName(code);
      } else if (field === 'accountName') {
        target.accountName = String(value);
      } else if (field === 'concept') {
        target.concept = String(value);
      }

      next[index] = target;
      return next;
    });
  };

  // Quick select contact to autofill account
  const handleSelectContactForLine = (index: number, contactId: string) => {
    if (!contactId) return;
    const contact = searchableContacts.find((c) => c.id === contactId);
    if (!contact) return;

    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        accountCode: contact.defaultAccount,
        accountName: `${contact.defaultAccount} - ${contact.name}`,
      };
      return next;
    });
  };

  const executeSave = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSave({
        date,
        documentNumber: documentNumber.trim() || undefined,
        concept: concept.trim(),
        activityId: activityId || undefined,
        lines: lines.map((l) => ({
          accountCode: l.accountCode.trim(),
          accountName: l.accountName.trim() || getPgcAccountName(l.accountCode.trim()),
          debit: round2(Number(l.debit) || 0),
          credit: round2(Number(l.credit) || 0),
          concept: l.concept?.trim() || undefined,
        })),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar el asiento contable.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreSaveCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim()) {
      setErrorMessage('El concepto general del asiento es obligatorio.');
      return;
    }
    if (!date) {
      setErrorMessage('La fecha del asiento es obligatoria.');
      return;
    }
    if (!isBalanced) {
      setErrorMessage(validation.errorMessage || 'El asiento debe estar cuadrado (Debe === Haber).');
      return;
    }

    // Check duplicate
    if (!duplicateWarning) {
      const duplicates = findDuplicateJournalEntries(
        {
          date,
          concept,
          documentNumber,
          lines,
        },
        existingEntries
      );

      if (duplicates.length > 0) {
        setDuplicateWarning(duplicates);
        return;
      }
    }

    await executeSave();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-journal-title"
    >
      <div className="relative flex w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-black/[0.06] animate-in fade-in zoom-in-95 duration-200 max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-5 bg-[#FBFBFD]">
          <div>
            <h2 id="manual-journal-title" className="text-[18px] font-semibold tracking-[-0.015em] text-[#1D1D1F]">
              Nuevo Asiento Contable Manual
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              Partida doble según el Plan General Contable (PGC) español.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#86868B] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePreSaveCheck} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Error Message */}
            {errorMessage && (
              <div className="rounded-2xl bg-[#FFF5F5] border border-[#FFE3E3] p-4 text-[13px] text-[#C92A2A] flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[#E03131] mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">No se puede guardar el asiento</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Duplicate Warning Alert */}
            {duplicateWarning && (
              <div className="rounded-2xl bg-[#FFF9DB] border border-[#FFE066] p-4 text-[13px] text-[#744210] flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-[#F59F00] mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-[#8C5B00]">
                      Aviso preventivo: Posible asiento contable duplicado
                    </p>
                    <p className="mt-0.5 text-[#5C3D00]">
                      {duplicateWarning[0]?.reason}
                    </p>
                    <div className="mt-2 text-[12px] bg-white/70 rounded-xl p-2.5 font-mono text-[#2B1D00]">
                      Registro coincidente: {duplicateWarning[0]?.concept} (
                      {formatCurrency(duplicateWarning[0]?.amount || 0)}) · Fecha:{' '}
                      {duplicateWarning[0]?.date}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#F59F00]/20">
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-[#744210] hover:bg-black/[0.05]"
                  >
                    Cancelar y revisar
                  </button>
                  <button
                    type="button"
                    onClick={executeSave}
                    disabled={isSubmitting}
                    className="rounded-xl bg-[#E67700] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#D9480F] transition-colors"
                  >
                    Guardar de todas formas
                  </button>
                </div>
              </div>
            )}

            {/* General Entry Details */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label htmlFor="journal-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Fecha <span className="text-[#0071E3]">*</span>
                </label>
                <input
                  id="journal-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="journal-doc" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Nº Documento / Ref. <span className="text-[12px] font-normal text-[#86868B]">(opcional)</span>
                </label>
                <input
                  id="journal-doc"
                  type="text"
                  value={documentNumber}
                  onChange={(e) => {
                    setDocumentNumber(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  placeholder="Ej. TRANS-2026-01"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="journal-concept" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Concepto general del asiento <span className="text-[#0071E3]">*</span>
                </label>
                <input
                  id="journal-concept"
                  type="text"
                  required
                  value={concept}
                  onChange={(e) => {
                    setConcept(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  placeholder="Ej. Aportación de capital social / Regularización"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>
            </div>

            {/* Activity Selector (if multiple activities available) */}
            {activities.length > 0 && (
              <div>
                <label htmlFor="journal-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Actividad asignada <span className="text-[12px] font-normal text-[#86868B]">(opcional)</span>
                </label>
                <select
                  id="journal-activity"
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                  className="w-full max-w-sm rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                >
                  <option value="">Todas las actividades / General</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Journal Lines Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[14px] font-semibold text-[#1D1D1F]">
                  Líneas y apuntes de partida doble
                </h3>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#0071E3] hover:bg-[#0071E3]/10 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir apunte
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white shadow-sm">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/[0.06] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-40">Subcuenta PGC</th>
                      <th className="py-2.5 px-3">Nombre / Contacto vinculado</th>
                      <th className="py-2.5 px-3 w-32 text-right">Debe (€)</th>
                      <th className="py-2.5 px-3 w-32 text-right">Haber (€)</th>
                      <th className="py-2.5 px-2 w-10 text-center">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-black/[0.01] transition-colors">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            required
                            value={line.accountCode}
                            onChange={(e) =>
                              handleLineChange(idx, 'accountCode', e.target.value)
                            }
                            placeholder="572 / 430…"
                            className="w-full rounded-lg bg-[#F5F5F7] px-2.5 py-1.5 font-mono text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={line.accountName}
                              onChange={(e) =>
                                handleLineChange(idx, 'accountName', e.target.value)
                              }
                              placeholder="Denominación de la cuenta"
                              className="flex-1 rounded-lg bg-[#F5F5F7] px-2.5 py-1.5 text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                            />
                            {searchableContacts.length > 0 && (
                              <select
                                onChange={(e) => handleSelectContactForLine(idx, e.target.value)}
                                defaultValue=""
                                className="sm:w-44 rounded-lg bg-black/[0.04] px-2 py-1.5 text-[12px] text-[#6E6E73] border-none focus:outline-none focus:ring-1 focus:ring-[#0071E3]"
                                title="Vincular subcuenta de cliente o proveedor"
                              >
                                <option value="" disabled>
                                  Vincular contacto…
                                </option>
                                {searchableContacts.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.kindLabel}: {c.name} ({c.defaultAccount})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debe === 0 ? '' : line.debe}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                            placeholder="0,00"
                            className="w-full rounded-lg bg-[#F5F5F7] px-2.5 py-1.5 font-mono text-right text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.haber === 0 ? '' : line.haber}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                            placeholder="0,00"
                            className="w-full rounded-lg bg-[#F5F5F7] px-2.5 py-1.5 font-mono text-right text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            disabled={lines.length <= 2}
                            onClick={() => handleRemoveLine(idx)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#86868B] hover:text-[#E03131] hover:bg-[#FFF5F5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Eliminar apunte"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer & Balancing Status Bar */}
          <div className="border-t border-black/[0.06] bg-[#FBFBFD] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-[13px]">
              <div>
                <span className="text-[#86868B]">Total Debe:</span>{' '}
                <span className="font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(validation.totalDebit)}
                </span>
              </div>
              <span className="text-black/[0.2]" aria-hidden="true">
                ·
              </span>
              <div>
                <span className="text-[#86868B]">Total Haber:</span>{' '}
                <span className="font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(validation.totalCredit)}
                </span>
              </div>
              <span className="text-black/[0.2]" aria-hidden="true">
                ·
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#86868B]">Descuadre:</span>
                <span
                  className={`font-semibold tabular-nums ${
                    isBalanced ? 'text-[#1D7A3F]' : 'text-[#C92A2A]'
                  }`}
                >
                  {formatCurrency(validation.difference)}
                </span>
                {isBalanced ? (
                  <CheckCircle2 className="h-4 w-4 text-[#1D7A3F]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[#C92A2A]" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!isBalanced || isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-white" />}
                <span>Guardar Asiento</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
