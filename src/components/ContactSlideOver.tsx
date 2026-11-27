import { useEffect, useState } from 'react';
import { X, Mail, MapPin, FileText, Loader2, Trash2, Archive, ArchiveRestore, BookOpen } from 'lucide-react';
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
import { validateSpanishTaxId } from '../utils/validators';
import { StatusBadge } from './StatusBadge';

interface ContactSlideOverProps {
  isOpen: boolean;
  kind: ContactKind;
  contact: Contact | null; // null = create new
  defaultActivity: ActivityType;
  availableActivities?: Array<{ id: string; name: string }>;
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  onClose: () => void;
  onSave: (contact: Contact, isNew: boolean) => Promise<boolean | void> | void;
  onDelete?: (id: string, kind: ContactKind) => Promise<void> | void;
  onArchive?: (id: string, kind: ContactKind, isActive: boolean) => Promise<void> | void;
  onOpenLedger?: (contact: Contact) => void;
}

export function ContactSlideOver({
  isOpen,
  kind,
  contact,
  defaultActivity,
  availableActivities = [],
  issuedInvoices,
  receivedInvoices,
  onClose,
  onSave,
  onDelete,
  onArchive,
  onOpenLedger,
}: ContactSlideOverProps) {
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [activity, setActivity] = useState<ActivityType>(defaultActivity);
  const [activityId, setActivityId] = useState<string | undefined>(contact?.activityId);
  const [defaultIva, setDefaultIva] = useState<IvaRate>(21);
  const [defaultIrpf, setDefaultIrpf] = useState<IrpfRate>(15);
  const [status, setStatus] = useState<ContactStatus>('Activo');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Normalize activity options
  const activityList =
    availableActivities.length > 0
      ? availableActivities
      : [
          { id: 'act-cc', name: 'Contabilidad Comunidades' },
          { id: 'act-ar', name: 'Actividad Artística' },
        ];

  useEffect(() => {
    if (!isOpen) return;
    if (contact) {
      setName(contact.name);
      setNif(contact.nif);
      setAccountCode(contact.accountCode ?? '');
      setEmail(contact.email);
      setPhone(contact.phone || '');
      setAddress(contact.address);
      setActivity(contact.activity);
      setActivityId(contact.activityId);
      setDefaultIva(contact.defaultIva);
      setDefaultIrpf(contact.defaultIrpf);
      setStatus(contact.status);
      setNotes(contact.notes ?? '');
    } else {
      setName('');
      setNif('');
      setAccountCode('');
      setEmail('');
      setPhone('');
      setAddress('');
      const initialActName = defaultActivity || activityList[0]?.name || 'Actividad Principal';
      const initialActItem = activityList.find((a) => a.name === initialActName) || activityList[0];
      setActivity(initialActItem ? initialActItem.name : initialActName);
      setActivityId(initialActItem && !initialActItem.id.startsWith('act-') ? initialActItem.id : undefined);
      setDefaultIva(initialActName === 'Actividad Artística' ? 10 : 21);
      setDefaultIrpf(kind === 'cliente' ? 15 : 0);
      setStatus('Activo');
      setNotes('');
    }
    setErrors({});
    setConfirmDelete(false);
    setIsSubmitting(false);
    setIsDeleting(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = 'Introduce el nombre o razón social.';
    }

    let cleanedNif = '';
    const trimmedNif = nif.trim();
    if (trimmedNif) {
      const nifValidation = validateSpanishTaxId(trimmedNif);
      if (!nifValidation.isValid) {
        nextErrors.nif = nifValidation.errorMessage || 'Introduce un NIF, NIE o CIF español válido.';
      } else {
        cleanedNif = nifValidation.formatted;
      }
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
      nif: cleanedNif,
      accountCode: accountCode.trim() || undefined,
      email: email.trim(),
      phone: phone.trim() || undefined,
      address: address.trim(),
      activity,
      activityId,
      defaultIva,
      defaultIrpf,
      status,
      historicalVolume: contact ? contact.historicalVolume : 0,
      notes: notes.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      setErrors({});
      await onSave(saved, isNew);
      onClose();
    } catch (err: any) {
      setErrors({ form: err.message || 'Error al guardar el contacto.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!contact || !onArchive) return;
    try {
      setIsSubmitting(true);
      const nextActive = status !== 'Activo';
      await onArchive(contact.id, kind, nextActive);
      setStatus(nextActive ? 'Activo' : 'Inactivo');
    } catch (err: any) {
      setErrors({ form: err.message || 'Error al cambiar estado del contacto.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!contact || !onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(contact.id, kind);
      onClose();
    } catch (err: any) {
      setErrors({ form: err.message || 'Error al eliminar el contacto.' });
      setIsDeleting(false);
    }
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
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {errors.form && (
              <div className="rounded-xl bg-[#FFF5F5] border border-[#FFE3E3] p-3 text-[13px] text-[#C92A2A]">
                {errors.form}
              </div>
            )}

            <div>
              <label htmlFor="contact-name" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Nombre o razón social <span className="text-[#0071E3]">*</span>
              </label>
              <input
                id="contact-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                }}
                placeholder="Ej. Acero & Construcciones SL"
                className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
              />
              {errors.name && (
                <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-nif" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  NIF / CIF <span className="text-[12px] font-normal text-[#86868B]">(opcional)</span>
                </label>
                <input
                  id="contact-nif"
                  type="text"
                  value={nif}
                  onChange={(e) => {
                    setNif(e.target.value.toUpperCase());
                    if (errors.nif) setErrors((prev) => ({ ...prev, nif: '' }));
                  }}
                  placeholder="B12345678"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 font-mono text-[14px] uppercase tracking-wide text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
                {errors.nif && (
                  <p className="mt-1.5 text-[12px] text-[#C92A2A]" role="alert">
                    {errors.nif}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="contact-account-code" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Subcuenta PGC <span className="text-[12px] font-normal text-[#86868B]">(opcional)</span>
                </label>
                <input
                  id="contact-account-code"
                  type="text"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value.trim())}
                  placeholder={kind === 'cliente' ? '43000001' : '41000001'}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 font-mono text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-email" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Correo electrónico <span className="text-[#0071E3]">*</span>
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
                    placeholder="contacto@empresa.es"
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
                <label htmlFor="contact-phone" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Teléfono
                </label>
                <input
                  id="contact-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder:text-[#86868B] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-address" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Dirección fiscal <span className="text-[#0071E3]">*</span>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-activity" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Actividad asociada
                </label>
                <select
                  id="contact-activity"
                  value={activityId || activity}
                  onChange={(e) => {
                    const val = e.target.value;
                    const item = activityList.find((a) => a.id === val || a.name === val);
                    if (item) {
                      setActivity(item.name);
                      setActivityId(!item.id.startsWith('act-') ? item.id : undefined);
                    }
                  }}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent transition-all focus:bg-white focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15"
                >
                  {activityList.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name}
                    </option>
                  ))}
                </select>
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

            {/* Existing contact management actions (Archive & Delete) */}
            {!isNew && (
              <div className="pt-4 border-t border-black/[0.06] space-y-3">
                <h3 className="text-[13px] font-semibold text-[#1D1D1F]">
                  Acciones del {labelSingular.toLowerCase()}
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  {onOpenLedger && contact && (
                    <button
                      type="button"
                      onClick={() => onOpenLedger(contact)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#0071E3]/25 bg-[#F5FAFF] px-3 py-2 text-[12px] font-medium text-[#0071E3] shadow-[0_1px_2px_rgba(0,113,227,0.06)] hover:bg-[#EBF5FF] transition-colors"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Ver Libro Mayor
                    </button>
                  )}

                  {onArchive && (
                    <button
                      type="button"
                      onClick={handleToggleArchive}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[12px] font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#F5F5F7] transition-colors"
                    >
                      {status === 'Activo' ? (
                        <>
                          <Archive className="h-3.5 w-3.5 text-[#6E6E73]" />
                          Archivar / Desactivar
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5 text-[#0071E3]" />
                          Reactivar {labelSingular.toLowerCase()}
                        </>
                      )}
                    </button>
                  )}

                  {onDelete && (
                    confirmDelete ? (
                      <div className="inline-flex items-center gap-2 rounded-xl bg-[#FFF5F5] border border-[#FFE3E3] px-3 py-1.5 text-[12px]">
                        <span className="text-[#C92A2A] font-medium">¿Confirmas eliminar?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="rounded-lg bg-[#E03131] px-2.5 py-1 font-medium text-white hover:bg-[#C92A2A]"
                        >
                          {isDeleting ? 'Eliminando…' : 'Sí, eliminar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="rounded-lg px-2 py-1 text-[#6E6E73] hover:text-[#1D1D1F]"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#FFE3E3] bg-white px-3 py-2 text-[12px] font-medium text-[#E03131] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#FFF5F5] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[#E03131]" />
                        Eliminar
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

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
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] transition-colors hover:bg-black/[0.05] hover:text-[#1D1D1F]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] transition-colors hover:bg-[#0077ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-white" />}
              {isNew ? `Guardar ${labelSingular}` : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
