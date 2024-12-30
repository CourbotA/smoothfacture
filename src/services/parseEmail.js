// parseEmail.js

/**
 * Reads raw email text and returns a structured invoiceData object.
 * Parses descriptions with interleaved dates and assigns dates to items.
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
  const interventionPlaceLine = lines[2] || 'Intervention inconnue';

  // Initialize variables
  let interventionPlace = ''; 
  const restLines = lines.slice(3); // Start processing from the fourth line

  const descriptionEntries = []; // Array of { date, description }
  const items = [];
  const combustionLines = [];
  let currentDate = ''; // To track the current intervention date
  let capturingCombustion = false;

  // Regex patterns
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})$/i; // Matches dates like 29/11/2024
  const itemPriceRegex = /([\d,\.]+)€$/i; // Matches price at the end of the line
  const itemLineRegex = /^-?\s*(.+)$/; // Matches lines starting with '-' or not

  restLines.forEach(line => {
    // If currently capturing combustion lines
    if (capturingCombustion) {
      if (
        dateRegex.test(line) ||
        itemLineRegex.test(line) ||
        /^Intervention\s+/i.test(line)
      ) {
        capturingCombustion = false;
        // Continue processing this line normally
      } else {
        combustionLines.push(line);
        return; // Skip further checks for this line
      }
    }

    // Check if the line starts the combustion block
    if (!capturingCombustion && /^combustion$/i.test(line)) {
      capturingCombustion = true;
      return;
    }

    // Check if the line specifies the intervention place
    const interventionMatch = line.match(/^Intervention\s+(.*)$/i);
    if (interventionMatch) {
      interventionPlace = interventionMatch[1].trim();
      return;
    }

    // Check if the line is a date
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1]; // e.g., '29/11/2024'
      return;
    }

    // Check if the line is an item
    const itemMatch = line.match(itemLineRegex);
    if (itemMatch) {
      const itemLine = itemMatch[1].trim();
      const parsedItem = parseItemLine(itemLine, currentDate);
      if (parsedItem) {
        items.push(parsedItem);
      } else {
        // If not an item line, treat it as a description
        if (currentDate) {
          const existingEntry = descriptionEntries.find(entry => entry.date === currentDate);
          if (existingEntry) {
            existingEntry.description += `\n${itemLine}`;
          } else {
            descriptionEntries.push({
              date: currentDate,
              description: itemLine
            });
          }
        } else {
          // Description without a date
          descriptionEntries.push({
            date: '-',
            description: line
          });
        }
      }
      return;
    }

    // If none of the above, treat it as a description line without a date
    descriptionEntries.push({
      date: '-',
      description: line
    });
  });

  // Build the Intervention header
  const interventionHeader = `Intervention ${interventionPlaceLine}`;

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
      address: interventionHeader, // e.g., "Intervention Locataire 17A Aubigny-en-artois"
      descriptions: descriptionEntries // Array of { date, description }
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

/**
 * Parses an item line and assigns the current date.
 *
 * @param {string} line - The item line to parse.
 * @param {string} currentDate - The current intervention date.
 * @returns {object|null} - Parsed item object or null if parsing fails.
 */
function parseItemLine(line, currentDate) {
  // Pattern 4: Description followed by quantity*unitPrice€ total€
  const pattern4 = /^(.+?)\s+(\d+)(?:\s*(\w+))?\*([\d,\.]+)€\s+([\d,\.]+)€$/i;
  const match4 = line.match(pattern4);
  if (match4) {
    const description = match4[1].trim();
    const quantity = parseFloat(match4[2].replace(',', '.'));
    const unit = match4[3] ? match4[3].toLowerCase() : 'pce'; // Default to 'pce' if unit is missing
    const unitPrice = parseFloat(match4[4].replace(',', '.'));
    const total = parseFloat(match4[5].replace(',', '.'));

    return {
      description,
      date: currentDate || '-', // Assign currentDate or '-' if not available
      quantity: formatQty(quantity),
      unit,
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(total)
    };
  }

  // Pattern 1: Description followed by quantity, unit, '*', unit price, and total
  const pattern1 = /^(.+?)\s+(\d+[.,]?\d*)\s*(h|pce)\s*\*\s*([\d,\.]+)€\s+([\d,\.]+)€$/i;
  const match1 = line.match(pattern1);
  if (match1) {
    const description = match1[1].trim();
    const quantity = parseFloat(match1[2].replace(',', '.'));
    const unit = match1[3].toLowerCase();
    const unitPrice = parseFloat(match1[4].replace(',', '.'));
    const total = parseFloat(match1[5].replace(',', '.'));

    return {
      description,
      date: currentDate || '-', // Assign currentDate or '-' if not available
      quantity: formatQty(quantity),
      unit,
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(total)
    };
  }

  // Pattern 2: Description followed by unit price only (no quantity/unit)
  const pattern2 = /^(.+?)\s+([\d,\.]+)€$/i;
  const match2 = line.match(pattern2);
  if (match2) {
    const description = match2[1].trim();
    const unitPrice = parseFloat(match2[2].replace(',', '.'));

    return {
      description,
      date: currentDate || '-', // Assign currentDate or '-' if not available
      quantity: '1,00', // Default quantity
      unit: 'pce',      // Default unit
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(unitPrice) // Assuming quantity = 1
    };
  }

  // Pattern 3: Description followed by code and price (e.g., "remplacement robinet WC 12/17   4,50€")
  const pattern3 = /^(.+?)\s+[\d\/]+\s+([\d,\.]+)€$/i;
  const match3 = line.match(pattern3);
  if (match3) {
    const description = match3[1].trim();
    const unitPrice = parseFloat(match3[2].replace(',', '.'));

    return {
      description,
      date: currentDate || '-', // Assign currentDate or '-' if not available
      quantity: '1,00', // Default quantity
      unit: 'pce',      // Default unit
      unitPrice: formatEuro(unitPrice),
      total: formatEuro(unitPrice) // Assuming quantity = 1
    };
  }

  // If no patterns match, return null
  return null;
}

/**
 * Formats a number to "xx,xx €".
 *
 * @param {number} num - The number to format.
 * @returns {string} - Formatted string.
 */
function formatEuro(num) {
  return num.toFixed(2).replace('.', ',') + ' €';
}

/**
 * Formats a quantity to "x,xx".
 *
 * @param {number} num - The quantity to format.
 * @returns {string} - Formatted string.
 */
function formatQty(num) {
  return num.toFixed(2).replace('.', ',');
}
