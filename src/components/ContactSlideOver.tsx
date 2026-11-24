import { useEffect, useState } from 'react';
import { X, Mail, MapPin, FileText } from 'lucide-react';
import type {
  ActivityType,
  Contact,
  ContactKind,
  ContactStatus,
  IrpfRate,
  IssuedInvoice,
  IvaRate,
  ReceivedInvoice,
} from '../types';
import { formatCurrency, formatDateES, getIssuedInvoiceTotals, getReceivedInvoiceTotals } from '../utils/finance';
import { StatusBadge } from './StatusBadge';

interface ContactSlideOverProps {
  isOpen: boolean;
  kind: ContactKind;
  contact: Contact | null; // null = create new
  defaultActivity: ActivityType;
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  onClose: () => void;
  onSave: (contact: Contact, isNew: boolean) => void;
}

export function ContactSlideOver({
  isOpen,
  kind,
  contact,
  defaultActivity,
  issuedInvoices,
  receivedInvoices,
  onClose,
  onSave,
}: ContactSlideOverProps) {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [activity, setActivity] = useState<ActivityType>(defaultActivity);
  const [defaultIva, setDefaultIva] = useState<IvaRate>(21);
  const [defaultIrpf, setDefaultIrpf] = useState<IrpfRate>(15);
  const [status, setStatus] = useState<ContactStatus>('Activo');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    if (contact) {
      setName(contact.name);
      setNif(contact.nif);
      setEmail(contact.email);
      setAddress(contact.address);
      setActivity(contact.activity);
      setDefaultIva(contact.defaultIva);
      setDefaultIrpf(contact.defaultIrpf);
      setStatus(contact.status);
      setNotes(contact.notes ?? '');
    } else {
      setName('');
      setNif('');
      setEmail('');
      setAddress('');
      setActivity(defaultActivity);
      setDefaultIva(defaultActivity === 'Actividad Artística' ? 10 : 21);
      setDefaultIrpf(kind === 'cliente' ? 15 : 0);
      setStatus('Activo');
      setNotes('');
    }
    setErrors({});
  }, [isOpen, contact, defaultActivity, kind]);

  if (!isOpen) return null;

  const isNew = !contact;
  const labelSingular = kind === 'cliente' ? 'Cliente' : 'Proveedor';

  const linkedDocuments = contact
    ? kind === 'cliente'
      ? issuedInvoices
          .filter((i) => i.clientId === contact.id)
          .slice(0, 4)
          .map((i) => ({
            id: i.id,
            number: i.number,
            date: i.issueDate,
            amount: getIssuedInvoiceTotals(i).total,
            status: i.status,
          }))
      : receivedInvoices
          .filter((r) => r.supplierId === contact.id)
          .slice(0, 4)
          .map((r) => ({
            id: r.id,
            number: r.number,
            date: r.issueDate,
            amount: getReceivedInvoiceTotals(r).total,
            status: r.status,
          }))
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = 'Introduce el nombre o razón social.';
    }
    if (!nif.trim() || nif.trim().length < 8) {
      nextErrors.nif = 'Introduce un NIF o CIF válido (mín. 8 caracteres).';
    }
    if (!email.trim() || !email.includes('@')) {
      nextErrors.email = 'Introduce un correo electrónico válido.';
    }
    if (!address.trim()) {
      nextErrors.address = 'Introduce la dirección fiscal.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const saved: Contact = {
      id: contact ? contact.id : `${kind === 'cliente' ? 'cli' : 'sup'}-${Date.now()}`,
      kind,
      name: name.trim(),
      nif: nif.trim().toUpperCase(),
      email: email.trim(),
      address: address.trim(),
      activity,
      defaultIva,
      defaultIrpf,
      status,
      historicalVolume: contact ? contact.historicalVolume : 0,
      notes: notes.trim() || undefined,
    };

    onSave(saved, isNew);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-slideover-title"
    >
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full max-w-[500px] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div>
            <h2
              id="contact-slideover-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
            >
              {isNew ? `Nuevo ${labelSingular}` : `Ficha de ${labelSingular}`}
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              {isNew
                ? 'Configura los datos fiscales y tipos por defecto.'
                : 'Datos fiscales, impuestos por defecto e historial.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label htmlFor="contact-name" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Nombre o razón social
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                }}
                placeholder={
                  kind === 'cliente'
                    ? 'Ej. Comunidad de Propietarios C/ Goya 54'
                    : 'Ej. Papelería Técnica Velázquez S.L.'
                }
                className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
              />
              {errors.name && (
                <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-nif" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  NIF / CIF
                </label>
                <input
                  id="contact-nif"
                  type="text"
                  value={nif}
                  onChange={(e) => {
                    setNif(e.target.value);
                    if (errors.nif) setErrors((prev) => ({ ...prev, nif: '' }));
                  }}
                  placeholder="Ej. B87312940"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] placeholder:font-sans placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
                {errors.nif && (
                  <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                    {errors.nif}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="contact-status" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Estado
                </label>
                <select
                  id="contact-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContactStatus)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="administracion@empresa.es"
                  className="w-full rounded-xl bg-[#F5F5F7] pl-10 pr-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="contact-address" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Dirección fiscal
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868B]" />
                <input
                  id="contact-address"
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (errors.address) setErrors((prev) => ({ ...prev, address: '' }));
                  }}
                  placeholder="C/ de Alcalá 42, 28014 Madrid"
                  className="w-full rounded-xl bg-[#F5F5F7] pl-10 pr-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
              </div>
              {errors.address && (
                <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                  {errors.address}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="contact-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Actividad asociada
              </label>
              <select
                id="contact-activity"
                value={activity}
                onChange={(e) => setActivity(e.target.value as ActivityType)}
                className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
              >
                <option value="Contabilidad Comunidades">Contabilidad Comunidades</option>
                <option value="Actividad Artística">Actividad Artística</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-iva" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  IVA por defecto
                </label>
                <select
                  id="contact-iva"
                  value={defaultIva}
                  onChange={(e) => setDefaultIva(Number(e.target.value) as IvaRate)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                >
                  <option value={21}>21% (General)</option>
                  <option value={10}>10% (Reducido / Arte)</option>
                  <option value={0}>0% (Exento)</option>
                </select>
              </div>

              <div>
                <label htmlFor="contact-irpf" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Retención IRPF
                </label>
                <select
                  id="contact-irpf"
                  value={defaultIrpf}
                  onChange={(e) => setDefaultIrpf(Number(e.target.value) as IrpfRate)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] tabular-nums text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                >
                  <option value={15}>15% (Profesional)</option>
                  <option value={7}>7% (Inicio actividad)</option>
                  <option value={0}>0% (Sin retención)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="contact-notes" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Notas internas
              </label>
              <textarea
                id="contact-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condiciones de pago, persona de contacto o detalles de facturación..."
                className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 resize-none"
              />
            </div>

            {/* Recent documents for existing contacts */}
            {!isNew && linkedDocuments.length > 0 && (
              <div className="pt-4 border-t border-black/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-[#6E6E73]" aria-hidden="true" />
                  <h3 className="text-[13px] font-semibold text-[#1D1D1F]">
                    Últimas facturas registradas
                  </h3>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {linkedDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-2.5 text-[13px]">
                      <div>
                        <p className="font-mono font-medium text-[#1D1D1F]">{doc.number}</p>
                        <p className="text-[12px] text-[#6E6E73]">{formatDateES(doc.date)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          label={doc.status}
                          tone={
                            doc.status === 'Cobrada' || doc.status === 'Contabilizada'
                              ? 'success'
                              : doc.status === 'Pendiente'
                              ? 'warning'
                              : 'neutral'
                          }
                        />
                        <span className="font-medium tabular-nums text-[#1D1D1F]">
                          {formatCurrency(doc.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
            >
              {isNew ? `Guardar ${labelSingular}` : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
