import React, { useEffect, useState } from 'react';
import { createPdfBlob } from '../services/pdfGenerator.js';

function InvoicePreview({ invoiceData }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!invoiceData) {
      setPreviewUrl('');
      return undefined;
    }

    const blob = createPdfBlob({
      ...invoiceData,
      invoiceNumber: invoiceData.invoiceNumber || 'Brouillon'
    });
    const objectUrl = URL.createObjectURL(blob);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [invoiceData]);

  if (!invoiceData) return null;

  return (
    <div className="pdf-preview-frame">
      {previewUrl ? (
        <iframe
          title="Aperçu exact du document PDF"
          src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        />
      ) : (
        <div className="pdf-preview-loading">Préparation de l’aperçu…</div>
      )}
    </div>
  );
}

export default InvoicePreview;
