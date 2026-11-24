import { useEffect, useState } from 'react';
import { X, UploadCloud, FileCheck2, Loader2, CheckCircle2 } from 'lucide-react';
import type {
  ActivityType,
  Contact,
  IrpfRate,
  IvaRate,
  OcrSampleInvoice,
  ReceivedInvoice,
} from '../types';
import { OCR_SAMPLE_INVOICES, REFERENCE_DATE } from '../data/mockData';
import { formatCurrency, round2 } from '../utils/finance';

interface AiExpenseModalProps {
  isOpen: boolean;
  suppliers: Contact[];
  onClose: () => void;
  onSaveExpense: (expense: ReceivedInvoice) => void;
}

const PGC_EXPENSE_ACCOUNTS = [
  { code: '602', name: 'Compras de otros aprovisionamientos' },
  { code: '607', name: 'Trabajos realizados por otras empresas' },
  { code: '621', name: 'Arrendamientos y cánones' },
  { code: '627', name: 'Publicidad, propaganda y relaciones públicas' },
  { code: '628', name: 'Suministros' },
  { code: '629', name: 'Otros servicios (software profesional)' },
];

export function AiExpenseModal({
  isOpen,
  suppliers,
  onClose,
  onSaveExpense,
}: AiExpenseModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Form fields
  const [supplierName, setSupplierName] = useState('');
  const [supplierNif, setSupplierNif] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(REFERENCE_DATE);
  const [activity, setActivity] = useState<ActivityType>('Actividad Artística');
  const [concept, setConcept] = useState('');
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [ivaRate, setIvaRate] = useState<IvaRate>(21);
  const [irpfRate, setIrpfRate] = useState<IrpfRate>(0);
  const [pgcCode, setPgcCode] = useState('602');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('upload');
    setSelectedFileName('');
    setIsDragging(false);
    setErrorMsg('');
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerSimulatedExtraction = (sample: OcrSampleInvoice) => {
    setSelectedFileName(sample.fileName);
    setStep('scanning');
    setErrorMsg('');

    window.setTimeout(() => {
      setSupplierName(sample.supplierName);
      setSupplierNif(sample.supplierNif);
      setNumber(sample.number);
      setIssueDate(sample.issueDate);
      setActivity(sample.activity);
      setConcept(sample.concept);
      setBaseAmount(sample.baseAmount);
      setIvaRate(sample.ivaRate);
      setIrpfRate(sample.irpfRetainedRate);
      setPgcCode(sample.pgcAccountCode);
      setStep('review');
    }, 520);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    triggerSimulatedExtraction(OCR_SAMPLE_INVOICES[0]);
  };

  const ivaAmount = round2((Number(baseAmount) || 0) * (ivaRate / 100));
  const irpfAmount = round2((Number(baseAmount) || 0) * (irpfRate / 100));
  const totalAmount = round2((Number(baseAmount) || 0) + ivaAmount - irpfAmount);
  const selectedPgc =
    PGC_EXPENSE_ACCOUNTS.find((a) => a.code === pgcCode) ?? PGC_EXPENSE_ACCOUNTS[0];

  const handleConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !supplierNif.trim() || !number.trim() || baseAmount <= 0) {
      setErrorMsg('Revisa que proveedor, NIF, número de factura y base imponible (> 0 €) sean correctos.');
      return;
    }

    const matchingSupplier = suppliers.find(
      (s) =>
        s.nif.toUpperCase() === supplierNif.trim().toUpperCase() ||
        s.name.toLowerCase() === supplierName.trim().toLowerCase()
    );

    const created: ReceivedInvoice = {
      id: `rec-${Date.now()}`,
      number: number.trim(),
      supplierId: matchingSupplier ? matchingSupplier.id : `sup-ext-${Date.now()}`,
      supplierName: supplierName.trim(),
      supplierNif: supplierNif.trim().toUpperCase(),
      activity,
      issueDate,
      concept: concept.trim() || 'Gasto profesional deducible',
      pgcAccountCode: selectedPgc.code,
      pgcAccountName: selectedPgc.name,
      baseAmount: round2(Number(baseAmount)),
      ivaRate,
      irpfRetainedRate: irpfRate,
      status: 'Contabilizada',
      deductible: true,
    };

    onSaveExpense(created);
    onClose();
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

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div>
            <h2
              id="ai-expense-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
            >
              Subir factura recibida (Lectura IA)
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              Extracción automática de proveedor, importes e imputación contable PGC.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente de factura recibida"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Simulated Drag & Drop zone */}
              <button
                type="button"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => triggerSimulatedExtraction(OCR_SAMPLE_INVOICES[0])}
                className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
                  isDragging
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.05]'
                    : 'border-black/[0.12] bg-[#F5F5F7]/70 hover:border-[#0071E3]/60 hover:bg-[#F5F5F7]'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-[#0071E3]">
                  <UploadCloud className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                  Arrastra tu factura PDF o haz clic para simular la lectura
                </p>
                <p className="mt-1 text-[13px] text-[#6E6E73]">
                  Detecta automáticamente NIF, base imponible, cuota de IVA y asiento sugerido.
                </p>
              </button>

              {/* Quick realistic sample receipts */}
              <div>
                <p className="text-[12px] font-medium text-[#6E6E73] mb-3">
                  O prueba directamente con una factura de ejemplo
                </p>
                <div className="space-y-2">
                  {OCR_SAMPLE_INVOICES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => triggerSimulatedExtraction(sample)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl bg-[#F5F5F7]/80 px-4 py-3 text-left transition-colors hover:bg-[#F5F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#1D1D1F]">
                          {sample.fileName}
                        </p>
                        <p className="truncate text-[12px] text-[#6E6E73] mt-0.5">
                          {sample.supplierName} · {sample.activity} · {sample.fileSize}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-[#0071E3] whitespace-nowrap">
                        Extraer datos
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-[#0071E3]" aria-hidden="true" />
              <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                Analizando documento y proponiendo asiento contable…
              </p>
              <p className="mt-1 text-[13px] text-[#6E6E73]">{selectedFileName}</p>
            </div>
          )}

          {step === 'review' && (
            <form id="ai-expense-form" onSubmit={handleConfirmSave} className="space-y-5">
              {/* Extraction confirmation bar */}
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#E8F8EE] px-4 py-3 text-[13px] text-[#1D7A3F]">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium">
                    Datos extraídos de {selectedFileName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
                >
                  Cambiar archivo
                </button>
              </div>

              {errorMsg && (
                <p role="alert" className="rounded-xl bg-[#FDECEC] px-4 py-2.5 text-[13px] text-[#C92A2A]">
                  {errorMsg}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ocr-supplier" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Proveedor
                  </label>
                  <input
                    id="ocr-supplier"
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-nif" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    NIF / CIF proveedor
                  </label>
                  <input
                    id="ocr-nif"
                    type="text"
                    value={supplierNif}
                    onChange={(e) => setSupplierNif(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="ocr-number" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Nº Factura
                  </label>
                  <input
                    id="ocr-number"
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-date" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Fecha factura
                  </label>
                  <input
                    id="ocr-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Actividad
                  </label>
                  <select
                    id="ocr-activity"
                    value={activity}
                    onChange={(e) => setActivity(e.target.value as ActivityType)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value="Contabilidad Comunidades">Contabilidad Comunidades</option>
                    <option value="Actividad Artística">Actividad Artística</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ocr-concept" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Concepto del gasto
                </label>
                <input
                  id="ocr-concept"
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="ocr-base" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Base imponible (€)
                  </label>
                  <input
                    id="ocr-base"
                    type="number"
                    min={0}
                    step={0.01}
                    value={baseAmount}
                    onChange={(e) => setBaseAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-right text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ocr-iva" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    IVA soportado
                  </label>
                  <select
                    id="ocr-iva"
                    value={ivaRate}
                    onChange={(e) => setIvaRate(Number(e.target.value) as IvaRate)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value={21}>21% ({formatCurrency(round2(baseAmount * 0.21))})</option>
                    <option value={10}>10% ({formatCurrency(round2(baseAmount * 0.1))})</option>
                    <option value={4}>4% ({formatCurrency(round2(baseAmount * 0.04))})</option>
                    <option value={0}>0% Exento</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ocr-pgc" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Cuenta de gasto
                  </label>
                  <select
                    id="ocr-pgc"
                    value={pgcCode}
                    onChange={(e) => setPgcCode(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3 py-2.5 text-[13px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    {PGC_EXPENSE_ACCOUNTS.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        {acc.code} · {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Suggested Accounting Entry Preview */}
              <div className="rounded-2xl bg-[#F5F5F7] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#1D1D1F]">
                    Asiento contable sugerido (PGC)
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#1D1D1F]">
                    Total factura: {formatCurrency(totalAmount)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.05] text-[12px]">
                  <div className="grid grid-cols-12 py-1.5 text-[#6E6E73]">
                    <span className="col-span-6">Cuenta</span>
                    <span className="col-span-3 text-right">Debe</span>
                    <span className="col-span-3 text-right">Haber</span>
                  </div>
                  <div className="grid grid-cols-12 py-1.5 text-[#1D1D1F]">
                    <span className="col-span-6 truncate">
                      <span className="font-mono text-[#6E6E73] mr-1.5">{selectedPgc.code}</span>
                      {selectedPgc.name}
                    </span>
                    <span className="col-span-3 text-right tabular-nums font-medium">
                      {formatCurrency(baseAmount)}
                    </span>
                    <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                  </div>
                  {ivaAmount > 0 && (
                    <div className="grid grid-cols-12 py-1.5 text-[#1D1D1F]">
                      <span className="col-span-6 truncate">
                        <span className="font-mono text-[#6E6E73] mr-1.5">472</span>
                        H.P. IVA soportado ({ivaRate}%)
                      </span>
                      <span className="col-span-3 text-right tabular-nums font-medium">
                        {formatCurrency(ivaAmount)}
                      </span>
                      <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                    </div>
                  )}
                  <div className="grid grid-cols-12 py-1.5 text-[#1D1D1F]">
                    <span className="col-span-6 truncate">
                      <span className="font-mono text-[#6E6E73] mr-1.5">410</span>
                      Acreedores ({supplierName})
                    </span>
                    <span className="col-span-3 text-right tabular-nums text-[#86868B]">—</span>
                    <span className="col-span-3 text-right tabular-nums font-medium">
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
          >
            Cancelar
          </button>
          {step === 'review' && (
            <button
              type="submit"
              form="ai-expense-form"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Contabilizar gasto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
