import { supabase } from '../lib/supabase';
import type { ClientRow, CreateClientInput, UpdateClientInput } from '../types/database';
import { mapDatabaseError, normalizeTaxId, isValidUuid } from './databaseErrors';

/**
 * Fetches all clients belonging to the specified organization.
 * Protected by Supabase Row Level Security.
 */
export async function listClients(organizationId: string): Promise<ClientRow[]> {
  if (!organizationId) return [];

  const { data, error } = await (supabase
    .from('clients') as any)
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(mapDatabaseError(error, 'cliente'));
  }

  return (data as ClientRow[]) || [];
}

/**
 * Creates a new client record in Supabase with normalized tax ID.
 */
export async function createClient(input: CreateClientInput): Promise<ClientRow> {
  const normalizedTaxId = normalizeTaxId(input.tax_id);
  if (!input.name?.trim()) {
    throw new Error('El nombre o razón social del cliente es obligatorio.');
  }
  if (!normalizedTaxId) {
    throw new Error('El NIF/CIF del cliente es obligatorio.');
  }

  const sanitizedActivityId = isValidUuid(input.activity_id) ? input.activity_id : null;

  const { data, error } = await (supabase
    .from('clients') as any)
    .insert({
      organization_id: input.organization_id,
      activity_id: sanitizedActivityId,
      name: input.name.trim(),
      tax_id: normalizedTaxId,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      postal_code: input.postal_code?.trim() || null,
      country: input.country?.trim() || 'ES',
      default_vat_rate: Number(input.default_vat_rate ?? 21.00),
      default_irpf_rate: Number(input.default_irpf_rate ?? 0.00),
      payment_terms: input.payment_terms?.trim() || null,
      iban: input.iban?.trim() || null,
      notes: input.notes?.trim() || null,
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'cliente'));
  }

  return data as ClientRow;
}

/**
 * Updates an existing client record in Supabase.
 */
export async function updateClient(
  id: string,
  organizationId: string,
  input: UpdateClientInput
): Promise<ClientRow> {
  if (!id) throw new Error('Identificador de cliente no proporcionado.');
  if (!organizationId) throw new Error('Identificador de organización no proporcionado.');

  const updatePayload: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error('El nombre no puede estar vacío.');
    updatePayload.name = input.name.trim();
  }
  if (input.tax_id !== undefined) {
    const norm = normalizeTaxId(input.tax_id);
    if (!norm) throw new Error('El NIF/CIF no puede estar vacío.');
    updatePayload.tax_id = norm;
  }
  if (input.activity_id !== undefined) {
    updatePayload.activity_id = isValidUuid(input.activity_id) ? input.activity_id : null;
  }
  if (input.email !== undefined) updatePayload.email = input.email?.trim() || null;
  if (input.phone !== undefined) updatePayload.phone = input.phone?.trim() || null;
  if (input.address !== undefined) updatePayload.address = input.address?.trim() || null;
  if (input.city !== undefined) updatePayload.city = input.city?.trim() || null;
  if (input.postal_code !== undefined) updatePayload.postal_code = input.postal_code?.trim() || null;
  if (input.country !== undefined) updatePayload.country = input.country?.trim() || 'ES';
  if (input.default_vat_rate !== undefined) updatePayload.default_vat_rate = Number(input.default_vat_rate);
  if (input.default_irpf_rate !== undefined) updatePayload.default_irpf_rate = Number(input.default_irpf_rate);
  if (input.payment_terms !== undefined) updatePayload.payment_terms = input.payment_terms?.trim() || null;
  if (input.iban !== undefined) updatePayload.iban = input.iban?.trim() || null;
  if (input.notes !== undefined) updatePayload.notes = input.notes?.trim() || null;
  if (input.is_active !== undefined) updatePayload.is_active = input.is_active;

  const { data, error } = await (supabase
    .from('clients') as any)
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(mapDatabaseError(error, 'cliente'));
  }

  return data as ClientRow;
}

/**
 * Permanently deletes a client record in Supabase.
 */
export async function deleteClient(id: string, organizationId: string): Promise<void> {
  if (!id || !organizationId) throw new Error('Identificadores no válidos para eliminar cliente.');

  const { error } = await (supabase
    .from('clients') as any)
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(mapDatabaseError(error, 'cliente'));
  }
}

/**
 * Toggles or sets active/archive status for a client.
 */
export async function archiveClient(
  id: string,
  organizationId: string,
  isActive = false
): Promise<ClientRow> {
  return updateClient(id, organizationId, { is_active: isActive });
}
