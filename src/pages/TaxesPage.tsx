import { useMemo, useState } from 'react';
import { CalendarClock, Info } from 'lucide-react';
import type {
  ActivityFilter,
  IssuedInvoice,
  QuarterOption,
  ReceivedInvoice,
  TaxRegime,
} from '../types';
import { calculateTaxSummary, formatCurrency, formatDecimalES } from '../utils/finance';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { CashflowTaxForecastCard } from '../components/CashflowTaxForecastCard';
import { AeatBooksExportCard } from '../components/AeatBooksExportCard';

interface TaxesPageProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
  regime: TaxRegime;
  onChangeRegime: (regime: TaxRegime) => void;
}

const REGIME_OPTIONS: { value: TaxRegime; label: string }[] = [
  { value: 'autonomo', label: 'Autónomo Trimestral' },
  { value: 'empresa', label: 'Empresa Mensual-Anual' },
];

const QUARTER_OPTIONS: { value: QuarterOption; label: string }[] = [
  { value: 'T1', label: '1T' },
  { value: 'T2', label: '2T' },
  { value: 'T3', label: '3T' },
  { value: 'T4', label: '4T' },
];

export function TaxesPage({
  issuedInvoices,
  receivedInvoices,
  activityFilter,
  regime,
  onChangeRegime,
}: TaxesPageProps) {
  const [quarter, setQuarter] = useState<QuarterOption>('T4');

  const summary = useMemo(
    () =>
      calculateTaxSummary(
        issuedInvoices,
        receivedInvoices,
        activityFilter,
        regime,
        quarter
      ),
    [issuedInvoices, receivedInvoices, activityFilter, regime, quarter]
  );

  const ivaToPay = summary.mod303.resultado >= 0;
  const generalToPay = summary.impuestoGeneral.cuotaDiferencial >= 0;

  return (
    <div className="space-y-6">
      {/* Header + Regime Segmented Control */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            {summary.periodLabel} · {activityFilter}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Impuestos y previsión AEAT
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {regime === 'autonomo' && (
            <SegmentedControl
              options={QUARTER_OPTIONS}
              value={quarter}
              onChange={setQuarter}
              ariaLabel="Trimestre fiscal"
              size="sm"
            />
          )}
          <SegmentedControl
            options={REGIME_OPTIONS}
            value={regime}
            onChange={onChangeRegime}
            ariaLabel="Selector de régimen fiscal"
          />
        </div>
      </div>

      {/* Cashflow & Tax Reserve Forecast Card */}
      <CashflowTaxForecastCard
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        activityFilter={activityFilter}
        defaultQuarter={(quarter.replace('T', '') + 'T') as any}
      />

      {/* Main 3 Tax Model Cards */}
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
                  <span className="text-[#6E6E73]">Ingresos computables ({quarter})</span>
                  <span className="tabular-nums font-medium text-[#1D1D1F]">
                    {formatCurrency(summary.mod130.ingresosComputables)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6E6E73]">Gastos deducibles ({quarter})</span>
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

      {/* AEAT Official Books Export Card */}
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
