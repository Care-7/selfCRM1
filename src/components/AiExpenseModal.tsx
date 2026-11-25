import { useEffect, useState } from 'react';
import {
  X,
  UploadCloud,
  FileCheck2,
  Loader2,
  CheckCircle2,
  Trash2,
  FileText,
  ExternalLink,
  Percent,
  FileUp,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type {
  ActivityType,
  Contact,
  IrpfRate,
  IvaRate,
  OcrSampleInvoice,
  ReceivedInvoice,
  ReceivedInvoiceStatus,
} from '../types';
import type { BusinessActivity } from '../types/database';
import { OCR_SAMPLE_INVOICES, REFERENCE_DATE } from '../data/mockData';
import { formatCurrency, round2 } from '../utils/finance';
import {
  PGC_EXPENSE_ACCOUNTS,
  calculateDeductibleAmounts,
} from '../services/receivedInvoiceMappers';
import { getExpenseDocumentSignedUrl } from '../services/receivedInvoicesService';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  parseExpenseDocument,
  validateExtractedAmounts,
  matchSupplierByTaxId,
} from '../services/invoiceOcrService';

interface AiExpenseModalProps {
  isOpen: boolean;
  expense?: ReceivedInvoice | null;
  suppliers: Contact[];
  activities?: BusinessActivity[];
  defaultActivity?: ActivityType;
  onClose: () => void;
  onSaveExpense: (expense: ReceivedInvoice, file?: File | null) => Promise<void>;
  onDeleteExpense?: (expense: ReceivedInvoice) => Promise<void>;
  onTogglePaymentStatus?: (expense: ReceivedInvoice) => Promise<void>;
}

export function AiExpenseModal({
  isOpen,
  expense,
  suppliers,
  activities = [],
  defaultActivity = 'Actividad Principal',
  onClose,
  onSaveExpense,
  onDeleteExpense,
  onTogglePaymentStatus,
}: AiExpenseModalProps) {
  const isEditing = Boolean(expense);

  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = useState(false);

  // Form fields
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierNif, setSupplierNif] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(REFERENCE_DATE);
  const [accountingDate, setAccountingDate] = useState(REFERENCE_DATE);
  const [activity, setActivity] = useState<ActivityType>(defaultActivity);
  const [activityId, setActivityId] = useState<string | undefined>(undefined);
  const [concept, setConcept] = useState('');
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [ivaRate, setIvaRate] = useState<IvaRate>(21);
  const [irpfRate, setIrpfRate] = useState<IrpfRate>(0);
  const [pgcCode, setPgcCode] = useState('629');
  const [deductibleVatPct, setDeductibleVatPct] = useState<number>(100);
  const [deductibleExpensePct, setDeductibleExpensePct] = useState<number>(100);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'overdue'>('pending');
  const [existingAttachmentPath, setExistingAttachmentPath] = useState<string | null>(null);
  const [existingAttachmentName, setExistingAttachmentName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Rehydrate form when opening or changing expense
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setInfoMsg('');
    setAttachedFile(null);
    setIsSubmitting(false);
    setIsAnalyzing(false);
    setHasAnalyzed(false);
    setAnalysisWarnings([]);

    if (expense) {
      // Editing existing expense
      setStep('review');
      setSelectedSupplierId(expense.supplierId || '__custom__');
      setSupplierName(expense.supplierName);
      setSupplierNif(expense.supplierNif);
      setNumber(expense.number);
      setIssueDate(expense.issueDate);
      setAccountingDate(expense.accountingDate || expense.issueDate);
      setActivity(expense.activity);
      setActivityId(expense.activityId);
      setConcept(expense.concept);
      setBaseAmount(expense.baseAmount);
      setIvaRate(expense.ivaRate);
      setIrpfRate(expense.irpfRetainedRate || 0);
      setPgcCode(expense.pgcAccountCode || '629');
      setDeductibleVatPct(expense.deductibleVatPct ?? 100);
      setDeductibleExpensePct(expense.deductibleExpensePct ?? 100);
      setPaymentStatus(expense.paymentStatus || (expense.status === 'Contabilizada' ? 'paid' : 'pending'));
      setExistingAttachmentPath(expense.attachmentPath || null);
      setExistingAttachmentName(expense.attachmentName || null);
      setSelectedFileName(expense.attachmentName || '');
    } else {
      // New expense
      setStep('upload');
      setSelectedSupplierId('');
      setSupplierName('');
      setSupplierNif('');
      setNumber('');
      setIssueDate(REFERENCE_DATE);
      setAccountingDate(REFERENCE_DATE);
      setActivity(defaultActivity);
      const matchedAct = activities.find((a) => a.name === defaultActivity) || activities[0];
      setActivityId(matchedAct?.id);
      setConcept('');
      setBaseAmount(0);
      setIvaRate(21);
      setIrpfRate(0);
      setPgcCode('629');
      setDeductibleVatPct(100);
      setDeductibleExpensePct(100);
      setPaymentStatus('pending');
      setExistingAttachmentPath(null);
      setExistingAttachmentName(null);
      setSelectedFileName('');
    }
  }, [isOpen, expense, defaultActivity, activities]);

  if (!isOpen) return null;

  // Supplier selection pre-fills
  const handleSupplierSelect = (supId: string) => {
    setSelectedSupplierId(supId);
    if (!supId || supId === '__custom__') {
      return;
    }
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.name);
      setSupplierNif(sup.nif);
      if (sup.defaultIva === 21 || sup.defaultIva === 10 || sup.defaultIva === 4 || sup.defaultIva === 0) {
        setIvaRate(sup.defaultIva as IvaRate);
      }
      if (sup.defaultIrpf === 15 || sup.defaultIrpf === 7 || sup.defaultIrpf === 0) {
        setIrpfRate(sup.defaultIrpf as IrpfRate);
      }
      if (sup.activity) {
        setActivity(sup.activity);
        const act = activities.find((a) => a.name === sup.activity);
        if (act) setActivityId(act.id);
      }
    }
  };

  const handleActivitySelect = (actName: string) => {
    setActivity(actName as ActivityType);
    const act = activities.find((a) => a.name === actName);
    setActivityId(act?.id);
  };

  /**
   * Real AI extraction using Supabase Edge Function parse-expense-document (or mock fallback).
   */
  const handleAnalyzeDocument = async (fileToAnalyze: File) => {
    try {
      setIsAnalyzing(true);
      setErrorMsg('');
      setInfoMsg('');
      setAnalysisWarnings([]);
      setStep('scanning');

      if (isSupabaseConfigured) {
        // Real extraction via Supabase Edge Function (Gemini Flash on server)
        const extracted = await parseExpenseDocument(fileToAnalyze);
        const validation = validateExtractedAmounts(extracted);
        setAnalysisWarnings(validation.warnings);

        // Try matching supplier by extracted tax ID
        const matched = matchSupplierByTaxId(extracted.supplier_tax_id, suppliers);
        if (matched) {
          setSelectedSupplierId(matched.id);
          setSupplierName(matched.name);
          setSupplierNif(matched.nif);
          if (matched.activity) {
            setActivity(matched.activity);
            const act = activities.find((a) => a.name === matched.activity);
            if (act) setActivityId(act.id);
          }
        } else {
          setSelectedSupplierId('__custom__');
          setSupplierName(extracted.supplier_name || '');
          setSupplierNif(extracted.supplier_tax_id || '');
        }

        setNumber(extracted.supplier_invoice_number || '');
        if (extracted.issue_date) {
          setIssueDate(extracted.issue_date);
          setAccountingDate(extracted.issue_date);
        }
        setBaseAmount(extracted.tax_base);
        if (
          extracted.vat_rate === 21 ||
          extracted.vat_rate === 10 ||
          extracted.vat_rate === 4 ||
          extracted.vat_rate === 0
        ) {
          setIvaRate(extracted.vat_rate as IvaRate);
        }
        if (
          extracted.irpf_rate === 15 ||
          extracted.irpf_rate === 7 ||
          extracted.irpf_rate === 0
        ) {
          setIrpfRate(extracted.irpf_rate as IrpfRate);
        }
        if (
          extracted.suggested_pgc_category &&
          PGC_EXPENSE_ACCOUNTS[extracted.suggested_pgc_category]
        ) {
          setPgcCode(extracted.suggested_pgc_category);
        }
        if (extracted.description) {
          setConcept(extracted.description);
        }

        setHasAnalyzed(true);
        setInfoMsg('Datos fiscales extraídos con IA. Por favor, revisa y confirma antes de guardar.');
      } else {
        // In-memory demo simulation
        const sample = OCR_SAMPLE_INVOICES[0];
        setSupplierName(sample.supplierName);
        setSupplierNif(sample.supplierNif);
        setNumber(sample.number);
        setIssueDate(sample.issueDate);
        setAccountingDate(sample.issueDate);
        setActivity(sample.activity);
        setConcept(sample.concept);
        setBaseAmount(sample.baseAmount);
        setIvaRate(sample.ivaRate);
        setIrpfRate(sample.irpfRetainedRate);
        setPgcCode(sample.pgcAccountCode);
        setHasAnalyzed(true);
        setInfoMsg('Simulación de lectura completada. Revisa los datos.');
      }

      setStep('review');
    } catch (err: any) {
      console.error('Error during AI expense extraction:', err);
      setErrorMsg(err.message || 'Error al extraer los datos de la factura con IA.');
      setStep('review');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const triggerSimulatedExtraction = (sample: OcrSampleInvoice) => {
    setSelectedFileName(sample.fileName);
    setAttachedFile(null);
    setStep('scanning');
    setErrorMsg('');
    setInfoMsg('');

    window.setTimeout(() => {
      setSupplierName(sample.supplierName);
      setSupplierNif(sample.supplierNif);
      setNumber(sample.number);
      setIssueDate(sample.issueDate);
      setAccountingDate(sample.issueDate);
      setActivity(sample.activity);
      const act = activities.find((a) => a.name === sample.activity);
      if (act) setActivityId(act.id);
      setConcept(sample.concept);
      setBaseAmount(sample.baseAmount);
      setIvaRate(sample.ivaRate);
      setIrpfRate(sample.irpfRetainedRate);
      setPgcCode(sample.pgcAccountCode);
      setDeductibleVatPct(100);
      setDeductibleExpensePct(100);
      setHasAnalyzed(true);
      setStep('review');
    }, 520);
  };

  const handleFileDropOrSelect = (file: File) => {
    setSelectedFileName(file.name);
    setAttachedFile(file);
    handleAnalyzeDocument(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileDropOrSelect(e.dataTransfer.files[0]);
    } else {
      triggerSimulatedExtraction(OCR_SAMPLE_INVOICES[0]);
    }
  };

  const handleOpenExistingAttachment = async () => {
    if (!existingAttachmentPath) return;
    try {
      setIsLoadingSignedUrl(true);
      const url = await getExpenseDocumentSignedUrl(existingAttachmentPath, 3600);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al obtener el documento adjunto.');
    } finally {
      setIsLoadingSignedUrl(false);
    }
  };

  // Calculations in real time
  const cleanBase = round2(Number(baseAmount) || 0);
  const ivaAmount = round2(cleanBase * (ivaRate / 100));
  const irpfAmount = round2(cleanBase * (irpfRate / 100));
  const totalAmount = round2(cleanBase + ivaAmount - irpfAmount);

  const { deductibleExpense, deductibleVat } = calculateDeductibleAmounts(
    cleanBase,
    ivaAmount,
    deductibleExpensePct,
    deductibleVatPct
  );

  const pgcName = PGC_EXPENSE_ACCOUNTS[pgcCode] || 'Otros servicios';

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !supplierNif.trim() || !number.trim() || cleanBase <= 0) {
      setErrorMsg('Revisa que proveedor, NIF, número de factura y base imponible (> 0 €) sean correctos.');
      return;
    }

    const matchingSupplier = suppliers.find(
      (s) =>
        s.nif.toUpperCase() === supplierNif.trim().toUpperCase() ||
        s.name.toLowerCase() === supplierName.trim().toLowerCase()
    );

    const targetSupplierId =
      selectedSupplierId && selectedSupplierId !== '__custom__'
        ? selectedSupplierId
        : matchingSupplier
        ? matchingSupplier.id
        : undefined;

    const invoiceStatus: ReceivedInvoiceStatus =
      paymentStatus === 'paid' ? 'Contabilizada' : 'Pendiente';

    const built: ReceivedInvoice = {
      id: expense ? expense.id : `rec-${Date.now()}`,
      number: number.trim(),
      supplierId: targetSupplierId || (expense?.supplierId ?? ''),
      supplierName: supplierName.trim(),
      supplierNif: supplierNif.trim().toUpperCase(),
      activity,
      activityId,
      issueDate,
      accountingDate: accountingDate || issueDate,
      concept: concept.trim() || pgcName,
      pgcAccountCode: pgcCode,
      pgcAccountName: pgcName,
      baseAmount: cleanBase,
      ivaRate,
      irpfRetainedRate: irpfRate,
      status: invoiceStatus,
      deductible: deductibleExpensePct > 0 || deductibleVatPct > 0,
      deductibleVatPct,
      deductibleExpensePct,
      deductibleVatAmount: deductibleVat,
      deductibleExpenseAmount: deductibleExpense,
      paymentStatus,
      attachmentPath: existingAttachmentPath || undefined,
      attachmentName: attachedFile ? attachedFile.name : existingAttachmentName || undefined,
    };

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onSaveExpense(built, attachedFile);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar la factura recibida.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!expense || !onDeleteExpense) return;
    if (!window.confirm(`¿Estás seguro de eliminar el gasto ${expense.number} de ${expense.supplierName}?`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onDeleteExpense(expense);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al eliminar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!expense || !onTogglePaymentStatus) return;
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onTogglePaymentStatus(expense);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al actualizar el estado de pago.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-expense-title"
    >
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div>
            <h2
              id="ai-expense-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
            >
              {isEditing && expense ? `Gasto / Factura ${expense.number}` : 'Registrar Factura Recibida o Gasto'}
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              {isEditing
                ? 'Edición de datos fiscales, deducibilidad por actividad y justificante.'
                : 'Lectura inteligente con IA, vinculación con proveedor y asignación a epígrafe IAE.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de gasto"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-[#FDECEC] px-4 py-3 text-[13px] font-medium text-[#C92A2A]"
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              className="rounded-xl bg-[#E8F8EE] px-4 py-3 text-[13px] font-medium text-[#1D7A3F] flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {step === 'upload' && !isEditing && (
            <div className="space-y-6">
              {/* Drag & Drop zone with prominent AI action */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-all ${
                  isDragging
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.05]'
                    : 'border-black/[0.12] bg-[#F5F5F7]/70 hover:border-[#0071E3]/60 hover:bg-[#F5F5F7]'
                }`}
              >
                <input
                  type="file"
                  id="expense-file-input"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileDropOrSelect(e.target.files[0]);
                    }
                  }}
                />
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-[#0071E3]">
                  <UploadCloud className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                  Arrastra tu factura (PDF, JPG, PNG, WebP) o haz clic para subir
                </p>
                <p className="mt-1 text-[13px] text-[#6E6E73]">
                  La IA de Gemini extraerá automáticamente proveedor, NIF, importes e IVA.
                </p>
              </div>

              {/* Fast track: Manual entry or Simulated receipt */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="w-full sm:w-auto text-[13px] font-medium text-[#0071E3] hover:underline flex items-center justify-center gap-1.5 py-1"
                >
                  <FileText className="h-4 w-4" />
                  Introducir datos manualmente sin archivo
                </button>
                <span className="text-[12px] text-[#86868B] hidden sm:inline">· o prueba un ejemplo ·</span>
                <button
                  type="button"
                  onClick={() => triggerSimulatedExtraction(OCR_SAMPLE_INVOICES[0])}
                  className="w-full sm:w-auto text-[13px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] flex items-center justify-center gap-1.5 py-1"
                >
                  Simular lectura OCR (Ejemplo)
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-[#0071E3]" aria-hidden="true" />
              <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                Extrayendo datos fiscales con IA...
              </p>
              <p className="mt-1 text-[13px] text-[#6E6E73]">
                {selectedFileName || 'Procesando documento...'}
              </p>
            </div>
          )}

          {step === 'review' && (
            <form id="ai-expense-form" onSubmit={handleConfirmSave} className="space-y-6">
              {/* Attachment banner with prominent AI Action button */}
              {(attachedFile || existingAttachmentPath) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-[#F5F5F7] px-4 py-3 text-[13px] text-[#1D1D1F] border border-black/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCheck2 className="h-4 w-4 shrink-0 text-[#0071E3]" aria-hidden="true" />
                    <span className="truncate font-medium">
                      Justificante: {attachedFile ? attachedFile.name : existingAttachmentName || 'Documento adjunto'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {attachedFile && (
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => handleAnalyzeDocument(attachedFile)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.2)] hover:bg-[#0077ED] transition-colors disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Extrayendo datos fiscales...
                          </>
                        ) : hasAnalyzed ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5" />
                            Volver a analizar con IA
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            Leer datos con IA
                          </>
                        )}
                      </button>
                    )}

                    {existingAttachmentPath && !attachedFile && (
                      <button
                        type="button"
                        disabled={isLoadingSignedUrl}
                        onClick={handleOpenExistingAttachment}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0071E3] hover:underline"
                      >
                        {isLoadingSignedUrl ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        Ver archivo
                      </button>
                    )}

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setStep('upload');
                          setAttachedFile(null);
                        }}
                        className="text-[12px] text-[#6E6E73] hover:underline ml-1"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Mathematical / Multi-VAT Warning Banner */}
              {analysisWarnings.length > 0 && (
                <div className="rounded-xl bg-[#FFF9E6] border border-[#F59E0B]/25 p-3.5 text-[12px] text-[#92400E] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Aviso de revisión contable</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[#78350F]">
                    {analysisWarnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 1. Supplier Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="expense-supplier-select" className="block text-[13px] font-medium text-[#1D1D1F]">
                    Proveedor
                  </label>
                  <span className="text-[12px] text-[#6E6E73]">
                    Vincula con tu agenda de proveedores
                  </span>
                </div>
                <select
                  id="expense-supplier-select"
                  value={selectedSupplierId}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                >
                  <option value="">— Seleccionar proveedor existente —</option>
                  <option value="__custom__">✎ Escribir proveedor manualmente (ticket / puntual)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nif}) {s.activity ? `· ${s.activity}` : ''}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="expense-supplier-name" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                      Razón social / Nombre del proveedor *
                    </label>
                    <input
                      id="expense-supplier-name"
                      type="text"
                      required
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Ej. Vodafone España SAU"
                      className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="expense-supplier-nif" className="block text-[12px] font-medium text-[#6E6E73] mb-1">
                      NIF / CIF del proveedor *
                    </label>
                    <input
                      id="expense-supplier-nif"
                      type="text"
                      required
                      value={supplierNif}
                      onChange={(e) => setSupplierNif(e.target.value.toUpperCase())}
                      placeholder="Ej. A82009865"
                      className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Document Number, Dates & Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="expense-number" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Nº Factura proveedor *
                  </label>
                  <input
                    id="expense-number"
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Ej. FT-2026-091"
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="expense-issue-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Fecha de emisión *
                  </label>
                  <input
                    id="expense-issue-date"
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => {
                      setIssueDate(e.target.value);
                      if (!accountingDate || accountingDate === issueDate) {
                        setAccountingDate(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="expense-accounting-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Fecha registro contable
                  </label>
                  <input
                    id="expense-accounting-date"
                    type="date"
                    value={accountingDate}
                    onChange={(e) => setAccountingDate(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
              </div>

              {/* Activity & PGC Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expense-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Actividad IAE imputada
                  </label>
                  <select
                    id="expense-activity"
                    value={activity}
                    onChange={(e) => handleActivitySelect(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    {activities.length > 0 ? (
                      activities.map((act) => (
                        <option key={act.id} value={act.name}>
                          {act.name} {act.iae_code ? `(Epígrafe ${act.iae_code})` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Contabilidad Comunidades">Contabilidad Comunidades</option>
                        <option value="Actividad Artística">Actividad Artística</option>
                        <option value="Actividad Principal">Actividad Principal</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="expense-pgc" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Categoría contable (PGC)
                  </label>
                  <select
                    id="expense-pgc"
                    value={pgcCode}
                    onChange={(e) => setPgcCode(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    {Object.entries(PGC_EXPENSE_ACCOUNTS).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} · {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Concept description */}
              <div>
                <label htmlFor="expense-concept" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Concepto / Descripción del gasto
                </label>
                <input
                  id="expense-concept"
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej. Cuota mensual fibra y líneas móviles profesionales"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              {/* Amounts & Taxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="expense-base" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Base imponible (€) *
                  </label>
                  <input
                    id="expense-base"
                    type="number"
                    min={0.01}
                    step={0.01}
                    required
                    value={baseAmount || ''}
                    onChange={(e) => setBaseAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-right text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="expense-iva" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    IVA soportado
                  </label>
                  <select
                    id="expense-iva"
                    value={ivaRate}
                    onChange={(e) => setIvaRate(Number(e.target.value) as IvaRate)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value={21}>21% ({formatCurrency(round2(cleanBase * 0.21))})</option>
                    <option value={10}>10% ({formatCurrency(round2(cleanBase * 0.1))})</option>
                    <option value={4}>4% ({formatCurrency(round2(cleanBase * 0.04))})</option>
                    <option value={0}>0% Exento</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="expense-irpf" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Retención IRPF (Mod. 111)
                  </label>
                  <select
                    id="expense-irpf"
                    value={irpfRate}
                    onChange={(e) => setIrpfRate(Number(e.target.value) as IrpfRate)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value={0}>Sin retención (0%)</option>
                    <option value={15}>15% Profesional ({formatCurrency(round2(cleanBase * 0.15))})</option>
                    <option value={7}>7% Nuevos autónomos ({formatCurrency(round2(cleanBase * 0.07))})</option>
                  </select>
                </div>
              </div>

              {/* 3. Real-Time Fiscal Deductibility Controls */}
              <div className="rounded-2xl bg-[#F5F5F7] p-4.5 space-y-4 border border-black/[0.04]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-[#0071E3]" />
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">
                      Reglas de Deducibilidad Fiscal
                    </span>
                  </div>
                  <span className="text-[12px] text-[#6E6E73]">
                    Ley 37/1992 (IVA) y Ley 35/2006 (IRPF)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* % IVA deducible */}
                  <div className="bg-white rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] border border-black/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-medium text-[#1D1D1F]">
                        % IVA deducible
                      </span>
                      <div className="flex gap-1">
                        {[100, 50, 0].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setDeductibleVatPct(pct)}
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              deductibleVatPct === pct
                                ? 'bg-[#0071E3] text-white'
                                : 'bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F]'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={deductibleVatPct}
                        onChange={(e) => setDeductibleVatPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-16 rounded-lg bg-[#F5F5F7] px-2 py-1 text-right text-[13px] tabular-nums font-medium text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                      />
                      <span className="text-[12px] text-[#6E6E73]">
                        Cuota deducible:{' '}
                        <strong className="text-[#1D1D1F] tabular-nums">
                          {formatCurrency(deductibleVat)}
                        </strong>{' '}
                        de {formatCurrency(ivaAmount)}
                      </span>
                    </div>
                  </div>

                  {/* % Gasto deducible IRPF/IS */}
                  <div className="bg-white rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] border border-black/[0.04]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-medium text-[#1D1D1F]">
                        % Gasto computable (IRPF / IS)
                      </span>
                      <div className="flex gap-1">
                        {[100, 50, 0].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setDeductibleExpensePct(pct)}
                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              deductibleExpensePct === pct
                                ? 'bg-[#0071E3] text-white'
                                : 'bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F]'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={deductibleExpensePct}
                        onChange={(e) => setDeductibleExpensePct(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-16 rounded-lg bg-[#F5F5F7] px-2 py-1 text-right text-[13px] tabular-nums font-medium text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                      />
                      <span className="text-[12px] text-[#6E6E73]">
                        Base computable:{' '}
                        <strong className="text-[#1D1D1F] tabular-nums">
                          {formatCurrency(deductibleExpense)}
                        </strong>{' '}
                        de {formatCurrency(cleanBase)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Attachment input if not yet selected */}
              {!attachedFile && !existingAttachmentPath && (
                <div className="flex items-center justify-between rounded-xl border border-dashed border-black/[0.12] p-3 text-[13px]">
                  <div className="flex items-center gap-2 text-[#6E6E73]">
                    <FileUp className="h-4 w-4 text-[#0071E3]" />
                    <span>Adjuntar justificante (PDF, JPG, PNG, WebP)</span>
                  </div>
                  <label
                    htmlFor="file-upload-review"
                    className="cursor-pointer rounded-lg bg-black/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#1D1D1F] hover:bg-black/[0.08]"
                  >
                    Seleccionar archivo
                    <input
                      id="file-upload-review"
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileDropOrSelect(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              )}

              {/* Accounting Preview */}
              <div className="rounded-2xl bg-[#F5F5F7] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#1D1D1F]">
                    Asiento contable PGC proyectado
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#1D1D1F]">
                    Total factura: {formatCurrency(totalAmount)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.05] text-[12px]">
                  <div className="grid grid-cols-12 py-1 text-[#6E6E73]">
                    <span className="col-span-6">Cuenta</span>
                    <span className="col-span-3 text-right">Debe</span>
                    <span className="col-span-3 text-right">Haber</span>
                  </div>
                  <div className="grid grid-cols-12 py-1 text-[#1D1D1F]">
                    <span className="col-span-6 truncate font-medium">
                      <span className="font-mono text-[#6E6E73] mr-1.5">{pgcCode}</span>
                      {pgcName}
                    </span>
                    <span className="col-span-3 text-right tabular-nums font-medium">
                      {formatCurrency(cleanBase)}
                    </span>
                    <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                  </div>
                  {ivaAmount > 0 && (
                    <div className="grid grid-cols-12 py-1 text-[#1D1D1F]">
                      <span className="col-span-6 truncate font-medium">
                        <span className="font-mono text-[#6E6E73] mr-1.5">472</span>
                        H.P. IVA soportado ({ivaRate}%)
                      </span>
                      <span className="col-span-3 text-right tabular-nums font-medium">
                        {formatCurrency(ivaAmount)}
                      </span>
                      <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                    </div>
                  )}
                  {irpfAmount > 0 && (
                    <div className="grid grid-cols-12 py-1 text-[#1D1D1F]">
                      <span className="col-span-6 truncate font-medium">
                        <span className="font-mono text-[#6E6E73] mr-1.5">4751</span>
                        H.P. acreedora por retenciones ({irpfRate}%)
                      </span>
                      <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                      <span className="col-span-3 text-right tabular-nums font-medium">
                        {formatCurrency(irpfAmount)}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-12 py-1 text-[#1D1D1F]">
                    <span className="col-span-6 truncate font-medium">
                      <span className="font-mono text-[#6E6E73] mr-1.5">410</span>
                      Acreedores ({supplierName || 'Proveedor'})
                    </span>
                    <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                    <span className="col-span-3 text-right tabular-nums font-semibold text-[#1D1D1F]">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
          <div>
            {isEditing && onDeleteExpense && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-[#C92A2A] hover:bg-[#FDECEC] transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar gasto
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F] disabled:opacity-50"
            >
              Cancelar
            </button>
            {isEditing && expense && onTogglePaymentStatus && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleTogglePaid}
                className="rounded-xl bg-white border border-black/[0.08] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
              >
                {expense.status === 'Contabilizada' ? 'Marcar como Pendiente' : 'Marcar como Pagada'}
              </button>
            )}
            {step === 'review' && (
              <button
                type="submit"
                form="ai-expense-form"
                disabled={isSubmitting || isAnalyzing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isEditing ? 'Guardar cambios' : 'Contabilizar gasto'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
