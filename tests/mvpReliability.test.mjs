import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretInvoiceInput } from '../src/services/parseEmail.js';
import { parseAmount, updateItemAmount, itemIsComplete } from '../src/services/invoiceAmounts.js';
import { reserveInvoiceNumbers } from '../src/services/invoiceNumberStore.js';

test('example preserves both addressees, addresses, unpriced work and ambiguity', () => {
  const [{ invoice, interpretation }] = interpretInvoiceInput(`Monsieur et Madame Thierry Hornoy
7 rue de la Barre 62180 Neuville-Saint-Vaast

Le 19 mai 2026

Intervention 61 avenue du 4 septembre Lens appartement numéro 5

Remplacement WC fourni par le client
Une sortie WC 12 €
Meuble déplacement 48 €`);
  assert.equal(invoice.client.name, 'Monsieur Et Madame Thierry Hornoy');
  assert.match(invoice.client.address, /7 rue de la Barre/);
  assert.equal(invoice.intervention.address, '61 avenue du 4 septembre Lens appartement numéro 5');
  assert.equal(invoice.items[0].hasExplicitPrice, false);
  assert.deepEqual(invoice.items.slice(1).map(item => item.total), ['12,00 €', '48,00 €']);
  assert.equal(invoice.items[2].description, 'Meuble déplacement');
  assert.ok(interpretation.questions.some(q => q.kind === 'review_item' && q.itemId === invoice.items[2].id));
});

test('spoken French prices retain their values and descriptions', () => {
  for (const [words, amount] of [['quatre-vingts', '80,00 €'], ['quatre-vingt-dix', '90,00 €'], ['deux cent quatre-vingt-quinze', '295,00 €'], ['soixante et onze', '71,00 €']]) {
    const [{ invoice }] = interpretInvoiceInput(`Flexible fioul ${words} euros`);
    assert.equal(invoice.items[0].total, amount);
    assert.equal(invoice.items[0].description, 'Flexible fioul');
  }
});

test('later work dates apply to subsequent lines', () => {
  const [{ invoice }] = interpretInvoiceInput('Dupont\n1 rue de Paris 62000 Arras\n19 mai 2026\nFlexible 12 €\n20 juillet 2026\nPose 48 €');
  assert.deepEqual(invoice.items.map(item => item.date), ['19/05/2026', '20/07/2026']);
});

test('editing prices and quantities recalculates totals and rejects partial numbers', () => {
  const item = { description: 'Pose', quantity: '2,00', unitPrice: '12,00 €', total: '24,00 €' };
  const changed = updateItemAmount(item, 'unitPrice', '12,50 €');
  assert.equal(changed.total, '25,00 €');
  assert.equal(updateItemAmount(changed, 'quantity', '3').total, '37,50 €');
  assert.equal(item.total, '24,00 €');
  for (const input of ['', '12oops', '12,3,4', '-5', 'Infinity']) {
    assert.ok(Number.isNaN(parseAmount(input)));
    assert.equal(itemIsComplete(updateItemAmount(item, 'unitPrice', input)), false);
  }
  assert.equal(parseAmount('1 234,50 €'), 1234.5);
  assert.equal(itemIsComplete(updateItemAmount(item, 'unitPrice', '0')), true);
  assert.equal(itemIsComplete({ ...item, description: '' }), false);
});

test('numbering survives a localStorage getter that throws', () => {
  const previous = globalThis.window;
  globalThis.window = Object.defineProperty({}, 'localStorage', { get() { throw new Error('blocked'); } });
  try {
    const [first] = reserveInvoiceNumbers();
    assert.deepEqual(reserveInvoiceNumbers(2), [first + 1, first + 2]);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('dictation commits final text once while interim text remains replaceable', async () => {
  const { readDictationResults } = await import('../src/services/dictation.js');
  const result = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });
  let batch = readDictationResults([result('douze', false)]);
  assert.equal(batch.transcript, '');
  assert.equal(batch.interim, 'douze');
  batch = readDictationResults([result('douze euros', true), result('pose', false)], batch.committedCount);
  assert.equal(batch.transcript, 'douze euros');
  const next = readDictationResults([result('douze euros', true), result('pose quarante euros', true)], batch.committedCount);
  assert.equal(next.transcript, 'pose quarante euros');
  assert.equal(readDictationResults([result('douze euros', true), result('pose quarante euros', true)], next.committedCount).transcript, '');
});
