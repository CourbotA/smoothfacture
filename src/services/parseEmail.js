// parseEmail.js

/**
 * Reads raw email text and returns a structured invoiceData object.
 * Parses descriptions with interleaved dates and assigns dates to items.
 */

export function parseEmail(emailText) {
  const lines = emailText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^[-_]{3,}$/.test(l)); // ignore separator lines

  const { name: clientName, address: extractedAddress, remaining: initialRest } = extractClientInfo(lines);
  let clientAddress = extractedAddress;

  let interventionPlace = '';
  let currentDate = '';
  const descriptionEntries = [];
  const items = [];
  const combustionLines = [];
  let restLines = [...initialRest];

  // If the next line looks like an address continuation (city/zip), append it.
  if (restLines.length) {
    const potentialAddressLine = restLines[0];
    const hasZipInAddress = /\b\d{5}\b/.test(clientAddress);
    const looksLikeZipLine = /\b\d{5}\b/.test(potentialAddressLine);

    if (
      !extractDate(potentialAddressLine) &&
      !/^intervention\b/i.test(potentialAddressLine) &&
      (looksLikeZipLine || (!hasZipInAddress && /\d/.test(potentialAddressLine)))
    ) {
      clientAddress = `${clientAddress}\n${splitLineByZip(potentialAddressLine)}`;
      restLines = restLines.slice(1);
    }
  }

  // Capture the first explicit "Intervention ..." line if present
  const interventionIdx = restLines.findIndex(l => /^intervention\b/i.test(l));
  if (interventionIdx !== -1) {
    const interventionLine = restLines.splice(interventionIdx, 1)[0];
    const dateFromIntervention = extractDate(interventionLine);
    if (dateFromIntervention) currentDate = dateFromIntervention;

    const cleanedIntervention = interventionLine
      .replace(/^intervention\b/i, '')
      .replace(/\ble\b/i, '')
      .replace(dateFromIntervention || '', '')
      .trim();

    const dateOnlyPlace = /^(\d{1,2}\s+){1,2}\d{4}$/.test(cleanedIntervention);
    if (cleanedIntervention && !dateOnlyPlace) {
      interventionPlace = cleanedIntervention;
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

  return {
    operationType: 'Entretien chaudière gaz',

    sender: {
      name: 'Courbot Gerard',
      address: '4 rue bourbon\n62690 aubigny en artois',
      phone: '06 70 79 48 67',
      email: 'gerardcourbot@gmail.com'
    },

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

    payment: {
      iban: 'FR76 1670 6000 7101 3972 9000 019',
      tvaNote: 'TVA non applicable aer.293B du CGI',
      conditions: '30 jours'
    },

    footer: {
      enterprise: 'Courbot Gerard - micro entreprise',
      fullAddress: '4 rue bourbon\n62690 aubigny en artois',
      siret: '538 179 649 00016',
      ape: '4322A'
    }
  };
}

function addDescription(descriptionEntries, date, line) {
  const targetDate = date || '-';
  const existingEntry = descriptionEntries.find(entry => entry.date === targetDate);
  if (existingEntry) {
    existingEntry.description += `\n${line}`;
  } else {
    descriptionEntries.push({
      date: targetDate,
      description: line
    });
  }
}

function isCombustionStart(line) {
  return /combustion/i.test(line);
}

function extractClientInfo(lines) {
  if (!lines.length) {
    return { name: 'Client inconnu', address: 'Adresse inconnue', remaining: [] };
  }

  const [first, second, ...rest] = lines;
  const firstHasDigit = /\d/.test(first);
  const secondHasDigit = /\d/.test(second || '');

  // name on first line
  if (!firstHasDigit) {
    return {
      name: first,
      address: splitLineByZip(second || 'Adresse inconnue'),
      remaining: rest
    };
  }

  // mixed name + address on first line
  const digitIndex = first.search(/\d/);
  if (digitIndex > 0) {
    return {
      name: first.slice(0, digitIndex).trim() || 'Client inconnu',
      address: splitLineByZip(first.slice(digitIndex).trim() || 'Adresse inconnue'),
      remaining: [second, ...rest].filter(Boolean)
    };
  }

  // address then name
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
  const numericDate = line.match(/(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{4})/);
  if (numericDate) {
    const day = numericDate[1].padStart(2, '0');
    const month = numericDate[2].padStart(2, '0');
    const year = numericDate[3];
    return `${day}/${month}/${year}`;
  }

  const monthMatch = line.match(/(\d{1,2})\s+([A-Za-zéèêëôûùïîäâç]+)\s+(\d{4})/i);
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, '0');
    const month = monthToNumber(monthMatch[2]);
    const year = monthMatch[3];
    if (month) return `${day}/${month}/${year}`;
  }

  return null;
}

function monthToNumber(monthLabel) {
  const normalized = monthLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const mapping = {
    janvier: '01',
    fevrier: '02',
    février: '02',
    mars: '03',
    avril: '04',
    mai: '05',
    juin: '06',
    juillet: '07',
    aout: '08',
    août: '08',
    septembre: '09',
    octobre: '10',
    novembre: '11',
    decembre: '12',
    décembre: '12'
  };

  return mapping[normalized];
}

/**
 * Parses an item line and assigns the current date.
 */
function parseItemLine(rawLine, currentDate) {
  const line = rawLine.replace(/\s+€/g, ' €').replace(/\s{2,}/g, ' ').trim();
  if (!line.includes('€')) return null;

  const numberPattern = '(\\d+(?:[.,]\\d+)?)';

  const qtyPricePattern = new RegExp(
    `^(.+?)\\s+${numberPattern}\\s*(h|pce|u|unite|unité)?\\s*\\*\\s*${numberPattern}\\s*€?\\s+${numberPattern}\\s*€$`,
    'i'
  );
  const matchQty = line.match(qtyPricePattern);
  if (matchQty) {
    const description = matchQty[1].trim();
    const quantity = toNumber(matchQty[2]);
    const unit = matchQty[3] ? matchQty[3].toLowerCase() : 'pce';
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

  const codePricePattern = new RegExp(`^(.+?)\\s+[\\d\\s\\/]+\\s+${numberPattern}\\s*€$`, 'i');
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

  const trailingPricePattern = new RegExp(`^(.+?)\\s+${numberPattern}\\s*€$`, 'i');
  const matchTrailing = line.match(trailingPricePattern);
  if (matchTrailing) {
    const description = matchTrailing[1].trim();
    const price = toNumber(matchTrailing[2]);

    return {
      description,
      date: currentDate || '-',
      quantity: '1,00',
      unit: 'pce',
      unitPrice: formatEuro(price),
      total: formatEuro(price)
    };
  }

  return null;
}

/**
 * Inserts a newline before any 5-digit zip code.
 */
function splitLineByZip(line) {
  const zipRegex = /(\s)(\d{5})(\b)/;
  return line.replace(zipRegex, '\n$2');
}

function toNumber(value) {
  return parseFloat(String(value).replace(',', '.'));
}

/**
 * Formats a number to "xx,xx €".
 */
function formatEuro(num) {
  return `${Number(num || 0).toFixed(2).replace('.', ',')} €`;
}

/**
 * Formats a quantity to "x,xx".
 */
function formatQty(num) {
  return Number(num || 0).toFixed(2).replace('.', ',');
}
