import { CheckCircle2, Clock, FileEdit, Lock, ShieldCheck, AlertCircle } from 'lucide-react';

export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral' | 'accent';

const TONE_STYLES: Record<BadgeTone, string> = {
  success: 'bg-[#E8F8EE] text-[#1D7A3F]',
  warning: 'bg-[#FFF4E5] text-[#B25E09]',
  error: 'bg-[#FDECEC] text-[#C92A2A]',
  neutral: 'bg-black/[0.05] text-[#6E6E73]',
  accent: 'bg-[#0071E3]/[0.09] text-[#0071E3]',
};

interface StatusBadgeProps {
  label: string;
  tone: BadgeTone;
  icon?: 'check' | 'clock' | 'draft' | 'alert';
}

export function StatusBadge({ label, tone, icon }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium leading-none ${TONE_STYLES[tone]}`}
    >
      {icon === 'check' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {icon === 'clock' && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {icon === 'draft' && <FileEdit className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {icon === 'alert' && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

interface VeriFactuBadgeProps {
  locked: boolean;
  compact?: boolean;
}

export function VeriFactuBadge({ locked, compact = false }: VeriFactuBadgeProps) {
  if (locked) {
    return (
      <span
        title="Factura emitida e inmutable registrada en sistema VeriFactu (AEAT)"
        className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg bg-[#0071E3]/[0.08] px-2 py-1 text-[11px] font-semibold tracking-[0.01em] text-[#0071E3]"
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>VeriFactu</span>
        {!compact && <Lock className="h-3 w-3 opacity-75 shrink-0" aria-hidden="true" />}
      </span>
    );
  }

  return (
    <span
      title="Borrador editable todavía no sellado en VeriFactu"
      className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg bg-black/[0.045] px-2 py-1 text-[11px] font-medium text-[#6E6E73]"
    >
      <FileEdit className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Sin sellar</span>
    </span>
  );
}
