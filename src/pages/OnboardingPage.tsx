import React, { useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { validateSpanishTaxId, prepareOnboardingActivitiesPayload, type ActivityFormInput } from '../utils/validators';
import type { LegalForm, TaxPeriodicity } from '../types/database';
import {
  Building2,
  Layers,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  Sparkles,
} from 'lucide-react';

export function OnboardingPage() {
  const { user, profile, createWorkspace, signOut } = useTenant();

  // Multi-step state: 1 = Fiscal data, 2 = Economic activities
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Fiscal data
  const [orgName, setOrgName] = useState(profile?.full_name || '');
  const [taxId, setTaxId] = useState('');
  const [legalForm, setLegalForm] = useState<LegalForm>('autonomo');
  const [taxPeriodicity, setTaxPeriodicity] = useState<TaxPeriodicity>('quarterly');

  // Step 2: Economic activities
  const [activities, setActivities] = useState<ActivityFormInput[]>([
    {
      name: 'Actividad Principal',
      iaeCode: '',
      seriesPrefix: 'FAC',
      defaultVatRate: 21,
      defaultIrpfRate: 15,
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = orgName.trim();
    if (!cleanName) {
      setErrorMessage('Por favor, indica el nombre de la empresa o profesional.');
      return;
    }

    const cleanTaxId = taxId.trim().toUpperCase();
    if (cleanTaxId) {
      const taxValidation = validateSpanishTaxId(cleanTaxId);
      if (!taxValidation.isValid) {
        setErrorMessage(taxValidation.errorMessage || 'El NIF/CIF introducido no es válido.');
        return;
      }
    }

    setStep(2);
  };

  const handleAddActivity = () => {
    const nextIdx = activities.length + 1;
    const defaultPrefix = nextIdx === 2 ? 'SEC' : `ACT${nextIdx}`;
    setActivities([
      ...activities,
      {
        name: '',
        iaeCode: '',
        seriesPrefix: defaultPrefix,
        defaultVatRate: 21,
        defaultIrpfRate: legalForm === 'sl' ? 0 : 15,
      },
    ]);
  };

  const handleRemoveActivity = (idx: number) => {
    if (activities.length <= 1) return;
    setActivities(activities.filter((_, i) => i !== idx));
  };

  const handleUpdateActivity = (idx: number, patch: Partial<ActivityFormInput>) => {
    setActivities(
      activities.map((act, i) => (i === idx ? { ...act, ...patch } : act))
    );
  };

  const handleFinishOnboarding = async () => {
    setErrorMessage(null);

    // Validate activities payload
    const prepared = prepareOnboardingActivitiesPayload(activities);
    if (!prepared.isValid) {
      setErrorMessage(prepared.error || 'Por favor, revisa los datos de las actividades.');
      return;
    }

    setLoading(true);

    try {
      await createWorkspace({
        p_org_name: orgName.trim(),
        p_tax_id: taxId.trim().toUpperCase() || null,
        p_legal_form: legalForm,
        p_tax_periodicity: taxPeriodicity,
        p_activities: prepared.payload,
      });
      // The context handles reloading tenant state and clearing needsOnboarding
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear el espacio de trabajo.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071E3] text-white shadow-[0_2px_8px_rgba(0,113,227,0.25)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
              SelfSME
            </h1>
            <p className="text-[11px] text-[#6E6E73]">Configuración inicial de espacio</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => signOut()}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F] transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Cerrar sesión ({user?.email})</span>
        </button>
      </div>

      {/* Main Wizard Container */}
      <div className="max-w-2xl mx-auto w-full my-6">
        <div className="bg-white rounded-3xl p-6 sm:p-9 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/[0.04]">
          {/* Step Progress Tracker */}
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-black/[0.05]">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                  step === 1
                    ? 'bg-[#0071E3] text-white'
                    : 'bg-[#34C759] text-white'
                }`}
              >
                {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : '1'}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[#1D1D1F]">Paso 1: Identidad Fiscal</p>
                <p className="text-[11px] text-[#86868B]">Datos del titular o sociedad</p>
              </div>
            </div>

            <div className="h-px w-10 bg-black/[0.1] hidden sm:block" />

            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                  step === 2
                    ? 'bg-[#0071E3] text-white'
                    : 'bg-[#F5F5F7] text-[#86868B]'
                }`}
              >
                2
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[#1D1D1F]">Paso 2: Actividades</p>
                <p className="text-[11px] text-[#86868B]">Epígrafes y series de facturas</p>
              </div>
            </div>
          </div>

          {/* Feedback error */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-2.5 rounded-2xl bg-[#FF3B30]/10 p-4 text-[13px] text-[#D70015]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Fiscal Information */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-5">
              <div>
                <label className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Nombre comercial o Razón Social
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. García Consultores o Estudio Creativo SL"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    NIF / CIF
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 12345678Z o B99887762"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value.toUpperCase())}
                    className="w-full rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-[14px] font-mono text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                  <p className="text-[11px] text-[#86868B] mt-1">
                    Validación oficial de formato AEAT
                  </p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                    Forma Jurídica
                  </label>
                  <select
                    value={legalForm}
                    onChange={(e) => setLegalForm(e.target.value as LegalForm)}
                    className="w-full rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-[14px] text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value="autonomo">Autónomo / Profesional</option>
                    <option value="sl">Sociedad Limitada (S.L.)</option>
                    <option value="other">Otra entidad jurídica</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#1D1D1F] mb-1.5">
                  Periodicidad Fiscal de Liquidaciones
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTaxPeriodicity('quarterly')}
                    className={`rounded-2xl p-3.5 text-left transition-all border ${
                      taxPeriodicity === 'quarterly'
                        ? 'border-[#0071E3] bg-[#0071E3]/5 ring-1 ring-[#0071E3]'
                        : 'border-black/[0.06] bg-[#F5F5F7] hover:border-black/[0.1]'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[#1D1D1F]">Trimestral</p>
                    <p className="text-[11px] text-[#6E6E73] mt-0.5">
                      Modelos 303, 130 y 111 (Estándar autónomos y PYMEs)
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxPeriodicity('monthly')}
                    className={`rounded-2xl p-3.5 text-left transition-all border ${
                      taxPeriodicity === 'monthly'
                        ? 'border-[#0071E3] bg-[#0071E3]/5 ring-1 ring-[#0071E3]'
                        : 'border-black/[0.06] bg-[#F5F5F7] hover:border-black/[0.1]'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[#1D1D1F]">Mensual</p>
                    <p className="text-[11px] text-[#6E6E73] mt-0.5">
                      Grandes empresas o REDEME (Devolución mensual)
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-xl bg-[#0071E3] px-6 py-2.5 text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-all"
                >
                  <span>Siguiente: Actividades</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Economic Activities */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-[13px] text-[#6E6E73] leading-relaxed">
                  SelfSME gestiona series de facturación independientes por cada actividad económica
                  según la normativa fiscal española (FISCAL_RULES.md).
                </p>
              </div>

              <div className="space-y-4">
                {activities.map((act, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-black/[0.06] bg-[#F5F5F7]/60 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[12px] font-semibold text-[#1D1D1F]">
                        <Layers className="h-4 w-4 text-[#0071E3]" />
                        Actividad {index + 1}
                      </span>
                      {activities.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveActivity(index)}
                          className="rounded-lg p-1 text-[#86868B] hover:text-[#FF3B30] hover:bg-black/[0.04] transition-colors"
                          title="Eliminar actividad"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-[#6E6E73] mb-1">
                          Nombre de la actividad *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ej. Contabilidad Comunidades"
                          value={act.name}
                          onChange={(e) => handleUpdateActivity(index, { name: e.target.value })}
                          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6E6E73] mb-1">
                          Epígrafe IAE (opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 842 o 763"
                          value={act.iaeCode}
                          onChange={(e) => handleUpdateActivity(index, { iaeCode: e.target.value })}
                          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-[#6E6E73] mb-1">
                          Prefijo de Serie *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={10}
                          placeholder="Ej. COM"
                          value={act.seriesPrefix}
                          onChange={(e) =>
                            handleUpdateActivity(index, { seriesPrefix: e.target.value.toUpperCase() })
                          }
                          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] font-mono font-medium text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6E6E73] mb-1">
                          IVA por defecto
                        </label>
                        <select
                          value={act.defaultVatRate}
                          onChange={(e) =>
                            handleUpdateActivity(index, { defaultVatRate: Number(e.target.value) })
                          }
                          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                        >
                          <option value={21}>21% (General)</option>
                          <option value={10}>10% (Reducido)</option>
                          <option value={4}>4% (Superreducido)</option>
                          <option value={0}>0% (Exento)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#6E6E73] mb-1">
                          IRPF por defecto
                        </label>
                        <select
                          value={act.defaultIrpfRate}
                          onChange={(e) =>
                            handleUpdateActivity(index, { defaultIrpfRate: Number(e.target.value) })
                          }
                          className="w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#1D1D1F] border border-black/[0.06] focus:border-[#0071E3] focus:outline-none"
                        >
                          <option value={15}>15% (Profesional)</option>
                          <option value={7}>7% (Nuevo autónomo)</option>
                          <option value={0}>0% (Sin retención / SL)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddActivity}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed border-black/[0.15] bg-white px-4 py-2.5 text-[13px] font-medium text-[#0071E3] hover:bg-[#F5F5F7] transition-all w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  <span>Añadir otra actividad económica</span>
                </button>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-black/[0.05]">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Volver a Datos Fiscales</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleFinishOnboarding}
                  className="flex items-center gap-2 rounded-xl bg-[#0071E3] px-6 py-2.5 text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Configurando espacio...</span>
                    </>
                  ) : (
                    <>
                      <span>Comenzar a usar SelfSME</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-2xl mx-auto text-center text-[12px] text-[#86868B]">
        SelfSME · Conforme a VeriFactu (RD 1007/2023) y normativa tributaria española
      </div>
    </div>
  );
}
