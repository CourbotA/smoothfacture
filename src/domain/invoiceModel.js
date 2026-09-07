import {
  applyTaxDefaultsToLines,
  createInvoiceTaxSettings,
  recalculateInvoiceTax
} from './taxModel.js';

export const CUSTOMER_TYPES = Object.freeze({
  INDIVIDUAL: 'individual',
  COMPANY: 'company'
});

export const OPERATION_CATEGORIES = Object.freeze({
  GOODS: 'goods',
  SERVICES: 'services',
  MIXED: 'mixed',
  UNKNOWN: 'unknown'
});

export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: 'facture',
  QUOTE: 'devis'
});

export function createCanonicalInvoice({ legacyInvoice = {}, companyProfile = null } = {}) {
  const seller = companyProfile ? companyToParty(companyProfile) : legacySellerToParty(legacyInvoice);
  const buyer = legacyBuyerToParty(legacyInvoice.client || {});
  const tax = createInvoiceTaxSettings(companyProfile || {});
  const lines = applyTaxDefaultsToLines(
    (legacyInvoice.items || []).map((item, index) => canonicalizeLine(item, index)),
    tax
  );

  return recalculateInvoiceTax({
    schemaVersion: 2,
    id: legacyInvoice.id || null,
    documentType: legacyInvoice.documentType || DOCUMENT_TYPES.INVOICE,
    number: legacyInvoice.invoiceNumber || null,
    issueDate: legacyInvoice.invoiceDate || '',
    dueDate: legacyInvoice.dueDate || '',
    seller,
    buyer,
    operationCategory: inferRegulatoryOperationCategory(lines),
    work: {
      address: legacyInvoice.intervention?.address || '',
      date: legacyInvoice.intervention?.workDate || null,
      category: legacyInvoice.operationType || 'Travaux'
    },
    lines,
    tax,
    payment: {
      iban: companyProfile?.payment?.iban || legacyInvoice.payment?.iban || '',
      termsDays: companyProfile?.payment?.termsDays ?? null,
      conditions: companyProfile?.payment?.conditions || legacyInvoice.payment?.conditions || '',
      discount: companyProfile?.payment?.discount || legacyInvoice.payment?.discount || '',
      lateFees: companyProfile?.payment?.lateFees || legacyInvoice.payment?.lateFees || '',
      recoveryFee: companyProfile?.payment?.recoveryFee || legacyInvoice.payment?.recoveryFee || ''
    },
    electronicInvoice: {
      direction: 'outbound',
      channel: null,
      format: null,
      platformProvider: null,
      platformInvoiceId: null,
      lifecycleStatus: 'draft',
      transmissionStatus: 'not_sent',
      reportingStatus: 'not_required_yet'
    },
    source: {
      interpreterEngine: legacyInvoice.interpretation?.engine || null
    }
  });
}

export function companyToParty(company) {
  return {
    type: CUSTOMER_TYPES.COMPANY,
    legalName: company.legalName || '',
    tradingName: company.tradingName || '',
    siren: normalizeDigits(company.siren, 9),
    siret: normalizeDigits(company.siret, 14),
    vatNumber: String(company.vatNumber || '').trim(),
    legalForm: company.legalForm || '',
    apeCode: company.apeCode || '',
    address: normalizeAddress(company.address),
    contact: {
      phone: company.contact?.phone || '',
      email: company.contact?.email || ''
    }
  };
}

function legacySellerToParty(invoice) {
  return {
    type: CUSTOMER_TYPES.COMPANY,
    legalName: invoice.sender?.name || invoice.footer?.enterprise || '',
    tradingName: invoice.sender?.name || '',
    siren: normalizeDigits(String(invoice.footer?.siret || '').slice(0, 9), 9),
    siret: normalizeDigits(invoice.footer?.siret, 14),
    vatNumber: '',
    legalForm: invoice.footer?.enterprise || '',
    apeCode: invoice.footer?.ape || '',
    address: legacyAddress(invoice.sender?.address || invoice.footer?.fullAddress || ''),
    contact: {
      phone: invoice.sender?.phone || '',
      email: invoice.sender?.email || ''
    }
  };
}

function legacyBuyerToParty(client) {
  const siren = normalizeDigits(client.siren, 9);
  return {
    type: client.type || (siren ? CUSTOMER_TYPES.COMPANY : CUSTOMER_TYPES.INDIVIDUAL),
    legalName: client.legalName || client.name || '',
    tradingName: client.tradingName || '',
    siren,
    siret: normalizeDigits(client.siret, 14),
    vatNumber: String(client.vatNumber || '').trim(),
    address: client.address && typeof client.address === 'object'
      ? normalizeAddress(client.address)
      : legacyAddress(client.address || '', client.postalCode, client.city),
    deliveryAddress: client.deliveryAddress
      ? (typeof client.deliveryAddress === 'object' ? normalizeAddress(client.deliveryAddress) : legacyAddress(client.deliveryAddress))
      : null,
    contact: {
      email: client.email || '',
      phone: client.phone || ''
    }
  };
}

function canonicalizeLine(item, index) {
  const quantity = parseFrenchNumber(item.quantity, 1);
  const unitPrice = parseFrenchMoney(item.unitPrice);
  const explicitTotal = parseFrenchMoney(item.total);
  const totalExcludingTax = Number.isFinite(explicitTotal)
    ? explicitTotal
    : (Number.isFinite(unitPrice) ? roundMoney(unitPrice * quantity) : null);
  const parsedVatRate = item.vatRate == null || item.vatRate === '' ? null : Number(String(item.vatRate).replace(',', '.'));

  return {
    id: item.id || `line-${index + 1}`,
    description: item.description || '',
    quantity,
    unit: item.unit || 'pce',
    unitPriceExcludingTax: Number.isFinite(unitPrice) ? unitPrice : null,
    totalExcludingTax,
    vatRate: Number.isFinite(parsedVatRate) ? parsedVatRate : null,
    hasExplicitPrice: Boolean(item.hasExplicitPrice),
    includedWithoutPrice: Boolean(item.includedWithoutPrice),
    sourceText: item.sourceText || ''
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

function normalizeAddress(address = {}) {
  return {
    line1: address.line1 || '',
    line2: address.line2 || '',
    postalCode: address.postalCode || '',
    city: address.city || '',
    countryCode: address.countryCode || 'FR'
  };
}

function legacyAddress(value, postalCode = '', city = '') {
  const text = String(value || '').trim();
  const lines = text.split(/\n+/u).map(line => line.trim()).filter(Boolean);
  let inferredPostalCode = postalCode || '';
  let inferredCity = city || '';
  const postalMatch = text.match(/\b(\d{5})\s+([^\n]+)$/u);
  if (postalMatch) {
    inferredPostalCode ||= postalMatch[1];
    inferredCity ||= postalMatch[2].trim();
  }

  return {
    line1: lines[0] || '',
    line2: lines.length > 2 ? lines.slice(1, -1).join(' ') : '',
    postalCode: inferredPostalCode,
    city: inferredCity,
    countryCode: 'FR'
  };
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

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
