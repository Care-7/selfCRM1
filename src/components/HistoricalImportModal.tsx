import { useState, useId } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Filter,
} from 'lucide-react';
import type { ActivityType, Contact, IssuedInvoice, ReceivedInvoice } from '../types';
import type { CreateManualJournalEntryInput } from '../types/database';
import {
  parseHistoricalIssuedInvoicesCsv,
  parseHistoricalReceivedInvoicesCsv,
  parseContaSolJournalCsv,
  type ParsedHistoricalIssuedResult,
  type ParsedHistoricalReceivedResult,
  type ParsedContaSolJournalResult,
} from '../utils/historicalImport';
import { formatCurrency, formatDateES } from '../utils/finance';

export type HistoricalImportTab = 'issued' | 'received' | 'journal';

interface HistoricalImportModalProps {
  isOpen: boolean;
  clients: Contact[];
  suppliers: Contact[];
  existingIssuedInvoices: IssuedInvoice[];
  existingReceivedInvoices: ReceivedInvoice[];
  defaultActivity?: ActivityType;
  onClose: () => void;
  onImportIssuedInvoices: (invoices: IssuedInvoice[]) => Promise<void>;
  onImportReceivedInvoices: (invoices: ReceivedInvoice[]) => Promise<void>;
  onImportJournalEntries: (entries: CreateManualJournalEntryInput[]) => Promise<void>;
}

export function HistoricalImportModal({
  isOpen,
  clients,
  suppliers,
  existingIssuedInvoices,
  existingReceivedInvoices,
  defaultActivity = 'Actividad Principal',
  onClose,
  onImportIssuedInvoices,
  onImportReceivedInvoices,
  onImportJournalEntries,
}: HistoricalImportModalProps) {
  const [activeTab, setActiveTab] = useState<HistoricalImportTab>('issued');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Tab 1 state: Issued Invoices
  const [issuedFileName, setIssuedFileName] = useState('');
  const [issuedResult, setIssuedResult] = useState<ParsedHistoricalIssuedResult | null>(null);

  // Tab 2 state: Received Invoices
  const [receivedFileName, setReceivedFileName] = useState('');
  const [receivedResult, setReceivedResult] = useState<ParsedHistoricalReceivedResult | null>(null);

  // Tab 3 state: ContaSol Journal Entries
  const [journalFileName, setJournalFileName] = useState('');
  const [omitCommercialAccounts, setOmitCommercialAccounts] = useState(true);
  const [journalRawText, setJournalRawText] = useState('');
  const [journalResult, setJournalResult] = useState<ParsedContaSolJournalResult | null>(null);

  const issuedInputId = useId();
  const receivedInputId = useId();
  const journalInputId = useId();

  if (!isOpen) return null;

  const handleIssuedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIssuedFileName(file.name);
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseHistoricalIssuedInvoicesCsv(text, {
        clients,
        existingInvoices: existingIssuedInvoices,
        defaultActivity,
      });
      setIssuedResult(parsed);
    };
    reader.onerror = () => setErrorMsg('Error al leer el archivo CSV.');
    reader.readAsText(file, 'utf-8');
  };

  const handleReceivedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceivedFileName(file.name);
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseHistoricalReceivedInvoicesCsv(text, {
        suppliers,
        existingInvoices: existingReceivedInvoices,
        defaultActivity,
      });
      setReceivedResult(parsed);
    };
    reader.onerror = () => setErrorMsg('Error al leer el archivo CSV.');
    reader.readAsText(file, 'utf-8');
  };

  const handleJournalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJournalFileName(file.name);
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJournalRawText(text);
      const parsed = parseContaSolJournalCsv(text, {
        omitCommercialAccounts,
      });
      setJournalResult(parsed);
    };
    reader.onerror = () => setErrorMsg('Error al leer el archivo F_APU.csv.');
    reader.readAsText(file, 'utf-8');
  };

  const handleToggleOmitCommercial = (checked: boolean) => {
    setOmitCommercialAccounts(checked);
    if (journalRawText) {
      const parsed = parseContaSolJournalCsv(journalRawText, {
        omitCommercialAccounts: checked,
      });
      setJournalResult(parsed);
    }
  };

  const handleConfirmImport = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      if (activeTab === 'issued') {
        if (!issuedResult || issuedResult.validInvoices.length === 0) {
          throw new Error('No hay facturas emitidas válidas para importar.');
        }
        await onImportIssuedInvoices(issuedResult.validInvoices);
        setSuccessMsg(`Se han importado ${issuedResult.validInvoices.length} facturas emitidas históricas.`);
        setTimeout(() => onClose(), 1200);
      } else if (activeTab === 'received') {
        if (!receivedResult || receivedResult.validInvoices.length === 0) {
          throw new Error('No hay facturas recibidas válidas para importar.');
        }
        await onImportReceivedInvoices(receivedResult.validInvoices);
        setSuccessMsg(`Se han importado ${receivedResult.validInvoices.length} facturas recibidas históricas.`);
        setTimeout(() => onClose(), 1200);
      } else {
        if (!journalResult || journalResult.validEntries.length === 0) {
          throw new Error('No hay asientos históricos válidos para importar.');
        }
        await onImportJournalEntries(journalResult.validEntries);
        setSuccessMsg(`Se han importado ${journalResult.validEntries.length} asientos contables históricos.`);
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al completar la importación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="historical-import-title"
    >
      <div className="fixed inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[960px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="historical-import-title" className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                Importador Histórico de Datos (CSV)
              </h2>
              <p className="text-[12px] text-[#6E6E73]">
                Migración separada para evitar duplicidades contables (Facturas vs ContaSol F_APU)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#86868B] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
            aria-label="Cerrar modal de importación"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="border-b border-black/[0.05] px-6 bg-[#F5F5F7]/60">
          <nav className="flex space-x-6 text-[13px] font-medium" aria-label="Modalidades de importación">
            <button
              type="button"
              onClick={() => { setActiveTab('issued'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`py-3.5 border-b-2 transition-colors ${
                activeTab === 'issued'
                  ? 'border-[#0071E3] text-[#0071E3] font-semibold'
                  : 'border-transparent text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              1. Facturas Emitidas Históricas
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('received'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`py-3.5 border-b-2 transition-colors ${
                activeTab === 'received'
                  ? 'border-[#0071E3] text-[#0071E3] font-semibold'
                  : 'border-transparent text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              2. Facturas Recibidas / Gastos Históricos
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('journal'); setErrorMsg(''); setSuccessMsg(''); }}
              className={`py-3.5 border-b-2 transition-colors ${
                activeTab === 'journal'
                  ? 'border-[#0071E3] text-[#0071E3] font-semibold'
                  : 'border-transparent text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              3. Asientos Contables (ContaSol F_APU)
            </button>
          </nav>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[#FFF0F0] p-3 text-[13px] text-[#D32F2F] border border-[#FFCDD2]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[#E8F5E9] p-3 text-[13px] text-[#2E7D32] border border-[#C8E6C9]">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: Facturas Emitidas */}
          {activeTab === 'issued' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0071E3]/[0.05] p-4 text-[13px] text-[#1D1D1F] border border-[#0071E3]/15">
                <p className="font-semibold text-[#0071E3]">Normativa VeriFactu y Libros Oficiales:</p>
                <p className="mt-1 text-[#6E6E73] leading-relaxed">
                  Las facturas anteriores se importarán con la marca <code className="bg-black/[0.05] px-1 rounded font-mono text-[11px]">is_migrated = true</code> y quedarán bloqueadas. Nutren los Libros Oficiales de la AEAT, Modelo 130 y Modelo 390 sin alterar la cadena criptográfica SHA-256 de nuevas facturas en vivo.
                </p>
              </div>

              {!issuedResult ? (
                <div className="rounded-2xl border-2 border-dashed border-black/[0.12] p-8 text-center hover:border-[#0071E3]/50 transition-colors">
                  <UploadCloud className="mx-auto h-10 w-10 text-[#0071E3] mb-2" />
                  <p className="text-[14px] font-semibold text-[#1D1D1F]">
                    Selecciona o arrastra el archivo CSV de Facturas Emitidas
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73]">
                    Columnas esperadas: Número, Fecha, Cliente, NIF, Base, IVA, IRPF, Total
                  </p>
                  <label
                    htmlFor={issuedInputId}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ED] cursor-pointer"
                  >
                    Examinar archivo CSV
                  </label>
                  <input
                    id={issuedInputId}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={handleIssuedFileChange}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] p-3 text-[13px]">
                    <span className="font-medium text-[#1D1D1F]">Archivo: {issuedFileName}</span>
                    <button
                      type="button"
                      onClick={() => { setIssuedResult(null); setIssuedFileName(''); }}
                      className="text-[#0071E3] hover:underline"
                    >
                      Cambiar archivo
                    </button>
                  </div>

                  {/* Summary & warnings */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                    <div className="rounded-xl border border-black/[0.06] p-3">
                      <p className="text-[11px] text-[#6E6E73] uppercase font-semibold">Total Filas</p>
                      <p className="text-[18px] font-bold text-[#1D1D1F]">{issuedResult.summary.total}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#E8F5E9]/30">
                      <p className="text-[11px] text-[#2E7D32] uppercase font-semibold">Válidas</p>
                      <p className="text-[18px] font-bold text-[#2E7D32]">{issuedResult.summary.valid}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#FFF0F0]/30">
                      <p className="text-[11px] text-[#D32F2F] uppercase font-semibold">Descartadas</p>
                      <p className="text-[18px] font-bold text-[#D32F2F]">{issuedResult.summary.invalid}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#FFF8E6]/30">
                      <p className="text-[11px] text-[#B25E00] uppercase font-semibold">Posibles Duplicados</p>
                      <p className="text-[18px] font-bold text-[#B25E00]">{issuedResult.summary.duplicates}</p>
                    </div>
                  </div>

                  {issuedResult.duplicateWarnings.length > 0 && (
                    <div className="rounded-xl bg-[#FFF8E6] p-3 text-[12px] text-[#8A4800] border border-[#FFE0B2]">
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-[#B25E00]" />
                        <span>Aviso de facturas similares ya existentes:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {issuedResult.duplicateWarnings.slice(0, 3).map((w, i) => (
                          <li key={i}>{w.invoiceNumber} ({w.clientName}) - {w.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Table preview */}
                  <div className="rounded-xl border border-black/[0.06] overflow-x-auto max-h-[260px]">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-[#F5F5F7] sticky top-0 border-b border-black/[0.06] text-[#6E6E73] font-semibold">
                        <tr>
                          <th className="p-2.5">Factura</th>
                          <th className="p-2.5">Fecha</th>
                          <th className="p-2.5">Cliente</th>
                          <th className="p-2.5 text-right">Base</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {issuedResult.validInvoices.slice(0, 10).map((inv, idx) => (
                          <tr key={idx} className="hover:bg-black/[0.01]">
                            <td className="p-2.5 font-mono text-[#0071E3]">{inv.number}</td>
                            <td className="p-2.5 text-[#6E6E73]">{formatDateES(inv.issueDate)}</td>
                            <td className="p-2.5 text-[#1D1D1F] font-medium">{inv.clientName}</td>
                            <td className="p-2.5 text-right tabular-nums">{formatCurrency(inv.taxBase || 0)}</td>
                            <td className="p-2.5 text-right tabular-nums font-semibold">{formatCurrency(inv.totalAmount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {issuedResult.validInvoices.length > 10 && (
                    <p className="text-[11px] text-[#6E6E73] text-center">
                      ... y {issuedResult.validInvoices.length - 10} facturas más en cola.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Facturas Recibidas */}
          {activeTab === 'received' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0071E3]/[0.05] p-4 text-[13px] text-[#1D1D1F] border border-[#0071E3]/15">
                <p className="font-semibold text-[#0071E3]">Gastos Deducibles Históricos:</p>
                <p className="mt-1 text-[#6E6E73] leading-relaxed">
                  Permite incorporar facturas de proveedores de ejercicios o trimestres pasados para el cálculo de gastos acumulados del Modelo 130 y deducciones del Modelo 303/390.
                </p>
              </div>

              {!receivedResult ? (
                <div className="rounded-2xl border-2 border-dashed border-black/[0.12] p-8 text-center hover:border-[#0071E3]/50 transition-colors">
                  <UploadCloud className="mx-auto h-10 w-10 text-[#0071E3] mb-2" />
                  <p className="text-[14px] font-semibold text-[#1D1D1F]">
                    Selecciona o arrastra el archivo CSV de Facturas Recibidas / Gastos
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73]">
                    Columnas esperadas: Número, Fecha, Proveedor, NIF, Concepto, Cuenta_PGC, Base, IVA, Total
                  </p>
                  <label
                    htmlFor={receivedInputId}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ED] cursor-pointer"
                  >
                    Examinar archivo CSV
                  </label>
                  <input
                    id={receivedInputId}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={handleReceivedFileChange}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] p-3 text-[13px]">
                    <span className="font-medium text-[#1D1D1F]">Archivo: {receivedFileName}</span>
                    <button
                      type="button"
                      onClick={() => { setReceivedResult(null); setReceivedFileName(''); }}
                      className="text-[#0071E3] hover:underline"
                    >
                      Cambiar archivo
                    </button>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                    <div className="rounded-xl border border-black/[0.06] p-3">
                      <p className="text-[11px] text-[#6E6E73] uppercase font-semibold">Total Filas</p>
                      <p className="text-[18px] font-bold text-[#1D1D1F]">{receivedResult.summary.total}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#E8F5E9]/30">
                      <p className="text-[11px] text-[#2E7D32] uppercase font-semibold">Válidas</p>
                      <p className="text-[18px] font-bold text-[#2E7D32]">{receivedResult.summary.valid}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#FFF0F0]/30">
                      <p className="text-[11px] text-[#D32F2F] uppercase font-semibold">Descartadas</p>
                      <p className="text-[18px] font-bold text-[#D32F2F]">{receivedResult.summary.invalid}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#FFF8E6]/30">
                      <p className="text-[11px] text-[#B25E00] uppercase font-semibold">Posibles Duplicados</p>
                      <p className="text-[18px] font-bold text-[#B25E00]">{receivedResult.summary.duplicates}</p>
                    </div>
                  </div>

                  {receivedResult.duplicateWarnings.length > 0 && (
                    <div className="rounded-xl bg-[#FFF8E6] p-3 text-[12px] text-[#8A4800] border border-[#FFE0B2]">
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-[#B25E00]" />
                        <span>Aviso de gastos similares ya existentes:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {receivedResult.duplicateWarnings.slice(0, 3).map((w, i) => (
                          <li key={i}>{w.invoiceNumber} ({w.supplierName}) - {w.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Table preview */}
                  <div className="rounded-xl border border-black/[0.06] overflow-x-auto max-h-[260px]">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-[#F5F5F7] sticky top-0 border-b border-black/[0.06] text-[#6E6E73] font-semibold">
                        <tr>
                          <th className="p-2.5">Factura</th>
                          <th className="p-2.5">Fecha</th>
                          <th className="p-2.5">Proveedor</th>
                          <th className="p-2.5">Cuenta PGC</th>
                          <th className="p-2.5 text-right">Base</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {receivedResult.validInvoices.slice(0, 10).map((inv, idx) => (
                          <tr key={idx} className="hover:bg-black/[0.01]">
                            <td className="p-2.5 font-mono text-[#0071E3]">{inv.number}</td>
                            <td className="p-2.5 text-[#6E6E73]">{formatDateES(inv.issueDate)}</td>
                            <td className="p-2.5 text-[#1D1D1F] font-medium">{inv.supplierName}</td>
                            <td className="p-2.5 font-mono text-[#6E6E73]">{inv.pgcAccountCode}</td>
                            <td className="p-2.5 text-right tabular-nums">{formatCurrency(inv.baseAmount)}</td>
                            <td className="p-2.5 text-right tabular-nums font-semibold">{formatCurrency(inv.baseAmount * (1 + inv.ivaRate / 100))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ContaSol F_APU */}
          {activeTab === 'journal' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#0071E3]/[0.05] p-4 text-[13px] text-[#1D1D1F] border border-[#0071E3]/15">
                <p className="font-semibold text-[#0071E3]">Compatibilidad Oficial ContaSol (F_APU.csv):</p>
                <p className="mt-1 text-[#6E6E73] leading-relaxed">
                  Importa el fichero diario de ContaSol. Agrupa automáticamente los apuntes por número de asiento (<code className="bg-black/[0.05] px-1 rounded font-mono text-[11px]">ASIAPU</code>) y valida el cuadre estricto de partida doble (<code className="bg-black/[0.05] px-1 rounded font-mono text-[11px]">Debe === Haber</code>).
                </p>
              </div>

              {/* Anti-duplicity toggle */}
              <div className="flex items-start gap-3 rounded-xl border border-black/[0.06] bg-[#F5F5F7] p-4 text-[13px]">
                <input
                  type="checkbox"
                  id="omit-commercial-toggle"
                  checked={omitCommercialAccounts}
                  onChange={(e) => handleToggleOmitCommercial(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-black/[0.2] text-[#0071E3] focus:ring-[#0071E3]/40 cursor-pointer"
                />
                <label htmlFor="omit-commercial-toggle" className="cursor-pointer">
                  <span className="font-semibold text-[#1D1D1F]">
                    Omitir asientos de clientes y proveedores (cuentas 430*, 400*, 410*)
                  </span>
                  <span className="block mt-0.5 text-[12px] text-[#6E6E73]">
                    (Recomendado) Evita duplicar saldo contable si ya has importado o vas a importar las facturas en las pestañas 1 y 2.
                  </span>
                </label>
              </div>

              {!journalResult ? (
                <div className="rounded-2xl border-2 border-dashed border-black/[0.12] p-8 text-center hover:border-[#0071E3]/50 transition-colors">
                  <UploadCloud className="mx-auto h-10 w-10 text-[#0071E3] mb-2" />
                  <p className="text-[14px] font-semibold text-[#1D1D1F]">
                    Selecciona o arrastra el fichero F_APU.csv de ContaSol
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73]">
                    Columnas requeridas: ASIAPU, FECAPU, CUEAPU, CONAPU, DOCAPU, D-HAPU, IMEAPU
                  </p>
                  <label
                    htmlFor={journalInputId}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ED] cursor-pointer"
                  >
                    Examinar archivo F_APU.csv
                  </label>
                  <input
                    id={journalInputId}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={handleJournalFileChange}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] p-3 text-[13px]">
                    <span className="font-medium text-[#1D1D1F]">Archivo: {journalFileName}</span>
                    <button
                      type="button"
                      onClick={() => { setJournalResult(null); setJournalFileName(''); setJournalRawText(''); }}
                      className="text-[#0071E3] hover:underline"
                    >
                      Cambiar archivo
                    </button>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl border border-black/[0.06] p-3">
                      <p className="text-[11px] text-[#6E6E73] uppercase font-semibold">Asientos Detectados</p>
                      <p className="text-[18px] font-bold text-[#1D1D1F]">{journalResult.summary.totalEntries}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#E8F5E9]/30">
                      <p className="text-[11px] text-[#2E7D32] uppercase font-semibold">Asientos Válidos</p>
                      <p className="text-[18px] font-bold text-[#2E7D32]">{journalResult.summary.validEntries}</p>
                    </div>
                    <div className="rounded-xl border border-black/[0.06] p-3 bg-[#FFF0F0]/30">
                      <p className="text-[11px] text-[#D32F2F] uppercase font-semibold">Descuadrados / Inválidos</p>
                      <p className="text-[18px] font-bold text-[#D32F2F]">{journalResult.summary.invalidEntries}</p>
                    </div>
                  </div>

                  {journalResult.skippedCommercialLinesCount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-3 text-[12px] text-[#6E6E73]">
                      <Filter className="h-4 w-4 shrink-0 text-[#0071E3]" />
                      <span>
                        Se han omitido <strong>{journalResult.skippedCommercialLinesCount}</strong> líneas de cuentas comerciales (430/400/410) para evitar duplicidad.
                      </span>
                    </div>
                  )}

                  {journalResult.invalidEntries.length > 0 && (
                    <div className="rounded-xl bg-[#FFF0F0] p-3 text-[12px] text-[#D32F2F] border border-[#FFCDD2] space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Asientos rechazados por descuadre contable:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {journalResult.invalidEntries.slice(0, 3).map((inv, i) => (
                          <li key={i}>Asiento #{inv.entryNumber}: {inv.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Table preview */}
                  <div className="rounded-xl border border-black/[0.06] overflow-x-auto max-h-[260px]">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-[#F5F5F7] sticky top-0 border-b border-black/[0.06] text-[#6E6E73] font-semibold">
                        <tr>
                          <th className="p-2.5">Asiento</th>
                          <th className="p-2.5">Fecha</th>
                          <th className="p-2.5">Concepto</th>
                          <th className="p-2.5 text-center">Apuntes</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04]">
                        {journalResult.validEntries.slice(0, 10).map((entry, idx) => {
                          const total = entry.lines.reduce((acc, l) => acc + (l.debe || 0), 0);
                          return (
                            <tr key={idx} className="hover:bg-black/[0.01]">
                              <td className="p-2.5 font-mono text-[#0071E3]">#{entry.entry_number}</td>
                              <td className="p-2.5 text-[#6E6E73]">{formatDateES(entry.entry_date)}</td>
                              <td className="p-2.5 text-[#1D1D1F] font-medium">{entry.concept}</td>
                              <td className="p-2.5 text-center">{entry.lines.length}</td>
                              <td className="p-2.5 text-right tabular-nums font-semibold">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-black/[0.05] bg-[#F5F5F7]/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={
              isSubmitting ||
              (activeTab === 'issued' && (!issuedResult || issuedResult.validInvoices.length === 0)) ||
              (activeTab === 'received' && (!receivedResult || receivedResult.validInvoices.length === 0)) ||
              (activeTab === 'journal' && (!journalResult || journalResult.validEntries.length === 0))
            }
            onClick={handleConfirmImport}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importando registros…</span>
              </>
            ) : (
              <span>
                {activeTab === 'issued'
                  ? `Importar ${issuedResult?.validInvoices.length || 0} Facturas Emitidas`
                  : activeTab === 'received'
                  ? `Importar ${receivedResult?.validInvoices.length || 0} Facturas Recibidas`
                  : `Importar ${journalResult?.validEntries.length || 0} Asientos Contables`}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
