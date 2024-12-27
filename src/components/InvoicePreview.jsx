import React from 'react';

function InvoicePreview({ invoiceData }) {
  if (!invoiceData) return null;

  const {
    sender, client, intervention, items,
    operationType, payment, footer, combustion
  } = invoiceData;

  const invoiceNumber = invoiceData.invoiceNumber || 'N/A';
  const invoiceDate = invoiceData.invoiceDate || 'N/A';
  const dueDate = invoiceData.dueDate || 'N/A';

  let totalHTNum = 0;
  items.forEach(item => {
    const numericVal = parseFloat(item.total.replace(',', '.')) || 0;
    totalHTNum += numericVal;
  });
  const totalHT = formatEuro(totalHTNum);
  const tvaRate = '0,00 %';
  const tvaAmount = '0,00 €';
  const totalTTC = totalHT;

  return (
    <div style={styles.previewContainer}>
      {/* Header: Sender and Receiver */}
      <div style={styles.header}>
        <div style={styles.block}>
          {/* Gerard in normal font */}
          <div>{sender.name}</div>
          <div>{sender.address}</div>
          <div>{sender.phone}</div>
          <div>{sender.email}</div>
        </div>
        <div style={styles.block}>
          {/* Invoice Info in top-right */}
          <div style={{ textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold' }}>
            FACTURE - {invoiceNumber}
          </div>
          <div style={styles.smallText}>Date de facturation: {invoiceDate}</div>
          <div style={styles.smallText}>Échéance: {dueDate}</div>
          <div style={styles.smallText}>Type d'opération: {operationType}</div>
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <strong>{client.name}</strong><br />
            {client.address.split('\n').map((addrLine, i) => (
              <div key={i}>{addrLine}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Intervention */}
      <div style={styles.interventionBlock}>
        <div>{intervention.address}</div>
        {intervention.details.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      {/* Items Table */}
      <table style={styles.itemTable}>
        <thead>
          <tr>
            <th>Description</th>
            <th>Date</th>
            <th>Qté</th>
            <th>Unité</th>
            <th>Prix unitaire</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td>{item.date}</td>
              <td>{item.quantity}</td>
              <td>{item.unit}</td>
              <td>{item.unitPrice}</td>
              <td>{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Combustion Info (only if it exists) */}
      {combustion?.lines?.length > 0 && (
        <div style={styles.combustionBlock}>
          <strong>Combustion:</strong>
          {combustion.lines.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div style={styles.totalsBlock}>
        <div>Total HT: {totalHT}</div>
        <div>TVA {tvaRate}: {tvaAmount}</div>
        <div>Total TTC: {totalTTC}</div>
      </div>

      {/* Payment */}
      <div style={styles.paymentBlock}>
        <strong>Moyens de paiement:</strong><br />
        IBAN: {payment.iban}<br />
        {payment.tvaNote}<br />
        Conditions de paiement: {payment.conditions}
      </div>

      {/* Footer */}
      <div style={styles.footerBlock}>
        <div>{footer.enterprise}</div>
        <div>{footer.fullAddress}</div>
        <div>Numéro de SIRET: {footer.siret} - APE {footer.ape}</div>
      </div>
    </div>
  );
}

export default InvoicePreview;

/** Helpers */
function formatEuro(num) {
  return num.toFixed(2).replace('.', ',') + ' €';
}

/** Some quick inline styles */
const styles = {
  previewContainer: {
    background: '#fefefe',
    padding: '1rem',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
  },
  block: {
    maxWidth: '45%',
  },
  smallText: {
    fontSize: '0.85rem',
    color: '#666',
    textAlign: 'right',
  },
  interventionBlock: {
    marginBottom: '1rem',
  },
  itemTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '1rem',
  },
  combustionBlock: {
    marginTop: '1rem',
  },
  totalsBlock: {
    textAlign: 'right',
    marginBottom: '1rem',
  },
  paymentBlock: {
    marginBottom: '1rem',
  },
  footerBlock: {
    marginTop: '1rem',
    fontSize: '0.8rem',
    color: '#666',
  },
};
