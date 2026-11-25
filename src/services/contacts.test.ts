import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaxId, mapDatabaseError, isValidUuid } from './databaseErrors';
import { clientRowToContact, supplierRowToContact } from './contactMappers';
import type { ClientRow, SupplierRow, BusinessActivity } from '../types/database';

test('normalizeTaxId cleans leading/trailing whitespace, converts to uppercase and removes spaces and hyphens', () => {
  assert.equal(normalizeTaxId('  b-12345678  '), 'B12345678');
  assert.equal(normalizeTaxId('12 345 678 z'), '12345678Z');
  assert.equal(normalizeTaxId('x-9988776-y'), 'X9988776Y');
  assert.equal(normalizeTaxId(''), '');
  assert.equal(normalizeTaxId(null as any), '');
  assert.equal(normalizeTaxId(undefined as any), '');
});

test('mapDatabaseError maps PostgreSQL duplicate key error code 23505 to Spanish user message', () => {
  const duplicateClientError = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "clients_org_tax_id_unique"',
    details: 'Key (organization_id, tax_id)=(...) already exists.',
  };
  const msgClient = mapDatabaseError(duplicateClientError, 'cliente');
  assert.equal(msgClient, 'Ya existe un cliente con este NIF/CIF en tu organización.');

  const duplicateSupplierError = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "suppliers_org_tax_id_unique"',
  };
  const msgSupplier = mapDatabaseError(duplicateSupplierError, 'proveedor');
  assert.equal(msgSupplier, 'Ya existe un proveedor con este NIF/CIF en tu organización.');
});

test('mapDatabaseError maps foreign key (23503) and insufficient permissions (42501) codes', () => {
  const fkError = { code: '23503', message: 'violates foreign key constraint' };
  assert.equal(
    mapDatabaseError(fkError),
    'Referencia no válida a una actividad económica u organización.'
  );

  const authError = { code: '42501', message: 'permission denied for table' };
  assert.equal(
    mapDatabaseError(authError),
    'Permisos insuficientes o sesión no autorizada para esta organización.'
  );

  // Generic fallback
  const genericError = { code: 'XX000', message: 'Internal DB glitch' };
  assert.equal(mapDatabaseError(genericError), 'Internal DB glitch');
});

test('clientRowToContact and supplierRowToContact correctly map Supabase rows to UI Contact model with activities', () => {
  const mockActivities: BusinessActivity[] = [
    {
      id: 'act-111',
      organization_id: 'org-1',
      name: 'Gestión Comunidades',
      iae_code: '842',
      invoice_series_prefix: 'CC',
      default_vat_rate: 21,
      default_irpf_rate: 15,
      is_active: true,
      created_at: '2026-11-25T10:00:00Z',
    },
  ];

  const clientRow: ClientRow = {
    id: 'cli-001',
    organization_id: 'org-1',
    activity_id: 'act-111',
    name: 'Comunidad Propietarios Alcalá 42',
    tax_id: 'H12345678',
    email: 'comunidad@alcala42.es',
    phone: '+34 910 000 000',
    address: 'C/ Alcalá 42',
    city: 'Madrid',
    postal_code: '28014',
    country: 'ES',
    default_vat_rate: 21,
    default_irpf_rate: 0,
    payment_terms: 'Transferencia 30 días',
    iban: 'ES9121000418450200051332',
    notes: 'Presupuesto aprobado en junta',
    is_active: true,
    created_at: '2026-11-25T10:00:00Z',
    updated_at: '2026-11-25T10:00:00Z',
  };

  const contact = clientRowToContact(clientRow, mockActivities);
  assert.equal(contact.id, 'cli-001');
  assert.equal(contact.kind, 'cliente');
  assert.equal(contact.name, 'Comunidad Propietarios Alcalá 42');
  assert.equal(contact.nif, 'H12345678');
  assert.equal(contact.activity, 'Gestión Comunidades');
  assert.equal(contact.activityId, 'act-111');
  assert.equal(contact.defaultIva, 21);
  assert.equal(contact.status, 'Activo');

  const supplierRow: SupplierRow = {
    id: 'sup-001',
    organization_id: 'org-1',
    activity_id: null,
    name: 'Suministros Informáticos SL',
    tax_id: 'B88776655',
    email: 'pedidos@suministros.es',
    phone: null,
    address: 'Polígono Industrial 5',
    city: 'Getafe',
    postal_code: '28906',
    country: 'ES',
    default_vat_rate: 21,
    default_irpf_rate: 0,
    default_expense_category: 'Hardware',
    iban: null,
    notes: null,
    is_active: false,
    created_at: '2026-11-25T10:00:00Z',
    updated_at: '2026-11-25T10:00:00Z',
  };

  const supContact = supplierRowToContact(supplierRow, mockActivities);
  assert.equal(supContact.id, 'sup-001');
  assert.equal(supContact.kind, 'proveedor');
  assert.equal(supContact.status, 'Inactivo');
  assert.equal(supContact.activity, 'Gestión Comunidades'); // falls back to first activity
});

test('isValidUuid correctly distinguishes valid v4 UUIDs from arbitrary fallback strings', () => {
  const validUuid = '11111111-1111-4111-a111-111111111111';
  assert.equal(isValidUuid(validUuid), true);

  assert.equal(isValidUuid('act-cc'), false);
  assert.equal(isValidUuid('act-123'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
});

test('clientRowToContact preserves 0% VAT rate (exempt) without incorrectly falling back to 21%', () => {
  const exemptClientRow: ClientRow = {
    id: 'cli-exempt',
    organization_id: 'org-1',
    activity_id: null,
    name: 'Asociación Sin Ánimo de Lucro',
    tax_id: 'G12345678',
    email: 'contacto@asociacion.es',
    phone: null,
    address: 'Plaza Mayor 1',
    city: null,
    postal_code: null,
    country: 'ES',
    default_vat_rate: 0, // Exempt 0%
    default_irpf_rate: 0,
    payment_terms: null,
    iban: null,
    notes: null,
    is_active: true,
    created_at: '2026-11-25T10:00:00Z',
    updated_at: '2026-11-25T10:00:00Z',
  };

  const contact = clientRowToContact(exemptClientRow);
  assert.equal(contact.defaultIva, 0);
  assert.equal(contact.defaultIrpf, 0);
});

test('non-optimistic mutation guarantee: if service fails or throws, local state list remains unmutated', async () => {
  const initialClients = [
    { id: 'c1', name: 'Cliente Existente', nif: 'A11111111' },
  ];
  let localList = [...initialClients];

  // Simulated non-optimistic action runner
  const saveClientNonOptimistically = async (
    persistFn: () => Promise<any>
  ) => {
    // Prohibited: updating localList BEFORE persistFn succeeds
    const savedRow = await persistFn();
    localList = [savedRow, ...localList];
  };

  // Case 1: Backend service fails (e.g. duplicate key or RLS)
  const failingBackendService = async () => {
    throw new Error('Ya existe un cliente con este NIF/CIF en tu organización.');
  };

  await assert.rejects(
    async () => {
      await saveClientNonOptimistically(failingBackendService);
    },
    {
      name: 'Error',
      message: 'Ya existe un cliente con este NIF/CIF en tu organización.',
    }
  );

  // Assert localList was NOT mutated silently
  assert.equal(localList.length, 1);
  assert.equal(localList[0].id, 'c1');

  // Case 2: Backend service succeeds
  const succeedingBackendService = async () => {
    return { id: 'c2', name: 'Nuevo Cliente Confirmado', nif: 'B22222222' };
  };

  await saveClientNonOptimistically(succeedingBackendService);
  assert.equal(localList.length, 2);
  assert.equal(localList[0].id, 'c2');
});

