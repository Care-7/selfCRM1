import { supabase } from '../lib/supabase';
import type { BusinessActivity, CreateBusinessActivityInput } from '../types/database';
import { mapDatabaseError, isValidUuid } from './databaseErrors';

/**
 * Service layer for managing multi-activity economic headings (Epígrafes IAE)
 * in public.business_activities table under strict Row Level Security.
 */

/**
 * Fetches all economic activities for a specific organization.
 */
export async function listActivities(organizationId: string): Promise<BusinessActivity[]> {
  if (!organizationId || !isValidUuid(organizationId)) {
    return [];
  }

  const { data, error } = await (supabase
    .from('business_activities') as any)
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(mapDatabaseError(error, 'registro'));
  }

  return (data as BusinessActivity[]) || [];
}

/**
 * Creates a new economic activity with independent invoice series prefix and tax rates.
 */
export async function createActivity(
  organizationId: string,
  input: CreateBusinessActivityInput
): Promise<BusinessActivity> {
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new Error('El nombre de la actividad económica es obligatorio.');
  }

  const trimmedPrefix = input.invoice_series_prefix?.trim().toUpperCase();
  if (!trimmedPrefix) {
    throw new Error('El prefijo de serie de facturación es obligatorio (ej. "EXP-2026", "CC-").');
  }

  const vatRate = input.default_vat_rate != null ? Number(input.default_vat_rate) : 21.00;
  const irpfRate = input.default_irpf_rate != null ? Number(input.default_irpf_rate) : 15.00;

  if (isNaN(vatRate) || vatRate < 0) {
    throw new Error('El tipo de IVA por defecto debe ser un número mayor o igual a 0.');
  }
  if (isNaN(irpfRate) || irpfRate < 0) {
    throw new Error('El tipo de IRPF por defecto debe ser un número mayor o igual a 0.');
  }

  const { data, error } = await (supabase
    .from('business_activities') as any)
    .insert({
      organization_id: organizationId,
      name: trimmedName,
      iae_code: input.iae_code?.trim() || null,
      invoice_series_prefix: trimmedPrefix,
      default_vat_rate: vatRate,
      default_irpf_rate: irpfRate,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'registro'));
  }

  return data as BusinessActivity;
}

/**
 * Toggles an economic activity between active and inactive.
 */
export async function toggleActivityActive(
  activityId: string,
  organizationId: string,
  isActive: boolean
): Promise<BusinessActivity> {
  if (!activityId || !isValidUuid(activityId)) {
    throw new Error('Identificador de actividad no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const { data, error } = await (supabase
    .from('business_activities') as any)
    .update({ is_active: isActive })
    .eq('id', activityId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'registro'));
  }

  return data as BusinessActivity;
}

/**
 * Updates an economic activity's settings (name, IAE, series prefix, tax rates).
 */
export async function updateActivity(
  activityId: string,
  organizationId: string,
  updates: Partial<CreateBusinessActivityInput>
): Promise<BusinessActivity> {
  if (!activityId || !isValidUuid(activityId)) {
    throw new Error('Identificador de actividad no válido.');
  }
  if (!organizationId || !isValidUuid(organizationId)) {
    throw new Error('Identificador de organización no válido.');
  }

  const payload: Record<string, any> = {};

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new Error('El nombre de la actividad es obligatorio.');
    payload.name = trimmed;
  }
  if (updates.iae_code !== undefined) {
    payload.iae_code = updates.iae_code?.trim() || null;
  }
  if (updates.invoice_series_prefix !== undefined) {
    const trimmedPrefix = updates.invoice_series_prefix.trim().toUpperCase();
    if (!trimmedPrefix) throw new Error('El prefijo de serie es obligatorio.');
    payload.invoice_series_prefix = trimmedPrefix;
  }
  if (updates.default_vat_rate !== undefined) {
    const rate = Number(updates.default_vat_rate);
    if (isNaN(rate) || rate < 0) throw new Error('Tipo de IVA no válido.');
    payload.default_vat_rate = rate;
  }
  if (updates.default_irpf_rate !== undefined) {
    const rate = Number(updates.default_irpf_rate);
    if (isNaN(rate) || rate < 0) throw new Error('Tipo de IRPF no válido.');
    payload.default_irpf_rate = rate;
  }

  const { data, error } = await (supabase
    .from('business_activities') as any)
    .update(payload)
    .eq('id', activityId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'registro'));
  }

  return data as BusinessActivity;
}
