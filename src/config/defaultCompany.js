export const DEFAULT_COMPANY_PROFILE = Object.freeze({
  id: 'company-default',
  legalName: 'Courbot Gérard',
  tradingName: 'Courbot Gérard',
  legalForm: 'Entrepreneur individuel (EI) - micro-entreprise',
  siren: '538179649',
  siret: '53817964900016',
  vatNumber: '',
  apeCode: '4322A',
  address: {
    line1: '4 rue Bourbon',
    line2: '',
    postalCode: '62690',
    city: 'Aubigny-en-Artois',
    countryCode: 'FR'
  },
  contact: {
    phone: '06 70 79 48 67',
    email: 'gerardcourbot@gmail.com'
  },
  tax: {
    vatRegime: 'exempt_293b',
    vatLiability: 'exempt_293b',
    filingRegime: 'franchise_293b',
    vatOnDebits: null,
    defaultVatRate: 0,
    vatNumber: '',
    exemptionReason: 'TVA non applicable, art. 293 B du CGI',
    specialRegime: null
  },
  reform: {
    companySizeCategory: 'micro',
    establishedInFrance: true,
    supportsInternational: false,
    chorusProEnabled: false,
    vatGroup: false,
    fiscalRepresentative: false,
    selfBilling: false,
    paConnection: null
  },
  payment: {
    iban: 'FR76 1670 6000 7101 3972 9000 019',
    termsDays: 30,
    conditions: '30 jours',
    discount: 'Escompte pour paiement anticipé : néant',
    lateFees: 'Pénalités de retard : 3 fois le taux d’intérêt légal',
    recoveryFee: 'Indemnité forfaitaire de recouvrement : 40 € (clients professionnels)'
  }
});

export function cloneDefaultCompanyProfile() {
  return JSON.parse(JSON.stringify(DEFAULT_COMPANY_PROFILE));
}
