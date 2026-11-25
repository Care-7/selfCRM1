import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck, Mail, Lock, User, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Por favor, introduce tu correo electrónico.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setErrorMessage('Por favor, indica tu nombre o razón social.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setErrorMessage('El correo electrónico o la contraseña no son correctos.');
          } else if (error.message.includes('Email not confirmed')) {
            setErrorMessage('Tu cuenta aún no ha sido confirmada. Revisa tu bandeja de entrada.');
          } else {
            setErrorMessage(error.message || 'Error al iniciar sesión. Inténtalo de nuevo.');
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          if (error.message.includes('User already registered')) {
            setErrorMessage('Este correo ya está registrado. Cambia a «Iniciar sesión».');
          } else {
            setErrorMessage(error.message || 'No se pudo crear la cuenta.');
          }
        } else if (data.session) {
          // Auto signed in (if email confirmation is turned off in project)
          setInfoMessage('Cuenta creada correctamente. Iniciando sesión...');
        } else if (data.user && !data.session) {
          // Email confirmation is required
          setInfoMessage('¡Cuenta creada! Hemos enviado un correo de confirmación a tu dirección.');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado de conexión.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3] text-white shadow-[0_4px_12px_rgba(0,113,227,0.3)] mb-3">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#1D1D1F]">
          SelfSME
        </h1>
        <p className="text-[13px] text-[#6E6E73] mt-1">
          Facturación, contabilidad y fiscalidad para autónomos y PYMEs
        </p>
      </div>

      {/* Auth Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-[420px] px-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/[0.04]">
          {/* iOS Segmented Control */}
          <div className="flex rounded-xl bg-[#F5F5F7] p-1 mb-6" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition-all ${
                mode === 'login'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setInfoMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition-all ${
                mode === 'signup'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-[#FF3B30]/10 p-3.5 text-[13px] text-[#D70015]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-[#34C759]/10 p-3.5 text-[13px] text-[#248A3D]">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">
                  Nombre completo o Razón Social
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868B]" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. María García o Estudio SL"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl bg-[#F5F5F7] py-2.5 pl-10 pr-3.5 text-[14px] text-[#1D1D1F] placeholder-[#86868B] border border-transparent transition-colors focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-[#1D1D1F] mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868B]" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] py-2.5 pl-10 pr-3.5 text-[14px] text-[#1D1D1F] placeholder-[#86868B] border border-transparent transition-colors focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-medium text-[#1D1D1F]">
                  Contraseña
                </label>
                <span className="text-[11px] text-[#86868B]">Mín. 6 caracteres</span>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868B]" />
                <input
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-[#F5F5F7] py-2.5 pl-10 pr-3.5 text-[14px] text-[#1D1D1F] placeholder-[#86868B] border border-transparent transition-colors focus:bg-white focus:border-[#0071E3] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0071E3] py-3 text-[14px] font-medium text-white shadow-[0_2px_8px_rgba(0,113,227,0.3)] transition-all hover:bg-[#0077ED] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Acceder a mi cuenta' : 'Crear espacio de trabajo'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 text-center text-[12px] text-[#86868B]">
            Aislamiento de datos con Row Level Security (RLS) en Supabase
          </div>
        </div>
      </div>
    </div>
  );
}
