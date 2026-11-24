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
  const cells: boolean[][] = Array.from({ length: modules }, () =>
    Array.from({ length: modules }, () => false)
  );

  const drawFinder = (startRow: number, startCol: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        cells[startRow + r][startCol + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, modules - 7);
  drawFinder(modules - 7, 0);

  // Deterministic pseudo-random fill for data modules
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }

  const inFinderZone = (r: number, c: number) =>
    (r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8);

  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (inFinderZone(r, c)) continue;
      if (r === 6 || c === 6) {
        cells[r][c] = (r + c) % 2 === 0;
        continue;
      }
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      cells[r][c] = (state & 0x7) < 4;
    }
  }

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
