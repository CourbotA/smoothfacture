import { randomUUID } from 'node:crypto';
import { validateElectronicInvoiceReadiness } from '../../src/domain/invoiceCompliance.js';
import { recalculateInvoiceTax } from '../../src/domain/taxModel.js';
import { upgradeCanonicalInvoice } from '../../src/domain/invoiceModel.js';

export class RepositoryError extends Error {
  constructor(message, statusCode = 400, code = 'repository_error') {
    super(message);
    this.name = 'RepositoryError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InvoiceRepository {
  constructor(db) {
    this.db = db;
    this.finalizeTransaction = db.transaction((invoiceId, companyId) => this.#finalize(invoiceId, companyId));
  }

  createCompany(profile) {
    const normalized = normalizeCompany(profile);
    const existing = normalized.siren
      ? this.db.prepare('SELECT id FROM companies WHERE siren = ?').get(normalized.siren)
      : null;

    if (existing) return this.updateCompany(existing.id, normalized);

    const id = randomUUID();
    const now = timestamp();
    this.db.prepare(`
      INSERT INTO companies (id, legal_name, siren, siret, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, normalized.legalName, normalized.siren, normalized.siret, json(normalized), now, now);
    return { id, ...normalized, createdAt: now, updatedAt: now };
  }

  updateCompany(id, profile) {
    const current = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    if (!current) throw new RepositoryError('Entreprise introuvable.', 404, 'company_not_found');
    const normalized = normalizeCompany(profile);
    const now = timestamp();
    this.db.prepare(`
      UPDATE companies
      SET legal_name = ?, siren = ?, siret = ?, profile_json = ?, updated_at = ?
      WHERE id = ?
    `).run(normalized.legalName, normalized.siren, normalized.siret, json(normalized), now, id);
    return { id, ...normalized, createdAt: current.created_at, updatedAt: now };
  }

  getCompany(id) {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    return row ? hydrateCompany(row) : null;
  }

  createDraft(companyId, invoice) {
    const company = this.#requireCompany(companyId);
    const normalized = normalizeInvoice(invoice, company);
    const id = randomUUID();
    const now = timestamp();
    const customerId = this.#upsertCustomer(companyId, normalized.buyer);
    const totals = calculateTotals(normalized);

    this.db.prepare(`
      INSERT INTO invoices (
        id, company_id, customer_id, document_type, status, invoice_number,
        issue_date, due_date, currency, total_excluding_tax, total_tax,
        total_including_tax, canonical_json, created_at, updated_at, finalized_at
      ) VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id, companyId, customerId, normalized.documentType,
      normalized.issueDate || null, normalized.dueDate || null,
      normalized.currency || 'EUR',
      totals.excludingTax, totals.tax, totals.includingTax,
      json({ ...normalized, id, number: null }), now, now
    );

    this.#appendEvent(id, 'draft_created', {
      companyId,
      schemaVersion: normalized.schemaVersion,
      regulatoryRoute: normalized.regulatory?.route || null
    });
    return this.getInvoice(id, companyId);
  }

  updateDraft(invoiceId, companyId, invoice) {
    const current = this.#requireInvoice(invoiceId, companyId);
    if (current.status !== 'draft') {
      throw new RepositoryError('Une facture finalisée ne peut plus être modifiée.', 409, 'invoice_immutable');
    }

    const company = this.#requireCompany(companyId);
    const normalized = normalizeInvoice(invoice, company);
    const customerId = this.#upsertCustomer(companyId, normalized.buyer);
    const totals = calculateTotals(normalized);
    const now = timestamp();

    this.db.prepare(`
      UPDATE invoices
      SET customer_id = ?, document_type = ?, issue_date = ?, due_date = ?, currency = ?,
          total_excluding_tax = ?, total_tax = ?, total_including_tax = ?,
          canonical_json = ?, updated_at = ?
      WHERE id = ? AND company_id = ?
    `).run(
      customerId, normalized.documentType, normalized.issueDate || null, normalized.dueDate || null,
      normalized.currency || 'EUR',
      totals.excludingTax, totals.tax, totals.includingTax,
      json({ ...normalized, id: invoiceId, number: null }), now, invoiceId, companyId
    );

    this.#appendEvent(invoiceId, 'draft_updated', {
      schemaVersion: normalized.schemaVersion,
      regulatoryRoute: normalized.regulatory?.route || null
    });
    return this.getInvoice(invoiceId, companyId);
  }

  finalize(invoiceId, companyId) {
    return this.finalizeTransaction(invoiceId, companyId);
  }

  getInvoice(invoiceId, companyId) {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ? AND company_id = ?').get(invoiceId, companyId);
    return row ? hydrateInvoice(row) : null;
  }

  listInvoices(companyId, { limit = 50 } = {}) {
    this.#requireCompany(companyId);
    const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
    return this.db.prepare(`
      SELECT * FROM invoices
      WHERE company_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(companyId, safeLimit).map(hydrateInvoice);
  }

  listEvents(invoiceId, companyId) {
    this.#requireInvoice(invoiceId, companyId);
    return this.db.prepare(`
      SELECT id, event_type, payload_json, created_at
      FROM invoice_events
      WHERE invoice_id = ?
      ORDER BY id ASC
    `).all(invoiceId).map(row => ({
      id: row.id,
      type: row.event_type,
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at
    }));
  }

  #finalize(invoiceId, companyId) {
    const current = this.#requireInvoice(invoiceId, companyId);
    if (current.status === 'finalized') return hydrateInvoice(current);
    if (current.status !== 'draft') {
      throw new RepositoryError('Ce document ne peut pas être finalisé.', 409, 'invalid_invoice_state');
    }

    const company = this.#requireCompany(companyId);
    const canonical = normalizeInvoice(parseJson(current.canonical_json, {}), company);
    assertFinalizable(canonical, company);

    const number = this.#allocateNumber(companyId, current.document_type);
    const now = timestamp();
    const finalCanonical = recalculateInvoiceTax({
      ...canonical,
      id: invoiceId,
      number,
      electronicInvoice: {
        ...(canonical.electronicInvoice || {}),
        lifecycleStatus: 'finalized',
        transmissionStatus: canonical.electronicInvoice?.transmissionStatus || 'not_sent'
      }
    });
    const totals = calculateTotals(finalCanonical);

    this.db.prepare(`
      UPDATE invoices
      SET status = 'finalized', invoice_number = ?, canonical_json = ?,
          total_excluding_tax = ?, total_tax = ?, total_including_tax = ?,
          updated_at = ?, finalized_at = ?
      WHERE id = ? AND company_id = ?
    `).run(
      number, json(finalCanonical), totals.excludingTax, totals.tax, totals.includingTax,
      now, now, invoiceId, companyId
    );

    this.#appendEvent(invoiceId, 'finalized', {
      number,
      documentType: current.document_type,
      schemaVersion: finalCanonical.schemaVersion,
      regulatoryRoute: finalCanonical.regulatory?.route || null,
      regulatoryReady: validateElectronicInvoiceReadiness(finalCanonical, {
        companyProfile: company,
        effectiveDate: finalCanonical.issueDate || now.slice(0, 10)
      }).regulatoryReady
    });
    return this.getInvoice(invoiceId, companyId);
  }

  #allocateNumber(companyId, documentType) {
    const now = timestamp();
    const row = this.db.prepare(`
      INSERT INTO invoice_sequences (company_id, document_type, next_value, updated_at)
      VALUES (?, ?, 2, ?)
      ON CONFLICT(company_id, document_type) DO UPDATE SET
        next_value = invoice_sequences.next_value + 1,
        updated_at = excluded.updated_at
      RETURNING next_value - 1 AS number
    `).get(companyId, documentType, now);

    if (!Number.isInteger(row?.number) || row.number < 1) {
      throw new RepositoryError('Impossible de réserver un numéro de document.', 500, 'sequence_allocation_failed');
    }
    return row.number;
  }

  #upsertCustomer(companyId, buyer = {}) {
    const normalized = normalizeParty(buyer);
    if (!normalized.legalName) return null;
    const now = timestamp();

    if (normalized.siren) {
      const existing = this.db.prepare(`
        SELECT id FROM customers WHERE company_id = ? AND siren = ?
      `).get(companyId, normalized.siren);
      if (existing) {
        this.db.prepare(`
          UPDATE customers
          SET customer_type = ?, legal_name = ?, party_json = ?, updated_at = ?
          WHERE id = ?
        `).run(normalized.type, normalized.legalName, json(normalized), now, existing.id);
        return existing.id;
      }
    }

    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO customers (id, company_id, customer_type, legal_name, siren, party_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, companyId, normalized.type, normalized.legalName, normalized.siren || null, json(normalized), now, now);
    return id;
  }

  #appendEvent(invoiceId, type, payload) {
    this.db.prepare(`
      INSERT INTO invoice_events (invoice_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(invoiceId, type, json(payload || {}), timestamp());
  }

  #requireCompany(companyId) {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!row) throw new RepositoryError('Entreprise introuvable.', 404, 'company_not_found');
    return hydrateCompany(row);
  }

  #requireInvoice(invoiceId, companyId) {
    const row = this.db.prepare('SELECT * FROM invoices WHERE id = ? AND company_id = ?').get(invoiceId, companyId);
    if (!row) throw new RepositoryError('Document introuvable.', 404, 'invoice_not_found');
    return row;
  }
}

function normalizeCompany(profile = {}) {
  const legalName = String(profile.legalName || '').trim();
  if (!legalName) throw new RepositoryError('Le nom légal de l’entreprise est obligatoire.', 422, 'invalid_company');
  return {
    ...profile,
    legalName,
    siren: digits(profile.siren, 9),
    siret: digits(profile.siret, 14),
    address: normalizeAddress(profile.address),
    reform: {
      companySizeCategory: 'unknown',
      establishedInFrance: profile.address?.countryCode === 'FR',
      supportsInternational: false,
      chorusProEnabled: false,
      vatGroup: false,
      fiscalRepresentative: false,
      selfBilling: false,
      paConnection: null,
      ...(profile.reform || {})
    }
  };
}

function normalizeInvoice(invoice = {}, companyProfile = {}) {
  if (!invoice || typeof invoice !== 'object') throw new RepositoryError('Document invalide.', 422, 'invalid_invoice');
  const upgraded = upgradeCanonicalInvoice(invoice, companyProfile);
  return recalculateInvoiceTax({
    ...upgraded,
    documentType: upgraded.documentType === 'devis' ? 'devis' : 'facture',
    seller: upgradeCanonicalInvoice({ seller: upgraded.seller, buyer: {}, lines: [], documentType: 'devis' }, companyProfile).seller,
    buyer: normalizeParty(upgraded.buyer || {}),
    lines: Array.isArray(upgraded.lines) ? upgraded.lines.map(line => ({ ...line })) : [],
    number: null
  });
}

function normalizeParty(party = {}) {
  const type = ['company', 'individual', 'public_entity'].includes(party.type) ? party.type : 'individual';
  return {
    ...party,
    type,
    legalName: String(party.legalName || '').trim(),
    siren: digits(party.siren, 9),
    siret: digits(party.siret, 14),
    vatNumber: String(party.vatNumber || '').trim(),
    foreignBusinessId: String(party.foreignBusinessId || '').trim(),
    countryCode: normalizeCountryCode(party.countryCode || party.address?.countryCode),
    address: normalizeAddress(party.address)
  };
}

function assertFinalizable(invoice, companyProfile) {
  const readiness = validateElectronicInvoiceReadiness(invoice, {
    companyProfile,
    effectiveDate: invoice.issueDate || new Date()
  });
  if (!readiness.ready) {
    const messages = readiness.issues.filter(issue => issue.blocking).map(issue => issue.message);
    throw new RepositoryError(`Impossible de finaliser : ${messages.join(' ; ')}`, 422, 'invoice_not_ready');
  }
}

function calculateTotals(invoice) {
  const totals = invoice?.totals || {};
  const excludingTax = roundMoney(finite(totals.excludingTax));
  const tax = roundMoney(finite(totals.tax));
  return { excludingTax, tax, includingTax: roundMoney(finite(totals.includingTax)) };
}

function hydrateCompany(row) {
  return {
    id: row.id,
    ...parseJson(row.profile_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateInvoice(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    status: row.status,
    number: row.invoice_number,
    documentType: row.document_type,
    totals: {
      excludingTax: row.total_excluding_tax,
      tax: row.total_tax,
      includingTax: row.total_including_tax
    },
    invoice: parseJson(row.canonical_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at
  };
}

function normalizeAddress(address = {}) {
  const safe = address && typeof address === 'object' ? address : {};
  return {
    ...safe,
    line1: String(safe.line1 || '').trim(),
    line2: String(safe.line2 || '').trim(),
    postalCode: String(safe.postalCode || '').trim(),
    city: String(safe.city || '').trim(),
    countryCode: normalizeCountryCode(safe.countryCode)
  };
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(code) ? code : '';
}

function digits(value, length) {
  const normalized = String(value || '').replace(/\D/g, '');
  return normalized.length === length ? normalized : '';
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function timestamp() {
  return new Date().toISOString();
}
