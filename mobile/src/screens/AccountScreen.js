import React, { useState } from 'react';
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

export default function AccountScreen({ profile, onSave, onRestartOnboarding, busy }) {
  const [draft, setDraft] = useState(profile);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');

  const update = (section, field, value) => setDraft(current => section
    ? { ...current, [section]: { ...(current[section] || {}), [field]: value } }
    : { ...current, [field]: value });

  const setVatRegime = regime => setDraft(current => ({
    ...current,
    tax: regime === VAT_REGIMES.STANDARD
      ? {
          ...(current.tax || {}),
          vatRegime: VAT_REGIMES.STANDARD,
          vatLiability: 'vat_registered',
          defaultVatRate: Number(current.tax?.defaultVatRate) || 20,
          exemptionReason: '',
          vatOnDebits: typeof current.tax?.vatOnDebits === 'boolean' ? current.tax.vatOnDebits : null
        }
      : {
          ...(current.tax || {}),
          vatRegime: VAT_REGIMES.EXEMPT_293B,
          vatLiability: 'exempt_293b',
          filingRegime: 'franchise_293b',
          defaultVatRate: 0,
          vatNumber: '',
          exemptionReason: VAT_EXEMPTION_293B,
          vatOnDebits: null
        }
  }));

  const refreshFromDirectory = async () => {
    setLookupBusy(true);
    setLookupMessage('');
    try {
      const lookup = await lookupCompanyBySiren(draft.siren);
      setDraft(current => applyCompanyLookup(current, lookup));
      setLookupMessage('Informations publiques mises à jour. Vérifiez puis enregistrez.');
    } catch (error) {
      setLookupMessage(error.message || 'Impossible de consulter l’Annuaire des Entreprises.');
    } finally {
      setLookupBusy(false);
    }
  };

  const missingFields = getCompanySetupMissingFields(draft);
  const paConnected = Boolean(draft.reform?.paConnection?.provider);
  const insuranceNeedsReview = draft.insurance?.status === INSURANCE_STATUSES.UNKNOWN;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>COMPTE</Text>
      <Text style={styles.title}>Vos réglages de facturation.</Text>
      <Text style={styles.subtitle}>Ces informations sont réutilisées automatiquement pour éviter de les redemander à chaque facture.</Text>

      <View style={[styles.statusCard, insuranceNeedsReview && styles.statusCardWarning]}>
        <Text style={styles.statusTitle}>{insuranceNeedsReview ? 'Configuration à surveiller' : 'Configuration enregistrée'}</Text>
        <Text style={styles.statusText}>{insuranceNeedsReview
          ? 'Votre assurance est encore indiquée comme « à confirmer ». Les autres réglages peuvent être utilisés.'
          : 'Identité, TVA, paiement et assurance sont disponibles pour vos documents.'}</Text>
      </View>

      <Section title="ENTREPRISE">
        <Field label="Nom légal" value={draft.legalName} onChange={value => update(null, 'legalName', value)} />
        <Field label="SIREN" keyboardType="number-pad" value={draft.siren} onChange={value => update(null, 'siren', value.replace(/\D/g, '').slice(0, 9))} />
        <Field label="SIRET" keyboardType="number-pad" value={draft.siret} onChange={value => update(null, 'siret', value.replace(/\D/g, '').slice(0, 14))} />
        <Field label="Code APE" value={draft.apeCode} onChange={value => update(null, 'apeCode', value.toUpperCase())} />
        <Field label="Adresse" value={draft.address?.line1} onChange={value => update('address', 'line1', value)} />
        <Field label="Code postal" keyboardType="number-pad" value={draft.address?.postalCode} onChange={value => update('address', 'postalCode', value.replace(/\D/g, '').slice(0, 5))} />
        <Field label="Ville" value={draft.address?.city} onChange={value => update('address', 'city', value)} />
        <Field label="E-mail (optionnel)" keyboardType="email-address" autoCapitalize="none" value={draft.contact?.email} onChange={value => update('contact', 'email', value)} />
        <Field label="Téléphone (optionnel)" keyboardType="phone-pad" value={draft.contact?.phone} onChange={value => update('contact', 'phone', value)} />
        <Pressable disabled={lookupBusy || !/^\d{9}$/u.test(String(draft.siren || ''))} style={[styles.secondaryButton, (lookupBusy || !/^\d{9}$/u.test(String(draft.siren || ''))) && styles.disabled]} onPress={refreshFromDirectory}>
          {lookupBusy ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Actualiser depuis l’Annuaire des Entreprises</Text>}
        </Pressable>
        {!!lookupMessage && <Text style={styles.help}>{lookupMessage}</Text>}
      </Section>

      <Section title="TVA">
        <Choice label="Franchise en base · art. 293 B" selected={draft.tax?.vatRegime !== VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.EXEMPT_293B)} />
        <Choice label="Je facture la TVA" selected={draft.tax?.vatRegime === VAT_REGIMES.STANDARD} onPress={() => setVatRegime(VAT_REGIMES.STANDARD)} />
        {draft.tax?.vatRegime === VAT_REGIMES.STANDARD ? <>
          <Field label="Numéro de TVA intracommunautaire" autoCapitalize="characters" value={draft.tax?.vatNumber || draft.vatNumber} onChange={value => update('tax', 'vatNumber', value.replace(/\s/g, '').toUpperCase().slice(0, 20))} />
          <Text style={styles.fieldLabel}>TVA sur les débits</Text>
          <View style={styles.row}>
            <Choice compact label="Oui" selected={draft.tax?.vatOnDebits === true} onPress={() => update('tax', 'vatOnDebits', true)} />
            <Choice compact label="Non" selected={draft.tax?.vatOnDebits === false} onPress={() => update('tax', 'vatOnDebits', false)} />
            <Choice compact label="À confirmer" selected={draft.tax?.vatOnDebits == null} onPress={() => update('tax', 'vatOnDebits', null)} />
          </View>
          <Text style={styles.fieldLabel}>Taux par défaut</Text>
          <View style={styles.row}>{VAT_RATES.map(rate => <Choice key={rate} compact label={`${formatRate(rate)} %`} selected={Number(draft.tax?.defaultVatRate) === rate} onPress={() => update('tax', 'defaultVatRate', rate)} />)}</View>
        </> : <Text style={styles.help}>{draft.tax?.exemptionReason || VAT_EXEMPTION_293B}</Text>}
      </Section>

      <Section title="PAIEMENT">
        <Text style={styles.fieldLabel}>Délai habituel</Text>
        <View style={styles.row}>{PAYMENT_TERM_PRESETS.map(item => <Choice key={item.key} compact label={item.label} selected={Number(draft.payment?.termsDays) === item.days} onPress={() => setDraft(current => applyPaymentTerms(current, item.days))} />)}</View>
        <Field label="Autre délai en jours" keyboardType="number-pad" value={draft.payment?.termsDays} onChange={value => setDraft(current => applyPaymentTerms(current, value.replace(/\D/g, '').slice(0, 3)))} />
        <Field label="IBAN (optionnel)" autoCapitalize="characters" value={draft.payment?.iban} onChange={value => update('payment', 'iban', value.replace(/\s/g, '').toUpperCase())} />
        <Text style={styles.help}>Les clauses de retard et l’indemnité forfaitaire restent dans le profil et seront utilisées pour les clients professionnels.</Text>
      </Section>

      <Section title="ASSURANCE">
        <Choice label="Assurance à faire apparaître" selected={draft.insurance?.status === INSURANCE_STATUSES.COVERED} onPress={() => update('insurance', 'status', INSURANCE_STATUSES.COVERED)} />
        <Choice label="Non applicable" selected={draft.insurance?.status === INSURANCE_STATUSES.NOT_APPLICABLE} onPress={() => update('insurance', 'status', INSURANCE_STATUSES.NOT_APPLICABLE)} />
        <Choice label="À confirmer" selected={draft.insurance?.status === INSURANCE_STATUSES.UNKNOWN} onPress={() => update('insurance', 'status', INSURANCE_STATUSES.UNKNOWN)} />
        {draft.insurance?.status === INSURANCE_STATUSES.COVERED && <>
          <Field label="Assureur" value={draft.insurance?.insurer} onChange={value => update('insurance', 'insurer', value)} />
          <Field label="N° de police / contrat" value={draft.insurance?.policyNumber} onChange={value => update('insurance', 'policyNumber', value)} />
          <Field label="Zone couverte" value={draft.insurance?.coverageArea} onChange={value => update('insurance', 'coverageArea', value)} />
          <Text style={styles.fieldLabel}>Garantie décennale</Text>
          <View style={styles.row}>
            <Choice compact label="Oui" selected={draft.insurance?.decennialCoverage === true} onPress={() => update('insurance', 'decennialCoverage', true)} />
            <Choice compact label="Non" selected={draft.insurance?.decennialCoverage === false} onPress={() => update('insurance', 'decennialCoverage', false)} />
            <Choice compact label="À confirmer" selected={draft.insurance?.decennialCoverage == null} onPress={() => update('insurance', 'decennialCoverage', null)} />
          </View>
        </>}
      </Section>

      <Section title="FACTURATION ÉLECTRONIQUE">
        <InfoRow label="Réception obligatoire" value="Depuis le 1er septembre 2026" />
        <InfoRow label="Émission TPE / PME" value="À partir du 1er septembre 2027" />
        <InfoRow label="Plateforme Agréée" value={paConnected ? `Connectée · ${draft.reform.paConnection.provider}` : 'Non connectée'} />
        {!paConnected && <Text style={styles.help}>La connexion à une Plateforme Agréée sera ajoutée dans l’étape d’intégration réglementaire. Elle ne bloque pas la saisie de vos brouillons aujourd’hui.</Text>}
      </Section>

      {missingFields.length > 0 && <View style={styles.warningCard}>
        <Text style={styles.warningText}>Complétez les informations obligatoires avant d’enregistrer ces modifications.</Text>
      </View>}

      <Pressable disabled={busy || missingFields.length > 0} style={[styles.primaryButton, (busy || missingFields.length > 0) && styles.disabled]} onPress={() => onSave(draft)}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Enregistrer les modifications</Text>}
      </Pressable>
      <Pressable style={styles.linkButton} onPress={onRestartOnboarding}><Text style={styles.linkText}>Refaire la configuration guidée</Text></Pressable>
    </ScrollView>
  );
}

function Section({ title, children }) {
  return <View style={styles.card}><Text style={styles.cardKicker}>{title}</Text>{children}</View>;
}

function InfoRow({ label, value }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function Field({ label, value, onChange, keyboardType = 'default', autoCapitalize = 'sentences' }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput value={String(value ?? '')} onChangeText={onChange} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={styles.input} />
  </View>;
}

function Choice({ label, selected, onPress, compact = false }) {
  return <Pressable onPress={onPress} style={[styles.choice, compact && styles.choiceCompact, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
}

function formatRate(value) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 56, backgroundColor: '#F7F5F1' },
  eyebrow: { color: '#7A4E62', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  title: { color: '#211F23', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: '#676169', fontSize: 15, lineHeight: 22, marginTop: 10 },
  statusCard: { backgroundColor: '#E8F1E8', borderRadius: 16, borderWidth: 1, borderColor: '#CADBCB', padding: 16, marginTop: 18 },
  statusCardWarning: { backgroundColor: '#FFF7E8', borderColor: '#E9D7A9' },
  statusTitle: { color: '#343038', fontWeight: '850', marginBottom: 5 },
  statusText: { color: '#686169', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DDD7D0', padding: 16, marginTop: 18 },
  cardKicker: { color: '#7A4E62', fontSize: 11, fontWeight: '850', letterSpacing: 0.9, marginBottom: 8 },
  field: { marginTop: 10 },
  fieldLabel: { color: '#5F5960', fontSize: 12, fontWeight: '750', marginTop: 8, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D8D1CA', borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#FCFBF9', color: '#242126', fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  choice: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D8D1C9', backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, marginTop: 8, justifyContent: 'center' },
  choiceCompact: { minWidth: 86 },
  choiceSelected: { borderColor: '#7A4E62', backgroundColor: '#F4E9EE' },
  choiceText: { color: '#5B555C', fontWeight: '700' },
  choiceTextSelected: { color: '#6D3E54' },
  help: { color: '#777078', fontSize: 13, lineHeight: 19, marginTop: 10 },
  secondaryButton: { borderRadius: 13, borderWidth: 1, borderColor: '#CFC7C0', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF', marginTop: 14, alignItems: 'center' },
  secondaryText: { color: '#4D474D', fontWeight: '750' },
  primaryButton: { backgroundColor: '#6D3E54', borderRadius: 15, minHeight: 52, paddingHorizontal: 18, paddingVertical: 15, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  linkButton: { alignItems: 'center', padding: 14, marginTop: 4 },
  linkText: { color: '#6D3E54', fontWeight: '750' },
  infoRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2DDD6', paddingVertical: 10 },
  infoLabel: { color: '#777078', fontSize: 12, marginBottom: 3 },
  infoValue: { color: '#343038', fontWeight: '750' },
  warningCard: { backgroundColor: '#FFF7E8', borderRadius: 14, borderWidth: 1, borderColor: '#E9D7A9', padding: 13, marginTop: 18 },
  warningText: { color: '#67573E', fontSize: 13, lineHeight: 19 }
});
