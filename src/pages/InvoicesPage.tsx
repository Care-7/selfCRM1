import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  UploadCloud,
  ChevronRight,
  FileText,
  Lock,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type {
  ActivityFilter,
  DocumentType,
  IssuedInvoice,
  IssuedInvoiceStatus,
  ReceivedInvoice,
} from '../types';
import {
  formatCurrency,
  formatDateES,
  getIssuedInvoiceTotals,
  getReceivedInvoiceTotals,
  matchesActivity,
} from '../utils/finance';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge, VeriFactuBadge } from '../components/StatusBadge';

export type InvoicesTab = 'emitidas' | 'recibidas';
export type DocTypeFilter = 'all' | 'normal' | 'proforma' | 'albaran';

interface InvoicesPageProps {
  activeTab: InvoicesTab;
  onChangeTab: (tab: InvoicesTab) => void;
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  activityFilter: ActivityFilter;
  onOpenNewInvoice: () => void;
  onSelectIssuedInvoice: (invoice: IssuedInvoice) => void;
  onOpenAiExpenseModal: () => void;
  onConvertToInvoice?: (doc: IssuedInvoice) => void;
}

const TAB_OPTIONS: { value: InvoicesTab; label: string }[] = [
  { value: 'emitidas', label: 'Emitidas' },
  { value: 'recibidas', label: 'Recibidas (Gastos)' },
];

const DOC_TYPE_FILTER_OPTIONS: { value: DocTypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'normal', label: 'Normales' },
  { value: 'proforma', label: 'Proformas' },
  { value: 'albaran', label: 'Albaranes' },
];

export function InvoicesPage({
  activeTab,
  onChangeTab,
  issuedInvoices,
  receivedInvoices,
  activityFilter,
  onOpenNewInvoice,
  onSelectIssuedInvoice,
  onOpenAiExpenseModal,
  onConvertToInvoice,
}: InvoicesPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todas' | IssuedInvoiceStatus>('Todas');
  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>('all');

  const filteredIssued = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...issuedInvoices]
      .filter((inv) => {
        if (!matchesActivity(inv.activity, activityFilter)) return false;
        if (docTypeFilter !== 'all') {
          const type = inv.documentType ?? 'normal';
          if (type !== docTypeFilter) return false;
        }
        if (statusFilter !== 'Todas' && inv.status !== statusFilter) return false;
        if (!q) return true;
        return (
          inv.number.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q) ||
          inv.clientNif.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [issuedInvoices, activityFilter, docTypeFilter, statusFilter, searchQuery]);

  const filteredReceived = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...receivedInvoices]
      .filter((rec) => {
        if (!matchesActivity(rec.activity, activityFilter)) return false;
        if (!q) return true;
        return (
          rec.number.toLowerCase().includes(q) ||
          rec.supplierName.toLowerCase().includes(q) ||
          rec.concept.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [receivedInvoices, activityFilter, searchQuery]);

  const issuedSummary = useMemo(() => {
    let totalBilled = 0;
    let pendingAmount = 0;
    for (const inv of filteredIssued) {
      if (inv.status === 'Borrador') continue;
      // Proformas and Albaranes have no fiscal validity, exclude from fiscal totals
      if (inv.documentType && inv.documentType !== 'normal') continue;
      const t = getIssuedInvoiceTotals(inv);
      totalBilled += t.total;
      if (inv.status === 'Pendiente') pendingAmount += t.total;
    }
    return { totalBilled, pendingAmount };
  }, [filteredIssued]);

  const receivedSummary = useMemo(() => {
    let totalBase = 0;
    let totalIva = 0;
    for (const rec of filteredReceived) {
      const t = getReceivedInvoiceTotals(rec);
      totalBase += t.baseImponible;
      totalIva += t.ivaAmount;
    }
    return { totalBase, totalIva };
  }, [filteredReceived]);

  return (
    <div className="space-y-6">
      {/* Header + Segmented Control + Single Primary Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73]">
            {activityFilter} · Registro conforme a VeriFactu
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            Facturas y Documentos
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={TAB_OPTIONS}
            value={activeTab}
            onChange={(next) => {
              onChangeTab(next);
              setSearchQuery('');
            }}
            ariaLabel="Tipo de facturas"
          />

          {activeTab === 'emitidas' ? (
            <button
              type="button"
              onClick={onOpenNewInvoice}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-[#0071E3] px-4 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.22)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo Documento
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAiExpenseModal}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-[#0071E3] px-4 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.22)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Subir factura (Lectura IA)
            </button>
          )}
        </div>
      </div>

      {/* Filter Row + Document Type Filter + Quiet Totals Summary */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar documentos"
              placeholder={
                activeTab === 'emitidas'
                  ? 'Buscar por número, cliente o NIF…'
                  : 'Buscar por proveedor, número o concepto…'
              }
              className="w-full rounded-xl bg-white py-2 pl-10 pr-4 text-[13px] text-[#1D1D1F] placeholder:text-[#86868B] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
            />
          </div>

          {activeTab === 'emitidas' && (
            <>
              {/* iOS-style Document Type segmented control */}
              <SegmentedControl<DocTypeFilter>
                options={DOC_TYPE_FILTER_OPTIONS}
                value={docTypeFilter}
                onChange={setDocTypeFilter}
                ariaLabel="Filtrar por tipo de documento emitido"
                size="sm"
              />

              <select
                aria-label="Filtrar por estado"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'Todas' | IssuedInvoiceStatus)}
                className="rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none"
              >
                <option value="Todas">Todos los estados</option>
                <option value="Cobrada">Cobrada</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Borrador">Borrador</option>
                <option value="Facturado">Facturado</option>
                <option value="Convertida">Convertida</option>
              </select>
            </>
          )}
        </div>

        {/* Clean inline metrics */}
        <div className="flex items-center gap-4 text-[13px] text-[#6E6E73] tabular-nums shrink-0">
          {activeTab === 'emitidas' ? (
            <>
              <span>
                Total facturado:{' '}
                <strong className="font-semibold text-[#1D1D1F]">
                  {formatCurrency(issuedSummary.totalBilled)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Pendiente cobro:{' '}
                <strong className="font-semibold text-[#B25E09]">
                  {formatCurrency(issuedSummary.pendingAmount)}
                </strong>
              </span>
            </>
          ) : (
            <>
              <span>
                Base deducible:{' '}
                <strong className="font-semibold text-[#1D1D1F]">
                  {formatCurrency(receivedSummary.totalBase)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                IVA soportado:{' '}
                <strong className="font-semibold text-[#1D1D1F]">
                  {formatCurrency(receivedSummary.totalIva)}
                </strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Table Surface */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
        {activeTab === 'emitidas' ? (
          filteredIssued.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#86868B]">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
                No hay documentos emitidos que coincidan
              </p>
              <p className="mt-1 text-[13px] text-[#6E6E73]">
                Ajusta los filtros o crea una Factura Normal, Proforma o Albarán.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/[0.05] text-[12px] font-medium text-[#6E6E73]">
                    <th className="py-3.5 pl-6 pr-4 font-medium">Número</th>
                    <th className="py-3.5 px-4 font-medium">Cliente</th>
                    <th className="py-3.5 px-4 font-medium">Fecha</th>
                    <th className="py-3.5 px-4 font-medium text-right">Base</th>
                    <th className="py-3.5 px-4 font-medium text-right">Total</th>
                    <th className="py-3.5 px-4 font-medium">Estado</th>
                    <th className="py-3.5 px-4 font-medium">VeriFactu</th>
                    <th className="py-3.5 px-4 font-medium text-center">Acción rápida</th>
                    <th className="py-3.5 pl-2 pr-6 font-medium text-right">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04] text-[14px]">
                  {filteredIssued.map((inv) => {
                    const totals = getIssuedInvoiceTotals(inv);
                    const docType = inv.documentType ?? 'normal';
                    const isValued = inv.isValued !== false;

                    return (
                      <tr
                        key={inv.id}
                        className="group transition-colors hover:bg-[#F5F5F7]/70"
                      >
                        {/* Number */}
                        <td className="py-4 pl-6 pr-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectIssuedInvoice(inv)}
                            className="font-mono text-[13px] font-semibold text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors"
                          >
                            {inv.number}
                          </button>
                        </td>

                        {/* Client & Activity */}
                        <td className="py-4 px-4">
                          <p className="font-medium text-[#1D1D1F] truncate max-w-[220px]">
                            {inv.clientName}
                          </p>
                          <p className="text-[12px] text-[#6E6E73] mt-0.5">
                            {inv.activity}
                            {docType === 'proforma' && ' · Proforma'}
                            {docType === 'albaran' && (!isValued ? ' · Albarán (Sin valorar)' : ' · Albarán')}
                          </p>
                        </td>

                        {/* Date */}
                        <td className="py-4 px-4 text-[13px] tabular-nums text-[#6E6E73] whitespace-nowrap">
                          {formatDateES(inv.issueDate)}
                        </td>

                        {/* Base */}
                        <td className="py-4 px-4 text-right text-[13px] tabular-nums text-[#6E6E73] whitespace-nowrap">
                          {docType === 'albaran' && !isValued ? (
                            <span className="text-[12px] text-[#86868B] italic">Sin valorar</span>
                          ) : (
                            formatCurrency(totals.baseImponible)
                          )}
                        </td>

                        {/* Total */}
                        <td className="py-4 px-4 text-right font-semibold tabular-nums text-[#1D1D1F] whitespace-nowrap">
                          {docType === 'albaran' && !isValued ? (
                            <span className="text-[12px] text-[#86868B] italic font-normal">Sin valorar</span>
                          ) : (
                            formatCurrency(totals.total)
                          )}
                        </td>

                        {/* Visual Badge by Document Type */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {docType === 'normal' ? (
                            inv.status === 'Borrador' ? (
                              <StatusBadge label="Borrador" tone="neutral" icon="draft" />
                            ) : inv.status === 'Cobrada' ? (
                              <StatusBadge label="Cobrada" tone="success" icon="check" />
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#E8F8EE] text-[#1D7A3F] px-2.5 py-1 text-[12px] font-medium leading-none">
                                <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>Emitida</span>
                              </span>
                            )
                          ) : docType === 'proforma' ? (
                            inv.status === 'Convertida' ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-black/[0.05] text-[#6E6E73] px-2.5 py-1 text-[12px] font-medium leading-none">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Proforma · Convertida</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0071E3]/[0.08] text-[#0071E3] px-2.5 py-1 text-[12px] font-medium leading-none">
                                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Proforma · Sin validez fiscal</span>
                              </span>
                            )
                          ) : (
                            /* Albarán */
                            inv.status === 'Facturado' ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-black/[0.05] text-[#6E6E73] px-2.5 py-1 text-[12px] font-medium leading-none">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Albarán · Facturado</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#FFF4E5] text-[#B25E09] px-2.5 py-1 text-[12px] font-medium leading-none">
                                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>Albarán · Pendiente</span>
                              </span>
                            )
                          )}
                        </td>

                        {/* VeriFactu seal: Only shown for Factura Normal */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {docType === 'normal' ? (
                            <VeriFactuBadge locked={inv.veriFactuLocked} />
                          ) : (
                            <span className="text-[12px] text-[#86868B] font-medium pl-2">—</span>
                          )}
                        </td>

                        {/* Quick 1-Click Conversion Actions */}
                        <td className="py-4 px-4 whitespace-nowrap text-center">
                          {docType === 'proforma' ? (
                            inv.status !== 'Convertida' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConvertToInvoice?.(inv);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3]/[0.09] px-2.5 py-1 text-[12px] font-medium text-[#0071E3] hover:bg-[#0071E3]/[0.18] transition-colors"
                                title="Crear Factura Normal en borrador a partir de esta proforma"
                              >
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                Convertir a Factura
                              </button>
                            ) : (
                              <span className="text-[12px] text-[#86868B] font-medium">Convertida</span>
                            )
                          ) : docType === 'albaran' ? (
                            inv.status !== 'Facturado' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConvertToInvoice?.(inv);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3]/[0.09] px-2.5 py-1 text-[12px] font-medium text-[#0071E3] hover:bg-[#0071E3]/[0.18] transition-colors"
                                title="Crear Factura Normal en borrador a partir de este albarán"
                              >
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                Facturar
                              </button>
                            ) : (
                              <span className="text-[12px] text-[#86868B] font-medium">Facturado</span>
                            )
                          ) : (
                            <span className="text-[12px] text-[#86868B]">—</span>
                          )}
                        </td>

                        {/* Open Details Chevron */}
                        <td className="py-4 pl-2 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => onSelectIssuedInvoice(inv)}
                            aria-label={`Ver documento ${inv.number}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#86868B] hover:bg-white hover:text-[#1D1D1F]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredReceived.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#86868B]">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
              No hay gastos registrados con estos filtros
            </p>
            <button
              type="button"
              onClick={onOpenAiExpenseModal}
              className="mt-4 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ED]"
            >
              Subir factura (Lectura IA)
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.05] text-[12px] font-medium text-[#6E6E73]">
                  <th className="py-3.5 pl-6 pr-4 font-medium">Nº Factura</th>
                  <th className="py-3.5 px-4 font-medium">Proveedor y concepto</th>
                  <th className="py-3.5 px-4 font-medium">Cuenta PGC</th>
                  <th className="py-3.5 px-4 font-medium">Fecha</th>
                  <th className="py-3.5 px-4 font-medium text-right">Base</th>
                  <th className="py-3.5 px-4 font-medium text-right">IVA</th>
                  <th className="py-3.5 px-4 font-medium text-right">Total</th>
                  <th className="py-3.5 pl-4 pr-6 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] text-[14px]">
                {filteredReceived.map((rec) => {
                  const totals = getReceivedInvoiceTotals(rec);
                  return (
                    <tr
                      key={rec.id}
                      className="transition-colors hover:bg-[#F5F5F7]/70"
                    >
                      <td className="py-4 pl-6 pr-4 font-mono text-[13px] font-medium text-[#1D1D1F] whitespace-nowrap">
                        {rec.number}
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-medium text-[#1D1D1F] truncate max-w-[260px]">
                          {rec.supplierName}
                        </p>
                        <p className="text-[12px] text-[#6E6E73] truncate max-w-[280px] mt-0.5">
                          {rec.concept} · {rec.activity}
                        </p>
                      </td>
                      <td className="py-4 px-4 text-[12px] text-[#6E6E73] whitespace-nowrap">
                        <span className="font-mono font-medium text-[#1D1D1F] mr-1.5">
                          {rec.pgcAccountCode}
                        </span>
                        <span className="hidden xl:inline">{rec.pgcAccountName}</span>
                      </td>
                      <td className="py-4 px-4 text-[13px] tabular-nums text-[#6E6E73] whitespace-nowrap">
                        {formatDateES(rec.issueDate)}
                      </td>
                      <td className="py-4 px-4 text-right text-[13px] tabular-nums text-[#6E6E73] whitespace-nowrap">
                        {formatCurrency(totals.baseImponible)}
                      </td>
                      <td className="py-4 px-4 text-right text-[13px] tabular-nums text-[#6E6E73] whitespace-nowrap">
                        {formatCurrency(totals.ivaAmount)}
                      </td>
                      <td className="py-4 px-4 text-right font-semibold tabular-nums text-[#1D1D1F] whitespace-nowrap">
                        {formatCurrency(totals.total)}
                      </td>
                      <td className="py-4 pl-4 pr-6 whitespace-nowrap">
                        <StatusBadge
                          label={rec.status}
                          tone={rec.status === 'Contabilizada' ? 'success' : 'warning'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
