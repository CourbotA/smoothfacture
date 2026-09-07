import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recalculateInvoiceTax,
  setInvoiceTaxTreatment,
  setLineVatRate,
  setReducedRateCertification,
  validateTaxConfiguration,
  VAT_REGIMES,
  VAT_TREATMENTS
} from '../src/domain/taxModel.js';

function invoice(overrides = {}) {
  return {
    buyer: { type: 'individual', legalName: 'Jean Dupont' },
    lines: [
      { id: 'a', description: 'Main-d’œuvre', totalExcludingTax: 100, vatRate: 20 },
      { id: 'b', description: 'Fourniture', totalExcludingTax: 50, vatRate: 10 }
    ],
    tax: {
      regime: VAT_REGIMES.STANDARD,
      treatment: VAT_TREATMENTS.DOMESTIC,
      defaultVatRate: 20,
      reducedRateCertificationConfirmed: true
    },
    ...overrides
  };
}

test('groups mixed VAT rates and calculates HT, TVA and TTC', () => {
  const result = recalculateInvoiceTax(invoice());
  assert.equal(result.totals.excludingTax, 150);
  assert.equal(result.totals.tax, 25);
  assert.equal(result.totals.includingTax, 175);
  assert.deepEqual(result.taxBreakdown.map(row => [row.vatRate, row.taxableBase, row.taxAmount]), [
    [20, 100, 20],
    [10, 50, 5]
  ]);
});

test('293 B exemption always produces zero VAT', () => {
  const result = recalculateInvoiceTax(invoice({
    tax: {
      regime: VAT_REGIMES.EXEMPT_293B,
      treatment: VAT_TREATMENTS.EXEMPT,
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    }
  }));
  assert.equal(result.totals.tax, 0);
  assert.equal(result.totals.includingTax, 150);
  assert.ok(result.taxBreakdown.every(row => row.taxAmount === 0));
});

test('BTP reverse charge keeps HT base but collects no VAT', () => {
  const source = invoice({ buyer: { type: 'company', legalName: 'Entreprise cliente', siren: '123456789' } });
  const result = setInvoiceTaxTreatment(source, VAT_TREATMENTS.REVERSE_CHARGE_BTP);
  assert.equal(result.totals.excludingTax, 150);
  assert.equal(result.totals.tax, 0);
  assert.equal(result.totals.includingTax, 150);
  assert.ok(result.taxBreakdown.every(row => row.taxCategory === 'reverse_charge'));
  assert.ok(result.taxBreakdown.every(row => row.exemptionReason === 'Autoliquidation'));
});

test('reverse charge is blocked for an individual customer', () => {
  const result = setInvoiceTaxTreatment(invoice(), VAT_TREATMENTS.REVERSE_CHARGE_BTP);
  assert.ok(validateTaxConfiguration(result).some(issue => issue.code === 'reverse_charge_requires_company' && issue.blocking));
});

test('reduced VAT rate requires explicit certification', () => {
  let result = recalculateInvoiceTax(invoice({
    lines: [{ id: 'a', description: 'Rénovation', totalExcludingTax: 100, vatRate: 10 }],
    tax: {
      regime: VAT_REGIMES.STANDARD,
      treatment: VAT_TREATMENTS.DOMESTIC,
      defaultVatRate: 20,
      reducedRateCertificationConfirmed: false
    }
  }));
  assert.ok(validateTaxConfiguration(result).some(issue => issue.code === 'reduced_rate_certification_required'));

  result = setReducedRateCertification(result, true);
  assert.equal(validateTaxConfiguration(result).some(issue => issue.code === 'reduced_rate_certification_required'), false);
});

test('changing one line VAT rate recalculates totals', () => {
  const source = recalculateInvoiceTax(invoice({
    lines: [{ id: 'a', description: 'Travaux', totalExcludingTax: 200, vatRate: 20 }],
    tax: {
      regime: VAT_REGIMES.STANDARD,
      treatment: VAT_TREATMENTS.DOMESTIC,
      defaultVatRate: 20,
      reducedRateCertificationConfirmed: true
    }
  }));
  const result = setLineVatRate(source, 'a', 5.5);
  assert.equal(result.totals.tax, 11);
  assert.equal(result.totals.includingTax, 211);
});
