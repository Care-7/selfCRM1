import { validateSpanishTaxId } from './validators';

/**
 * Parsed representation of a contact (client or supplier) ready for database insertion or UI display.
 */
export interface ParsedContactRow {
  name: string;
  tax_id: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  iban?: string;
  payment_terms?: string;
  notes?: string;
}

export interface InvalidCsvRow {
  rowNumber: number;
  raw: Record<string, string>;
  reason: string;
}

export interface DetectedColumnMapping {
  sourceCol: string;
  targetField: string;
  confidence: string;
}

export interface CsvImportResult {
  validRows: ParsedContactRow[];
  invalidRows: InvalidCsvRow[];
  detectedColumns: DetectedColumnMapping[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

/**
 * Strips UTF-8 Byte Order Mark (BOM) if present.
 */
export function stripBom(text: string): string {
  if (!text) return '';
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Autodetects whether semicolon (;) or comma (,) is the dominant delimiter.
 * Semicolon is standard for Excel in Spanish and EU locales where comma is the decimal separator.
 */
export function detectDelimiter(text: string): ';' | ',' {
  const clean = stripBom(text);
  const firstLine = clean.split(/\r?\n/)[0] || '';

  let inQuotes = false;
  let semiCount = 0;
  let commaCount = 0;

  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ';') semiCount++;
      else if (char === ',') commaCount++;
    }
  }

  return semiCount >= commaCount ? ';' : ',';
}

/**
 * Robust CSV parser that handles:
 * - Comma and Semicolon delimiters
 * - Quoted fields with escaped quotes ("")
 * - Embedded newlines inside quotes
 * - Trimming of fields
 */
export function parseCsvText(raw: string, forcedDelimiter?: ';' | ','): { headers: string[]; rows: string[][] } {
  const text = stripBom(raw);
  if (!text.trim()) {
    return { headers: [], rows: [] };
  }

  const delimiter = forcedDelimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push last field & row if pending
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((h) => h.replace(/^["']|["']$/g, '').trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

/**
 * Normalizes a header title for tolerant matching:
 * lowercase, removes accents, removes underscores, spaces, hyphens and special characters.
 */
export function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

type ContactFieldKey =
  | 'name'
  | 'taxId'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'postalCode'
  | 'vatRate'
  | 'irpfRate'
  | 'iban'
  | 'paymentTerms'
  | 'notes';

const HEADER_SYNONYMS: Record<ContactFieldKey, string[]> = {
  name: [
    'nombre',
    'razonsocial',
    'nombreorazonsocial',
    'nombrecompleto',
    'name',
    'cliente',
    'proveedor',
    'company',
    'empresa',
    'titular',
    'denominacion',
    'denominacionsocial',
  ],
  taxId: [
    'nif',
    'cif',
    'nie',
    'nifcif',
    'cifnif',
    'taxid',
    'vat',
    'dni',
    'identificacion',
    'identificacionfiscal',
    'documento',
    'vatnumber',
  ],
  email: [
    'email',
    'correo',
    'correoelectronico',
    'mail',
    'emailcontacto',
    'emailfacturacion',
    'emaildecontacto',
  ],
  phone: [
    'telefono',
    'tel',
    'phone',
    'movil',
    'celular',
    'telefonocontacto',
    'telefonodecontacto',
  ],
  address: [
    'direccion',
    'address',
    'domicilio',
    'calle',
    'domiciliofiscal',
    'direccionfiscal',
    'fiscaladdress',
  ],
  city: ['ciudad', 'city', 'poblacion', 'municipio', 'localidad', 'provincia'],
  postalCode: ['cp', 'codigopostal', 'postalcode', 'zip', 'zipcode', 'cpostal'],
  vatRate: [
    'iva',
    'tipoiva',
    'tipoivahabitual',
    'defaultvatrate',
    'vatrate',
    'porcentajeiva',
    'ivadefecto',
    'ivahabitual',
  ],
  irpfRate: [
    'irpf',
    'retencion',
    'tipoirpf',
    'irpfrate',
    'defaultirpfrate',
    'retencionirpf',
    'irpfdefecto',
  ],
  iban: [
    'iban',
    'cuenta',
    'cuentabancaria',
    'bankaccount',
    'ccc',
    'numerocuenta',
  ],
  paymentTerms: [
    'condicionespago',
    'plazopago',
    'paymentterms',
    'formapago',
    'vencimiento',
    'diaspago',
  ],
  notes: ['notas', 'observaciones', 'notes', 'comentarios', 'descripcion'],
};

const FIELD_LABELS_ES: Record<ContactFieldKey, string> = {
  name: 'Nombre o razón social',
  taxId: 'NIF / CIF / NIE',
  email: 'Email de contacto',
  phone: 'Teléfono',
  address: 'Domicilio fiscal',
  city: 'Ciudad o municipio',
  postalCode: 'Código postal',
  vatRate: 'Tipo de IVA (%)',
  irpfRate: 'Retención de IRPF (%)',
  iban: 'Cuenta IBAN',
  paymentTerms: 'Plazo / condiciones de pago',
  notes: 'Notas y observaciones',
};

/**
 * Maps CSV headers to target contact field keys using synonyms.
 */
export function mapHeadersToFields(headers: string[]): {
  fieldIndexMap: Partial<Record<ContactFieldKey, number>>;
  detectedMappings: DetectedColumnMapping[];
} {
  const fieldIndexMap: Partial<Record<ContactFieldKey, number>> = {};
  const detectedMappings: DetectedColumnMapping[] = [];

  headers.forEach((header, idx) => {
    const normalized = normalizeHeaderKey(header);
    if (!normalized) return;

    for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS) as [ContactFieldKey, string[]][]) {
      if (fieldIndexMap[key] === undefined && synonyms.includes(normalized)) {
        fieldIndexMap[key] = idx;
        detectedMappings.push({
          sourceCol: header,
          targetField: FIELD_LABELS_ES[key],
          confidence: synonyms[0] === normalized ? '100%' : '95%',
        });
        break;
      }
    }
  });

  return { fieldIndexMap, detectedMappings };
}

/**
 * Parses numeric tax percentage (handling Spanish comma decimals, e.g. "21,00%" -> 21.00).
 */
function parsePercentage(val: string | undefined, defaultVal: number): number {
  if (val === undefined || val === null || val.trim() === '') {
    return defaultVal;
  }
  const clean = val.replace('%', '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return Number.isFinite(num) && num >= 0 ? num : defaultVal;
}

/**
 * Parses and validates an entire CSV string for Contacts (Clients or Suppliers).
 * Performs row-by-row validation, NIF checksum checks, and duplicate detection.
 */
export function parseAndValidateContactsCsv(
  rawCsv: string,
  kind: 'cliente' | 'proveedor' = 'cliente'
): CsvImportResult {
  const { headers, rows } = parseCsvText(rawCsv);

  if (headers.length === 0 || rows.length === 0) {
    return {
      validRows: [],
      invalidRows: [],
      detectedColumns: [],
      summary: { total: 0, valid: 0, invalid: 0, duplicates: 0 },
    };
  }

  const { fieldIndexMap, detectedMappings } = mapHeadersToFields(headers);

  const nameIdx = fieldIndexMap.name;
  const taxIdIdx = fieldIndexMap.taxId;

  // Fallback: If no headers matched explicitly, inspect column positions
  const actualNameIdx = nameIdx ?? 0;
  const actualTaxIdIdx = taxIdIdx ?? (headers.length > 1 ? 1 : -1);

  const validRows: ParsedContactRow[] = [];
  const invalidRows: InvalidCsvRow[] = [];
  const seenNifs = new Set<string>();
  let duplicatesCount = 0;

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2; // 1-based index (+1 for header row)
    const rawRecord: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawRecord[h] = row[i] || '';
    });

    const rawName = actualNameIdx >= 0 ? row[actualNameIdx]?.trim() : '';
    const rawTaxId = actualTaxIdIdx >= 0 ? row[actualTaxIdIdx]?.trim() : '';

    // Check mandatory name
    if (!rawName) {
      invalidRows.push({
        rowNumber,
        raw: rawRecord,
        reason: 'El nombre o razón social es obligatorio.',
      });
      return;
    }

    // Check mandatory tax ID & validate format
    if (!rawTaxId) {
      invalidRows.push({
        rowNumber,
        raw: rawRecord,
        reason: 'El NIF/CIF/NIE es obligatorio.',
      });
      return;
    }

    const taxValidation = validateSpanishTaxId(rawTaxId);
    if (!taxValidation.isValid) {
      invalidRows.push({
        rowNumber,
        raw: rawRecord,
        reason: `NIF/CIF no válido (${rawTaxId}): ${taxValidation.errorMessage || 'Formato incorrecto'}`,
      });
      return;
    }

    const normalizedTaxId = taxValidation.formatted;

    // Intra-file duplicate check
    if (seenNifs.has(normalizedTaxId)) {
      duplicatesCount++;
      invalidRows.push({
        rowNumber,
        raw: rawRecord,
        reason: `NIF duplicado en el mismo archivo (${normalizedTaxId}). Se omite la fila repetida.`,
      });
      return;
    }
    seenNifs.add(normalizedTaxId);

    // Parse additional fields
    const email = fieldIndexMap.email !== undefined ? row[fieldIndexMap.email]?.trim() : undefined;
    const phone = fieldIndexMap.phone !== undefined ? row[fieldIndexMap.phone]?.trim() : undefined;
    const address = fieldIndexMap.address !== undefined ? row[fieldIndexMap.address]?.trim() : undefined;
    const city = fieldIndexMap.city !== undefined ? row[fieldIndexMap.city]?.trim() : undefined;
    const postalCode = fieldIndexMap.postalCode !== undefined ? row[fieldIndexMap.postalCode]?.trim() : undefined;
    const iban = fieldIndexMap.iban !== undefined ? row[fieldIndexMap.iban]?.trim() : undefined;
    const paymentTerms = fieldIndexMap.paymentTerms !== undefined ? row[fieldIndexMap.paymentTerms]?.trim() : undefined;
    const notes = fieldIndexMap.notes !== undefined ? row[fieldIndexMap.notes]?.trim() : undefined;

    const defaultVat = parsePercentage(
      fieldIndexMap.vatRate !== undefined ? row[fieldIndexMap.vatRate] : undefined,
      21.00
    );
    const defaultIrpf = parsePercentage(
      fieldIndexMap.irpfRate !== undefined ? row[fieldIndexMap.irpfRate] : undefined,
      kind === 'cliente' ? 0.00 : 0.00
    );

    validRows.push({
      name: rawName,
      tax_id: normalizedTaxId,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      city: city || undefined,
      postal_code: postalCode || undefined,
      country: 'ES',
      default_vat_rate: defaultVat,
      default_irpf_rate: defaultIrpf,
      iban: iban || undefined,
      payment_terms: paymentTerms || undefined,
      notes: notes || undefined,
    });
  });

  return {
    validRows,
    invalidRows,
    detectedColumns: detectedMappings,
    summary: {
      total: rows.length,
      valid: validRows.length,
      invalid: invalidRows.length,
      duplicates: duplicatesCount,
    },
  };
}

/**
 * Generates official Spanish CSV template with UTF-8 BOM and semicolon delimiters.
 */
export function generateCsvTemplate(kind: 'clientes' | 'proveedores' | 'facturas'): string {
  const BOM = '\uFEFF';

  if (kind === 'clientes') {
    const headers = [
      'Nombre_Fiscal',
      'NIF_CIF',
      'Email',
      'Telefono',
      'Direccion',
      'Codigo_Postal',
      'Ciudad',
      'Tipo_IVA',
      'Retencion_IRPF',
      'IBAN',
      'Condiciones_Pago',
      'Notas',
    ].join(';');

    const sampleRow1 = [
      '"Asociación Cultural Bellas Artes Madrid"',
      '"G28491827"',
      '"contacto@culturamadridartes.es"',
      '"915550101"',
      '"C/ Serrano 54"',
      '"28001"',
      '"Madrid"',
      '10',
      '0',
      '"ES9121000418450200051332"',
      '"30 días fecha factura"',
      '"Cliente preferente catálogo"',
    ].join(';');

    const sampleRow2 = [
      '"Comunidad Residencial Puerta de Hierro 12"',
      '"H28192847"',
      '"administracion@puertahierro12.org"',
      '"916660202"',
      '"C/ Puerta de Hierro 12"',
      '"28035"',
      '"Madrid"',
      '21',
      '0',
      '""',
      '"Transferencia 15 días"',
      '"Contabilidad Comunidades"',
    ].join(';');

    return `${BOM}${headers}\n${sampleRow1}\n${sampleRow2}\n`;
  }

  if (kind === 'proveedores') {
    const headers = [
      'Nombre_Fiscal',
      'NIF_CIF',
      'Email',
      'Telefono',
      'Direccion',
      'Codigo_Postal',
      'Ciudad',
      'Tipo_IVA',
      'Retencion_IRPF',
      'IBAN',
      'Notas',
    ].join(';');

    const sampleRow1 = [
      '"Papelería Técnica & Bellas Artes Minerva S.L."',
      '"B82910480"',
      '"pedidos@minervabellasartes.es"',
      '"914440303"',
      '"C/ Barquillo 19"',
      '"28004"',
      '"Madrid"',
      '21',
      '0',
      '"ES9121000418450200051332"',
      '"Material técnico y suministros"',
    ].join(';');

    const sampleRow2 = [
      '"Servicios Informáticos FincasNet S.L."',
      '"B85910289"',
      '"facturacion@fincasnet.es"',
      '"913330404"',
      '"Av. Brasil 14"',
      '"28020"',
      '"Madrid"',
      '21',
      '0',
      '""',
      '"Servicios de software"',
    ].join(';');

    return `${BOM}${headers}\n${sampleRow1}\n${sampleRow2}\n`;
  }

  // Facturas template
  const headers = [
    'Numero_Factura',
    'NIF_Cliente',
    'Nombre_Cliente',
    'Fecha_Emision',
    'Fecha_Vencimiento',
    'Concepto',
    'Base_Imponible',
    'Tipo_IVA',
    'Retencion_IRPF',
  ].join(';');

  const sampleRow1 = [
    '"HIST-2025-089"',
    '"H28491023"',
    '"Comunidad de Propietarios C/ Alcalá 42"',
    '"2025-11-15"',
    '"2025-12-15"',
    '"Honorarios administración ejercicio anterior"',
    '950',
    '21',
    '15',
  ].join(';');

  return `${BOM}${headers}\n${sampleRow1}\n`;
}
