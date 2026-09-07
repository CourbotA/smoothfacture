import React, { useEffect, useMemo, useRef, useState } from 'react';
import InvoicePreview from '../components/InvoicePreview.jsx';
import { interpretInvoiceInput } from '../services/parseEmail.js';
import {
  computeInvoiceTotals,
  formatEuro,
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
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></>
  };

  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function InvoiceCreation() {
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState([]);
  const [documentType, setDocumentType] = useState('facture');
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState('');
  const [reviewEdits, setReviewEdits] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [speechSupport, setSpeechSupport] = useState('checking');
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const recognitionRef = useRef(null);

  const labels = getDocumentLabels(documentType);
  const activeResult = results[activeIndex];
  const activeInvoice = activeResult?.invoice;
  const activeQuestions = activeResult?.interpretation?.questions || [];
  const totals = useMemo(() => computeInvoiceTotals(activeInvoice?.items || []), [activeInvoice]);
  const allReady = results.length > 0 && results.every(result => !result.interpretation.questions.length);

  useEffect(() => {
    const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    setSpeechSupport(supported ? 'supported' : 'unsupported');
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const selectDocumentType = nextType => {
    setDocumentType(nextType);
    setResults(current => current.map(result => ({ ...result, invoice: { ...result.invoice, documentType: nextType } })));
    setDownloadMessage('');
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      setErrorMessage('Ajoutez quelques informations avant de continuer.');
      return;
    }

    const parsed = interpretInvoiceInput(rawText).map(result => ({
      ...result,
      invoice: { ...result.invoice, documentType }
    }));
    if (!parsed.length) {
      setErrorMessage('Nous n’avons rien reconnu pour le moment. Ajoutez un nom, une adresse, des travaux ou un prix.');
      return;
    }

    setResults(parsed);
    setActiveIndex(0);
    setEditing(false);
    setEditingQuestionId('');
    setReviewEdits({});
    setErrorMessage('');
    setDownloadMessage('');
    window.setTimeout(() => document.getElementById('resultat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const toggleVoice = () => {
    if (listening) {
      setVoiceMessage('Finalisation de la dictée…');
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage('La dictée n’est pas disponible dans ce navigateur. Vous pouvez toujours écrire ou coller vos notes.');
      return;
    }

    const recognition = new SpeechRecognition();
    const startingText = rawText.trim();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setVoiceMessage('Parlez naturellement…');
    };
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim();
      setRawText([startingText, transcript].filter(Boolean).join(startingText ? '\n' : ''));
      setErrorMessage('');
    };
    recognition.onerror = event => {
      setVoiceMessage(getSpeechErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      setVoiceMessage(current => ['Parlez naturellement…', 'Finalisation de la dictée…'].includes(current) ? 'Dictée ajoutée. Vous pouvez relire ou modifier le texte.' : current);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceMessage('Impossible de démarrer le microphone. Réessayez ou continuez au clavier.');
    }
  };

  const handleReset = () => {
    setResults([]);
    setEditing(false);
    setDownloadMessage('');
    window.setTimeout(() => document.getElementById('saisie')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const updateActiveResult = updater => {
    setResults(current => current.map((result, index) => index === activeIndex ? updater(result) : result));
    setDownloadMessage('');
  };

  const resolveQuestion = (questionId, invoiceUpdater = invoice => invoice) => {
    updateActiveResult(result => {
      const question = result.interpretation.questions.find(candidate => candidate.id === questionId);
      return {
        ...result,
        invoice: invoiceUpdater(result.invoice),
        interpretation: {
          ...result.interpretation,
          questions: result.interpretation.questions.filter(candidate => candidate.id !== questionId),
          missingFields: result.interpretation.missingFields.filter(field => field.field !== question?.field)
        }
      };
    });
    setEditingQuestionId('');
  };

  const saveQuestionValue = question => {
    const value = String(reviewEdits[question.id] ?? question.value ?? '').trim();
    if (!value) return;

    if (question.kind === 'missing_price') {
      const price = parsePrice(value);
      if (!Number.isFinite(price)) return;
      resolveQuestion(question.id, invoice => ({
        ...invoice,
        items: invoice.items.map(item => item.id === question.itemId ? { ...item, unitPrice: formatEuro(price), total: formatEuro(price * parseQuantity(item.quantity)), hasExplicitPrice: true } : item)
      }));
      return;
    }

    if (question.itemId) {
      resolveQuestion(question.id, invoice => ({ ...invoice, items: invoice.items.map(item => item.id === question.itemId ? { ...item, description: value } : item) }));
      return;
    }

    if (question.field === 'client.name' || question.field === 'client.address') {
      const field = question.field.split('.')[1];
      resolveQuestion(question.id, invoice => ({ ...invoice, client: { ...invoice.client, [field]: value } }));
      return;
    }

    if (question.field === 'intervention.workDate') {
      resolveQuestion(question.id, invoice => ({
        ...invoice,
        intervention: { ...invoice.intervention, workDate: { value, displayValue: value, precision: 'user_supplied', sourceText: value } },
        items: invoice.items.map(item => ({ ...item, date: value }))
      }));
    }
  };

  const includeWithoutPrice = question => {
    resolveQuestion(question.id, invoice => ({
      ...invoice,
      items: invoice.items.map(item => item.id === question.itemId ? { ...item, includedWithoutPrice: true } : item)
    }));
  };

  const discardQuestionItem = question => {
    updateActiveResult(result => {
      const items = result.invoice.items.filter(item => item.id !== question.itemId);
      const remainingQuestions = result.interpretation.questions.filter(candidate => candidate.itemId !== question.itemId);
      if (!items.length && !remainingQuestions.some(candidate => candidate.field === 'items')) {
        remainingQuestions.push({ id: 'missing-items', kind: 'missing_field', field: 'items', prompt: 'Quels travaux faut-il faire apparaître ?', value: '', blocking: true });
      }
      return { ...result, invoice: { ...result.invoice, items }, interpretation: { ...result.interpretation, questions: remainingQuestions } };
    });
  };

  const updateInvoice = (invoiceUpdater, resolvedQuestion = () => false) => {
    updateActiveResult(result => {
      const removedQuestions = result.interpretation.questions.filter(resolvedQuestion);
      const resolvedFields = new Set(removedQuestions.map(question => question.field).filter(Boolean));
      return {
        ...result,
        invoice: invoiceUpdater(result.invoice),
        interpretation: {
          ...result.interpretation,
          questions: result.interpretation.questions.filter(question => !resolvedQuestion(question)),
          missingFields: result.interpretation.missingFields.filter(field => !resolvedFields.has(field.field))
        }
      };
    });
  };

  const updateSection = (section, field, value) => {
    updateInvoice(
      invoice => ({ ...invoice, [section]: { ...(invoice[section] || {}), [field]: value } }),
      question => Boolean(value.trim()) && question.field === `${section}.${field}`
    );
  };

  const updateWorkDate = value => {
    updateInvoice(invoice => ({
      ...invoice,
      intervention: { ...invoice.intervention, workDate: value ? { value, displayValue: value, precision: 'user_supplied', sourceText: value } : null },
      items: invoice.items.map(item => ({ ...item, date: value || '-' }))
    }), question => Boolean(value.trim()) && question.field === 'intervention.workDate');
  };

  const updateItem = (itemId, field, value) => {
    updateActiveResult(result => {
      const items = result.invoice.items.map(item => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [field]: value };
        if ((field === 'unitPrice' || field === 'total') && value.trim()) updated.hasExplicitPrice = true;
        return updated;
      });
      const updatedItem = items.find(item => item.id === itemId);
      return {
        ...result,
        invoice: { ...result.invoice, items },
        interpretation: {
          ...result.interpretation,
          questions: result.interpretation.questions.filter(question => {
            if (question.itemId !== itemId) return true;
            if (question.kind === 'review_item') return !(field === 'description' && value.trim());
            if (question.kind === 'missing_price') return !updatedItem?.hasExplicitPrice;
            if (question.kind === 'missing_item') return !(updatedItem?.description.trim() && updatedItem?.hasExplicitPrice);
            return true;
          })
        }
      };
    });
  };

  const removeItem = itemId => {
    updateActiveResult(result => {
      const items = result.invoice.items.filter(item => item.id !== itemId);
      const questions = result.interpretation.questions.filter(question => question.itemId !== itemId);
      if (!items.length && !questions.some(question => question.field === 'items')) questions.push({ id: 'missing-items', kind: 'missing_field', field: 'items', prompt: 'Quels travaux faut-il faire apparaître ?', value: '', blocking: true });
      return { ...result, invoice: { ...result.invoice, items }, interpretation: { ...result.interpretation, questions } };
    });
  };

  const addItem = () => {
    const itemId = `manual-${Date.now()}`;
    updateActiveResult(result => ({
      ...result,
      invoice: { ...result.invoice, items: [...result.invoice.items, { id: itemId, description: '', date: result.invoice.intervention?.workDate?.displayValue || '-', quantity: '1,00', unit: 'pce', unitPrice: '', total: '', hasExplicitPrice: false }] },
      interpretation: { ...result.interpretation, questions: [...result.interpretation.questions.filter(question => question.field !== 'items'), { id: `details-${itemId}`, kind: 'missing_item', itemId, prompt: 'Complétez la description et le prix de cette ligne.', value: '', blocking: true }] }
    }));
  };

  const handleGenerateOne = () => {
    if (!activeInvoice || activeQuestions.length) return;
    const prepared = prepareInvoicesForGeneration([activeInvoice])[0];
    if (!prepared) return;
    generatePdf(prepared, { skipPrepare: true, autoSave: true });
    updateActiveResult(result => ({ ...result, invoice: prepared }));
    setDownloadMessage(`${getDocumentLabels(prepared.documentType).displayName} téléchargé${prepared.documentType === 'facture' ? 'e' : ''}.`);
  };

  const handleGenerateAll = () => {
    if (!allReady) return;
    const generated = generatePdfs(results.map(result => result.invoice));
    setResults(current => current.map((result, index) => ({ ...result, invoice: generated[index] })));
    setDownloadMessage(`${generated.length} documents téléchargés.`);
  };

  return (
    <>
      <section className="hero" id="saisie">
        <div className="hero-copy">
          <span className="eyebrow"><Icon name="sparkles" size={17} /> Votre assistant de facturation</span>
          <h1>Une facture prête<br /><em>en 2 minutes.</em></h1>
          <p>Écrivez les informations du chantier avec vos mots. Facture Facile s’occupe de les mettre en ordre.</p>
          <ol className="journey-list" aria-label="Les trois étapes">
            <li><span>1</span><div><strong>Vous décrivez</strong><small>Le client, les travaux et les prix</small></div></li>
            <li><span>2</span><div><strong>Vous vérifiez</strong><small>Seulement les points utiles</small></div></li>
            <li><span>3</span><div><strong>Vous téléchargez</strong><small>Un PDF propre, prêt à envoyer</small></div></li>
          </ol>
          <div className="privacy-callout"><Icon name="check" size={18} /><span><strong>Simple et confidentiel</strong>Vos informations restent sur cet appareil.</span></div>
        </div>

        <form className="composer-card" onSubmit={event => { event.preventDefault(); handleParse(); }} noValidate>
          <div className="composer-intro"><span>CRÉER UN DOCUMENT</span><h2>Commençons.</h2><p>Deux petites étapes, puis vous pourrez tout vérifier.</p></div>
          <fieldset className="document-fieldset">
            <legend><span className="step-number">1</span><span><strong>Que voulez-vous préparer&nbsp;?</strong><small>Choisissez une réponse</small></span></legend>
            <div className="document-switch">
              <label className={documentType === 'facture' ? 'active' : ''}><input type="radio" name="document-type" value="facture" checked={documentType === 'facture'} onChange={() => selectDocumentType('facture')} /><span className="document-icon"><Icon name="file" /></span><span className="document-copy"><strong>Une facture</strong><small>Le travail est terminé</small></span><span className="radio-mark"><Icon name="check" size={14} /></span></label>
              <label className={documentType === 'devis' ? 'active' : ''}><input type="radio" name="document-type" value="devis" checked={documentType === 'devis'} onChange={() => selectDocumentType('devis')} /><span className="document-icon"><Icon name="quote" /></span><span className="document-copy"><strong>Un devis</strong><small>Je propose un prix</small></span><span className="radio-mark"><Icon name="check" size={14} /></span></label>
            </div>
          </fieldset>

          <div className="composer-heading second-step"><span className="step-number">2</span><div><label htmlFor="job-description">Dites ou écrivez ce que vous avez fait</label><p id="job-description-help">Parlez naturellement. L’ordre n’a pas d’importance.</p></div></div>
          <div className="recognized-hints" aria-label="Informations à indiquer si possible"><span><Icon name="user" size={16} /> Client</span><span><Icon name="pin" size={16} /> Adresse</span><span><Icon name="tools" size={16} /> Travaux</span><span><Icon name="euro" size={16} /> Prix</span></div>

          <div className={`textarea-wrap ${errorMessage ? 'has-error' : ''}`}>
            <textarea id="job-description" value={rawText} onChange={event => { setRawText(event.target.value); setErrorMessage(''); }} placeholder="Collez un SMS, un e-mail, écrivez ou dictez vos notes…" aria-describedby={`job-description-help${errorMessage ? ' job-description-error' : ''}`} aria-invalid={Boolean(errorMessage)} rows={9} />
            <button type="button" className={`voice-action ${listening ? 'listening' : ''} ${speechSupport === 'unsupported' ? 'unsupported' : ''}`} onClick={toggleVoice} disabled={speechSupport === 'checking'} aria-pressed={listening} aria-describedby="voice-status" aria-label={listening ? 'Arrêter la dictée' : 'Dicter les informations avec le microphone'}><Icon name="mic" size={20} /><span>{listening ? 'Arrêter' : (speechSupport === 'checking' ? 'Micro…' : 'Dicter')}</span></button>
          </div>
          <p className={`voice-message ${voiceMessage ? 'visible' : ''}`} id="voice-status" role="status">{voiceMessage || (speechSupport === 'unsupported' ? 'Dictée non prise en charge par ce navigateur.' : 'Appuyez sur Dicter, puis parlez normalement.')}</p>

          <div className="textarea-actions"><button type="button" className="example-button" onClick={() => { setRawText(EXAMPLE_TEXT); setErrorMessage(''); }}><Icon name="file" size={16} /> Remplir avec un exemple</button><span><Icon name="check" size={15} /> Vous pourrez tout corriger ensuite</span></div>
          {errorMessage && <div className="form-error" id="job-description-error" role="alert"><Icon name="info" size={17} /> {errorMessage}</div>}
          <button className="primary-action" type="submit"><Icon name="sparkles" /> Comprendre et préparer <Icon name="arrow" /></button>
          <p className="privacy-note">Aucun envoi automatique. Vous gardez le contrôle.</p>
        </form>
      </section>

      {activeInvoice && (
        <section className="result-section" id="resultat">
          <div className="result-header">
            <div><span className={activeQuestions.length ? 'attention-kicker' : 'success-kicker'}><Icon name={activeQuestions.length ? 'info' : 'check'} size={15} /> {activeQuestions.length ? `${activeQuestions.length} point${activeQuestions.length > 1 ? 's' : ''} à vérifier` : 'Tout est prêt'}</span><h2>{activeQuestions.length ? 'Voici ce que nous avons compris.' : `Votre ${labels.displayName.toLowerCase()} est ${documentType === 'devis' ? 'prêt' : 'prête'}.`}</h2><p>{activeQuestions.length ? 'Corrigez seulement ce qui mérite votre attention.' : 'Vérifiez l’aperçu exact, puis téléchargez le PDF.'}</p></div>
            <button type="button" className="text-button" onClick={handleReset}><Icon name="back" size={17} /> Modifier mon texte</button>
          </div>

          {results.length > 1 && <div className="document-tabs" aria-label="Documents détectés">{results.map((result, index) => <button type="button" key={`${result.invoice.client?.name}-${index}`} className={activeIndex === index ? 'active' : ''} onClick={() => { setActiveIndex(index); setEditing(false); }}>{index + 1}. {result.invoice.client?.name || 'Client'} {result.interpretation.questions.length ? `(${result.interpretation.questions.length})` : '✓'}</button>)}</div>}

          <div className="verification-grid">
            <SummaryCard icon="user" label="Client" title={activeInvoice.client?.name} lines={activeInvoice.client?.address} />
            <SummaryCard icon="pin" label="Intervention" title={activeInvoice.intervention?.address || 'Lieu non précisé'} lines={activeInvoice.intervention?.workDate?.displayValue ? `Travaux : ${activeInvoice.intervention.workDate.displayValue}` : 'Date des travaux non précisée'} />
            <SummaryCard icon="tools" label="Prestations" title={`${activeInvoice.items?.length || 0} ligne${activeInvoice.items?.length > 1 ? 's' : ''} reconnue${activeInvoice.items?.length > 1 ? 's' : ''}`} lines={(activeInvoice.items || []).map(item => item.description || 'Description à compléter').join(' · ')} />
            <SummaryCard icon="euro" label="Total" title={totals.totalTTC} lines={`${activeInvoice.items.filter(item => item.hasExplicitPrice).length} prix reconnu${activeInvoice.items.filter(item => item.hasExplicitPrice).length > 1 ? 's' : ''}`} accent />
          </div>

          {activeQuestions.length > 0 && <div className="attention-panel"><div className="attention-heading"><span>À vérifier</span><h3>{activeQuestions.length} réponse{activeQuestions.length > 1 ? 's' : ''} rapide{activeQuestions.length > 1 ? 's' : ''}</h3></div>{activeQuestions.map(question => <ReviewQuestion key={question.id} question={question} invoice={activeInvoice} editing={editingQuestionId === question.id} editValue={reviewEdits[question.id] ?? question.value ?? ''} onEditValue={value => setReviewEdits(current => ({ ...current, [question.id]: value }))} onStartEdit={() => setEditingQuestionId(question.id)} onConfirm={() => resolveQuestion(question.id)} onSave={() => saveQuestionValue(question)} onInclude={() => includeWithoutPrice(question)} onDiscard={() => discardQuestionItem(question)} onOpenEditor={() => setEditing(true)} />)}</div>}

          <div className="result-actions">
            <button type="button" className="secondary-action" onClick={() => setEditing(value => !value)}><Icon name="edit" size={18} /> {editing ? 'Fermer l’éditeur complet' : 'Modifier d’autres informations'}</button>
            {results.length > 1 && <button type="button" className="secondary-action" onClick={handleGenerateAll} disabled={!allReady}><Icon name="download" size={18} /> Tout télécharger</button>}
            <button type="button" className="download-action" onClick={handleGenerateOne} disabled={Boolean(activeQuestions.length)}><Icon name="download" /> {activeQuestions.length ? 'Vérifiez les points ci-dessus' : 'Télécharger le PDF'}</button>
          </div>
          {downloadMessage && <div className="download-message" role="status"><Icon name="check" size={16} /> {downloadMessage}</div>}

          {editing && <FullEditor invoice={activeInvoice} updateSection={updateSection} updateInvoice={updateInvoice} updateWorkDate={updateWorkDate} updateItem={updateItem} removeItem={removeItem} addItem={addItem} />}

          {!activeQuestions.length ? <div className="preview-block"><div className="preview-toolbar"><div><span className="preview-dot" /> Aperçu exact du document</div><span>Format A4 · PDF</span></div><div className="preview-canvas"><InvoicePreview invoiceData={activeInvoice} /></div></div> : <div className="preview-pending"><Icon name="info" size={18} /><span>L’aperçu exact apparaîtra après ces vérifications.</span></div>}
        </section>
      )}
    </>
  );
}

function ReviewQuestion({ question, invoice, editing, editValue, onEditValue, onStartEdit, onConfirm, onSave, onInclude, onDiscard, onOpenEditor }) {
  const item = question.itemId ? invoice.items.find(candidate => candidate.id === question.itemId) : null;
  const isMissingField = question.kind === 'missing_field';
  const isMissingItem = question.kind === 'missing_item';
  const isPrice = question.kind === 'missing_price';
  const displayedValue = item?.description || question.value;

  return <article className="review-card">
    <div className="review-copy"><small>{isPrice ? 'Prix manquant' : (isMissingField ? 'Information manquante' : 'À confirmer')}</small><strong>{question.prompt}</strong>{question.sourceText && <p><span>Texte d’origine</span> {question.sourceText}</p>}{displayedValue && !isPrice && <p><span>Compris comme</span> {displayedValue}</p>}</div>
    {(isMissingField && question.field === 'items') || isMissingItem ? <button type="button" className="review-primary" onClick={onOpenEditor}>{isMissingItem ? 'Compléter dans l’éditeur' : 'Ajouter une prestation'}</button> : (
      <div className="review-actions">
        {(editing || isMissingField) && <div className="review-input"><input value={editValue} onChange={event => onEditValue(event.target.value)} placeholder={isPrice ? 'Ex. 85 €' : 'Saisissez l’information'} autoFocus={editing} /><button type="button" onClick={onSave}>Enregistrer</button></div>}
        {!editing && !isMissingField && !isPrice && <><button type="button" className="review-primary" onClick={onConfirm}>{question.field === 'intervention.workDate' ? 'Garder cette période' : (question.kind === 'review_item' ? 'Garder ce texte' : 'C’est correct')}</button><button type="button" onClick={onStartEdit}>Modifier</button></>}
        {!editing && isPrice && <><button type="button" className="review-primary" onClick={onStartEdit}>Entrer un prix</button><button type="button" onClick={onInclude}>Inclure sans prix séparé</button><button type="button" className="danger-link" onClick={onDiscard}>Ne pas facturer</button></>}
      </div>
    )}
  </article>;
}

function FullEditor({ invoice, updateSection, updateInvoice, updateWorkDate, updateItem, removeItem, addItem }) {
  return <div className="edit-panel">
    <div className="edit-panel-heading"><div><span>Éditeur complet</span><h3>Modifiez les autres informations si nécessaire</h3></div><span className="saved-label"><Icon name="check" size={14} /> Modifications enregistrées</span></div>
    <div className="edit-fields">
      <label>Nom du client<input value={invoice.client?.name || ''} onChange={event => updateSection('client', 'name', event.target.value)} /></label>
      <label>Adresse du client<textarea rows="2" value={invoice.client?.address || ''} onChange={event => updateSection('client', 'address', event.target.value)} /></label>
      <label>Lieu de l’intervention<input value={invoice.intervention?.address || ''} onChange={event => updateSection('intervention', 'address', event.target.value)} /></label>
      <label>Date ou période des travaux<input value={invoice.intervention?.workDate?.displayValue || ''} onChange={event => updateWorkDate(event.target.value)} placeholder="Ex. janvier 2026" /></label>
      <label>Date d’émission<input value={invoice.invoiceDate || ''} onChange={event => updateInvoice(current => ({ ...current, invoiceDate: event.target.value }))} placeholder="JJ/MM/AAAA" /></label>
      <label>Échéance<input value={invoice.dueDate || ''} onChange={event => updateInvoice(current => ({ ...current, dueDate: event.target.value }))} placeholder="JJ/MM/AAAA" /></label>
    </div>
    <div className="items-editor">
      <div className="items-editor-title"><h4>Prestations et prix</h4><button type="button" onClick={addItem}><Icon name="plus" size={15} /> Ajouter une ligne</button></div>
      {(invoice.items || []).map(item => <div className="item-edit-row" key={item.id}>
        <label>Description<input value={item.description || ''} onChange={event => updateItem(item.id, 'description', event.target.value)} /></label>
        <label>Qté<input value={item.quantity || '1,00'} onChange={event => updateItem(item.id, 'quantity', event.target.value)} /></label>
        <label>Unité<select value={item.unit || 'pce'} onChange={event => updateItem(item.id, 'unit', event.target.value)}><option value="pce">Pièce</option><option value="h">Heure</option><option value="forfait">Forfait</option></select></label>
        <label>Prix unitaire<input value={item.unitPrice || ''} onChange={event => updateItem(item.id, 'unitPrice', event.target.value)} /></label>
        <label>Total<input value={item.total || ''} onChange={event => updateItem(item.id, 'total', event.target.value)} /></label>
        <button type="button" className="delete-item" onClick={() => removeItem(item.id)} aria-label={`Supprimer ${item.description || 'cette ligne'}`}><Icon name="trash" size={17} /></button>
      </div>)}
    </div>
  </div>;
}

function SummaryCard({ icon, label, title, lines, accent = false }) {
  return <article className={`summary-card ${accent ? 'accent' : ''}`}><span className="summary-icon"><Icon name={icon} size={19} /></span><div><small>{label}</small><strong>{title || 'Non renseigné'}</strong>{lines && <p>{lines}</p>}</div></article>;
}

function parsePrice(value) {
  const parsed = Number.parseFloat(String(value || '').replace(/€|euros?/giu, '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
}

function getSpeechErrorMessage(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone non autorisé. Autorisez-le dans les réglages du navigateur, ou continuez au clavier.';
  if (error === 'audio-capture') return 'Aucun microphone utilisable n’a été trouvé. Vous pouvez continuer au clavier.';
  if (error === 'no-speech') return 'Aucune parole détectée. Appuyez sur Dicter pour réessayer.';
  if (error === 'network') return 'Le service de dictée est momentanément indisponible. Votre texte reste intact.';
  return 'La dictée s’est arrêtée. Votre texte reste modifiable.';
}

function parseQuantity(value) {
  const parsed = Number.parseFloat(String(value || '1').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default InvoiceCreation;
