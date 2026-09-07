import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(filename = process.env.SMOOTHFACTURE_DB_PATH || './data/smoothfacture.db') {
  const resolved = filename === ':memory:' ? filename : resolve(process.cwd(), filename);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });

  const db = new Database(resolved);
  db.pragma('foreign_keys = ON');
  if (resolved !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      siren TEXT,
      siret TEXT,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS companies_siren_unique
      ON companies(siren)
      WHERE siren IS NOT NULL AND siren <> '';

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_type TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      siren TEXT,
      party_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS customers_company_siren_unique
      ON customers(company_id, siren)
      WHERE siren IS NOT NULL AND siren <> '';

    CREATE TABLE IF NOT EXISTS invoice_sequences (
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      next_value INTEGER NOT NULL CHECK(next_value > 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (company_id, document_type)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'finalized', 'cancelled')),
      invoice_number INTEGER,
      issue_date TEXT,
      due_date TEXT,
      currency TEXT NOT NULL DEFAULT 'EUR',
      total_excluding_tax REAL NOT NULL DEFAULT 0,
      total_tax REAL NOT NULL DEFAULT 0,
      total_including_tax REAL NOT NULL DEFAULT 0,
      canonical_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finalized_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_unique
      ON invoices(company_id, document_type, invoice_number)
      WHERE invoice_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS invoices_company_status_idx
      ON invoices(company_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS invoice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS invoice_events_invoice_idx
      ON invoice_events(invoice_id, id);
  `);

  return db;
}
