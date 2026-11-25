import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
} from 'lucide-react';
import type {
  ActivityFilter,
  IssuedInvoice,
  QuarterOption,
  ReceivedInvoice,
  TaxRegime,
} from '../types';
import { calculateTaxSummary, formatCurrency, formatDecimalES } from '../utils/finance';
import { REFERENCE_DATE } from '../data/mockData';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { CashflowTaxForecastCard } from '../components/CashflowTaxForecastCard';
import { AeatBooksExportCard } from '../components/AeatBooksExportCard';
import {
  calculateModel303,
  calculateModel130,
  calculateModel111,
  calculateModel115,
  calculateModel390,
  downloadTaxModelDraftCsv,
  type FiscalQuarter,
  type TaxModelCasilla,
} from '../utils/aeatTaxModels';

interface TaxesPageProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
  regime: TaxRegime;
  onChangeRegime: (regime: TaxRegime) => void;
}

type ModelDraftTab = '303' | '130' | '111_115' | '390';

const REGIME_OPTIONS: { value: TaxRegime; label: string }[] = [
  { value: 'autonomo', label: 'Autónomo Trimestral' },
  { value: 'empresa', label: 'Empresa Mensual-Anual' },
];

const QUARTER_OPTIONS: { value: FiscalQuarter; label: string }[] = [
  { value: '1T', label: '1T' },
  { value: '2T', label: '2T' },
  { value: '3T', label: '3T' },
  { value: '4T', label: '4T' },
];

const MODEL_DRAFT_OPTIONS: { value: ModelDraftTab; label: string }[] = [
  { value: '303', label: 'Modelo 303 (IVA)' },
  { value: '130', label: 'Modelo 130 (IRPF)' },
  { value: '111_115', label: 'Modelos 111 / 115' },
  { value: '390', label: 'Modelo 390 (Anual)' },
];

export function TaxesPage({
  issuedInvoices,
  receivedInvoices,
  activityFilter,
  regime,
  onChangeRegime,
}: TaxesPageProps) {
  const [fiscalQuarter, setFiscalQuarter] = useState<FiscalQuarter>('4T');
  const [selectedModel, setSelectedModel] = useState<ModelDraftTab>('303');

  // Extract available years from invoices or fallback to reference date
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const refYear = new Date(REFERENCE_DATE).getFullYear();
    years.add(isNaN(refYear) ? 2026 : refYear);

    for (const inv of issuedInvoices) {
      if (inv.issueDate) {
        const y = parseInt(inv.issueDate.slice(0, 4), 10);
        if (!isNaN(y)) years.add(y);
      }
    }
    for (const rec of receivedInvoices) {
      const d = rec.accountingDate || rec.issueDate;
      if (d) {
        const y = parseInt(d.slice(0, 4), 10);
        if (!isNaN(y)) years.add(y);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [issuedInvoices, receivedInvoices]);

  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] ?? 2026);

  // High-level summary (for legacy cards & comparison)
  const legacyQuarter = (`T${fiscalQuarter.replace('T', '')}`) as QuarterOption;
  const summary = useMemo(
    () =>
      calculateTaxSummary(
        issuedInvoices,
        receivedInvoices,
        activityFilter,
        regime,
        legacyQuarter
      ),
    [issuedInvoices, receivedInvoices, activityFilter, regime, legacyQuarter]
  );

  const ivaToPay = summary.mod303.resultado >= 0;
  const generalToPay = summary.impuestoGeneral.cuotaDiferencial >= 0;

  // Official AEAT Model Calculations
  const legalForm = regime === 'empresa' ? 'sl' : 'autonomo';

  const mod303Result = useMemo(
    () =>
      calculateModel303({
        issuedInvoices,
        receivedInvoices,
        year: selectedYear,
        quarter: fiscalQuarter,
        activityFilter,
      }),
    [issuedInvoices, receivedInvoices, selectedYear, fiscalQuarter, activityFilter]
  );

  const mod130Result = useMemo(
    () =>
      calculateModel130({
        issuedInvoices,
        receivedInvoices,
        year: selectedYear,
        quarter: fiscalQuarter,
        activityFilter,
        legalForm,
      }),
    [issuedInvoices, receivedInvoices, selectedYear, fiscalQuarter, activityFilter, legalForm]
  );

  const mod115Result = useMemo(
    () =>
      calculateModel115({
        issuedInvoices,
        receivedInvoices,
        year: selectedYear,
        quarter: fiscalQuarter,
        activityFilter,
      }),
    [issuedInvoices, receivedInvoices, selectedYear, fiscalQuarter, activityFilter]
  );

  const mod111Result = useMemo(
    () =>
      calculateModel111({
        issuedInvoices,
        receivedInvoices,
        year: selectedYear,
        quarter: fiscalQuarter,
        activityFilter,
      }),
    [issuedInvoices, receivedInvoices, selectedYear, fiscalQuarter, activityFilter]
  );

  const mod390Result = useMemo(
    () =>
      calculateModel390({
        issuedInvoices,
        receivedInvoices,
        year: selectedYear,
        activityFilter,
      }),
    [issuedInvoices, receivedInvoices, selectedYear, activityFilter]
  );

  return (
    <div className="space-y-6">
      {/* Header + Regime & Period Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            Ejercicio {selectedYear} · {fiscalQuarter} · {activityFilter}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Impuestos y Modelos AEAT
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-1.5 bg-black/[0.045] rounded-xl p-1 text-[13px]">
            <label htmlFor="taxes-year-select" className="sr-only">
              Ejercicio Fiscal
            </label>
            <select
              id="taxes-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="Seleccionar ejercicio fiscal"
              className="bg-transparent font-medium text-[#1D1D1F] px-2.5 py-1 focus:outline-none cursor-pointer"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <SegmentedControl
            options={QUARTER_OPTIONS}
            value={fiscalQuarter}
            onChange={setFiscalQuarter}
            ariaLabel="Trimestre fiscal"
            size="sm"
          />

          <SegmentedControl
            options={REGIME_OPTIONS}
            value={regime}
            onChange={onChangeRegime}
            ariaLabel="Selector de régimen fiscal"
          />
        </div>
      </div>

      {/* Cashflow & Tax Reserve Forecast Card (Fase 4 Preserved) */}
      <CashflowTaxForecastCard
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        activityFilter={activityFilter}
        defaultQuarter={fiscalQuarter}
      />

      {/* Main Section: Borradores Oficiales de Modelos Tributarios AEAT */}
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-5 border-b border-black/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#0071E3]" aria-hidden="true" />
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                Borradores Oficiales de Modelos Tributarios (AEAT)
              </h2>
            </div>
            <p className="mt-1 text-[13px] text-[#6E6E73]">
              Casillas oficiales calculadas de forma determinista sobre facturas reales para presentación telemática o envío a gestoría.
            </p>
          </div>

          <div className="overflow-x-auto pb-1 md:pb-0">
            <SegmentedControl
              options={MODEL_DRAFT_OPTIONS}
              value={selectedModel}
              onChange={setSelectedModel}
              ariaLabel="Selector de modelo tributario"
            />
          </div>
        </div>

        {/* MODELO 303 */}
        {selectedModel === '303' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-black/[0.03]">
              <div>
                <span className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider">
                  Modelo 303 · Autoliquidación Trimestral de IVA
                </span>
                <p className="text-[14px] text-[#1D1D1F] font-medium mt-0.5">
                  Ejercicio {selectedYear} · Trimestre {fiscalQuarter}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge
                  label={mod303Result.status}
                  tone={mod303Result.resultadoLiquidacion > 0 ? 'warning' : 'success'}
                />
                <button
                  type="button"
                  onClick={() =>
                    downloadTaxModelDraftCsv(
                      '303',
                      selectedYear,
                      fiscalQuarter,
                      mod303Result.casillas
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Descargar Borrador Casillas (CSV)</span>
                </button>
              </div>
            </div>

            {/* Casillas Table */}
            <div className="rounded-xl border border-black/[0.05] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      <th className="py-2.5 px-3.5 w-24">Casilla</th>
                      <th className="py-2.5 px-3.5">Descripción Oficial AEAT</th>
                      <th className="py-2.5 px-3.5 text-right w-32">Base Imponible</th>
                      <th className="py-2.5 px-3.5 text-right w-24">Tipo %</th>
                      <th className="py-2.5 px-3.5 text-right w-32">Cuota / Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {mod303Result.casillas.map((c) => (
                      <tr key={c.code} className="hover:bg-black/[0.01] transition-colors">
                        <td className="py-2 px-3.5 font-mono font-semibold text-[#0071E3]">
                          {c.code}
                        </td>
                        <td className="py-2 px-3.5 text-[#1D1D1F]">{c.description}</td>
                        <td className="py-2 px-3.5 text-right tabular-nums text-[#6E6E73]">
                          {c.base != null ? formatCurrency(c.base) : '—'}
                        </td>
                        <td className="py-2 px-3.5 text-right tabular-nums text-[#6E6E73]">
                          {c.ratePct != null ? `${c.ratePct}%` : '—'}
                        </td>
                        <td className="py-2 px-3.5 text-right tabular-nums font-semibold text-[#1D1D1F]">
                          {formatCurrency(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                      <td colSpan={4} className="py-3 px-3.5 text-[14px]">
                        Resultado de la Autoliquidación (Casilla [71])
                      </td>
                      <td
                        className={`py-3 px-3.5 text-right tabular-nums text-[16px] ${
                          mod303Result.resultadoLiquidacion > 0 ? 'text-[#D70015]' : 'text-[#1D7A3F]'
                        }`}
                      >
                        {formatCurrency(mod303Result.resultadoLiquidacion)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODELO 130 */}
        {selectedModel === '130' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-black/[0.03]">
              <div>
                <span className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider">
                  Modelo 130 · IRPF Pago Fraccionado Autónomos
                </span>
                <p className="text-[14px] text-[#1D1D1F] font-medium mt-0.5">
                  Regla de acumulación anual YTD (desde 01/01 hasta fin de {fiscalQuarter})
                </p>
              </div>

              {mod130Result.isApplicable && (
                <div className="flex items-center gap-3">
                  <StatusBadge
                    label={mod130Result.status}
                    tone={mod130Result.totalIngresar > 0 ? 'warning' : 'success'}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      downloadTaxModelDraftCsv(
                        '130',
                        selectedYear,
                        fiscalQuarter,
                        mod130Result.casillas
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Descargar Borrador Casillas (CSV)</span>
                  </button>
                </div>
              )}
            </div>

            {!mod130Result.isApplicable ? (
              <div className="rounded-xl border border-black/[0.05] p-8 text-center bg-white space-y-3">
                <Info className="h-8 w-8 text-[#0071E3] mx-auto" aria-hidden="true" />
                <h3 className="text-[16px] font-semibold text-[#1D1D1F]">
                  Modelo 130 No Aplicable a Sociedades
                </h3>
                <p className="text-[13px] text-[#6E6E73] max-w-lg mx-auto">
                  {mod130Result.note ||
                    'En régimen de Sociedad Limitada (S.L.), los rendimientos tributan a través del Impuesto sobre Sociedades (Modelo 200 y pagos fraccionados Modelo 202).'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.05] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                        <th className="py-2.5 px-3.5 w-24">Casilla</th>
                        <th className="py-2.5 px-3.5">Concepto Oficial AEAT</th>
                        <th className="py-2.5 px-3.5 text-right w-40">Importe Acumulado (€)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.03]">
                      {mod130Result.casillas.map((c) => (
                        <tr key={c.code} className="hover:bg-black/[0.01] transition-colors">
                          <td className="py-2 px-3.5 font-mono font-semibold text-[#0071E3]">
                            {c.code}
                          </td>
                          <td className="py-2 px-3.5 text-[#1D1D1F]">{c.description}</td>
                          <td className="py-2 px-3.5 text-right tabular-nums font-semibold text-[#1D1D1F]">
                            {formatCurrency(c.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                        <td colSpan={2} className="py-3 px-3.5 text-[14px]">
                          Total Resultado a Ingresar (Casilla [07])
                        </td>
                        <td
                          className={`py-3 px-3.5 text-right tabular-nums text-[16px] ${
                            mod130Result.totalIngresar > 0 ? 'text-[#D70015]' : 'text-[#1D7A3F]'
                          }`}
                        >
                          {formatCurrency(mod130Result.totalIngresar)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODELOS 111 / 115 */}
        {selectedModel === '111_115' && (
          <div className="space-y-8">
            {/* Modelo 115: Alquileres */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-black/[0.03]">
                <div>
                  <span className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider">
                    Modelo 115 · Retenciones por Arrendamientos Urbanos
                  </span>
                  <p className="text-[14px] text-[#1D1D1F] font-medium mt-0.5">
                    Gastos en Cuenta PGC 621 (Inmuebles y sedes con retención IRPF)
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge
                    label={mod115Result.status}
                    tone={mod115Result.totalIngresar > 0 ? 'warning' : 'success'}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      downloadTaxModelDraftCsv(
                        '115',
                        selectedYear,
                        fiscalQuarter,
                        mod115Result.casillas
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Descargar Mod. 115 (CSV)</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-black/[0.05] overflow-hidden">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      <th className="py-2 px-3.5 w-24">Casilla</th>
                      <th className="py-2 px-3.5">Concepto Oficial AEAT</th>
                      <th className="py-2 px-3.5 text-right w-40">Importe (€) / Nº</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {mod115Result.casillas.map((c) => (
                      <tr key={c.code} className="hover:bg-black/[0.01]">
                        <td className="py-2 px-3.5 font-mono font-semibold text-[#0071E3]">
                          {c.code}
                        </td>
                        <td className="py-2 px-3.5 text-[#1D1D1F]">{c.description}</td>
                        <td className="py-2 px-3.5 text-right tabular-nums font-semibold text-[#1D1D1F]">
                          {c.code === '[01]' ? c.amount : formatCurrency(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                      <td colSpan={2} className="py-2.5 px-3.5 text-[14px]">
                        Total Retenciones a Ingresar Mod. 115 (Casilla [05])
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums text-[15px] text-[#D70015]">
                        {formatCurrency(mod115Result.totalIngresar)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Modelo 111: Profesionales */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-black/[0.03]">
                <div>
                  <span className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider">
                    Modelo 111 · Retenciones Rendimientos Actividades Económicas
                  </span>
                  <p className="text-[14px] text-[#1D1D1F] font-medium mt-0.5">
                    Servicios profesionales independientes (Cuenta PGC 623 y colaboradores)
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge
                    label={mod111Result.status}
                    tone={mod111Result.totalIngresar > 0 ? 'warning' : 'success'}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      downloadTaxModelDraftCsv(
                        '111',
                        selectedYear,
                        fiscalQuarter,
                        mod111Result.casillas
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Descargar Mod. 111 (CSV)</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-black/[0.05] overflow-hidden">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      <th className="py-2 px-3.5 w-24">Casilla</th>
                      <th className="py-2 px-3.5">Concepto Oficial AEAT</th>
                      <th className="py-2 px-3.5 text-right w-40">Importe (€) / Nº</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {mod111Result.casillas.map((c) => (
                      <tr key={c.code} className="hover:bg-black/[0.01]">
                        <td className="py-2 px-3.5 font-mono font-semibold text-[#0071E3]">
                          {c.code}
                        </td>
                        <td className="py-2 px-3.5 text-[#1D1D1F]">{c.description}</td>
                        <td className="py-2 px-3.5 text-right tabular-nums font-semibold text-[#1D1D1F]">
                          {c.code === '[07]' ? c.amount : formatCurrency(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                      <td colSpan={2} className="py-2.5 px-3.5 text-[14px]">
                        Total Retenciones a Ingresar Mod. 111 (Casilla [28])
                      </td>
                      <td className="py-2.5 px-3.5 text-right tabular-nums text-[15px] text-[#D70015]">
                        {formatCurrency(mod111Result.totalIngresar)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODELO 390 ANUAL */}
        {selectedModel === '390' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#F5F5F7] p-4 rounded-xl border border-black/[0.03]">
              <div>
                <span className="text-[12px] font-semibold text-[#0071E3] uppercase tracking-wider">
                  Modelo 390 · Declaración Resumen Anual del IVA
                </span>
                <p className="text-[14px] text-[#1D1D1F] font-medium mt-0.5">
                  Consolidación de todo el Ejercicio {selectedYear} (1T + 2T + 3T + 4T)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge
                  label={mod390Result.status}
                  tone={mod390Result.resultadoFinal > 0 ? 'warning' : 'success'}
                />
                <button
                  type="button"
                  onClick={() =>
                    downloadTaxModelDraftCsv(
                      '390',
                      selectedYear,
                      'ANUAL',
                      mod390Result.casillas
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Descargar Borrador Anual (CSV)</span>
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-xl border border-black/[0.05] bg-white">
                <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                  IVA Repercutido Anual [33]
                </p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(mod390Result.totalCuotaDevengada)}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-black/[0.05] bg-white">
                <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                  IVA Deducible Anual [64]
                </p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#1D7A3F]">
                  {formatCurrency(mod390Result.totalCuotaDeducible)}
                </p>
              </div>

              <div className="p-4 rounded-xl border border-black/[0.05] bg-white">
                <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                  Ingresos Realizados en 303 [84]
                </p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#0071E3]">
                  {formatCurrency(mod390Result.sumaIngresos303)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.05] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      <th className="py-2.5 px-3.5 w-24">Casilla</th>
                      <th className="py-2.5 px-3.5">Descripción Oficial Resumen Anual</th>
                      <th className="py-2.5 px-3.5 text-right w-32">Base Imponible</th>
                      <th className="py-2.5 px-3.5 text-right w-24">Tipo %</th>
                      <th className="py-2.5 px-3.5 text-right w-32">Cuota / Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {mod390Result.casillas.map((c) => (
                      <tr key={c.code} className="hover:bg-black/[0.01]">
                        <td className="py-2 px-3.5 font-mono font-semibold text-[#0071E3]">
                          {c.code}
                        </td>
                        <td className="py-2 px-3.5 text-[#1D1D1F]">{c.description}</td>
                        <td className="py-2 px-3.5 text-right tabular-nums text-[#6E6E73]">
                          {c.base != null ? formatCurrency(c.base) : '—'}
                        </td>
                        <td className="py-2 px-3.5 text-right tabular-nums text-[#6E6E73]">
                          {c.ratePct != null ? `${c.ratePct}%` : '—'}
                        </td>
                        <td className="py-2 px-3.5 text-right tabular-nums font-semibold text-[#1D1D1F]">
                          {formatCurrency(c.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                      <td colSpan={4} className="py-3 px-3.5 text-[14px]">
                        Resultado Final de la Declaración Anual (Casilla [86])
                      </td>
                      <td className="py-3 px-3.5 text-right tabular-nums text-[16px] text-[#1D1D1F]">
                        {formatCurrency(mod390Result.resultadoFinal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Main 3 Tax Model Cards (Overview) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 items-stretch">
        {/* Card 1: IVA (Mod. 303) */}
        <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[#0071E3]">Modelo 303</p>
                <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                  IVA · Autoliquidación
                </h2>
              </div>
              <StatusBadge
                label={ivaToPay ? 'A ingresar' : 'A compensar'}
                tone={ivaToPay ? 'warning' : 'success'}
              />
            </div>

            <div className="mt-6 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Base imponible repercutida</span>
                <span className="tabular-nums font-medium text-[#1D1D1F]">
                  {formatCurrency(summary.mod303.baseRepercutida)}
                </span>
              </div>
              <div className="flex justify-between text-[13px] pl-3">
                <span className="text-[#86868B]">Cuota IVA al 21%</span>
                <span className="tabular-nums text-[#6E6E73]">
                  {formatCurrency(summary.mod303.cuotaRepercutida21)}
                </span>
              </div>
              <div className="flex justify-between text-[13px] pl-3">
                <span className="text-[#86868B]">Cuota IVA al 10% (Arte)</span>
                <span className="tabular-nums text-[#6E6E73]">
                  {formatCurrency(summary.mod303.cuotaRepercutida10)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.04]">
                <span className="text-[#6E6E73]">Total cuota repercutida</span>
                <span className="tabular-nums font-semibold text-[#1D1D1F]">
                  {formatCurrency(summary.mod303.cuotaRepercutidaTotal)}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-[#6E6E73]">Base imponible soportada</span>
                <span className="tabular-nums font-medium text-[#1D1D1F]">
                  {formatCurrency(summary.mod303.baseSoportada)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Cuota IVA soportado deducible</span>
                <span className="tabular-nums font-semibold text-[#1D7A3F]">
                  − {formatCurrency(summary.mod303.cuotaSoportada)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-black/[0.06]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-[#6E6E73]">
                {ivaToPay ? 'Resultado a ingresar' : 'Saldo a compensar'}
              </span>
              <span
                data-testid="tax-mod303-result"
                className="text-[24px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]"
              >
                {formatCurrency(Math.abs(summary.mod303.resultado))}
              </span>
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#86868B]">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.dueDateLabel}
            </p>
          </div>
        </section>

        {/* Card 2: IRPF (Mod. 130 / Mod. 111) */}
        <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[#0071E3]">
                  {regime === 'autonomo' ? 'Modelo 130 y 111' : 'Modelo 111'}
                </p>
                <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                  IRPF · Pagos y retenciones
                </h2>
              </div>
              <StatusBadge
                label={
                  regime === 'autonomo'
                    ? summary.mod130.resultado > 0
                      ? 'A ingresar'
                      : 'Sin cuota'
                    : 'Retenciones'
                }
                tone={
                  regime === 'autonomo' && summary.mod130.resultado === 0
                    ? 'success'
                    : 'warning'
                }
              />
            </div>

            {regime === 'autonomo' ? (
              <div className="mt-6 space-y-3 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Ingresos computables ({fiscalQuarter})</span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {formatCurrency(summary.mod130.ingresosComputables)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Gastos deducibles ({fiscalQuarter})</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    − {formatCurrency(summary.mod130.gastosDeducibles)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-black/[0.04]">
                  <span className="text-[#6E6E73]">Rendimiento neto estimado</span>
                  <span className="tabular-nums font-semibold text-[#1D1D1F]">
                    {formatCurrency(summary.mod130.rendimientoNeto)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">20% pago fraccionado</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(summary.mod130.cuota20)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Retenciones ya soportadas</span>
                  <span className="tabular-nums font-medium text-[#1D7A3F]">
                    − {formatCurrency(summary.mod130.retencionesSoportadas)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-black/[0.04] text-[13px]">
                  <span className="text-[#6E6E73]">
                    Mod. 111 · Retenciones practicadas ({summary.mod111.perceptores} perc.)
                  </span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {formatCurrency(summary.mod111.cuotaIngresar)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-3 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Perceptores con retención</span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {summary.mod111.perceptores}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Base sujeta a retención</span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {formatCurrency(summary.mod111.baseRetenciones)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Retenciones practicadas (15%)</span>
                  <span className="tabular-nums font-semibold text-[#1D1D1F]">
                    {formatCurrency(summary.mod111.cuotaIngresar)}
                  </span>
                </div>
                <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#F5F5F7] p-3.5 text-[12px] text-[#6E6E73] leading-relaxed">
                  <Info className="h-4 w-4 shrink-0 text-[#0071E3] mt-0.5" aria-hidden="true" />
                  <span>
                    En régimen de Sociedad (S.L.) el Modelo 130 no aplica; los beneficios tributan mediante el Impuesto sobre Sociedades (Mod. 200/202).
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-black/[0.06]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-[#6E6E73]">
                {regime === 'autonomo' ? 'Total IRPF (130 + 111)' : 'Total Mod. 111 a ingresar'}
              </span>
              <span
                data-testid="tax-irpf-result"
                className="text-[24px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]"
              >
                {formatCurrency(
                  regime === 'autonomo'
                    ? summary.mod130.resultado + summary.mod111.cuotaIngresar
                    : summary.mod111.cuotaIngresar
                )}
              </span>
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#86868B]">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.dueDateLabel}
            </p>
          </div>
        </section>

        {/* Card 3: Impuesto General / Sociedades */}
        <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[#0071E3]">
                  {summary.impuestoGeneral.modelCode}
                </p>
                <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F] text-balance">
                  {summary.impuestoGeneral.modelName}
                </h2>
              </div>
              <StatusBadge
                label={generalToPay ? 'A ingresar' : 'A devolver'}
                tone={generalToPay ? 'warning' : 'success'}
              />
            </div>

            <div className="mt-6 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Base imponible anual acumulada</span>
                <span className="tabular-nums font-medium text-[#1D1D1F]">
                  {formatCurrency(summary.impuestoGeneral.baseImponibleAnual)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">
                  {regime === 'autonomo' ? 'Tipo medio efectivo estimado' : 'Tipo impositivo Pyme'}
                </span>
                <span className="tabular-nums font-medium text-[#1D1D1F]">
                  {formatDecimalES(summary.impuestoGeneral.tipoEfectivoPct, 1)}%
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.04]">
                <span className="text-[#6E6E73]">Cuota íntegra anual</span>
                <span className="tabular-nums font-semibold text-[#1D1D1F]">
                  {formatCurrency(summary.impuestoGeneral.cuotaIntegra)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">
                  {regime === 'autonomo'
                    ? 'Retenciones y pagos a cuenta'
                    : 'Pagos fraccionados (Mod. 202)'}
                </span>
                <span className="tabular-nums font-medium text-[#1D7A3F]">
                  − {formatCurrency(summary.impuestoGeneral.pagosACuenta)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-black/[0.06]">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-[#6E6E73]">
                {generalToPay ? 'Cuota diferencial estimada' : 'Previsión a devolver'}
              </span>
              <span
                data-testid="tax-general-result"
                className="text-[24px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]"
              >
                {formatCurrency(Math.abs(summary.impuestoGeneral.cuotaDiferencial))}
              </span>
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#86868B]">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {regime === 'autonomo'
                ? 'Campaña Renta · Abril – Junio 2027'
                : 'Presentación anual · 25 de julio de 2027'}
            </p>
          </div>
        </section>
      </div>

      {/* AEAT Official Books Export Card (Fase 4 Preserved) */}
      <AeatBooksExportCard
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        activityFilter={activityFilter}
      />

      {/* Fiscal Calendar Summary Surface */}
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#1D1D1F]">
            Calendario de presentación AEAT ({regime === 'autonomo' ? 'Autónomo' : 'Sociedad'})
          </h2>
          <span className="text-[12px] text-[#6E6E73]">
            Los cálculos se actualizan automáticamente al emitir o contabilizar facturas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.05]">
          <div className="py-3 sm:py-1 sm:pr-6">
            <p className="text-[12px] font-medium text-[#6E6E73]">Liquidación IVA</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1D1D1F]">
              {regime === 'autonomo' ? 'Modelo 303 + Resumen 390' : 'Modelo 303 Mensual + 390'}
            </p>
            <p className="mt-0.5 text-[12px] text-[#86868B]">{summary.dueDateLabel}</p>
          </div>

          <div className="py-3 sm:py-1 sm:px-6">
            <p className="text-[12px] font-medium text-[#6E6E73]">Retenciones e IRPF</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1D1D1F]">
              {regime === 'autonomo' ? 'Modelos 130, 111 y 190' : 'Modelos 111 y 190'}
            </p>
            <p className="mt-0.5 text-[12px] text-[#86868B]">
              {regime === 'autonomo' ? 'Hasta el 30 de enero de 2027' : 'Hasta el 20 de diciembre de 2026'}
            </p>
          </div>

          <div className="py-3 sm:py-1 sm:pl-6">
            <p className="text-[12px] font-medium text-[#6E6E73]">Impuesto anual</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1D1D1F]">
              {summary.impuestoGeneral.modelCode} · {summary.impuestoGeneral.modelName}
            </p>
            <p className="mt-0.5 text-[12px] text-[#86868B]">
              {regime === 'autonomo' ? 'Ejercicio 2026 · Estimación Directa' : 'Ejercicio 2026 · Tipo Pyme 23%'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
