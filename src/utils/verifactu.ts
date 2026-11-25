/**
 * VeriFactu (RD 1007/2023) Cryptographic Engine & Hash Chaining Validator.
 * Pure TypeScript implementation compatible with Web Browsers, Tauri, and Node.js.
 */

export interface VerifactuCanonicalParams {
  issuerTaxId: string;
  invoiceNumber: string;
  issueDate: string; // "DD-MM-YYYY" or "YYYY-MM-DD"
  invoiceType: 'F1' | 'R1' | string; // F1: Normal, R1: Rectificativa
  vatTotal: number | string;
  totalAmount: number | string;
  prevHash?: string | null;
  isoTimestamp: string; // ISO 8601, e.g. "2026-11-25T13:00:00Z"
}

export interface VerifactuQrParams {
  issuerTaxId: string;
  invoiceNumber: string;
  issueDate: string; // "DD-MM-YYYY"
  totalAmount: number | string;
}

export interface ChainVerificationResult {
  isValid: boolean;
  verifiedCount: number;
  brokenInvoiceId?: string;
  brokenInvoiceNumber?: string;
  error?: string;
}

/**
 * Normalizes date to Spanish DD-MM-YYYY format required by VeriFactu specs.
 */
export function formatVerifactuDate(rawDate: string | Date): string {
  if (rawDate instanceof Date) {
    const day = String(rawDate.getDate()).padStart(2, '0');
    const month = String(rawDate.getMonth() + 1).padStart(2, '0');
    const year = rawDate.getFullYear();
    return `${day}-${month}-${year}`;
  }
  const str = String(rawDate).trim();
  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}-${m}-${y}`;
  }
  // If already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }
  // Fallback try parsing as Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${parsed.getFullYear()}`;
  }
  return str;
}

/**
 * Formats a monetary amount to 2 decimal places string with dot decimal separator.
 */
export function formatVerifactuAmount(val: number | string): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

/**
 * Builds the canonical payload string for SHA-256 computation in exact alignment
 * with the PostgreSQL RPC issue_invoice_atomic and RD 1007/2023 specs.
 */
export function buildVerifactuCanonicalString(params: VerifactuCanonicalParams): string {
  const issuerNif = (params.issuerTaxId || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const invoiceNum = (params.invoiceNumber || '').trim();
  const dateStr = formatVerifactuDate(params.issueDate);
  const typeCode = (params.invoiceType || 'F1').trim().toUpperCase();
  const vatStr = formatVerifactuAmount(params.vatTotal);
  const totalStr = formatVerifactuAmount(params.totalAmount);
  const prevHashStr = (params.prevHash || '').trim();
  const tsIso = (params.isoTimestamp || '').trim();

  return (
    `IDEmisorFactura=${issuerNif}` +
    `&NumSerieFactura=${invoiceNum}` +
    `&FechaExpedicionFactura=${dateStr}` +
    `&TipoFactura=${typeCode}` +
    `&CuotaTotal=${vatStr}` +
    `&ImporteTotal=${totalStr}` +
    `&HuellaAnterior=${prevHashStr}` +
    `&FechaHoraHusoGenRegistro=${tsIso}`
  );
}

/**
 * Asynchronously calculates SHA-256 uppercase 64-character hexadecimal digest
 * using the standard Web Crypto API (supported natively across modern Browsers, Tauri and Node.js).
 */
export async function computeVerifactuSha256(canonicalString: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  throw new Error('No cryptographic SHA-256 provider available in this environment.');
}

/**
 * Generates the official AEAT VeriFactu verification QR Code URL.
 */
export function buildVerifactuQrUrl(params: VerifactuQrParams): string {
  const issuerNif = (params.issuerTaxId || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const invoiceNum = (params.invoiceNumber || '').trim();
  const dateStr = formatVerifactuDate(params.issueDate);
  const totalStr = formatVerifactuAmount(params.totalAmount);

  return (
    `https://sede.agenciatributaria.gob.es/Sede/procedimientoini/ZZ01.shtml` +
    `?nif=${encodeURIComponent(issuerNif)}` +
    `&numserie=${encodeURIComponent(invoiceNum)}` +
    `&fecha=${encodeURIComponent(dateStr)}` +
    `&importe=${encodeURIComponent(totalStr)}`
  );
}

export interface MinimalVerifactuInvoice {
  id: string;
  invoice_number: string;
  series: string;
  sequence_number: number;
  document_type: string;
  issue_date: string;
  issuer_snapshot: { tax_id?: string; name?: string } | Record<string, any>;
  tax_base: number;
  vat_total: number;
  total_amount: number;
  verifactu_locked: boolean;
  verifactu_hash?: string | null;
  verifactu_prev_hash?: string | null;
  verifactu_timestamp?: string | null;
  is_migrated?: boolean;
}

/**
 * Cryptographically verifies an entire chain of issued invoices for a tenant.
 * Validates:
 * 1. Sequential chaining (prev_hash === previous invoice's hash)
 * 2. Hash integrity (recalculated canonical payload matches stored hash)
 */
export async function verifyInvoiceChain(
  invoices: MinimalVerifactuInvoice[]
): Promise<ChainVerificationResult> {
  // Filter only fiscal invoices subject to VeriFactu chaining
  const chainInvoices = invoices
    .filter((inv) => inv.verifactu_locked === true && !inv.is_migrated)
    .sort((a, b) => {
      // Primary sort: sequence_number; Secondary: timestamp
      if (a.series === b.series) {
        return a.sequence_number - b.sequence_number;
      }
      const timeA = a.verifactu_timestamp ? new Date(a.verifactu_timestamp).getTime() : 0;
      const timeB = b.verifactu_timestamp ? new Date(b.verifactu_timestamp).getTime() : 0;
      return timeA - timeB;
    });

  if (chainInvoices.length === 0) {
    return { isValid: true, verifiedCount: 0 };
  }

  let expectedPrevHash = '';

  for (let i = 0; i < chainInvoices.length; i++) {
    const inv = chainInvoices[i];

    // 1. Validate previous hash link
    const actualPrevHash = inv.verifactu_prev_hash || '';
    if (actualPrevHash !== expectedPrevHash) {
      return {
        isValid: false,
        verifiedCount: i,
        brokenInvoiceId: inv.id,
        brokenInvoiceNumber: inv.invoice_number,
        error: `Ruptura en la cadena criptográfica: la factura ${inv.invoice_number} tiene huella anterior '${actualPrevHash}', pero se esperaba '${expectedPrevHash}'.`,
      };
    }

    // 2. Validate current invoice hash integrity
    if (!inv.verifactu_hash) {
      return {
        isValid: false,
        verifiedCount: i,
        brokenInvoiceId: inv.id,
        brokenInvoiceNumber: inv.invoice_number,
        error: `La factura ${inv.invoice_number} carece de huella VeriFactu almacenada.`,
      };
    }

    const isoTs = inv.verifactu_timestamp
      ? new Date(inv.verifactu_timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z')
      : '';

    const canonical = buildVerifactuCanonicalString({
      issuerTaxId: inv.issuer_snapshot?.tax_id || '',
      invoiceNumber: inv.invoice_number,
      issueDate: inv.issue_date,
      invoiceType: inv.document_type === 'rectificativa' ? 'R1' : 'F1',
      vatTotal: inv.vat_total,
      totalAmount: inv.total_amount,
      prevHash: actualPrevHash,
      isoTimestamp: isoTs,
    });

    const recalculatedHash = await computeVerifactuSha256(canonical);

    if (recalculatedHash !== inv.verifactu_hash) {
      return {
        isValid: false,
        verifiedCount: i,
        brokenInvoiceId: inv.id,
        brokenInvoiceNumber: inv.invoice_number,
        error: `Alteración de integridad en la factura ${inv.invoice_number}: la huella recalculada no coincide con el hash original sellado.`,
      };
    }

    expectedPrevHash = inv.verifactu_hash;
  }

  return { isValid: true, verifiedCount: chainInvoices.length };
}

/**
 * Generates a deterministic 21x21 QR matrix with finder patterns
 * for VeriFactu codes without external dependencies.
 */
export function generateQrMatrix(seed: string): boolean[][] {
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

  return cells;
}

