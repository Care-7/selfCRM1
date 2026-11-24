import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Lock,
  ShieldCheck,
  FileEdit,
  CheckCircle2,
} from 'lucide-react';
import type {
  ActivityType,
  Contact,
  InvoiceLine,
  IrpfRate,
  IssuedInvoice,
} from '../types';
import {
  calculateInvoiceTotals,
  formatCurrency,
  formatDateES,
  generateVeriFactuHash,
  getNextInvoiceNumber,
} from '../utils/finance';
import { REFERENCE_DATE } from '../data/mockData';
import { VeriFactuQr } from './VeriFactuQr';
import { StatusBadge } from './StatusBadge';

interface InvoiceEditorModalProps {
  isOpen: boolean;
  invoice: IssuedInvoice | null; // null = create new
  clients: Contact[];
  allIssuedInvoices: IssuedInvoice[];
  defaultActivity: ActivityType;
  onClose: () => void;
  onSaveInvoice: (invoice: IssuedInvoice, isNew: boolean) => void;
  onMarkPaid: (invoiceId: string) => void;
}

export function InvoiceEditorModal({
  isOpen,
  invoice,
  clients,
  allIssuedInvoices,
  defaultActivity,
  onClose,
  onSaveInvoice,
  onMarkPaid,
}: InvoiceEditorModalProps) {
  const isLocked = Boolean(invoice?.veriFactuLocked);
  const isNew = !invoice;

  const [clientId, setClientId] = useState('');
  const [activity, setActivity] = useState<ActivityType>(defaultActivity);
  const [issueDate, setIssueDate] = useState(REFERENCE_DATE);
  const [dueDate, setDueDate] = useState('2026-12-24');
  const [ivaRate, setIvaRate] = useState<21 | 10 | 0>(21);
  const [irpfRate, setIrpfRate] = useState<IrpfRate>(15);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');

    if (invoice) {
      setClientId(invoice.clientId);
      setActivity(invoice.activity);
      setIssueDate(invoice.issueDate);
      setDueDate(invoice.dueDate);
      setIvaRate(invoice.ivaRate);
      setIrpfRate(invoice.irpfRate);
      setLines(invoice.lines.map((l) => ({ ...l })));
    } else {
      const initialClient =
        clients.find((c) => c.activity === defaultActivity && c.status === 'Activo') ??
        clients[0];
      const act = initialClient ? initialClient.activity : defaultActivity;
      setClientId(initialClient?.id ?? '');
      setActivity(act);
      setIssueDate(REFERENCE_DATE);
      setDueDate('2026-12-24');
      setIvaRate(
        initialClient && (initialClient.defaultIva === 21 || initialClient.defaultIva === 10 || initialClient.defaultIva === 0)
          ? initialClient.defaultIva
          : act === 'Actividad Artística'
          ? 10
          : 21
      );
      setIrpfRate(initialClient?.defaultIrpf ?? 15);
      setLines([
        {
          id: `line-${Date.now()}`,
          description: '',
          quantity: 1,
          unitPrice: 0,
        },
      ]);
    }
  }, [isOpen, invoice, clients, defaultActivity]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  const invoiceNumberInfo = useMemo(() => {
    if (invoice) {
      return { series: invoice.series, number: invoice.number };
    }
    return getNextInvoiceNumber(allIssuedInvoices, activity);
  }, [invoice, allIssuedInvoices, activity]);

  const totals = useMemo(
    () => calculateInvoiceTotals(lines, ivaRate, irpfRate),
    [lines, ivaRate, irpfRate]
  );

  if (!isOpen) return null;

  const handleClientChange = (nextClientId: string) => {
    setClientId(nextClientId);
    const found = clients.find((c) => c.id === nextClientId);
    if (found) {
      setActivity(found.activity);
      if (found.defaultIva === 21 || found.defaultIva === 10 || found.defaultIva === 0) {
        setIvaRate(found.defaultIva);
      }
      setIrpfRate(found.defaultIrpf);
    }
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: `line-${Date.now()}-${prev.length}`, description: '', quantity: 1, unitPrice: 0 },
    ]);
  };

  const handleUpdateLine = (id: string, field: keyof InvoiceLine, value: string | number) => {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line))
    );
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const validateAndBuild = (emitVeriFactu: boolean): IssuedInvoice | null => {
    if (!selectedClient) {
      setErrorMsg('Selecciona un cliente antes de guardar la factura.');
      return null;
    }
    const cleanLines = lines.filter((l) => l.description.trim().length > 0);
    if (cleanLines.length === 0) {
      setErrorMsg('Añade al menos una línea de concepto con descripción.');
      return null;
    }
    if (totals.baseImponible <= 0) {
      setErrorMsg('El importe de la base imponible debe ser superior a 0 €.');
      return null;
    }

    const hash = emitVeriFactu
      ? generateVeriFactuHash(
          invoiceNumberInfo.number,
          selectedClient.nif,
          issueDate,
          totals.total
        )
      : undefined;

    return {
      id: invoice ? invoice.id : `inv-${Date.now()}`,
      number: invoiceNumberInfo.number,
      series: invoiceNumberInfo.series,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientNif: selectedClient.nif,
      activity,
      issueDate,
      dueDate,
      lines: cleanLines,
      ivaRate,
      irpfRate,
      status: emitVeriFactu ? 'Pendiente' : 'Borrador',
      veriFactuLocked: emitVeriFactu,
      veriFactuHash: hash,
      veriFactuTimestamp: emitVeriFactu ? new Date().toISOString() : undefined,
    };
  };

  const handleSaveDraft = () => {
    const built = validateAndBuild(false);
    if (!built) return;
    onSaveInvoice(built, isNew);
    onClose();
  };

  const handleEmitVeriFactu = () => {
    const built = validateAndBuild(true);
    if (!built) return;
    onSaveInvoice(built, isNew);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-editor-title"
    >
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-3 min-w-0">
            <h2
              id="invoice-editor-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F] truncate"
            >
              {isNew ? 'Nueva factura emitida' : `Factura ${invoice.number}`}
            </h2>
            {invoice && (
              <StatusBadge
                label={invoice.status}
                tone={
                  invoice.status === 'Cobrada'
                    ? 'success'
                    : invoice.status === 'Pendiente'
                    ? 'warning'
                    : 'neutral'
                }
                icon={
                  invoice.status === 'Cobrada'
                    ? 'check'
                    : invoice.status === 'Pendiente'
                    ? 'clock'
                    : 'draft'
                }
              />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor de factura"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Two-column body: Editor + VeriFactu live preview */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Form & Lines */}
          <div className="lg:col-span-8 p-6 space-y-6">
            {isLocked && (
              <div className="flex items-start gap-3 rounded-2xl bg-[#F5F5F7] px-4 py-3.5 text-[13px] text-[#1D1D1F]">
                <Lock className="h-4 w-4 shrink-0 text-[#0071E3] mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  Esta factura está <strong>emitida y bloqueada conforme a VeriFactu</strong>. Sus datos fiscales no pueden alterarse; puedes registrar su cobro o emitir una factura rectificativa si fuera necesario.
                </p>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-[#FDECEC] px-4 py-3 text-[13px] font-medium text-[#C92A2A]"
              >
                {errorMsg}
              </div>
            )}

            {/* Client + Series + Activity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="inv-client" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Cliente
                </label>
                <select
                  id="inv-client"
                  disabled={isLocked}
                  value={clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 disabled:opacity-65"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedClient && (
                  <p className="mt-1.5 text-[12px] text-[#6E6E73] font-mono">
                    NIF/CIF: {selectedClient.nif}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="inv-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Actividad y serie
                </label>
                <select
                  id="inv-activity"
                  disabled={isLocked}
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as ActivityType)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 disabled:opacity-65"
                >
                  <option value="Contabilidad Comunidades">Contabilidad Comunidades (Serie CC)</option>
                  <option value="Actividad Artística">Actividad Artística (Serie AR)</option>
                </select>
                <p className="mt-1.5 text-[12px] text-[#6E6E73]">
                  Número asignado: <span className="font-mono font-medium text-[#1D1D1F]">{invoiceNumberInfo.number}</span>
                </p>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="inv-issue-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Fecha emisión
                </label>
                <input
                  id="inv-issue-date"
                  type="date"
                  disabled={isLocked}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                />
              </div>

              <div>
                <label htmlFor="inv-due-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Vencimiento
                </label>
                <input
                  id="inv-due-date"
                  type="date"
                  disabled={isLocked}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                />
              </div>

              <div>
                <label htmlFor="inv-iva" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  IVA aplicable
                </label>
                <select
                  id="inv-iva"
                  disabled={isLocked}
                  value={ivaRate}
                  onChange={(e) => setIvaRate(Number(e.target.value) as 21 | 10 | 0)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                >
                  <option value={21}>21% General</option>
                  <option value={10}>10% Reducido</option>
                  <option value={0}>0% Exento</option>
                </select>
              </div>

              <div>
                <label htmlFor="inv-irpf" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Retención IRPF
                </label>
                <select
                  id="inv-irpf"
                  disabled={isLocked}
                  value={irpfRate}
                  onChange={(e) => setIrpfRate(Number(e.target.value) as IrpfRate)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                >
                  <option value={15}>15% IRPF</option>
                  <option value={7}>7% IRPF</option>
                  <option value={0}>0% Sin ret.</option>
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[13px] font-semibold text-[#1D1D1F]">
                  Líneas de concepto
                </span>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium text-[#0071E3] transition-colors hover:bg-[#0071E3]/[0.08]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Añadir línea
                  </button>
                )}
              </div>

              <div className="hidden sm:grid sm:grid-cols-12 gap-2.5 px-2.5 pb-1.5 text-[11px] font-medium text-[#86868B]">
                <span className="col-span-6">Concepto</span>
                <span className="col-span-2 text-right">Ud.</span>
                <span className="col-span-2 text-right">Precio (€)</span>
                <span className="col-span-2 text-right">Importe</span>
              </div>

              <div className="space-y-2.5">
                {lines.map((line, index) => {
                  const subtotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-12 gap-2.5 items-center rounded-xl bg-[#F5F5F7]/75 p-2.5"
                    >
                      <div className="col-span-12 sm:col-span-6">
                        <label htmlFor={`line-desc-${line.id}`} className="sr-only">
                          Descripción línea {index + 1}
                        </label>
                        <input
                          id={`line-desc-${line.id}`}
                          type="text"
                          disabled={isLocked}
                          value={line.description}
                          onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                          placeholder="Ej. Gestión contable mensual y cierre trimestral"
                          className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-[#1D1D1F] placeholder:text-[#86868B] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none disabled:bg-transparent disabled:border-transparent"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label htmlFor={`line-qty-${line.id}`} className="sr-only">
                          Cantidad línea {index + 1}
                        </label>
                        <input
                          id={`line-qty-${line.id}`}
                          type="number"
                          min={0.5}
                          step={0.5}
                          disabled={isLocked}
                          value={line.quantity}
                          onChange={(e) =>
                            handleUpdateLine(line.id, 'quantity', Math.max(0, Number(e.target.value)))
                          }
                          aria-label={`Cantidad línea ${index + 1}`}
                          className="w-full rounded-lg bg-white px-2.5 py-2 text-right text-[13px] tabular-nums text-[#1D1D1F] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none disabled:bg-transparent disabled:border-transparent"
                        />
                      </div>

                      <div className="col-span-5 sm:col-span-2">
                        <label htmlFor={`line-price-${line.id}`} className="sr-only">
                          Precio unitario línea {index + 1}
                        </label>
                        <input
                          id={`line-price-${line.id}`}
                          type="number"
                          min={0}
                          step={10}
                          disabled={isLocked}
                          value={line.unitPrice}
                          onChange={(e) =>
                            handleUpdateLine(line.id, 'unitPrice', Math.max(0, Number(e.target.value)))
                          }
                          aria-label={`Precio unitario línea ${index + 1}`}
                          className="w-full rounded-lg bg-white px-2.5 py-2 text-right text-[13px] tabular-nums text-[#1D1D1F] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none disabled:bg-transparent disabled:border-transparent"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1.5">
                        <span className="text-[13px] font-medium tabular-nums text-[#1D1D1F]">
                          {formatCurrency(subtotal)}
                        </span>
                        {!isLocked && lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            aria-label={`Eliminar línea ${index + 1}`}
                            className="rounded-lg p-1 text-[#86868B] hover:bg-[#FDECEC] hover:text-[#C92A2A]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real-time Totals Breakdown */}
            <div className="flex justify-end pt-2">
              <div className="w-full sm:w-80 space-y-2 text-[14px]">
                <div className="flex justify-between text-[#6E6E73]">
                  <span>Base imponible</span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {formatCurrency(totals.baseImponible)}
                  </span>
                </div>
                <div className="flex justify-between text-[#6E6E73]">
                  <span>IVA ({ivaRate}%)</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    + {formatCurrency(totals.ivaAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-[#6E6E73]">
                  <span>Retención IRPF ({irpfRate}%)</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    − {formatCurrency(totals.irpfAmount)}
                  </span>
                </div>
                <div className="flex justify-between pt-3 border-t border-black/[0.06] text-[16px] font-semibold text-[#1D1D1F]">
                  <span>Total factura</span>
                  <span className="tabular-nums" data-testid="invoice-editor-total">
                    {formatCurrency(totals.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: VeriFactu Status & QR Preview */}
          <div className="lg:col-span-4 bg-[#F5F5F7] p-6 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-black/[0.05]">
            <div className="space-y-5">
              <div>
                <p className="text-[12px] font-medium text-[#6E6E73]">Estado VeriFactu (AEAT)</p>
                <div className="mt-2 flex items-center gap-2">
                  {isLocked ? (
                    <>
                      <ShieldCheck className="h-5 w-5 text-[#0071E3]" aria-hidden="true" />
                      <span className="text-[15px] font-semibold text-[#1D1D1F]">
                        Emitida y sellada
                      </span>
                    </>
                  ) : (
                    <>
                      <FileEdit className="h-5 w-5 text-[#6E6E73]" aria-hidden="true" />
                      <span className="text-[15px] font-semibold text-[#1D1D1F]">
                        Borrador editable
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#6E6E73]">
                  {isLocked
                    ? 'Registro encadenado inmutable listo para verificación tributaria mediante código QR.'
                    : 'Al emitir, SelfSME generará la huella encadenada SHA-256, bloqueará la factura y creará el asiento contable.'}
                </p>
              </div>

              {/* QR Preview Surface */}
              <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
                {isLocked && invoice?.veriFactuHash ? (
                  <>
                    <VeriFactuQr seed={invoice.veriFactuHash} size={124} />
                    <p className="mt-3 text-[11px] font-semibold tracking-wide text-[#0071E3]">
                      QR tributario · VeriFactu
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#6E6E73]">
                      {invoice.veriFactuHash}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#86868B]">
                      Sellada el {formatDateES(invoice.issueDate)}
                    </p>
                  </>
                ) : (
                  <div className="py-5 px-2 flex flex-col items-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#86868B]">
                      <Lock className="h-7 w-7 opacity-60" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-[13px] font-medium text-[#1D1D1F]">
                      Código QR pendiente de emisión
                    </p>
                    <p className="mt-1 text-[12px] text-[#6E6E73] leading-relaxed">
                      Se generará automáticamente al pulsar «Emitir y bloquear».
                    </p>
                  </div>
                )}
              </div>

              {/* Summary metadata */}
              <div className="space-y-2 text-[12px] text-[#6E6E73]">
                <div className="flex justify-between">
                  <span>Serie documental</span>
                  <span className="font-mono font-medium text-[#1D1D1F]">
                    {invoiceNumberInfo.number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Asiento automático PGC</span>
                  <span className="font-medium text-[#1D1D1F]">
                    {activity === 'Contabilidad Comunidades' ? '430 → 705 / 477' : '430 → 701 / 477'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons inside sidebar or footer */}
            <div className="mt-6 pt-4 border-t border-black/[0.06] space-y-2.5">
              {isLocked ? (
                <>
                  {invoice?.status === 'Pendiente' && (
                    <button
                      type="button"
                      onClick={() => {
                        onMarkPaid(invoice.id);
                        onClose();
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED]"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Marcar como cobrada
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.03]"
                  >
                    Cerrar vista previa
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleEmitVeriFactu}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED]"
                  >
                    <Lock className="h-4 w-4" />
                    Emitir y bloquear (VeriFactu)
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="w-full rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04]"
                  >
                    Guardar como borrador
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
