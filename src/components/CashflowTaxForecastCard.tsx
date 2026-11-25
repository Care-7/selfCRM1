import { useMemo, useState } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Calendar,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  Wallet,
  Building2,
  User,
  Info,
} from 'lucide-react';
import type { ActivityFilter, IssuedInvoice, ReceivedInvoice } from '../types';
import { formatCurrency } from '../utils/finance';
import {
  calculateCashflowTaxForecast,
  type FiscalQuarter,
} from '../utils/cashflowForecast';
import { useTenant } from '../context/TenantContext';

interface CashflowTaxForecastCardProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter?: ActivityFilter;
  defaultYear?: number;
  defaultQuarter?: FiscalQuarter;
  compact?: boolean;
}

const QUARTERS: { value: FiscalQuarter; label: string }[] = [
  { value: '1T', label: '1T (Ene-Mar)' },
  { value: '2T', label: '2T (Abr-Jun)' },
  { value: '3T', label: '3T (Jul-Sep)' },
  { value: '4T', label: '4T (Oct-Dic)' },
];

export function CashflowTaxForecastCard({
  issuedInvoices,
  receivedInvoices,
  activityFilter = 'Todas las actividades',
  defaultYear = 2026,
  defaultQuarter = '4T',
  compact = false,
}: CashflowTaxForecastCardProps) {
  const { organization, activities } = useTenant();
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [selectedQuarter, setSelectedQuarter] = useState<FiscalQuarter>(defaultQuarter);

  const matchedActivity = activities.find(
    (act) => act.id === activityFilter || act.name === activityFilter
  );
  const activityId = matchedActivity?.id || (activityFilter === 'Todas las actividades' ? undefined : activityFilter);

  const legalForm = organization?.legal_form || 'autonomo';

  const forecast = useMemo(() => {
    return calculateCashflowTaxForecast({
      issuedInvoices,
      receivedInvoices,
      year: selectedYear,
      quarter: selectedQuarter,
      legalForm,
      activityId,
    });
  }, [issuedInvoices, receivedInvoices, selectedYear, selectedQuarter, legalForm, activityId]);

  const isNetPositive = forecast.netFreeCashflow >= 0;

  return (
    <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-5">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D1D1F]">
              Previsión de Tesorería & Reserva Fiscal
            </h3>
            <p className="text-[12px] text-[#6E6E73] flex items-center gap-1.5">
              <span>Régimen:</span>
              <span className="font-medium text-[#1D1D1F] inline-flex items-center gap-1">
                {legalForm === 'sl' ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-[#0071E3]" />
                    Sociedad (SL)
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-[#0071E3]" />
                    Autónomo (IRPF Mod. 130)
                  </>
                )}
              </span>
            </p>
          </div>
        </div>

        {/* Quarter & Year Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-black/[0.06] bg-[#F5F5F7] px-2.5 py-1.5 text-[12px] font-medium text-[#1D1D1F] focus:outline-none focus:border-[#0071E3]"
            aria-label="Seleccionar ejercicio"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>

          <div className="inline-flex rounded-xl bg-[#F5F5F7] p-0.5 border border-black/[0.04]">
            {QUARTERS.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => setSelectedQuarter(q.value)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedQuarter === q.value
                    ? 'bg-white text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                {q.value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main KPI: Liquidez Neta Real tras Impuestos */}
      <div className="rounded-xl bg-gradient-to-br from-[#F5F5F7]/80 to-[#F5F5F7]/30 p-4 border border-black/[0.03]">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <span className="text-[12px] font-medium text-[#6E6E73]">
              Liquidez Neta Libre tras Impuestos ({selectedQuarter} {selectedYear})
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-[26px] font-bold tracking-tight tabular-nums ${
                  isNetPositive ? 'text-[#1D1D1F]' : 'text-[#D32F2F]'
                }`}
              >
                {formatCurrency(forecast.netFreeCashflow)}
              </span>
              <span className="text-[11px] text-[#6E6E73]">
                (Tesorería esperada − Reserva Hacienda)
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-black/[0.04]">
            <Calendar className="h-3.5 w-3.5 text-[#0071E3]" />
            <span className="text-[11px] font-medium text-[#1D1D1F]">
              Límite AEAT: <strong className="text-[#0071E3]">{forecast.taxDeadline}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns (Tesorería Operativa vs Reserva Fiscal) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Tesorería Operativa */}
        <div className="rounded-xl border border-black/[0.04] bg-[#FAFAFC] p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-black/[0.04] pb-2">
            <span className="text-[12px] font-semibold text-[#1D1D1F]">
              Tesorería Operativa del Periodo
            </span>
            <span className="text-[11px] text-[#6E6E73] font-medium">Cobros & Pagos</span>
          </div>

          {/* Cobros */}
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between items-center text-[#1D1D1F]">
              <span className="flex items-center gap-1.5 text-[#1D7A3F] font-medium">
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                Cobros realizados
              </span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(forecast.collectedIncome)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[#6E6E73] pl-5">
              <span>Cobros pendientes</span>
              <span className="tabular-nums font-medium text-[#1D1D1F]">
                {formatCurrency(forecast.pendingReceivables)}
              </span>
            </div>
            {forecast.overdueReceivables > 0 && (
              <div className="flex justify-between items-center text-[#B25E09] pl-5 font-medium">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Cobros vencidos
                </span>
                <span className="tabular-nums">
                  {formatCurrency(forecast.overdueReceivables)}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-black/[0.04] pt-2" />

          {/* Pagos */}
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between items-center text-[#1D1D1F]">
              <span className="flex items-center gap-1.5 text-[#D32F2F] font-medium">
                <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
                Pagos efectuados
              </span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(forecast.paidExpenses)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[#6E6E73] pl-5">
              <span>Pagos pendientes</span>
              <span className="tabular-nums font-medium text-[#1D1D1F]">
                {formatCurrency(forecast.pendingPayables)}
              </span>
            </div>
            {forecast.overduePayables > 0 && (
              <div className="flex justify-between items-center text-[#D32F2F] pl-5 font-medium">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Pagos vencidos
                </span>
                <span className="tabular-nums">
                  {formatCurrency(forecast.overduePayables)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Reserva Fiscal Estimada (AEAT) */}
        <div className="rounded-xl border border-[#0071E3]/20 bg-[#F4F9FF]/60 p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-[#0071E3]/10 pb-2">
            <span className="text-[12px] font-semibold text-[#0071E3] flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              Reserva Fiscal Recomendada
            </span>
            <span className="text-[13px] font-bold text-[#0071E3] tabular-nums">
              {formatCurrency(forecast.recommendedTaxReserve)}
            </span>
          </div>

          <div className="space-y-2 text-[12px]">
            {/* IVA (Mod. 303) */}
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium text-[#1D1D1F]">IVA Trimestral (Mod. 303)</span>
                <span className="block text-[10px] text-[#6E6E73]">
                  Repercutido ({formatCurrency(forecast.vatCollected)}) − Soportado Ded. (
                  {formatCurrency(forecast.vatDeductible)})
                </span>
              </div>
              <span
                className={`font-semibold tabular-nums ${
                  forecast.vatBalance > 0 ? 'text-[#B25E09]' : 'text-[#1D7A3F]'
                }`}
              >
                {forecast.vatBalance > 0 ? formatCurrency(forecast.vatBalance) : '0,00 € (A compensar)'}
              </span>
            </div>

            {/* IRPF (Mod. 130) */}
            <div className="flex justify-between items-center border-t border-black/[0.03] pt-1.5">
              <div>
                <span className="font-medium text-[#1D1D1F]">
                  {legalForm === 'sl' ? 'Impuesto de Sociedades' : 'Pago Fraccionado IRPF (Mod. 130)'}
                </span>
                <span className="block text-[10px] text-[#6E6E73]">
                  {legalForm === 'sl'
                    ? 'Tributación anual IS (Mod. 200/202)'
                    : `20% s/ bfo neto (${formatCurrency(forecast.netOperatingProfit)}) − Retenciones (${formatCurrency(
                        forecast.withholdingsCollected
                      )})`}
                </span>
              </div>
              <span className="font-semibold tabular-nums text-[#1D1D1F]">
                {formatCurrency(forecast.irpfProvision)}
              </span>
            </div>

            {/* Retenciones recibidas (Mod. 111 / 115) */}
            <div className="flex justify-between items-center border-t border-black/[0.03] pt-1.5">
              <div>
                <span className="font-medium text-[#1D1D1F]">Retenciones Practicadas (Mod. 111/115)</span>
                <span className="block text-[10px] text-[#6E6E73]">
                  IRPF retenido en facturas de proveedores/alquiler
                </span>
              </div>
              <span className="font-semibold tabular-nums text-[#1D1D1F]">
                {formatCurrency(forecast.withholdingsPayable)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
