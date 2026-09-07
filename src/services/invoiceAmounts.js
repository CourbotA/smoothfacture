// Accept whole French amounts, never a valid-looking prefix of invalid input.
export function parseAmount(value) {
  const raw = String(value ?? '').trim().replace(/\s*(?:€|euros?|eur)$/iu, '').replace(/[\s\u00a0\u202f]/gu, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return NaN;
  const number = Number(raw.replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

const money = value => `${value.toFixed(2).replace('.', ',')} €`;

export function updateItemAmount(item, field, value) {
  const updated = { ...item, [field]: value };
  if (field === 'quantity' || field === 'unitPrice') {
    const quantity = parseAmount(updated.quantity);
    const price = parseAmount(updated.unitPrice);
    updated.total = quantity > 0 && Number.isFinite(price) ? money(Math.round(quantity * price * 100) / 100) : '';
    updated.hasExplicitPrice = Boolean(updated.total);
    updated.includedWithoutPrice = false;
  }
  return updated;
}

export function itemIsComplete(item) {
  return Boolean(item.description?.trim()) && (item.includedWithoutPrice || (
    parseAmount(item.quantity) > 0 && Number.isFinite(parseAmount(item.unitPrice)) && Number.isFinite(parseAmount(item.total))
  ));
}
