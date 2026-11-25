import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSpanishTaxId,
  prepareOnboardingActivitiesPayload,
  type ActivityFormInput,
} from './validators';

test('validateSpanishTaxId accurately validates standard Spanish DNI/NIF', () => {
  // Valid DNI: 12345678Z -> 12345678 % 23 = 14 -> 'Z'
  const validDni = validateSpanishTaxId('12345678Z');
  assert.equal(validDni.isValid, true);
  assert.equal(validDni.type, 'NIF');
  assert.equal(validDni.formatted, '12345678Z');

  // Lowercase & spaces trimmed
  const formattedDni = validateSpanishTaxId(' 12345678z ');
  assert.equal(formattedDni.isValid, true);
  assert.equal(formattedDni.type, 'NIF');

  // Invalid control letter: 12345678A instead of Z
  const invalidLetter = validateSpanishTaxId('12345678A');
  assert.equal(invalidLetter.isValid, false);
  assert.equal(invalidLetter.type, 'NIF');
  assert.match(invalidLetter.errorMessage || '', /Dígito de control incorrecto/);
});

test('validateSpanishTaxId validates Spanish NIE (foreign individuals)', () => {
  // Valid NIE: X1234567L -> 01234567 % 23 = 19 -> 'L'
  const validNieX = validateSpanishTaxId('X1234567L');
  assert.equal(validNieX.isValid, true);
  assert.equal(validNieX.type, 'NIE');

  // Valid NIE: Y1234567X -> 11234567 % 23 = 10 -> 'X'
  const validNieY = validateSpanishTaxId('Y1234567X');
  assert.equal(validNieY.isValid, true);
  assert.equal(validNieY.type, 'NIE');

  // Invalid NIE letter
  const invalidNie = validateSpanishTaxId('X1234567A');
  assert.equal(invalidNie.isValid, false);
  assert.equal(invalidNie.type, 'NIE');
});

test('validateSpanishTaxId validates Spanish CIF (companies and entities)', () => {
  // Valid CIF for Sociedad Anónima (A48265169)
  const validCifA = validateSpanishTaxId('A48265169');
  assert.equal(validCifA.isValid, true);
  assert.equal(validCifA.type, 'CIF');

  // Valid CIF for Sociedad Limitada (B99887762)
  const validCifB = validateSpanishTaxId('B99887762');
  assert.equal(validCifB.isValid, true);
  assert.equal(validCifB.type, 'CIF');

  // Invalid CIF checksum
  const invalidCif = validateSpanishTaxId('B99887769');
  assert.equal(invalidCif.isValid, false);
  assert.equal(invalidCif.type, 'CIF');

  // Non-existent format or wrong length
  const tooShort = validateSpanishTaxId('12345');
  assert.equal(tooShort.isValid, false);
  assert.equal(tooShort.type, 'INVALID');
});

test('prepareOnboardingActivitiesPayload validates and structures activity payload for create_tenant_workspace RPC', () => {
  const validInputs: ActivityFormInput[] = [
    {
      name: 'Contabilidad Comunidades',
      iaeCode: '842',
      seriesPrefix: 'COM',
      defaultVatRate: 21,
      defaultIrpfRate: 15,
    },
    {
      name: 'Actividad Artística',
      iaeCode: '763',
      seriesPrefix: 'art ',
      defaultVatRate: 10,
      defaultIrpfRate: 7,
    },
  ];

  const result = prepareOnboardingActivitiesPayload(validInputs);
  assert.equal(result.isValid, true);
  assert.equal(result.payload.length, 2);
  assert.equal(result.payload[0].name, 'Contabilidad Comunidades');
  assert.equal(result.payload[0].invoice_series_prefix, 'COM');
  assert.equal(result.payload[0].default_vat_rate, 21);
  assert.equal(result.payload[1].invoice_series_prefix, 'ART'); // Uppercased and trimmed

  // Fails with empty array
  const empty = prepareOnboardingActivitiesPayload([]);
  assert.equal(empty.isValid, false);
  assert.match(empty.error || '', /al menos una actividad/);

  // Fails with duplicate series prefix
  const duplicate = prepareOnboardingActivitiesPayload([
    { name: 'Act 1', seriesPrefix: 'FAC', defaultVatRate: 21, defaultIrpfRate: 15 },
    { name: 'Act 2', seriesPrefix: 'fac', defaultVatRate: 21, defaultIrpfRate: 15 },
  ]);
  assert.equal(duplicate.isValid, false);
  assert.match(duplicate.error || '', /duplicado/);
});
