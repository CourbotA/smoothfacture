const SEARCH_API = 'https://recherche-entreprises.api.gouv.fr/search';

export async function lookupCompanyBySiren(value) {
  const siren = String(value || '').replace(/\D/g, '').slice(0, 9);
  if (!/^\d{9}$/u.test(siren)) {
    const error = new Error('Saisissez un SIREN à 9 chiffres.');
    error.code = 'invalid_siren';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${SEARCH_API}?q=${encodeURIComponent(siren)}&per_page=1&page=1`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Annuaire indisponible (${response.status}).`);
    const payload = await response.json();
    const result = (payload.results || []).find(candidate => String(candidate.siren || '') === siren)
      || payload.results?.[0];
    if (!result || String(result.siren || '') !== siren) {
      const error = new Error('Aucune entreprise trouvée pour ce SIREN.');
      error.code = 'company_not_found';
      throw error;
    }
    return normalizeCompanyLookupResult(result);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('L’Annuaire des Entreprises ne répond pas. Vous pouvez saisir les informations manuellement.');
      timeoutError.code = 'company_lookup_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeCompanyLookupResult(result = {}) {
  const seat = result.siege || {};
  const street = [
    seat.numero_voie,
    seat.indice_repetition,
    seat.type_voie,
    seat.libelle_voie
  ].filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();

  return {
    legalName: String(result.nom_complet || result.nom_raison_sociale || result.nom_commercial || '').trim(),
    tradingName: String(result.nom_commercial || result.nom_complet || result.nom_raison_sociale || '').trim(),
    siren: String(result.siren || '').replace(/\D/g, '').slice(0, 9),
    siret: String(seat.siret || '').replace(/\D/g, '').slice(0, 14),
    apeCode: String(seat.activite_principale || result.activite_principale || '').trim(),
    address: {
      line1: street,
      line2: String(seat.complement_adresse || '').trim(),
      postalCode: String(seat.code_postal || '').trim(),
      city: String(seat.libelle_commune || '').trim(),
      countryCode: 'FR'
    },
    lookup: {
      source: 'annuaire-entreprises-data-gouv',
      fetchedAt: new Date().toISOString()
    }
  };
}

export function applyCompanyLookup(profile = {}, lookup = {}) {
  return {
    ...profile,
    legalName: lookup.legalName || profile.legalName || '',
    tradingName: lookup.tradingName || profile.tradingName || lookup.legalName || '',
    siren: lookup.siren || profile.siren || '',
    siret: lookup.siret || profile.siret || '',
    apeCode: lookup.apeCode || profile.apeCode || '',
    address: {
      ...(profile.address || {}),
      ...(lookup.address || {})
    },
    lookup: lookup.lookup || profile.lookup || null
  };
}
