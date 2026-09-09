import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRegulatoryRoute, REGULATORY_ROUTES } from '../src/domain/regulatoryRouting.js';
import { validateElectronicInvoiceReadiness } from '../src/domain/invoiceCompliance.js';

function company(overrides = {}) {
  return {
    legalName: 'Test Plomberie',
    siren: '123456789',
    siret: '12345678900010',
    address: { line1: '1 rue du Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' },
    tax: { vatRegime: 'exempt_293b', vatOnDebits: null },
    reform: {
      companySizeCategory: 'tpe',
      establishedInFrance: true,
      supportsInternational: false,
      chorusProEnabled: false,
      paConnection: null
    },
    ...overrides
  };
}

function invoice(overrides = {}) {
  return {
    schemaVersion: 3,
    documentType: 'facture',
    invoiceType: 'standard',
    issueDate: '2026-09-08',
    serviceOrSupplyDate: '2026-09-08',
    currency: 'EUR',
    seller: {
      type: 'company',
      legalName: 'Test Plomberie',
      siren: '123456789',
      siret: '12345678900010',
      countryCode: 'FR',
      establishedInFrance: true,
      address: { line1: '1 rue du Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    buyer: {
      type: 'company',
      legalName: 'SARL Client',
      siren: '987654321',
      countryCode: 'FR',
      establishedInFrance: true,
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    operationCategory: 'PS',
    lines: [{
      id: '1',
      description: 'Dépannage plomberie',
      quantity: 1,
      unitPriceExcludingTax: 100,
      totalExcludingTax: 100,
      vatRate: 0
    }],
    allowances: [],
    charges: [],
    tax: {
      regime: 'exempt_293b',
      treatment: 'exempt',
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    },
    correction: { originalInvoiceNumber: null, originalInvoiceDate: null, reason: '' },
    electronicInvoice: { lifecycleStatus: 'draft', transmissionStatus: 'not_sent' },
    ...overrides
  };
}

test('French professional buyer routes to domestic B2B electronic invoicing', () => {
  const route = classifyRegulatoryRoute(invoice(), company(), '2026-09-08');
  assert.equal(route.route, REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE);
  assert.equal(route.obligations.requiresElectronicInvoice, true);
  assert.equal(route.obligations.requiresTransactionReporting, false);
  assert.equal(route.obligations.emissionMandatoryNow, false);
});

test('French individual buyer routes to transaction e-reporting', () => {
  const route = classifyRegulatoryRoute(invoice({
    buyer: {
      type: 'individual',
      legalName: 'Jean Dupont',
      countryCode: 'FR',
      establishedInFrance: true,
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    }
  }), company(), '2027-09-01');

  assert.equal(route.route, REGULATORY_ROUTES.B2C_TRANSACTION_EREPORTING);
  assert.equal(route.obligations.requiresElectronicInvoice, false);
  assert.equal(route.obligations.requiresTransactionReporting, true);
  assert.equal(route.obligations.reportingMandatoryNow, true);
});

test('TPE emission becomes mandatory on 1 September 2027', () => {
  const before = classifyRegulatoryRoute(invoice(), company(), '2027-08-31');
  const onDate = classifyRegulatoryRoute(invoice(), company(), '2027-09-01');
  assert.equal(before.obligations.emissionMandatoryNow, false);
  assert.equal(onDate.obligations.emissionMandatoryNow, true);
});

test('international transaction is classified but blocked by the MVP envelope by default', () => {
  const route = classifyRegulatoryRoute(invoice({
    buyer: {
      type: 'company',
      legalName: 'Foreign Buyer Ltd',
      siren: '',
      vatNumber: 'DE123456789',
      countryCode: 'DE',
      establishedInFrance: false,
      address: { line1: '1 Teststrasse', postalCode: '10115', city: 'Berlin', countryCode: 'DE' }
    }
  }), company(), '2027-09-01');

  assert.equal(route.route, REGULATORY_ROUTES.INTERNATIONAL_TRANSACTION_EREPORTING);
  assert.equal(route.supportedByMvp, false);
});

test('2027 domestic B2B validation blocks missing structured unit price and PA connection', () => {
  const candidate = invoice({
    issueDate: '2027-09-01',
    lines: [{
      id: '1',
      description: 'Dépannage plomberie',
      quantity: 1,
      unitPriceExcludingTax: null,
      totalExcludingTax: 100,
      vatRate: 0
    }]
  });

  const readiness = validateElectronicInvoiceReadiness(candidate, {
    companyProfile: company(),
    effectiveDate: '2027-09-01'
  });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.some(issue => issue.code === 'missing_structured_unit_price' && issue.blocking));
  assert.ok(readiness.issues.some(issue => issue.code === 'pa_connection_required' && issue.blocking));
});

test('2027 domestic B2B becomes transmittable once structured data and PA connection are complete', () => {
  const configuredCompany = company({
    reform: {
      companySizeCategory: 'tpe',
      establishedInFrance: true,
      supportsInternational: false,
      chorusProEnabled: false,
      paConnection: { provider: 'test-pa', accountId: 'acct-1' }
    }
  });
  const readiness = validateElectronicInvoiceReadiness(invoice({ issueDate: '2027-09-01' }), {
    companyProfile: configuredCompany,
    effectiveDate: '2027-09-01'
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.regulatoryReady, true);
  assert.equal(readiness.transmittable, true);
});
