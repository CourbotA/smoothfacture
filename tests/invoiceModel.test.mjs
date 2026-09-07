import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretInvoiceInput } from '../src/services/invoiceInterpreter.js';
import { cloneDefaultCompanyProfile } from '../src/config/defaultCompany.js';
import { createCanonicalInvoice, CUSTOMER_TYPES, OPERATION_CATEGORIES } from '../src/domain/invoiceModel.js';
import { validateElectronicInvoiceReadiness } from '../src/domain/invoiceCompliance.js';

test('canonical model preserves interpreted invoice facts and seller identifiers', () => {
  const [result] = interpretInvoiceInput(`Monsieur et Madame Thierry Hornoy
7 rue de la Barre 62180 Neuville-Saint-Vaast
Le 19 mai 2026
Intervention 61 avenue du 4 septembre Lens appartement numéro 5
Une sortie WC 12 €
Meuble déplacement 48 €`);

  const invoice = createCanonicalInvoice({
    legacyInvoice: result.invoice,
    companyProfile: cloneDefaultCompanyProfile()
  });

  assert.equal(invoice.schemaVersion, 1);
  assert.equal(invoice.seller.siren, '538179649');
  assert.equal(invoice.seller.siret, '53817964900016');
  assert.equal(invoice.buyer.legalName, 'Monsieur et Madame Thierry Hornoy');
  assert.equal(invoice.lines.length, 2);
  assert.equal(invoice.lines[0].totalExcludingTax, 12);
  assert.equal(invoice.operationCategory, OPERATION_CATEGORIES.MIXED);
  assert.equal(invoice.taxBreakdown[0].vatRate, 0);
  assert.match(invoice.taxBreakdown[0].exemptionReason, /293 B/u);
});

test('professional buyer requires a SIREN for electronic invoice readiness', () => {
  const company = cloneDefaultCompanyProfile();
  const invoice = createCanonicalInvoice({
    companyProfile: company,
    legacyInvoice: {
      documentType: 'facture',
      invoiceDate: '07/09/2026',
      client: {
        type: CUSTOMER_TYPES.COMPANY,
        name: 'SARL Martin',
        address: '12 rue Pasteur\n73000 Chambéry',
        postalCode: '73000',
        city: 'Chambéry'
      },
      intervention: {},
      items: [{ description: "Main-d’œuvre dépannage", quantity: '1,00', unit: 'h', unitPrice: '85,00 €', total: '85,00 €', hasExplicitPrice: true }]
    }
  });

  const readiness = validateElectronicInvoiceReadiness(invoice);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.issues.some(issue => issue.field === 'buyer.siren'));
});

test('individual buyer does not require a SIREN', () => {
  const invoice = createCanonicalInvoice({
    companyProfile: cloneDefaultCompanyProfile(),
    legacyInvoice: {
      documentType: 'facture',
      invoiceDate: '07/09/2026',
      client: {
        type: CUSTOMER_TYPES.INDIVIDUAL,
        name: 'Jean Dupont',
        address: '12 rue Pasteur\n73000 Chambéry',
        postalCode: '73000',
        city: 'Chambéry'
      },
      intervention: {},
      items: [{ description: "Main-d’œuvre dépannage", quantity: '1,00', unit: 'h', unitPrice: '85,00 €', total: '85,00 €', hasExplicitPrice: true }]
    }
  });

  const readiness = validateElectronicInvoiceReadiness(invoice);
  assert.ok(!readiness.issues.some(issue => issue.field === 'buyer.siren'));
});
