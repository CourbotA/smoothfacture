import { createServer } from 'node:http';
import { RepositoryError } from './invoiceRepository.js';

export function createHttpServer(repository) {
  return createServer(async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') return send(response, 204, null);

    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const path = url.pathname;

      if (request.method === 'GET' && path === '/health') {
        return send(response, 200, { ok: true, service: 'smoothfacture-server' });
      }

      if (request.method === 'POST' && path === '/api/companies') {
        const body = await readJson(request);
        return send(response, 201, { company: repository.createCompany(body.profile || body) });
      }

      const companyMatch = path.match(/^\/api\/companies\/([^/]+)$/u);
      if (companyMatch && request.method === 'GET') {
        const company = repository.getCompany(companyMatch[1]);
        if (!company) throw new RepositoryError('Entreprise introuvable.', 404, 'company_not_found');
        return send(response, 200, { company });
      }
      if (companyMatch && request.method === 'PUT') {
        const body = await readJson(request);
        return send(response, 200, { company: repository.updateCompany(companyMatch[1], body.profile || body) });
      }

      if (request.method === 'POST' && path === '/api/invoices/drafts') {
        const body = await readJson(request);
        requireString(body.companyId, 'companyId');
        return send(response, 201, { record: repository.createDraft(body.companyId, body.invoice) });
      }

      if (request.method === 'GET' && path === '/api/invoices') {
        const companyId = url.searchParams.get('companyId');
        requireString(companyId, 'companyId');
        return send(response, 200, { records: repository.listInvoices(companyId, { limit: url.searchParams.get('limit') }) });
      }

      const finalizeMatch = path.match(/^\/api\/invoices\/([^/]+)\/finalize$/u);
      if (finalizeMatch && request.method === 'POST') {
        const body = await readJson(request);
        requireString(body.companyId, 'companyId');
        return send(response, 200, { record: repository.finalize(finalizeMatch[1], body.companyId) });
      }

      const eventsMatch = path.match(/^\/api\/invoices\/([^/]+)\/events$/u);
      if (eventsMatch && request.method === 'GET') {
        const companyId = url.searchParams.get('companyId');
        requireString(companyId, 'companyId');
        return send(response, 200, { events: repository.listEvents(eventsMatch[1], companyId) });
      }

      const invoiceMatch = path.match(/^\/api\/invoices\/([^/]+)$/u);
      if (invoiceMatch && request.method === 'GET') {
        const companyId = url.searchParams.get('companyId');
        requireString(companyId, 'companyId');
        const record = repository.getInvoice(invoiceMatch[1], companyId);
        if (!record) throw new RepositoryError('Document introuvable.', 404, 'invoice_not_found');
        return send(response, 200, { record });
      }
      if (invoiceMatch && request.method === 'PUT') {
        const body = await readJson(request);
        requireString(body.companyId, 'companyId');
        return send(response, 200, { record: repository.updateDraft(invoiceMatch[1], body.companyId, body.invoice) });
      }

      return send(response, 404, { error: { code: 'not_found', message: 'Route introuvable.' } });
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error(error);
      return send(response, status, {
        error: {
          code: error.code || 'internal_error',
          message: status >= 500 ? 'Erreur serveur.' : error.message
        }
      });
    }
  });
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1_000_000) throw new RepositoryError('Requête trop volumineuse.', 413, 'payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RepositoryError('JSON invalide.', 400, 'invalid_json');
  }
}

function requireString(value, field) {
  if (!String(value || '').trim()) throw new RepositoryError(`${field} est obligatoire.`, 422, 'missing_field');
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.SMOOTHFACTURE_CORS_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
}

function send(response, status, body) {
  response.statusCode = status;
  if (body == null) return response.end();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}
