import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneDefaultCompanyProfile } from '../src/config/defaultCompany.js';
import {
  applyPaymentTerms,
  getCompanySetupMissingFields,
  isCompanyOnboardingComplete,
  markCompanyOnboardingComplete,
  normalizeCompanySetup
} from '../src/domain/companyProfileSetup.js';
import { VAT_REGIMES } from '../src/domain/taxModel.js';

test('default profile requires one-time onboarding completion', () => {
  const profile = normalizeCompanySetup(cloneDefaultCompanyProfile());
  assert.equal(isCompanyOnboardingComplete(profile), false);
  assert.deepEqual(getCompanySetupMissingFields(profile), []);

  const completed = markCompanyOnboardingComplete(profile, '2026-09-09T07:45:00.000Z');
  assert.equal(isCompanyOnboardingComplete(completed), true);
  assert.equal(completed.onboarding.completedAt, '2026-09-09T07:45:00.000Z');
});

test('VAT registered company must provide its VAT number before onboarding completes', () => {
  const profile = normalizeCompanySetup({
    ...cloneDefaultCompanyProfile(),
    tax: {
      ...cloneDefaultCompanyProfile().tax,
      vatRegime: VAT_REGIMES.STANDARD,
      vatNumber: '',
      defaultVatRate: 20
    }
  });

  assert.ok(getCompanySetupMissingFields(profile).includes('tax.vatNumber'));
  assert.throws(() => markCompanyOnboardingComplete(profile), error => error?.code === 'company_onboarding_incomplete');
});

test('covered insurance requires insurer and coverage area', () => {
  const profile = normalizeCompanySetup({
    ...cloneDefaultCompanyProfile(),
    insurance: {
      status: 'covered',
      insurer: '',
      coverageArea: '',
      policyNumber: '',
      decennialCoverage: null
    }
  });

  const missing = getCompanySetupMissingFields(profile);
  assert.ok(missing.includes('insurance.insurer'));
  assert.ok(missing.includes('insurance.coverageArea'));
});

test('payment preset updates both machine days and human wording', () => {
  const profile = applyPaymentTerms(cloneDefaultCompanyProfile(), 15);
  assert.equal(profile.payment.termsDays, 15);
  assert.equal(profile.payment.conditions, '15 jours');

  const receipt = applyPaymentTerms(profile, 0);
  assert.equal(receipt.payment.termsDays, 0);
  assert.equal(receipt.payment.conditions, 'À réception');
});
