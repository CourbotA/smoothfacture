import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent
} from 'expo-speech-recognition';
import { interpretInvoiceInput } from '../src/services/invoiceInterpreter.js';
import {
  createCanonicalInvoice,
  CUSTOMER_TYPES,
  OPERATION_CATEGORIES
} from '../src/domain/invoiceModel.js';
import { validateElectronicInvoiceReadiness } from '../src/domain/invoiceCompliance.js';
import {
  hasReducedVatRate,
  recalculateInvoiceTax,
  setInvoiceTaxTreatment,
  setLineVatRate,
  setReducedRateCertification,
  VAT_EXEMPTION_293B,
  VAT_RATES,
  VAT_REGIMES,
  VAT_TREATMENTS
} from '../src/domain/taxModel.js';
import { loadCompanyProfile, saveCompanyProfile } from './src/storage/companyProfileStore.js';
import {
  finalizeInvoice,
  isBackendConfigured,
  saveInvoiceDraft,
  syncCompanyProfile
} from './src/services/smoothfactureApi.js';

const EXAMPLE_TEXT = `Monsieur et Madame Thierry Hornoy
7 rue de la Barre 62180 Neuville-Saint-Vaast

Le 19 mai 2026

Intervention 61 avenue du 4 septembre Lens appartement numéro 5

Remplacement WC fourni par le client
Une sortie WC 12 €
Meuble déplacement 48 €`;

export default function App() {
  const [screen, setScreen] = useState('create');
  const [companyProfile, setCompanyProfile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [documentType, setDocumentType] = useState('facture');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [error, setError] = useState('');
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendMessage, setBackendMessage] = useState('');
  const dictationBaseRef = useRef('');

  useEffect(() => {
    loadCompanyProfile().then(setCompanyProfile);
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setRecognizing(true);
    setVoiceStatus('Parlez naturellement…');
  });

  useSpeechRecognitionEvent('end', () => {
    setRecognizing(false);
    setVoiceStatus('Dictée ajoutée. Vous pouvez corriger le texte avant de continuer.');
  });

  useSpeechRecognitionEvent('result', event => {
    const transcript = event.results?.[0]?.transcript?.trim() || '';
    if (!transcript) return;
    const prefix = dictationBaseRef.current.trim();
    setRawText([prefix, transcript].filter(Boolean).join(prefix ? '\n' : ''));
  });

  useSpeechRecognitionEvent('error', event => {
    setRecognizing(false);
    setVoiceStatus(speechErrorMessage(event.error));
  });

  const active = results[activeIndex] || null;
  const totals = useMemo(() => active?.invoice?.totals || { excludingTax: 0, tax: 0, includingTax: 0 }, [active]);

  const startDictation = async () => {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceStatus('Microphone non autorisé. Vous pouvez toujours écrire ou coller vos notes.');
      return;
    }

    dictationBaseRef.current = rawText;
    setVoiceStatus('Démarrage du micro…');
    ExpoSpeechRecognitionModule.start({
      lang: 'fr-FR',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      addsPunctuation: true
    });
  };

  const interpret = () => {
    if (!companyProfile) return;
    if (!rawText.trim()) {
      setError('Décrivez le chantier, même avec quelques mots seulement.');
      return;
    }

    const parsed = interpretInvoiceInput(rawText).map(envelope => {
      const legacyInvoice = { ...envelope.invoice, documentType };
      const invoice = createCanonicalInvoice({ legacyInvoice, companyProfile });
      return {
        envelope,
        invoice,
        readiness: validateElectronicInvoiceReadiness(invoice),
        serverRecord: null,
        dirty: true
      };
    });

    if (!parsed.length) {
      setError('Nous n’avons rien reconnu. Ajoutez un client, une adresse, des travaux ou un prix.');
      return;
    }

    setResults(parsed);
    setActiveIndex(0);
    setBackendMessage('');
    setError('');
  };

  const updateActiveInvoice = updater => {
    setResults(current => current.map((entry, index) => {
      if (index !== activeIndex || entry.serverRecord?.status === 'finalized') return entry;
      const invoice = updater(entry.invoice);
      return {
        ...entry,
        invoice,
        readiness: validateElectronicInvoiceReadiness(invoice),
        dirty: true
      };
    }));
    setBackendMessage('');
  };

  const ensureServerCompany = async () => {
    if (!isBackendConfigured()) throw new Error('Serveur non configuré. Ajoutez EXPO_PUBLIC_SMOOTHFACTURE_API_URL.');
    if (companyProfile?.serverId) return companyProfile;
    const synced = await syncCompanyProfile(companyProfile);
    setCompanyProfile(synced);
    await saveCompanyProfile(synced);
    return synced;
  };

  const persistActiveDraft = async () => {
    const entry = results[activeIndex];
    if (!entry) throw new Error('Aucun document à enregistrer.');
    if (entry.serverRecord?.status === 'finalized') return entry.serverRecord;
    if (entry.serverRecord && !entry.dirty) return entry.serverRecord;

    const syncedCompany = await ensureServerCompany();
    const record = await saveInvoiceDraft({
      companyId: syncedCompany.serverId,
      invoice: entry.invoice,
      recordId: entry.serverRecord?.status === 'draft' ? entry.serverRecord.id : null
    });

    setResults(current => current.map((candidate, index) => index === activeIndex ? {
      ...candidate,
      invoice: record.invoice,
      readiness: validateElectronicInvoiceReadiness(record.invoice),
      serverRecord: record,
      dirty: false
    } : candidate));
    return record;
  };

  const handleSaveDraft = async () => {
    setBackendBusy(true);
    setBackendMessage('');
    try {
      const record = await persistActiveDraft();
      setBackendMessage(`${record.documentType === 'devis' ? 'Devis' : 'Facture'} enregistré${record.documentType === 'devis' ? '' : 'e'} comme brouillon.`);
    } catch (caught) {
      Alert.alert('Enregistrement impossible', caught.message);
    } finally {
      setBackendBusy(false);
    }
  };

  const handleFinalize = async () => {
    const entry = results[activeIndex];
    if (!entry?.readiness?.ready) {
      Alert.alert('Encore quelques vérifications', 'Complétez les points signalés avant de finaliser le document.');
      return;
    }

    setBackendBusy(true);
    setBackendMessage('');
    try {
      const draft = await persistActiveDraft();
      const record = await finalizeInvoice({ companyId: draft.companyId, recordId: draft.id });
      setResults(current => current.map((candidate, index) => index === activeIndex ? {
        ...candidate,
        invoice: record.invoice,
        readiness: validateElectronicInvoiceReadiness(record.invoice),
        serverRecord: record,
        dirty: false
      } : candidate));
      setBackendMessage(`${record.documentType === 'devis' ? 'Devis' : 'Facture'} n°${record.number} finalisé${record.documentType === 'devis' ? '' : 'e'}.`);
    } catch (caught) {
      Alert.alert('Finalisation impossible', caught.message);
    } finally {
      setBackendBusy(false);
    }
  };

  const handleCompanySave = async () => {
    const local = recalculateCompanyTaxDefaults(companyProfile);
    await saveCompanyProfile(local);
    setCompanyProfile(local);

    if (!isBackendConfigured()) {
      Alert.alert('Enregistré sur cet appareil', 'Le serveur n’est pas encore configuré. La création reste disponible hors ligne.');
      setScreen('create');
      return;
    }

    setBackendBusy(true);
    try {
      const synced = await syncCompanyProfile(local);
      setCompanyProfile(synced);
      await saveCompanyProfile(synced);
      Alert.alert('Entreprise synchronisée', 'Votre profil est maintenant enregistré sur le serveur de facturation.');
      setScreen('create');
    } catch (caught) {
      Alert.alert('Enregistré localement', `La synchronisation serveur a échoué : ${caught.message}`);
    } finally {
      setBackendBusy(false);
    }
  };

  const reset = () => {
    setResults([]);
    setActiveIndex(0);
    setBackendMessage('');
    setError('');
  };

  if (!companyProfile) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" /><Text style={styles.muted}>Préparation de Facture Facile…</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Facture Facile</Text>
            <Text style={styles.brandCaption}>Les factures d’artisans, sans paperasse.</Text>
          </View>
          <Pressable style={styles.profileButton} onPress={() => setScreen(screen === 'company' ? 'create' : 'company')}>
            <Text style={styles.profileButtonText}>{screen === 'company' ? 'Créer' : 'Mon entreprise'}</Text>
          </Pressable>
        </View>

        {screen === 'company' ? (
          <CompanyScreen profile={companyProfile} onChange={setCompanyProfile} onSave={handleCompanySave} busy={backendBusy} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!active ? (
              <>
                <View style={styles.hero}>
                  <Text style={styles.eyebrow}>VOTRE ASSISTANT DE FACTURATION</Text>
                  <Text style={styles.title}>Une facture prête à partir de vos mots.</Text>
                  <Text style={styles.subtitle}>Écrivez, collez un SMS ou dictez le chantier. Vous ne vérifiez que les points utiles.</Text>
                </View>

                <Text style={styles.label}>Que voulez-vous préparer ?</Text>
                <View style={styles.segmentRow}>
                  <Choice label="Facture" selected={documentType === 'facture'} onPress={() => setDocumentType('facture')} />
                  <Choice label="Devis" selected={documentType === 'devis'} onPress={() => setDocumentType('devis')} />
                </View>

                <Text style={[styles.label, styles.sectionGap]}>Dites ou écrivez ce que vous avez fait</Text>
                <Text style={styles.help}>L’ordre n’a pas d’importance. Client, adresse, travaux et prix suffisent.</Text>
                <TextInput
                  style={styles.composer}
                  multiline
                  textAlignVertical="top"
                  value={rawText}
                  onChangeText={text => { setRawText(text); setError(''); }}
                  placeholder="Ex. Client Dupont, 12 rue Pasteur Chambéry, remplacement WC, sortie PVC 12 €, déplacement 45 €…"
                  placeholderTextColor="#8C8C94"
                />

                <View style={styles.actionRow}>
                  <Pressable style={[styles.secondaryButton, recognizing && styles.listeningButton]} onPress={startDictation}>
                    <Text style={styles.secondaryButtonText}>{recognizing ? '■ Arrêter' : '🎙 Dicter'}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => setRawText(EXAMPLE_TEXT)}>
                    <Text style={styles.secondaryButtonText}>Voir un exemple</Text>
                  </Pressable>
                </View>
                {!!voiceStatus && <Text style={styles.voiceStatus}>{voiceStatus}</Text>}
                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable style={styles.primaryButton} onPress={interpret}>
                  <Text style={styles.primaryButtonText}>Comprendre et préparer</Text>
                </Pressable>
                <Text style={styles.privacy}>Aucun envoi automatique. Vous gardez le contrôle.</Text>
              </>
            ) : (
              <ReviewScreen
                entry={active}
                totals={totals}
                activeIndex={activeIndex}
                count={results.length}
                onSelect={setActiveIndex}
                onBack={reset}
                updateInvoice={updateActiveInvoice}
                onSaveDraft={handleSaveDraft}
                onFinalize={handleFinalize}
                backendBusy={backendBusy}
                backendMessage={backendMessage}
                backendConfigured={isBackendConfigured()}
              />
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReviewScreen({ entry, totals, activeIndex, count, onSelect, onBack, updateInvoice, onSaveDraft, onFinalize, backendBusy, backendMessage, backendConfigured }) {
  const { envelope, invoice, readiness, serverRecord, dirty } = entry;
  const parserQuestions = envelope.interpretation?.questions || [];
  const addressText = formatAddress(invoice.buyer.address);
  const finalized = serverRecord?.status === 'finalized';
  const tax = invoice.tax || {};

  return (
    <View>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ {finalized ? 'Créer un autre document' : 'Modifier mon texte'}</Text></Pressable>
      <Text style={styles.eyebrow}>{finalized ? `FINALISÉ · N°${serverRecord.number}` : (readiness.ready ? 'PRÊT' : `${readiness.blockingCount} POINT${readiness.blockingCount > 1 ? 'S' : ''} À VÉRIFIER`)}</Text>
      <Text style={styles.title}>{finalized ? 'Votre document est verrouillé.' : (readiness.ready ? 'Votre document est structuré.' : 'Voici ce que nous avons compris.')}</Text>
      <Text style={styles.subtitle}>{finalized
        ? 'Le numéro a été attribué par le serveur. Le contenu ne peut plus être modifié ; les prochains statuts seront ajoutés à son historique.'
        : 'Vérifiez les informations utiles puis enregistrez un brouillon ou finalisez le document.'}</Text>

      {count > 1 && <View style={styles.tabs}>{Array.from({ length: count }, (_, index) => (
        <Pressable key={index} style={[styles.tab, activeIndex === index && styles.tabActive]} onPress={() => onSelect(index)}>
          <Text style={[styles.tabText, activeIndex === index && styles.tabTextActive]}>{index + 1}</Text>
        </Pressable>
      ))}</View>}

      <Summary label="Client" value={invoice.buyer.legalName || 'À compléter'} detail={addressText || 'Adresse à compléter'} />
      <Summary label="Prestations" value={`${invoice.lines.length} ligne${invoice.lines.length > 1 ? 's' : ''}`} detail={invoice.lines.map(line => line.description).join(' · ')} />
      <Summary label="Total HT" value={formatEuro(totals.excludingTax)} detail={`TVA ${formatEuro(totals.tax)} · Total TTC ${formatEuro(totals.includingTax)}`} />

      {!finalized && <View style={styles.card}>
        <Text style={styles.cardKicker}>CLIENT</Text>
        <Field label="Nom" value={invoice.buyer.legalName} onChange={value => updateInvoice(current => ({ ...current, buyer: { ...current.buyer, legalName: value } }))} />
        <Field label="Adresse" value={addressText} multiline onChange={value => updateInvoice(current => ({ ...current, buyer: { ...current.buyer, address: parseAddress(value) } }))} />
        <Text style={styles.fieldLabel}>Type de client</Text>
        <View style={styles.segmentRow}>
          <Choice label="Particulier" selected={invoice.buyer.type === CUSTOMER_TYPES.INDIVIDUAL} onPress={() => updateInvoice(current => ({ ...current, buyer: { ...current.buyer, type: CUSTOMER_TYPES.INDIVIDUAL, siren: '' } }))} />
          <Choice label="Entreprise" selected={invoice.buyer.type === CUSTOMER_TYPES.COMPANY} onPress={() => updateInvoice(current => ({ ...current, buyer: { ...current.buyer, type: CUSTOMER_TYPES.COMPANY } }))} />
        </View>
        {invoice.buyer.type === CUSTOMER_TYPES.COMPANY && (
          <Field label="SIREN du client" keyboardType="number-pad" value={invoice.buyer.siren} onChange={value => updateInvoice(current => ({ ...current, buyer: { ...current.buyer, siren: value.replace(/\D/g, '').slice(0, 9) } }))} />
        )}
      </View>}

      {!finalized && <View style={styles.card}>
        <Text style={styles.cardKicker}>CATÉGORIE RÉGLEMENTAIRE</Text>
        <Text style={styles.help}>Facture électronique : biens, services, ou les deux.</Text>
        <View style={styles.categoryWrap}>
          <Choice label="Services" selected={invoice.operationCategory === OPERATION_CATEGORIES.SERVICES} onPress={() => updateInvoice(current => ({ ...current, operationCategory: OPERATION_CATEGORIES.SERVICES }))} />
          <Choice label="Biens" selected={invoice.operationCategory === OPERATION_CATEGORIES.GOODS} onPress={() => updateInvoice(current => ({ ...current, operationCategory: OPERATION_CATEGORIES.GOODS }))} />
          <Choice label="Les deux" selected={invoice.operationCategory === OPERATION_CATEGORIES.MIXED} onPress={() => updateInvoice(current => ({ ...current, operationCategory: OPERATION_CATEGORIES.MIXED }))} />
        </View>
      </View>}

      <View style={styles.card}>
        <Text style={styles.cardKicker}>TVA</Text>
        {tax.regime === VAT_REGIMES.EXEMPT_293B ? (
          <>
            <Text style={styles.readinessTitle}>Franchise en base de TVA</Text>
            <Text style={styles.help}>{tax.exemptionReason || VAT_EXEMPTION_293B}</Text>
          </>
        ) : (
          <>
            {!finalized && <>
              <Text style={styles.fieldLabel}>Traitement</Text>
              <View style={styles.segmentRow}>
                <Choice label="TVA normale" selected={tax.treatment === VAT_TREATMENTS.DOMESTIC} onPress={() => updateInvoice(current => setInvoiceTaxTreatment(current, VAT_TREATMENTS.DOMESTIC))} />
                <Choice label="Autoliquidation BTP" selected={tax.treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP} onPress={() => updateInvoice(current => setInvoiceTaxTreatment(current, VAT_TREATMENTS.REVERSE_CHARGE_BTP))} />
              </View>
            </>}

            {tax.treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP ? (
              <Text style={styles.help}>Facture HT sans TVA collectée. La mention « Autoliquidation » sera portée sur le document.</Text>
            ) : (
              <View>
                {invoice.lines.map((line, index) => <View key={line.id} style={styles.taxLine}>
                  <Text style={styles.taxLineTitle}>{index + 1}. {line.description || 'Prestation'}</Text>
                  <Text style={styles.help}>{formatEuro(line.totalExcludingTax || 0)} HT · TVA {line.vatRate == null ? 'à choisir' : `${formatRate(line.vatRate)} %`}</Text>
                  {!finalized && <View style={styles.categoryWrap}>{VAT_RATES.map(rate => (
                    <Choice key={rate} label={`${formatRate(rate)} %`} selected={Number(line.vatRate) === rate} onPress={() => updateInvoice(current => setLineVatRate(current, line.id, rate))} />
                  ))}</View>}
                </View>)}

                {hasReducedVatRate(invoice) && <View style={styles.reducedRateBox}>
                  <Text style={styles.help}>Les taux 5,5 % et 10 % dépendent des conditions du chantier. Facture Facile ne les déduit pas automatiquement.</Text>
                  {!finalized && <Choice
                    label={tax.reducedRateCertificationConfirmed ? '✓ Conditions confirmées' : 'Confirmer les conditions du taux réduit'}
                    selected={tax.reducedRateCertificationConfirmed}
                    onPress={() => updateInvoice(current => setReducedRateCertification(current, !current.tax?.reducedRateCertificationConfirmed))}
                  />}
                </View>}
              </View>
            )}
          </>
        )}
        <Text style={styles.taxTotals}>HT {formatEuro(totals.excludingTax)} · TVA {formatEuro(totals.tax)} · TTC {formatEuro(totals.includingTax)}</Text>
      </View>

      {!finalized && (parserQuestions.length > 0 || readiness.issues.length > 0) && (
        <View style={styles.warningCard}>
          <Text style={styles.cardKicker}>À VÉRIFIER</Text>
          {parserQuestions.slice(0, 5).map(question => <Text key={question.id} style={styles.issue}>• {question.prompt}</Text>)}
          {readiness.issues.filter(issue => !parserQuestions.some(question => question.field === issue.field)).map(issue => <Text key={`${issue.field}-${issue.message}`} style={styles.issue}>• {issue.message}</Text>)}
        </View>
      )}

      <View style={[styles.readiness, (readiness.ready || finalized) && styles.readinessReady]}>
        <Text style={styles.readinessTitle}>{finalized ? `✓ ${invoice.documentType === 'devis' ? 'Devis' : 'Facture'} n°${serverRecord.number}` : (readiness.ready ? '✓ Données P0 prêtes' : 'Conformité en préparation')}</Text>
        <Text style={styles.readinessText}>{finalized
          ? `Finalisé le ${formatServerDate(serverRecord.finalizedAt)}. Numéro attribué par le serveur et contenu désormais immuable.`
          : (readiness.ready
            ? 'Le document peut être enregistré puis finalisé. Le serveur recalculera les montants avant d’attribuer le numéro.'
            : 'Complétez les points signalés. Aucun numéro final ne sera consommé pour un brouillon.')}</Text>
      </View>

      {!finalized && <>
        {!backendConfigured && <View style={styles.warningCard}><Text style={styles.issue}>Serveur non configuré : vous pouvez vérifier le document, mais pas encore enregistrer ou finaliser.</Text></View>}
        {!!backendMessage && <Text style={styles.serverMessage}>{backendMessage}</Text>}
        <Pressable disabled={!backendConfigured || backendBusy} style={[styles.secondaryWideButton, (!backendConfigured || backendBusy) && styles.disabledButton]} onPress={onSaveDraft}>
          <Text style={styles.secondaryButtonText}>{backendBusy ? 'Enregistrement…' : (serverRecord?.status === 'draft' && !dirty ? 'Brouillon enregistré ✓' : 'Enregistrer le brouillon')}</Text>
        </Pressable>
        <Pressable disabled={!backendConfigured || backendBusy || !readiness.ready} style={[styles.primaryButton, (!backendConfigured || backendBusy || !readiness.ready) && styles.disabledButton]} onPress={onFinalize}>
          <Text style={styles.primaryButtonText}>{backendBusy ? 'Finalisation…' : `Finaliser ${invoice.documentType === 'devis' ? 'le devis' : 'la facture'}`}</Text>
        </Pressable>
        <Text style={styles.privacy}>La finalisation attribue un numéro définitif. Le document ne pourra plus être modifié.</Text>
      </>}
      {finalized && !!backendMessage && <Text style={styles.serverMessage}>{backendMessage}</Text>}
    </View>
  );
}

function CompanyScreen({ profile, onChange, onSave, busy }) {
  const update = (section, field, value) => onChange(current => section
    ? { ...current, [section]: { ...current[section], [field]: value } }
    : { ...current, [field]: value });

  const setVatRegime = regime => onChange(current => ({
    ...current,
    tax: regime === VAT_REGIMES.EXEMPT_293B
      ? { ...current.tax, vatRegime: regime, defaultVatRate: 0, exemptionReason: VAT_EXEMPTION_293B }
      : { ...current.tax, vatRegime: regime, defaultVatRate: current.tax?.defaultVatRate && current.tax.defaultVatRate !== 0 ? current.tax.defaultVatRate : 20, exemptionReason: '' }
  }));

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>P0 · IDENTITÉ ENTREPRISE</Text>
      <Text style={styles.title}>Les informations qui signent vos factures.</Text>
      <Text style={styles.subtitle}>Le profil reste disponible sur cet appareil et, lorsque le serveur est configuré, il est synchronisé pour la numérotation et l’historique.</Text>
      <View style={styles.card}>
        <Field label="Nom légal" value={profile.legalName} onChange={value => update(null, 'legalName', value)} />
        <Field label="SIREN" keyboardType="number-pad" value={profile.siren} onChange={value => update(null, 'siren', value.replace(/\D/g, '').slice(0, 9))} />
        <Field label="SIRET" keyboardType="number-pad" value={profile.siret} onChange={value => update(null, 'siret', value.replace(/\D/g, '').slice(0, 14))} />
        <Field label="Adresse" value={profile.address.line1} onChange={value => update('address', 'line1', value)} />
        <Field label="Code postal" keyboardType="number-pad" value={profile.address.postalCode} onChange={value => update('address', 'postalCode', value.replace(/\D/g, '').slice(0, 5))} />
        <Field label="Ville" value={profile.address.city} onChange={value => update('address', 'city', value)} />
        <Field label="E-mail" keyboardType="email-address" value={profile.contact.email} onChange={value => update('contact', 'email', value)} />
        <Field label="Téléphone" keyboardType="phone-pad" value={profile.contact.phone} onChange={value => update('contact', 'phone', value)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>RÉGIME TVA</Text>
        <View style={styles.segmentRow}>
          <Choice label="Franchise 293 B" selected={profile.tax?.vatRegime !== VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.EXEMPT_293B)} />
          <Choice label="Assujetti TVA" selected={profile.tax?.vatRegime === VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.STANDARD)} />
        </View>
        {profile.tax?.vatRegime === VAT_REGIMES.STANDARD ? <>
          <Text style={[styles.fieldLabel, styles.sectionGap]}>Taux par défaut</Text>
          <View style={styles.categoryWrap}>{VAT_RATES.map(rate => <Choice key={rate} label={`${formatRate(rate)} %`} selected={Number(profile.tax?.defaultVatRate) === rate} onPress={() => update('tax', 'defaultVatRate', rate)} />)}</View>
          <Text style={styles.help}>Le taux par défaut initialise les lignes. Vous pourrez choisir 20 %, 10 % ou 5,5 % ligne par ligne avant finalisation.</Text>
        </> : <Text style={[styles.help, styles.sectionGap]}>{profile.tax?.exemptionReason || VAT_EXEMPTION_293B}</Text>}
      </View>

      <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabledButton]} onPress={onSave}><Text style={styles.primaryButtonText}>{busy ? 'Synchronisation…' : 'Enregistrer mon entreprise'}</Text></Pressable>
    </ScrollView>
  );
}

function Field({ label, value, onChange, multiline = false, keyboardType = 'default' }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={[styles.input, multiline && styles.inputMultiline]} value={String(value || '')} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType} textAlignVertical={multiline ? 'top' : 'center'} /></View>;
}

function Choice({ label, selected, onPress }) {
  return <Pressable style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function Summary({ label, value, detail }) {
  return <View style={styles.summary}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryDetail}>{detail}</Text></View>;
}

function formatAddress(address) {
  if (!address) return '';
  return [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}

function parseAddress(value) {
  const lines = String(value || '').split(/\n+/u).map(line => line.trim()).filter(Boolean);
  const text = lines.join('\n');
  const match = text.match(/\b(\d{5})\s+([^\n]+)$/u);
  return {
    line1: lines[0] || '',
    line2: lines.length > 2 ? lines.slice(1, -1).join(' ') : '',
    postalCode: match?.[1] || '',
    city: match?.[2]?.trim() || '',
    countryCode: 'FR'
  };
}

function recalculateCompanyTaxDefaults(profile) {
  if (profile?.tax?.vatRegime === VAT_REGIMES.STANDARD) {
    return { ...profile, tax: { ...profile.tax, defaultVatRate: Number(profile.tax.defaultVatRate) || 20, exemptionReason: '' } };
  }
  return { ...profile, tax: { ...profile.tax, vatRegime: VAT_REGIMES.EXEMPT_293B, defaultVatRate: 0, exemptionReason: profile?.tax?.exemptionReason || VAT_EXEMPTION_293B } };
}

function formatEuro(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
}

function formatRate(value) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function formatServerDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR');
}

function speechErrorMessage(code) {
  if (code === 'not-allowed') return 'Microphone non autorisé. Activez-le dans les réglages ou écrivez votre facture.';
  if (code === 'no-speech' || code === 'speech-timeout') return 'Aucune parole détectée. Réessayez ou continuez au clavier.';
  if (code === 'network') return 'La dictée n’a pas pu être transcrite. Votre texte actuel est conservé.';
  return 'La dictée s’est arrêtée. Vous pouvez réessayer ou continuer au clavier.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F7F5F1' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F5F1' },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDD8D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 20, fontWeight: '800', color: '#1F1F23' },
  brandCaption: { fontSize: 11, color: '#757078', marginTop: 2 },
  profileButton: { borderWidth: 1, borderColor: '#D7D1C8', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  profileButtonText: { fontSize: 12, fontWeight: '700', color: '#4F4653' },
  content: { padding: 20, paddingBottom: 56 },
  hero: { marginBottom: 24 },
  eyebrow: { color: '#7A4E62', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  title: { color: '#211F23', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: '#676169', fontSize: 15, lineHeight: 22, marginTop: 10 },
  label: { color: '#252329', fontSize: 16, fontWeight: '750', marginBottom: 10 },
  help: { color: '#777078', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  sectionGap: { marginTop: 24 },
  segmentRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  choice: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: '#D8D1C9', backgroundColor: '#FFFFFF', minWidth: 104, alignItems: 'center' },
  choiceSelected: { borderColor: '#7A4E62', backgroundColor: '#F4E9EE' },
  choiceText: { color: '#5B555C', fontWeight: '700' },
  choiceTextSelected: { color: '#6D3E54' },
  composer: { minHeight: 210, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#D8D2CA', padding: 16, fontSize: 16, lineHeight: 23, color: '#242126' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  secondaryButton: { borderRadius: 12, borderWidth: 1, borderColor: '#CFC7C0', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#FFFFFF' },
  secondaryWideButton: { borderRadius: 15, borderWidth: 1, borderColor: '#CFC7C0', paddingHorizontal: 18, paddingVertical: 15, backgroundColor: '#FFFFFF', marginTop: 18, alignItems: 'center' },
  listeningButton: { borderColor: '#A2465E', backgroundColor: '#F8E8ED' },
  secondaryButtonText: { color: '#4D474D', fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  voiceStatus: { color: '#6D6670', marginTop: 10, fontSize: 13 },
  error: { color: '#A42D3C', marginTop: 12, fontWeight: '650' },
  primaryButton: { backgroundColor: '#6D3E54', borderRadius: 15, paddingHorizontal: 18, paddingVertical: 16, marginTop: 20, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  privacy: { textAlign: 'center', color: '#807981', fontSize: 12, marginTop: 10 },
  muted: { color: '#777078' },
  back: { color: '#6D3E54', fontWeight: '750', marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  tab: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#D4CEC7', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  tabActive: { backgroundColor: '#6D3E54', borderColor: '#6D3E54' },
  tabText: { color: '#635C64', fontWeight: '800' },
  tabTextActive: { color: '#FFFFFF' },
  summary: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E0DAD3', padding: 16, marginTop: 10 },
  summaryLabel: { color: '#8A838B', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  summaryValue: { color: '#272328', fontSize: 19, fontWeight: '800', marginTop: 5 },
  summaryDetail: { color: '#706970', fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DDD7D0', padding: 16, marginTop: 18 },
  warningCard: { backgroundColor: '#FFF7E8', borderRadius: 18, borderWidth: 1, borderColor: '#E9D7A9', padding: 16, marginTop: 18 },
  cardKicker: { color: '#7A4E62', fontSize: 11, fontWeight: '850', letterSpacing: 0.9, marginBottom: 10 },
  issue: { color: '#67573E', fontSize: 14, lineHeight: 21, marginTop: 5 },
  field: { marginTop: 10 },
  fieldLabel: { color: '#5F5960', fontSize: 12, fontWeight: '750', marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D8D1CA', borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#FCFBF9', color: '#242126', fontSize: 15 },
  inputMultiline: { minHeight: 86, paddingTop: 12 },
  readiness: { backgroundColor: '#EEE9E4', borderRadius: 16, padding: 16, marginTop: 18 },
  readinessReady: { backgroundColor: '#E8F1E8' },
  readinessTitle: { fontWeight: '850', color: '#343038', marginBottom: 5 },
  readinessText: { color: '#686169', lineHeight: 19, fontSize: 13 },
  taxLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5DFD8', paddingTop: 12, marginTop: 12 },
  taxLineTitle: { color: '#343038', fontWeight: '750', marginBottom: 4 },
  taxTotals: { color: '#343038', fontWeight: '800', marginTop: 14 },
  reducedRateBox: { backgroundColor: '#F7F3EE', borderRadius: 12, padding: 12, marginTop: 14 },
  serverMessage: { color: '#3E6B48', fontWeight: '750', textAlign: 'center', marginTop: 16 }
});
