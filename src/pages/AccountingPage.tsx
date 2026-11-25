import { useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import type { ActivityFilter, IssuedInvoice, ReceivedInvoice } from '../types';
import {
  calculateBalanceSheet,
  calculateDashboardKPIs,
  calculateFinancialRatios,
  formatCurrency,
  formatDateES,
  generateJournalEntries,
} from '../utils/finance';
import { REFERENCE_DATE } from '../data/mockData';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';

export type AccountingSubView = 'balance' | 'ratios' | 'diario';

interface AccountingPageProps {
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
}

const SUBVIEW_OPTIONS: { value: AccountingSubView; label: string }[] = [
  { value: 'balance', label: 'Balance de Situación' },
  { value: 'ratios', label: 'Ratios' },
  { value: 'diario', label: 'Libro Diario' },
];

export function AccountingPage({
  issuedInvoices,
  receivedInvoices,
  activityFilter,
}: AccountingPageProps) {
  const [subView, setSubView] = useState<AccountingSubView>('balance');
  const [journalSearch, setJournalSearch] = useState('');

  const balance = useMemo(
    () => calculateBalanceSheet(issuedInvoices, receivedInvoices, activityFilter),
    [issuedInvoices, receivedInvoices, activityFilter]
  );

  const annualKpis = useMemo(
    () =>
      calculateDashboardKPIs(
        issuedInvoices,
        receivedInvoices,
        activityFilter,
        'year',
        REFERENCE_DATE
      ),
    [issuedInvoices, receivedInvoices, activityFilter]
  );

  const ratios = useMemo(
    () => calculateFinancialRatios(balance, annualKpis),
    [balance, annualKpis]
  );

  const journalEntries = useMemo(() => {
    const all = generateJournalEntries(issuedInvoices, receivedInvoices, activityFilter);
    const q = journalSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (entry) =>
        entry.concept.toLowerCase().includes(q) ||
        entry.sourceRef.toLowerCase().includes(q) ||
        entry.lines.some(
          (l) =>
            l.accountCode.includes(q) || l.accountName.toLowerCase().includes(q)
        )
    );
  }, [issuedInvoices, receivedInvoices, activityFilter, journalSearch]);

  return (
    <div className="space-y-6">
      {/* Header + Segmented Control */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            Plan General Contable · {activityFilter}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Contabilidad
          </h1>
        </div>

        <SegmentedControl
          options={SUBVIEW_OPTIONS}
          value={subView}
          onChange={setSubView}
          ariaLabel="Subvistas de contabilidad"
        />
      </div>

      {/* Subview 1: Balance de Situación */}
      {subView === 'balance' && (
        <div className="space-y-5">
          {/* Balance status banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
            <div className="flex items-center gap-2.5 text-[14px]">
              <CheckCircle2 className="h-4 w-4 text-[#1D7A3F] shrink-0" aria-hidden="true" />
              <span className="font-medium text-[#1D1D1F]">
                Cuadre contable automático verificado
              </span>
              <span className="text-[#6E6E73] hidden sm:inline">
                · Ejercicio en curso a {formatDateES(REFERENCE_DATE)}
              </span>
            </div>
            <p className="text-[13px] tabular-nums text-[#6E6E73]">
              Activo = Patrimonio Neto + Pasivo:{' '}
              <strong className="font-semibold text-[#1D1D1F]">
                {formatCurrency(balance.totalActivo)}
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
                  {formatCurrency(balance.totalActivo)}
                </span>
              </div>

              {/* Activo No Corriente */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Activo No Corriente</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(balance.totalActivoNoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {balance.activoNoCorriente.map((item) => (
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
                      <span
                        className={`tabular-nums font-medium shrink-0 ${
                          item.amount < 0 ? 'text-[#6E6E73]' : 'text-[#1D1D1F]'
                        }`}
                      >
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activo Corriente */}
              <div className="mt-6 pt-5 border-t border-black/[0.06]">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Activo Corriente</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(balance.totalActivoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {balance.activoCorriente.map((item) => (
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
                  {formatCurrency(balance.totalPasivoYPatrimonio)}
                </span>
              </div>

              {/* Patrimonio Neto */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Patrimonio Neto</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(balance.totalPatrimonioNeto)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {balance.patrimonioNeto.map((item) => (
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

              {/* Pasivo No Corriente */}
              <div className="mt-6 pt-5 border-t border-black/[0.06]">
                <div className="flex items-center justify-between text-[12px] font-semibold text-[#6E6E73] mb-2">
                  <span>Pasivo No Corriente</span>
                  <span className="tabular-nums text-[#1D1D1F]">
                    {formatCurrency(balance.totalPasivoNoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {balance.pasivoNoCorriente.map((item) => (
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
                    {formatCurrency(balance.totalPasivoCorriente)}
                  </span>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {balance.pasivoCorriente.map((item) => (
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

      {/* Subview 2: Ratios Financieros */}
      {subView === 'ratios' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {ratios.map((ratio) => (
            <article
              key={ratio.id}
              className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#1D1D1F]">
                    {ratio.name}
                  </h2>
                  <StatusBadge
                    label={ratio.health}
                    tone={
                      ratio.health === 'Óptimo'
                        ? 'success'
                        : ratio.health === 'Estable'
                        ? 'warning'
                        : 'error'
                    }
                  />
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

      {/* Subview 3: Libro Diario */}
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
            <p className="text-[13px] text-[#6E6E73] tabular-nums">
              {journalEntries.length} asientos generados automáticamente desde facturas
            </p>
          </div>

          <div className="space-y-4">
            {journalEntries.length === 0 ? (
              <div className="rounded-2xl bg-white p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
                <p className="text-[15px] font-semibold text-[#1D1D1F]">
                  No hay asientos contables registrados
                </p>
                <p className="mt-1 text-[13px] text-[#6E6E73] max-w-md mx-auto">
                  Los asientos del Libro Diario se generarán automáticamente conforme emitas facturas o registres gastos deducibles.
                </p>
              </div>
            ) : (
              journalEntries.map((entry) => (
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
                  <span className="text-[12px] text-[#6E6E73]">{entry.activity}</span>
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
    </div>
  );
}
