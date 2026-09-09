import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCompanyLookupResult } from '../mobile/src/services/companyLookup.js';

test('normalizes Annuaire des Entreprises result into SmoothFacture company fields', () => {
  const result = normalizeCompanyLookupResult({
    siren: '538179649',
    nom_complet: 'COURBOT GERARD',
    siege: {
      siret: '53817964900016',
      numero_voie: '4',
      type_voie: 'RUE',
      libelle_voie: 'BOURBON',
      code_postal: '62690',
      libelle_commune: 'AUBIGNY-EN-ARTOIS',
      activite_principale: '43.22A'
    }
  });

  assert.equal(result.legalName, 'COURBOT GERARD');
  assert.equal(result.siren, '538179649');
  assert.equal(result.siret, '53817964900016');
  assert.equal(result.address.line1, '4 RUE BOURBON');
  assert.equal(result.address.postalCode, '62690');
  assert.equal(result.address.city, 'AUBIGNY-EN-ARTOIS');
  assert.equal(result.address.countryCode, 'FR');
  assert.equal(result.apeCode, '43.22A');
  assert.equal(result.lookup.source, 'annuaire-entreprises-data-gouv');
});
