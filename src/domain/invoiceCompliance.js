import { CUSTOMER_TYPES, OPERATION_CATEGORIES } from './invoiceModel.js';
import { validateTaxConfiguration } from './taxModel.js';

export function validateElectronicInvoiceReadiness(invoice) {
  const issues = [];

  requireValue(issues, invoice?.seller?.legalName, 'seller.legalName', 'Nom de votre entreprise à compléter', true);
  requireValue(issues, invoice?.seller?.siren, 'seller.siren', 'SIREN de votre entreprise à compléter', true);
  requireAddress(issues, invoice?.seller?.address, 'seller.address', 'Adresse de votre entreprise à compléter');
  requireValue(issues, invoice?.buyer?.legalName, 'buyer.legalName', 'Nom du client à compléter', true);
  requireAddress(issues, invoice?.buyer?.address, 'buyer.address', 'Adresse du client à compléter');

  if (invoice?.buyer?.type === CUSTOMER_TYPES.COMPANY) {
    requireValue(issues, invoice?.buyer?.siren, 'buyer.siren', 'SIREN du client professionnel à compléter', true);
  }

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
    });
  }

  if (!invoice?.issueDate) {
    issues.push(issue('issueDate', 'Date de facture à compléter', true));
  }

  if (invoice?.operationCategory === OPERATION_CATEGORIES.UNKNOWN) {
    issues.push(issue(
      'operationCategory',
      'Précisez si la facture concerne des biens, des services, ou les deux',
      true,
      'regulatory_operation_category'
    ));
  }

  issues.push(...validateTaxConfiguration(invoice));

  const blocking = issues.filter(candidate => candidate.blocking);
  return {
    ready: blocking.length === 0,
    issues,
    blockingCount: blocking.length
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

function requireValue(issues, value, field, message, blocking) {
  if (!String(value || '').trim()) issues.push(issue(field, message, blocking));
}

function requireAddress(issues, address, field, message) {
  if (!address || !String(address.line1 || '').trim() || !String(address.postalCode || '').trim() || !String(address.city || '').trim()) {
    issues.push(issue(field, message, true));
  }
}

function issue(field, message, blocking = false, code = 'missing_required_data') {
  return { field, message, blocking, code };
}
