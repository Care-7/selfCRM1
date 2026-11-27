import { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  UploadCloud,
  Briefcase,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building2,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react';
import type { TaxRegime, UserProfile } from '../types';
import { useTenant } from '../context/TenantContext';
import { createActivity, toggleActivityActive, updateActivity } from '../services/activitiesService';

interface SettingsModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSaveProfile: (next: UserProfile) => void;
  onOpenMigration?: () => void;
}

export function SettingsModal({
  isOpen,
  profile,
  onClose,
  onSaveProfile,
  onOpenMigration,
}: SettingsModalProps) {
  const { organization, activities, refreshTenant, isConfigured } = useTenant();

  const [activeTab, setActiveTab] = useState<'perfil' | 'actividades'>('perfil');

  // Form states for profile
  const [fullName, setFullName] = useState(profile.fullName);
  const [nif, setNif] = useState(profile.nif);
  const [email, setEmail] = useState(profile.email);
  const [address, setAddress] = useState(profile.address);
  const [regime, setRegime] = useState<TaxRegime>(profile.regime);
  const [veriFactuEnabled, setVeriFactuEnabled] = useState(profile.veriFactuEnabled);

  // Form states for new activity
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [newActName, setNewActName] = useState('');
  const [newActIae, setNewActIae] = useState('');
  const [newActPrefix, setNewActPrefix] = useState('');
  const [newActNextNumber, setNewActNextNumber] = useState<number>(1);
  const [newActVat, setNewActVat] = useState(21);
  const [newActIrpf, setNewActIrpf] = useState(15);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFullName(profile.fullName);
    setNif(profile.nif);
    setEmail(profile.email);
    setAddress(profile.address);
    setRegime(profile.regime);
    setVeriFactuEnabled(profile.veriFactuEnabled);
    setIsAddingActivity(false);
    setNewActNextNumber(1);
    setActivityError(null);
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSubmitProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      ...profile,
      fullName: fullName.trim() || profile.fullName,
      nif: nif.trim().toUpperCase() || profile.nif,
      email: email.trim() || profile.email,
      address: address.trim() || profile.address,
      regime,
      roleLabel: regime === 'autonomo' ? 'Autónoma' : 'Sociedad Limitada',
      veriFactuEnabled,
    });
    onClose();
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivityError(null);

    if (!newActName.trim()) {
      setActivityError('El nombre de la actividad es obligatorio.');
      return;
    }
    if (!newActPrefix.trim()) {
      setActivityError('El prefijo de serie de factura es obligatorio.');
      return;
    }

    if (!isConfigured || !organization) {
      setActivityError('La gestión de actividades en base de datos requiere conexión activa con Supabase.');
      return;
    }

    setActivityLoading(true);
    try {
      await createActivity(organization.id, {
        name: newActName.trim(),
        iae_code: newActIae.trim() || null,
        invoice_series_prefix: newActPrefix.trim().toUpperCase(),
        next_invoice_number: Number(newActNextNumber) || 1,
        default_vat_rate: Number(newActVat),
        default_irpf_rate: Number(newActIrpf),
      });

      await refreshTenant();
      setIsAddingActivity(false);
      setNewActName('');
      setNewActIae('');
      setNewActPrefix('');
      setNewActNextNumber(1);
      setNewActVat(21);
      setNewActIrpf(15);
    } catch (err: any) {
      setActivityError(err.message || 'Error al crear la actividad.');
    } finally {
      setActivityLoading(false);
    }
  };

  const handleToggleActivity = async (activityId: string, currentStatus: boolean) => {
    if (!organization) return;
    setTogglingId(activityId);
    try {
      await toggleActivityActive(activityId, organization.id, !currentStatus);
      await refreshTenant();
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado de la actividad.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full w-full max-w-[500px] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div>
            <h2
              id="settings-modal-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
            >
              Ajustes y Configuración
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              Identidad fiscal, series de facturación y actividades IAE.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab segmented control */}
        <div className="px-6 pt-4 pb-2 bg-[#FBFBFD] border-b border-black/[0.04]">
          <div className="flex rounded-xl bg-[#F5F5F7] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('perfil')}
              className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all ${
                activeTab === 'perfil'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              Perfil y Fiscalidad
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('actividades')}
              className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'actividades'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              <span>Actividades IAE</span>
              {activities.length > 0 && (
                <span className="inline-flex h-5 items-center justify-center rounded-full bg-[#0071E3]/10 px-1.5 text-[11px] font-semibold text-[#0071E3] tabular-nums">
                  {activities.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'perfil' ? (
          <form onSubmit={handleSubmitProfile} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label htmlFor="set-name" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Nombre del titular o Razón Social
                </label>
                <input
                  id="set-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="set-nif" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    NIF / CIF
                  </label>
                  <input
                    id="set-nif"
                    type="text"
                    value={nif}
                    onChange={(e) => setNif(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="set-regime" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Régimen fiscal
                  </label>
                  <select
                    id="set-regime"
                    value={regime}
                    onChange={(e) => setRegime(e.target.value as TaxRegime)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value="autonomo">Autónomo (Trimestral)</option>
                    <option value="empresa">Empresa (Mensual-Anual)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="set-email" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Email de facturación
                </label>
                <input
                  id="set-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="set-address" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Domicilio fiscal
                </label>
                <input
                  id="set-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div className="rounded-2xl bg-[#F5F5F7] p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#0071E3] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">
                      Sistema VeriFactu (AEAT)
                    </p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5 leading-relaxed">
                      Bloquea las facturas emitidas con huella encadenada SHA-256 y código QR verificable.
                    </p>
                  </div>
                </div>
                <input
                  id="set-verifactu"
                  type="checkbox"
                  aria-label="Activar sellado VeriFactu"
                  checked={veriFactuEnabled}
                  onChange={(e) => setVeriFactuEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#0071E3]"
                />
              </div>

              {onOpenMigration && (
                <div className="rounded-2xl border border-black/[0.06] bg-[#F5F5F7]/70 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-[#0071E3]">
                      <UploadCloud className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1D1D1F]">
                        Asistente de migración
                      </p>
                      <p className="text-[12px] text-[#6E6E73] mt-0.5 leading-relaxed">
                        Importa clientes y proveedores con CSV nativo y plantillas para Excel.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenMigration();
                    }}
                    className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-[13px] font-medium text-[#1D1D1F] border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-[#F5F5F7] transition-all"
                  >
                    Importar datos
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED]"
              >
                Guardar ajustes
              </button>
            </div>
          </form>
        ) : (
          /* Tab: Actividades IAE */
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Organization Fiscal Summary */}
              {organization && (
                <div className="rounded-2xl border border-black/[0.06] bg-[#F5F5F7]/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-[#0071E3]" />
                    <span className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                      Organización activa
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold text-[#1D1D1F]">{organization.name}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6E6E73]">
                    <span>
                      NIF/CIF: <strong className="font-mono text-[#1D1D1F]">{organization.tax_id || 'Sin NIF'}</strong>
                    </span>
                    <span>
                      Régimen:{' '}
                      <strong className="text-[#1D1D1F]">
                        {organization.legal_form === 'sl' ? 'Sociedad Limitada' : 'Autónomo'}
                      </strong>
                    </span>
                    <span>
                      Periodicidad:{' '}
                      <strong className="text-[#1D1D1F]">
                        {organization.tax_periodicity === 'monthly' ? 'Mensual' : 'Trimestral'}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Economic Activities List */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1D1D1F]">
                    Epígrafes y Series de Facturación
                  </h3>
                  <p className="text-[12px] text-[#6E6E73] mt-0.5">
                    Series correlativas independientes y tipos por defecto (FISCAL_RULES.md).
                  </p>
                </div>
                {!isAddingActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingActivity(true);
                      setActivityError(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.2)] hover:bg-[#0077ED] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nueva actividad
                  </button>
                )}
              </div>

              {/* Inline Form to Add Activity */}
              {isAddingActivity && (
                <form
                  onSubmit={handleCreateActivity}
                  className="rounded-2xl border border-[#0071E3]/20 bg-[#F5F5F7] p-4 space-y-3.5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">
                      Nueva Actividad Económica
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingActivity(false);
                        setActivityError(null);
                      }}
                      className="text-[12px] text-[#6E6E73] hover:text-[#1D1D1F]"
                    >
                      Cancelar
                    </button>
                  </div>

                  {activityError && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#FFF2F0] p-2.5 text-[12px] text-[#D93025] border border-[#D93025]/10">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{activityError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                      Nombre de la actividad *
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Asesoría Fiscal, Creación Audiovisual"
                      value={newActName}
                      onChange={(e) => setNewActName(e.target.value)}
                      className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                        Código IAE (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="ej. 849.9, 763"
                        value={newActIae}
                        onChange={(e) => setNewActIae(e.target.value)}
                        className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                        Prefijo Serie *
                      </label>
                      <input
                        type="text"
                        placeholder="ej. CC-2026, EXP-"
                        value={newActPrefix}
                        onChange={(e) => setNewActPrefix(e.target.value.toUpperCase())}
                        className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-mono text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                        Siguiente Nº
                      </label>
                      <input
                        type="number"
                        min={1}
                        placeholder="1"
                        value={newActNextNumber}
                        onChange={(e) => setNewActNextNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-mono text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                        IVA Habitual (%)
                      </label>
                      <select
                        value={newActVat}
                        onChange={(e) => setNewActVat(Number(e.target.value))}
                        className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none tabular-nums"
                      >
                        <option value={21}>21% (General)</option>
                        <option value={10}>10% (Reducido)</option>
                        <option value={4}>4% (Superreducido)</option>
                        <option value={0}>0% (Exento)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1">
                        IRPF Habitual (%)
                      </label>
                      <select
                        value={newActIrpf}
                        onChange={(e) => setNewActIrpf(Number(e.target.value))}
                        className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none tabular-nums"
                      >
                        <option value={15}>15% (Profesional general)</option>
                        <option value={7}>7% (Nuevo autónomo)</option>
                        <option value={0}>0% (Empresarial / Sin retención)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={activityLoading}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] disabled:opacity-50"
                    >
                      {activityLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Guardar actividad
                    </button>
                  </div>
                </form>
              )}

              {/* List of existing activities */}
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <div className="p-6 text-center rounded-2xl bg-[#F5F5F7] text-[#6E6E73] text-[13px]">
                    No hay actividades registradas en la organización.
                  </div>
                ) : (
                  activities.map((act) => (
                    <div
                      key={act.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        act.is_active
                          ? 'bg-white border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                          : 'bg-[#F5F5F7]/60 border-transparent opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-[#1D1D1F] truncate">
                              {act.name}
                            </span>
                            {act.is_active ? (
                              <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-2 py-0.5 text-[11px] font-medium text-[#1D7A3F]">
                                Activa
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-medium text-[#86868B]">
                                Inactiva
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[#6E6E73]">
                            <span>
                              Serie:{' '}
                              <strong className="font-mono text-[#1D1D1F]">
                                {act.invoice_series_prefix}
                              </strong>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span>Siguiente núm:</span>
                              <input
                                type="number"
                                min={1}
                                defaultValue={act.next_invoice_number ?? 1}
                                onBlur={async (e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (organization && val > 0 && val !== act.next_invoice_number) {
                                    try {
                                      await updateActivity(act.id, organization.id, { next_invoice_number: val });
                                      await refreshTenant();
                                    } catch (err: any) {
                                      console.error('Error actualizando contador de serie:', err);
                                    }
                                  }
                                }}
                                className="w-16 rounded-lg bg-[#F5F5F7] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#1D1D1F] border border-black/[0.08] focus:bg-white focus:border-[#0071E3] focus:outline-none"
                              />
                            </span>
                            {act.iae_code && (
                              <span>
                                Epígrafe:{' '}
                                <strong className="text-[#1D1D1F]">{act.iae_code}</strong>
                              </span>
                            )}
                            <span className="tabular-nums">
                              IVA: <strong className="text-[#1D1D1F]">{act.default_vat_rate}%</strong>
                            </span>
                            <span className="tabular-nums">
                              IRPF: <strong className="text-[#1D1D1F]">{act.default_irpf_rate}%</strong>
                            </span>
                          </div>
                        </div>

                        {organization && (
                          <button
                            type="button"
                            onClick={() => handleToggleActivity(act.id, act.is_active)}
                            disabled={togglingId === act.id}
                            title={act.is_active ? 'Desactivar actividad' : 'Activar actividad'}
                            className="text-[#6E6E73] hover:text-[#1D1D1F] transition-colors p-1"
                          >
                            {togglingId === act.id ? (
                              <Loader2 className="h-5 w-5 animate-spin text-[#0071E3]" />
                            ) : act.is_active ? (
                              <ToggleRight className="h-6 w-6 text-[#0071E3]" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-[#86868B]" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-end px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED]"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
