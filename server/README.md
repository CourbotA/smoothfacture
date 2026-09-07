# SmoothFacture backend — P0

This service owns durable business data that must not live only in a browser or phone:

- company profiles;
- reusable customers;
- invoice/devis drafts;
- final document numbers;
- append-only invoice lifecycle events.

## Important numbering rule

Creating or updating a draft **does not consume a number**.

A number is allocated only by:

```http
POST /api/invoices/:id/finalize
```

Finalization runs inside a SQLite transaction. Calling it again for an already-finalized document returns the existing number instead of consuming another one. Finalized document contents cannot be updated through the draft endpoint.

Invoice and devis sequences are independent per company.

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
    "siret": "12345678900010"
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
  "invoice": { "schemaVersion": 1 }
}
```

The full canonical invoice produced by `src/domain/invoiceModel.js` is stored as JSON, with searchable/critical metadata duplicated into relational columns.

### Finalize

```http
POST /api/invoices/:id/finalize
```

```json
{
  "companyId": "..."
}
```

Before allocating a number, the server refuses finalization when core business facts are missing, including seller identity, customer address, professional-customer SIREN, operation category, lines, or line prices.

### Audit events

```http
GET /api/invoices/:id/events?companyId=...
```

Current events:

- `draft_created`
- `draft_updated`
- `finalized`

This event stream is intentionally shaped so later PA/Factur-X lifecycle events can be appended without changing invoice numbering semantics.

## Not production-ready yet

This P0 service deliberately does **not** include authentication/authorization yet. Do not expose it directly to the public internet. The next backend security slice should add user accounts/sessions and enforce company ownership on every request.

Factur-X, Plateforme Agréée transmission, e-reporting, native PDF generation, backups and production PostgreSQL deployment are also outside this slice.
