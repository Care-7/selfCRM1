import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowUpRight, CalendarClock, ChevronRight } from 'lucide-react';
import type {
  ActivityFilter,
  IssuedInvoice,
  NavSection,
  PeriodFilter,
  ReceivedInvoice,
  TaxRegime,
} from '../types';
import {
  calculateDashboardKPIs,
  calculateMonthlySeries,
  calculateTaxSummary,
  formatCompactCurrency,
  formatCurrency,
  formatDateES,
  formatDecimalES,
  getIssuedInvoiceTotals,
  matchesActivity,
} from '../utils/finance';
import { REFERENCE_DATE } from '../data/mockData';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge, VeriFactuBadge } from '../components/StatusBadge';

interface DashboardPageProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
  period: PeriodFilter;
  onChangePeriod: (period: PeriodFilter) => void;
  taxRegime: TaxRegime;
  onNavigate: (section: NavSection) => void;
  onSelectInvoice: (invoice: IssuedInvoice) => void;
  onNewInvoice: () => void;
}

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Año actual' },
];

const PERIOD_SUBTITLES: Record<PeriodFilter, string> = {
  month: 'Noviembre 2026',
  quarter: '4º Trimestre 2026',
  year: 'Ejercicio 2026',
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function RevenueChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl bg-white/95 backdrop-blur-md px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-black/[0.06] text-[12px]">
      <p className="font-semibold text-[#1D1D1F] mb-1.5">{label} 2026</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#6E6E73]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-[#1D1D1F]">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage({
  issuedInvoices,
  receivedInvoices,
  activityFilter,
  period,
  onChangePeriod,
  taxRegime,
  onNavigate,
  onSelectInvoice,
  onNewInvoice,
}: DashboardPageProps) {
  const kpis = useMemo(
    () =>
      calculateDashboardKPIs(
        issuedInvoices,
        receivedInvoices,
        activityFilter,
        period,
        REFERENCE_DATE
      ),
    [issuedInvoices, receivedInvoices, activityFilter, period]
  );

  const monthlySeries = useMemo(
    () => calculateMonthlySeries(issuedInvoices, receivedInvoices, activityFilter),
    [issuedInvoices, receivedInvoices, activityFilter]
  );

  const taxSummary = useMemo(
    () =>
      calculateTaxSummary(
        issuedInvoices,
        receivedInvoices,
        activityFilter,
        taxRegime,
        'T4'
      ),
    [issuedInvoices, receivedInvoices, activityFilter, taxRegime]
  );

  const recentInvoices = useMemo(
    () =>
      [...issuedInvoices]
        .filter((inv) => matchesActivity(inv.activity, activityFilter))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
        .slice(0, 5),
    [issuedInvoices, activityFilter]
  );

  const obligations = useMemo(() => {
    const items = [
      {
        id: 'mod-303',
        model: 'Modelo 303',
        title: 'Autoliquidación IVA',
        period: taxSummary.periodLabel,
        dueDate: taxSummary.dueDateLabel.replace('Vencimiento ', ''),
        amount: taxSummary.mod303.resultado,
        isPositive: taxSummary.mod303.resultado >= 0,
      },
    ];

    if (taxRegime === 'autonomo') {
      items.push({
        id: 'mod-130',
        model: 'Modelo 130',
        title: 'Pago fraccionado IRPF',
        period: taxSummary.periodLabel,
        dueDate: taxSummary.dueDateLabel.replace('Vencimiento ', ''),
        amount: taxSummary.mod130.resultado,
        isPositive: true,
      });
    }

    items.push({
      id: 'mod-111',
      model: 'Modelo 111',
      title: 'Retenciones practicadas',
      period: taxSummary.periodLabel,
      dueDate: taxSummary.dueDateLabel.replace('Vencimiento ', ''),
      amount: taxSummary.mod111.cuotaIngresar,
      isPositive: true,
    });

    return items;
  }, [taxSummary, taxRegime]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            {PERIOD_SUBTITLES[period]} · {activityFilter}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Resumen financiero
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={onChangePeriod}
            ariaLabel="Selector de periodo"
          />
          <button
            type="button"
            onClick={onNewInvoice}
            className="whitespace-nowrap shrink-0 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.22)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
          >
            + Nueva factura
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <section aria-label="Indicadores clave" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
          <p className="text-[13px] font-medium text-[#6E6E73]">Facturación neta</p>
          <p
            data-testid="kpi-net-revenue"
            className="mt-2.5 text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F] leading-none"
          >
            {formatCurrency(kpis.netRevenue)}
          </p>
          <p className="mt-3 text-[12px] text-[#1D7A3F] font-medium tabular-nums">
            +{formatDecimalES(kpis.revenueTrendPct, 1)}% frente al periodo anterior
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
          <p className="text-[13px] font-medium text-[#6E6E73]">Gastos deducibles</p>
          <p
            data-testid="kpi-expenses"
            className="mt-2.5 text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F] leading-none"
          >
            {formatCurrency(kpis.deductibleExpenses)}
          </p>
          <p className="mt-3 text-[12px] text-[#6E6E73]">
            Base imponible 100% deducible
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
          <p className="text-[13px] font-medium text-[#6E6E73]">Beneficio neto</p>
          <p
            data-testid="kpi-net-profit"
            className="mt-2.5 text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F] leading-none"
          >
            {formatCurrency(kpis.netProfit)}
          </p>
          <p className="mt-3 text-[12px] text-[#6E6E73] tabular-nums">
            Margen operativo del <span className="font-medium text-[#1D1D1F]">{formatDecimalES(kpis.profitMarginPct, 1)}%</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
          <p className="text-[13px] font-medium text-[#6E6E73]">Previsión impuestos</p>
          <p
            data-testid="kpi-tax-forecast"
            className="mt-2.5 text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F] leading-none"
          >
            {formatCurrency(kpis.taxForecastTotal)}
          </p>
          <p className="mt-3 text-[12px] text-[#6E6E73] tabular-nums">
            IVA {formatCompactCurrency(Math.max(0, kpis.ivaForecast))} · IRPF{' '}
            {formatCompactCurrency(kpis.irpfForecast)}
          </p>
        </div>
      </section>

      {/* Monthly Evolution Chart (Ingresos vs Gastos) */}
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
              Evolución mensual
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              Ingresos facturados frente a gastos deducibles (últimos 6 meses)
            </p>
          </div>
          <div className="flex items-center gap-5 text-[12px] font-medium text-[#6E6E73]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[#0071E3]" aria-hidden="true" />
              Ingresos
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[#D2D2D7]" aria-hidden="true" />
              Gastos
            </span>
          </div>
        </div>

        <div className="h-[268px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlySeries}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              barGap={8}
            >
              <CartesianGrid
                vertical={false}
                stroke="rgba(29,29,31,0.06)"
                strokeDasharray="0"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6E6E73', fontSize: 12 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#86868B', fontSize: 12 }}
                tickFormatter={(v) => `${v === 0 ? '0' : `${(v / 1000).toFixed(1)}k`}€`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0, 113, 227, 0.04)', radius: 8 }}
                content={<RevenueChartTooltip />}
              />
              <Bar
                dataKey="ingresos"
                name="Ingresos"
                fill="#0071E3"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="gastos"
                name="Gastos"
                fill="#D2D2D7"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Lower Two-Column Grid: Próximas obligaciones fiscales + Últimas facturas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Próximas obligaciones fiscales */}
        <section className="lg:col-span-5 rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                Próximas obligaciones fiscales
              </h2>
              <p className="text-[13px] text-[#6E6E73] mt-0.5">
                Previsión en tiempo real · AEAT
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('impuestos')}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0071E3] hover:text-[#0077ED] whitespace-nowrap"
            >
              Ver modelos
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-black/[0.05] flex-1">
            {obligations.map((ob) => (
              <div key={ob.id} className="flex items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#1D1D1F]">{ob.model}</span>
                    <span className="text-[12px] text-[#6E6E73]">· {ob.period}</span>
                  </div>
                  <p className="text-[13px] text-[#6E6E73] mt-0.5 truncate">{ob.title}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-[#86868B]">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    Hasta el {ob.dueDate}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-semibold tabular-nums text-[#1D1D1F]">
                    {formatCurrency(Math.abs(ob.amount))}
                  </p>
                  <div className="mt-1">
                    <StatusBadge
                      label={
                        ob.amount === 0
                          ? 'Sin cuota'
                          : ob.isPositive
                          ? 'A ingresar'
                          : 'A compensar'
                      }
                      tone={ob.amount === 0 || !ob.isPositive ? 'success' : 'warning'}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Últimas facturas */}
        <section className="lg:col-span-7 rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                Últimas facturas emitidas
              </h2>
              <p className="text-[13px] text-[#6E6E73] mt-0.5">
                Control de cobros y sellado VeriFactu
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('facturas')}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0071E3] hover:text-[#0077ED] whitespace-nowrap"
            >
              Ver todas
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-black/[0.05] flex-1">
            {recentInvoices.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#6E6E73]">
                No hay facturas emitidas para esta actividad todavía.
              </div>
            ) : (
              recentInvoices.map((inv) => {
                const totals = getIssuedInvoiceTotals(inv);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => onSelectInvoice(inv)}
                    className="group flex w-full items-center justify-between gap-4 py-3.5 first:pt-1 last:pb-1 text-left transition-colors hover:bg-[#F5F5F7]/60 -mx-2 px-2 rounded-xl"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-[#1D1D1F]">
                          {inv.number}
                        </span>
                        <VeriFactuBadge locked={inv.veriFactuLocked} compact />
                      </div>
                      <p className="truncate text-[13px] text-[#1D1D1F] mt-0.5">
                        {inv.clientName}
                      </p>
                      <p className="text-[12px] text-[#6E6E73]">
                        {formatDateES(inv.issueDate)} · {inv.activity}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-[14px] font-semibold tabular-nums text-[#1D1D1F]">
                          {formatCurrency(totals.total)}
                        </p>
                        <div className="mt-1">
                          <StatusBadge
                            label={inv.status}
                            tone={
                              inv.status === 'Cobrada'
                                ? 'success'
                                : inv.status === 'Pendiente'
                                ? 'warning'
                                : 'neutral'
                            }
                          />
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 text-[#C7C7CC] transition-transform group-hover:translate-x-0.5 group-hover:text-[#6E6E73]"
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
