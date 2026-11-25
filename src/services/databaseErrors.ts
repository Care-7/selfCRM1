/**
 * Database error handling and normalization utilities for Supabase operations.
 */

/**
 * Normalizes a Spanish or international tax ID:
 * Removes leading/trailing whitespace, converts to uppercase, and strips hyphens and internal spaces.
 */
export function normalizeTaxId(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Validates whether a given string is a valid UUIDv4 / UUID format.
 */
export function isValidUuid(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Translates PostgreSQL and Supabase error codes into user-friendly Spanish messages.
 */
export function mapDatabaseError(
  error: unknown,
  entity: 'cliente' | 'proveedor' | 'factura' | 'registro' = 'registro'
): string {
  if (!error) return 'Error desconocido al procesar la operación.';

  const err = error as { code?: string; message?: string; details?: string };
  const message = err.message || '';
  const code = err.code;

  if (message.includes('VERIFACTU_IMMUTABLE')) {
    return 'Inmutabilidad VeriFactu (RD 1007/2023): Las facturas emitidas y selladas no pueden eliminarse ni modificarse fiscalmente. Debe emitir una factura rectificativa.';
  }

  if (code === '23505') {
    return `Ya existe un ${entity} con este NIF/CIF en tu organización.`;
  }
  if (code === '23503') {
    return 'Referencia no válida a una actividad económica u organización.';
  }
  if (code === '42501') {
    return 'Permisos insuficientes o sesión no autorizada para esta organización.';
  }
  if (code === '23514') {
    return 'Uno de los valores proporcionados no cumple con las restricciones requeridas.';
  }
  if (code === '42P01') {
    return `La tabla de ${entity === 'cliente' ? 'clientes' : entity === 'proveedor' ? 'proveedores' : 'datos'} no existe en la base de datos. Aplica las migraciones de Supabase.`;
  }
  if (code === '22P02') {
    return 'Formato de identificador (UUID) o valor numérico no válido.';
  }

  return err.message || 'Error en la base de datos al realizar la operación.';
}
