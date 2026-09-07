const API_URL = String(process.env.EXPO_PUBLIC_SMOOTHFACTURE_API_URL || '').replace(/\/$/u, '');

export function isBackendConfigured() {
  return Boolean(API_URL);
}

export async function syncCompanyProfile(profile) {
  ensureConfigured();
  const serverId = profile?.serverId || '';
  const result = await request(serverId ? `/api/companies/${serverId}` : '/api/companies', {
    method: serverId ? 'PUT' : 'POST',
    body: { profile: stripLocalFields(profile) }
  });
  const { id, createdAt, updatedAt, ...serverProfile } = result.company;
  return { ...profile, ...serverProfile, serverId: id, serverCreatedAt: createdAt, serverUpdatedAt: updatedAt };
}

export async function saveInvoiceDraft({ companyId, invoice, recordId = null }) {
  ensureConfigured();
  if (!companyId) throw new Error('Enregistrez d’abord votre entreprise sur le serveur.');
  const result = await request(recordId ? `/api/invoices/${recordId}` : '/api/invoices/drafts', {
    method: recordId ? 'PUT' : 'POST',
    body: { companyId, invoice }
  });
  return result.record;
}

export async function finalizeInvoice({ companyId, recordId }) {
  ensureConfigured();
  if (!companyId || !recordId) throw new Error('Le brouillon doit être enregistré avant sa finalisation.');
  const result = await request(`/api/invoices/${recordId}/finalize`, {
    method: 'POST',
    body: { companyId }
  });
  return result.record;
}

export async function listInvoices(companyId, limit = 50) {
  ensureConfigured();
  const params = new URLSearchParams({ companyId, limit: String(limit) });
  const result = await request(`/api/invoices?${params.toString()}`);
  return result.records || [];
}

async function request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Erreur serveur (${response.status}).`);
      error.code = payload?.error?.code || 'api_error';
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Le serveur ne répond pas. Réessayez dans quelques instants.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function stripLocalFields(profile = {}) {
  const {
    id,
    serverId,
    createdAt,
    updatedAt,
    serverCreatedAt,
    serverUpdatedAt,
    ...serverProfile
  } = profile;
  return serverProfile;
}

function ensureConfigured() {
  if (!API_URL) {
    throw new Error('Serveur non configuré. Définissez EXPO_PUBLIC_SMOOTHFACTURE_API_URL dans l’application mobile.');
  }
}
