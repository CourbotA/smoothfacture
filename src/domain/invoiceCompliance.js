import {
  CUSTOMER_TYPES,
  DOCUMENT_TYPES,
  INVOICE_TYPES,
  OPERATION_CATEGORIES
} from './invoiceModel.js';
import { validateTaxConfiguration } from './taxModel.js';
import {
  classifyRegulatoryRoute,
  REGULATORY_ROUTES,
  REFORM_DATES
} from './regulatoryRouting.js';

export function validateElectronicInvoiceReadiness(invoice, options = {}) {
  const issues = [];
  const regulatoryIssues = [];
  const companyProfile = options.companyProfile || {};
  const effectiveDate = options.effectiveDate || invoice?.issueDate || new Date();
  const classification = classifyRegulatoryRoute(invoice || {}, companyProfile, effectiveDate);
  const forceReform = Boolean(options.forceReform);
  const reformBlocking = forceReform || classification.obligations.mandatoryNow === true;
  const isInvoice = invoice?.documentType !== DOCUMENT_TYPES.QUOTE;

  requireValue(issues, invoice?.seller?.legalName, 'seller.legalName', 'Nom de votre entreprise à compléter', true);
  requireValue(issues, invoice?.seller?.siren, 'seller.siren', 'SIREN de votre entreprise à compléter', true);
  requireAddress(issues, invoice?.seller?.address, 'seller.address', 'Adresse de votre entreprise à compléter');
  requireValue(issues, invoice?.buyer?.legalName, 'buyer.legalName', 'Nom du client à compléter', true);
  requireAddress(issues, invoice?.buyer?.address, 'buyer.address', 'Adresse du client à compléter');

  if (!invoice?.lines?.length) {
    issues.push(issue('lines', 'Ajoutez au moins une prestation ou fourniture', true));
  } else {
    invoice.lines.forEach((line, index) => {
      if (!String(line.description || '').trim()) {
        issues.push(issue(`lines.${index}.description`, `Description manquante sur la ligne ${index + 1}`, true));
      }
      if (line.totalExcludingTax == null && !line.includedWithoutPrice) {
        issues.push(issue(`lines.${index}.price`, `Prix à vérifier sur la ligne ${index + 1}`, true));
      }
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        issues.push(issue(`lines.${index}.quantity`, `Quantité invalide sur la ligne ${index + 1}`, true));
      }
    });
  }

  if (isInvoice && !invoice?.issueDate) {
    issues.push(issue('issueDate', 'Date de facture à compléter', true));
  }

  if (isInvoice && !String(invoice?.currency || '').match(/^[A-Z]{3}$/u)) {
    issues.push(issue('currency', 'Devise de la facture à compléter', true));
  }

  if (isInvoice && invoice?.operationCategory === OPERATION_CATEGORIES.UNKNOWN) {
    issues.push(issue(
      'operationCategory',
      'Précisez si la facture concerne des biens, des services, ou les deux',
      true,
      'regulatory_operation_category'
    ));
  }

  issues.push(...validateTaxConfiguration(invoice));

  if (isInvoice) {
    collectRegulatoryIssues(regulatoryIssues, invoice, classification, companyProfile, reformBlocking);
  }

  const allIssues = [...issues, ...regulatoryIssues];
  const blocking = allIssues.filter(candidate => candidate.blocking);
  const regulatoryBlocking = regulatoryIssues.filter(candidate => candidate.blocking);
  const regulatoryUnresolved = regulatoryIssues.filter(candidate => candidate.regulatoryBlocking !== false);

  return {
    ready: blocking.length === 0,
    regulatoryReady: regulatoryUnresolved.length === 0,
    transmittable: classification.supportedByMvp
      && regulatoryUnresolved.length === 0
      && [REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE, REGULATORY_ROUTES.B2C_TRANSACTION_EREPORTING].includes(classification.route),
    issues: allIssues,
    blockingCount: blocking.length,
    regulatoryBlockingCount: regulatoryBlocking.length,
    route: classification.route,
    obligations: classification.obligations,
    supportedByMvp: classification.supportedByMvp,
    regulatoryReason: classification.reason
  };
}

export function inferCustomerTypeFromSiren(invoice) {
  if (!invoice?.buyer) return invoice;
  const hasSiren = /^\d{9}$/u.test(String(invoice.buyer.siren || ''));
  return {
    ...invoice,
    buyer: {
      ...invoice.buyer,
      type: hasSiren ? CUSTOMER_TYPES.COMPANY : invoice.buyer.type
    }
  };
}

function collectRegulatoryIssues(issues, invoice, classification, companyProfile, reformBlocking) {
  const route = classification.route;
  const obligations = classification.obligations;
  const effectiveDate = classification.effectiveDate;

  if (classification.companySizeCategory === 'unknown') {
    issues.push(regulatoryIssue(
      'regulatory.companySizeCategory',
      'Catégorie de taille de l’entreprise à renseigner pour déterminer la date d’obligation.',
      reformBlocking,
      'missing_company_size'
    ));
  }

  if (!classification.supportedByMvp) {
    issues.push(regulatoryIssue(
      'regulatory.route',
      classification.reason || 'Ce cas réglementaire n’est pas encore pris en charge par SmoothFacture.',
      reformBlocking,
      'unsupported_regulatory_case'
    ));
  }

  if (!invoice?.seller?.countryCode) {
    issues.push(regulatoryIssue(
      'seller.countryCode',
      'Pays d’établissement de votre entreprise à confirmer.',
      reformBlocking,
      'missing_seller_country'
    ));
  }

  if (!invoice?.buyer?.countryCode) {
    issues.push(regulatoryIssue(
      'buyer.countryCode',
      'Pays du client à confirmer pour déterminer le routage réglementaire.',
      reformBlocking,
      'missing_buyer_country'
    ));
  }

  if (route === REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE) {
    requireRegulatoryValue(
      issues,
      invoice?.buyer?.siren,
      'buyer.siren',
      'SIREN du client professionnel à compléter pour la facture électronique.',
      reformBlocking,
      'missing_buyer_siren'
    );
  }

  if (obligations.requiresPA && obligations.mandatoryNow === true && !hasPaConnection(companyProfile, invoice)) {
    issues.push(regulatoryIssue(
      'electronicInvoice.paProvider',
      'Connectez une Plateforme Agréée avant la transmission réglementaire.',
      true,
      'pa_connection_required'
    ));
  }

  if (isOnOrAfter(effectiveDate, REFORM_DATES.RECEPTION_ALL)
    && route === REGULATORY_ROUTES.DOMESTIC_B2B_EINVOICE) {
    requireRegulatoryValue(
      issues,
      invoice?.serviceOrSupplyDate,
      'serviceOrSupplyDate',
      'Date de livraison ou de fin d’exécution de la prestation à compléter.',
      reformBlocking,
      'missing_service_or_supply_date'
    );

    if (!['LB', 'PS', 'LBPS'].includes(invoice?.operationCategory)) {
      issues.push(regulatoryIssue(
        'operationCategory',
        'Catégorie réglementaire LB, PS ou LBPS obligatoire.',
        reformBlocking,
        'invalid_operation_category'
      ));
    }
  }

  if (isOnOrAfter(effectiveDate, REFORM_DATES.EMISSION_MICRO_TPE_PME)) {
    validate2027StructuredData(issues, invoice, reformBlocking);
  }

  if (obligations.paymentReportingDecision === 'needs_vat_on_debits_setting') {
    issues.push(regulatoryIssue(
      'tax.vatOnDebits',
      'Indiquez si l’entreprise a opté pour le paiement de la TVA d’après les débits afin de déterminer l’e-reporting des encaissements.',
      reformBlocking,
      'vat_on_debits_setting_required'
    ));
  }

  if ([INVOICE_TYPES.CORRECTIVE, INVOICE_TYPES.CREDIT_NOTE].includes(invoice?.invoiceType)) {
    requireRegulatoryValue(
      issues,
      invoice?.correction?.originalInvoiceNumber,
      'correction.originalInvoiceNumber',
      'Référence de la facture d’origine obligatoire pour ce document correctif.',
      true,
      'missing_original_invoice_number'
    );
    requireRegulatoryValue(
      issues,
      invoice?.correction?.originalInvoiceDate,
      'correction.originalInvoiceDate',
      'Date de la facture d’origine obligatoire pour ce document correctif.',
      true,
      'missing_original_invoice_date'
    );
  }
}

function validate2027StructuredData(issues, invoice, blocking) {
  (invoice?.lines || []).forEach((line, index) => {
    if (line.includedWithoutPrice) return;
    if (!String(line.description || '').trim()) {
      issues.push(regulatoryIssue(
        `lines.${index}.description`,
        `Description structurée obligatoire sur la ligne ${index + 1}.`,
        blocking,
        'missing_structured_description'
      ));
    }
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
      issues.push(regulatoryIssue(
        `lines.${index}.quantity`,
        `Quantité structurée obligatoire sur la ligne ${index + 1}.`,
        blocking,
        'missing_structured_quantity'
      ));
    }
    if (line.unitPriceExcludingTax == null || !Number.isFinite(Number(line.unitPriceExcludingTax))) {
      issues.push(regulatoryIssue(
        `lines.${index}.unitPriceExcludingTax`,
        `Prix unitaire HT structuré obligatoire sur la ligne ${index + 1}.`,
        blocking,
        'missing_structured_unit_price'
      ));
    }
  });

  for (const [collectionName, values] of [['allowances', invoice?.allowances], ['charges', invoice?.charges]]) {
    if (!Array.isArray(values)) {
      issues.push(regulatoryIssue(
        collectionName,
        `${collectionName === 'allowances' ? 'Réductions' : 'Frais et majorations'} doivent être représentés sous forme structurée.`,
        blocking,
        'missing_structured_adjustments'
      ));
    }
  }

  const delivery = invoice?.deliveryAddress || invoice?.buyer?.deliveryAddress;
  if (delivery && !isCompleteAddress(delivery)) {
    issues.push(regulatoryIssue(
      'deliveryAddress',
      'Adresse de livraison incomplète.',
      blocking,
      'incomplete_delivery_address'
    ));
  }
}

function hasPaConnection(companyProfile, invoice) {
  return Boolean(
    companyProfile.reform?.paConnection?.provider
    || companyProfile.reform?.paProvider
    || invoice?.electronicInvoice?.paProvider
    || invoice?.electronicInvoice?.platformProvider
  );
}

function requireValue(issues, value, field, message, blocking) {
  if (!String(value || '').trim()) issues.push(issue(field, message, blocking));
}

function requireRegulatoryValue(issues, value, field, message, blocking, code) {
  if (!String(value || '').trim()) issues.push(regulatoryIssue(field, message, blocking, code));
}

function requireAddress(issues, address, field, message) {
  if (!isCompleteAddress(address)) issues.push(issue(field, message, true));
}

function isCompleteAddress(address) {
  return Boolean(
    address
    && String(address.line1 || '').trim()
    && String(address.postalCode || '').trim()
    && String(address.city || '').trim()
  );
}

function isOnOrAfter(value, threshold) {
  return String(value || '') >= threshold;
}

function issue(field, message, blocking = false, code = 'missing_required_data') {
  return { field, message, blocking, code, regulatory: false };
}

function regulatoryIssue(field, message, blocking = false, code = 'regulatory_requirement') {
  return {
    field,
    message,
    blocking,
    code,
    regulatory: true,
    regulatoryBlocking: true
  };
}
