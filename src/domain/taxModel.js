export const VAT_REGIMES = Object.freeze({
  EXEMPT_293B: 'exempt_293b',
  STANDARD: 'standard'
});

export const VAT_TREATMENTS = Object.freeze({
  EXEMPT: 'exempt',
  DOMESTIC: 'domestic',
  REVERSE_CHARGE_BTP: 'reverse_charge_btp'
});

export const VAT_RATES = Object.freeze([20, 10, 5.5]);

export const VAT_EXEMPTION_293B = 'TVA non applicable, art. 293 B du CGI';
export const VAT_REVERSE_CHARGE_BTP = 'Autoliquidation';

export function createInvoiceTaxSettings(companyProfile = {}) {
  const regime = normalizeVatRegime(companyProfile?.tax?.vatRegime);
  if (regime === VAT_REGIMES.EXEMPT_293B) {
    return {
      regime,
      treatment: VAT_TREATMENTS.EXEMPT,
      defaultVatRate: 0,
      exemptionReason: companyProfile?.tax?.exemptionReason || VAT_EXEMPTION_293B,
      reverseChargeReason: '',
      reducedRateCertificationConfirmed: false
    };
  }

  return {
    regime,
    treatment: VAT_TREATMENTS.DOMESTIC,
    defaultVatRate: normalizeVatRate(companyProfile?.tax?.defaultVatRate) ?? 20,
    exemptionReason: '',
    reverseChargeReason: '',
    reducedRateCertificationConfirmed: false
  };
}

export function applyTaxDefaultsToLines(lines = [], tax = {}) {
  const treatment = tax?.treatment || VAT_TREATMENTS.DOMESTIC;
  const fallbackRate = treatment === VAT_TREATMENTS.EXEMPT
    ? 0
    : normalizeVatRate(tax?.defaultVatRate);

  return (lines || []).map(line => ({
    ...line,
    vatRate: normalizeVatRate(line?.vatRate) ?? fallbackRate
  }));
}

export function setInvoiceTaxTreatment(invoice, treatment) {
  const currentTax = invoice?.tax || {};
  const regime = currentTax.regime || VAT_REGIMES.STANDARD;
  let nextTreatment = treatment;

  if (regime === VAT_REGIMES.EXEMPT_293B) nextTreatment = VAT_TREATMENTS.EXEMPT;
  if (!Object.values(VAT_TREATMENTS).includes(nextTreatment)) nextTreatment = VAT_TREATMENTS.DOMESTIC;

  const tax = {
    ...currentTax,
    treatment: nextTreatment,
    exemptionReason: nextTreatment === VAT_TREATMENTS.EXEMPT
      ? (currentTax.exemptionReason || VAT_EXEMPTION_293B)
      : '',
    reverseChargeReason: nextTreatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP
      ? VAT_REVERSE_CHARGE_BTP
      : ''
  };

  return recalculateInvoiceTax({ ...invoice, tax });
}

export function setLineVatRate(invoice, lineId, rate) {
  const normalizedRate = normalizeVatRate(rate);
  const lines = (invoice?.lines || []).map(line => line.id === lineId
    ? { ...line, vatRate: normalizedRate }
    : line);
  return recalculateInvoiceTax({ ...invoice, lines });
}

export function setReducedRateCertification(invoice, confirmed) {
  return recalculateInvoiceTax({
    ...invoice,
    tax: {
      ...(invoice?.tax || {}),
      reducedRateCertificationConfirmed: Boolean(confirmed)
    }
  });
}

export function recalculateInvoiceTax(invoice = {}) {
  const tax = normalizeTaxSettings(invoice.tax || {});
  const lines = applyTaxDefaultsToLines(invoice.lines || [], tax);
  const taxBreakdown = buildTaxBreakdown(lines, tax);
  const totals = calculateTaxTotals(lines, taxBreakdown);

  return {
    ...invoice,
    tax,
    lines,
    taxBreakdown,
    totals
  };
}

export function buildTaxBreakdown(lines = [], tax = {}) {
  const treatment = tax?.treatment || VAT_TREATMENTS.DOMESTIC;
  const groups = new Map();

  for (const line of lines) {
    const amount = finiteMoney(line?.totalExcludingTax);
    const rate = treatment === VAT_TREATMENTS.EXEMPT ? 0 : normalizeVatRate(line?.vatRate);
    const key = rate == null ? 'unknown' : String(rate);
    const current = groups.get(key) || { vatRate: rate, taxableBase: 0 };
    current.taxableBase = roundMoney(current.taxableBase + amount);
    groups.set(key, current);
  }

  if (!groups.size) groups.set(treatment === VAT_TREATMENTS.EXEMPT ? '0' : 'unknown', {
    vatRate: treatment === VAT_TREATMENTS.EXEMPT ? 0 : null,
    taxableBase: 0
  });

  return Array.from(groups.values()).map(group => {
    if (treatment === VAT_TREATMENTS.EXEMPT) {
      return {
        vatRate: 0,
        taxableBase: group.taxableBase,
        taxAmount: 0,
        taxCategory: 'exempt',
        exemptionReason: tax.exemptionReason || VAT_EXEMPTION_293B
      };
    }

    if (treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP) {
      return {
        vatRate: group.vatRate,
        taxableBase: group.taxableBase,
        taxAmount: 0,
        taxCategory: 'reverse_charge',
        exemptionReason: tax.reverseChargeReason || VAT_REVERSE_CHARGE_BTP
      };
    }

    return {
      vatRate: group.vatRate,
      taxableBase: group.taxableBase,
      taxAmount: group.vatRate == null ? null : roundMoney(group.taxableBase * group.vatRate / 100),
      taxCategory: 'standard',
      exemptionReason: ''
    };
  }).sort((a, b) => Number(b.vatRate || 0) - Number(a.vatRate || 0));
}

export function calculateTaxTotals(lines = [], taxBreakdown = []) {
  const excludingTax = roundMoney((lines || []).reduce((sum, line) => sum + finiteMoney(line?.totalExcludingTax), 0));
  const tax = roundMoney((taxBreakdown || []).reduce((sum, row) => sum + finiteMoney(row?.taxAmount), 0));
  return {
    excludingTax,
    tax,
    includingTax: roundMoney(excludingTax + tax)
  };
}

export function hasReducedVatRate(invoice) {
  if (invoice?.tax?.treatment !== VAT_TREATMENTS.DOMESTIC) return false;
  return (invoice?.lines || []).some(line => [5.5, 10].includes(normalizeVatRate(line?.vatRate)));
}

export function validateTaxConfiguration(invoice = {}) {
  const issues = [];
  const tax = normalizeTaxSettings(invoice.tax || {});

  if (tax.regime === VAT_REGIMES.EXEMPT_293B && tax.treatment !== VAT_TREATMENTS.EXEMPT) {
    issues.push(taxIssue('tax.treatment', 'Le régime franchise en base doit rester sans TVA.', true, 'invalid_exempt_treatment'));
  }

  if (tax.regime === VAT_REGIMES.STANDARD && tax.treatment === VAT_TREATMENTS.EXEMPT) {
    issues.push(taxIssue('tax.treatment', 'Choisissez TVA normale ou autoliquidation BTP.', true, 'invalid_standard_treatment'));
  }

  if (tax.treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP && invoice?.buyer?.type !== 'company') {
    issues.push(taxIssue('tax.treatment', 'L’autoliquidation BTP nécessite un client professionnel assujetti.', true, 'reverse_charge_requires_company'));
  }

  if (tax.treatment === VAT_TREATMENTS.DOMESTIC) {
    (invoice?.lines || []).forEach((line, index) => {
      if (line?.totalExcludingTax == null || line?.includedWithoutPrice) return;
      if (normalizeVatRate(line?.vatRate) == null) {
        issues.push(taxIssue(`lines.${index}.vatRate`, `Taux de TVA à préciser sur la ligne ${index + 1}.`, true, 'missing_vat_rate'));
      }
    });

    if (hasReducedVatRate(invoice) && !tax.reducedRateCertificationConfirmed) {
      issues.push(taxIssue(
        'tax.reducedRateCertificationConfirmed',
        'Confirmez que les conditions du taux réduit de TVA sont remplies pour ces travaux.',
        true,
        'reduced_rate_certification_required'
      ));
    }
  }

  return issues;
}

export function normalizeVatRate(value) {
  if (value === '' || value == null) return null;
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  return [0, ...VAT_RATES].find(rate => Math.abs(rate - number) < 0.001) ?? null;
}

function normalizeVatRegime(value) {
  return value === VAT_REGIMES.STANDARD ? VAT_REGIMES.STANDARD : VAT_REGIMES.EXEMPT_293B;
}

function normalizeTaxSettings(tax = {}) {
  const regime = normalizeVatRegime(tax.regime);
  const defaultVatRate = regime === VAT_REGIMES.EXEMPT_293B ? 0 : (normalizeVatRate(tax.defaultVatRate) ?? 20);
  const treatment = regime === VAT_REGIMES.EXEMPT_293B
    ? VAT_TREATMENTS.EXEMPT
    : (tax.treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP ? VAT_TREATMENTS.REVERSE_CHARGE_BTP : VAT_TREATMENTS.DOMESTIC);

  return {
    ...tax,
    regime,
    treatment,
    defaultVatRate,
    exemptionReason: treatment === VAT_TREATMENTS.EXEMPT ? (tax.exemptionReason || VAT_EXEMPTION_293B) : '',
    reverseChargeReason: treatment === VAT_TREATMENTS.REVERSE_CHARGE_BTP ? (tax.reverseChargeReason || VAT_REVERSE_CHARGE_BTP) : '',
    reducedRateCertificationConfirmed: Boolean(tax.reducedRateCertificationConfirmed)
  };
}

function finiteMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function taxIssue(field, message, blocking = false, code = 'invalid_tax_configuration') {
  return { field, message, blocking, code };
}
