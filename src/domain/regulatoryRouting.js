export const REGULATORY_ROUTES = Object.freeze({
  NOT_APPLICABLE_DOCUMENT: 'NOT_APPLICABLE_DOCUMENT',
  DOMESTIC_B2B_EINVOICE: 'DOMESTIC_B2B_EINVOICE',
  B2C_TRANSACTION_EREPORTING: 'B2C_TRANSACTION_EREPORTING',
  INTERNATIONAL_TRANSACTION_EREPORTING: 'INTERNATIONAL_TRANSACTION_EREPORTING',
  PUBLIC_SECTOR_CHORUS_PRO: 'PUBLIC_SECTOR_CHORUS_PRO',
  OUT_OF_SCOPE_EXEMPT_OPERATION: 'OUT_OF_SCOPE_EXEMPT_OPERATION',
  UNSUPPORTED_CASE: 'UNSUPPORTED_CASE'
});

export const COMPANY_SIZE_CATEGORIES = Object.freeze({
  MICRO: 'micro',
  TPE: 'tpe',
  PME: 'pme',
  ETI: 'eti',
  LARGE: 'large',
  UNKNOWN: 'unknown'
});

export const REFORM_DATES = Object.freeze({
  RECEPTION_ALL: '2026-09-01',
  EMISSION_ETI_LARGE: '2026-09-01',
  EMISSION_MICRO_TPE_PME: '2027-09-01'
});

const FRANCE = 'FR';
const DOMESTIC_OPERATION_CATEGORIES = new Set(['LB', 'PS', 'LBPS']);

export function classifyRegulatoryRoute(invoice = {}, companyProfile = {}, effectiveDate = null) {
  const date = normalizeDateKey(effectiveDate || invoice.issueDate || new Date());
  const companyReform = companyProfile.reform || invoice.regulatory?.companyReform || {};
  const companySizeCategory = normalizeCompanySize(companyReform.companySizeCategory || invoice.regulatory?.companySizeCategory);

  if (invoice.documentType && invoice.documentType !== 'facture') {
    return result(REGULATORY_ROUTES.NOT_APPLICABLE_DOCUMENT, {
      date,
      companySizeCategory,
      supportedByMvp: true,
      reason: 'La réforme de facturation électronique vise les factures, pas les devis.'
    });
  }

  const unsupportedProfileReason = detectUnsupportedSellerProfile(companyProfile, invoice);
  if (unsupportedProfileReason) {
    return result(REGULATORY_ROUTES.UNSUPPORTED_CASE, {
      date,
      companySizeCategory,
      supportedByMvp: false,
      reason: unsupportedProfileReason
    });
  }

  const sellerCountry = resolvePartyCountry(invoice.seller, companyProfile.address, companyReform.establishedInFrance);
  if (!sellerCountry) {
    return result(REGULATORY_ROUTES.UNSUPPORTED_CASE, {
      date,
      companySizeCategory,
      supportedByMvp: false,
      reason: 'Pays d’établissement du vendeur à confirmer.'
    });
  }
  if (sellerCountry !== FRANCE) {
    return result(REGULATORY_ROUTES.UNSUPPORTED_CASE, {
      date,
      companySizeCategory,
      supportedByMvp: false,
      reason: 'Le MVP couvre uniquement les vendeurs établis en France.'
    });
  }

  if (invoice.regulatory?.outOfScopeReason) {
    return result(REGULATORY_ROUTES.OUT_OF_SCOPE_EXEMPT_OPERATION, {
      date,
      companySizeCategory,
      supportedByMvp: true,
      reason: invoice.regulatory.outOfScopeReason
    });
  }

  const buyer = invoice.buyer || {};
  const buyerType = buyer.type || 'individual';
  const buyerCountry = resolvePartyCountry(buyer, buyer.address, buyer.establishedInFrance);

  if (buyerType === 'public_entity') {
    return result(REGULATORY_ROUTES.PUBLIC_SECTOR_CHORUS_PRO, {
      date,
      companySizeCategory,
      supportedByMvp: Boolean(companyReform.chorusProEnabled),
      reason: companyReform.chorusProEnabled
        ? 'Client public : routage Chorus Pro requis.'
        : 'Client public : Chorus Pro n’est pas encore pris en charge par le MVP.'
    });
  }

  if (!buyerCountry) {
    return result(REGULATORY_ROUTES.UNSUPPORTED_CASE, {
      date,
      companySizeCategory,
      supportedByMvp: false,
      reason: 'Pays du client à confirmer avant de déterminer le routage réglementaire.'
    });
  }

  if (buyerType === 'company') {
    if (buyerCountry === FRANCE || buyer.establishedInFrance === true) {
      return result(REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE, {
        date,
        companySizeCategory,
        supportedByMvp: true,
        paymentReportingDecision: paymentReportingDecision(invoice, companyProfile)
      });
    }

    return result(REGULATORY_ROUTES.INTERNATIONAL_TRANSACTION_EREPORTING, {
      date,
      companySizeCategory,
      supportedByMvp: Boolean(companyReform.supportsInternational),
      reason: companyReform.supportsInternational
        ? 'Client professionnel étranger : e-reporting de transaction requis.'
        : 'Les transactions internationales ne sont pas encore prises en charge par le MVP.',
      paymentReportingDecision: paymentReportingDecision(invoice, companyProfile)
    });
  }

  if (buyerType === 'individual') {
    if (buyerCountry === FRANCE) {
      return result(REGULATORY_ROUTES.B2C_TRANSACTION_EREPORTING, {
        date,
        companySizeCategory,
        supportedByMvp: true,
        paymentReportingDecision: paymentReportingDecision(invoice, companyProfile)
      });
    }

    return result(REGULATORY_ROUTES.INTERNATIONAL_TRANSACTION_EREPORTING, {
      date,
      companySizeCategory,
      supportedByMvp: Boolean(companyReform.supportsInternational),
      reason: companyReform.supportsInternational
        ? 'Client particulier étranger : e-reporting de transaction requis.'
        : 'Les transactions internationales ne sont pas encore prises en charge par le MVP.',
      paymentReportingDecision: paymentReportingDecision(invoice, companyProfile)
    });
  }

  return result(REGULATORY_ROUTES.UNSUPPORTED_CASE, {
    date,
    companySizeCategory,
    supportedByMvp: false,
    reason: 'Type de client non pris en charge par le MVP.'
  });
}

export function getReformObligationState(companyProfile = {}, effectiveDate = null) {
  const date = normalizeDateKey(effectiveDate || new Date());
  const companySizeCategory = normalizeCompanySize(companyProfile.reform?.companySizeCategory);
  const receptionMandatoryNow = isOnOrAfter(date, REFORM_DATES.RECEPTION_ALL);
  const emissionStartDate = emissionStartFor(companySizeCategory);

  return {
    effectiveDate: date,
    companySizeCategory,
    receptionMandatoryNow,
    emissionStartDate,
    emissionMandatoryNow: emissionStartDate ? isOnOrAfter(date, emissionStartDate) : null,
    reportingMandatoryNow: emissionStartDate ? isOnOrAfter(date, emissionStartDate) : null
  };
}

export function normalizeOperationCategory(value) {
  if (DOMESTIC_OPERATION_CATEGORIES.has(value)) return value;
  if (value === 'goods') return 'LB';
  if (value === 'services') return 'PS';
  if (value === 'mixed') return 'LBPS';
  return null;
}

function result(route, {
  date,
  companySizeCategory,
  supportedByMvp,
  reason = '',
  paymentReportingDecision = 'not_required'
}) {
  const emissionStartDate = emissionStartFor(companySizeCategory);
  const emissionMandatoryNow = emissionStartDate ? isOnOrAfter(date, emissionStartDate) : null;
  const reportingMandatoryNow = emissionStartDate ? isOnOrAfter(date, emissionStartDate) : null;
  const requiresElectronicInvoice = route === REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE;
  const requiresTransactionReporting = [
    REGULATORY_ROUTES.B2C_TRANSACTION_EREPORTING,
    REGULATORY_ROUTES.INTERNATIONAL_TRANSACTION_EREPORTING
  ].includes(route);
  const requiresPA = requiresElectronicInvoice || requiresTransactionReporting;
  const requiresChorusPro = route === REGULATORY_ROUTES.PUBLIC_SECTOR_CHORUS_PRO;

  return {
    route,
    supportedByMvp,
    reason,
    effectiveDate: date,
    companySizeCategory,
    obligations: {
      requiresElectronicInvoice,
      requiresTransactionReporting,
      requiresPaymentReporting: paymentReportingDecision === 'required'
        ? true
        : (paymentReportingDecision === 'not_required' ? false : null),
      paymentReportingDecision,
      requiresPA,
      requiresChorusPro,
      receptionMandatoryNow: isOnOrAfter(date, REFORM_DATES.RECEPTION_ALL),
      emissionStartDate,
      emissionMandatoryNow,
      reportingMandatoryNow,
      mandatoryNow: requiresElectronicInvoice
        ? emissionMandatoryNow
        : (requiresTransactionReporting ? reportingMandatoryNow : false)
    }
  };
}

function paymentReportingDecision(invoice, companyProfile) {
  const operationCategory = normalizeOperationCategory(invoice.operationCategory);
  if (!['PS', 'LBPS'].includes(operationCategory)) return 'not_required';

  const treatment = invoice.tax?.treatment;
  const regime = invoice.tax?.regime;
  if (treatment === 'reverse_charge_btp' || treatment === 'exempt' || regime === 'exempt_293b') return 'not_required';

  const vatOnDebits = companyProfile.tax?.vatOnDebits ?? invoice.tax?.vatOnDebits;
  if (vatOnDebits === true) return 'not_required';
  if (vatOnDebits === false) return 'required';
  return 'needs_vat_on_debits_setting';
}

function detectUnsupportedSellerProfile(companyProfile, invoice) {
  const reform = companyProfile.reform || invoice.regulatory?.companyReform || {};
  const tax = companyProfile.tax || {};
  if (reform.vatGroup === true) return 'Les groupes TVA / assujettis uniques ne sont pas encore pris en charge.';
  if (reform.fiscalRepresentative === true) return 'La représentation fiscale n’est pas encore prise en charge.';
  if (reform.selfBilling === true) return 'L’autofacturation n’est pas encore prise en charge.';
  if (tax.specialRegime) return 'Le régime TVA spécial sélectionné n’est pas encore pris en charge.';
  return '';
}

function resolvePartyCountry(party = {}, fallbackAddress = {}, establishedInFrance = null) {
  const direct = normalizeCountryCode(party.countryCode || party.address?.countryCode || fallbackAddress?.countryCode);
  if (direct) return direct;
  if (party.establishedInFrance === true || establishedInFrance === true) return FRANCE;
  if (party.establishedInFrance === false || establishedInFrance === false) return '';
  return '';
}

function normalizeCompanySize(value) {
  return Object.values(COMPANY_SIZE_CATEGORIES).includes(value) ? value : COMPANY_SIZE_CATEGORIES.UNKNOWN;
}

function emissionStartFor(companySizeCategory) {
  if ([COMPANY_SIZE_CATEGORIES.ETI, COMPANY_SIZE_CATEGORIES.LARGE].includes(companySizeCategory)) {
    return REFORM_DATES.EMISSION_ETI_LARGE;
  }
  if ([COMPANY_SIZE_CATEGORIES.MICRO, COMPANY_SIZE_CATEGORIES.TPE, COMPANY_SIZE_CATEGORIES.PME].includes(companySizeCategory)) {
    return REFORM_DATES.EMISSION_MICRO_TPE_PME;
  }
  return null;
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(code) ? code : '';
}

function normalizeDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return text;
  const french = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u);
  if (french) return `${french[3]}-${french[2].padStart(2, '0')}-${french[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function isOnOrAfter(value, threshold) {
  return String(value || '') >= threshold;
}
