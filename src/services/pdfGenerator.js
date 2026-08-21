// pdfGenerator.js

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import myLogo from '../styles/logo.png';
import { reserveInvoiceNumbers } from './invoiceNumberStore.js';

const PDF_LAYOUT = {
  leftMargin: 40,
  rightMargin: 40,
  rightBlockX: 380,
  topMarginLogo: 20,
  contactBlockY: 120
};

export function getDocumentLabels(documentType) {
  const normalizedType = normalizeDocumentType(documentType);

  if (normalizedType === 'devis') {
    return {
      type: normalizedType,
      title: 'DEVIS',
      displayName: 'Devis',
      dateLabel: 'Date du devis',
      dueDateLabel: 'Validité du devis',
      filePrefix: 'Devis'
    };
  }

  return {
    type: normalizedType,
    title: 'FACTURE',
    displayName: 'Facture',
    dateLabel: 'Date de facturation',
    dueDateLabel: 'Échéance',
    filePrefix: 'Facture'
  };
}

export function prepareInvoicesForGeneration(invoiceList) {
  const invoices = (invoiceList || []).filter(Boolean);
  if (!invoices.length) {
    return [];
  }

  const missingIndices = invoices
    .map((invoice, index) => (isValidInvoiceNumber(invoice?.invoiceNumber) ? -1 : index))
    .filter(index => index !== -1);

  const reservedNumbers = reserveInvoiceNumbers(missingIndices.length);
  const numberByIndex = new Map();
  missingIndices.forEach((index, position) => {
    numberByIndex.set(index, reservedNumbers[position]);
  });

  return invoices.map((invoice, index) => ensureInvoiceMetadata(invoice, numberByIndex.get(index)));
}

export function generatePdf(invoiceData, options = {}) {
  if (!invoiceData) {
    return null;
  }

  const preparedInvoice = options.skipPrepare
    ? invoiceData
    : ensureInvoiceMetadata(invoiceData, options.fallbackInvoiceNumber);

  if (!preparedInvoice) {
    return null;
  }

  const doc = buildPdfDocument(preparedInvoice);
  const documentLabels = getDocumentLabels(preparedInvoice.documentType);
  if (options.autoSave !== false) {
    doc.save(`${documentLabels.filePrefix}-${preparedInvoice.invoiceNumber}.pdf`);
  }

  return preparedInvoice;
}

export function createPdfBlob(invoiceData) {
  if (!invoiceData) {
    return new Blob([], { type: 'application/pdf' });
  }

  return buildPdfDocument(invoiceData).output('blob');
}

export function generatePdfs(invoiceList) {
  const preparedInvoices = prepareInvoicesForGeneration(invoiceList);
  preparedInvoices.forEach(invoice => {
    generatePdf(invoice, { skipPrepare: true, autoSave: true });
  });
  return preparedInvoices;
}

export function ensureInvoiceMetadata(invoiceData, fallbackInvoiceNumber) {
  if (!invoiceData) {
    return null;
  }

  const assignedInvoiceNumber = isValidInvoiceNumber(invoiceData.invoiceNumber)
    ? Number(invoiceData.invoiceNumber)
    : (isValidInvoiceNumber(fallbackInvoiceNumber)
      ? Number(fallbackInvoiceNumber)
      : reserveInvoiceNumbers(1)[0]);

  const invoiceDate = normalizeDateString(invoiceData.invoiceDate) || getTodayDate();
  const dueDate = normalizeDateString(invoiceData.dueDate) || addDaysToDateString(invoiceDate, 30);

  return {
    ...invoiceData,
    documentType: normalizeDocumentType(invoiceData.documentType),
    invoiceNumber: assignedInvoiceNumber,
    invoiceDate,
    dueDate
  };
}

export function computeInvoiceTotals(items = []) {
  const totalHTValue = items.reduce((sum, item) => {
    return sum + parseEuroValue(item?.total ?? item?.unitPrice ?? 0);
  }, 0);

  return {
    totalHTValue,
    totalHT: formatEuro(totalHTValue),
    tvaRate: '0,00 %',
    tvaAmount: formatEuro(0),
    totalTTC: formatEuro(totalHTValue)
  };
}

function buildPdfDocument(invoiceData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  renderInvoicePdf(doc, invoiceData);
  return doc;
}

function renderInvoicePdf(doc, invoiceData) {
  const {
    sender = {},
    client = {},
    intervention = {},
    items = [],
    combustion = {},
    payment = {},
    footer = {},
    invoiceNumber,
    invoiceDate,
    dueDate,
    documentType
  } = invoiceData;
  const documentLabels = getDocumentLabels(documentType);

  const {
    leftMargin,
    rightMargin,
    rightBlockX,
    topMarginLogo,
    contactBlockY
  } = PDF_LAYOUT;

  if (myLogo) {
    doc.addImage(myLogo, 'PNG', leftMargin, topMarginLogo, 40, 40);
  }

  let invoiceBlockY = topMarginLogo + 10;
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.text(`${documentLabels.title} - ${invoiceNumber}`, rightBlockX, invoiceBlockY);

  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  invoiceBlockY += 15;
  doc.text(`${documentLabels.dateLabel}: ${invoiceDate}`, rightBlockX, invoiceBlockY);
  invoiceBlockY += 12;
  doc.text(`${documentLabels.dueDateLabel}: ${dueDate}`, rightBlockX, invoiceBlockY);

  doc.setFontSize(11);
  doc.setFont('Helvetica', 'bold');
  doc.text(sender.name || '', leftMargin, contactBlockY);

  doc.setFont('Helvetica', 'normal');
  const senderLines = [
    ...(sender.address ? String(sender.address).split('\n') : []),
    sender.phone || '',
    sender.email || ''
  ].filter(Boolean);

  let senderY = contactBlockY + 16;
  senderLines.forEach(line => {
    doc.text(line, leftMargin, senderY);
    senderY += 14;
  });

  const recipientX = leftMargin + 290;
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'bold');
  doc.text(client.name || '', recipientX, contactBlockY);

  doc.setFont('Helvetica', 'normal');
  const clientAddressLines = client.address ? String(client.address).split('\n') : [];
  let clientY = contactBlockY + 16;
  clientAddressLines.forEach(line => {
    doc.text(line, recipientX, clientY);
    clientY += 14;
  });

  let currentY = Math.max(senderY, clientY) + 40;

  doc.setFontSize(11);
  const wrappedIntervention = doc.splitTextToSize(intervention.address || '', 300);
  wrappedIntervention.forEach((line, index) => {
    doc.text(line, leftMargin, currentY + index * 14);
  });
  currentY += wrappedIntervention.length * 14 + 10;

  const descriptions = intervention.descriptions || [];
  if (descriptions.length > 0) {
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');

    descriptions.forEach(entry => {
      if (entry.date && entry.date !== '-') {
        doc.text(entry.date, leftMargin, currentY);
        currentY += 14;
      }

      const wrappedDescription = doc.splitTextToSize(entry.description || '', 500);
      wrappedDescription.forEach((descriptionLine, index) => {
        doc.text(descriptionLine, leftMargin + 20, currentY + index * 12);
      });
      currentY += wrappedDescription.length * 12 + 10;
    });
  }

  currentY += 10;
  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Date', 'Qté', 'Unité', 'Prix unitaire', 'TVA', 'Montant']],
    body: items.map(item => [
      cleanPdfText(item?.description || ''),
      item?.date && item.date !== '-' ? item.date : '-',
      item?.quantity || '1,00',
      item?.unit || 'pce',
      item?.unitPrice || formatEuro(0),
      'Non applicable',
      item?.total || formatEuro(0)
    ]),
    styles: {
      fontSize: 11,
      cellPadding: 8
    },
    headStyles: {
      fillColor: [200, 200, 200]
    },
    margin: {
      left: leftMargin,
      right: rightMargin
    },
    tableWidth: 'auto',
    columnStyles: {
      0: { cellWidth: 135 },
      1: { cellWidth: 58 },
      2: { cellWidth: 38 },
      3: { cellWidth: 42 },
      4: { cellWidth: 68 },
      5: { cellWidth: 66 },
      6: { cellWidth: 68 }
    }
  });

  let finalY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 30 : currentY + 40;
  const combustionTopY = finalY;

  let combustionBottomY = combustionTopY;
  if (Array.isArray(combustion.lines) && combustion.lines.length > 0) {
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');

    doc.text('Combustion', leftMargin, combustionTopY);
    let combustionY = combustionTopY + 12;

    combustion.lines.forEach(line => {
      doc.text(line, leftMargin, combustionY);
      combustionY += 12;
    });

    combustionY += 6;
    combustionBottomY = combustionY;
  }

  const totals = computeInvoiceTotals(items);
  let totalsY = combustionTopY;
  doc.setFontSize(12);
  doc.text(`Total HT: ${totals.totalHT}`, rightBlockX, totalsY);
  totalsY += 14;
  doc.text(`TVA ${totals.tvaRate}: ${totals.tvaAmount}`, rightBlockX, totalsY);
  totalsY += 14;
  doc.text(`Total TTC: ${totals.totalTTC}`, rightBlockX, totalsY);
  totalsY += 6;

  const blockBottomY = Math.max(combustionBottomY, totalsY);

  let paymentY = blockBottomY + 30;
  doc.setFontSize(10);
  doc.text('Moyens de paiement:', leftMargin, paymentY);
  paymentY += 12;
  doc.text(`IBAN: ${payment.iban || ''}`, leftMargin, paymentY);
  paymentY += 12;

  if (payment.tvaNote) {
    doc.text(String(payment.tvaNote), leftMargin, paymentY);
    paymentY += 12;
  }

  doc.text(`Conditions de paiement: ${payment.conditions || ''}`, leftMargin, paymentY);
  paymentY += 12;

  if (payment.discount) {
    doc.text(String(payment.discount), leftMargin, paymentY);
    paymentY += 12;
  }

  if (payment.lateFees) {
    doc.text(String(payment.lateFees), leftMargin, paymentY);
    paymentY += 12;
  }

  if (payment.recoveryFee) {
    doc.text(String(payment.recoveryFee), leftMargin, paymentY);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');

  const footerText = [
    footer.enterprise || '',
    footer.fullAddress || '',
    `Numéro de SIRET: ${footer.siret || ''} - APE ${footer.ape || ''}`
  ].join('\n');

  const footerLines = doc.splitTextToSize(footerText, 500);
  footerLines.forEach((line, index) => {
    doc.text(line, leftMargin, pageHeight - 60 + index * 12);
  });
}

function cleanPdfText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDocumentType(value) {
  return value === 'devis' ? 'devis' : 'facture';
}

function isValidInvoiceNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0;
}

function parseEuroValue(value) {
  if (typeof value === 'number') {
    return value;
  }

  const normalized = String(value || '')
    .replace(/\u20AC|eur/gi, '')
    .replace(',', '.')
    .replace(/\s/g, '')
    .trim();

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEuro(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} \u20AC`;
}

function normalizeDateString(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return '';
  }

  return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`;
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
