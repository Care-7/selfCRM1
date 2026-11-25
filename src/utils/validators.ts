import type { CreateBusinessActivityInput } from '../types/database';

export type TaxIdType = 'NIF' | 'NIE' | 'CIF' | 'INVALID';

export interface TaxIdValidationResult {
  isValid: boolean;
  type: TaxIdType;
  formatted: string;
  errorMessage?: string;
}

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/**
 * Validates Spanish fiscal identifiers (NIF, NIE, CIF) according to AEAT rules.
 */
export function validateSpanishTaxId(raw: string): TaxIdValidationResult {
  if (!raw || typeof raw !== 'string') {
    return {
      isValid: false,
      type: 'INVALID',
      formatted: '',
      errorMessage: 'El NIF/CIF no puede estar vacío.',
    };
  }

  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, '');

  if (cleaned.length !== 9) {
    return {
      isValid: false,
      type: 'INVALID',
      formatted: cleaned,
      errorMessage: 'Debe contener exactamente 9 caracteres.',
    };
  }

  // 1. DNI / NIF personas físicas: 8 dígitos + 1 letra de control
  const nifRegex = /^[0-9]{8}[A-Z]$/;
  if (nifRegex.test(cleaned)) {
    const num = parseInt(cleaned.slice(0, 8), 10);
    const expectedLetter = NIF_LETTERS[num % 23];
    const actualLetter = cleaned[8];
    if (expectedLetter === actualLetter) {
      return { isValid: true, type: 'NIF', formatted: cleaned };
    }
    return {
      isValid: false,
      type: 'NIF',
      formatted: cleaned,
      errorMessage: `Dígito de control incorrecto (se esperaba '${expectedLetter}').`,
    };
  }

  // 2. NIE personas extranjeras: X, Y, Z + 7 dígitos + 1 letra
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
  if (nieRegex.test(cleaned)) {
    const prefix = cleaned[0];
    let prefixNum = '0';
    if (prefix === 'Y') prefixNum = '1';
    if (prefix === 'Z') prefixNum = '2';

    const num = parseInt(prefixNum + cleaned.slice(1, 8), 10);
    const expectedLetter = NIF_LETTERS[num % 23];
    const actualLetter = cleaned[8];
    if (expectedLetter === actualLetter) {
      return { isValid: true, type: 'NIE', formatted: cleaned };
    }
    return {
      isValid: false,
      type: 'NIE',
      formatted: cleaned,
      errorMessage: `Dígito de control de NIE incorrecto (se esperaba '${expectedLetter}').`,
    };
  }

  // 3. CIF personas jurídicas y entidades: 1 letra + 7 dígitos + 1 control (número o letra)
  const cifRegex = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;
  if (cifRegex.test(cleaned)) {
    const letter = cleaned[0];
    const digits = cleaned.slice(1, 8);
    const control = cleaned[8];

    let evenSum = 0;
    let oddSum = 0;

    for (let i = 0; i < 7; i++) {
      const n = parseInt(digits[i], 10);
      if (i % 2 === 1) {
        evenSum += n;
      } else {
        const doubled = n * 2;
        oddSum += Math.floor(doubled / 10) + (doubled % 10);
      }
    }

    const totalSum = evenSum + oddSum;
    const unit = totalSum % 10;
    const controlDigit = unit === 0 ? 0 : 10 - unit;
    const controlLetter = CIF_CONTROL_LETTERS[controlDigit];

    const letterOnly = ['P', 'Q', 'S', 'R', 'W', 'N'];
    const numberOnly = ['A', 'B', 'E', 'H'];

    let valid = false;
    if (letterOnly.includes(letter)) {
      valid = control === controlLetter;
    } else if (numberOnly.includes(letter)) {
      valid = control === controlDigit.toString();
    } else {
      valid = control === controlLetter || control === controlDigit.toString();
    }

    if (valid) {
      return { isValid: true, type: 'CIF', formatted: cleaned };
    }
    return {
      isValid: false,
      type: 'CIF',
      formatted: cleaned,
      errorMessage: 'Dígito o letra de control de CIF incorrecto.',
    };
  }

  return {
    isValid: false,
    type: 'INVALID',
    formatted: cleaned,
    errorMessage: 'Formato de NIF/NIE/CIF español no válido.',
  };
}

export interface ActivityFormInput {
  name: string;
  iaeCode?: string;
  seriesPrefix: string;
  defaultVatRate: number;
  defaultIrpfRate: number;
}

export interface PrepareActivitiesResult {
  isValid: boolean;
  error?: string;
  payload: CreateBusinessActivityInput[];
}

/**
 * Validates and transforms economic activities entered in the Onboarding form
 * into the payload required by create_tenant_workspace RPC.
 */
export function prepareOnboardingActivitiesPayload(
  inputs: ActivityFormInput[]
): PrepareActivitiesResult {
  if (!inputs || inputs.length === 0) {
    return {
      isValid: false,
      error: 'Debe configurar al menos una actividad económica.',
      payload: [],
    };
  }

  const payload: CreateBusinessActivityInput[] = [];
  const seenPrefixes = new Set<string>();

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i];
    const name = item.name?.trim();
    if (!name) {
      return {
        isValid: false,
        error: `La actividad ${i + 1} debe tener un nombre.`,
        payload: [],
      };
    }

    const rawPrefix = item.seriesPrefix?.trim().toUpperCase();
    if (!rawPrefix) {
      return {
        isValid: false,
        error: `La actividad «${name}» debe tener un prefijo de serie de facturación.`,
        payload: [],
      };
    }

    if (!/^[A-Z0-9_-]{1,10}$/.test(rawPrefix)) {
      return {
        isValid: false,
        error: `El prefijo de serie «${rawPrefix}» solo puede contener hasta 10 letras, números o guiones.`,
        payload: [],
      };
    }

    if (seenPrefixes.has(rawPrefix)) {
      return {
        isValid: false,
        error: `El prefijo de serie «${rawPrefix}» está duplicado. Cada actividad debe tener series independientes.`,
        payload: [],
      };
    }
    seenPrefixes.add(rawPrefix);

    payload.push({
      name,
      iae_code: item.iaeCode?.trim() || null,
      invoice_series_prefix: rawPrefix,
      default_vat_rate: Number(item.defaultVatRate ?? 21),
      default_irpf_rate: Number(item.defaultIrpfRate ?? 15),
    });
  }

  return {
    isValid: true,
    payload,
  };
}
