import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRegulatoryRoute, REGULATORY_ROUTES } from '../src/domain/regulatoryRouting.js';
import { createCanonicalInvoice, CUSTOMER_TYPES } from '../src/domain/invoiceModel.js';
import { cloneDefaultCompanyProfile } from '../src/config/defaultCompany.js';

function baseInvoice(overrides = {}) {
  return {
    documentType: 'facture',
    issueDate: '2026-09-08',
    seller: {
      type: 'company',
      legalName: 'Test',
      siren: '123456789',
      countryCode: 'FR',
      establishedInFrance: true,
      address: { line1: '1 rue Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    buyer: {
      type: 'individual',
      legalName: 'Client',
      countryCode: 'FR',
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    operationCategory: 'PS',
    tax: { regime: 'exempt_293b', treatment: 'exempt' },
    ...overrides
  };
}

function company(overrides = {}) {
  return {
    address: { countryCode: 'FR' },
    reform: {
      companySizeCategory: 'tpe',
      establishedInFrance: true,
      supportsInternational: false,
      chorusProEnabled: false,
      ...overrides
    }
  };
}

test('public-sector route is immediately mandatory and unsupported without Chorus Pro integration', () => {
  const route = classifyRegulatoryRoute(baseInvoice({
    buyer: {
      type: 'public_entity',
      legalName: 'Mairie de Test',
      countryCode: 'FR',
      address: { line1: '1 place de la Mairie', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    }
  }), company(), '2026-09-08');

  assert.equal(route.route, REGULATORY_ROUTES.PUBLIC_SECTOR_CHORUS_PRO);
  assert.equal(route.supportedByMvp, false);
  assert.equal(route.obligations.requiresChorusPro, true);
  assert.equal(route.obligations.mandatoryNow, true);
});

test('client-supplied out-of-scope reason cannot bypass the routing engine', () => {
  const route = classifyRegulatoryRoute(baseInvoice({
    regulatory: { outOfScopeReason: 'client supplied bypass attempt' }
  }), company(), '2026-09-08');

  assert.equal(route.route, REGULATORY_ROUTES.UNSUPPORTED_CASE);
  assert.equal(route.supportedByMvp, false);
});

test('approximate work month is not promoted to an exact legal service date', () => {
  const invoice = createCanonicalInvoice({
    companyProfile: cloneDefaultCompanyProfile(),
    legacyInvoice: {
      documentType: 'facture',
      invoiceDate: '08/09/2026',
      client: {
        type: CUSTOMER_TYPES.INDIVIDUAL,
        name: 'Jean Dupont',
        address: '12 rue Pasteur\n73000 Chambéry',
        postalCode: '73000',
        city: 'Chambéry'
      },
      intervention: {
        workDate: {
          value: '2026-05',
          displayValue: 'Mai 2026',
          precision: 'month'
        }
      },
      items: [{
        description: 'Dépannage',
        quantity: '1,00',
        unit: 'h',
        unitPrice: '85,00 €',
        total: '85,00 €',
        hasExplicitPrice: true
      }]
    }
  });

  assert.equal(invoice.serviceOrSupplyDate, null);
  assert.equal(invoice.work.date.precision, 'month');
});
