/**
 * parseEmail.js
 *
 * Reads raw email text and returns a structured invoiceData object.
 * Also parses a "Combustion" block if found.
 */

export function parseEmail(emailText) {
  const lines = emailText.split('\n').map(l => l.trim()).filter(Boolean);

  // Helper to insert a newline before any 5-digit zip code
  function splitLineByZip(line) {
    const zipRegex = /(\s)(\d{5})(\b)/;
    return line.replace(zipRegex, '\n$2');
  }

  // Basic fields from the first 3 lines
  const clientName = lines[0] || 'Client inconnu';
  const rawClientAddress = lines[1] || 'Adresse inconnue';
  const clientAddress = splitLineByZip(rawClientAddress);

  let currentDate = lines[2] || 'Date non précisée';
  const allDatesUsed = new Set();
  if (currentDate !== 'Date non précisée') {
    allDatesUsed.add(currentDate);
  }

  let interventionPlace = 'Lieu non spécifié';
  const restLines = lines.slice(3);

  const descriptionLines = [];
  const items = [];
  const combustionLines = [];

  // Regexes
  const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/i;
  const interventionRegex = /^intervention\s+(.*)$/i;
  const trailingPriceRegex = /^(.+?)\s+(\d+(?:[\.,]\d+)?)\s*€$/i;

  // We'll use a simple flag to know if we’re capturing "Combustion" lines
  let capturingCombustion = false;

  restLines.forEach(line => {
    // If we are currently capturing combustion lines...
    if (capturingCombustion) {
      if (
        !line ||
        dateRegex.test(line) ||
        trailingPriceRegex.test(line) ||
        interventionRegex.test(line) ||
        /^combustion$/i.test(line)
      ) {
        capturingCombustion = false;
        // Process this line as normal
      } else {
        combustionLines.push(line);
        return; // skip further checks
      }
    }

    // Check if line is exactly "Combustion"
    if (!capturingCombustion && /^combustion$/i.test(line)) {
      capturingCombustion = true;
      return;
    }

    // (A) Check if it's a date line
    if (dateRegex.test(line)) {
      currentDate = line;
      allDatesUsed.add(line);
      return;
    }

    // (B) Check if it's "intervention ..." line
    const placeMatch = line.match(interventionRegex);
    if (placeMatch) {
      interventionPlace = placeMatch[1].trim();
      return;
    }

    // (C) Check for multiplicative item "XXX  20*1.95€   39"
    const multiItem = parseMultiplicativeItem(line);
    if (multiItem) {
      // Insert the current date into that item
      multiItem.date = currentDate;
      items.push(multiItem);
      return;
    }

    // (D) Check for item line with trailing "XX €"
    const priceMatch = line.match(trailingPriceRegex);
    if (priceMatch) {
      const leftoverDesc = priceMatch[1].trim();
      const totalNum = parseFloat(priceMatch[2].replace(',', '.')) || 0;
      const totalStr = formatEuro(totalNum);

      // Attempt to parse hour-based pattern like "3h*35"
      const parsed = parseHourBasedItem(leftoverDesc);
      if (parsed) {
        items.push({
          description: parsed.description,
          date: currentDate,
          quantity: formatQty(parsed.quantity),
          unit: 'h',
          unitPrice: formatEuro(parsed.unitPrice),
          total: totalStr
        });
      } else {
        // fallback: quantity=1
        items.push({
          description: leftoverDesc,
          date: currentDate,
          quantity: '1,00',
          unit: 'pce',
          unitPrice: totalStr,
          total: totalStr
        });
      }
    } else {
      // (E) Just a normal description line
      descriptionLines.push(line);
    }
  });

  // If no explicit "intervention ..." line, fallback to client address
  if (interventionPlace === 'Lieu non spécifié') {
    interventionPlace = clientAddress;
  }

  // Build the Intervention header
  const allDatesArray = Array.from(allDatesUsed);
  let interventionHeader = `Intervention ${interventionPlace}`;
  if (allDatesArray.length) {
    interventionHeader += ` ${allDatesArray.join(', ')}`;
  }

  // Return the structured data
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
      date: currentDate,
      address: interventionHeader,
      details: descriptionLines
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
      fullAddress: '4 rue bourbon 62690 aubigny en artois',
      siret: '538 179 649 00016',
      ape: '4322A'
    }
  };
}

/**
 * Attempts to parse lines like:
 * "Fourniture tube multicouche diamètre 16  20*1.95€                        39 €"
 *
 *  -> leftoverDesc = "Fourniture tube multicouche diamètre 16"
 *  -> quantity = 20
 *  -> maybe unit = "m" (if we detect "m" in or after the quantity)
 *  -> unitPrice = 1.95
 *  -> total = 39
 */
function parseMultiplicativeItem(line) {
  // A regex capturing:
  //  (1) Description (greedy, up to whitespace)
  //  (2) quantity
  //  (3) unit price
  //  (4) total
  //
  // e.g.: "My desc    20*1.95€   39"
  // capturing groups: [1]="My desc", [2]="20", [3]="1.95", [4]="39"
  //
  // Adjust the regex if your input lines vary.
  const multiRegex = /^(.*?)\s+(\d+)\*([\d,\.]+)€\s+([\d,\.]+)/;
  const match = line.match(multiRegex);
  if (!match) return null;

  let leftoverDesc = match[1].trim();
  const quantityStr = match[2];
  let unitPriceStr = match[3];
  let totalStr = match[4];

  // Convert to pure numbers for safe float parsing
  unitPriceStr = unitPriceStr.replace(',', '.');
  totalStr = totalStr.replace(',', '.');

  const quantity = parseFloat(quantityStr);
  const unitPrice = parseFloat(unitPriceStr);
  const totalVal = parseFloat(totalStr);

  // Detect if "m" is intended as a unit (e.g. "20m*1.95€" or leftoverDesc includes "diamètre 16")
  // This is optional. You can also just return "pce".
  let unit = 'pce';
  // If you want to interpret everything as "m", do it here:
  // e.g. if your domain is always "m" for this type of item:
  unit = 'm';

  return {
    description: leftoverDesc,    // e.g. "Fourniture tube multicouche diamètre 16"
    date: '',                     // we’ll fill this in parseEmail()
    quantity: formatQty(quantity),
    unit,
    unitPrice: formatEuro(unitPrice),
    total: formatEuro(totalVal)
  };
}

/**
 * parseHourBasedItem('3h*35') -> { description, quantity, unitPrice }
 * (unchanged)
 */
function parseHourBasedItem(line) {
  const priceRegex = /(?:\*|x)\s*(\d+(?:\.\d+)?)/;
  const priceMatch = line.match(priceRegex);
  if (!priceMatch) return null;

  const unitPriceNum = parseFloat(priceMatch[1]);
  let lineWithoutPrice = line.replace(priceRegex, '').trim();

  const hourRegex = /(\d+(?:\.\d+)?h\d*|\d+h\d*)/i;
  const hourMatch = lineWithoutPrice.match(hourRegex);
  if (!hourMatch) return null;

  const hourStr = hourMatch[0];
  const quantity = convertHourStringToFloat(hourStr);
  let lineWithoutHours = lineWithoutPrice.replace(hourRegex, '').trim();

  return {
    description: lineWithoutHours,
    quantity,
    unitPrice: unitPriceNum
  };
}

function convertHourStringToFloat(str) {
  const match = str.match(/(\d+(?:\.\d+)?)h(\d+)?/i);
  if (match) {
    let hours = parseFloat(match[1]) || 0;
    let minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours + minutes / 60;
  }
  return parseFloat(str) || 1;
}

function formatEuro(num) {
  return num.toFixed(2).replace('.', ',') + ' €';
}

function formatQty(num) {
  return num.toFixed(2).replace('.', ',');
}
