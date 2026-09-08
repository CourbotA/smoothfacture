import test from 'node:test';
import assert from 'node:assert/strict';
import { validateElectronicInvoiceReadiness } from '../src/domain/invoiceCompliance.js';

function invoice() {
  return {
    schemaVersion: 3,
    documentType: 'facture',
    invoiceType: 'standard',
    issueDate: '2026-09-08',
    serviceOrSupplyDate: '2026-09-08',
    currency: 'EUR',
    seller: {
      type: 'company',
      legalName: 'Entreprise inconnue',
      siren: '123456789',
      countryCode: 'FR',
      address: { line1: '1 rue Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    buyer: {
      type: 'individual',
      legalName: 'Jean Dupont',
      countryCode: 'FR',
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    operationCategory: 'PS',
    lines: [{ id: '1', description: 'Dépannage', quantity: 1, unitPriceExcludingTax: 100, totalExcludingTax: 100, vatRate: 0 }],
    allowances: [],
    charges: [],
    tax: {
      regime: 'exempt_293b',
      treatment: 'exempt',
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    }
  };
}

test('unknown company size blocks readiness after the reform starts', () => {
  const readiness = validateElectronicInvoiceReadiness(invoice(), {
    companyProfile: {
      address: { countryCode: 'FR' },
      reform: { companySizeCategory: 'unknown', establishedInFrance: true }
    },
    effectiveDate: '2026-09-08'
  });

  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.some(issue => issue.code === 'missing_company_size' && issue.blocking));
});
