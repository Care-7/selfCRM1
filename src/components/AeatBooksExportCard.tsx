import { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Filter,
  ShieldCheck,
  FileCheck2,
} from 'lucide-react';
import type { ActivityFilter, IssuedInvoice, ReceivedInvoice } from '../types';
import type { BusinessActivity } from '../types/database';
import {
  downloadIssuedBookCsv,
  downloadReceivedBookCsv,
  getQuarterFromIsoDate,
  type AeatExportPeriod,
} from '../services/aeatBooksExportService';
import { useTenant } from '../context/TenantContext';

interface AeatBooksExportCardProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter?: ActivityFilter;
  activities?: BusinessActivity[];
  defaultYear?: number;
}

const PERIOD_OPTIONS: { value: AeatExportPeriod; label: string }[] = [
  { value: 'ALL', label: 'Todo el año' },
  { value: '1T', label: '1T' },
  { value: '2T', label: '2T' },
  { value: '3T', label: '3T' },
  { value: '4T', label: '4T' },
];

export function AeatBooksExportCard({
  issuedInvoices,
  receivedInvoices,
  activityFilter = 'Todas las actividades',
  activities: propsActivities,
  defaultYear = 2026,
}: AeatBooksExportCardProps) {
  const { activities: contextActivities } = useTenant();
  const activities = propsActivities || contextActivities || [];

  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedPeriod, setSelectedPeriod] = useState<AeatExportPeriod>('ALL');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const matchedActivity = activities.find(
    (act) => act.id === activityFilter || act.name === activityFilter
  );
  const activityId = matchedActivity?.id || (activityFilter === 'Todas las actividades' ? undefined : activityFilter);

  // Compute live counts
  const filteredIssuedCount = useMemo(() => {
    return issuedInvoices.filter((inv) => {
      if (inv.documentType === 'proforma' || inv.documentType === 'albaran') return false;
      if (inv.documentType !== 'normal' && inv.documentType !== 'rectificativa') return false;

      const invYear = parseInt((inv.issueDate || '').slice(0, 4), 10);
      if (invYear !== selectedYear) return false;

      if (selectedPeriod !== 'ALL') {
        if (getQuarterFromIsoDate(inv.issueDate) !== selectedPeriod) return false;
      }

      if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
        if (inv.activityId && inv.activityId !== activityId && inv.activity !== activityId) return false;
        if (!inv.activityId && inv.activity !== activityId) return false;
      }

      return true;
    }).length;
  }, [issuedInvoices, selectedYear, selectedPeriod, activityId]);

  const filteredReceivedCount = useMemo(() => {
    return receivedInvoices.filter((exp) => {
      const fiscalDate = exp.accountingDate || exp.issueDate || '';
      const expYear = parseInt(fiscalDate.slice(0, 4), 10);
      if (expYear !== selectedYear) return false;

      if (selectedPeriod !== 'ALL') {
        if (getQuarterFromIsoDate(fiscalDate) !== selectedPeriod) return false;
      }

      if (activityId && activityId !== 'all' && activityId !== 'Todas las actividades') {
        if (exp.activityId && exp.activityId !== activityId && exp.activity !== activityId) return false;
        if (!exp.activityId && exp.activity !== activityId) return false;
      }

      return true;
    }).length;
  }, [receivedInvoices, selectedYear, selectedPeriod, activityId]);

  const handleDownloadIssued = () => {
    const result = downloadIssuedBookCsv(issuedInvoices, {
      year: selectedYear,
      period: selectedPeriod,
      activityId,
      activities,
    });
    if (result.success) {
      setDownloadSuccess(`Libro de Facturas Expedidas (${result.fileName}) descargado.`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    }
  };

  const handleDownloadReceived = () => {
    const result = downloadReceivedBookCsv(receivedInvoices, {
      year: selectedYear,
      period: selectedPeriod,
      activityId,
      activities,
    });
    if (result.success) {
      setDownloadSuccess(`Libro de Facturas Recibidas (${result.fileName}) descargado.`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    }
  };

  return (
    <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1D7A3F]/10 text-[#1D7A3F]">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D1D1F]">
              Libros Registro Oficiales de la AEAT
            </h3>
            <p className="text-[12px] text-[#6E6E73]">
              Formato unificado CSV/Excel para inspección tributaria y modelos fiscales (RD 1619/2012)
            </p>
          </div>
        </div>

        {/* Year & Period selector */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-black/[0.06] bg-[#F5F5F7] px-2.5 py-1.5 text-[12px] font-medium text-[#1D1D1F] focus:outline-none focus:border-[#0071E3]"
            aria-label="Seleccionar ejercicio fiscal"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>

          <div className="inline-flex rounded-xl bg-[#F5F5F7] p-0.5 border border-black/[0.04]">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setSelectedPeriod(p.value)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedPeriod === p.value
                    ? 'bg-white text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {downloadSuccess && (
        <div
          role="status"
          className="rounded-xl bg-[#E8F8EE] px-4 py-2.5 text-[12px] font-medium text-[#1D7A3F] flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* Export Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 1. Libro Facturas Expedidas */}
        <div className="rounded-xl border border-black/[0.04] bg-[#FAFAFC] p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1D1D1F]">
                Libro Facturas Expedidas
              </span>
              <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-2 py-0.5 text-[11px] font-semibold text-[#1D7A3F] tabular-nums">
                {filteredIssuedCount} {filteredIssuedCount === 1 ? 'factura' : 'facturas'}
              </span>
            </div>
            <p className="text-[12px] text-[#6E6E73] leading-relaxed">
              Incluye facturas ordinarias y rectificativas con trazabilidad VeriFactu y desglose de IVA/IRPF. Excluye estrictamente proformas y albaranes.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadIssued}
            disabled={filteredIssuedCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.2)] hover:bg-[#0077ED] transition-colors disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Descargar Libro Expedidas (CSV)
          </button>
        </div>

        {/* 2. Libro Facturas Recibidas */}
        <div className="rounded-xl border border-black/[0.04] bg-[#FAFAFC] p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1D1D1F]">
                Libro Facturas Recibidas (Gastos)
              </span>
              <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-2 py-0.5 text-[11px] font-semibold text-[#1D7A3F] tabular-nums">
                {filteredReceivedCount} {filteredReceivedCount === 1 ? 'gasto' : 'gastos'}
              </span>
            </div>
            <p className="text-[12px] text-[#6E6E73] leading-relaxed">
              Filtrado por fecha de registro contable con cuenta PGC, porcentaje de deducibilidad en IVA/IRPF y retenciones soportadas.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadReceived}
            disabled={filteredReceivedCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-black/[0.08] px-4 py-2 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-black/[0.03] transition-colors disabled:opacity-40"
          >
            <Download className="h-4 w-4 text-[#0071E3]" />
            Descargar Libro Recibidas (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}
