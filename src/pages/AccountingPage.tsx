import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  Search,
  TrendingUp,
} from 'lucide-react';
import type { ActivityFilter, Contact, IssuedInvoice, ReceivedInvoice } from '../types';
import {
  downloadGeneralLedgerCsv,
  downloadJournalCsv,
  generateAccountingSnapshot,
  generateGeneralLedger,
  type PgcAccountingPeriod,
} from '../utils/pgcAccounting';
import { formatCurrency, formatDateES } from '../utils/finance';
import { REFERENCE_DATE } from '../data/mockData';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';

export type AccountingSubView = 'balance' | 'pyg' | 'trial' | 'mayor' | 'diario' | 'ratios';

interface AccountingPageProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
  clients?: Contact[];
  suppliers?: Contact[];
  initialSubView?: AccountingSubView;
  initialAccountFilter?: string;
  initialSearchFilter?: string;
}

const SUBVIEW_OPTIONS: { value: AccountingSubView; label: string }[] = [
  { value: 'balance', label: 'Balance de Situación' },
  { value: 'pyg', label: 'Pérdidas y Ganancias' },
  { value: 'trial', label: 'Sumas y Saldos' },
  { value: 'mayor', label: 'Libro Mayor' },
  { value: 'diario', label: 'Libro Diario' },
  { value: 'ratios', label: 'Ratios' },
];

const PERIOD_OPTIONS: { value: PgcAccountingPeriod; label: string }[] = [
  { value: 'ALL', label: 'Año Completo' },
  { value: '1T', label: '1T' },
  { value: '2T', label: '2T' },
  { value: '3T', label: '3T' },
  { value: '4T', label: '4T' },
];

export function AccountingPage({
  issuedInvoices,
  receivedInvoices,
  activityFilter,
  clients,
  suppliers,
  initialSubView,
  initialAccountFilter,
  initialSearchFilter,
}: AccountingPageProps) {
  // Query param check if props not provided
  const queryTab =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('tab') as AccountingSubView | null)
      : null;
  const queryAccount =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('account') || undefined
      : undefined;

  const [subView, setSubView] = useState<AccountingSubView>(
    () => initialSubView || queryTab || 'balance'
  );
  const [journalSearch, setJournalSearch] = useState('');
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState<string>(
    () => initialAccountFilter || queryAccount || ''
  );
  const [ledgerSearch, setLedgerSearch] = useState<string>(
    () => initialSearchFilter || ''
  );
  const [selectedAccountCodeState, setSelectedAccountCodeState] = useState<string>('');

  useEffect(() => {
    if (initialSubView) {
      setSubView(initialSubView);
    }
  }, [initialSubView]);

  useEffect(() => {
    if (initialAccountFilter !== undefined) {
      setLedgerAccountFilter(initialAccountFilter);
      setSelectedAccountCodeState(initialAccountFilter);
    }
  }, [initialAccountFilter]);

  useEffect(() => {
    if (initialSearchFilter !== undefined) {
      setLedgerSearch(initialSearchFilter);
    }
  }, [initialSearchFilter]);

  // Extract available years from real invoices or fallback to reference date
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
  const [selectedPeriod, setSelectedPeriod] = useState<PgcAccountingPeriod>('ALL');

  // Compute deterministic PGC snapshot
  const snapshot = useMemo(() => {
    return generateAccountingSnapshot({
      issuedInvoices,
      receivedInvoices,
      year: selectedYear,
      period: selectedPeriod,
      activityFilter,
      clients,
      suppliers,
    });
  }, [issuedInvoices, receivedInvoices, selectedYear, selectedPeriod, activityFilter, clients, suppliers]);

  // Generate full General Ledger (Libro Mayor)
  const generalLedger = useMemo(() => {
    return generateGeneralLedger(snapshot);
  }, [snapshot]);

  // Determine active account in Libro Mayor
  const currentAccountCode = useMemo(() => {
    if (selectedAccountCodeState && generalLedger.accountMap[selectedAccountCodeState]) {
      return selectedAccountCodeState;
    }
    if (ledgerAccountFilter) {
      const direct = generalLedger.accounts.find(
        (a) => a.accountCode.toLowerCase() === ledgerAccountFilter.toLowerCase()
      );
      if (direct) return direct.accountCode;
      const prefix = generalLedger.accounts.find(
        (a) => a.accountCode.toLowerCase().startsWith(ledgerAccountFilter.toLowerCase())
      );
      if (prefix) return prefix.accountCode;
    }
    if (ledgerSearch) {
      const match = generalLedger.accounts.find(
        (a) =>
          a.accountCode.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
          a.accountName.toLowerCase().includes(ledgerSearch.toLowerCase())
      );
      if (match) return match.accountCode;
    }
    return generalLedger.accounts[0]?.accountCode || '';
  }, [selectedAccountCodeState, ledgerAccountFilter, ledgerSearch, generalLedger]);

  const currentLedgerAccount = generalLedger.accountMap[currentAccountCode];

  const filteredLedgerMovements = useMemo(() => {
    if (!currentLedgerAccount) return [];
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return currentLedgerAccount.movements;
    return currentLedgerAccount.movements.filter(
      (m) =>
        m.concept.toLowerCase().includes(q) ||
        m.documentNumber.toLowerCase().includes(q) ||
        String(m.entryNumber).includes(q)
    );
  }, [currentLedgerAccount, ledgerSearch]);

  // Filter journal entries for search
  const filteredJournalEntries = useMemo(() => {
    const q = journalSearch.trim().toLowerCase();
    if (!q) return snapshot.journalEntries;
    return snapshot.journalEntries.filter(
      (entry) =>
        entry.concept.toLowerCase().includes(q) ||
        entry.documentNumber.toLowerCase().includes(q) ||
        entry.lines.some(
          (l) => l.accountCode.includes(q) || l.accountName.toLowerCase().includes(q)
        )
    );
  }, [snapshot.journalEntries, journalSearch]);

  const ratiosCards = useMemo(() => {
    const { liquidezGeneral, margenNetoPct, periodoMedioCobroDias, periodoMedioPagoDias, endeudamientoPct } =
      snapshot.financialRatios;

    return [
      {
        id: 'liquidez',
        name: 'Ratio de Liquidez General',
        valueFormatted: `${liquidezGeneral.toFixed(2)}x`,
        benchmark: 'Recomendado > 1,50x',
        health: liquidezGeneral >= 1.5 ? ('Óptimo' as const) : liquidezGeneral >= 1.0 ? ('Estable' as const) : ('Atención' as const),
        tone: (liquidezGeneral >= 1.5 ? 'success' : liquidezGeneral >= 1.0 ? 'warning' : 'error') as 'success' | 'warning' | 'error',
        explanation: 'Capacidad de cubrir deudas y obligaciones inmediatas con tesorería y saldos a cobrar de clientes.',
      },
      {
        id: 'margen',
        name: 'Margen Neto de Explotación',
        valueFormatted: `${margenNetoPct.toFixed(1)}%`,
        benchmark: 'Recomendado > 15%',
        health: margenNetoPct >= 15 ? ('Óptimo' as const) : margenNetoPct >= 5 ? ('Estable' as const) : ('Atención' as const),
        tone: (margenNetoPct >= 15 ? 'success' : margenNetoPct >= 5 ? 'warning' : 'error') as 'success' | 'warning' | 'error',
        explanation: 'Porcentaje de beneficio neto operativo obtenido por cada euro de ingresos antes de impuestos personales.',
      },
      {
        id: 'pmc',
        name: 'Periodo Medio de Cobro (PMC)',
        valueFormatted: `${Math.round(periodoMedioCobroDias)} días`,
        benchmark: 'Recomendado < 60 días',
        health: periodoMedioCobroDias <= 45 ? ('Óptimo' as const) : periodoMedioCobroDias <= 60 ? ('Estable' as const) : ('Atención' as const),
        tone: (periodoMedioCobroDias <= 45 ? 'success' : periodoMedioCobroDias <= 60 ? 'warning' : 'error') as 'success' | 'warning' | 'error',
        explanation: 'Plazo medio estimado en días desde la emisión de facturas hasta el ingreso efectivo en tesorería.',
      },
      {
        id: 'pmp',
        name: 'Periodo Medio de Pago (PMP)',
        valueFormatted: `${Math.round(periodoMedioPagoDias)} días`,
        benchmark: 'Ley 3/2004 < 60 días',
        health: periodoMedioPagoDias <= 60 ? ('Óptimo' as const) : ('Atención' as const),
        tone: (periodoMedioPagoDias <= 60 ? 'success' : 'error') as 'success' | 'warning' | 'error',
        explanation: 'Plazo medio de liquidación de facturas a proveedores, cumpliendo la normativa de morosidad comercial.',
      },
      {
        id: 'endeudamiento',
        name: 'Ratio de Endeudamiento',
        valueFormatted: `${endeudamientoPct.toFixed(1)}%`,
        benchmark: 'Recomendado < 40%',
        health: endeudamientoPct < 35 ? ('Óptimo' as const) : endeudamientoPct <= 55 ? ('Estable' as const) : ('Atención' as const),
        tone: (endeudamientoPct < 35 ? 'success' : endeudamientoPct <= 55 ? 'warning' : 'error') as 'success' | 'warning' | 'error',
        explanation: 'Proporción de financiación ajena respecto al volumen total del activo de la actividad.',
      },
    ];
  }, [snapshot.financialRatios]);

  return (
    <div className="space-y-6">
      {/* Header + Filters + Subview Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            Plan General Contable · {activityFilter}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Contabilidad
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-1.5 bg-black/[0.045] rounded-xl p-1 text-[13px]">
            <label htmlFor="accounting-year" className="sr-only">
              Ejercicio Fiscal
            </label>
            <select
              id="accounting-year"
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

          {/* Period selector */}
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={selectedPeriod}
            onChange={setSelectedPeriod}
            ariaLabel="Periodo contable"
            size="sm"
          />

          {/* Subview Segmented Control */}
          <div className="overflow-x-auto pb-1 sm:pb-0">
            <SegmentedControl
              options={SUBVIEW_OPTIONS}
              value={subView}
              onChange={setSubView}
              ariaLabel="Subvistas de contabilidad"
            />
          </div>
        </div>
      </div>

      {/* Subview 1: Balance de Situación */}
      {subView === 'balance' && (
        <div className="space-y-5">
          {/* Balance status banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
            <div className="flex items-center gap-2.5 text-[14px]">
              {snapshot.balanceSheet.isBalanced ? (
                <CheckCircle2 className="h-4 w-4 text-[#1D7A3F] shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 text-[#D70015] shrink-0" aria-hidden="true" />
              )}
              <span className="font-medium text-[#1D1D1F]">
                {snapshot.balanceSheet.isBalanced
                  ? 'Cuadre contable automático verificado'
                  : 'Descuadre contable detectado'}
              </span>
              <span className="text-[#6E6E73] hidden sm:inline">
                · Ejercicio {selectedYear} ({selectedPeriod === 'ALL' ? 'Anual' : selectedPeriod})
              </span>
            </div>
            <p className="text-[13px] tabular-nums text-[#6E6E73]">
              Activo = Patrimonio Neto + Pasivo:{' '}
              <strong className="font-semibold text-[#1D1D1F]">
                {formatCurrency(snapshot.balanceSheet.totalActivo)}
              </strong>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            {/* ACTIVO */}
            <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <div className="flex items-baseline justify-between pb-4 border-b border-black/[0.06]">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                  Activo
                </h2>
                <span className="text-[18px] font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(snapshot.balanceSheet.totalActivo)}
                </span>
              </div>

              {/* Activo Corriente */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Activo Corriente</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(snapshot.balanceSheet.totalActivoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {snapshot.balanceSheet.activoCorriente.map((item) => (
                    <div
                      key={item.code}
                      className="flex items-center justify-between gap-4 py-3 text-[14px]"
                    >
                      <span className="text-[#1D1D1F]">
                        <span className="font-mono text-[12px] text-[#86868B] mr-2.5">
                          {item.code}
                        </span>
                        {item.label}
                      </span>
                      <span className="tabular-nums font-medium text-[#1D1D1F] shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* PATRIMONIO NETO Y PASIVO */}
            <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <div className="flex items-baseline justify-between pb-4 border-b border-black/[0.06]">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                  Patrimonio Neto y Pasivo
                </h2>
                <span className="text-[18px] font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(snapshot.balanceSheet.totalPasivoYPatrimonio)}
                </span>
              </div>

              {/* Patrimonio Neto */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Patrimonio Neto</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(snapshot.balanceSheet.totalPatrimonioNeto)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {snapshot.balanceSheet.patrimonioNeto.map((item) => (
                    <div
                      key={item.code}
                      className="flex items-center justify-between gap-4 py-3 text-[14px]"
                    >
                      <span className="text-[#1D1D1F]">
                        <span className="font-mono text-[12px] text-[#86868B] mr-2.5">
                          {item.code}
                        </span>
                        {item.label}
                      </span>
                      <span className="tabular-nums font-medium text-[#1D1D1F] shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pasivo Corriente */}
              <div className="mt-6 pt-5 border-t border-black/[0.06]">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Pasivo Corriente</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(snapshot.balanceSheet.totalPasivoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {snapshot.balanceSheet.pasivoCorriente.map((item) => (
                    <div
                      key={item.code}
                      className="flex items-center justify-between gap-4 py-3 text-[14px]"
                    >
                      <span className="text-[#1D1D1F]">
                        <span className="font-mono text-[12px] text-[#86868B] mr-2.5">
                          {item.code}
                        </span>
                        {item.label}
                      </span>
                      <span className="tabular-nums font-medium text-[#1D1D1F] shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Subview 2: Pérdidas y Ganancias (P&L) */}
      {subView === 'pyg' && (
        <div className="space-y-6">
          {/* Top KPIs Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <span className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                Ingresos Explotación
              </span>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]">
                {formatCurrency(snapshot.profitAndLoss.operatingRevenue)}
              </p>
              <p className="mt-1 text-[12px] text-[#86868B]">Cuentas Grupo 7</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <span className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                Gastos Explotación
              </span>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]">
                {formatCurrency(snapshot.profitAndLoss.operatingExpenses)}
              </p>
              <p className="mt-1 text-[12px] text-[#86868B]">Cuentas Grupo 6 (inc. IVA no deducible)</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <span className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                Resultado Operativo
              </span>
              <p
                className={`mt-2 text-[26px] font-semibold tracking-[-0.03em] tabular-nums ${
                  snapshot.profitAndLoss.netOperatingProfit >= 0 ? 'text-[#1D7A3F]' : 'text-[#D70015]'
                }`}
              >
                {formatCurrency(snapshot.profitAndLoss.netOperatingProfit)}
              </p>
              <p className="mt-1 text-[12px] text-[#86868B]">Beneficio de Explotación</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <span className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                Margen Neto
              </span>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] tabular-nums text-[#1D1D1F]">
                {snapshot.profitAndLoss.netMarginPct.toFixed(1)}%
              </p>
              <p className="mt-1 text-[12px] text-[#86868B]">Sobre Ingresos Netos</p>
            </div>
          </div>

          {/* Breakdown columns */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Ingresos Grupo 7 */}
            <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[#1D7A3F]" aria-hidden="true" />
                  <h2 className="text-[17px] font-semibold text-[#1D1D1F]">
                    Ingresos (Grupo 7 PGC)
                  </h2>
                </div>
                <span className="font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(snapshot.profitAndLoss.operatingRevenue)}
                </span>
              </div>
              <div className="divide-y divide-black/[0.04] mt-3">
                {snapshot.profitAndLoss.revenueBreakdown.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-[#86868B]">
                    No se han registrado facturas emitidas en este periodo.
                  </p>
                ) : (
                  snapshot.profitAndLoss.revenueBreakdown.map((row) => (
                    <div key={row.code} className="flex items-center justify-between py-3 text-[14px]">
                      <div>
                        <span className="font-mono text-[12px] text-[#86868B] mr-2">
                          {row.code}
                        </span>
                        <span className="text-[#1D1D1F] font-medium">{row.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-[#1D1D1F]">
                        {formatCurrency(row.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Gastos Grupo 6 */}
            <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#0071E3]" aria-hidden="true" />
                  <h2 className="text-[17px] font-semibold text-[#1D1D1F]">
                    Gastos (Grupo 6 PGC)
                  </h2>
                </div>
                <span className="font-semibold tabular-nums text-[#1D1D1F]">
                  {formatCurrency(snapshot.profitAndLoss.operatingExpenses)}
                </span>
              </div>
              <div className="divide-y divide-black/[0.04] mt-3">
                {snapshot.profitAndLoss.expenseBreakdown.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-[#86868B]">
                    No se han registrado facturas recibidas en este periodo.
                  </p>
                ) : (
                  snapshot.profitAndLoss.expenseBreakdown.map((row) => (
                    <div key={row.code} className="flex items-center justify-between py-3 text-[14px]">
                      <div>
                        <span className="font-mono text-[12px] text-[#86868B] mr-2">
                          {row.code}
                        </span>
                        <span className="text-[#1D1D1F] font-medium">{row.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums text-[#1D1D1F]">
                        {formatCurrency(row.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Subview 3: Sumas y Saldos (Trial Balance) */}
      {subView === 'trial' && (
        <div className="space-y-4">
          {/* Trial Balance verification banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
            <div className="flex items-center gap-2.5 text-[14px]">
              {snapshot.trialBalance.isBalanced ? (
                <CheckCircle2 className="h-4 w-4 text-[#1D7A3F] shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 text-[#D70015] shrink-0" aria-hidden="true" />
              )}
              <span className="font-medium text-[#1D1D1F]">
                {snapshot.trialBalance.isBalanced
                  ? 'Partida doble cuadrada: Sumas y Saldos verificados según PGC (Debe = Haber)'
                  : 'Descuadre en Sumas y Saldos detectado'}
              </span>
            </div>
            <p className="text-[13px] tabular-nums text-[#6E6E73]">
              Total Sumas:{' '}
              <strong className="font-semibold text-[#1D1D1F]">
                {formatCurrency(snapshot.trialBalance.totalDebit)}
              </strong>
            </p>
          </div>

          {/* Trial Balance Table */}
          <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                    <th className="py-3 px-4 w-24">Cuenta</th>
                    <th className="py-3 px-4">Denominación</th>
                    <th className="py-3 px-4 text-right w-28">Sumas Debe</th>
                    <th className="py-3 px-4 text-right w-28">Sumas Haber</th>
                    <th className="py-3 px-4 text-right w-28">Saldo Deudor</th>
                    <th className="py-3 px-4 text-right w-28">Saldo Acreedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03]">
                  {snapshot.trialBalance.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#86868B]">
                        No hay movimientos registrados para el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    snapshot.trialBalance.rows.map((row) => (
                      <tr key={row.accountCode} className="hover:bg-black/[0.01] transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-[#0071E3]">
                          {row.accountCode}
                        </td>
                        <td className="py-2.5 px-4 text-[#1D1D1F]">{row.accountName}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-[#1D1D1F]">
                          {row.sumDebit > 0 ? formatCurrency(row.sumDebit) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-[#1D1D1F]">
                          {row.sumCredit > 0 ? formatCurrency(row.sumCredit) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-medium text-[#1D7A3F]">
                          {row.debitBalance > 0 ? formatCurrency(row.debitBalance) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-medium text-[#0071E3]">
                          {row.creditBalance > 0 ? formatCurrency(row.creditBalance) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                    <td colSpan={2} className="py-3 px-4 text-[13px]">
                      Totales del Balance de Comprobación
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {formatCurrency(snapshot.trialBalance.totalDebit)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {formatCurrency(snapshot.trialBalance.totalCredit)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#1D7A3F]">
                      {formatCurrency(snapshot.trialBalance.totalDebitBalance)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#0071E3]">
                      {formatCurrency(snapshot.trialBalance.totalCreditBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subview 4: Libro Mayor */}
      {subView === 'mayor' && (
        <div className="space-y-5">
          {/* Controls: Account Selector, Search, CSV Downloads */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col sm:flex-row gap-3">
              {/* Account Dropdown */}
              <div className="sm:w-80">
                <label htmlFor="ledger-account-select" className="sr-only">
                  Seleccionar cuenta contable
                </label>
                <select
                  id="ledger-account-select"
                  value={currentAccountCode}
                  onChange={(e) => {
                    setSelectedAccountCodeState(e.target.value);
                    setLedgerAccountFilter(e.target.value);
                  }}
                  className="w-full rounded-xl bg-white px-3.5 py-2.5 text-[14px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
                >
                  {generalLedger.accounts.length === 0 ? (
                    <option value="">Sin cuentas con movimientos</option>
                  ) : (
                    generalLedger.accounts.map((acc) => (
                      <option key={acc.accountCode} value={acc.accountCode}>
                        {acc.accountCode} · {acc.accountName} ({acc.movements.length})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Text Search within Ledger */}
              <div className="relative flex-1 max-w-md">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  aria-label="Buscar movimientos en el Libro Mayor"
                  placeholder="Buscar concepto o documento…"
                  className="w-full rounded-xl bg-white py-2.5 pl-10 pr-4 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none"
                />
              </div>
            </div>

            {/* CSV Export Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadGeneralLedgerCsv(
                    generalLedger,
                    currentAccountCode,
                    `Libro_Mayor_${currentAccountCode}_${selectedYear}_${selectedPeriod}.csv`
                  )
                }
                disabled={!currentLedgerAccount || currentLedgerAccount.movements.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#1D1D1F] shadow-sm border border-black/[0.08] hover:bg-[#F5F5F7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
              >
                <Download className="h-4 w-4 text-[#6E6E73]" aria-hidden="true" />
                <span>Exportar Cuenta (CSV)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadGeneralLedgerCsv(
                    generalLedger,
                    undefined,
                    `Libro_Mayor_Completo_${selectedYear}_${selectedPeriod}.csv`
                  )
                }
                disabled={generalLedger.accounts.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Exportar Todo el Mayor</span>
              </button>
            </div>
          </div>

          {!currentLedgerAccount ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
              <BookOpen className="mx-auto h-8 w-8 text-[#86868B] mb-2" aria-hidden="true" />
              <p className="text-[15px] font-semibold text-[#1D1D1F]">
                No hay movimientos en el Libro Mayor
              </p>
              <p className="mt-1 text-[13px] text-[#6E6E73] max-w-md mx-auto">
                Registra facturas o gastos en el período seleccionado para consultar el extracto de cuentas contables.
              </p>
            </div>
          ) : (
            <>
              {/* Account Title & KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
                  <p className="text-[12px] font-medium text-[#6E6E73] uppercase tracking-wider">
                    Total Sumas Debe
                  </p>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-[#1D1D1F]">
                    {formatCurrency(currentLedgerAccount.totalDebit)}
                  </p>
                  <p className="mt-1 text-[12px] text-[#86868B]">Cargos contabilizados</p>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
                  <p className="text-[12px] font-medium text-[#6E6E73] uppercase tracking-wider">
                    Total Sumas Haber
                  </p>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-[#1D1D1F]">
                    {formatCurrency(currentLedgerAccount.totalCredit)}
                  </p>
                  <p className="mt-1 text-[12px] text-[#86868B]">Abonos contabilizados</p>
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-medium text-[#6E6E73] uppercase tracking-wider">
                      Saldo Vivo / Final
                    </p>
                    <StatusBadge
                      label={
                        currentLedgerAccount.closingBalanceType === 'D'
                          ? 'Saldo Deudor'
                          : currentLedgerAccount.closingBalanceType === 'H'
                          ? 'Saldo Acreedor'
                          : 'Saldada / Cero'
                      }
                      tone={
                        currentLedgerAccount.closingBalanceType === 'D'
                          ? 'accent'
                          : currentLedgerAccount.closingBalanceType === 'H'
                          ? 'warning'
                          : 'success'
                      }
                    />
                  </div>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-[#1D1D1F]">
                    {formatCurrency(currentLedgerAccount.closingBalance)}
                  </p>
                  <p className="mt-1 text-[12px] text-[#86868B]">
                    Cuenta {currentLedgerAccount.accountCode} · {currentLedgerAccount.movements.length} movimientos
                  </p>
                </div>
              </div>

              {/* Movements Table */}
              <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] overflow-hidden">
                <div className="px-5 py-4 border-b border-black/[0.05] flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1D1D1F]">
                      Extracto Cronológico · {currentLedgerAccount.accountCode} - {currentLedgerAccount.accountName}
                    </h3>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Mostrando {filteredLedgerMovements.length} de {currentLedgerAccount.movements.length} movimientos
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-black/[0.02] border-b border-black/[0.05] text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                        <th className="py-3 px-4 w-28">Fecha</th>
                        <th className="py-3 px-3 w-24">Asiento</th>
                        <th className="py-3 px-3 w-32">Documento</th>
                        <th className="py-3 px-4">Concepto</th>
                        <th className="py-3 px-4 text-right w-28">Debe</th>
                        <th className="py-3 px-4 text-right w-28">Haber</th>
                        <th className="py-3 px-4 text-right w-32">Saldo Acumulado</th>
                        <th className="py-3 px-3 text-center w-16">D/H</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.03]">
                      {filteredLedgerMovements.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-[#86868B]">
                            No hay movimientos que coincidan con la búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filteredLedgerMovements.map((m) => (
                          <tr key={m.id} className="hover:bg-black/[0.01] transition-colors">
                            <td className="py-2.5 px-4 tabular-nums text-[#6E6E73] whitespace-nowrap">
                              {formatDateES(m.date)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[12px] font-medium text-[#0071E3] whitespace-nowrap">
                              #{m.entryNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[12px] text-[#1D1D1F] whitespace-nowrap">
                              {m.documentNumber || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-[#1D1D1F] max-w-md truncate">
                              {m.concept}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums font-medium text-[#1D1D1F] whitespace-nowrap">
                              {m.debe > 0 ? formatCurrency(m.debe) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums font-medium text-[#1D1D1F] whitespace-nowrap">
                              {m.haber > 0 ? formatCurrency(m.haber) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-[#1D1D1F] whitespace-nowrap">
                              {formatCurrency(m.runningBalance)}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                                  m.balanceType === 'D'
                                    ? 'bg-[#EBF5FF] text-[#0071E3]'
                                    : m.balanceType === 'H'
                                    ? 'bg-[#FFF8E6] text-[#B25E00]'
                                    : 'bg-black/[0.04] text-[#86868B]'
                                }`}
                              >
                                {m.balanceType}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-black/[0.025] border-t border-black/[0.08] font-semibold text-[#1D1D1F]">
                        <td colSpan={4} className="py-3 px-4 text-[13px]">
                          Totales acumulados de la cuenta {currentLedgerAccount.accountCode}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {formatCurrency(currentLedgerAccount.totalDebit)}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {formatCurrency(currentLedgerAccount.totalCredit)}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-[#0071E3]">
                          {formatCurrency(currentLedgerAccount.closingBalance)}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[12px] font-bold text-[#0071E3]">
                          {currentLedgerAccount.closingBalanceType}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Subview 5: Libro Diario */}
      {subView === 'diario' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                aria-label="Buscar en Libro Diario"
                placeholder="Buscar por factura, cuenta PGC o concepto…"
                className="w-full rounded-xl bg-white py-2.5 pl-10 pr-4 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <p className="text-[13px] text-[#6E6E73] tabular-nums hidden sm:inline">
                {filteredJournalEntries.length} asientos generados
              </p>
              <button
                type="button"
                onClick={() =>
                  downloadJournalCsv(
                    snapshot.journalEntries,
                    `Libro_Diario_${selectedYear}_${selectedPeriod}.csv`
                  )
                }
                disabled={snapshot.journalEntries.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Exportar Libro Diario (CSV)</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredJournalEntries.length === 0 ? (
              <div className="rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
                <BookOpen className="mx-auto h-8 w-8 text-[#86868B] mb-2" aria-hidden="true" />
                <p className="text-[15px] font-semibold text-[#1D1D1F]">
                  No hay asientos contables registrados
                </p>
                <p className="mt-1 text-[13px] text-[#6E6E73] max-w-md mx-auto">
                  Los asientos del Libro Diario se generarán automáticamente conforme emitas facturas o registres gastos deducibles.
                </p>
              </div>
            ) : (
              filteredJournalEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-black/[0.05]">
                    <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
                      <span className="font-mono font-semibold text-[#0071E3]">
                        Asiento #{entry.entryNumber}
                      </span>
                      <span className="text-[#86868B]" aria-hidden="true">
                        ·
                      </span>
                      <span className="tabular-nums text-[#6E6E73]">
                        {formatDateES(entry.date)}
                      </span>
                      <span className="text-[#86868B]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-medium text-[#1D1D1F]">{entry.concept}</span>
                    </div>
                    {entry.activity && (
                      <span className="text-[12px] text-[#6E6E73]">{entry.activity}</span>
                    )}
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="text-[11px] font-medium text-[#86868B]">
                          <th className="py-1.5 pr-4 font-medium w-20">Cuenta</th>
                          <th className="py-1.5 px-2 font-medium">Descripción</th>
                          <th className="py-1.5 px-2 font-medium text-right w-32">Debe</th>
                          <th className="py-1.5 pl-2 font-medium text-right w-32">Haber</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.03]">
                        {entry.lines.map((line, idx) => (
                          <tr key={`${entry.id}-${idx}`}>
                            <td className="py-2 pr-4 font-mono text-[12px] text-[#6E6E73]">
                              {line.accountCode}
                            </td>
                            <td className="py-2 px-2 text-[#1D1D1F]">{line.accountName}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-medium text-[#1D1D1F]">
                              {line.debe > 0 ? formatCurrency(line.debe) : '—'}
                            </td>
                            <td className="py-2 pl-2 text-right tabular-nums font-medium text-[#1D1D1F]">
                              {line.haber > 0 ? formatCurrency(line.haber) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-black/[0.06] font-semibold text-[#1D1D1F]">
                          <td colSpan={2} className="pt-2.5 text-[12px] text-[#6E6E73]">
                            Totales del asiento
                          </td>
                          <td className="pt-2.5 px-2 text-right tabular-nums">
                            {formatCurrency(entry.totalDebe)}
                          </td>
                          <td className="pt-2.5 pl-2 text-right tabular-nums">
                            {formatCurrency(entry.totalHaber)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subview 5: Ratios Financieros */}
      {subView === 'ratios' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {ratiosCards.map((ratio) => (
            <article
              key={ratio.id}
              className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#1D1D1F]">
                    {ratio.name}
                  </h2>
                  <StatusBadge label={ratio.health} tone={ratio.tone} />
                </div>

                <div className="mt-4 flex items-baseline gap-3">
                  <p className="text-[36px] font-semibold tracking-[-0.035em] tabular-nums text-[#1D1D1F] leading-none">
                    {ratio.valueFormatted}
                  </p>
                  <span className="text-[13px] text-[#6E6E73]">{ratio.benchmark}</span>
                </div>
              </div>

              <p className="mt-5 pt-4 border-t border-black/[0.05] text-[13px] leading-relaxed text-[#6E6E73]">
                {ratio.explanation}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
