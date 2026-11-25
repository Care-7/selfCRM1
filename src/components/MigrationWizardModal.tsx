import { useState } from 'react';
import {
  X,
  Users,
  Building2,
  FileText,
  UploadCloud,
  Download,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { IssuedInvoice, NavSection } from '../types';
import {
  parseAndValidateContactsCsv,
  generateCsvTemplate,
  type CsvImportResult,
  type ParsedContactRow,
} from '../utils/csvImport';

export type MigrationEntity = 'clientes' | 'proveedores' | 'facturas';
export type MigrationSource = 'excel' | 'holded' | 'quipu' | 'facturadirecta' | 'otro';

export interface ImportSummaryResult {
  imported: number;
  skipped: number;
}

interface MigrationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportClients: (newClients: ParsedContactRow[]) => Promise<ImportSummaryResult | void> | void;
  onImportSuppliers: (newSuppliers: ParsedContactRow[]) => Promise<ImportSummaryResult | void> | void;
  onImportInvoices: (newInvoices: IssuedInvoice[]) => void;
  onNavigateSection: (section: NavSection) => void;
}

const SOURCES: { id: MigrationSource; name: string }[] = [
  { id: 'excel', name: 'Excel / CSV' },
  { id: 'holded', name: 'Holded' },
  { id: 'quipu', name: 'Quipu' },
  { id: 'facturadirecta', name: 'FacturaDirecta' },
  { id: 'otro', name: 'Otro software' },
];

export function MigrationWizardModal({
  isOpen,
  onClose,
  onImportClients,
  onImportSuppliers,
  onNavigateSection,
}: MigrationWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [entity, setEntity] = useState<MigrationEntity>('clientes');
  const [source, setSource] = useState<MigrationSource>('excel');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Parsed CSV result
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);

  if (!isOpen) return null;

  const resetWizard = () => {
    setCurrentStep(1);
    setEntity('clientes');
    setSource('excel');
    setFileName('');
    setIsDragging(false);
    setIsSuccess(false);
    setImportedCount(0);
    setSkippedCount(0);
    setIsImporting(false);
    setImportError(null);
    setCsvResult(null);
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  // Step 2: Download official CSV template
  const handleDownloadTemplate = () => {
    const csvContent = generateCsvTemplate(entity);
    const downloadName = `plantilla_migracion_${entity}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processCsvContent = (content: string, name: string) => {
    setImportError(null);
    const result = parseAndValidateContactsCsv(
      content,
      entity === 'clientes' ? 'cliente' : 'proveedor'
    );
    setCsvResult(result);
    setFileName(name);
    setCurrentStep(3);
  };

  // Step 2: Simulate sample file
  const handleSimulateSample = () => {
    const sourceLabel = SOURCES.find((s) => s.id === source)?.name ?? 'Export';
    const sampleFileName =
      entity === 'clientes'
        ? `clientes_${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_2026.csv`
        : `proveedores_${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_2026.csv`;

    const templateContent = generateCsvTemplate(entity);
    processCsvContent(templateContent, sampleFileName);
  };

  // File upload handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          processCsvContent(text, file.name);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          processCsvContent(text, file.name);
        }
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      handleSimulateSample();
    }
  };

  // Step 3: Confirm and execute import
  const handleConfirmImport = async () => {
    if (!csvResult || csvResult.validRows.length === 0) {
      setImportError('No hay registros válidos para importar.');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      let result: ImportSummaryResult | void = undefined;
      if (entity === 'clientes') {
        result = await onImportClients(csvResult.validRows);
      } else if (entity === 'proveedores') {
        result = await onImportSuppliers(csvResult.validRows);
      }

      const totalImported = result ? result.imported : csvResult.validRows.length;
      const totalSkipped = result ? result.skipped : 0;

      setImportedCount(totalImported);
      setSkippedCount(totalSkipped);
      setIsSuccess(true);
    } catch (err: any) {
      setImportError(err.message || 'Error durante la importación de datos.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleNavigateToResult = () => {
    const targetSection: NavSection = entity === 'clientes' ? 'clientes' : 'proveedores';
    onNavigateSection(targetSection);
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071E3]/[0.08] text-[#0071E3]">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="migration-modal-title"
                className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
              >
                Asistente de migración de datos
              </h2>
              <p className="text-[12px] text-[#6E6E73]">
                Importa clientes y proveedores con validación fiscal de NIF/CIF en tiempo real
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar asistente"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb Steps */}
        {!isSuccess && (
          <div className="flex items-center justify-between px-6 py-3 bg-[#FBFBFD] border-b border-black/[0.04] text-[12px] font-medium text-[#6E6E73]">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 1 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                1
              </span>
              <span className={currentStep === 1 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Origen y entidad
              </span>
            </div>
            <span className="text-[#86868B]">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 2 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                2
              </span>
              <span className={currentStep === 2 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Subida de archivo
              </span>
            </div>
            <span className="text-[#86868B]">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 3 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                3
              </span>
              <span className={currentStep === 3 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Validación y confirmación
              </span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSuccess ? (
            /* Success confirmation screen */
            <div className="py-8 text-center flex flex-col items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F8EE] text-[#1D7A3F]">
                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                ¡Migración completada con éxito!
              </h3>
              <p className="mt-1.5 text-[14px] text-[#6E6E73] max-w-md">
                Se han importado correctamente <strong>{importedCount} {entity}</strong> en tu organización de SelfSME.
                {skippedCount > 0 && (
                  <span className="block mt-1 text-[#86868B] text-[13px]">
                    ({skippedCount} contactos fueron omitidos por existir previamente en la base de datos).
                  </span>
                )}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleNavigateToResult}
                  className="rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
                >
                  Ver {entity === 'clientes' ? 'Clientes' : 'Proveedores'} en el sistema
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] hover:bg-black/[0.05] transition-colors"
                >
                  Importar otra entidad
                </button>
              </div>
            </div>
          ) : currentStep === 1 ? (
            /* Step 1: Entity & Source */
            <div className="space-y-6">
              <div>
                <label className="block text-[13px] font-semibold text-[#1D1D1F] mb-2.5">
                  ¿Qué datos deseas importar?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setEntity('clientes')}
                    className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'clientes'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                        entity === 'clientes' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Clientes</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Cartera de clientes, NIF verificado, contactos y tipos de IVA.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEntity('proveedores')}
                    className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'proveedores'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                        entity === 'proveedores' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                      }`}
                    >
                      <Building2 className="h-5 w-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Proveedores</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Proveedores recurrentes, NIF/CIF y condiciones de pago.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEntity('facturas')}
                    className={`relative flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'facturas'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                          entity === 'facturas' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                        }`}
                      >
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-[#0071E3]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3]">
                        Disponible en Fase 2
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Facturas históricas</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Ventas de ejercicios anteriores para análisis comparativo.
                    </p>
                  </button>
                </div>
              </div>

              {/* Informative Note for Historical Invoices */}
              {entity === 'facturas' && (
                <div className="flex items-start gap-3 rounded-2xl bg-[#FFF4E5] p-3.5 text-[13px] text-[#B25E09] border border-[#B25E09]/10">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="leading-relaxed">
                    <strong>Fase 2:</strong> La importación de facturas históricas se habilitará en la siguiente fase tras la persistencia completa del módulo de facturación en Supabase.
                  </p>
                </div>
              )}

              {/* Origin Selection */}
              <div>
                <label htmlFor="migration-source" className="block text-[13px] font-semibold text-[#1D1D1F] mb-1.5">
                  ¿De qué software provienen los datos?
                </label>
                <div className="relative">
                  <select
                    id="migration-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value as MigrationSource)}
                    className="w-full appearance-none rounded-xl bg-[#F5F5F7] px-4 py-3 text-[14px] font-medium text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    {SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[12px] text-[#6E6E73] mt-1.5">
                  El sistema autodecta cabeceras estándar en español e inglés y delimitadores punto y coma (;) o comas (,).
                </p>
              </div>
            </div>
          ) : currentStep === 2 ? (
            /* Step 2: Upload File */
            <div className="space-y-6">
              <div>
                <p className="text-[13px] font-semibold text-[#1D1D1F] mb-1">
                  Sube el archivo de exportación de {SOURCES.find((s) => s.id === source)?.name}
                </p>
                <p className="text-[12px] text-[#6E6E73]">
                  Formatos admitidos: archivos delimitados por comas o punto y coma (`.csv`) con codificación UTF-8.
                </p>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.04]'
                    : 'border-black/[0.1] bg-[#FBFBFD] hover:border-black/[0.2]'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3]/[0.08] text-[#0071E3]">
                  <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[14px] font-medium text-[#1D1D1F]">
                  Arrastra aquí tu archivo .csv
                </p>
                <p className="mt-0.5 text-[12px] text-[#6E6E73]">
                  o selecciona un archivo desde tu equipo
                </p>
                <label className="mt-3 cursor-pointer rounded-xl bg-white px-4 py-2 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.04] hover:bg-[#F5F5F7] transition-colors">
                  <span>Examinar equipo</span>
                  <input
                    type="file"
                    accept=".csv, text/csv"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Action shortcuts */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0071E3] hover:underline"
                >
                  <Download className="h-4 w-4" />
                  Descargar plantilla CSV para {entity}
                </button>

                {/* 1-Click Simulation Button */}
                <button
                  type="button"
                  onClick={handleSimulateSample}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3]/[0.09] px-4 py-2.5 text-[13px] font-medium text-[#0071E3] hover:bg-[#0077ED]/[0.18] transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  Simular archivo de ejemplo (1 clic)
                </button>
              </div>
            </div>
          ) : (
            /* Step 3: Column Mapping & Validation Review */
            <div className="space-y-6">
              {importError && (
                <div className="flex items-center gap-2 rounded-xl bg-[#FFF2F0] p-3 text-[13px] text-[#D93025] border border-[#D93025]/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Summary Stats Pill */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#F5F5F7] p-3.5 rounded-2xl">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#0071E3]" />
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">
                      Validación de estructura y NIFs
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6E6E73] mt-0.5">
                    Archivo analizado: <span className="font-mono text-[#1D1D1F]">{fileName}</span>
                  </p>
                </div>
                {csvResult && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8F8EE] px-2.5 py-1 text-[12px] font-semibold text-[#1D7A3F] tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {csvResult.summary.valid} válidos
                    </span>
                    {csvResult.summary.invalid > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF2F0] px-2.5 py-1 text-[12px] font-semibold text-[#D93025] tabular-nums">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {csvResult.summary.invalid} con error
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Errors Breakdown (if any) */}
              {csvResult && csvResult.invalidRows.length > 0 && (
                <div className="rounded-xl border border-[#D93025]/20 bg-[#FFF2F0] p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-[#D93025] font-semibold text-[13px]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      {csvResult.invalidRows.length} fila(s) omitida(s) por no cumplir la normativa fiscal:
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-[12px] text-[#B3261E]">
                    {csvResult.invalidRows.map((inv, idx) => (
                      <div key={idx} className="bg-white/80 px-2.5 py-1 rounded-lg">
                        <strong>Fila {inv.rowNumber}:</strong> {inv.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Column Mapping Table */}
              {csvResult && csvResult.detectedColumns.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-black/[0.05] bg-white">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="border-b border-black/[0.05] bg-[#FBFBFD] text-[11px] font-medium text-[#6E6E73]">
                        <th className="py-2.5 px-4">Columna detectada en origen</th>
                        <th className="py-2.5 px-4">Campo en SelfSME</th>
                        <th className="py-2.5 px-4 text-right">Coincidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {csvResult.detectedColumns.map((col, idx) => (
                        <tr key={idx} className="hover:bg-[#F5F5F7]/50 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-[12px] text-[#1D1D1F]">
                            {col.sourceCol}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-[#0071E3]">
                            {col.targetField}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-1.5 py-0.5 text-[11px] font-medium text-[#1D7A3F]">
                              {col.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Preview of rows to be imported */}
              <div>
                <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">
                  Vista previa de registros válidos a importar ({entity})
                </p>
                <div className="space-y-2">
                  {csvResult && csvResult.validRows.length === 0 ? (
                    <div className="p-4 text-center rounded-xl bg-[#F5F5F7] text-[13px] text-[#6E6E73]">
                      No se encontraron registros válidos en el archivo.
                    </div>
                  ) : (
                    csvResult?.validRows.slice(0, 5).map((row, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-[#1D1D1F] truncate">{row.name}</p>
                          <p className="text-[12px] text-[#6E6E73]">
                            <span className="font-mono font-medium text-[#1D1D1F]">{row.tax_id || 'Sin NIF'}</span>
                            {row.city ? ` · ${row.city}` : ''}
                            {row.email ? ` · ${row.email}` : ''}
                            <span className="tabular-nums"> · IVA {row.default_vat_rate}%</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-[12px] font-medium text-[#34C759]">
                          Válido
                        </span>
                      </div>
                    ))
                  )}

                  {csvResult && csvResult.validRows.length > 5 && (
                    <p className="text-center text-[12px] text-[#6E6E73] pt-1">
                      + {csvResult.validRows.length - 5} registros adicionales listos para procesar
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        {!isSuccess && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2)}
                disabled={isImporting}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F] transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F] transition-colors"
              >
                Cancelar
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                disabled={entity === 'facturas'}
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-5 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {entity === 'facturas' ? 'Fase 2 (Próximamente)' : 'Continuar'}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleSimulateSample}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-5 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
              >
                Procesar archivo
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                disabled={isImporting || !csvResult || csvResult.validRows.length === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-6 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Guardando en base de datos...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Confirmar importación ({csvResult?.validRows.length ?? 0})</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
