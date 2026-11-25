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
 * Translates PostgreSQL and Supabase error codes into user-friendly Spanish messages.
 */
export function mapDatabaseError(
  error: unknown,
  entity: 'cliente' | 'proveedor' | 'registro' = 'registro'
): string {
  if (!error) return 'Error desconocido al procesar la operación.';

  const err = error as { code?: string; message?: string; details?: string };
  const code = err.code;

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

  return err.message || 'Error en la base de datos al realizar la operación.';
}
