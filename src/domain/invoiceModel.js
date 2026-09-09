import {
  applyTaxDefaultsToLines,
  createInvoiceTaxSettings,
  recalculateInvoiceTax
} from './taxModel.js';
import {
  classifyRegulatoryRoute,
  normalizeOperationCategory
} from './regulatoryRouting.js';

export const CUSTOMER_TYPES = Object.freeze({
  INDIVIDUAL: 'individual',
  COMPANY: 'company',
  PUBLIC_ENTITY: 'public_entity'
});

export const OPERATION_CATEGORIES = Object.freeze({
  GOODS: 'LB',
  SERVICES: 'PS',
  MIXED: 'LBPS',
  UNKNOWN: null
});

export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: 'facture',
  QUOTE: 'devis'
});

export const INVOICE_TYPES = Object.freeze({
  STANDARD: 'standard',
  DEPOSIT: 'deposit',
  CREDIT_NOTE: 'credit_note',
  CORRECTIVE: 'corrective'
});

export function createCanonicalInvoice({ legacyInvoice = {}, companyProfile = null } = {}) {
  const seller = companyProfile ? companyToParty(companyProfile) : legacySellerToParty(legacyInvoice);
  const buyer = legacyBuyerToParty(legacyInvoice.client || {});
  const tax = createInvoiceTaxSettings(companyProfile || {});
  const lines = applyTaxDefaultsToLines(
    (legacyInvoice.items || []).map((item, index) => canonicalizeLine(item, index)),
    tax
  );
  const workAddress = normalizeOptionalAddress(
    legacyInvoice.intervention?.address,
    legacyInvoice.intervention?.postalCode,
    legacyInvoice.intervention?.city,
    legacyInvoice.intervention?.countryCode
  );
  const billingAddress = buyer.billingAddress || buyer.address;
  const deliveryAddress = buyer.deliveryAddress || null;
  const serviceOrSupplyDate = normalizeServiceOrSupplyDate(
    legacyInvoice.serviceOrSupplyDate || legacyInvoice.intervention?.workDate
  );
  const payment = {
    iban: companyProfile?.payment?.iban || legacyInvoice.payment?.iban || '',
    termsDays: companyProfile?.payment?.termsDays ?? null,
    conditions: companyProfile?.payment?.conditions || legacyInvoice.payment?.conditions || '',
    discount: companyProfile?.payment?.discount || legacyInvoice.payment?.discount || '',
    lateFees: companyProfile?.payment?.lateFees || legacyInvoice.payment?.lateFees || '',
    recoveryFee: companyProfile?.payment?.recoveryFee || legacyInvoice.payment?.recoveryFee || ''
  };

  const invoice = recalculateInvoiceTax({
    schemaVersion: 3,
    id: legacyInvoice.id || null,
    documentType: legacyInvoice.documentType || DOCUMENT_TYPES.INVOICE,
    invoiceType: normalizeInvoiceType(legacyInvoice.invoiceType),
    number: legacyInvoice.invoiceNumber || null,
    issueDate: legacyInvoice.invoiceDate || '',
    serviceOrSupplyDate,
    dueDate: legacyInvoice.dueDate || '',
    currency: normalizeCurrency(legacyInvoice.currency) || 'EUR',
    seller,
    buyer,
    purchaseOrderReference: String(legacyInvoice.purchaseOrderReference || legacyInvoice.orderReference || '').trim(),
    billingAddress,
    deliveryAddress,
    workAddress,
    operationCategory: normalizeOperationCategory(legacyInvoice.operationCategory)
      || inferRegulatoryOperationCategory(lines),
    lines,
    allowances: normalizeAdjustments(legacyInvoice.allowances),
    charges: normalizeAdjustments(legacyInvoice.charges),
    tax,
    payment,
    paymentTerms: payment,
    correction: normalizeCorrection(legacyInvoice.correction || legacyInvoice),
    work: {
      address: workAddress || legacyInvoice.intervention?.address || '',
      date: legacyInvoice.intervention?.workDate || null,
      category: legacyInvoice.operationType || 'Travaux'
    },
    electronicInvoice: {
      direction: 'outbound',
      channel: null,
      format: null,
      profile: null,
      platformProvider: null,
      paProvider: null,
      paAccountId: null,
      platformInvoiceId: null,
      paInvoiceId: null,
      recipientRoutingId: null,
      depositAt: null,
      lifecycleStatus: 'draft',
      transmissionStatus: 'not_sent',
      reportingStatus: 'not_required_yet',
      lastError: null
    },
    source: {
      rawText: legacyInvoice.sourceText || '',
      interpreterEngine: legacyInvoice.interpretation?.engine || null,
      parserVersion: legacyInvoice.interpretation?.version || null
    }
  });

  return attachRegulatoryClassification(invoice, companyProfile || {});
}

export function upgradeCanonicalInvoice(invoice = {}, companyProfile = null) {
  const current = invoice && typeof invoice === 'object' ? invoice : {};
  const seller = companyProfile ? companyToParty(companyProfile) : normalizeParty(current.seller || {});
  const buyer = normalizeParty(current.buyer || {});
  const lines = (current.lines || []).map((line, index) => canonicalizeExistingLine(line, index));
  const payment = current.paymentTerms || current.payment || {};
  const upgraded = recalculateInvoiceTax({
    ...current,
    schemaVersion: 3,
    documentType: current.documentType === DOCUMENT_TYPES.QUOTE ? DOCUMENT_TYPES.QUOTE : DOCUMENT_TYPES.INVOICE,
    invoiceType: normalizeInvoiceType(current.invoiceType),
    currency: normalizeCurrency(current.currency) || 'EUR',
    seller,
    buyer,
    serviceOrSupplyDate: normalizeServiceOrSupplyDate(current.serviceOrSupplyDate || current.work?.date),
    purchaseOrderReference: String(current.purchaseOrderReference || '').trim(),
    billingAddress: normalizeAddress(current.billingAddress || buyer.billingAddress || buyer.address),
    deliveryAddress: normalizeNullableAddress(current.deliveryAddress || buyer.deliveryAddress),
    workAddress: normalizeWorkAddress(current.workAddress || current.work?.address),
    operationCategory: normalizeOperationCategory(current.operationCategory),
    lines,
    allowances: normalizeAdjustments(current.allowances),
    charges: normalizeAdjustments(current.charges),
    payment,
    paymentTerms: payment,
    correction: normalizeCorrection(current.correction || current),
    electronicInvoice: {
      direction: 'outbound',
      channel: null,
      format: null,
      profile: null,
      platformProvider: null,
      paProvider: null,
      paAccountId: null,
      platformInvoiceId: null,
      paInvoiceId: null,
      recipientRoutingId: null,
      depositAt: null,
      lifecycleStatus: 'draft',
      transmissionStatus: 'not_sent',
      reportingStatus: 'not_required_yet',
      lastError: null,
      ...(current.electronicInvoice || {})
    },
    source: {
      rawText: '',
      interpreterEngine: null,
      parserVersion: null,
      ...(current.source || {})
    }
  });

  return attachRegulatoryClassification(upgraded, companyProfile || {});
}

export function attachRegulatoryClassification(invoice, companyProfile = {}, effectiveDate = null) {
  const classification = classifyRegulatoryRoute(invoice, companyProfile, effectiveDate || invoice.issueDate || null);
  return {
    ...invoice,
    regulatory: {
      ...(invoice.regulatory || {}),
      route: classification.route,
      obligations: classification.obligations,
      supportedByMvp: classification.supportedByMvp,
      reason: classification.reason,
      validationVersion: 'fr-einvoice-2026.09-v1',
      legalEffectiveDate: classification.effectiveDate,
      companySizeCategory: classification.companySizeCategory,
      companyReform: {
        companySizeCategory: companyProfile.reform?.companySizeCategory || classification.companySizeCategory,
        establishedInFrance: companyProfile.reform?.establishedInFrance,
        supportsInternational: Boolean(companyProfile.reform?.supportsInternational),
        chorusProEnabled: Boolean(companyProfile.reform?.chorusProEnabled),
        vatGroup: Boolean(companyProfile.reform?.vatGroup),
        fiscalRepresentative: Boolean(companyProfile.reform?.fiscalRepresentative),
        selfBilling: Boolean(companyProfile.reform?.selfBilling)
      }
    }
  };
}

export function companyToParty(company) {
  const address = normalizeAddress(company.address, { inferFranceFromPostalCode: true });
  const countryCode = normalizeCountryCode(company.countryCode || address.countryCode);
  return {
    type: CUSTOMER_TYPES.COMPANY,
    legalName: company.legalName || '',
    tradingName: company.tradingName || '',
    siren: normalizeDigits(company.siren, 9),
    siret: normalizeDigits(company.siret, 14),
    vatNumber: String(company.vatNumber || company.tax?.vatNumber || '').trim(),
    foreignBusinessId: String(company.foreignBusinessId || '').trim(),
    establishedInFrance: company.reform?.establishedInFrance ?? (countryCode === 'FR'),
    countryCode,
    legalForm: company.legalForm || '',
    apeCode: company.apeCode || '',
    address,
    billingAddress: normalizeNullableAddress(company.billingAddress),
    deliveryAddress: normalizeNullableAddress(company.deliveryAddress),
    contact: {
      phone: company.contact?.phone || '',
      email: company.contact?.email || ''
    },
    electronicAddress: normalizeElectronicAddress(company.electronicAddress)
  };
}

function legacySellerToParty(invoice) {
  const address = legacyAddress(invoice.sender?.address || invoice.footer?.fullAddress || '');
  const countryCode = normalizeCountryCode(invoice.sender?.countryCode || address.countryCode);
  return {
    type: CUSTOMER_TYPES.COMPANY,
    legalName: invoice.sender?.name || invoice.footer?.enterprise || '',
    tradingName: invoice.sender?.name || '',
    siren: normalizeDigits(String(invoice.footer?.siret || '').slice(0, 9), 9),
    siret: normalizeDigits(invoice.footer?.siret, 14),
    vatNumber: String(invoice.sender?.vatNumber || '').trim(),
    foreignBusinessId: '',
    establishedInFrance: countryCode === 'FR',
    countryCode,
    legalForm: invoice.footer?.enterprise || '',
    apeCode: invoice.footer?.ape || '',
    address,
    billingAddress: null,
    deliveryAddress: null,
    contact: {
      phone: invoice.sender?.phone || '',
      email: invoice.sender?.email || ''
    },
    electronicAddress: normalizeElectronicAddress(null)
  };
}

function legacyBuyerToParty(client) {
  const siren = normalizeDigits(client.siren, 9);
  const address = client.address && typeof client.address === 'object'
    ? normalizeAddress(client.address, { inferFranceFromPostalCode: true })
    : legacyAddress(client.address || '', client.postalCode, client.city, client.countryCode);
  const countryCode = normalizeCountryCode(client.countryCode || address.countryCode);
  const type = client.type || (siren ? CUSTOMER_TYPES.COMPANY : CUSTOMER_TYPES.INDIVIDUAL);
  const billingAddress = client.billingAddress
    ? (typeof client.billingAddress === 'object'
      ? normalizeAddress(client.billingAddress, { inferFranceFromPostalCode: true })
      : legacyAddress(client.billingAddress))
    : null;
  const deliveryAddress = client.deliveryAddress
    ? (typeof client.deliveryAddress === 'object'
      ? normalizeAddress(client.deliveryAddress, { inferFranceFromPostalCode: true })
      : legacyAddress(client.deliveryAddress))
    : null;

  return {
    type,
    legalName: client.legalName || client.name || '',
    tradingName: client.tradingName || '',
    siren,
    siret: normalizeDigits(client.siret, 14),
    vatNumber: String(client.vatNumber || '').trim(),
    foreignBusinessId: String(client.foreignBusinessId || '').trim(),
    establishedInFrance: client.establishedInFrance ?? (countryCode === 'FR'),
    countryCode,
    address,
    billingAddress,
    deliveryAddress,
    contact: {
      email: client.email || '',
      phone: client.phone || ''
    },
    electronicAddress: normalizeElectronicAddress(client.electronicAddress)
  };
}

function canonicalizeLine(item, index) {
  const quantity = parseFrenchNumber(item.quantity, 1);
  const unitPrice = parseFrenchMoney(item.unitPrice);
  const explicitTotal = parseFrenchMoney(item.total);
  const lineAllowanceAmount = finiteMoneyOrZero(item.lineAllowanceAmount);
  const lineChargeAmount = finiteMoneyOrZero(item.lineChargeAmount);
  const lineGrossAmount = Number.isFinite(unitPrice) ? roundMoney(unitPrice * quantity) : explicitTotal;
  const totalExcludingTax = Number.isFinite(explicitTotal)
    ? explicitTotal
    : (Number.isFinite(lineGrossAmount)
      ? roundMoney(lineGrossAmount - lineAllowanceAmount + lineChargeAmount)
      : null);
  const parsedVatRate = item.vatRate == null || item.vatRate === '' ? null : Number(String(item.vatRate).replace(',', '.'));
  const unitLabel = String(item.unitLabel || item.unit || 'pce').trim();

  return {
    id: item.id || `line-${index + 1}`,
    description: item.description || '',
    quantity,
    unit: unitLabel,
    unitCode: String(item.unitCode || '').trim(),
    unitLabel,
    unitPriceExcludingTax: Number.isFinite(unitPrice) ? unitPrice : null,
    lineGrossAmount: Number.isFinite(lineGrossAmount) ? lineGrossAmount : null,
    lineAllowanceAmount,
    lineChargeAmount,
    totalExcludingTax,
    vatTreatment: item.vatTreatment || null,
    vatRate: Number.isFinite(parsedVatRate) ? parsedVatRate : null,
    hasExplicitPrice: Boolean(item.hasExplicitPrice),
    includedWithoutPrice: Boolean(item.includedWithoutPrice),
    sourceText: item.sourceText || ''
  };
}

function canonicalizeExistingLine(line, index) {
  const quantity = parseFrenchNumber(line.quantity, 1);
  const unitPrice = parseFrenchMoney(line.unitPriceExcludingTax ?? line.unitPrice);
  const totalExcludingTax = parseFrenchMoney(line.totalExcludingTax ?? line.total);
  const lineAllowanceAmount = finiteMoneyOrZero(line.lineAllowanceAmount);
  const lineChargeAmount = finiteMoneyOrZero(line.lineChargeAmount);
  const lineGrossAmount = parseFrenchMoney(line.lineGrossAmount)
    ?? (Number.isFinite(unitPrice) ? roundMoney(unitPrice * quantity) : totalExcludingTax);
  const unitLabel = String(line.unitLabel || line.unit || 'pce').trim();

  return {
    ...line,
    id: line.id || `line-${index + 1}`,
    description: String(line.description || ''),
    quantity,
    unit: unitLabel,
    unitCode: String(line.unitCode || '').trim(),
    unitLabel,
    unitPriceExcludingTax: Number.isFinite(unitPrice) ? unitPrice : null,
    lineGrossAmount: Number.isFinite(lineGrossAmount) ? lineGrossAmount : null,
    lineAllowanceAmount,
    lineChargeAmount,
    totalExcludingTax: Number.isFinite(totalExcludingTax) ? totalExcludingTax : null,
    vatTreatment: line.vatTreatment || null,
    sourceText: line.sourceText || ''
  };
}

function inferRegulatoryOperationCategory(lines) {
  if (!lines.length) return OPERATION_CATEGORIES.UNKNOWN;
  const serviceWords = /\b(?:main[- ]?d['’ ]?oeuvre|d[ée]placement|pose|repose|d[ée]montage|entretien|r[ée]paration|d[ée]pannage|installation|nettoyage|percement|fixation)\b/iu;
  const goodsWords = /\b(?:wc|chaudi[eè]re|flexible|robinet|siphon|radiateur|sortie|grille|br[ûu]leur|meuble|pi[eè]ce|mat[ée]riel|fourniture)\b/iu;
  let hasService = false;
  let hasGoods = false;

  lines.forEach(line => {
    if (serviceWords.test(line.description || '')) hasService = true;
    if (goodsWords.test(line.description || '')) hasGoods = true;
  });

  if (hasService && hasGoods) return OPERATION_CATEGORIES.MIXED;
  if (hasService) return OPERATION_CATEGORIES.SERVICES;
  if (hasGoods) return OPERATION_CATEGORIES.GOODS;
  return OPERATION_CATEGORIES.UNKNOWN;
}

function normalizeParty(party = {}) {
  const address = normalizeAddress(party.address, { inferFranceFromPostalCode: true });
  const countryCode = normalizeCountryCode(party.countryCode || address.countryCode);
  return {
    ...party,
    type: Object.values(CUSTOMER_TYPES).includes(party.type) ? party.type : CUSTOMER_TYPES.INDIVIDUAL,
    legalName: String(party.legalName || '').trim(),
    tradingName: String(party.tradingName || '').trim(),
    siren: normalizeDigits(party.siren, 9),
    siret: normalizeDigits(party.siret, 14),
    vatNumber: String(party.vatNumber || '').trim(),
    foreignBusinessId: String(party.foreignBusinessId || '').trim(),
    establishedInFrance: party.establishedInFrance ?? (countryCode === 'FR'),
    countryCode,
    address,
    billingAddress: normalizeNullableAddress(party.billingAddress),
    deliveryAddress: normalizeNullableAddress(party.deliveryAddress),
    contact: {
      email: party.contact?.email || '',
      phone: party.contact?.phone || ''
    },
    electronicAddress: normalizeElectronicAddress(party.electronicAddress)
  };
}

function normalizeAddress(address = {}, { inferFranceFromPostalCode = false } = {}) {
  const safe = address && typeof address === 'object' ? address : {};
  const postalCode = String(safe.postalCode || '').trim();
  const explicitCountry = normalizeCountryCode(safe.countryCode);
  return {
    line1: safe.line1 || '',
    line2: safe.line2 || '',
    postalCode,
    city: safe.city || '',
    countryCode: explicitCountry || (inferFranceFromPostalCode && /^\d{5}$/u.test(postalCode) ? 'FR' : '')
  };
}

function normalizeNullableAddress(address) {
  if (!address) return null;
  if (typeof address === 'string') return legacyAddress(address);
  const normalized = normalizeAddress(address, { inferFranceFromPostalCode: true });
  return hasAddressValue(normalized) ? normalized : null;
}

function normalizeOptionalAddress(value, postalCode = '', city = '', countryCode = '') {
  if (!value && !postalCode && !city) return null;
  if (value && typeof value === 'object') return normalizeAddress(value, { inferFranceFromPostalCode: true });
  return legacyAddress(value || '', postalCode, city, countryCode);
}

function normalizeWorkAddress(value) {
  if (!value) return null;
  if (typeof value === 'object') return normalizeAddress(value, { inferFranceFromPostalCode: true });
  return legacyAddress(value);
}

function legacyAddress(value, postalCode = '', city = '', countryCode = '') {
  const text = String(value || '').trim();
  const lines = text.split(/\n+/u).map(line => line.trim()).filter(Boolean);
  let inferredPostalCode = String(postalCode || '').trim();
  let inferredCity = String(city || '').trim();
  const postalMatch = text.match(/\b(\d{5})\s+([^\n]+)$/u);
  if (postalMatch) {
    inferredPostalCode ||= postalMatch[1];
    inferredCity ||= postalMatch[2].trim();
  }
  const explicitCountry = normalizeCountryCode(countryCode);

  return {
    line1: lines[0] || '',
    line2: lines.length > 2 ? lines.slice(1, -1).join(' ') : '',
    postalCode: inferredPostalCode,
    city: inferredCity,
    countryCode: explicitCountry || (/^\d{5}$/u.test(inferredPostalCode) ? 'FR' : '')
  };
}

function normalizeAdjustments(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item, index) => ({
    id: item.id || `adjustment-${index + 1}`,
    scope: item.scope === 'line' ? 'line' : 'document',
    lineId: item.lineId || null,
    reason: String(item.reason || '').trim(),
    amountExcludingTax: finiteMoneyOrZero(item.amountExcludingTax ?? item.amount),
    vatRate: item.vatRate == null ? null : Number(String(item.vatRate).replace(',', '.')),
    vatAmount: finiteMoneyOrZero(item.vatAmount)
  }));
}

function normalizeCorrection(value = {}) {
  return {
    originalInvoiceNumber: value.originalInvoiceNumber || value.correctedInvoiceNumber || null,
    originalInvoiceDate: value.originalInvoiceDate || value.correctedInvoiceDate || null,
    reason: String(value.reason || value.correctionReason || '').trim()
  };
}

function normalizeInvoiceType(value) {
  return Object.values(INVOICE_TYPES).includes(value) ? value : INVOICE_TYPES.STANDARD;
}

function normalizeElectronicAddress(value) {
  return {
    scheme: value?.scheme || '',
    value: value?.value || '',
    source: value?.source || null
  };
}

function normalizeServiceOrSupplyDate(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value.precision && value.precision !== 'day') return null;
    return normalizeServiceOrSupplyDate(value.value || value.displayValue || '');
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return text;
  if (/^\d{2}\/\d{2}\/\d{4}$/u.test(text)) return text;
  return null;
}

function normalizeCurrency(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(code) ? code : '';
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(code) ? code : '';
}

function hasAddressValue(address) {
  return Boolean(address?.line1 || address?.postalCode || address?.city || address?.countryCode);
}

function normalizeDigits(value, length) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === length ? digits : '';
}

function parseFrenchMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(',', '.')
    .trim();
  if (!normalized) return null;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseFrenchNumber(value, fallback) {
  const normalized = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteMoneyOrZero(value) {
  const parsed = parseFrenchMoney(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
