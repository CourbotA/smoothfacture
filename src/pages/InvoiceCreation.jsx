import React, { useMemo, useState } from 'react';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { parseEmails } from '../services/parseEmail.js';
import {
  computeInvoiceTotals,
  generatePdf,
  generatePdfs,
  getDocumentLabels,
  prepareInvoicesForGeneration
} from '../services/pdfGenerator.js';

const EXAMPLE_TEXT = `Monsieur et Madame Thierry Hornoy
7 rue de la Barre 62180 Neuville-Saint-Vaast

Le 19 mai 2026

Intervention 61 avenue du 4 septembre Lens appartement numéro 5

Remplacement WC fourni par le client
Une sortie WC 12 €
Meuble déplacement 48 €`;

function Icon({ name, size = 20 }) {
  const paths = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></>,
    quote: <><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h4c0 4-1 5-5 6v2Z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h4c0 4-1 5-5 6v2Z"/></>,
    sparkles: <><path d="m12 3-1.2 3.2L8 7.5l2.8 1.3L12 12l1.2-3.2L16 7.5l-2.8-1.3L12 3Z"/><path d="m5 13-.8 2.2L2 16l2.2.8L5 19l.8-2.2L8 16l-2.2-.8L5 13ZM19 13l-.8 2.2L16 16l2.2.8L19 19l.8-2.2L22 16l-2.2-.8L19 13Z"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></>,
    tools: <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3"/>,
    euro: <><path d="M18 7.5a7 7 0 1 0 0 9M5 10h9M5 14h8"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
    back: <path d="m15 18-6-6 6-6"/>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>
  };

  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function InvoiceCreation() {
  const [rawText, setRawText] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [documentType, setDocumentType] = useState('facture');
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');

  const labels = getDocumentLabels(documentType);
  const activeInvoice = invoices[activeIndex];
  const totals = useMemo(() => computeInvoiceTotals(activeInvoice?.items || []), [activeInvoice]);

  const selectDocumentType = nextType => {
    setDocumentType(nextType);
    setInvoices(current => current.map(invoice => ({ ...invoice, documentType: nextType })));
    setDownloadMessage('');
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      setErrorMessage('Ajoutez quelques informations avant de continuer.');
      return;
    }

    const parsed = parseEmails(rawText).map(invoice => ({ ...invoice, documentType }));
    if (!parsed.length) {
      setErrorMessage('Nous n’avons pas réussi à lire ces informations. Ajoutez au moins le nom du client, son adresse et une prestation.');
      return;
    }

    setInvoices(parsed);
    setActiveIndex(0);
    setEditing(false);
    setErrorMessage('');
    setDownloadMessage('');
    window.setTimeout(() => document.getElementById('resultat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const handleReset = () => {
    setInvoices([]);
    setEditing(false);
    setDownloadMessage('');
    window.setTimeout(() => document.getElementById('saisie')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const handleGenerateOne = () => {
    if (!activeInvoice) return;
    const prepared = prepareInvoicesForGeneration([activeInvoice])[0];
    if (!prepared) return;

    generatePdf(prepared, { skipPrepare: true, autoSave: true });
    setInvoices(current => current.map((invoice, index) => index === activeIndex ? prepared : invoice));
    setDownloadMessage(`${getDocumentLabels(prepared.documentType).displayName} téléchargé${prepared.documentType === 'facture' ? 'e' : ''}.`);
  };

  const handleGenerateAll = () => {
    const generated = generatePdfs(invoices);
    setInvoices(generated);
    setDownloadMessage(`${generated.length} documents téléchargés.`);
  };

  const updateActiveInvoice = updater => {
    setInvoices(current => current.map((invoice, index) => index === activeIndex ? updater(invoice) : invoice));
    setDownloadMessage('');
  };

  const updateSection = (section, field, value) => {
    updateActiveInvoice(invoice => ({ ...invoice, [section]: { ...(invoice[section] || {}), [field]: value } }));
  };

  const updateItem = (itemIndex, field, value) => {
    updateActiveInvoice(invoice => ({
      ...invoice,
      items: invoice.items.map((item, index) => index === itemIndex ? { ...item, [field]: value } : item)
    }));
  };

  const removeItem = itemIndex => {
    updateActiveInvoice(invoice => ({ ...invoice, items: invoice.items.filter((_, index) => index !== itemIndex) }));
  };

  const addItem = () => {
    updateActiveInvoice(invoice => ({
      ...invoice,
      items: [...invoice.items, { description: '', date: invoice.invoiceDate || '-', quantity: '1,00', unit: 'pce', unitPrice: '0,00 €', total: '0,00 €' }]
    }));
  };

  return (
    <>
      <section className="hero" id="saisie">
        <div className="hero-copy">
          <span className="eyebrow"><Icon name="sparkles" size={16} /> Simple, rapide, professionnel</span>
          <h1>Vos factures,<br /><em>sans prise de tête.</em></h1>
          <p>Écrivez simplement les informations du chantier. Smoothfacture les organise et prépare un document propre pour vous.</p>
          <div className="trust-row"><span><Icon name="check" size={15} /> Aucun formulaire compliqué</span><span><Icon name="check" size={15} /> PDF prêt à envoyer</span></div>
        </div>

        <div className="composer-card">
          <div className="composer-heading">
            <span className="step-number">1</span>
            <div><h2>Que souhaitez-vous créer&nbsp;?</h2><p>Choisissez votre document.</p></div>
          </div>

          <div className="document-switch" role="radiogroup" aria-label="Type de document">
            <button className={documentType === 'facture' ? 'active' : ''} onClick={() => selectDocumentType('facture')} role="radio" aria-checked={documentType === 'facture'}>
              <Icon name="file" /><span><strong>Une facture</strong><small>Pour un travail réalisé</small></span><i><Icon name="check" size={14} /></i>
            </button>
            <button className={documentType === 'devis' ? 'active' : ''} onClick={() => selectDocumentType('devis')} role="radio" aria-checked={documentType === 'devis'}>
              <Icon name="quote" /><span><strong>Un devis</strong><small>Pour proposer un prix</small></span><i><Icon name="check" size={14} /></i>
            </button>
          </div>

          <div className="composer-heading second-step">
            <span className="step-number">2</span>
            <div><h2>Décrivez le chantier</h2><p>Écrivez comme dans un message. L’ordre n’a pas d’importance.</p></div>
          </div>

          <div className={`textarea-wrap ${errorMessage ? 'has-error' : ''}`}>
            <textarea value={rawText} onChange={event => { setRawText(event.target.value); setErrorMessage(''); }} placeholder={EXAMPLE_TEXT} aria-label="Informations de la facture ou du devis" rows={11} />
            <span className="textarea-hint"><Icon name="info" size={14} /> Vous pouvez copier-coller un SMS, un e-mail ou vos notes.</span>
          </div>

          <div className="recognized-hints" aria-label="Informations utiles">
            <span><Icon name="user" size={14} /> Client</span><span><Icon name="pin" size={14} /> Adresse</span><span><Icon name="tools" size={14} /> Travaux</span><span><Icon name="euro" size={14} /> Prix</span>
          </div>
          {errorMessage && <div className="form-error" role="alert">{errorMessage}</div>}

          <button className="primary-action" onClick={handleParse} disabled={!rawText.trim()}><Icon name="sparkles" /> Créer {documentType === 'facture' ? 'ma facture' : 'mon devis'} <Icon name="arrow" /></button>
          <p className="privacy-note">Vos informations restent sur cet appareil.</p>
        </div>
      </section>

      {activeInvoice && (
        <section className="result-section" id="resultat">
          <div className="result-header">
              <div><span className="success-kicker"><Icon name="check" size={15} /> Informations reconnues</span><h2>Votre {labels.displayName.toLowerCase()} est {documentType === 'devis' ? 'prêt' : 'prête'}.</h2><p>Vérifiez rapidement les informations, puis téléchargez le PDF.</p></div>
            <button className="text-button" onClick={handleReset}><Icon name="back" size={17} /> Modifier mon texte</button>
          </div>

          {invoices.length > 1 && (
            <div className="document-tabs" aria-label="Documents détectés">
              {invoices.map((invoice, index) => <button key={`${invoice.client?.name}-${index}`} className={activeIndex === index ? 'active' : ''} onClick={() => { setActiveIndex(index); setEditing(false); }}>{index + 1}. {invoice.client?.name || 'Client'}</button>)}
            </div>
          )}

          <div className="verification-grid">
            <SummaryCard icon="user" label="Client" title={activeInvoice.client?.name} lines={activeInvoice.client?.address} />
            <SummaryCard icon="pin" label="Intervention" title={activeInvoice.intervention?.address?.replace(/^Intervention\s*/i, '') || 'Adresse non précisée'} lines={activeInvoice.invoiceDate ? `Le ${activeInvoice.invoiceDate}` : ''} />
            <SummaryCard icon="tools" label="Prestations" title={`${activeInvoice.items?.length || 0} ligne${activeInvoice.items?.length > 1 ? 's' : ''} facturée${activeInvoice.items?.length > 1 ? 's' : ''}`} lines={(activeInvoice.items || []).map(item => item.description).join(' · ')} />
            <SummaryCard icon="euro" label="Total" title={totals.totalTTC} lines="TVA non applicable" accent />
          </div>

          <div className="result-actions">
            <button className="secondary-action" onClick={() => setEditing(value => !value)}><Icon name="edit" size={18} /> {editing ? 'Fermer les corrections' : 'Corriger les informations'}</button>
            {invoices.length > 1 && <button className="secondary-action" onClick={handleGenerateAll}><Icon name="download" size={18} /> Tout télécharger</button>}
            <button className="download-action" onClick={handleGenerateOne}><Icon name="download" /> Télécharger le PDF</button>
          </div>
          {downloadMessage && <div className="download-message" role="status"><Icon name="check" size={16} /> {downloadMessage}</div>}

          {editing && (
            <div className="edit-panel">
              <div className="edit-panel-heading"><div><span>Corrections</span><h3>Modifiez uniquement ce qui est nécessaire</h3></div><span className="saved-label"><Icon name="check" size={14} /> Modifications enregistrées</span></div>
              <div className="edit-fields">
                <label>Nom du client<input value={activeInvoice.client?.name || ''} onChange={e => updateSection('client', 'name', e.target.value)} /></label>
                <label>Adresse du client<textarea rows="2" value={activeInvoice.client?.address || ''} onChange={e => updateSection('client', 'address', e.target.value)} /></label>
                <label>Lieu de l’intervention<input value={activeInvoice.intervention?.address || ''} onChange={e => updateSection('intervention', 'address', e.target.value)} /></label>
                <label>Date<input value={activeInvoice.invoiceDate || ''} onChange={e => updateActiveInvoice(invoice => ({ ...invoice, invoiceDate: e.target.value }))} placeholder="JJ/MM/AAAA" /></label>
              </div>
              <div className="items-editor">
                <div className="items-editor-title"><h4>Prestations et prix</h4><button onClick={addItem}><Icon name="plus" size={15} /> Ajouter une ligne</button></div>
                {(activeInvoice.items || []).map((item, index) => (
                  <div className="item-edit-row" key={`edit-${index}`}>
                    <label>Description<input value={item.description || ''} onChange={e => updateItem(index, 'description', e.target.value)} /></label>
                    <label>Qté<input value={item.quantity || '1,00'} onChange={e => updateItem(index, 'quantity', e.target.value)} /></label>
                    <label>Unité<select value={item.unit || 'pce'} onChange={e => updateItem(index, 'unit', e.target.value)}><option value="pce">Pièce</option><option value="h">Heure</option><option value="forfait">Forfait</option></select></label>
                    <label>Prix unitaire<input value={item.unitPrice || ''} onChange={e => updateItem(index, 'unitPrice', e.target.value)} /></label>
                    <label>Total<input value={item.total || ''} onChange={e => updateItem(index, 'total', e.target.value)} /></label>
                    <button className="delete-item" onClick={() => removeItem(index)} aria-label={`Supprimer ${item.description || 'cette ligne'}`}><Icon name="trash" size={17} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="preview-block">
            <div className="preview-toolbar"><div><span className="preview-dot" /> Aperçu du document</div><span>Format A4 · PDF</span></div>
            <div className="preview-canvas"><InvoicePreview invoiceData={activeInvoice} /></div>
          </div>
        </section>
      )}
    </>
  );
}

function SummaryCard({ icon, label, title, lines, accent = false }) {
  return <article className={`summary-card ${accent ? 'accent' : ''}`}><span className="summary-icon"><Icon name={icon} size={19} /></span><div><small>{label}</small><strong>{title || 'Non renseigné'}</strong>{lines && <p>{lines}</p>}</div></article>;
}

export default InvoiceCreation;
