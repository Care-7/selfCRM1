import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpanishNumber,
  parseHistoricalDate,
  parseHistoricalIssuedInvoicesCsv,
  parseHistoricalReceivedInvoicesCsv,
  parseContaSolJournalCsv,
} from './historicalImport';
import type { Contact } from '../types';

test('parseSpanishNumber parses Spanish number formats correctly', () => {
  assert.equal(parseSpanishNumber('1.234,56'), 1234.56);
  assert.equal(parseSpanishNumber('1234,56'), 1234.56);
  assert.equal(parseSpanishNumber('1234.56'), 1234.56);
  assert.equal(parseSpanishNumber(500), 500);
  assert.equal(parseSpanishNumber(''), 0);
  assert.equal(parseSpanishNumber(undefined), 0);
});

test('parseHistoricalDate parses historical dates correctly', () => {
  assert.equal(parseHistoricalDate('20250115'), '2025-01-15');
  assert.equal(parseHistoricalDate('15/01/2025'), '2025-01-15');
  assert.equal(parseHistoricalDate('15-01-2025'), '2025-01-15');
  assert.equal(parseHistoricalDate('2025-01-15'), '2025-01-15');
  assert.equal(parseHistoricalDate(undefined, '2026-01-01'), '2026-01-01');
});

test('parseHistoricalIssuedInvoicesCsv parses valid historical issued invoices with is_migrated = true and veriFactuLocked = true', () => {
  const clients: Contact[] = [
    {
      id: 'cli-1',
      kind: 'cliente',
      name: 'Comunidad de Propietarios Alcalá 42',
      nif: 'H28491023',
      activity: 'Contabilidad Comunidades',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      email: 'alcala42@example.com',
      address: 'Calle Alcalá 42',
      historicalVolume: 0,
    },
  ];

  const csv = `Numero_Factura;Fecha_Emision;Nombre_Cliente;NIF_Cliente;Concepto;Base_Imponible;Tipo_IVA;Retencion_IRPF
HIST-2025-01;15/06/2025;Comunidad de Propietarios Alcalá 42;H28491023;Honorarios administración;1000;21;0`;

  const result = parseHistoricalIssuedInvoicesCsv(csv, { clients });
  assert.equal(result.summary.valid, 1);
  assert.equal(result.validInvoices[0].number, 'HIST-2025-01');
  assert.equal(result.validInvoices[0].isMigrated, true);
  assert.equal(result.validInvoices[0].veriFactuLocked, true);
  assert.equal(result.validInvoices[0].status, 'Cobrada');
  assert.equal(result.validInvoices[0].clientId, 'cli-1');
  assert.equal(result.validInvoices[0].taxBase, 1000);
  assert.equal(result.validInvoices[0].totalAmount, 1210);
});

test('parseHistoricalIssuedInvoicesCsv rejects rows with missing customer name and tax id', () => {
  const clients: Contact[] = [];
  const csv = `Numero_Factura;Fecha_Emision;Nombre_Cliente;NIF_Cliente;Concepto;Base_Imponible;Tipo_IVA;Retencion_IRPF
HIST-2025-02;15/06/2025;;;Honorarios administración;1000;21;0`;

  const result = parseHistoricalIssuedInvoicesCsv(csv, { clients });
  assert.equal(result.summary.valid, 0);
  assert.equal(result.summary.invalid, 1);
  assert.ok(result.invalidRows[0].reason.includes('Nombre o el NIF'));
});

test('parseHistoricalReceivedInvoicesCsv parses valid historical received invoices with deductible and status', () => {
  const suppliers: Contact[] = [
    {
      id: 'sup-1',
      kind: 'proveedor',
      name: 'Telefónica de España SAU',
      nif: 'A28015865',
      activity: 'Contabilidad Comunidades',
      defaultIva: 21,
      defaultIrpf: 0,
      status: 'Activo',
      email: 'facturas@telefonica.es',
      address: 'Gran Vía 28',
      historicalVolume: 0,
    },
  ];

  const csv = `Numero_Factura;Fecha_Emision;Nombre_Proveedor;NIF_Proveedor;Concepto;Cuenta_PGC;Base_Imponible;Tipo_IVA
REC-2025-99;10/05/2025;Telefónica de España SAU;A28015865;Fibra óptica;628;150;21`;

  const result = parseHistoricalReceivedInvoicesCsv(csv, { suppliers });
  assert.equal(result.summary.valid, 1);
  const inv = result.validInvoices[0];
  assert.equal(inv.number, 'REC-2025-99');
  assert.equal(inv.supplierId, 'sup-1');
  assert.equal(inv.pgcAccountCode, '628');
  assert.equal(inv.status, 'Contabilizada');
  assert.equal(inv.paymentStatus, 'paid');
  assert.equal(inv.baseAmount, 150);
  assert.equal(inv.isMigrated, true);
});

test('parseContaSolJournalCsv parses and groups F_APU entries by ASIAPU, verifying double entry balance', () => {
  const csv = `ASIAPU;FECAPU;CUEAPU;CONAPU;DOCAPU;D-HAPU;IMEAPU
1;20250102;5720000;Aportacion inicial;DOC-01;D;3000,00
1;20250102;1000000;Aportacion inicial;DOC-01;H;3000,00
2;20250110;2170000;Compra ordenador;DOC-02;D;1200,00
2;20250110;5720000;Pago ordenador;DOC-02;H;1200,00`;

  const result = parseContaSolJournalCsv(csv);
  assert.equal(result.summary.validEntries, 2);
  assert.equal(result.summary.invalidEntries, 0);

  const entry1 = result.validEntries.find((e) => e.entry_number === '1');
  assert.ok(entry1);
  assert.equal(entry1?.lines.length, 2);
  assert.equal(entry1?.lines[0].account_code, '5720000');
  assert.equal(entry1?.lines[0].debe, 3000);
  assert.equal(entry1?.lines[1].account_code, '1000000');
  assert.equal(entry1?.lines[1].haber, 3000);
});

test('parseContaSolJournalCsv rejects unbalanced entries (Debe !== Haber) beyond tolerance', () => {
  const csv = `ASIAPU;FECAPU;CUEAPU;CONAPU;DOCAPU;D-HAPU;IMEAPU
1;20250102;5720000;Asiento descuadrado;;D;500,00
1;20250102;1000000;Asiento descuadrado;;H;300,00`;

  const result = parseContaSolJournalCsv(csv);
  assert.equal(result.summary.validEntries, 0);
  assert.equal(result.summary.invalidEntries, 1);
  assert.ok(result.invalidEntries[0].reason.includes('Descuadre contable detectado'));
});

test('parseContaSolJournalCsv omits commercial accounts (430*, 400*, 410*) when omitCommercialAccounts is true', () => {
  const csv = `ASIAPU;FECAPU;CUEAPU;CONAPU;DOCAPU;D-HAPU;IMEAPU
1;20250102;5720000;Aportacion inicial;DOC-01;D;3000,00
1;20250102;1000000;Aportacion inicial;DOC-01;H;3000,00
2;20250110;4300001;Factura cliente;FAC-01;D;1210,00
2;20250110;7000000;Ventas;FAC-01;H;1000,00
2;20250110;4770000;IVA;FAC-01;H;210,00`;

  const result = parseContaSolJournalCsv(csv, { omitCommercialAccounts: true });
  assert.equal(result.skippedCommercialLinesCount, 1);
  assert.equal(result.validEntries.some((e) => e.entry_number === '1'), true);
});
