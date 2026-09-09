const DEFAULT_SENDER = {
  name: 'Courbot Gérard',
  address: '4 rue Bourbon\n62690 Aubigny-en-Artois',
  phone: '06 70 79 48 67',
  email: 'gerardcourbot@gmail.com'
};

const DEFAULT_PAYMENT = {
  iban: 'FR76 1670 6000 7101 3972 9000 019',
  tvaNote: 'TVA non applicable, art. 293 B du CGI',
  conditions: '30 jours',
  discount: 'Escompte pour paiement anticipé : néant',
  lateFees: 'Pénalités de retard : 3 fois le taux d’intérêt légal',
  recoveryFee: 'Indemnité forfaitaire de recouvrement : 40 € (clients professionnels)'
};

const DEFAULT_FOOTER = {
  enterprise: 'Courbot Gérard - Entrepreneur individuel (EI) - micro-entreprise',
  fullAddress: '4 rue Bourbon\n62690 Aubigny-en-Artois',
  siret: '538 179 649 00016',
  ape: '4322A'
};

const STREET_TYPES = 'rue|avenue|av(?:enue)?|boulevard|bd|route|chemin|impasse|all[ée]e|place|passage|quai|résidence|residence|lotissement';
const WORK_WORDS = 'entretien|chaudi[eè]re|flexible|wc|toilette|lavabo|siphon|robinet|radiateur|tuyauterie|plomb|soudure|pose|repose|d[ée]montage|remplacement|r[ée]paration|d[ée]pannage|installation|nettoyage|d[ée]placement|main|sortie|grille|percement|fixation|meuble|forfait|br[ûu]leur|fioul|combustion';
const ITEM_START_WORDS = 'entretien|flexible|wc|sortie|soudure|remplacement|d[ée]montage|pose|percement|fixation|meuble|forfait|nettoyage';
const WORK_RE = new RegExp(`\\b(?:${WORK_WORDS})\\b`, 'iu');
const MONTHS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
};
const MONTH_WORDS = Object.keys(MONTHS).join('|');

const FRENCH_NUMBER_WORDS = new Set([
  'zero', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'vingts',
  'trente', 'quarante', 'cinquante', 'soixante', 'cent', 'cents', 'et'
]);

/**
 * Deterministic interpretation boundary. A semantic service can later replace
 * or enrich this function without changing the React or PDF layers.
 */
export function interpretInvoiceInput(rawText) {
  return splitInvoiceChunks(rawText)
    .map((lines, index) => interpretChunk(lines, index))
    .filter(Boolean);
}

function interpretChunk(rawLines, chunkIndex) {
  const sourceText = rawLines.join('\n');
  const lines = rawLines.flatMap(expandNarrativeLine).map(sanitizeLine).filter(Boolean);
  const consumed = new Set();

  const workDate = extractWorkDate(lines, consumed);
  const addressResult = extractAddresses(lines, consumed, workDate);
  const nameResult = extractCustomerName(lines, consumed, addressResult);
  const combustion = extractCombustion(lines, consumed);

  const items = [];
  const itemFields = [];
  let currentDate = workDate?.displayValue || '-';
  lines.forEach((line, index) => {
    if (isDateOnly(line)) {
      currentDate = extractDateInfo(line).displayValue;
      return;
    }
    if (consumed.has(index) || isFiller(line)) return;
    const parsed = interpretItem(line, currentDate);
    if (!parsed) return;

    const itemId = `item-${chunkIndex}-${items.length}`;
    const item = { ...parsed.item, id: itemId, sourceText: line };
    items.push(item);
    itemFields.push({
      itemId,
      value: item.description,
      sourceText: line,
      confidence: parsed.confidence,
      status: parsed.status,
      reviewRequired: parsed.reviewRequired,
      reason: parsed.reason || ''
    });
  });

  const hasUsefulInformation = Boolean(nameResult.value || addressResult.clientAddress || items.length || workDate);
  if (!hasUsefulInformation) return null;

  const today = getTodayDate();
  const invoice = {
    documentType: 'facture',
    operationType: inferOperationType(items),
    sender: { ...DEFAULT_SENDER },
    client: {
      name: nameResult.value,
      address: addressResult.clientAddress,
      postalCode: extractPostalCode(addressResult.clientAddress),
      city: extractCity(addressResult.clientAddress)
    },
    intervention: {
      address: addressResult.interventionAddress,
      workDate,
      descriptions: []
    },
    items,
    combustion: { lines: combustion },
    payment: { ...DEFAULT_PAYMENT },
    footer: { ...DEFAULT_FOOTER },
    invoiceDate: today,
    dueDate: addDaysToDateString(today, 30)
  };

  const fields = {
    clientName: fieldMetadata(nameResult.value, nameResult.sourceText, nameResult.status, nameResult.reason),
    clientAddress: fieldMetadata(addressResult.clientAddress, addressResult.clientSource, addressResult.clientStatus, addressResult.clientReason),
    interventionAddress: fieldMetadata(addressResult.interventionAddress, addressResult.interventionSource, addressResult.interventionStatus, addressResult.interventionReason),
    workDate: fieldMetadata(workDate?.displayValue || '', workDate?.sourceText || '', workDate ? (workDate.precision === 'day' ? 'confident' : 'uncertain') : 'missing', workDate && workDate.precision !== 'day' ? 'La période est conservée sans inventer de jour.' : '')
  };

  const missingFields = [];
  if (!invoice.client.name) missingFields.push(missingField('client.name', 'Nom du client', 'Quel est le nom du client ?', true));
  if (!invoice.client.address) missingFields.push(missingField('client.address', 'Adresse du client', 'Quelle est l’adresse du client ?', true));
  if (!items.length) missingFields.push(missingField('items', 'Prestations', 'Quels travaux faut-il faire apparaître ?', true));

  const questions = buildQuestions(fields, missingFields, items, itemFields);
  const warnings = [];
  if (workDate && workDate.precision !== 'day') {
    warnings.push({ code: 'approximate_work_date', message: `Date de travaux conservée avec une précision « ${precisionLabel(workDate.precision)} » : ${workDate.displayValue}.` });
  }
  if (items.some(item => !item.hasExplicitPrice)) warnings.push({ code: 'unpriced_work', message: 'Certains travaux n’ont pas de prix explicite.' });

  return {
    invoice,
    interpretation: {
      engine: 'deterministic-rules-v2',
      sourceText,
      fields,
      items: itemFields,
      warnings,
      missingFields,
      questions
    }
  };
}

function splitInvoiceChunks(rawText) {
  const normalized = normalizeMultilineText(rawText);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n+/).map(toCleanLines).filter(lines => lines.length);
  if (paragraphs.length > 1) {
    const merged = [];
    paragraphs.forEach(paragraph => {
      if (!merged.length || looksLikeInvoiceHeader(paragraph)) merged.push(paragraph);
      else merged[merged.length - 1].push(...paragraph);
    });
    if (merged.length > 1) return merged;
  }

  const lines = toCleanLines(normalized);
  const starts = [0];
  for (let index = 1; index < lines.length; index += 1) {
    if (isInvoiceStart(lines, index)) starts.push(index);
  }
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length)).filter(chunk => chunk.length);
}

function expandNarrativeLine(rawLine) {
  const line = sanitizeLine(rawLine);
  if (line.length < 105) return [line];

  const workAnchor = new RegExp(`\\s+(?=(?:et\\s+)?(?:${ITEM_START_WORDS})\\b)`, 'giu');
  return normalizePriceNotation(line)
    .replace(/\s+(?:et\s+)?(?=\d+(?:[.,]\d+)?\s*(?:€|euros?)\s+(?:de\s+)?main\s+d['’ ]?oeuvre)/giu, '\n')
    .replace(new RegExp(`\\s+(?=(?:c['’]?(?:etait|était)\\s+)?en\\s+(?:${MONTH_WORDS})\\b)`, 'iu'), '\n')
    .replace(workAnchor, '\n')
    .split('\n')
    .map(part => part.replace(/^et\s+/iu, '').trim())
    .filter(Boolean);
}

function extractWorkDate(lines, consumed) {
  let firstDate = null;
  lines.forEach((line, index) => {
    const date = extractDateInfo(line);
    if (!date || firstDate) return;
    firstDate = { ...date, sourceText: line };
    if (isDateOnly(line) || /\b(?:le|date|intervention|c['’]?etait|c['’]?était|en)\b/iu.test(line)) consumed.add(index);
  });
  return firstDate;
}

function extractAddresses(lines, consumed, workDate) {
  let clientAddress = '';
  let clientSource = '';
  let interventionAddress = '';
  let interventionSource = '';
  let interventionCueIndex = -1;

  lines.forEach((line, index) => {
    if (/\bintervention\b/iu.test(line)) interventionCueIndex = index;
  });

  lines.forEach((line, index) => {
    const street = extractStreetPart(line, workDate);
    const hasPostalCode = /\b\d{5}\b/u.test(line);
    if (!street && !hasPostalCode) return;

    const candidate = formatAddress(street || line);
    const explicitlyIntervention = /\bintervention\b/iu.test(line) || (interventionCueIndex >= 0 && index === interventionCueIndex + 1);
    if (explicitlyIntervention && !interventionAddress) {
      interventionAddress = candidate.replace(/^intervention\s*/iu, '').trim();
      interventionSource = line;
      consumed.add(index);
      return;
    }

    if (!clientAddress) {
      const precedingTown = extractTownBeforeStreet(line);
      clientAddress = precedingTown && !normalizeForSearch(candidate).includes(normalizeForSearch(precedingTown)) ? `${candidate}\n${toDisplayCase(precedingTown)}` : candidate;
      clientSource = line;
      consumed.add(index);
    }
  });

  if (clientAddress) {
    const clientIndex = lines.findIndex(line => line === clientSource);
    const nextLine = lines[clientIndex + 1] || '';
    if (nextLine && /\b\d{5}\b/u.test(nextLine) && !consumed.has(clientIndex + 1)) {
      clientAddress = formatAddress(`${clientAddress} ${nextLine}`);
      clientSource = `${clientSource}\n${nextLine}`;
      consumed.add(clientIndex + 1);
    }
  }

  return {
    clientAddress, clientSource, clientStatus: clientAddress ? 'confident' : 'missing', clientReason: '',
    interventionAddress, interventionSource, interventionStatus: interventionAddress ? 'confident' : 'missing',
    interventionReason: interventionAddress ? '' : 'Le lieu des travaux n’a pas été précisé séparément.'
  };
}

function extractCustomerName(lines, consumed, addressResult) {
  let sourceText = '';
  let candidate = '';
  let status = 'missing';
  let reason = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const explicit = line.match(/(?:^|\b)(?:client|chez)\s+(.+)/iu);
    if (!explicit) continue;
    sourceText = line;
    candidate = stripNameContext(explicit[1]);
    status = 'uncertain';
    reason = 'Le nom a été isolé d’une phrase libre : vérifiez son orthographe et son ordre.';
    consumed.add(index);
    break;
  }

  if (!candidate && addressResult.clientSource) {
    const prefix = addressResult.clientSource.split('\n')[0].split(new RegExp(`\\b\\d{1,4}(?:\\s*(?:bis|ter))?\\s+(?:${STREET_TYPES})\\b`, 'iu'))[0];
    const stripped = stripNameContext(prefix);
    if (stripped && !isFiller(stripped)) {
      sourceText = prefix.trim();
      candidate = stripped;
      status = 'uncertain';
      reason = 'Le nom et l’adresse figuraient sur la même ligne.';
    }
  }

  if (!candidate) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (consumed.has(index) || !looksLikeName(line)) continue;
      sourceText = line;
      candidate = stripNameContext(line);
      status = /\b(?:monsieur|madame|mr|mme)\b/iu.test(line) ? 'uncertain' : 'confident';
      reason = status === 'uncertain' ? 'Vérifiez le nom et les civilités, conservés depuis vos notes.' : '';
      consumed.add(index);
      break;
    }
  }

  const value = candidate ? toDisplayCase(candidate) : '';
  if (value && value !== sanitizeLine(candidate) && status === 'confident') status = 'normalized';
  return { value, sourceText, status, reason };
}

function extractCombustion(lines, consumed) {
  const result = [];
  let capturing = false;
  lines.forEach((line, index) => {
    if (/\bcombustion\b/iu.test(line)) capturing = true;
    if (!capturing) return;
    if (index > 0 && (extractDateInfo(line) || interpretItem(line, '-'))) {
      if (!/\bcombustion\b/iu.test(line)) capturing = false;
      return;
    }
    result.push(line);
    consumed.add(index);
  });
  return result;
}

function interpretItem(rawLine, dateLabel) {
  let line = normalizePriceNotation(sanitizeLine(rawLine));
  line = line.replace(/^(?:j['’]?ai\s+fait|j['’]?ai\s+effectu[ée]|travaux?\s*:?)\s*/iu, '').trim();
  if (!line || /^(?:total|montant|ttc|ht|tva)\b/iu.test(line)) return null;

  const structured = parseStructuredPrice(line, dateLabel);
  if (structured) return structured;

  const wordAmount = extractFrenchWordAmount(line);
  if (wordAmount) line = `${wordAmount.description} ${formatEuro(wordAmount.amount)}`;

  const currency = '(?:€|euros?|eur)';
  const amount = '(\\d+(?:[.,]\\d+)?)';
  const trailing = line.match(new RegExp(`^(.+?)\\s+${amount}\\s*(${currency})?$`, 'iu'));
  const leading = line.match(new RegExp(`^${amount}\\s*(${currency})?\\s+(?:de\\s+)?(.+)$`, 'iu'));

  let description = '';
  let numericPrice = null;
  let hadCurrency = false;
  if (trailing && (trailing[3] || looksLikeWork(trailing[1]))) {
    description = trailing[1];
    numericPrice = toNumber(trailing[2]);
    hadCurrency = Boolean(trailing[3]);
  } else if (leading && (leading[2] || looksLikeWork(leading[3]))) {
    description = leading[3];
    numericPrice = toNumber(leading[1]);
    hadCurrency = Boolean(leading[2]);
  }

  if (Number.isFinite(numericPrice)) {
    const quantityInfo = extractLeadingQuantity(description);
    const quantity = quantityInfo?.quantity || 1;
    const normalizedDescription = normalizeDescription(quantityInfo?.description || description);
    const ambiguousDescription = needsDescriptionReview(normalizedDescription.value);
    const status = ambiguousDescription || !hadCurrency ? 'uncertain' : (normalizedDescription.changed || wordAmount ? 'normalized' : 'confident');
    return {
      item: {
        description: normalizedDescription.value, date: dateLabel, quantity: formatQty(quantity), unit: 'pce',
        unitPrice: formatEuro(quantity > 1 ? numericPrice / quantity : numericPrice), total: formatEuro(numericPrice),
        hasExplicitPrice: true, includedWithoutPrice: false
      },
      confidence: status, status, reviewRequired: status === 'uncertain',
      reason: ambiguousDescription ? 'Nous ne sommes pas certains de cette désignation. Le texte original a été conservé.' : (!hadCurrency ? 'Le nombre ressemble à un prix, mais aucune devise n’était indiquée.' : '')
    };
  }

  if (!looksLikeWork(line)) return null;
  const normalizedDescription = normalizeDescription(line);
  return {
    item: { description: normalizedDescription.value, date: dateLabel, quantity: '1,00', unit: 'pce', unitPrice: '', total: '', hasExplicitPrice: false, includedWithoutPrice: false },
    confidence: 'missing', status: 'missing', reviewRequired: true, reason: 'Aucun prix explicite n’a été trouvé.'
  };
}

function parseStructuredPrice(line, dateLabel) {
  const currency = '(?:€|euros?|eur)?';
  const amount = '(\\d+(?:[.,]\\d+)?)';
  const unit = '(h|heure|heures|pce|u|unit[ée]s?|pi[eè]ces?)?';
  const match = line.match(new RegExp(`^(.+?)?\\s*${amount}\\s*${unit}\\s*(?:à|a|x|\\*)\\s*${amount}\\s*${currency}$`, 'iu'));
  if (!match) return null;

  const rawDescription = sanitizeLine(match[1]);
  const quantity = toNumber(match[2]);
  const unitPrice = toNumber(match[4]);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0) return null;
  const normalizedDescription = normalizeDescription(rawDescription);
  const status = rawDescription ? (normalizedDescription.changed ? 'normalized' : 'confident') : 'missing';
  return {
    item: { description: normalizedDescription.value, date: dateLabel, quantity: formatQty(quantity), unit: normalizeUnit(match[3]), unitPrice: formatEuro(unitPrice), total: formatEuro(quantity * unitPrice), hasExplicitPrice: true, includedWithoutPrice: false },
    confidence: status, status, reviewRequired: !rawDescription,
    reason: rawDescription ? '' : 'La quantité et le prix sont clairs, mais la désignation manque.'
  };
}

function buildQuestions(fields, missingFields, items, itemFields) {
  const questions = missingFields.map(field => ({ id: `missing-${field.field}`, kind: 'missing_field', field: field.field, prompt: field.question, sourceText: '', value: '', blocking: field.blocking }));

  ['clientName', 'clientAddress', 'workDate'].forEach(fieldName => {
    const field = fields[fieldName];
    if (!field?.reviewRequired || field.status === 'missing') return;
    questions.push({
      id: `review-${fieldName}`, kind: 'review_field',
      field: fieldName === 'clientName' ? 'client.name' : (fieldName === 'clientAddress' ? 'client.address' : 'intervention.workDate'),
      prompt: fieldName === 'workDate' ? 'Cette période de travaux est-elle assez précise ?' : 'Cette information est-elle correcte ?',
      sourceText: field.sourceText, value: field.value, blocking: false
    });
  });

  items.forEach(item => {
    const metadata = itemFields.find(field => field.itemId === item.id);
    if (!item.hasExplicitPrice) {
      questions.push({ id: `price-${item.id}`, kind: 'missing_price', itemId: item.id, prompt: `Quel prix pour « ${item.description} » ?`, sourceText: item.sourceText, value: item.description, blocking: true });
    } else if (metadata?.reviewRequired) {
      questions.push({ id: `review-${item.id}`, kind: 'review_item', itemId: item.id, prompt: metadata.reason || 'Cette ligne est-elle correcte ?', sourceText: item.sourceText, value: item.description, blocking: false });
    }
  });
  return questions;
}

function fieldMetadata(value, sourceText, status = 'confident', reason = '') {
  return { value: value || '', sourceText: sourceText || '', confidence: status, status, reviewRequired: status === 'uncertain' || status === 'missing', reason };
}

function missingField(field, label, question, blocking) {
  return { field, label, question, blocking };
}

function extractDateInfo(rawLine) {
  const line = sanitizeLine(rawLine);
  if (!line) return null;

  const numeric = line.match(/(?:^|[^\d])(\d{1,2})[\/\-.\s]+(\d{1,2})[\/\-.\s]+(\d{2}|\d{4})(?=$|[^\d])/u);
  if (numeric) return exactDate(numeric[1], numeric[2], numeric[3], numeric[0].trim());

  const written = line.match(/(?:^|[^\p{L}\d])(\d{1,2})\s+([\p{L}.]+)\s+(\d{2}|\d{4})(?=$|[^\p{L}\d])/iu);
  if (written) {
    const month = monthNumber(written[2]);
    if (month) return exactDate(written[1], month, written[3], written[0].trim());
  }

  const monthYear = line.match(/(?:^|[^\p{L}\d])([\p{L}.]+)\s+(\d{4})(?=$|[^\p{L}\d])/iu);
  if (monthYear) {
    const month = monthNumber(monthYear[1]);
    if (month) {
      const label = `${capitalize(monthYear[1].replace('.', ''))} ${monthYear[2]}`;
      return { value: `${monthYear[2]}-${pad2(month)}`, displayValue: label, precision: 'month', year: Number(monthYear[2]), month, day: null, raw: monthYear[0].trim() };
    }
  }

  const monthOnly = line.match(new RegExp(`(?:^|\\b(?:en|c['’]?(?:etait|était)\\s+en)\\s+)(${MONTH_WORDS})(?=$|[^\\p{L}])`, 'iu'));
  if (monthOnly) {
    const month = monthNumber(monthOnly[1]);
    return { value: normalizeForSearch(monthOnly[1]), displayValue: capitalize(monthOnly[1]), precision: 'month_without_year', year: null, month, day: null, raw: monthOnly[0].trim() };
  }

  const yearOnly = line.match(/^(?:en\s+)?(20\d{2})$/iu);
  if (yearOnly) return { value: yearOnly[1], displayValue: yearOnly[1], precision: 'year', year: Number(yearOnly[1]), month: null, day: null, raw: yearOnly[0] };
  return null;
}

function exactDate(dayValue, monthValue, yearValue, raw) {
  const year = normalizeYear(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  const value = `${pad2(day)}/${pad2(month)}/${year}`;
  return { value, displayValue: value, precision: 'day', year, month, day, raw };
}

function isDateOnly(line) {
  const date = extractDateInfo(line);
  if (!date) return false;
  const remainder = sanitizeLine(line).replace(date.raw, '').replace(/^(?:le|en|date|intervention)\s*/iu, '').trim();
  return !remainder;
}

function extractStreetPart(line, workDate) {
  const normalized = workDate?.raw ? line.replace(workDate.raw, ' ') : line;
  const match = normalized.match(new RegExp(`\\b\\d{1,4}(?:\\s*(?:bis|ter))?\\s+(?:${STREET_TYPES})\\b.+$`, 'iu'));
  if (!match) return '';
  return match[0].replace(new RegExp(`\\s+(?=(?:${WORK_WORDS})\\b).*`, 'iu'), '').trim();
}

function extractTownBeforeStreet(line) {
  const streetStart = line.search(new RegExp(`\\b\\d{1,4}(?:\\s*(?:bis|ter))?\\s+(?:${STREET_TYPES})\\b`, 'iu'));
  if (streetStart < 0) return '';
  const match = line.slice(0, streetStart).match(/(?:^|\s)(?:à|a)\s+([\p{L}][\p{L}'’ -]{1,45})$/iu);
  return match ? match[1].trim() : '';
}

function stripNameContext(value) {
  const result = sanitizeLine(value)
    .replace(/^alors\s+/iu, '')
    .replace(new RegExp(`\\s+\\b\\d{1,4}(?:\\s*(?:bis|ter))?\\s+(?:${STREET_TYPES})\\b.*$`, 'iu'), '')
    .replace(/\s+(?:à|a)\s+[\p{L}][\p{L}'’ -]{1,45}$/iu, '')
    .replace(/^(?:client|chez)\s+/iu, '')
    .trim();
  return /^(?:monsieur|madame)$/iu.test(result) ? '' : result;
}

function looksLikeName(line) {
  const clean = sanitizeLine(line);
  if (!clean || clean.length > 70 || /\d/u.test(clean) || looksLikeWork(clean) || extractDateInfo(clean) || isFiller(clean)) return false;
  const words = clean.split(/\s+/u);
  return words.length >= 1 && words.length <= 7 && words.every(word => /^[\p{L}'’.-]+$/u.test(word));
}

function looksLikeWork(value) {
  return WORK_RE.test(normalizeForSearch(value));
}

function normalizeDescription(value) {
  const original = sanitizeLine(value);
  const normalized = original
    .replace(/\bmain\s+d['’ ]?oeuvre\b/giu, 'Main-d’œuvre')
    .replace(/\bmain\s+d['’ ]?œuvre\b/giu, 'Main-d’œuvre')
    .replace(/\bmain\s+oeuvre\b/giu, 'Main-d’œuvre')
    .replace(/([\p{L}])(avec|sans|pour)(?=\s|$)/giu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return { value: normalized, changed: normalized !== original };
}

function needsDescriptionReview(description) {
  return /\b(?:serinite|pate\s+wc|meuble\s+d[eé]placement)\b/u.test(normalizeForSearch(description));
}

function normalizePriceNotation(value) {
  return String(value || '')
    .replace(/(\d)\s*€\s*(\d{1,2})(?=$|\s)/gu, '$1,$2 €')
    .replace(/(\d)\s+euros?\s+(\d{1,2})(?=$|\s)/giu, '$1,$2 €')
    .replace(/([\p{L})])(\d+(?:[.,]\d+)?\s*€)(?=$|\s)/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFrenchWordAmount(line) {
  const match = line.match(/^(.*?)\s+([\p{L}-]+(?:\s+[\p{L}-]+)*)\s+euros?$/iu);
  if (!match) return null;
  const tokens = normalizeForSearch(match[2]).split(/[\s-]+/u);
  let numberStart = tokens.length;
  while (numberStart > 0 && FRENCH_NUMBER_WORDS.has(tokens[numberStart - 1])) numberStart -= 1;
  if (numberStart === tokens.length) return null;
  const originalTokens = match[2].split(/[\s-]+/u);
  const descriptionTail = originalTokens.slice(0, numberStart).join(' ');
  const description = sanitizeLine(`${match[1]} ${descriptionTail}`);
  const amount = parseFrenchNumber(tokens.slice(numberStart));
  return Number.isFinite(amount) && description ? { description, amount } : null;
}

function parseFrenchNumber(tokens) {
  const values = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  let current = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'quatre' && /^(vingt|vingts)$/.test(tokens[index + 1] || '')) {
      current += 80;
      index += 1;
      continue;
    }
    if (token === 'et') continue;
    if (token === 'cent' || token === 'cents') current = (current || 1) * 100;
    else if (token in values) current += values[token];
    else return NaN;
  }
  return current;
}

function extractLeadingQuantity(description) {
  const match = sanitizeLine(description).match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/u);
  if (!match) return null;
  const quantity = toNumber(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? { quantity, description: match[2] } : null;
}

function inferOperationType(items) {
  return items.find(item => /\b(?:entretien|d[ée]pannage|installation|chaudi[eè]re|br[ûu]leur)\b/iu.test(item.description || ''))?.description || 'Travaux';
}

function formatAddress(value) {
  return sanitizeLine(value).replace(/^intervention\s*/iu, '').replace(/\s+(?=\d{5}\b)/u, '\n').trim();
}

function extractPostalCode(address) {
  return String(address || '').match(/\b\d{5}\b/u)?.[0] || '';
}

function extractCity(address) {
  const value = String(address || '');
  const postal = value.match(/\b\d{5}\s+([^\n]+)$/u);
  if (postal) return postal[1].trim();
  const lines = value.split('\n');
  return lines.length > 1 && !/\d/u.test(lines.at(-1)) ? lines.at(-1).trim() : '';
}

function looksLikeInvoiceHeader(lines) {
  if (!lines?.length) return false;
  const hasAddress = lines.some(line => Boolean(extractStreetPart(line) || /\b\d{5}\b/u.test(line)));
  const hasIdentity = lines.some(looksLikeName) || lines.some(line => /\b(?:client|chez)\b/iu.test(line));
  return hasAddress && hasIdentity;
}

function isInvoiceStart(lines, index) {
  const lookAhead = lines.slice(index, index + 6);
  return looksLikeInvoiceHeader(lookAhead)
    && lookAhead.some(line => Boolean(extractDateInfo(line)))
    && lines.slice(0, index).some(line => Boolean(interpretItem(line, '-')));
}

function normalizeMultilineText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function toCleanLines(value) {
  return String(value || '').split('\n').map(sanitizeLine).filter(Boolean).filter(line => !/^[-_]{3,}$/u.test(line));
}

function sanitizeLine(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t\f\v]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function toDisplayCase(value) {
  return sanitizeLine(value).split(/\s+/u).map(word => word.split(/([-’'])/u).map(part => /^[\p{L}]/u.test(part) ? capitalize(part.toLowerCase()) : part).join('')).join(' ');
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function monthNumber(label) {
  return MONTHS[normalizeForSearch(label).replace(/\./g, '')] || null;
}

function normalizeYear(value) {
  const text = String(value);
  if (text.length === 4) return Number(text);
  const year = Number(text);
  return year >= 70 ? 1900 + year : 2000 + year;
}

function precisionLabel(precision) {
  return precision.startsWith('month') ? 'mois' : (precision === 'year' ? 'année' : 'jour');
}

function normalizeUnit(value) {
  return /^h/iu.test(value || '') ? 'h' : 'pce';
}

function toNumber(value) {
  return Number.parseFloat(String(value || '').replace(',', '.').replace(/\s/g, ''));
}

function formatEuro(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
}

function formatQty(value) {
  return Number(value || 0).toFixed(2).replace('.', ',');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTodayDate() {
  const date = new Date();
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function addDaysToDateString(value, days) {
  const [day, month, year] = value.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function isFiller(value) {
  return /^(?:alors|bonjour|salut|merci|voil[àa]|facture|devis|et)$/iu.test(sanitizeLine(value));
}
