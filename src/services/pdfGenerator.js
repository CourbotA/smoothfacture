// pdfGenerator.js

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import myLogo from '../styles/logo.png'; // Adjust the path as necessary

let invoiceCounter = 58; // Start numbering

export function generatePdf(invoiceData) {
  try {
    // Destructure necessary fields from invoiceData
    const {
      sender,
      client,
      intervention,
      items = [], // Default to empty array if undefined
      combustion,
      operationType,
      payment,
      footer
    } = invoiceData;

    // 1) Increment invoice number & set today's date
    invoiceData.invoiceNumber = ++invoiceCounter;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    invoiceData.invoiceDate = `${day}/${month}/${year}`;

    // 2) Due date = +30 days
    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    const dday = String(due.getDate()).padStart(2, '0');
    const dmonth = String(due.getMonth() + 1).padStart(2, '0');
    const dyear = due.getFullYear();
    invoiceData.dueDate = `${dday}/${dmonth}/${dyear}`;

    // 3) Create doc
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const leftMargin = 40;  
    const topMarginLogo = 20;

    // 4) Place Logo (optional)
    if (myLogo) { // Ensure logo exists
      doc.addImage(myLogo, 'PNG', leftMargin, topMarginLogo, 40, 40);
    }

    // 5) Invoice Title & Dates (top-right)
    const rightBlockX = 380; 
    let invoiceBlockY = topMarginLogo + 10;

    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text(`FACTURE - ${invoiceData.invoiceNumber}`, rightBlockX, invoiceBlockY);

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    invoiceBlockY += 15;

    // Extract necessary variables
    const invoiceDate = invoiceData.invoiceDate || 'N/A';
    const dueDate = invoiceData.dueDate || 'N/A';
    const opType = operationType || 'N/A';

    doc.text(`Date de facturation: ${invoiceDate}`, rightBlockX, invoiceBlockY);
    invoiceBlockY += 12;
    doc.text(`Échéance: ${dueDate}`, rightBlockX, invoiceBlockY);
    invoiceBlockY += 12;
    doc.text(`Type d'opération: ${opType}`, rightBlockX, invoiceBlockY);

    // 6) Sender & Recipient side by side
    const contactBlockY = 120;

    // --- Sender block ---
    // Sender Name in BOLD
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text(sender.name, leftMargin, contactBlockY);

    // Sender address, phone, email in NORMAL, each on separate lines
    doc.setFont('Helvetica', 'normal');
    const senderLines = sender.address.split('\n');
    if (sender.phone) senderLines.push(sender.phone);
    if (sender.email) senderLines.push(sender.email);
    let senderY = contactBlockY + 16;  
    senderLines.forEach(line => {
      doc.text(line, leftMargin, senderY);
      senderY += 14;
    });

    // --- Recipient block ---
    const recipientX = leftMargin + 290;
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text(client.name, recipientX, contactBlockY);

    doc.setFont('Helvetica', 'normal');

    // The parser ensures the address might have a newline if zip code is found
    const clientAddressLines = client.address.split('\n');
    let clientY = contactBlockY + 16;
    clientAddressLines.forEach(line => {
      doc.text(line, recipientX, clientY);
      clientY += 14;  
    });

    // 7) Intervention / Description block
    // Move below whichever block is taller
    let currentY = Math.max(senderY, clientY) + 40; 
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');

    const wrappedIntervention = doc.splitTextToSize(intervention.address, 300);
    wrappedIntervention.forEach((line, idx) => {
      doc.text(line, leftMargin, currentY + idx * 14);
    });
    currentY += wrappedIntervention.length * 14 + 10; // Added 10 for spacing after intervention address

    // Include Descriptions with Dates
    if (intervention.descriptions && intervention.descriptions.length > 0) {
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      intervention.descriptions.forEach(entry => {
        if (entry.date !== '-') {
          doc.text(entry.date, leftMargin, currentY);
          currentY += 14; // Move below the date
        }
        const wrappedDescription = doc.splitTextToSize(entry.description, 500);
        wrappedDescription.forEach((descLine, idx) => {
          doc.text(descLine, leftMargin + 20, currentY + idx * 12); // Indent description
        });
        currentY += wrappedDescription.length * 12 + 10; // Add spacing after description
      });
    }

    // 8) Items Table
    currentY += 10; // Additional spacing before table
    const tableBody = items.map(item => [
      item.description.replace(/€/g, ''), 
      item.date !== '-' ? item.date : '-', // Use date or '-' if not available
      item.quantity,
      item.unit,
      item.unitPrice,
      item.total
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Description', 'Date', 'Qté', 'Unité', 'Prix unitaire', 'Montant']],
      body: tableBody,
      styles: {
        fontSize: 11,
        cellPadding: 8,
      },
      headStyles: { fillColor: [200, 200, 200] },
      margin: { left: leftMargin, right: 40 },
      tableWidth: 'auto', // Changed from fixed to 'auto' for better responsiveness
      columnStyles: {
        0: { cellWidth: 160 },
        1: { cellWidth: 70 },
        2: { cellWidth: 50 },
        3: { cellWidth: 50 },
        4: { cellWidth: 80 },
        5: { cellWidth: 80 },
      },
    });

    // After table
    let finalY = doc.lastAutoTable.finalY + 30;

    // 9) Print "Combustion" on the left, Totals on the right at the SAME top level
    let combustionBlockTopY = finalY;  // The top of our side-by-side layout

    // (A) Combustion on the LEFT
    let combustionBlockBottomY = combustionBlockTopY; 
    if (combustion && combustion.lines?.length > 0) {
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');

      doc.text('Combustion', leftMargin, combustionBlockTopY);
      let cY = combustionBlockTopY + 12;

      combustion.lines.forEach(line => {
        doc.text(line, leftMargin, cY);
        cY += 12;
      });
      cY += 6;
      combustionBlockBottomY = cY; // store the final Y
    }

    // (B) Totals on the RIGHT at the SAME top Y
    const totalsX = rightBlockX;
    let totalsY = combustionBlockTopY; // same top
    doc.setFontSize(12);

    // Calculate totals
    let totalHT = 0;
    items.forEach(item => {
      const numeric = parseFloat(item.total.replace(',', '.')) || 0;
      totalHT += numeric;
    });
    const totalHTStr = formatEuro(totalHT);
    const tvaRateStr = '0,00 %';
    const tvaAmountStr = '0,00 €';
    const totalTTCStr = formatEuro(totalHT); // Assuming no TVA

    doc.text(`Total HT: ${totalHTStr}`, totalsX, totalsY);
    totalsY += 14;
    doc.text(`TVA ${tvaRateStr}: ${tvaAmountStr}`, totalsX, totalsY);
    totalsY += 14;
    doc.text(`Total TTC: ${totalTTCStr}`, totalsX, totalsY);
    totalsY += 6;

    // Now let's figure out which block extends further downward
    const blockBottomY = Math.max(combustionBlockBottomY, totalsY);

    // 10) Payment Info
    // We'll continue below both blocks
    let paymentStartY = blockBottomY + 30;
    doc.setFontSize(10);
    doc.text('Moyens de paiement:', leftMargin, paymentStartY);
    paymentStartY += 12;
    doc.text(`IBAN: ${payment.iban}`, leftMargin, paymentStartY);
    paymentStartY += 12;
    if (payment.tvaNote) {
      doc.text(`${payment.tvaNote}`, leftMargin, paymentStartY);
      paymentStartY += 12;
    }
    doc.text(`Conditions de paiement: ${payment.conditions}`, leftMargin, paymentStartY);

    // 11) Footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    const footerText = [
      footer.enterprise,
      footer.fullAddress,
      `Numéro de SIRET: ${footer.siret} - APE ${footer.ape}`
    ].join('\n');

    // Split footer text into lines to handle multiple lines
    const footerLines = doc.splitTextToSize(footerText, 500);
    footerLines.forEach((line, idx) => {
      doc.text(line, leftMargin, pageHeight - 60 + idx * 12);
    });

    // Save the PDF
    doc.save(`Facture-${invoiceData.invoiceNumber}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
    // Optionally, you can notify the user or handle the error as needed
  }
}

/** Helper to format float as "xx,xx €" */
function formatEuro(num) {
  return num.toFixed(2).replace('.', ',') + ' €';
}

/** Helper to format quantity with two decimal places */
function formatQty(num) {
  return num.toFixed(2).replace('.', ',');
}
