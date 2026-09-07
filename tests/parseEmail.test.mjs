import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretInvoiceInput, parseEmails } from '../src/services/parseEmail.js';

const pricedItems = invoice => invoice.items.filter(item => item.hasExplicitPrice);

test('interprets conventional structured notes without losing amounts', () => {
  const input = `Marcel Tranian
24 rue Émile Delombe 62690 Aubigny-en-Artois
19 mai 2026
Entretien chaudière fioul 105 €
Flexible fioul 35 €
Main d'oeuvre 185 €`;
  const { invoice, interpretation } = interpretInvoiceInput(input)[0];

  assert.equal(invoice.client.name, 'Marcel Tranian');
  assert.match(invoice.client.address, /24 rue Émile Delombe/);
  assert.equal(invoice.client.postalCode, '62690');
  assert.equal(invoice.intervention.workDate.precision, 'day');
  assert.equal(invoice.intervention.workDate.value, '19/05/2026');
  assert.deepEqual(pricedItems(invoice).map(item => item.total), ['105,00 €', '35,00 €', '185,00 €']);
  assert.equal(interpretation.missingFields.length, 0);
});

test('recognizes customer, address, and prices despite bad ordering', () => {
  const input = `105 entretien chaudière
185 main oeuvre
client tranian marcel
24 rue emile delombe aubigny en artois 62690
flexible 35 euros`;
  const results = interpretInvoiceInput(input);
  const { invoice } = results[0];

  assert.equal(results.length, 1);
  assert.match(invoice.client.name, /Tranian Marcel/i);
  assert.match(invoice.client.address, /62690/);
  assert.equal(pricedItems(invoice).length, 3);
  assert.deepEqual(pricedItems(invoice).map(item => item.total), ['105,00 €', '185,00 €', '35,00 €']);
});

test('preserves a month-only work date without inventing the first day', () => {
  const { invoice, interpretation } = interpretInvoiceInput(`Janvier 2026
Entretien chaudière 105 €`)[0];

  assert.deepEqual(invoice.intervention.workDate, {
    value: '2026-01', displayValue: 'Janvier 2026', precision: 'month',
    year: 2026, month: 1, day: null, raw: 'Janvier 2026', sourceText: 'Janvier 2026'
  });
  assert.equal(invoice.items[0].date, 'Janvier 2026');
  assert.notEqual(invoice.invoiceDate, '01/01/2026');
  assert.ok(interpretation.warnings.some(warning => warning.code === 'approximate_work_date'));
});

test('returns a usable interpretation and a missing address question', () => {
  const { invoice, interpretation } = interpretInvoiceInput(`Dupont
Entretien chaudière 105 €
Flexible fioul 35 €`)[0];

  assert.equal(invoice.client.name, 'Dupont');
  assert.equal(pricedItems(invoice).length, 2);
  assert.ok(interpretation.missingFields.some(field => field.field === 'client.address'));
  assert.ok(interpretation.questions.some(question => question.id === 'missing-client.address'));
});

test('preserves an uncertain product designation verbatim', () => {
  const { invoice, interpretation } = interpretInvoiceInput('pâte wc serinite sans bride 295 €')[0];

  assert.equal(invoice.items[0].description, 'pâte wc serinite sans bride');
  assert.equal(invoice.items[0].total, '295,00 €');
  assert.ok(interpretation.questions.some(question => question.kind === 'review_item'));
  assert.doesNotMatch(invoice.items[0].description, /Pack|Sérénité/);
});

test('preserves description-only work and asks how to invoice it', () => {
  const { invoice, interpretation } = interpretInvoiceInput(`Démontage repose radiateur fonte
Flexible fioul 35 €`)[0];

  assert.equal(invoice.items.length, 2);
  assert.equal(invoice.items[0].description, 'Démontage repose radiateur fonte');
  assert.equal(invoice.items[0].hasExplicitPrice, false);
  assert.equal(invoice.items[0].total, '');
  assert.ok(interpretation.questions.some(question => question.kind === 'missing_price' && question.itemId === invoice.items[0].id));
});

test('extracts useful facts from a voice-like sentence without line breaks', () => {
  const input = `alors chez tranian marcel à aubigny 24 rue emile delombe entretien chaudiere 105 euros flexible 35 et 185 euros de main d oeuvre c'était en janvier`;
  const { invoice } = interpretInvoiceInput(input)[0];

  assert.match(invoice.client.name, /Tranian Marcel/i);
  assert.match(invoice.client.address, /24 rue emile delombe/i);
  assert.match(invoice.client.address, /Aubigny/i);
  assert.equal(invoice.intervention.workDate.precision, 'month_without_year');
  assert.equal(invoice.intervention.workDate.displayValue, 'Janvier');
  assert.equal(pricedItems(invoice).length, 3);
  assert.deepEqual(pricedItems(invoice).map(item => item.total), ['105,00 €', '35,00 €', '185,00 €']);
});

test('supports quantity, hourly price, compact cents, and number words', () => {
  const input = `Dupont
1 rue de la Gare 62000 Arras
Pose flexible 2 x 35 €
Main d'oeuvre 3 h à 45 €
2 grillesavec moustiquaire22€80
Flexible fioul trente-cinq euros
Robinet 12/17 WC 6,50 €`;
  const { invoice } = interpretInvoiceInput(input)[0];

  assert.deepEqual(pricedItems(invoice).map(item => item.total), ['70,00 €', '135,00 €', '22,80 €', '35,00 €', '6,50 €']);
  assert.equal(invoice.items[0].quantity, '2,00');
  assert.equal(invoice.items[1].unit, 'h');
  assert.equal(invoice.items[2].description, 'grilles avec moustiquaire');
  assert.equal(invoice.items[4].description, 'Robinet 12/17 WC');
});

test('keeps multiple invoice chunks separate', () => {
  const input = `Marcel Tranian
24 rue Émile Delombe 62690 Aubigny-en-Artois
19 mai 2026
Entretien chaudière 105 €

Sophie Martin
8 rue de Lens 62000 Arras
20 mai 2026
Flexible fioul 35 €`;

  const invoices = parseEmails(input);
  assert.equal(invoices.length, 2);
  assert.deepEqual(invoices.map(invoice => invoice.client.name), ['Marcel Tranian', 'Sophie Martin']);
  assert.deepEqual(invoices.map(invoice => pricedItems(invoice)[0].total), ['105,00 €', '35,00 €']);
});

test('keeps the intervention-address and later-date regression working', () => {
  const input = `Monsieur Madame Thierry hornoy 7 rue de la Barre 62580 Neuville-Saint-Vaast

Intervention 19 mai 2026
Avion 57 rue du 14-Juillet
Pose grille ventilation

percement mur
Fixation grille
2 grillesavec moustiquaire 22€80
20 juillet 2026
Main d'oeuvre déplacement 105€`;
  const invoices = parseEmails(input);
  const priced = pricedItems(invoices[0]);

  assert.equal(invoices.length, 1);
  assert.match(invoices[0].intervention.address, /57 rue du 14-Juillet/);
  assert.deepEqual(priced.map(item => item.total), ['22,80 €', '105,00 €']);
  assert.equal(invoices[0].items.length, 5);
});
