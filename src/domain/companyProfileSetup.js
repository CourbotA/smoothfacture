import { VAT_EXEMPTION_293B, VAT_REGIMES } from './taxModel.js';

export const COMPANY_ONBOARDING_VERSION = 1;

export const INSURANCE_STATUSES = Object.freeze({
  COVERED: 'covered',
  NOT_APPLICABLE: 'not_applicable',
  UNKNOWN: 'unknown'
});

export const PAYMENT_TERM_PRESETS = Object.freeze([
  { key: 'receipt', label: 'À réception', days: 0 },
  { key: '15', label: '15 jours', days: 15 },
  { key: '30', label: '30 jours', days: 30 },
  { key: '45', label: '45 jours', days: 45 }
]);

export function isCompanyOnboardingComplete(profile = {}) {
  return Boolean(profile?.onboarding?.completedAt) && getCompanySetupMissingFields(profile).length === 0;
}

export function getCompanySetupMissingFields(profile = {}) {
  const missing = [];
  if (!String(profile.legalName || '').trim()) missing.push('legalName');
  if (!/^\d{9}$/u.test(String(profile.siren || '').replace(/\D/g, ''))) missing.push('siren');

  const address = profile.address || {};
  if (!String(address.line1 || '').trim()) missing.push('address.line1');
  if (!String(address.postalCode || '').trim()) missing.push('address.postalCode');
  if (!String(address.city || '').trim()) missing.push('address.city');

  if (![VAT_REGIMES.EXEMPT_293B, VAT_REGIMES.STANDARD].includes(profile.tax?.vatRegime)) {
    missing.push('tax.vatRegime');
  }
  if (profile.tax?.vatRegime === VAT_REGIMES.STANDARD && !String(profile.tax?.vatNumber || profile.vatNumber || '').trim()) {
    missing.push('tax.vatNumber');
  }

  const termsDays = Number(profile.payment?.termsDays);
  if (!Number.isFinite(termsDays) || termsDays < 0) missing.push('payment.termsDays');

  if (!Object.values(INSURANCE_STATUSES).includes(profile.insurance?.status)) {
    missing.push('insurance.status');
  }
  if (profile.insurance?.status === INSURANCE_STATUSES.COVERED) {
    if (!String(profile.insurance?.insurer || '').trim()) missing.push('insurance.insurer');
    if (!String(profile.insurance?.coverageArea || '').trim()) missing.push('insurance.coverageArea');
  }

  return missing;
}

export function markCompanyOnboardingComplete(profile = {}, now = new Date()) {
  const normalized = normalizeCompanySetup(profile);
  const missing = getCompanySetupMissingFields(normalized);
  if (missing.length) {
    const error = new Error(`Configuration incomplète : ${missing.join(', ')}`);
    error.code = 'company_onboarding_incomplete';
    error.fields = missing;
    throw error;
  }

  return {
    ...normalized,
    onboarding: {
      ...(normalized.onboarding || {}),
      version: COMPANY_ONBOARDING_VERSION,
      completedAt: now instanceof Date ? now.toISOString() : String(now),
      lastStep: 4
    }
  };
}

export function normalizeCompanySetup(profile = {}) {
  const vatRegime = profile.tax?.vatRegime === VAT_REGIMES.STANDARD
    ? VAT_REGIMES.STANDARD
    : VAT_REGIMES.EXEMPT_293B;
  const termsDays = Math.max(0, Number.parseInt(profile.payment?.termsDays, 10) || 0);
  const insuranceStatus = Object.values(INSURANCE_STATUSES).includes(profile.insurance?.status)
    ? profile.insurance.status
    : INSURANCE_STATUSES.UNKNOWN;

  const tax = vatRegime === VAT_REGIMES.STANDARD
    ? {
        ...(profile.tax || {}),
        vatRegime,
        vatLiability: 'vat_registered',
        filingRegime: profile.tax?.filingRegime || null,
        vatNumber: String(profile.tax?.vatNumber || profile.vatNumber || '').trim().toUpperCase(),
        defaultVatRate: Number(profile.tax?.defaultVatRate) || 20,
        exemptionReason: '',
        vatOnDebits: typeof profile.tax?.vatOnDebits === 'boolean' ? profile.tax.vatOnDebits : null
      }
    : {
        ...(profile.tax || {}),
        vatRegime: VAT_REGIMES.EXEMPT_293B,
        vatLiability: 'exempt_293b',
        filingRegime: 'franchise_293b',
        vatNumber: '',
        defaultVatRate: 0,
        exemptionReason: profile.tax?.exemptionReason || VAT_EXEMPTION_293B,
        vatOnDebits: null
      };

  return {
    ...profile,
    siren: digits(profile.siren, 9),
    siret: digits(profile.siret, 14),
    vatNumber: tax.vatNumber,
    address: {
      ...(profile.address || {}),
      countryCode: String(profile.address?.countryCode || 'FR').trim().toUpperCase() || 'FR'
    },
    tax,
    payment: {
      ...(profile.payment || {}),
      termsDays,
      conditions: termsDays === 0 ? 'À réception' : `${termsDays} jours`
    },
    insurance: {
      status: insuranceStatus,
      insurer: String(profile.insurance?.insurer || '').trim(),
      policyNumber: String(profile.insurance?.policyNumber || '').trim(),
      coverageArea: String(profile.insurance?.coverageArea || '').trim(),
      decennialCoverage: typeof profile.insurance?.decennialCoverage === 'boolean'
        ? profile.insurance.decennialCoverage
        : null,
      attestationReference: String(profile.insurance?.attestationReference || '').trim()
    },
    onboarding: {
      version: COMPANY_ONBOARDING_VERSION,
      completedAt: profile.onboarding?.completedAt || null,
      lastStep: Number(profile.onboarding?.lastStep) || 0,
      ...(profile.onboarding || {})
    }
  };
}

export function applyPaymentTerms(profile, days) {
  const value = Math.max(0, Number.parseInt(days, 10) || 0);
  return {
    ...profile,
    payment: {
      ...(profile.payment || {}),
      termsDays: value,
      conditions: value === 0 ? 'À réception' : `${value} jours`
    }
  };
}

function digits(value, length) {
  const normalized = String(value || '').replace(/\D/g, '');
  return normalized.length === length ? normalized : '';
}
