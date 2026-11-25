import type { Contact, IvaRate, IrpfRate } from '../types';
import type { BusinessActivity, ClientRow, SupplierRow } from '../types/database';

/**
 * Transforms a Supabase ClientRow into the UI Contact model.
 */
export function clientRowToContact(
  row: ClientRow,
  activities: BusinessActivity[] = []
): Contact {
  const matchedActivity = activities.find((a) => a.id === row.activity_id);
  return {
    id: row.id,
    kind: 'cliente',
    name: row.name,
    nif: row.tax_id,
    email: row.email || '',
    phone: row.phone || undefined,
    address: row.address || '',
    city: row.city || undefined,
    postalCode: row.postal_code || undefined,
    country: row.country || 'ES',
    activity: matchedActivity?.name || (activities[0]?.name ?? 'Actividad Principal'),
    activityId: row.activity_id || undefined,
    defaultIva: (Number(row.default_vat_rate) || 21) as IvaRate,
    defaultIrpf: (Number(row.default_irpf_rate) || 0) as IrpfRate,
    status: row.is_active ? 'Activo' : 'Inactivo',
    historicalVolume: 0,
    notes: row.notes || undefined,
    paymentTerms: row.payment_terms || undefined,
    iban: row.iban || undefined,
  };
}

/**
 * Transforms a Supabase SupplierRow into the UI Contact model.
 */
export function supplierRowToContact(
  row: SupplierRow,
  activities: BusinessActivity[] = []
): Contact {
  const matchedActivity = activities.find((a) => a.id === row.activity_id);
  return {
    id: row.id,
    kind: 'proveedor',
    name: row.name,
    nif: row.tax_id,
    email: row.email || '',
    phone: row.phone || undefined,
    address: row.address || '',
    city: row.city || undefined,
    postalCode: row.postal_code || undefined,
    country: row.country || 'ES',
    activity: matchedActivity?.name || (activities[0]?.name ?? 'Actividad Principal'),
    activityId: row.activity_id || undefined,
    defaultIva: (Number(row.default_vat_rate) || 21) as IvaRate,
    defaultIrpf: (Number(row.default_irpf_rate) || 0) as IrpfRate,
    status: row.is_active ? 'Activo' : 'Inactivo',
    historicalVolume: 0,
    notes: row.notes || undefined,
    iban: row.iban || undefined,
  };
}
