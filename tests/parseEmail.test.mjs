import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEmails } from '../src/services/parseEmail.js';

test('recognizes a following intervention address and a compact French price', () => {
  const input = `Monsieur Madame Thierry hornoy 7 rue de la Barre 62580 Neuville-Saint-Vaast

Intervention 19 mai 2026
Avion 57 rue du 14-Juillet
Pose grille ventilation

percement mur
Fixation grille
2 grillesavec moustiquaire22€80
Main d'oeuvre déplacement 105€`;

  const invoice = parseEmails(input)[0];

  assert.equal(invoice.intervention.address, 'Intervention Avion 57 rue du 14-Juillet');
  assert.equal(invoice.items.length, 2);
  assert.deepEqual(invoice.items[0], {
    description: 'grilles avec moustiquaire',
    date: '19/05/2026',
    quantity: '2,00',
    unit: 'pce',
    unitPrice: '11,40 €',
    total: '22,80 €'
  });
  assert.equal(invoice.items[1].total, '105,00 €');
});
