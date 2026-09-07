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
    schemaVersion: 1,
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
