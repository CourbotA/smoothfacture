import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../src/database.js';
import { InvoiceRepository } from '../src/invoiceRepository.js';

function setup() {
  const db = openDatabase(':memory:');
  const repository = new InvoiceRepository(db);
  const company = repository.createCompany({
    legalName: 'Autorité Plomberie',
    siren: '111222333',
    siret: '11122233300019',
    address: { line1: '1 rue Serveur', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' },
    tax: {
      vatRegime: 'exempt_293b',
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    },
    reform: {
      companySizeCategory: 'tpe',
      establishedInFrance: true,
      supportsInternational: false,
      chorusProEnabled: false,
      paConnection: null
    }
  });
  return { db, repository, company };
}

function legacyV2Invoice(overrides = {}) {
  return {
    schemaVersion: 2,
    documentType: 'facture',
    issueDate: '08/09/2026',
    seller: {
      type: 'company',
      legalName: 'Société usurpée',
      siren: '999999999',
      siret: '99999999900011',
      address: { line1: '99 rue Fausse', postalCode: '75000', city: 'Paris', countryCode: 'FR' }
    },
    buyer: {
      type: 'individual',
      legalName: 'Jean Dupont',
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    operationCategory: 'services',
    lines: [{
      id: '1',
      description: 'Dépannage',
      quantity: 1,
      unit: 'h',
      unitPriceExcludingTax: 100,
      totalExcludingTax: 100,
      vatRate: 0
    }],
    tax: {
      regime: 'exempt_293b',
      treatment: 'exempt',
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    },
    ...overrides
  };
}

test('server upgrades schema v2 drafts to canonical v3 and stores regulatory route', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, legacyV2Invoice());
    assert.equal(draft.invoice.schemaVersion, 3);
    assert.equal(draft.invoice.operationCategory, 'PS');
    assert.equal(draft.invoice.currency, 'EUR');
    assert.equal(draft.invoice.regulatory.route, 'B2C_TRANSACTION_EREPORTING');
  } finally {
    db.close();
  }
});

test('server replaces client-supplied seller identity with the stored company profile', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, legacyV2Invoice());
    assert.equal(draft.invoice.seller.legalName, 'Autorité Plomberie');
    assert.equal(draft.invoice.seller.siren, '111222333');
    assert.equal(draft.invoice.seller.siret, '11122233300019');
    assert.equal(draft.invoice.seller.address.line1, '1 rue Serveur');
  } finally {
    db.close();
  }
});

test('server preserves domestic B2B SIREN gate after v2 migration', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, legacyV2Invoice({
      buyer: {
        type: 'company',
        legalName: 'SARL Client',
        siren: '',
        address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
      }
    }));
    assert.throws(
      () => repository.finalize(draft.id, company.id),
      error => error?.code === 'invoice_not_ready'
    );
    assert.equal(repository.getInvoice(draft.id, company.id).number, null);
  } finally {
    db.close();
  }
});
