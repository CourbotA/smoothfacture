# SmoothFacture backend — P0

This service owns durable business data that must not live only in a browser or phone:

- company profiles;
- reusable customers;
- invoice/devis drafts;
- final document numbers;
- canonical tax data and server-recalculated totals;
- append-only invoice lifecycle events.

## Important numbering rule

Creating or updating a draft **does not consume a number**.

A number is allocated only by:

```http
POST /api/invoices/:id/finalize
```

Finalization runs inside a SQLite transaction. Calling it again for an already-finalized document returns the existing number instead of consuming another one. Finalized document contents cannot be updated through the draft endpoint.

Invoice and devis sequences are independent per company.

## VAT / BTP P0 model

The canonical invoice supports:

- franchise en base — article 293 B;
- standard French VAT rates used by the product: 20 %, 10 % and 5.5 %;
- mixed rates across invoice lines;
- BTP subcontracting reverse charge (`reverse_charge_btp` / `Autoliquidation`);
- explicit reduced-rate certification before finalization.

Tax totals sent by the phone are **not trusted**. The server runs `recalculateInvoiceTax()` before persistence/finalization and stores the recalculated HT, TVA and TTC totals.

Reduced 10 % / 5.5 % rates are user-selected and require confirmation; the parser does not infer legal eligibility from free-form work descriptions. This is deliberate because the applicable reduced rate depends on factual conditions of the property/work rather than wording alone.

Current implementation assumptions are based on the 2026 French invoicing/VAT rules: standard 20 %, reduced renovation rates 10 % / 5.5 %, article 293 B exemption, and the BTP subcontracting reverse-charge mechanism. These rules should remain covered by compliance tests and reviewed when legal requirements change.

## Run locally

Requires Node.js 22 or newer.

```bash
cd server
npm install
npm test
npm start
```

Defaults:

- API: `http://localhost:35457`
- SQLite: `server/data/smoothfacture.db` when started from `server/`

Environment variables:

```text
PORT=35457
HOST=0.0.0.0
SMOOTHFACTURE_DB_PATH=./data/smoothfacture.db
SMOOTHFACTURE_CORS_ORIGIN=*
```

## Mobile connection

Configure the Expo app with an address reachable by the device. `localhost` on a physical phone refers to the phone itself.

Example on a LAN:

```text
EXPO_PUBLIC_SMOOTHFACTURE_API_URL=http://192.168.1.20:35457
```

The mobile API client lives in `mobile/src/services/smoothfactureApi.js`.

The React Native flow now uses it to:

1. sync the company profile;
2. create/update an unnumbered draft;
3. finalize the verified document;
4. display the server-assigned immutable number.

## API

### Health

```http
GET /health
```

### Company

```http
POST /api/companies
PUT  /api/companies/:id
GET  /api/companies/:id
```

Body for create/update:

```json
{
  "profile": {
    "legalName": "Entreprise Exemple",
    "siren": "123456789",
    "siret": "12345678900010",
    "tax": {
      "vatRegime": "standard",
      "defaultVatRate": 20
    }
  }
}
```

Creating a company with an existing non-empty SIREN updates that company rather than creating a duplicate.

### Drafts

```http
POST /api/invoices/drafts
PUT  /api/invoices/:id
GET  /api/invoices/:id?companyId=...
GET  /api/invoices?companyId=...
```

Create body:

```json
{
  "companyId": "...",
  "invoice": { "schemaVersion": 2 }
}
```

The canonical invoice produced by `src/domain/invoiceModel.js` is stored as JSON, with searchable/critical metadata duplicated into relational columns.

### Finalize

```http
POST /api/invoices/:id/finalize
```

```json
{
  "companyId": "..."
}
```

Before allocating a number, the server runs the same shared readiness validation as the mobile app. It refuses finalization when required identity/customer/line/tax data is incomplete, including missing professional-customer SIREN or unconfirmed reduced-rate VAT.

### Audit events

```http
GET /api/invoices/:id/events?companyId=...
```

Current events:

- `draft_created`
- `draft_updated`
- `finalized`

This event stream is intentionally shaped so later PA/Factur-X lifecycle events can be appended without changing invoice numbering semantics.

## Still not production-ready

This P0 service deliberately does **not** include authentication/authorization yet. Do not expose it directly to the public internet. The next backend security slice should add user accounts/sessions and enforce company ownership on every request.

Factur-X, Plateforme Agréée transmission, e-reporting, native PDF generation, backups and production PostgreSQL deployment remain outside P0.
