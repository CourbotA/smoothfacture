import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../src/database.js';
import { InvoiceRepository } from '../src/invoiceRepository.js';

test('client-supplied company id never overrides the database UUID', () => {
  const db = openDatabase(':memory:');
  const repository = new InvoiceRepository(db);
  try {
    const created = repository.createCompany({
      id: 'company-default',
      serverId: 'attacker-controlled',
      legalName: 'Test Plomberie',
      siren: '123456789',
      siret: '12345678900010',
      address: { line1: '1 rue du Test', postalCode: '73000', city: 'Chambéry', countryCode: 'FR' },
      reform: { companySizeCategory: 'tpe', establishedInFrance: true }
    });

    assert.notEqual(created.id, 'company-default');
    assert.notEqual(created.id, 'attacker-controlled');
    assert.match(created.id, /^[0-9a-f-]{36}$/u);
    assert.equal(created.serverId, undefined);

    const fetched = repository.getCompany(created.id);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.serverId, undefined);
  } finally {
    db.close();
  }
});
