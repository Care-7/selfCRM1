import React, { useState } from 'react';
import { ShieldCheck, ExternalLink, Copy, Check, Link2 } from 'lucide-react';
import { VeriFactuQr } from './VeriFactuQr';
import { formatDateES } from '../utils/finance';

interface VerifactuBadgeCardProps {
  invoiceNumber: string;
  hash?: string | null;
  prevHash?: string | null;
  timestamp?: string | null;
  qrUrl?: string | null;
  compact?: boolean;
}

export function VerifactuBadgeCard({
  invoiceNumber,
  hash,
  prevHash,
  timestamp,
  qrUrl,
  compact = false,
}: VerifactuBadgeCardProps) {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return null;
  }

  const handleCopyHash = () => {
    if (!hash) return;
    navigator.clipboard?.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedTimestamp = timestamp
    ? new Date(timestamp).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#F5F5F7]/80 px-3 py-2 text-[12px]">
        <ShieldCheck className="h-4 w-4 text-[#0071E3] shrink-0" />
        <span className="font-medium text-[#1D1D1F]">VeriFactu sellada</span>
        <span className="text-[#86868B] font-mono text-[11px] truncate max-w-[140px]">
          {hash.slice(0, 8)}…{hash.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071E3]/10 text-[#0071E3]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-[14px] font-semibold text-[#1D1D1F]">
              Sellado Digital VeriFactu
            </h4>
            <p className="text-[12px] text-[#6E6E73]">
              Reglamento RD 1007/2023 · Encadenamiento SHA-256
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-2 py-0.5 text-[11px] font-medium text-[#1D7A3F]">
          Inmutable
        </span>
      </div>

      {/* Main Content: Local QR + Cryptographic details */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pt-1">
        {/* Offline SVG QR Code */}
        <div className="shrink-0 flex flex-col items-center">
          <VeriFactuQr seed={qrUrl || hash} size={112} />
          <span className="mt-1 text-[10px] text-[#86868B] tracking-wider uppercase font-medium">
            Cotejo AEAT
          </span>
        </div>

        {/* Cryptographic Hashes & Audit Trail */}
        <div className="flex-1 min-w-0 space-y-2.5 text-[12px]">
          {/* Current invoice hash */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[#6E6E73] font-medium">Huella digital SHA-256</span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 text-[11px] text-[#0071E3] hover:underline"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-[#34C759]" />
                    <span>Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
            <p className="font-mono text-[11px] text-[#1D1D1F] bg-[#F5F5F7] p-2 rounded-xl break-all select-all">
              {hash}
            </p>
          </div>

          {/* Previous chained hash */}
          <div>
            <span className="text-[#6E6E73] font-medium block mb-1">
              Huella encadenada anterior
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#6E6E73] bg-[#F5F5F7] px-2.5 py-1.5 rounded-xl">
              <Link2 className="h-3.5 w-3.5 text-[#0071E3] shrink-0" />
              {prevHash ? (
                <span className="truncate">{prevHash}</span>
              ) : (
                <span className="text-[#86868B] italic">Génesis de cadena (Primera factura del ejercicio)</span>
              )}
            </div>
          </div>

          {/* Timestamp and AEAT verification link */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[#6E6E73]">
            {formattedTimestamp && (
              <span className="tabular-nums">
                Fecha sellado: <strong className="text-[#1D1D1F]">{formattedTimestamp}</strong>
              </span>
            )}

            {qrUrl && (
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#0071E3] hover:underline"
              >
                <span>Verificar en Sede AEAT</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
