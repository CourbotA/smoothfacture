import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../src/database.js';
import { InvoiceRepository } from '../src/invoiceRepository.js';

function setup() {
  const db = openDatabase(':memory:');
  const repository = new InvoiceRepository(db);
  const company = repository.createCompany({
    legalName: 'Test Plomberie',
    siren: '123456789',
    siret: '12345678900010',
    address: { line1: '1 rue du Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
  });
  return { db, repository, company };
}

function invoice(overrides = {}) {
  return {
    schemaVersion: 2,
    documentType: 'facture',
    number: null,
    issueDate: '07/09/2026',
    dueDate: '07/10/2026',
    seller: {
      type: 'company',
      legalName: 'Test Plomberie',
      siren: '123456789',
      address: { line1: '1 rue du Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    buyer: {
      type: 'individual',
      legalName: 'Jean Dupont',
      siren: '',
      address: { line1: '2 rue Client', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' }
    },
    operationCategory: 'services',
    lines: [{ id: '1', description: 'Dépannage', quantity: 1, totalExcludingTax: 100, vatRate: 0 }],
    tax: {
      regime: 'exempt_293b',
      treatment: 'exempt',
      defaultVatRate: 0,
      exemptionReason: 'TVA non applicable, art. 293 B du CGI'
    },
    taxBreakdown: [{ vatRate: 0, taxableBase: 100, taxAmount: 0, exemptionReason: 'TVA non applicable' }],
    electronicInvoice: { lifecycleStatus: 'draft', transmissionStatus: 'not_sent' },
    ...overrides
  };
}

test('drafts do not consume numbers and finalization is sequential', () => {
  const { db, repository, company } = setup();
  try {
    const first = repository.createDraft(company.id, invoice());
    const second = repository.createDraft(company.id, invoice({ buyer: { ...invoice().buyer, legalName: 'Marie Martin' } }));
    assert.equal(first.number, null);
    assert.equal(second.number, null);

    const finalizedSecond = repository.finalize(second.id, company.id);
    const finalizedFirst = repository.finalize(first.id, company.id);
    assert.equal(finalizedSecond.number, 1);
    assert.equal(finalizedFirst.number, 2);
  } finally {
    db.close();
  }
});

test('finalization is idempotent and does not allocate a second number', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice());
    const first = repository.finalize(draft.id, company.id);
    const second = repository.finalize(draft.id, company.id);
    assert.equal(first.number, 1);
    assert.equal(second.number, 1);

    const next = repository.finalize(repository.createDraft(company.id, invoice()).id, company.id);
    assert.equal(next.number, 2);
  } finally {
    db.close();
  }
});

test('finalized invoice data is immutable', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice());
    repository.finalize(draft.id, company.id);
    assert.throws(
      () => repository.updateDraft(draft.id, company.id, invoice({ lines: [{ id: '1', description: 'Changed', totalExcludingTax: 200 }] })),
      error => error?.code === 'invoice_immutable'
    );
  } finally {
    db.close();
  }
});

test('professional buyer requires a SIREN before finalization', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice({
      buyer: { ...invoice().buyer, type: 'company', siren: '', legalName: 'SARL Client' }
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

test('lifecycle events preserve the audit trail', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice());
    repository.updateDraft(draft.id, company.id, invoice());
    repository.finalize(draft.id, company.id);
    assert.deepEqual(repository.listEvents(draft.id, company.id).map(event => event.type), [
      'draft_created',
      'draft_updated',
      'finalized'
    ]);
  } finally {
    db.close();
  }
});

test('server recalculates mixed VAT totals instead of trusting client breakdown', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice({
      lines: [
        { id: '1', description: 'Main-d’œuvre', totalExcludingTax: 100, vatRate: 20 },
        { id: '2', description: 'Travaux rénovation', totalExcludingTax: 50, vatRate: 10 }
      ],
      tax: {
        regime: 'standard',
        treatment: 'domestic',
        defaultVatRate: 20,
        reducedRateCertificationConfirmed: true
      },
      taxBreakdown: [{ vatRate: 20, taxableBase: 150, taxAmount: 9999 }],
      totals: { excludingTax: 150, tax: 9999, includingTax: 10149 }
    }));

    assert.equal(draft.totals.excludingTax, 150);
    assert.equal(draft.totals.tax, 25);
    assert.equal(draft.totals.includingTax, 175);
    assert.deepEqual(draft.invoice.taxBreakdown.map(row => [row.vatRate, row.taxAmount]), [[20, 20], [10, 5]]);
  } finally {
    db.close();
  }
});

test('reduced VAT rate cannot be finalized before explicit certification', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice({
      lines: [{ id: '1', description: 'Travaux rénovation', totalExcludingTax: 100, vatRate: 10 }],
      tax: {
        regime: 'standard',
        treatment: 'domestic',
        defaultVatRate: 20,
        reducedRateCertificationConfirmed: false
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

test('BTP reverse charge finalizes without collected VAT for professional customer', () => {
  const { db, repository, company } = setup();
  try {
    const draft = repository.createDraft(company.id, invoice({
      buyer: { ...invoice().buyer, type: 'company', siren: '987654321', legalName: 'Entreprise générale' },
      lines: [{ id: '1', description: 'Sous-traitance plomberie', totalExcludingTax: 400, vatRate: 20 }],
      tax: {
        regime: 'standard',
        treatment: 'reverse_charge_btp',
        defaultVatRate: 20,
        reverseChargeReason: 'Autoliquidation'
      }
    }));
    const finalized = repository.finalize(draft.id, company.id);
    assert.equal(finalized.totals.excludingTax, 400);
    assert.equal(finalized.totals.tax, 0);
    assert.equal(finalized.totals.includingTax, 400);
    assert.equal(finalized.invoice.taxBreakdown[0].taxCategory, 'reverse_charge');
  } finally {
    db.close();
  }
});
