import React, { useState } from 'react';
import { parseEmail } from '../services/parseEmail';
import { generatePdf } from '../services/pdfGenerator';
import InvoicePreview from '../components/InvoicePreview';

function InvoiceCreation() {
  const [rawEmailText, setRawEmailText] = useState('');
  const [invoiceData, setInvoiceData] = useState(null);

  const handleParse = () => {
    const parsedData = parseEmail(rawEmailText);
    setInvoiceData(parsedData);
  };

  const handleGenerate = () => {
    if (invoiceData) {
      generatePdf(invoiceData);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Invoice Creation</h2>

      <div style={styles.inputSection}>
        <label style={styles.label}>Paste email text:</label>
        <textarea
          style={styles.textarea}
          rows={8}
          value={rawEmailText}
          onChange={(e) => setRawEmailText(e.target.value)}
          placeholder="Paste email text here..."
        />
        <button style={styles.parseButton} onClick={handleParse}>
          Parse Email
        </button>
      </div>

      {invoiceData && (
        <div style={styles.previewSection}>
          {/* Show an HTML preview of invoiceData */}
          <h3 style={{ marginBottom: '0.5rem' }}>Invoice Preview</h3>
          <InvoicePreview invoiceData={invoiceData} />

          <button style={styles.generateButton} onClick={handleGenerate}>
            Generate PDF
          </button>
        </div>
      )}
    </div>
  );
}

export default InvoiceCreation;

// Example inline styles (you could move these into a CSS file)
const styles = {
  container: {
    maxWidth: '800px',
    margin: '20px auto',
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    padding: '1rem',
    background: '#f8f8f8',
    borderRadius: '6px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
  },
  title: {
    textAlign: 'center',
    marginBottom: '1rem',
  },
  inputSection: {
    marginBottom: '2rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '600',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '4px',
    borderColor: '#ccc',
    fontFamily: 'inherit',
    minHeight: '100px',
    boxSizing: 'border-box',
  },
  parseButton: {
    display: 'inline-block',
    marginTop: '0.75rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#0275d8',
    color: '#fff',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
  },
  previewSection: {
    background: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  },
  generateButton: {
    display: 'inline-block',
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#5cb85c',
    color: '#fff',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
  },
};
