import { useMemo, useState } from 'react';
import { Search, Plus, ChevronRight, Users, Loader2 } from 'lucide-react';
import type {
  ActivityFilter,
  Contact,
  ContactKind,
  IssuedInvoice,
  ReceivedInvoice,
} from '../types';
import {
  formatCurrency,
  getContactTotalVolume,
  matchesActivity,
} from '../utils/finance';
import { StatusBadge } from '../components/StatusBadge';

interface ContactsPageProps {
  kind: ContactKind;
  contacts: Contact[];
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  globalActivityFilter: ActivityFilter;
  activityOptions?: ActivityFilter[];
  isLoading?: boolean;
  onOpenContact: (contact: Contact) => void;
  onCreateContact: () => void;
}

export function ContactsPage({
  kind,
  contacts,
  issuedInvoices,
  receivedInvoices,
  globalActivityFilter,
  activityOptions,
  isLoading = false,
  onOpenContact,
  onCreateContact,
}: ContactsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [localActivity, setLocalActivity] = useState<ActivityFilter>('Todas las actividades');

  const isClient = kind === 'cliente';
  const title = isClient ? 'Clientes' : 'Proveedores';
  const singular = isClient ? 'Cliente' : 'Proveedor';

  const effectiveActivity: ActivityFilter =
    globalActivityFilter !== 'Todas las actividades' ? globalActivityFilter : localActivity;

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!matchesActivity(contact.activity, effectiveActivity)) return false;
      if (!q) return true;
      return (
        contact.name.toLowerCase().includes(q) ||
        contact.nif.toLowerCase().includes(q) ||
        contact.email.toLowerCase().includes(q) ||
        (Boolean(contact.accountCode) && contact.accountCode!.toLowerCase().includes(q))
      );
    });
  }, [contacts, effectiveActivity, searchQuery]);

  const totalVolumeSum = useMemo(
    () =>
      filteredContacts.reduce(
        (sum, c) =>
          sum +
          getContactTotalVolume(
            c.id,
            kind,
            c.historicalVolume,
            issuedInvoices,
            receivedInvoices
          ),
        0
      ),
    [filteredContacts, kind, issuedInvoices, receivedInvoices]
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#6E6E73] tabular-nums">
            {filteredContacts.length} {isClient ? 'clientes registrados' : 'proveedores registrados'} ·{' '}
            {isClient ? 'Volumen facturado' : 'Volumen de gasto'} {formatCurrency(totalVolumeSum)}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#1D1D1F] leading-tight">
            {title}
          </h1>
        </div>

        <button
          type="button"
          onClick={onCreateContact}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-[#0071E3] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.22)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo {singular}
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={`Buscar ${title.toLowerCase()} por nombre, NIF, subcuenta o correo`}
            placeholder={`Buscar ${title.toLowerCase()} por nombre, NIF, subcuenta…`}
            className="w-full rounded-xl bg-white py-2.5 pl-10 pr-4 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] transition-all focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
          />
        </div>

        <div className="flex items-center gap-3">
          {globalActivityFilter === 'Todas las actividades' ? (
            <select
              aria-label={`Filtrar ${title.toLowerCase()} por actividad`}
              value={localActivity}
              onChange={(e) => setLocalActivity(e.target.value as ActivityFilter)}
              className="rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] focus:border-[#0071E3] focus:outline-none"
            >
              {(
                activityOptions || [
                  'Todas las actividades',
                  'Contabilidad Comunidades',
                  'Actividad Artística',
                ]
              ).map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[13px] text-[#6E6E73]">
              Filtro global activo: <strong className="font-medium text-[#1D1D1F]">{globalActivityFilter}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Clean Borderless-Column Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" aria-hidden="true" />
            <p className="mt-3 text-[14px] font-medium text-[#1D1D1F]">
              Cargando {title.toLowerCase()}…
            </p>
            <p className="mt-1 text-[12px] text-[#6E6E73]">
              Sincronizando registros con Supabase
            </p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[#86868B]">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
              No se encontraron {title.toLowerCase()}
            </p>
            <p className="mt-1 text-[13px] text-[#6E6E73] max-w-sm">
              Prueba con otro término de búsqueda o registra un nuevo {singular.toLowerCase()} para comenzar a facturar.
            </p>
            <button
              type="button"
              onClick={onCreateContact}
              className="mt-5 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ED]"
            >
              + Nuevo {singular}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[0.05] text-[12px] font-medium text-[#6E6E73]">
                  <th className="py-3.5 pl-6 pr-4 font-medium">Nombre / Razón social</th>
                  <th className="py-3.5 px-4 font-medium">NIF / Subcuenta</th>
                  <th className="py-3.5 px-4 font-medium">Actividad</th>
                  <th className="py-3.5 px-4 font-medium text-right">
                    {isClient ? 'Total facturado' : 'Total gastado'}
                  </th>
                  <th className="py-3.5 px-4 font-medium">Estado</th>
                  <th className="py-3.5 pl-2 pr-6 font-medium text-right">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] text-[14px]">
                {filteredContacts.map((contact) => {
                  const totalVolume = getContactTotalVolume(
                    contact.id,
                    kind,
                    contact.historicalVolume,
                    issuedInvoices,
                    receivedInvoices
                  );
                  return (
                    <tr
                      key={contact.id}
                      className="group transition-colors hover:bg-[#F5F5F7]/70"
                    >
                      <td className="py-4 pl-6 pr-4">
                        <button
                          type="button"
                          onClick={() => onOpenContact(contact)}
                          className="text-left focus-visible:outline-none focus-visible:underline"
                        >
                          <p className="font-medium text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors">
                            {contact.name}
                          </p>
                          <p className="text-[12px] text-[#6E6E73] mt-0.5">{contact.email}</p>
                        </button>
                      </td>
                      <td className="py-4 px-4 font-mono text-[13px] tabular-nums text-[#1D1D1F] whitespace-nowrap">
                        <div>{contact.nif || '—'}</div>
                        {contact.accountCode && (
                          <div className="text-[11px] font-mono text-[#0071E3] mt-0.5">
                            Cta: {contact.accountCode}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-[13px] text-[#6E6E73] whitespace-nowrap">
                        {contact.activity}
                      </td>
                      <td className="py-4 px-4 text-right font-semibold tabular-nums text-[#1D1D1F] whitespace-nowrap">
                        {formatCurrency(totalVolume)}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusBadge
                          label={contact.status}
                          tone={contact.status === 'Activo' ? 'success' : 'neutral'}
                        />
                      </td>
                      <td className="py-4 pl-2 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenContact(contact)}
                          aria-label={`Abrir ficha de ${contact.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#86868B] transition-colors hover:bg-white hover:text-[#1D1D1F]"
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
        )}
      </div>
    </div>
  );
}
