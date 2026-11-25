import { useState } from 'react';
import {
  LayoutGrid,
  Users,
  Building2,
  FileText,
  BookOpen,
  Landmark,
  Settings,
  ChevronDown,
  Layers,
  X,
  UploadCloud,
  LogOut,
} from 'lucide-react';
import type { ActivityFilter, NavSection, UserProfile } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  activityFilter: ActivityFilter;
  onChangeActivity: (activity: ActivityFilter) => void;
  activityOptions?: ActivityFilter[];
  userProfile: UserProfile;
  onOpenSettings: () => void;
  onOpenMigration?: () => void;
  onSignOut?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'inicio', label: 'Inicio', icon: LayoutGrid },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'proveedores', label: 'Proveedores', icon: Building2 },
  { id: 'facturas', label: 'Facturas', icon: FileText },
  { id: 'contabilidad', label: 'Contabilidad', icon: BookOpen },
  { id: 'impuestos', label: 'Impuestos', icon: Landmark },
];

const ACTIVITY_OPTIONS: ActivityFilter[] = [
  'Todas las actividades',
  'Contabilidad Comunidades',
  'Actividad Artística',
];

export function Sidebar({
  activeSection,
  onSelectSection,
  activityFilter,
  onChangeActivity,
  activityOptions,
  userProfile,
  onOpenSettings,
  onOpenMigration,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const optionsToRender = activityOptions && activityOptions.length > 0
    ? activityOptions
    : ACTIVITY_OPTIONS;

  const rawName = (userProfile.fullName || userProfile.email || 'U').trim();
  const nameParts = rawName.split(/[\s@._-]+/).filter(Boolean);
  const initials = (
    nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[1][0]}`
      : rawName.slice(0, 2)
  ).toUpperCase();

  const content = (
    <div className="flex h-full flex-col bg-[#FBFBFD] border-r border-black/[0.04] px-4 py-6">
      {/* Brand header */}
      <div className="flex items-center justify-between px-2 mb-6">
        <button
          type="button"
          onClick={() => {
            onSelectSection('inicio');
            onCloseMobile();
          }}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 rounded-xl"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1D1D1F] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="6" height="6" rx="1.8" fill="currentColor" />
              <rect x="10" y="2" width="6" height="6" rx="1.8" fill="#0071E3" />
              <rect x="2" y="10" width="6" height="6" rx="1.8" fill="currentColor" fillOpacity="0.45" />
              <rect x="10" y="10" width="6" height="6" rx="1.8" fill="currentColor" />
            </svg>
          </span>
          <span className="text-[19px] font-semibold tracking-[-0.025em] text-[#1D1D1F] whitespace-nowrap">
            SelfSME
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Cerrar menú"
          className="lg:hidden rounded-xl p-1.5 text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Global Activity Selector */}
      <div className="mb-6">
        <label
          htmlFor="global-activity-filter"
          className="block px-2 mb-1.5 text-[11px] font-medium text-[#6E6E73]"
        >
          Actividad activa
        </label>
        <div className="relative">
          <Layers
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0071E3]"
            aria-hidden="true"
          />
          <select
            id="global-activity-filter"
            aria-label="Filtro global de actividad"
            value={activityFilter}
            onChange={(e) => onChangeActivity(e.target.value as ActivityFilter)}
            className="w-full appearance-none rounded-xl bg-white py-2.5 pl-9 pr-8 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.05] transition-colors hover:border-black/[0.1] focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
          >
            {optionsToRender.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6E73]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Primary Navigation */}
      <nav aria-label="Navegación principal" className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 ${
                active
                  ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-black/[0.04]'
                  : 'text-[#6E6E73] hover:bg-black/[0.035] hover:text-[#1D1D1F] border border-transparent'
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                  active ? 'text-[#0071E3]' : 'text-[#86868B] group-hover:text-[#1D1D1F]'
                }`}
                strokeWidth={active ? 2.1 : 1.8}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Profile & Settings */}
      <div className="mt-6 pt-4 border-t border-black/[0.05]">
        {onOpenMigration && (
          <button
            type="button"
            onClick={() => {
              onOpenMigration();
              onCloseMobile();
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#1D1D1F] border border-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:bg-[#F5F5F7] hover:border-black/[0.08] active:scale-[0.98]"
          >
            <UploadCloud className="h-4 w-4 text-[#0071E3]" />
            <span>Importar datos</span>
          </button>
        )}
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04]">
          <div className="flex items-center gap-2.5 min-w-0">
            {!avatarFailed && userProfile.avatarUrl ? (
              <img
                src={userProfile.avatarUrl}
                alt={`Foto de perfil de ${userProfile.fullName}`}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="h-9 w-9 shrink-0 rounded-full object-cover bg-[#F5F5F7]"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[12px] font-semibold text-[#0071E3] tracking-wide">
                {initials}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#1D1D1F] leading-tight">
                {userProfile.fullName}
              </p>
              <p className="truncate text-[12px] text-[#6E6E73] leading-tight mt-0.5">
                {userProfile.roleLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Abrir ajustes fiscales y de perfil"
              title="Ajustes"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
            >
              <Settings className="h-4 w-4" />
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#86868B] transition-colors hover:bg-[#FF3B30]/10 hover:text-[#D70015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30]/40"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[264px]">
        {content}
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú lateral">
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
