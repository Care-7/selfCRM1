import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Lock,
  ShieldCheck,
  FileEdit,
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Loader2,
  Download,
  Copy,
  Search,
} from 'lucide-react';
import { downloadInvoicePdf } from '../services/invoicePdfService';
import type {
  ActivityType,
  Contact,
  DocumentType,
  InvoiceLine,
  IrpfRate,
  IvaRate,
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
import { VerifactuBadgeCard } from './VerifactuBadgeCard';
import { StatusBadge } from './StatusBadge';
import { SegmentedControl } from './SegmentedControl';

interface InvoiceEditorModalProps {
  isOpen: boolean;
  invoice: IssuedInvoice | null; // null = create new
  clients: Contact[];
  allIssuedInvoices: IssuedInvoice[];
  defaultActivity: ActivityType;
  initialRectifiedInvoice?: IssuedInvoice | null;
  onClose: () => void;
  onSaveInvoice: (
    invoice: IssuedInvoice,
    isNew: boolean,
    rectifiedInvoiceId?: string,
    rectificationReason?: string
  ) => Promise<void> | void;
  onMarkPaid: (invoiceId: string) => Promise<void> | void;
  onConvertToInvoice?: (doc: IssuedInvoice) => Promise<void> | void;
  onDeleteDocument?: (doc: IssuedInvoice) => Promise<void> | void;
  onEmitRectificativa?: (invoice: IssuedInvoice) => void;
  onDuplicateInvoice?: (invoice: IssuedInvoice) => void;
  onQuickCreateClient?: (contact: Contact) => Promise<Contact | void> | void;
}

const DOC_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'normal', label: 'Factura Normal' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'albaran', label: 'Albarán' },
  { value: 'rectificativa', label: 'Rectificativa' },
];

export function InvoiceEditorModal({
  isOpen,
  invoice,
  clients,
  allIssuedInvoices,
  defaultActivity,
  initialRectifiedInvoice,
  onClose,
  onSaveInvoice,
  onMarkPaid,
  onConvertToInvoice,
  onDeleteDocument,
  onEmitRectificativa,
  onDuplicateInvoice,
  onQuickCreateClient,
}: InvoiceEditorModalProps) {
  const isLocked = Boolean(invoice?.veriFactuLocked);
  const isNew = !invoice;

  const [documentType, setDocumentType] = useState<DocumentType>('normal');
  const [isValued, setIsValued] = useState<boolean>(true);
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState<string>('');
  const [activity, setActivity] = useState<ActivityType>(defaultActivity);
  const [issueDate, setIssueDate] = useState(REFERENCE_DATE);
  const [dueDate, setDueDate] = useState('2026-12-24');
  const [ivaRate, setIvaRate] = useState<IvaRate>(21);
  const [irpfRate, setIrpfRate] = useState<IrpfRate>(15);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [rectifiedInvoiceId, setRectifiedInvoiceId] = useState<string>('');
  const [rectificationReason, setRectificationReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Quick inline client creation states
  const [showInlineNewClient, setShowInlineNewClient] = useState(false);
  const [newCliName, setNewCliName] = useState('');
  const [newCliNif, setNewCliNif] = useState('');
  const [newCliAccountCode, setNewCliAccountCode] = useState('');
  const [newCliEmail, setNewCliEmail] = useState('');
  const [isSavingQuickClient, setIsSavingQuickClient] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setIsSubmitting(false);
    setShowInlineNewClient(false);
    setClientSearch('');

    if (invoice) {
      setCustomInvoiceNumber(invoice.number);
      setDocumentType(invoice.documentType ?? 'normal');
      setIsValued(invoice.isValued !== false);
      setClientId(invoice.clientId);
      setActivity(invoice.activity);
      setIssueDate(invoice.issueDate);
      setDueDate(invoice.dueDate);
      setIvaRate(invoice.ivaRate);
      setIrpfRate(invoice.irpfRate);
      setLines(invoice.lines.map((l) => ({ ...l })));
      setRectifiedInvoiceId(invoice.rectifiedInvoiceId || '');
      setRectificationReason(invoice.rectificationReason || '');
    } else if (initialRectifiedInvoice) {
      // Opening in rectification mode for a specific invoice
      setCustomInvoiceNumber('');
      setDocumentType('rectificativa');
      setIsValued(true);
      setClientId(initialRectifiedInvoice.clientId);
      setActivity(initialRectifiedInvoice.activity);
      setIssueDate(REFERENCE_DATE);
      setDueDate(REFERENCE_DATE);
      setIvaRate(initialRectifiedInvoice.ivaRate);
      setIrpfRate(initialRectifiedInvoice.irpfRate);
      setRectifiedInvoiceId(initialRectifiedInvoice.id);
      setRectificationReason(`Rectificación de la factura ${initialRectifiedInvoice.number}`);
      // Default negative quantities to represent an abono
      setLines(
        initialRectifiedInvoice.lines.map((l, idx) => ({
          id: `line-rect-${Date.now()}-${idx}`,
          description: `Abono: ${l.description}`,
          quantity: -Math.abs(l.quantity || 1),
          unitPrice: l.unitPrice,
        }))
      );
    } else {
      setDocumentType('normal');
      setIsValued(true);
      setRectifiedInvoiceId('');
      setRectificationReason('');
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
  }, [isOpen, invoice, initialRectifiedInvoice, clients, defaultActivity]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.nif.toLowerCase().includes(q) ||
        (Boolean(c.accountCode) && c.accountCode!.toLowerCase().includes(q))
    );
  }, [clients, clientSearch]);

  const invoiceNumberInfo = useMemo(() => {
    if (invoice) {
      return { series: invoice.series, number: invoice.number };
    }
    return getNextInvoiceNumber(allIssuedInvoices, activity, documentType);
  }, [invoice, allIssuedInvoices, activity, documentType]);

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
      setErrorMsg('Selecciona un cliente antes de guardar el documento.');
      return null;
    }
    const cleanLines = lines.filter((l) => l.description.trim().length > 0);
    if (cleanLines.length === 0) {
      setErrorMsg('Añade al menos una línea de concepto con descripción.');
      return null;
    }
    if (documentType === 'normal' && totals.baseImponible <= 0) {
      setErrorMsg('El importe de la base imponible debe ser superior a 0 €.');
      return null;
    }
    if (documentType === 'rectificativa') {
      if (totals.baseImponible === 0) {
        setErrorMsg('El importe de la factura rectificativa no puede ser 0 €.');
        return null;
      }
      if (!rectificationReason.trim()) {
        setErrorMsg('Especifica el motivo de la rectificación (obligatorio según VeriFactu).');
        return null;
      }
    }

    const finalNumber = (customInvoiceNumber || invoiceNumberInfo.number).trim();
    const shouldLock = emitVeriFactu && (documentType === 'normal' || documentType === 'rectificativa');
    const hash = shouldLock
      ? generateVeriFactuHash(
          finalNumber,
          selectedClient.nif,
          issueDate,
          totals.total
        )
      : undefined;

    return {
      id: invoice ? invoice.id : `inv-${Date.now()}`,
      number: finalNumber,
      series: invoiceNumberInfo.series,
      documentType,
      isValued: documentType === 'albaran' ? isValued : undefined,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientNif: selectedClient.nif,
      activity,
      issueDate,
      dueDate,
      lines: cleanLines,
      ivaRate,
      irpfRate,
      status: shouldLock
        ? 'Pendiente'
        : invoice
        ? invoice.status
        : (documentType === 'normal' || documentType === 'rectificativa')
        ? 'Borrador'
        : 'Pendiente',
      veriFactuLocked: shouldLock,
      veriFactuHash: hash,
      veriFactuTimestamp: shouldLock ? new Date().toISOString() : undefined,
      rectifiedInvoiceId: documentType === 'rectificativa' ? (rectifiedInvoiceId || undefined) : undefined,
      rectificationReason: documentType === 'rectificativa' ? (rectificationReason || undefined) : undefined,
    };
  };

  const handleSaveDraft = async () => {
    const built = validateAndBuild(false);
    if (!built) return;
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onSaveInvoice(built, isNew, rectifiedInvoiceId, rectificationReason);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar el documento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmitVeriFactu = async () => {
    const built = validateAndBuild(true);
    if (!built) return;
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onSaveInvoice(built, isNew, rectifiedInvoiceId, rectificationReason);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al emitir la factura en VeriFactu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setErrorMsg('');
      const targetInvoice = invoice || validateAndBuild(false);
      if (!targetInvoice) return;

      // Brief visual feedback for smooth UX
      await new Promise((resolve) => setTimeout(resolve, 200));
      downloadInvoicePdf(targetInvoice);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al generar o descargar el PDF de la factura.');
    } finally {
      setIsGeneratingPdf(false);
    }
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
              {isNew ? (
                documentType === 'normal'
                  ? 'Nueva Factura emitida'
                  : documentType === 'rectificativa'
                  ? 'Nueva Factura Rectificativa'
                  : documentType === 'proforma'
                  ? 'Nueva Factura Proforma'
                  : 'Nuevo Albarán'
              ) : (
                `${invoice.documentType === 'proforma' ? 'Proforma' : invoice.documentType === 'albaran' ? 'Albarán' : invoice.documentType === 'rectificativa' ? 'Rectificativa' : 'Factura'} ${invoice.number}`
              )}
            </h2>

            {invoice && (
              invoice.documentType === 'proforma' ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0071E3]/[0.08] text-[#0071E3] px-2.5 py-1 text-[12px] font-medium leading-none">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{invoice.status === 'Convertida' ? 'Proforma · Convertida' : 'Proforma · Sin validez fiscal'}</span>
                </span>
              ) : invoice.documentType === 'albaran' ? (
                <span className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium leading-none ${
                  invoice.status === 'Facturado' ? 'bg-black/[0.05] text-[#6E6E73]' : 'bg-[#FFF4E5] text-[#B25E09]'
                }`}>
                  {invoice.status === 'Facturado' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{invoice.status === 'Facturado' ? 'Albarán · Facturado' : 'Albarán · Pendiente'}</span>
                </span>
              ) : invoice.documentType === 'rectificativa' ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#FFF0F0] text-[#D32F2F] px-2.5 py-1 text-[12px] font-medium leading-none">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Rectificativa · {invoice.status}</span>
                </span>
              ) : (
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
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            {invoice && (
              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F5F7] px-3 py-1.5 text-[13px] font-medium text-[#1D1D1F] transition-colors hover:bg-black/[0.06] disabled:opacity-50"
                title="Descargar documento PDF"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-[#0071E3]" />
                )}
                <span>Descargar PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar editor"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Two-column body: Editor + Status Preview */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Form & Lines */}
          <div className="lg:col-span-8 p-6 space-y-6">
            {/* Top iOS Segmented Control for Document Type */}
            <div className="space-y-2">
              <label className="block text-[13px] font-medium text-[#1D1D1F]">
                Tipo de documento
              </label>
              <SegmentedControl<DocumentType>
                options={DOC_TYPE_OPTIONS}
                value={documentType}
                onChange={(next) => {
                  if (!isLocked && isNew) {
                    setDocumentType(next);
                  }
                }}
                ariaLabel="Tipo de documento emitido"
              />

              {/* Discreet explanation of fiscal validity */}
              <div className="text-[12px] text-[#6E6E73] bg-[#F5F5F7] rounded-xl px-3.5 py-2.5 flex items-start gap-2 border border-black/[0.03]">
                {documentType === 'normal' && (
                  <>
                    <ShieldCheck className="h-4 w-4 text-[#0071E3] shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="leading-relaxed">
                      <strong>Validez fiscal plena:</strong> Factura tributaria vinculante conforme al sistema VeriFactu (AEAT). Genera asiento contable y liquidación de impuestos.
                    </span>
                  </>
                )}
                {documentType === 'rectificativa' && (
                  <>
                    <ShieldCheck className="h-4 w-4 text-[#D32F2F] shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="leading-relaxed">
                      <strong>Factura Rectificativa:</strong> Modifica o anula una factura anterior. Sujeta a encadenamiento VeriFactu y requiere consignar el motivo fiscal.
                    </span>
                  </>
                )}
                {documentType === 'proforma' && (
                  <>
                    <FileEdit className="h-4 w-4 text-[#0071E3] shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="leading-relaxed">
                      <strong>Sin validez fiscal:</strong> Documento preliminar o presupuesto comercial. No computa en IVA ni IRPF; convertible a Factura Normal en 1 clic.
                    </span>
                  </>
                )}
                {documentType === 'albaran' && (
                  <>
                    <FileText className="h-4 w-4 text-[#B25E09] shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="leading-relaxed">
                      <strong>Documento de entrega:</strong> Acredita la entrega física o servicio prestado. Sin devengo tributario directo hasta su facturación.
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Motivo de rectificación si es rectificativa */}
            {documentType === 'rectificativa' && (
              <div className="rounded-xl bg-[#F5F5F7] p-4 border border-black/[0.04] space-y-2">
                <label htmlFor="inv-rectification-reason" className="block text-[13px] font-semibold text-[#1D1D1F]">
                  Motivo de rectificación (requerido por AEAT / VeriFactu)
                </label>
                <input
                  id="inv-rectification-reason"
                  type="text"
                  disabled={isLocked}
                  value={rectificationReason}
                  onChange={(e) => setRectificationReason(e.target.value)}
                  placeholder="Ej. Devolución de mercancía, corrección de tipo impositivo, abono..."
                  className="w-full rounded-lg bg-white px-3.5 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none disabled:bg-transparent"
                />
                {initialRectifiedInvoice && (
                  <p className="text-[12px] text-[#6E6E73]">
                    Factura de origen a rectificar: <span className="font-mono font-medium text-[#1D1D1F]">{initialRectifiedInvoice.number}</span>
                  </p>
                )}
              </div>
            )}

            {/* Albarán sin valorar toggle if type is albaran */}
            {documentType === 'albaran' && (
              <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] px-4 py-3 border border-black/[0.03]">
                <div>
                  <p className="text-[13px] font-medium text-[#1D1D1F]">Albarán sin valorar</p>
                  <p className="text-[12px] text-[#6E6E73] mt-0.5">
                    Oculta precios e importes económicos en el documento de entrega
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!isValued}
                  disabled={isLocked}
                  onClick={() => setIsValued((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                    !isValued ? 'bg-[#0071E3]' : 'bg-black/15'
                  } disabled:opacity-50`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      !isValued ? 'translate-x-5' : 'translate-x-0.5'
                    } mt-0.5`}
                  />
                </button>
              </div>
            )}

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
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="inv-client" className="block text-[13px] font-medium text-[#1D1D1F]">
                    Cliente
                  </label>
                  {!isLocked && onQuickCreateClient && !showInlineNewClient && (
                    <button
                      type="button"
                      onClick={() => setShowInlineNewClient(true)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0071E3] hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      Nuevo cliente
                    </button>
                  )}
                </div>

                {showInlineNewClient ? (
                  <div className="rounded-xl border border-[#0071E3]/20 bg-[#F5F5F7] p-3 mb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[#1D1D1F]">Alta rápida de cliente</span>
                      <button
                        type="button"
                        onClick={() => setShowInlineNewClient(false)}
                        className="text-[11px] text-[#6E6E73] hover:text-[#1D1D1F]"
                      >
                        Cancelar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Nombre o razón social *"
                        value={newCliName}
                        onChange={(e) => setNewCliName(e.target.value)}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="NIF / CIF (opcional)"
                        value={newCliNif}
                        onChange={(e) => setNewCliNif(e.target.value.toUpperCase())}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-mono text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Subcuenta PGC (ej. 43000001)"
                        value={newCliAccountCode}
                        onChange={(e) => setNewCliAccountCode(e.target.value.trim())}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-mono text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="Email (opcional)"
                        value={newCliEmail}
                        onChange={(e) => setNewCliEmail(e.target.value)}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={isSavingQuickClient || !newCliName.trim()}
                        onClick={async () => {
                          if (!newCliName.trim()) return;
                          try {
                            setIsSavingQuickClient(true);
                            const newContact: Contact = {
                              id: `cli-${Date.now()}`,
                              kind: 'cliente',
                              name: newCliName.trim(),
                              nif: newCliNif.trim().toUpperCase(),
                              accountCode: newCliAccountCode.trim() || undefined,
                              email: newCliEmail.trim() || `cliente.${Date.now()}@facturacion.es`,
                              address: 'Dirección no especificada',
                              activity,
                              defaultIva: ivaRate,
                              defaultIrpf: irpfRate,
                              status: 'Activo',
                              historicalVolume: 0,
                            };
                            if (onQuickCreateClient) {
                              await onQuickCreateClient(newContact);
                            }
                            setClientId(newContact.id);
                            setShowInlineNewClient(false);
                            setNewCliName('');
                            setNewCliNif('');
                            setNewCliAccountCode('');
                            setNewCliEmail('');
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Error al crear cliente rápido.');
                          } finally {
                            setIsSavingQuickClient(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#0077ED] disabled:opacity-50"
                      >
                        {isSavingQuickClient && <Loader2 className="h-3 w-3 animate-spin" />}
                        Crear y seleccionar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {clients.length > 5 && (
                      <div className="relative mb-1.5">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86868B]" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre, NIF o subcuenta..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="w-full rounded-lg bg-[#F5F5F7] pl-8 pr-2.5 py-1 text-[12px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>
                    )}
                    <select
                      id="inv-client"
                      disabled={isLocked}
                      value={clientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 disabled:opacity-65"
                    >
                      {filteredClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.accountCode ? `[${c.accountCode}] ` : ''}{c.name} {c.nif ? `(${c.nif})` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedClient && (
                      <p className="mt-1.5 text-[12px] text-[#6E6E73]">
                        {selectedClient.accountCode && (
                          <span className="font-mono text-[#0071E3] mr-2">Cta: {selectedClient.accountCode}</span>
                        )}
                        NIF: <span className="font-mono text-[#1D1D1F]">{selectedClient.nif || '—'}</span> · {selectedClient.activity}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <label htmlFor="inv-number-preview" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Número {isLocked ? 'bloqueado (VeriFactu)' : 'de factura (editable)'}
                </label>
                <div className="relative">
                  <input
                    id="inv-number-preview"
                    type="text"
                    disabled={isLocked}
                    value={customInvoiceNumber !== '' ? customInvoiceNumber : invoiceNumberInfo.number}
                    onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 font-mono text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-85"
                  />
                  {isLocked && (
                    <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
                  )}
                </div>
                <p className="mt-1.5 text-[12px] text-[#6E6E73]">
                  Serie: <span className="font-mono font-medium text-[#1D1D1F]">{invoiceNumberInfo.series}</span> · {isLocked ? 'Sellado legal e inmutable' : 'Modificable antes de sellar'}
                </p>
              </div>
            </div>

            {/* Dates + Taxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div>
                <label htmlFor="inv-issue-date" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                  Fecha emisión
                </label>
                <input
                  id="inv-issue-date"
                  type="date"
                  disabled={isLocked}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2 text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                />
              </div>

              <div>
                <label htmlFor="inv-due-date" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                  Vencimiento
                </label>
                <input
                  id="inv-due-date"
                  type="date"
                  disabled={isLocked}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2 text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                />
              </div>

              {!(documentType === 'albaran' && !isValued) && (
                <>
                  <div>
                    <label htmlFor="inv-iva" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                      Tipo IVA
                    </label>
                    <select
                      id="inv-iva"
                      disabled={isLocked}
                      value={ivaRate}
                      onChange={(e) => setIvaRate(Number(e.target.value) as 21 | 10 | 0)}
                      className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                    >
                      <option value={21}>21% General</option>
                      <option value={10}>10% Reducido (Arte)</option>
                      <option value={0}>0% Exento</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="inv-irpf" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                      Retención IRPF
                    </label>
                    <select
                      id="inv-irpf"
                      disabled={isLocked}
                      value={irpfRate}
                      onChange={(e) => setIrpfRate(Number(e.target.value) as IrpfRate)}
                      className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2 text-[13px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none disabled:opacity-65"
                    >
                      <option value={15}>15% IRPF</option>
                      <option value={7}>7% IRPF</option>
                      <option value={0}>0% Sin ret.</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[13px] font-semibold text-[#1D1D1F]">
                  Líneas del documento
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

              {documentType === 'albaran' && !isValued ? (
                <div className="hidden sm:grid sm:grid-cols-12 gap-2.5 px-2.5 pb-1.5 text-[11px] font-medium text-[#86868B]">
                  <span className="col-span-9">Concepto / Mercancía entregada</span>
                  <span className="col-span-2 text-right">Cantidad</span>
                  <span className="col-span-1 text-right"></span>
                </div>
              ) : (
                <div className="hidden sm:grid sm:grid-cols-12 gap-2.5 px-2.5 pb-1.5 text-[11px] font-medium text-[#86868B]">
                  <span className="col-span-6">Concepto</span>
                  <span className="col-span-2 text-right">Ud.</span>
                  <span className="col-span-2 text-right">Precio (€)</span>
                  <span className="col-span-2 text-right">Importe</span>
                </div>
              )}

              <div className="space-y-2.5">
                {lines.map((line, index) => {
                  const subtotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);

                  if (documentType === 'albaran' && !isValued) {
                    return (
                      <div
                        key={line.id}
                        className="grid grid-cols-12 gap-2.5 items-center rounded-xl bg-[#F5F5F7]/75 p-2.5"
                      >
                        <div className="col-span-12 sm:col-span-9">
                          <label htmlFor={`line-desc-${line.id}`} className="sr-only">
                            Descripción línea {index + 1}
                          </label>
                          <input
                            id={`line-desc-${line.id}`}
                            type="text"
                            disabled={isLocked}
                            value={line.description}
                            onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                            placeholder="Ej. Entrega de libros contables o depósito de obra"
                            className="w-full rounded-lg bg-white px-3 py-2 text-[13px] text-[#1D1D1F] placeholder:text-[#86868B] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none disabled:bg-transparent disabled:border-transparent"
                          />
                        </div>

                        <div className="col-span-9 sm:col-span-2">
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

                        <div className="col-span-3 sm:col-span-1 flex items-center justify-end">
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
                  }

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
                          placeholder="Ej. Gestión contable mensual o encargo artístico"
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
                          step={documentType === 'rectificativa' ? 1 : 0.5}
                          disabled={isLocked}
                          value={line.quantity}
                          onChange={(e) =>
                            handleUpdateLine(
                              line.id,
                              'quantity',
                              documentType === 'rectificativa'
                                ? Number(e.target.value)
                                : Math.max(0, Number(e.target.value))
                            )
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
                          step={10}
                          disabled={isLocked}
                          value={line.unitPrice}
                          onChange={(e) =>
                            handleUpdateLine(
                              line.id,
                              'unitPrice',
                              documentType === 'rectificativa'
                                ? Number(e.target.value)
                                : Math.max(0, Number(e.target.value))
                            )
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
              {documentType === 'albaran' && !isValued ? (
                <div className="w-full sm:w-80 rounded-xl bg-[#F5F5F7] p-3 text-center text-[13px] text-[#6E6E73] border border-black/[0.03]">
                  Albarán sin valorar · Sin desglose de importes económicos
                </div>
              ) : (
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
                    <span>Total {documentType === 'proforma' ? 'proforma' : documentType === 'albaran' ? 'albarán' : 'factura'}</span>
                    <span className="tabular-nums" data-testid="invoice-editor-total">
                      {formatCurrency(totals.total)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Status / VeriFactu Preview */}
          <div className="lg:col-span-4 bg-[#F5F5F7] p-6 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-black/[0.05]">
            {documentType === 'normal' || documentType === 'rectificativa' ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[12px] font-medium text-[#6E6E73]">
                    {documentType === 'rectificativa' ? 'Estado Fiscal Rectificativa' : 'Estado VeriFactu (AEAT)'}
                  </p>
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

                {/* VeriFactu Badge Card or Pending Placeholder */}
                {isLocked && invoice?.veriFactuHash ? (
                  <VerifactuBadgeCard
                    invoiceNumber={invoice.number}
                    hash={invoice.veriFactuHash}
                    prevHash={invoice.verifactuPrevHash}
                    timestamp={invoice.veriFactuTimestamp}
                    qrUrl={invoice.verifactuQrUrl}
                  />
                ) : (
                  <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
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
                  </div>
                )}

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
            ) : documentType === 'proforma' ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[12px] font-medium text-[#6E6E73]">Régimen documental</p>
                  <div className="mt-2 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[#0071E3]" aria-hidden="true" />
                    <span className="text-[15px] font-semibold text-[#1D1D1F]">
                      Factura Proforma
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#6E6E73]">
                    Documento informativo de cortesía sin trascendencia contable ni tributaria ante la AEAT. No incluye sello VeriFactu.
                  </p>
                </div>

                {/* Info preview card */}
                <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0071E3]/[0.08] text-[#0071E3]">
                    <FileText className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-[#1D1D1F]">
                    Sin validez fiscal · Sin VeriFactu
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73] leading-relaxed">
                    Al ser aceptada por el cliente, pulsa «Convertir a Factura» para generar la factura ordinaria y sellarla.
                  </p>
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
                    <span>Efecto contable</span>
                    <span className="font-medium text-[#86868B]">
                      No genera asiento
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-[12px] font-medium text-[#6E6E73]">Régimen documental</p>
                  <div className="mt-2 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[#B25E09]" aria-hidden="true" />
                    <span className="text-[15px] font-semibold text-[#1D1D1F]">
                      Albarán de entrega
                    </span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#6E6E73]">
                    Justificante de entrega de material o prestación de servicios. No devenga IVA ni impuestos hasta su facturación.
                  </p>
                </div>

                {/* Info preview card */}
                <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF4E5] text-[#B25E09]">
                    <FileText className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-[#1D1D1F]">
                    {isValued ? 'Albarán Valorado' : 'Albarán Sin Valorar'}
                  </p>
                  <p className="mt-1 text-[12px] text-[#6E6E73] leading-relaxed">
                    {!isValued
                      ? 'Los importes económicos están ocultos para uso exclusivo de expedición o depósito físico.'
                      : 'Incluye importes orientativos sin registro en VeriFactu hasta su facturación.'}
                  </p>
                </div>

                {/* Summary metadata */}
                <div className="space-y-2 text-[12px] text-[#6E6E73]">
                  <div className="flex justify-between">
                    <span>Serie de expedición</span>
                    <span className="font-mono font-medium text-[#1D1D1F]">
                      {invoiceNumberInfo.number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Efecto contable</span>
                    <span className="font-medium text-[#86868B]">
                      Pendiente de facturación
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons inside sidebar or footer */}
            <div className="mt-6 pt-4 border-t border-black/[0.06] space-y-2.5">
              {documentType === 'normal' || documentType === 'rectificativa' ? (
                isLocked ? (
                  <>
                    <button
                      type="button"
                      disabled={isSubmitting || isGeneratingPdf}
                      onClick={handleDownloadPdf}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50"
                    >
                      {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Descargar PDF
                    </button>
                    {invoice?.status === 'Pendiente' && (
                      <button
                        type="button"
                        disabled={isSubmitting || isGeneratingPdf}
                        onClick={async () => {
                          try {
                            setIsSubmitting(true);
                            setErrorMsg('');
                            await onMarkPaid(invoice.id);
                            onClose();
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Error al registrar el cobro.');
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-[#1D7A3F]" />}
                        Marcar como cobrada
                      </button>
                    )}
                    {documentType === 'normal' && onEmitRectificativa && invoice && (
                      <button
                        type="button"
                        disabled={isSubmitting || isGeneratingPdf}
                        onClick={() => {
                          onEmitRectificativa(invoice);
                          onClose();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.06] px-4 py-2.5 text-[14px] font-medium text-[#D32F2F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#FFF0F0] disabled:opacity-50"
                      >
                        <FileEdit className="h-4 w-4" />
                        Emitir factura rectificativa
                      </button>
                    )}
                    {invoice && onDuplicateInvoice && (
                      <button
                        type="button"
                        disabled={isSubmitting || isGeneratingPdf}
                        onClick={() => {
                          onDuplicateInvoice(invoice);
                          onClose();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        <Copy className="h-4 w-4 text-[#0071E3]" />
                        Duplicar factura
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                      onClick={handleEmitVeriFactu}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                      Emitir y bloquear (VeriFactu)
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleSaveDraft}
                      className="w-full rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                    >
                      Guardar como borrador
                    </button>
                    {invoice && onDuplicateInvoice && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          onDuplicateInvoice(invoice);
                          onClose();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                      >
                        <Copy className="h-4 w-4 text-[#0071E3]" />
                        Duplicar factura
                      </button>
                    )}
                  </>
                )
              ) : documentType === 'proforma' ? (
                <>
                  {invoice && (
                    <button
                      type="button"
                      disabled={isSubmitting || isGeneratingPdf}
                      onClick={handleDownloadPdf}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50"
                    >
                      {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Descargar Proforma (PDF)
                    </button>
                  )}
                  {invoice && invoice.status !== 'Convertida' && onConvertToInvoice && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        try {
                          setIsSubmitting(true);
                          setErrorMsg('');
                          await onConvertToInvoice(invoice);
                          onClose();
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Error al convertir la proforma.');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#0071E3] shadow-[0_1px_2px_rgba(0,113,227,0.1)] transition-colors hover:bg-[#0071E3]/[0.06] disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Convertir a Factura
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSaveDraft}
                    className="w-full rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                  >
                    {isNew ? 'Guardar Proforma' : 'Guardar cambios'}
                  </button>
                  {invoice && onDeleteDocument && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (window.confirm('¿Estás seguro de eliminar esta proforma?')) {
                          try {
                            setIsSubmitting(true);
                            setErrorMsg('');
                            await onDeleteDocument(invoice);
                            onClose();
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Error al eliminar la proforma.');
                          } finally {
                            setIsSubmitting(false);
                          }
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium text-[#C92A2A] hover:bg-[#FDECEC] transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar proforma
                    </button>
                  )}
                </>
              ) : (
                <>
                  {invoice && (
                    <button
                      type="button"
                      disabled={isSubmitting || isGeneratingPdf}
                      onClick={handleDownloadPdf}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50"
                    >
                      {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Descargar Albarán (PDF)
                    </button>
                  )}
                  {invoice && invoice.status !== 'Facturado' && onConvertToInvoice && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        try {
                          setIsSubmitting(true);
                          setErrorMsg('');
                          await onConvertToInvoice(invoice);
                          onClose();
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Error al facturar el albarán.');
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#0071E3] shadow-[0_1px_2px_rgba(0,113,227,0.1)] transition-colors hover:bg-[#0077ED]/[0.06] disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Facturar albarán
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSaveDraft}
                    className="w-full rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                  >
                    {isNew ? 'Guardar Albarán' : 'Guardar cambios'}
                  </button>
                  {invoice && onDeleteDocument && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        if (window.confirm('¿Estás seguro de eliminar este albarán?')) {
                          try {
                            setIsSubmitting(true);
                            setErrorMsg('');
                            await onDeleteDocument(invoice);
                            onClose();
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Error al eliminar el albarán.');
                          } finally {
                            setIsSubmitting(false);
                          }
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium text-[#C92A2A] hover:bg-[#FDECEC] transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar albarán
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
