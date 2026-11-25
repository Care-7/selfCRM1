import { generateQrMatrix } from '../utils/verifactu';

interface VeriFactuQrProps {
  seed: string;
  size?: number;
}

/**
 * Generates a crisp deterministic 21x21 QR-like SVG matrix with standard 3 finder patterns
 * for realistic VeriFactu AEAT invoice previews without external requests.
 */
export function VeriFactuQr({ seed, size = 108 }: VeriFactuQrProps) {
  const modules = 21;
  const cells = generateQrMatrix(seed);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${modules + 2} ${modules + 2}`}
      role="img"
      aria-label={`Código QR VeriFactu ${seed}`}
      className="rounded-xl bg-white p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    >
      <rect width={modules + 2} height={modules + 2} fill="#FFFFFF" />
      {cells.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c + 1}
              y={r + 1}
              width={1}
              height={1}
              rx={0.15}
              fill="#1D1D1F"
            />
          ) : null
        )
      )}
    </svg>
  );
}
