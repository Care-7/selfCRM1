import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicateJournalEntries,
  findDuplicateReceivedInvoice,
  findDuplicateIssuedInvoice,
} from './duplicateDetector';
import type { IssuedInvoice, ReceivedInvoice } from '../types';

test('findDuplicateJournalEntries detects duplicate by document number', () => {
  const existing = [
    {
      id: 'entry-1',
      entryNumber: '1',
      entryDate: '2026-03-15',
      concept: 'Aportación inicial capital',
      documentNumber: 'DOC-100',
      lines: [
        { accountCode: '572', accountName: 'Bancos', debe: 3000, haber: 0 },
        { accountCode: '100', accountName: 'Capital Social', debe: 0, haber: 3000 },
      ],
      totalDebe: 3000,
      totalHaber: 3000,
    },
  ];

  const dup = findDuplicateJournalEntries({
    date: '2026-03-20',
    documentNumber: 'DOC-100',
    lines: [
      { accountCode: '572', debe: 500, haber: 0 },
      { accountCode: '700', debe: 0, haber: 500 },
    ],
    existingEntries: existing,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateEntry.id, 'entry-1');
  assert.ok(dup?.reason.includes('documento'));
});

test('findDuplicateJournalEntries detects duplicate by date, amount, and matching account', () => {
  const existing = [
    {
      id: 'entry-1',
      entryNumber: '1',
      entryDate: '2026-03-15',
      concept: 'Aportación inicial capital',
      documentNumber: 'DOC-100',
      lines: [
        { accountCode: '572', accountName: 'Bancos', debe: 3000, haber: 0 },
        { accountCode: '100', accountName: 'Capital Social', debe: 0, haber: 3000 },
      ],
      totalDebe: 3000,
      totalHaber: 3000,
    },
  ];

  const dup = findDuplicateJournalEntries({
    date: '2026-03-15',
    documentNumber: 'DIFF-DOC',
    lines: [
      { accountCode: '572', debe: 3000, haber: 0 },
      { accountCode: '551', debe: 0, haber: 3000 },
    ],
    existingEntries: existing,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateEntry.id, 'entry-1');
  assert.ok(dup?.reason.includes('3.000,00'));
});

test('findDuplicateJournalEntries ignores current entry if editing', () => {
  const existing = [
    {
      id: 'entry-1',
      entryNumber: '1',
      entryDate: '2026-03-15',
      concept: 'Aportación inicial capital',
      documentNumber: 'DOC-100',
      lines: [
        { accountCode: '572', accountName: 'Bancos', debe: 3000, haber: 0 },
        { accountCode: '100', accountName: 'Capital Social', debe: 0, haber: 3000 },
      ],
      totalDebe: 3000,
      totalHaber: 3000,
    },
  ];

  const dup = findDuplicateJournalEntries({
    date: '2026-03-15',
    documentNumber: 'DOC-100',
    lines: [
      { accountCode: '572', debe: 3000, haber: 0 },
      { accountCode: '100', debe: 0, haber: 3000 },
    ],
    existingEntries: existing,
    currentEntryId: 'entry-1',
  });

  assert.equal(dup, null);
});

test('findDuplicateReceivedInvoice detects duplicate by same supplier NIF and invoice number', () => {
  const existingReceived: ReceivedInvoice[] = [
    {
      id: 'rec-1',
      number: 'FAC-2026-01',
      supplierId: 'sup-1',
      supplierName: 'Iberdrola Clientes SA',
      supplierNif: 'A95075578',
      activity: 'Actividad Principal',
      issueDate: '2026-02-10',
      concept: 'Suministro eléctrico',
      pgcAccountCode: '628',
      pgcAccountName: 'Suministros',
      baseAmount: 100,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
    },
  ];

  const dup = findDuplicateReceivedInvoice({
    supplierNif: 'A95075578',
    supplierName: 'Iberdrola',
    invoiceNumber: 'FAC-2026-01',
    issueDate: '2026-02-12',
    total: 121,
    existingInvoices: existingReceived,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateInvoice.id, 'rec-1');
  assert.ok(dup?.reason.includes('número de factura'));
});

test('findDuplicateReceivedInvoice detects duplicate by same supplier, date, and total amount', () => {
  const existingReceived: ReceivedInvoice[] = [
    {
      id: 'rec-1',
      number: 'FAC-2026-01',
      supplierId: 'sup-1',
      supplierName: 'Iberdrola Clientes SA',
      supplierNif: 'A95075578',
      activity: 'Actividad Principal',
      issueDate: '2026-02-10',
      concept: 'Suministro eléctrico',
      pgcAccountCode: '628',
      pgcAccountName: 'Suministros',
      baseAmount: 100,
      ivaRate: 21,
      status: 'Contabilizada',
      deductible: true,
    },
  ];

  const dup = findDuplicateReceivedInvoice({
    supplierNif: 'A95075578',
    supplierName: 'Iberdrola Clientes SA',
    invoiceNumber: 'OTRO-NUM',
    issueDate: '2026-02-10',
    total: 121,
    existingInvoices: existingReceived,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateInvoice.id, 'rec-1');
  assert.ok(dup?.reason.includes('mismo importe'));
});

test('findDuplicateIssuedInvoice detects duplicate by exact invoice number', () => {
  const existingIssued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'CC-2026-001',
      series: 'CC',
      documentType: 'normal',
      clientId: 'cli-1',
      clientName: 'Comunidad Propietarios Serrano 40',
      clientNif: 'H28000001',
      activity: 'Actividad Principal',
      issueDate: '2026-01-15',
      dueDate: '2026-02-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      status: 'Cobrada',
      veriFactuLocked: true,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
    },
  ];

  const dup = findDuplicateIssuedInvoice({
    invoiceNumber: 'CC-2026-001',
    clientName: 'Otro Cliente',
    issueDate: '2026-01-20',
    total: 500,
    existingInvoices: existingIssued,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateInvoice.id, 'inv-1');
  assert.ok(dup?.reason.includes('número de factura'));
});

test('findDuplicateIssuedInvoice detects duplicate by same client, date, and amount', () => {
  const existingIssued: IssuedInvoice[] = [
    {
      id: 'inv-1',
      number: 'CC-2026-001',
      series: 'CC',
      documentType: 'normal',
      clientId: 'cli-1',
      clientName: 'Comunidad Propietarios Serrano 40',
      clientNif: 'H28000001',
      activity: 'Actividad Principal',
      issueDate: '2026-01-15',
      dueDate: '2026-02-15',
      lines: [],
      ivaRate: 21,
      irpfRate: 0,
      status: 'Cobrada',
      veriFactuLocked: true,
      taxBase: 1000,
      vatTotal: 210,
      totalAmount: 1210,
    },
  ];

  const dup = findDuplicateIssuedInvoice({
    invoiceNumber: 'CC-2026-002',
    clientName: 'Comunidad Propietarios Serrano 40',
    issueDate: '2026-01-15',
    total: 1210,
    existingInvoices: existingIssued,
  });

  assert.ok(dup !== null);
  assert.equal(dup?.duplicateInvoice.id, 'inv-1');
  assert.ok(dup?.reason.includes('mismo importe'));
});
