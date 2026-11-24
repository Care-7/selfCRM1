import { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import type { TaxRegime, UserProfile } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSaveProfile: (next: UserProfile) => void;
}

export function SettingsModal({
  isOpen,
  profile,
  onClose,
  onSaveProfile,
}: SettingsModalProps) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [nif, setNif] = useState(profile.nif);
  const [email, setEmail] = useState(profile.email);
  const [address, setAddress] = useState(profile.address);
  const [regime, setRegime] = useState<TaxRegime>(profile.regime);
  const [veriFactuEnabled, setVeriFactuEnabled] = useState(profile.veriFactuEnabled);

  useEffect(() => {
    if (!isOpen) return;
    setFullName(profile.fullName);
    setNif(profile.nif);
    setEmail(profile.email);
    setAddress(profile.address);
    setRegime(profile.regime);
    setVeriFactuEnabled(profile.veriFactuEnabled);
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
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

      <div className="relative z-10 flex h-full w-full max-w-[460px] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div>
            <h2
              id="settings-modal-title"
              className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
            >
              Ajustes fiscales y perfil
            </h2>
            <p className="text-[13px] text-[#6E6E73] mt-0.5">
              Identidad fiscal para facturas, series y modelos AEAT.
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

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label htmlFor="set-name" className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                Nombre del titular
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
      </div>
    </div>
  );
}
