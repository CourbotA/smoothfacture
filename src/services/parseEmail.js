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
    // e.g. transforms "2 bis rue des dominicains 62000 Arras"
    // into "2 bis rue des dominicains\n62000 Arras"
    // if it finds a 5-digit sequence
    const zipRegex = /(\s)(\d{5})(\b)/;
    // Explanation:
    //  (\s) => a whitespace
    //  (\d{5}) => 5 digits
    //  (\b) => word boundary
    //
    // Then we'll insert a newline before the 5-digit group
    // so the replaced string becomes "2 bis ...\n62000 Arras"
    return line.replace(zipRegex, '\n$2');
  }

  // Basic fields from the first 3 lines
  const clientName = lines[0] || 'Client inconnu';
  // The second line might contain the address with a zip code
  const rawClientAddress = lines[1] || 'Adresse inconnue';
  // Split on the zip code if found
  const clientAddress = splitLineByZip(rawClientAddress);

  let currentDate = lines[2] || 'Date non précisée';

  // For multiple date lines
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
  const trailingPriceRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s*€$/;

  // We'll use a simple flag to know if we’re capturing “Combustion” lines
  let capturingCombustion = false;

  restLines.forEach(line => {
    // If we are currently capturing combustion lines...
    if (capturingCombustion) {
      // Stop capturing if line is blank or matches a recognized pattern
      if (
        !line ||
        dateRegex.test(line) ||
        trailingPriceRegex.test(line) ||
        interventionRegex.test(line) ||
        /^combustion$/i.test(line)
      ) {
        capturingCombustion = false; // stop capturing
        // Process this line as normal, so fall through
      } else {
        // Otherwise, add it to combustionLines
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

    // (C) Check for item line with trailing "XX€"
    const priceMatch = line.match(trailingPriceRegex);
    if (priceMatch) {
      const leftoverDesc = priceMatch[1].trim();
      const totalNum = parseFloat(priceMatch[2]) || 0;
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
      // (D) Just a normal description line
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
    // Adjust operationType if you prefer
    operationType: 'Entretien chaudière gaz',

    // Sender data (Gerard)
    sender: {
      name: 'Courbot Gerard',
      address: '4 rue bourbon\n62690 aubigny en artois',
      phone: '06 70 79 48 67',
      email: 'gerardcourbot@gmail.com'
    },

    // Client
    client: {
      name: clientName,
      address: clientAddress
    },

    // Intervention
    intervention: {
      date: currentDate,
      address: interventionHeader,
      details: descriptionLines
    },

    // Items
    items,

    // Combustion lines (may be empty)
    combustion: {
      lines: combustionLines
    },

    // Payment
    payment: {
      iban: 'FR76 1670 6000 7101 3972 9000 019',
      tvaNote: 'TVA non applicable aer.293B du CGI',
      conditions: '30 jours'
    },

    // Footer
    footer: {
      enterprise: 'Courbot Gerard - micro entreprise',
      fullAddress: '4 rue bourbon 62690 aubigny en artois',
      siret: '538 179 649 00016',
      ape: '4322A'
    }
  };
}

/**
 * parseHourBasedItem('3h*35') -> {description, quantity, unitPrice}
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
  // e.g. "1h30" => 1.5
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
