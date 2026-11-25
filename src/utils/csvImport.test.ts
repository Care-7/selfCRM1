import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripBom,
  detectDelimiter,
  parseCsvText,
  parseAndValidateContactsCsv,
  generateCsvTemplate,
} from './csvImport';

test('stripBom removes UTF-8 BOM correctly', () => {
  const withBom = '\uFEFFNombre;NIF';
  assert.equal(stripBom(withBom), 'Nombre;NIF');
  assert.equal(stripBom('Sin BOM'), 'Sin BOM');
  assert.equal(stripBom(''), '');
});

test('detectDelimiter distinguishes between semicolon (Spanish Excel) and comma', () => {
  const spanishCsv = 'Nombre;NIF;Email;Tipo IVA\n"Empresa A";"B99887762";"a@empresa.es";21';
  assert.equal(detectDelimiter(spanishCsv), ';');

  const commaCsv = 'name,tax_id,email,vat_rate\n"Company B","A48265169","b@company.com",21';
  assert.equal(detectDelimiter(commaCsv), ',');
});

test('parseCsvText handles quotes, escaped quotes, and semicolons', () => {
  const csv =
    '"Razón Social";"NIF";"Notas"\n' +
    '"Construcciones ""El Sol"", S.L.";"B99887762";"Obras y reformas; Madrid"';

  const { headers, rows } = parseCsvText(csv);
  assert.deepEqual(headers, ['Razón Social', 'NIF', 'Notas']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'Construcciones "El Sol", S.L.');
  assert.equal(rows[0][1], 'B99887762');
  assert.equal(rows[0][2], 'Obras y reformas; Madrid');
});

test('parseAndValidateContactsCsv auto-detects Spanish headers and extracts valid contacts', () => {
  const rawCsv =
    '\uFEFFDenominación Social;C.I.F.;Correo Electrónico;Teléfono;Domicilio Fiscal;Código Postal;Ciudad;IVA Habitual;Retención IRPF\n' +
    '"Asociación Cultural Bellas Artes Madrid";"G28491827";"contacto@cultura.es";"915550101";"C/ Serrano 54";"28001";"Madrid";"10%";"0%"\n' +
    '"Comunidad Residencial Puerta de Hierro 12";"H28192847";"admin@puerta.org";"";"C/ Puerta de Hierro 12";"28035";"Madrid";"21";"0"';

  const result = parseAndValidateContactsCsv(rawCsv, 'cliente');
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.valid, 2);
  assert.equal(result.summary.invalid, 0);
  assert.equal(result.validRows.length, 2);

  const first = result.validRows[0];
  assert.equal(first.name, 'Asociación Cultural Bellas Artes Madrid');
  assert.equal(first.tax_id, 'G28491827');
  assert.equal(first.email, 'contacto@cultura.es');
  assert.equal(first.default_vat_rate, 10);
  assert.equal(first.default_irpf_rate, 0);
  assert.equal(first.postal_code, '28001');

  const second = result.validRows[1];
  assert.equal(second.name, 'Comunidad Residencial Puerta de Hierro 12');
  assert.equal(second.tax_id, 'H28192847');
  assert.equal(second.default_vat_rate, 21);
});

test('parseAndValidateContactsCsv detects invalid NIF and reports detailed error reason', () => {
  const rawCsv =
    'Nombre;NIF;Email\n' +
    '"Empresa Con NIF Inválido";"B99887769";"test@invalido.es"\n' +
    '"Empresa Con Nombre Vacío";"A48265169";"test@valido.es"';

  const result = parseAndValidateContactsCsv(rawCsv, 'proveedor');

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.valid, 1);
  assert.equal(result.summary.invalid, 1);
  assert.equal(result.invalidRows[0].rowNumber, 2);
  assert.match(result.invalidRows[0].reason, /NIF\/CIF no válido/);
});

test('parseAndValidateContactsCsv rejects intra-file duplicate NIFs', () => {
  const rawCsv =
    'Nombre;NIF;Email\n' +
    '"Primera Empresa";"A48265169";"uno@empresa.es"\n' +
    '"Segunda Empresa Duplicada";"A48265169";"dos@empresa.es"';

  const result = parseAndValidateContactsCsv(rawCsv, 'cliente');

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.valid, 1);
  assert.equal(result.summary.invalid, 1);
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.invalidRows[0].rowNumber, 3);
  assert.match(result.invalidRows[0].reason, /NIF duplicado en el mismo archivo/);
});

test('generateCsvTemplate outputs UTF-8 BOM and semicolon formatted template for Spanish Excel', () => {
  const clientTemplate = generateCsvTemplate('clientes');
  assert.ok(clientTemplate.startsWith('\uFEFF'));
  assert.ok(clientTemplate.includes(';'));
  assert.ok(clientTemplate.includes('Nombre_Fiscal;NIF_CIF'));

  const supplierTemplate = generateCsvTemplate('proveedores');
  assert.ok(supplierTemplate.startsWith('\uFEFF'));
  assert.ok(supplierTemplate.includes('pedidos@minervabellasartes.es'));
});
