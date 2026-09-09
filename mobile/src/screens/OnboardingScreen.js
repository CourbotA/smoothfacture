import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  applyPaymentTerms,
  getCompanySetupMissingFields,
  INSURANCE_STATUSES,
  PAYMENT_TERM_PRESETS
} from '../../../src/domain/companyProfileSetup.js';
import {
  VAT_EXEMPTION_293B,
  VAT_RATES,
  VAT_REGIMES
} from '../../../src/domain/taxModel.js';
import { applyCompanyLookup, lookupCompanyBySiren } from '../services/companyLookup.js';

const STEPS = [
  { title: 'Votre entreprise', kicker: '1 SUR 4' },
  { title: 'Votre TVA', kicker: '2 SUR 4' },
  { title: 'Vos paiements', kicker: '3 SUR 4' },
  { title: 'Votre assurance', kicker: '4 SUR 4' }
];

export default function OnboardingScreen({ profile, onChange, onComplete, busy }) {
  const [step, setStep] = useState(Math.min(3, Math.max(0, Number(profile?.onboarding?.lastStep || 0))));
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [manualIdentity, setManualIdentity] = useState(false);
  const [customPayment, setCustomPayment] = useState(!PAYMENT_TERM_PRESETS.some(item => item.days === Number(profile.payment?.termsDays)));
  const current = STEPS[step];

  const identityReady = useMemo(() => {
    const address = profile.address || {};
    return /^\d{9}$/u.test(String(profile.siren || ''))
      && Boolean(String(profile.legalName || '').trim())
      && Boolean(String(address.line1 || '').trim())
      && Boolean(String(address.postalCode || '').trim())
      && Boolean(String(address.city || '').trim());
  }, [profile]);

  const update = (section, field, value) => onChange(currentProfile => section
    ? { ...currentProfile, [section]: { ...(currentProfile[section] || {}), [field]: value } }
    : { ...currentProfile, [field]: value });

  const updateOnboardingStep = nextStep => {
    onChange(currentProfile => ({
      ...currentProfile,
      onboarding: { ...(currentProfile.onboarding || {}), lastStep: nextStep }
    }));
    setStep(nextStep);
  };

  const searchCompany = async () => {
    setLookupBusy(true);
    setLookupError('');
    setCandidate(null);
    try {
      const result = await lookupCompanyBySiren(profile.siren);
      setCandidate(result);
    } catch (error) {
      setLookupError(error.message || 'Impossible de consulter l’Annuaire des Entreprises.');
      setManualIdentity(true);
    } finally {
      setLookupBusy(false);
    }
  };

  const confirmCompany = () => {
    if (!candidate) return;
    onChange(currentProfile => applyCompanyLookup(currentProfile, candidate));
    setCandidate(null);
    setLookupError('');
    updateOnboardingStep(1);
  };

  const setVatRegime = regime => onChange(currentProfile => ({
    ...currentProfile,
    tax: regime === VAT_REGIMES.STANDARD
      ? {
          ...(currentProfile.tax || {}),
          vatRegime: VAT_REGIMES.STANDARD,
          vatLiability: 'vat_registered',
          defaultVatRate: Number(currentProfile.tax?.defaultVatRate) || 20,
          exemptionReason: '',
          vatOnDebits: typeof currentProfile.tax?.vatOnDebits === 'boolean' ? currentProfile.tax.vatOnDebits : null
        }
      : {
          ...(currentProfile.tax || {}),
          vatRegime: VAT_REGIMES.EXEMPT_293B,
          vatLiability: 'exempt_293b',
          filingRegime: 'franchise_293b',
          defaultVatRate: 0,
          vatNumber: '',
          exemptionReason: VAT_EXEMPTION_293B,
          vatOnDebits: null
        }
  }));

  const setInsuranceStatus = status => onChange(currentProfile => ({
    ...currentProfile,
    insurance: {
      ...(currentProfile.insurance || {}),
      status,
      coverageArea: currentProfile.insurance?.coverageArea || 'France'
    }
  }));

  const finish = () => {
    const missing = getCompanySetupMissingFields(profile);
    if (missing.length) return;
    onComplete(profile);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progressRow}>
        {STEPS.map((_, index) => <View key={index} style={[styles.progressDot, index <= step && styles.progressDotActive]} />)}
      </View>
      <Text style={styles.eyebrow}>{current.kicker}</Text>
      <Text style={styles.title}>{current.title}</Text>

      {step === 0 && <>
        <Text style={styles.subtitle}>Donnez-nous votre SIREN. Nous récupérons les informations publiques de l’entreprise pour éviter de vous faire tout retaper.</Text>
        <View style={styles.card}>
          <Field label="SIREN" keyboardType="number-pad" value={profile.siren} onChange={value => {
            update(null, 'siren', value.replace(/\D/g, '').slice(0, 9));
            setCandidate(null);
            setLookupError('');
          }} />
          <Pressable disabled={lookupBusy || !/^\d{9}$/u.test(String(profile.siren || ''))} style={[styles.primaryButton, (lookupBusy || !/^\d{9}$/u.test(String(profile.siren || ''))) && styles.disabled]} onPress={searchCompany}>
            {lookupBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Retrouver mon entreprise</Text>}
          </Pressable>
          <Text style={styles.finePrint}>Recherche via l’Annuaire des Entreprises de l’État. Seul le SIREN est envoyé pour cette recherche.</Text>
        </View>

        {candidate && <View style={styles.confirmCard}>
          <Text style={styles.cardKicker}>ENTREPRISE TROUVÉE</Text>
          <Text style={styles.companyName}>{candidate.legalName}</Text>
          <Text style={styles.detail}>SIREN {candidate.siren}{candidate.siret ? ` · SIRET ${candidate.siret}` : ''}</Text>
          <Text style={styles.detail}>{formatAddress(candidate.address)}</Text>
          {!!candidate.apeCode && <Text style={styles.detail}>APE {candidate.apeCode}</Text>}
          <Pressable style={styles.primaryButton} onPress={confirmCompany}><Text style={styles.primaryButtonText}>Oui, c’est mon entreprise</Text></Pressable>
          <Pressable style={styles.linkButton} onPress={() => { setCandidate(null); setManualIdentity(true); }}><Text style={styles.linkText}>Non, saisir manuellement</Text></Pressable>
        </View>}

        {!!lookupError && <View style={styles.warning}><Text style={styles.warningText}>{lookupError}</Text></View>}

        {(manualIdentity || identityReady) && !candidate && <View style={styles.card}>
          <Text style={styles.cardKicker}>VÉRIFIER L’IDENTITÉ</Text>
          <Field label="Nom légal" value={profile.legalName} onChange={value => update(null, 'legalName', value)} />
          <Field label="SIRET" keyboardType="number-pad" value={profile.siret} onChange={value => update(null, 'siret', value.replace(/\D/g, '').slice(0, 14))} />
          <Field label="Adresse" value={profile.address?.line1} onChange={value => update('address', 'line1', value)} />
          <Field label="Code postal" keyboardType="number-pad" value={profile.address?.postalCode} onChange={value => update('address', 'postalCode', value.replace(/\D/g, '').slice(0, 5))} />
          <Field label="Ville" value={profile.address?.city} onChange={value => update('address', 'city', value)} />
          <Pressable disabled={!identityReady} style={[styles.primaryButton, !identityReady && styles.disabled]} onPress={() => updateOnboardingStep(1)}><Text style={styles.primaryButtonText}>Continuer</Text></Pressable>
        </View>}

        {!manualIdentity && !candidate && <Pressable style={styles.linkButton} onPress={() => setManualIdentity(true)}><Text style={styles.linkText}>Saisir les informations manuellement</Text></Pressable>}
      </>}

      {step === 1 && <>
        <Text style={styles.subtitle}>Choisissez simplement la façon dont vous facturez la TVA. Nous garderons ce réglage pour les prochaines factures.</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Comment facturez-vous la TVA ?</Text>
          <Choice label="Je ne facture pas la TVA · Franchise 293 B" selected={profile.tax?.vatRegime !== VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.EXEMPT_293B)} />
          <Choice label="Je facture la TVA" selected={profile.tax?.vatRegime === VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.STANDARD)} />

          {profile.tax?.vatRegime === VAT_REGIMES.STANDARD ? <>
            <Field label="Numéro de TVA intracommunautaire" autoCapitalize="characters" value={profile.tax?.vatNumber || profile.vatNumber} onChange={value => update('tax', 'vatNumber', value.replace(/\s/g, '').toUpperCase().slice(0, 20))} />
            <Text style={styles.fieldLabel}>TVA sur les débits ?</Text>
            <View style={styles.row}>
              <Choice compact label="Oui" selected={profile.tax?.vatOnDebits === true} onPress={() => update('tax', 'vatOnDebits', true)} />
              <Choice compact label="Non" selected={profile.tax?.vatOnDebits === false} onPress={() => update('tax', 'vatOnDebits', false)} />
              <Choice compact label="Je ne sais pas" selected={profile.tax?.vatOnDebits == null} onPress={() => update('tax', 'vatOnDebits', null)} />
            </View>
            <Text style={styles.help}>Si vous ne savez pas, vous pourrez le compléter plus tard dans Compte. SmoothFacture ne devinera pas ce choix fiscal.</Text>
            <Text style={styles.fieldLabel}>Taux par défaut</Text>
            <View style={styles.row}>{VAT_RATES.map(rate => <Choice key={rate} compact label={`${formatRate(rate)} %`} selected={Number(profile.tax?.defaultVatRate) === rate} onPress={() => update('tax', 'defaultVatRate', rate)} />)}</View>
          </> : <Text style={styles.help}>{profile.tax?.exemptionReason || VAT_EXEMPTION_293B}</Text>}
        </View>
        <StepButtons onBack={() => updateOnboardingStep(0)} onNext={() => updateOnboardingStep(2)} nextDisabled={profile.tax?.vatRegime === VAT_REGIMES.STANDARD && !String(profile.tax?.vatNumber || profile.vatNumber || '').trim()} />
      </>}

      {step === 2 && <>
        <Text style={styles.subtitle}>Choisissez votre délai habituel. SmoothFacture calculera ensuite automatiquement la date d’échéance.</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Délai de paiement habituel</Text>
          <View style={styles.row}>{PAYMENT_TERM_PRESETS.map(item => <Choice key={item.key} compact label={item.label} selected={!customPayment && Number(profile.payment?.termsDays) === item.days} onPress={() => {
            setCustomPayment(false);
            onChange(currentProfile => applyPaymentTerms(currentProfile, item.days));
          }} />)}</View>
          <Choice label="Autre délai" selected={customPayment} onPress={() => setCustomPayment(true)} />
          {customPayment && <Field label="Nombre de jours" keyboardType="number-pad" value={profile.payment?.termsDays} onChange={value => onChange(currentProfile => applyPaymentTerms(currentProfile, value.replace(/\D/g, '').slice(0, 3)))} />}
          <Text style={styles.help}>Les mentions de retard et l’indemnité de recouvrement restent configurées automatiquement pour les clients professionnels.</Text>
        </View>
        <StepButtons onBack={() => updateOnboardingStep(1)} onNext={() => updateOnboardingStep(3)} />
      </>}

      {step === 3 && <>
        <Text style={styles.subtitle}>Pour les travaux où une assurance doit apparaître sur le devis ou la facture, nous réutiliserons ces informations automatiquement.</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Avez-vous une assurance professionnelle / décennale à faire apparaître ?</Text>
          <Choice label="Oui" selected={profile.insurance?.status === INSURANCE_STATUSES.COVERED} onPress={() => setInsuranceStatus(INSURANCE_STATUSES.COVERED)} />
          <Choice label="Non / non applicable" selected={profile.insurance?.status === INSURANCE_STATUSES.NOT_APPLICABLE} onPress={() => setInsuranceStatus(INSURANCE_STATUSES.NOT_APPLICABLE)} />
          <Choice label="Je ne sais pas encore" selected={profile.insurance?.status === INSURANCE_STATUSES.UNKNOWN} onPress={() => setInsuranceStatus(INSURANCE_STATUSES.UNKNOWN)} />

          {profile.insurance?.status === INSURANCE_STATUSES.COVERED && <>
            <Field label="Assureur" value={profile.insurance?.insurer} onChange={value => update('insurance', 'insurer', value)} />
            <Field label="N° de police / contrat (optionnel)" value={profile.insurance?.policyNumber} onChange={value => update('insurance', 'policyNumber', value)} />
            <Field label="Zone géographique couverte" value={profile.insurance?.coverageArea || 'France'} onChange={value => update('insurance', 'coverageArea', value)} />
            <Text style={styles.fieldLabel}>Garantie décennale ?</Text>
            <View style={styles.row}>
              <Choice compact label="Oui" selected={profile.insurance?.decennialCoverage === true} onPress={() => update('insurance', 'decennialCoverage', true)} />
              <Choice compact label="Non" selected={profile.insurance?.decennialCoverage === false} onPress={() => update('insurance', 'decennialCoverage', false)} />
              <Choice compact label="À confirmer" selected={profile.insurance?.decennialCoverage == null} onPress={() => update('insurance', 'decennialCoverage', null)} />
            </View>
          </>}
          {profile.insurance?.status === INSURANCE_STATUSES.UNKNOWN && <Text style={styles.help}>Vous pourrez créer des brouillons. Le compte restera marqué « assurance à vérifier » pour éviter de l’oublier.</Text>}
        </View>
        {getCompanySetupMissingFields(profile).length > 0 && <View style={styles.warning}><Text style={styles.warningText}>Complétez les champs obligatoires de cette configuration avant de terminer.</Text></View>}
        <View style={styles.footerRow}>
          <Pressable style={styles.secondaryButton} onPress={() => updateOnboardingStep(2)}><Text style={styles.secondaryText}>Retour</Text></Pressable>
          <Pressable disabled={busy || getCompanySetupMissingFields(profile).length > 0} style={[styles.primaryButton, styles.flexButton, (busy || getCompanySetupMissingFields(profile).length > 0) && styles.disabled]} onPress={finish}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Créer ma première facture</Text>}
          </Pressable>
        </View>
      </>}
    </ScrollView>
  );
}

function StepButtons({ onBack, onNext, nextDisabled = false }) {
  return <View style={styles.footerRow}>
    <Pressable style={styles.secondaryButton} onPress={onBack}><Text style={styles.secondaryText}>Retour</Text></Pressable>
    <Pressable disabled={nextDisabled} style={[styles.primaryButton, styles.flexButton, nextDisabled && styles.disabled]} onPress={onNext}><Text style={styles.primaryButtonText}>Continuer</Text></Pressable>
  </View>;
}

function Field({ label, value, onChange, keyboardType = 'default', autoCapitalize = 'sentences' }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput value={String(value ?? '')} onChangeText={onChange} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input} />
  </View>;
}

function Choice({ label, selected, onPress, compact = false }) {
  return <Pressable onPress={onPress} style={[styles.choice, compact && styles.choiceCompact, selected && styles.choiceSelected]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? '✓ ' : ''}{label}</Text>
  </Pressable>;
}

function formatAddress(address = {}) {
  return [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}

function formatRate(value) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 56, backgroundColor: '#F7F5F1' },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  progressDot: { flex: 1, height: 5, borderRadius: 999, backgroundColor: '#DDD6CF' },
  progressDotActive: { backgroundColor: '#6D3E54' },
  eyebrow: { color: '#7A4E62', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  title: { color: '#211F23', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: '#676169', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 6 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DDD7D0', padding: 16, marginTop: 18 },
  confirmCard: { backgroundColor: '#EDF4EC', borderRadius: 18, borderWidth: 1, borderColor: '#C8DCC5', padding: 16, marginTop: 18 },
  cardKicker: { color: '#7A4E62', fontSize: 11, fontWeight: '850', letterSpacing: 0.9, marginBottom: 8 },
  companyName: { color: '#272328', fontSize: 21, fontWeight: '800', marginBottom: 6 },
  detail: { color: '#686169', fontSize: 13, lineHeight: 19, marginTop: 3 },
  field: { marginTop: 12 },
  fieldLabel: { color: '#5F5960', fontSize: 12, fontWeight: '750', marginTop: 10, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#D8D1CA', borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#FCFBF9', color: '#242126', fontSize: 15 },
  primaryButton: { backgroundColor: '#6D3E54', borderRadius: 14, minHeight: 50, paddingHorizontal: 16, paddingVertical: 14, marginTop: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: { borderRadius: 14, minHeight: 50, borderWidth: 1, borderColor: '#CFC7C0', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', marginTop: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#4D474D', fontWeight: '750' },
  linkButton: { alignItems: 'center', padding: 12, marginTop: 6 },
  linkText: { color: '#6D3E54', fontWeight: '750' },
  disabled: { opacity: 0.4 },
  finePrint: { color: '#8A838B', fontSize: 11, lineHeight: 16, marginTop: 9 },
  help: { color: '#777078', fontSize: 13, lineHeight: 19, marginTop: 10 },
  warning: { backgroundColor: '#FFF7E8', borderRadius: 14, borderWidth: 1, borderColor: '#E9D7A9', padding: 13, marginTop: 14 },
  warningText: { color: '#67573E', fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  choice: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#D8D1C9', backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 12, marginTop: 8, justifyContent: 'center' },
  choiceCompact: { minWidth: 92, flexGrow: 0 },
  choiceSelected: { borderColor: '#7A4E62', backgroundColor: '#F4E9EE' },
  choiceText: { color: '#5B555C', fontWeight: '700', lineHeight: 19 },
  choiceTextSelected: { color: '#6D3E54' },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch', marginTop: 8 },
  flexButton: { flex: 1 }
});
