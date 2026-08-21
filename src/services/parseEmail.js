// parseEmail.js

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

/**
 * Parses a single invoice payload and returns an invoice object.
 * Kept for compatibility with older callers.
 */
export function parseEmail(emailText) {
  return parseEmails(emailText)[0] || null;
}

/**
 * Parses one raw input that can contain one or many invoices.
 */
export function parseEmails(emailText) {
  const invoiceChunks = splitInvoiceChunks(emailText);
  return invoiceChunks
    .map(parseInvoiceChunk)
    .filter(Boolean);
}

function splitInvoiceChunks(emailText) {
  const normalizedText = normalizeMultilineText(emailText);
  if (!normalizedText) {
    return [];
  }

  const paragraphChunks = normalizedText
    .split(/\n\s*\n+/)
    .map(toCleanLines)
    .filter(chunk => chunk.length > 0);

  if (paragraphChunks.length > 1) {
    const merged = [];
    paragraphChunks.forEach(chunk => {
      if (!merged.length || looksLikeInvoiceHeader(chunk)) {
        merged.push(chunk);
      } else {
        merged[merged.length - 1] = merged[merged.length - 1].concat(chunk);
      }
    });

    if (merged.length > 1) {
      return merged;
    }
  }

  const lines = toCleanLines(normalizedText);
  if (!lines.length) {
    return [];
  }

  const startIndices = [0];
  for (let index = 1; index < lines.length; index += 1) {
    if (isInvoiceStart(lines, index)) {
      startIndices.push(index);
    }
  }

  const uniqueStarts = startIndices
    .filter((value, idx, arr) => idx === 0 || value !== arr[idx - 1])
    .sort((a, b) => a - b);

  const chunks = [];
  uniqueStarts.forEach((startIndex, idx) => {
    const endIndex = uniqueStarts[idx + 1] ?? lines.length;
    const chunk = lines.slice(startIndex, endIndex);
    if (chunk.length > 1) {
      chunks.push(chunk);
    }
  });

  return chunks;
}

function parseInvoiceChunk(lines) {
  if (!lines?.length) {
    return null;
  }

  const { name: clientName, address: extractedAddress, remaining: initialRest } = extractClientInfo(lines);
  let clientAddress = extractedAddress;

  let interventionPlace = '';
  let currentDate = '';
  let invoiceDate = '';
  const descriptionEntries = [];
  const items = [];
  const combustionLines = [];
  let restLines = [...initialRest];

  while (restLines.length > 0) {
    const potentialAddressLine = restLines[0];
    const hasZipInAddress = /\b\d{5}\b/.test(clientAddress);
    const looksLikeZipLine = /\b\d{5}\b/.test(potentialAddressLine);

    if (
      !extractDate(potentialAddressLine)
      && !/^intervention\b/i.test(potentialAddressLine)
      && !looksLikeNarrativeLine(potentialAddressLine)
      && (looksLikeZipLine || (!hasZipInAddress && /\d/.test(potentialAddressLine)))
    ) {
      clientAddress = `${clientAddress}\n${splitLineByZip(potentialAddressLine)}`;
      restLines = restLines.slice(1);
    } else {
      break;
    }
  }

  const interventionIdx = restLines.findIndex(line => /\bintervention\b/i.test(line));
  if (interventionIdx !== -1) {
    const interventionLine = restLines.splice(interventionIdx, 1)[0];
    const dateFromIntervention = extractDateInfo(interventionLine);
    if (dateFromIntervention) {
      currentDate = dateFromIntervention.date;
      invoiceDate = invoiceDate || dateFromIntervention.date;
    }

    const cleanedIntervention = removeDateFromLine(interventionLine, dateFromIntervention)
      .replace(/^intervention\b/i, '')
      .replace(/\bintervention\b/i, '')
      .replace(/\ble\b/i, '')
      .trim();

    if (cleanedIntervention && !isDateOnly(cleanedIntervention)) {
      interventionPlace = cleanedIntervention;
    }

    // Artisans often write the date after "Intervention", then put the
    // intervention address on the following line.
    if (!interventionPlace) {
      const followingLine = restLines[interventionIdx] || '';
      if (looksLikeStreetAddress(followingLine)) {
        interventionPlace = followingLine;
        restLines.splice(interventionIdx, 1);
      }
    }
  }

  if (!interventionPlace) {
    interventionPlace = clientAddress.split('\n')[0] || 'Intervention';
  }

  let capturingCombustion = false;

  restLines.forEach(line => {
    const maybeDate = extractDate(line);
    if (maybeDate && !capturingCombustion) {
      currentDate = maybeDate;
      invoiceDate = invoiceDate || maybeDate;
      return;
    }

    if (isCombustionStart(line)) {
      capturingCombustion = true;
      combustionLines.push(line);
      return;
    }

    if (capturingCombustion) {
      const combustionExitDate = extractDate(line);
      if (combustionExitDate) {
        capturingCombustion = false;
        currentDate = combustionExitDate;
        invoiceDate = invoiceDate || combustionExitDate;
        return;
      }

      const maybeCombustionItem = parseItemLine(line, currentDate);
      if (maybeCombustionItem) {
        capturingCombustion = false;
        items.push(maybeCombustionItem);
        return;
      }

      combustionLines.push(line);
      return;
    }

    const parsedItem = parseItemLine(line, currentDate);
    if (parsedItem) {
      items.push(parsedItem);
      return;
    }

    addDescription(descriptionEntries, currentDate, line);
  });

  const finalInvoiceDate = invoiceDate || getTodayDate();

  return {
    documentType: 'facture',
    operationType: inferOperationType(descriptionEntries, items),
    sender: { ...DEFAULT_SENDER },
    client: {
      name: clientName,
      address: clientAddress
    },
    intervention: {
      address: `Intervention ${interventionPlace}`,
      descriptions: descriptionEntries
    },
    items,
    combustion: {
      lines: combustionLines
    },
    payment: { ...DEFAULT_PAYMENT },
    footer: { ...DEFAULT_FOOTER },
    invoiceDate: finalInvoiceDate,
    dueDate: addDaysToDateString(finalInvoiceDate, 30)
  };
}

function normalizeMultilineText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function toCleanLines(text) {
  return String(text || '')
    .split('\n')
    .map(line => sanitizeLine(line))
    .filter(Boolean)
    .filter(line => !/^[-_]{3,}$/.test(line));
}

function sanitizeLine(line) {
  return String(line || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeInvoiceHeader(chunk) {
  if (!chunk || chunk.length < 2) {
    return false;
  }

  const [firstLine] = chunk;
  const hasDate = chunk.some(line => Boolean(extractDate(line)));
  const hasAddressLine = chunk.slice(1, 4).some(looksLikeAddressLine);
  return hasDate && !/\d/.test(firstLine) && hasAddressLine;
}

function isInvoiceStart(lines, index) {
  const currentLine = lines[index];
  const nextLine = lines[index + 1] || '';

  if (!currentLine || !nextLine) {
    return false;
  }

  if (/\d/.test(currentLine)) {
    return false;
  }

  if (!/\p{L}/u.test(currentLine)) {
    return false;
  }

  if (/^(intervention|combustion|total|forfait|nettoyage|remplacement|rend|o2|co2|co)\b/i.test(currentLine)) {
    return false;
  }

  const lookAhead = lines.slice(index, index + 6);
  const hasAddressLine = lookAhead.slice(1, 4).some(looksLikeAddressLine);
  return hasAddressLine && lookAhead.some(line => Boolean(extractDate(line)));
}

function looksLikeAddressLine(line) {
  return /\b\d{5}\b/.test(line) || looksLikeStreetAddress(line);
}

function addDescription(descriptionEntries, date, line) {
  const targetDate = date || '-';
  const existingEntry = descriptionEntries.find(entry => entry.date === targetDate);
  if (existingEntry) {
    existingEntry.description += `\n${line}`;
    return;
  }

  descriptionEntries.push({
    date: targetDate,
    description: line
  });
}

function inferOperationType(descriptionEntries, items) {
  const lines = [];

  descriptionEntries.forEach(entry => {
    entry.description
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .forEach(line => lines.push(line));
  });

  items.forEach(item => {
    if (item.description) {
      lines.push(item.description);
    }
  });

  const candidate = lines.find(line => /\b(entretien|depannage|installation|chaudiere|bruleur)\b/i.test(normalizeForSearch(line)));
  return candidate || 'Entretien chaudière';
}

function isCombustionStart(line) {
  return /combustion/i.test(line);
}

function looksLikeNarrativeLine(line) {
  return /\b(entretien|forfait|nettoyage|remplacement|combustion|total)\b/i.test(line);
}

function looksLikeStreetAddress(line) {
  const normalized = normalizeForSearch(line);
  if (!normalized || /(?:€|\beur\b)/i.test(line)) {
    return false;
  }

  const hasStreetNumber = /\d/.test(normalized);
  const hasStreetType = /\b(rue|avenue|av|boulevard|bd|route|chemin|impasse|allee|place|passage|quai|residence|lotissement)\b/i.test(normalized);
  return hasStreetNumber && hasStreetType;
}

function extractClientInfo(lines) {
  if (!lines.length) {
    return { name: 'Client inconnu', address: 'Adresse inconnue', remaining: [] };
  }

  const [first, second, ...rest] = lines;
  const firstHasDigit = /\d/.test(first);
  const secondHasDigit = /\d/.test(second || '');

  if (!firstHasDigit) {
    return {
      name: first,
      address: splitLineByZip(second || 'Adresse inconnue'),
      remaining: rest
    };
  }

  const digitIndex = first.search(/\d/);
  if (digitIndex > 0) {
    return {
      name: first.slice(0, digitIndex).trim() || 'Client inconnu',
      address: splitLineByZip(first.slice(digitIndex).trim() || 'Adresse inconnue'),
      remaining: [second, ...rest].filter(Boolean)
    };
  }

  if (!secondHasDigit && second) {
    return {
      name: second,
      address: splitLineByZip(first),
      remaining: rest
    };
  }

  return {
    name: 'Client inconnu',
    address: splitLineByZip(first),
    remaining: [second, ...rest].filter(Boolean)
  };
}

function extractDate(line) {
  return extractDateInfo(line)?.date || null;
}

function extractDateInfo(line) {
  const normalizedLine = sanitizeLine(line);
  if (!normalizedLine) {
    return null;
  }

  const splitMonthDate = normalizedLine.match(/(^|[^\d])((?:le\s+)?(\d{1,2})\s+([01])\s+(\d)\s+(\d{4}|\d{2})(?=$|[^\d]))/iu);
  if (splitMonthDate) {
    return buildDateInfo(
      splitMonthDate[2],
      splitMonthDate[3],
      `${splitMonthDate[4]}${splitMonthDate[5]}`,
      splitMonthDate[6]
    );
  }

  const numericDate = normalizedLine.match(/(^|[^\d])((?:le\s+)?(\d{1,2})[\/\-\s]+(\d{1,2})[\/\-\s]+(\d{4}|\d{2})(?=$|[^\d]))/iu);
  if (numericDate) {
    return buildDateInfo(numericDate[2], numericDate[3], numericDate[4], numericDate[5]);
  }

  const monthMatch = normalizedLine.match(/(^|[^\p{L}\d])((?:le\s+)?(\d{1,2})\s+([\p{L}.-]+)\s+(\d{4}|\d{2})(?=$|[^\p{L}\d]))/iu);
  if (monthMatch) {
    const month = monthToNumber(monthMatch[4]);
    if (month) {
      return buildDateInfo(monthMatch[2], monthMatch[3], month, monthMatch[5]);
    }
  }

  const monthYearMatch = normalizedLine.match(/(^|[^\p{L}\d])(([\p{L}.-]+)\s+(\d{4}|\d{2})(?=$|[^\p{L}\d]))/iu);
  if (monthYearMatch) {
    const month = monthToNumber(monthYearMatch[3]);
    if (month) {
      return buildDateInfo(monthYearMatch[2], '1', month, monthYearMatch[4]);
    }
  }

  return null;
}

function buildDateInfo(raw, day, month, year) {
  const normalizedYear = normalizeYear(year);
  const dayNumber = Number.parseInt(day, 10);
  const monthNumber = Number.parseInt(month, 10);
  const yearNumber = Number.parseInt(normalizedYear, 10);

  if (!isValidDateParts(dayNumber, monthNumber, yearNumber)) {
    return null;
  }

  return {
    raw: String(raw || '').trim(),
    date: toDateString(dayNumber, monthNumber, yearNumber)
  };
}

function isValidDateParts(day, month, year) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
}

function removeDateFromLine(line, dateInfo) {
  const normalizedLine = sanitizeLine(line);
  if (!dateInfo?.raw) {
    return normalizedLine;
  }

  return normalizedLine.replace(dateInfo.raw, '').trim();
}

function monthToNumber(monthLabel) {
  const normalized = monthLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .toLowerCase();

  const mapping = {
    janvier: '01',
    fevrier: '02',
    mars: '03',
    avril: '04',
    mai: '05',
    juin: '06',
    juillet: '07',
    aout: '08',
    septembre: '09',
    octobre: '10',
    novembre: '11',
    decembre: '12'
  };

  return mapping[normalized] || null;
}

function parseItemLine(rawLine, currentDate) {
  const line = normalizePriceNotation(sanitizeLine(rawLine));
  if (!line) {
    return null;
  }

  if (/^(total|montant|ttc|ht|tva)\b/i.test(line)) {
    return null;
  }

  const numberPattern = '(\\d+(?:[.,]\\d+)?)';
  const currencyPattern = '(?:\\u20AC|eur)';

  if (!new RegExp(`${numberPattern}\\s*${currencyPattern}`, 'i').test(line)) {
    return null;
  }

  const qtyPricePattern = new RegExp(
    `^(.+?)\\s+${numberPattern}\\s*(h|pce|u|unite|unites|piece|pieces)?\\s*[*x]\\s*${numberPattern}\\s*(?:${currencyPattern})?\\s+${numberPattern}\\s*(?:${currencyPattern})$`,
    'i'
  );

  const naturalLaborPattern = new RegExp(
    `^${numberPattern}\\s*(h|heure|heures)\\s+(?:de\\s+)?(.+?)\\s+(?:a|à|x)\\s*${numberPattern}\\s*(?:${currencyPattern})$`,
    'i'
  );

  const matchNaturalLabor = line.match(naturalLaborPattern);
  if (matchNaturalLabor) {
    const quantity = toNumber(matchNaturalLabor[1]);
    const unitPrice = toNumber(matchNaturalLabor[4]);

    return {
      description: matchNaturalLabor[3].trim(),
      date: currentDate || '-',
      quantity: formatQty(quantity),
      unit: 'h',
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(quantity * unitPrice)
    };
  }

  const quantityAndUnitPricePattern = new RegExp(
    `^(.+?)\\s+${numberPattern}\\s*(h|pce|u|unite|unites|piece|pieces)?\\s*(?:a|à|[*x])\\s*${numberPattern}\\s*(?:${currencyPattern})$`,
    'i'
  );

  const matchQuantityAndUnitPrice = line.match(quantityAndUnitPricePattern);
  if (matchQuantityAndUnitPrice) {
    const quantity = toNumber(matchQuantityAndUnitPrice[2]);
    const unitPrice = toNumber(matchQuantityAndUnitPrice[4]);

    return {
      description: matchQuantityAndUnitPrice[1].trim(),
      date: currentDate || '-',
      quantity: formatQty(quantity),
      unit: normalizeUnit(matchQuantityAndUnitPrice[3]),
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(quantity * unitPrice)
    };
  }

  const matchQty = line.match(qtyPricePattern);
  if (matchQty) {
    const description = matchQty[1].trim();
    const quantity = toNumber(matchQty[2]);
    const unit = normalizeUnit(matchQty[3]);
    const unitPrice = toNumber(matchQty[4]);
    const total = toNumber(matchQty[5]);

    return {
      description,
      date: currentDate || '-',
      quantity: formatQty(quantity),
      unit,
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(total)
    };
  }

  const codePricePattern = new RegExp(`^(.+?)\\s+[\\d\\s\\/.%-]+\\s+${numberPattern}\\s*(?:${currencyPattern})$`, 'i');
  const matchCode = line.match(codePricePattern);
  if (matchCode) {
    const description = matchCode[1].trim();
    const price = toNumber(matchCode[2]);

    return {
      description,
      date: currentDate || '-',
      quantity: '1,00',
      unit: 'pce',
      unitPrice: formatEuro(price),
      total: formatEuro(price)
    };
  }

  const trailingPricePattern = new RegExp(`^(.+?)\\s+${numberPattern}\\s*(?:${currencyPattern})$`, 'i');
  const matchTrailing = line.match(trailingPricePattern);
  if (matchTrailing) {
    const rawDescription = repairJoinedWords(matchTrailing[1].trim());
    const price = toNumber(matchTrailing[2]);
    const leadingQuantity = extractLeadingQuantity(rawDescription);
    const quantity = leadingQuantity?.quantity || 1;
    const description = leadingQuantity?.description || rawDescription;
    const unitPrice = quantity > 1 ? price / quantity : price;

    return {
      description,
      date: currentDate || '-',
      quantity: formatQty(quantity),
      unit: 'pce',
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(price)
    };
  }

  return null;
}

function normalizePriceNotation(line) {
  return String(line || '')
    // French handwritten shorthand: "22€80" means 22,80 €.
    .replace(/(\d)\s*€\s*(\d{1,2})(?=$|\s)/g, '$1,$2 €')
    // Accept a missing space between the description and its trailing price.
    .replace(/([\p{L})])(\d+(?:[.,]\d+)?\s*€)(?=$|\s)/gu, '$1 $2');
}

function repairJoinedWords(description) {
  return String(description || '')
    .replace(/([\p{L}])(avec|sans|pour)(?=\s|$)/giu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLeadingQuantity(description) {
  const match = String(description || '').match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/u);
  if (!match) {
    return null;
  }

  const quantity = toNumber(match[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    quantity,
    description: match[2].trim()
  };
}

function normalizeUnit(unitLabel) {
  const normalized = String(unitLabel || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!normalized) {
    return 'pce';
  }

  if (normalized.startsWith('h')) {
    return 'h';
  }

  return 'pce';
}

function splitLineByZip(line) {
  const zipRegex = /(\s)(\d{5})(\b)/;
  return String(line || '').replace(zipRegex, '\n$2');
}

function toNumber(value) {
  const normalized = String(value || '').replace(',', '.').replace(/\s/g, '');
  return Number.parseFloat(normalized);
}

function normalizeForSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatEuro(num) {
  return `${Number(num || 0).toFixed(2).replace('.', ',')} \u20AC`;
}

function formatQty(num) {
  return Number(num || 0).toFixed(2).replace('.', ',');
}

function normalizeYear(year) {
  const yearString = String(year || '').trim();
  if (yearString.length !== 2) {
    return yearString;
  }

  const yearNumber = Number.parseInt(yearString, 10);
  return `${yearNumber >= 70 ? '19' : '20'}${yearString}`;
}

function isDateOnly(value) {
  const dateInfo = extractDateInfo(value);
  return Boolean(dateInfo && removeDateFromLine(value, dateInfo) === '');
}

function toDateString(day, month, year) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
}

function getTodayDate() {
  const now = new Date();
  return toDateString(now.getDate(), now.getMonth() + 1, now.getFullYear());
}

function addDaysToDateString(dateString, days) {
  const [day, month, year] = String(dateString || '').split('/').map(value => Number.parseInt(value, 10));
  const isValid = Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year);
  if (!isValid) {
    return getTodayDate();
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return getTodayDate();
  }

  date.setDate(date.getDate() + days);
  return toDateString(date.getDate(), date.getMonth() + 1, date.getFullYear());
}
