# SmoothFacture — Electronic Invoicing MVP Engineering Specification

Status: Draft for implementation review  
Legal baseline checked: 8 September 2026  
Target users: French artisans / TPE / PME, including micro-entrepreneurs and businesses under franchise en base de TVA  
Primary target deadline: 1 September 2027 for TPE/PME/micro emission and e-reporting; reception obligation is already in force since 1 September 2026.

> Product principle: **Input like a conversation. Output like accounting software.**
>
> Legal principle: SmoothFacture must never infer or invent a legally material fact. When a required fact is missing or uncertain, the product asks a targeted question or blocks finalization/transmission.

---

## 1. Purpose

This document converts the French electronic invoicing reform and ordinary French invoice requirements into an engineering contract for SmoothFacture.

The MVP is considered legally ready only when a supported transaction can move from artisan input to a compliant final document and, where required, to the appropriate Plateforme Agréée (PA) workflow without losing required data or permitting an invalid state.

SmoothFacture is designed as a **solution compatible**, not as a Plateforme Agréée. A PA remains the regulated intermediary responsible for transmitting/receiving electronic invoices and forwarding invoice, transaction and payment data to the French tax administration.

Official legal/technical baseline used by this specification:

- CGI article 289 bis — mandatory electronic issuance/transmission/reception for in-scope domestic B2B through a PA: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046195635/
- CGI annexe IV article 41 septies D — structured invoice data required from 1 Sep 2026 and additional structured data from 1 Sep 2027: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054606114/
- CGI annexe II article 242 nonies L — PA transmits invoice data to administration within 24 hours of deposit; TPE/PME/micro deadline 1 Sep 2027: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054552554/
- CGI annexe II article 242 nonies M — transaction e-reporting data: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046385786/
- CGI annexe II article 242 nonies P — payment e-reporting data: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046385799/
- DGFiP external specifications v3.2 dated 30 Apr 2026 and AFNOR XP Z12-012 / Z12-013 / Z12-014: https://www.impots.gouv.fr/specifications-externes-b2b
- DGFiP invoice-data mapping, updated Aug 2026: https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/japprof_donnees-de-facture-a-transmettre-a-ladministration-correspondance-flux_vf.pdf
- DGFiP transaction e-reporting data, updated Aug 2026: https://www.impots.gouv.fr/e-reporting-donnees-de-transaction
- DGFiP payment e-reporting data, updated Aug 2026: https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/japprof_donnees-de-paiement-a-transmettre_vf.pdf
- Ministry summary of mandatory invoice mentions: https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir
- DGFiP PA role and requirements: https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees
- DGFiP e-reporting frequencies: https://www.impots.gouv.fr/e-reporting-tableau-des-frequences-et-delais-de-transmission

If any later law, decree, DGFiP specification or AFNOR version conflicts with this document, the official newer source wins and this specification must be revised.

---

## 2. Compliance envelope for the MVP

A product can only claim compliance for cases it actually supports. SmoothFacture must therefore explicitly define its supported envelope.

### 2.1 MVP supported seller profile

The first compliant MVP may support sellers that are:

- established in France;
- artisan / EI / micro-enterprise / TPE / PME;
- invoicing in EUR;
- either under franchise en base (article 293 B) or ordinary French VAT treatment;
- using 20%, 10%, 5.5%, exemption under article 293 B, or BTP reverse charge where legally applicable;
- not using a VAT-group / assujetti-unique setup;
- not using a fiscal representative;
- not using self-billing/autofacturation;
- not using special VAT-margin regimes;
- not billing public-sector customers through Chorus Pro in the first MVP unless a Chorus Pro route is implemented.

### 2.2 MVP supported customer/transaction profile

Minimum launch scope should cover:

1. **French B2B**: French seller -> French VAT-taxable professional customer. Route = electronic invoice via PA.
2. **French B2C**: French seller -> private individual/non-taxable entity. Route = normal customer document plus transaction e-reporting through PA.
3. **Payments for services** where VAT is due on collection. Route = payment tracking plus payment e-reporting when applicable.

International B2B/B2C, DOM/COM, public-sector and special-regime transactions may be implemented in the same MVP, but if they are not, the UI and API must explicitly block them from being marked `compliant` or `transmittable` and explain that the case is unsupported.

### 2.3 Compliance-by-construction rule

An unsupported legal case must have one of these outcomes only:

- `unsupported_case` blocking error before finalization/transmission; or
- an explicit external workflow such as “Use Chorus Pro / your PA directly”.

SmoothFacture must never generate a document marked “compliant electronic invoice” for a case the engine does not understand.

---

## 3. Reform deadlines encoded in product logic

### 3.1 Reception

Since **1 September 2026**, every in-scope French business must be able to receive electronic invoices when suppliers are required to emit them electronically. Each business therefore needs a PA / reception route.

SmoothFacture MVP requirement:

- company onboarding must include `paConnection` or an explicit external-PA acknowledgement;
- if SmoothFacture claims to be the user's complete invoicing workspace, inbound PA retrieval/inbox is a MUST;
- if inbound is not implemented, onboarding must clearly state that reception remains handled outside SmoothFacture and must not imply full reform coverage.

### 3.2 Emission and transaction/payment reporting

For micro-enterprises, TPE and PME, mandatory electronic emission and e-reporting begin **1 September 2027**. The system should be capable of early voluntary use before that date, but the compliance deadline engine must know the seller size category.

Required company field:

```text
company.reform.companySizeCategory = micro | tpe | pme | eti | large
```

The backend, not the phone, determines the current obligation state from company category and legal effective dates.

---

## 4. Routing engine — every finalized transaction gets one legal route

Add a pure domain function:

```js
classifyRegulatoryRoute(invoice, companyProfile, effectiveDate)
```

It must return exactly one primary route:

```text
DOMESTIC_B2B_EINVOICE
B2C_TRANSACTION_EREPORTING
INTERNATIONAL_TRANSACTION_EREPORTING
PUBLIC_SECTOR_CHORUS_PRO
OUT_OF_SCOPE_EXEMPT_OPERATION
UNSUPPORTED_CASE
```

and secondary obligations:

```text
requiresElectronicInvoice
requiresTransactionReporting
requiresPaymentReporting
requiresPA
requiresChorusPro
```

### 4.1 Domestic B2B

Conditions:

- seller established in France;
- buyer is an assujetti established in France;
- transaction is in scope of article 289 bis.

Result:

```text
requiresElectronicInvoice = true
requiresPA = true
requiresTransactionReporting = false
```

The PA extracts and sends the required invoice data to the administration.

### 4.2 B2C / non-assujetti

Conditions include private individuals and non-VAT-taxable legal persons.

Result:

```text
requiresElectronicInvoice = false
requiresTransactionReporting = true
requiresPA = true
```

The customer may still receive a PDF/document, but the regulatory obligation is transaction e-reporting rather than French domestic B2B e-invoicing.

### 4.3 International professional customer

No domestic B2B e-invoice requirement solely because a customer is a foreign professional. Relevant transactions fall into e-reporting instead.

Required party fields:

```text
buyer.countryCode
buyer.vatNumber
buyer.foreignBusinessId
buyer.establishedInFrance
```

If international reporting is not part of MVP v1, the route returns `UNSUPPORTED_CASE` and final compliant transmission is blocked.

### 4.4 Public-sector buyer

Route through Chorus Pro / public-sector workflow. Do not send through the ordinary private B2B route unless the PA/Chorus integration explicitly supports the public use case.

---

## 5. Canonical invoice schema v3

Current schema v2 is a good base but is missing legally material concepts. Introduce `schemaVersion: 3`.

Suggested shape:

```js
{
  schemaVersion: 3,
  id,
  documentType,
  invoiceType,
  number,
  issueDate,
  serviceOrSupplyDate,
  dueDate,
  currency,

  seller: Party,
  buyer: Party,

  purchaseOrderReference,
  billingAddress,
  deliveryAddress,
  workAddress,

  operationCategory,       // LB | PS | LBPS
  lines: InvoiceLine[],
  allowances: Allowance[],
  charges: Charge[],
  tax,
  taxBreakdown,
  totals,
  paymentTerms,

  correction: {
    originalInvoiceNumber,
    originalInvoiceDate,
    reason
  },

  regulatory: {
    route,
    obligations,
    validationVersion,
    legalEffectiveDate
  },

  electronicInvoice: {
    format,
    profile,
    paProvider,
    paAccountId,
    paInvoiceId,
    recipientRoutingId,
    depositAt,
    lifecycleStatus,
    transmissionStatus,
    lastError
  },

  source: {
    rawText,
    interpreterEngine,
    parserVersion
  }
}
```

---

## 6. Party schema requirements

Expand both seller and buyer parties.

```js
{
  type: 'company' | 'individual' | 'public_entity',
  legalName,
  tradingName,

  siren,
  siret,
  vatNumber,
  foreignBusinessId,

  establishedInFrance,
  countryCode,

  address: Address,
  billingAddress: Address | null,
  deliveryAddress: Address | null,

  legalForm,
  apeCode,

  contact: { email, phone },

  electronicAddress: {
    scheme,
    value,
    source: 'annuaire' | 'pa' | 'manual'
  }
}
```

### 6.1 SIREN validation

For domestic professional buyers in scope of e-invoicing, a valid 9-digit SIREN is required. Do not accept “company” with blank SIREN as ready for electronic transmission.

Where available, validate company identity against the French business directory/annuaire rather than trusting free text alone.

### 6.2 Country is legally material

The DGFiP requires seller and buyer country in structured data. `countryCode` must no longer silently default to `FR` for every parsed address. If the country is unknown, retain `unknown` and ask only when the route needs it.

---

## 7. Operation category — use regulatory codes directly

Replace or map the current values:

```text
goods    -> LB
services -> PS
mixed    -> LBPS
```

Canonical storage should use:

```js
operationCategory: 'LB' | 'PS' | 'LBPS' | null
```

The free-form interpreter may suggest the category, but because it is a regulatory datum, uncertainty must be visible and finalization must require confirmation when confidence is below the accepted threshold.

---

## 8. Invoice line requirements

By the TPE/PME/micro mandatory date of **1 September 2027**, line-level structured data includes precise description, quantity and unit price excluding VAT.

Each priced invoice line must therefore support:

```js
{
  id,
  description,
  quantity,
  unitCode,
  unitLabel,
  unitPriceExcludingTax,
  lineGrossAmount,
  lineAllowanceAmount,
  lineChargeAmount,
  totalExcludingTax,
  vatTreatment,
  vatRate,
  sourceText
}
```

Rules:

- description is mandatory;
- quantity must be explicit and positive; defaulting to `1` is allowed only when the user intent clearly represents one unit/service and the UI exposes that interpretation for correction;
- unit price HT must be materialized as structured data by 1 Sep 2027;
- line total must be deterministically recalculated by the server;
- mixed VAT rates are allowed and must remain distinct;
- unpriced work may exist in a draft, but a final invoice line that materially affects consideration cannot silently remain unpriced;
- descriptions such as “main d'œuvre pour l'ensemble” must remain verbatim/normalized, not invented into a more specific service.

---

## 9. Allowances, discounts and charges

From 1 Sep 2027, structured invoice data must support price reductions and price increases/charges.

Add:

```js
allowances: [{
  scope: 'document' | 'line',
  lineId,
  reason,
  amountExcludingTax,
  vatRate,
  vatAmount
}]

charges: [{
  scope: 'document' | 'line',
  lineId,
  reason,
  amountExcludingTax,
  vatRate,
  vatAmount
}]
```

The server owns calculation order and rounding. Client-provided totals are never trusted.

---

## 10. Tax model v2

Current P0 VAT support is useful but too narrow for a compliance engine.

### 10.1 Company tax profile

Add:

```js
tax: {
  vatRegime: 'franchise_293b' | 'real_normal_monthly' | 'real_normal_quarterly' | 'simplified',
  vatLiability: 'exempt_293b' | 'vat_registered',
  vatOnDebits: boolean,
  defaultVatRate,
  vatNumber,
  exemptionReason,
  specialRegime: null
}
```

The current `standard` value is not enough to determine e-reporting frequency.

### 10.2 Invoice tax treatment

At minimum:

```text
DOMESTIC_VAT
EXEMPT_293B
REVERSE_CHARGE_BTP
```

Future special cases are explicit values, never overloaded strings.

### 10.3 Mandatory special mentions

The rendered invoice and electronic representation must include, when applicable:

- `TVA non applicable, art. 293 B du CGI`;
- `Autoliquidation`;
- `Option pour le paiement de la taxe d'après les débits`;
- applicable exemption legal reference;
- other special-regime wording only when supported and factually selected.

### 10.4 Reduced BTP VAT

10% and 5.5% remain user-selected legal treatments. SmoothFacture must not infer eligibility from words such as “rénovation”. Existing explicit confirmation is retained, but the confirmation record should store:

```js
{
  confirmed: true,
  confirmedAt,
  confirmedBy,
  basis: 'customer_certification_or_invoice_mention'
}
```

---

## 11. Required invoice fields — finalization gate

A final invoice in the supported MVP envelope cannot be finalized unless the following are valid where applicable.

### 11.1 General French invoice requirements

- issue date;
- unique invoice number based on a chronological and continuous sequence;
- supply/service completion date or deposit date when legally required;
- seller legal identity and address;
- buyer legal identity and address;
- billing address if distinct;
- purchase order number if one was previously established by the buyer;
- seller VAT ID and buyer VAT ID where required;
- precise line description;
- quantity;
- unit price HT;
- VAT rate or exemption treatment;
- discounts/reductions;
- total HT;
- total VAT;
- total TTC / amount due;
- payment due date or payment period;
- early-payment discount terms;
- late-payment penalty terms;
- €40 recovery indemnity wording for professional customers where applicable.

### 11.2 Reform structured data required for domestic B2B

At minimum from 1 Sep 2026:

- seller SIREN;
- seller country;
- buyer SIREN;
- buyer country;
- operation category LB/PS/LBPS;
- issue date;
- unique invoice number;
- HT taxable base by VAT rate;
- VAT amount by VAT rate;
- VAT rate(s);
- total HT;
- total VAT;
- currency;
- seller/buyer VAT IDs when applicable;
- original invoice number for rectification;
- VAT-on-debits option when applicable;
- exemption legal reference when applicable;
- autoliquidation / self-billing / special regime / VAT-group wording when applicable;
- supply/service completion date when different from invoice date;
- deposit date when different from invoice date.

Additional structured data required from 1 Sep 2027:

- precise item/service description;
- quantity;
- unit price HT;
- allowances/reductions;
- document/line charges;
- delivery address if different;
- original invoice date for corrective invoice/credit note;
- discount mention;
- eco-participation where applicable.

The backend validation layer should implement these as versioned legal rules, not scattered UI checks.

---

## 12. Numbering, immutability, correction and credit notes

Current server behavior correctly allocates a number only at finalization and makes finalized invoice content immutable.

Required evolution:

- invoice numbers remain unique, chronological and continuous per legal invoice sequence;
- drafts never consume invoice numbers;
- quotes/devis use their own sequence and are not mixed with invoices;
- a finalized invoice must never be edited in place;
- errors after finalization are corrected with an `avoir` / corrective invoice referencing the original invoice number and date;
- do not use a generic `cancelled` state to make a finalized accounting document disappear;
- corrections generate append-only lifecycle/audit events.

Add document types:

```text
invoice
credit_note
corrective_invoice
quote
```

with explicit original-document linkage.

---

## 13. Electronic invoice format

SmoothFacture should generate **Factur-X** as the primary electronic invoice output for human usability, while the PA adapter remains capable of accepting/producing whichever supported format the partner requires.

Legal common formats include:

- CII;
- UBL;
- mixed XML + PDF/A-3 (Factur-X style).

By 1 Jan 2028, emitted/transmitted/received electronic invoices are required to use structured or mixed formats; therefore building directly on Factur-X/CII avoids a temporary PDF-only architecture.

### 13.1 Generator requirements

Create separate layers:

```text
CanonicalInvoice
  -> InvoicePresentationModel
  -> PDF/A-3 renderer
  -> CII XML generator
  -> Factur-X packager
  -> validator
```

The XML and visible PDF must originate from the same immutable canonical snapshot.

### 13.2 Validation before PA submission

Must include:

- XML/XSD/schema validation;
- semantic/business-rule validation against the supported AFNOR/DGFiP profile;
- total consistency checks;
- invoice number/date checks;
- tax breakdown consistency;
- required identifier checks;
- PDF/XML data-equivalence checks for key monetary/party fields.

Do not mark `ready_to_send` if validation fails.

---

## 14. Plateforme Agréée adapter

SmoothFacture must not hard-code a PA throughout business logic.

Define an adapter interface such as:

```ts
interface PAAdapter {
  connectCompany(company, credentials): Promise<ConnectionResult>
  resolveRecipient(party): Promise<RoutingResult>
  submitInvoice(invoiceArtifact, metadata): Promise<SubmissionResult>
  getInvoiceStatus(platformInvoiceId): Promise<PlatformStatus>
  listInboundInvoices(cursor): Promise<InboundPage>
  fetchInboundInvoice(platformInvoiceId): Promise<InboundInvoice>
  submitTransactionReport(report): Promise<ReportResult>
  submitPaymentReport(report): Promise<ReportResult>
  acknowledgeOrRefuseInvoice(platformInvoiceId, action): Promise<ActionResult>
}
```

### 14.1 PA is a trust boundary

The backend must store:

- PA provider and account identifier;
- request idempotency key;
- platform invoice/report id;
- request timestamp;
- response/status code;
- sanitized response payload or normalized error;
- retry state;
- immutable hash of submitted canonical invoice/artifact.

Secrets/tokens must never be stored in AsyncStorage or committed source. They belong in server-side secret storage.

### 14.2 Recipient routing

Before B2B submission, resolve recipient via PA/official annuaire using SIREN/SIRET/electronic routing address. A manually typed email address is not a substitute for regulatory routing.

---

## 15. Inbound electronic invoices

Reception is already mandatory for all in-scope businesses from 1 Sep 2026.

If SmoothFacture is to claim full reform coverage, MVP must include an inbox backed by the connected PA:

```text
Inbox
  -> new invoice
  -> supplier identity
  -> amount / due date
  -> original electronic artifact
  -> lifecycle status
  -> accept/refuse action where PA supports it
```

Persist the normalized inbound canonical document and original artifact reference/hash.

At minimum support the mandatory lifecycle states exposed by the PA.

---

## 16. Regulatory invoice lifecycle

Keep internal product states separate from regulatory lifecycle states.

### 16.1 Internal state

```text
draft
validated
finalized
artifact_generated
submission_pending
```

### 16.2 Regulatory/PA state

At minimum support normalized equivalents of:

```text
DEPOSIT / DEPOT
REJECT / REJET
REFUSED / REFUS
COLLECTED / ENCAISSEE
```

The PA may expose additional states. Store unknown/new states losslessly and map known states for UI.

Every transition is append-only in `invoice_events` or a dedicated `regulatory_events` table.

---

## 17. Transaction e-reporting

### 17.1 B2C aggregation

For transactions with non-assujetti customers, reporting is aggregated per day.

Persist enough source data to build, for each reporting period/day/category/rate:

```js
{
  companySiren,
  reportingPeriod,
  vatOnDebits,
  transactionDate,
  transactionCount,
  category,
  vatRate,
  taxableBaseExcludingTax,
  taxAmount,
  currency: 'EUR'
}
```

The aggregator is deterministic and rebuildable from immutable source transactions.

Do not store only the aggregate and discard source invoices/transactions.

### 17.2 International professional e-reporting

If supported, retain per-document identifiers and foreign-party identifiers required by DGFiP:

```text
French party SIREN
foreign VAT / foreign registry identifier
seller country
buyer country
LB/PS/LBPS
invoice date
invoice number
HT by VAT rate
VAT by rate
invoice totals
currency
2027 line detail
conditional legal mentions
```

If not supported in MVP v1, block international compliant transmission.

---

## 18. Payment tracking and payment e-reporting

Payment e-reporting applies only where legally required, notably when VAT is exigible on collection, such as relevant service transactions, excluding operations under VAT-on-debits option and reverse-charge operations.

Add a first-class payment model:

```js
Payment {
  id,
  companyId,
  invoiceId,
  receivedAt,
  amount,
  currency,
  allocationByVatRate: [
    { vatRate, amountReceived }
  ],
  method,
  source,
  createdAt
}
```

Support partial and multiple payments.

For an e-invoice already deposited through PA, payment data is transmitted by enriching the invoice status `ENCAISSEE`, containing:

- invoice number;
- effective payment date;
- amount received in EUR by VAT rate.

For B2C source transactions, payment reporting is aggregated by day of collection and VAT rate according to DGFiP requirements.

The user-facing action should be simple:

```text
[Marquer comme payé]
Date: today
Amount: remaining amount
```

The backend derives reporting allocations; the artisan should not fill a tax-reporting form manually unless ambiguity requires it.

---

## 19. Reporting scheduler

Store the seller's actual VAT reporting regime because reporting frequency depends on it.

Minimum scheduling rules from current DGFiP guidance:

```text
real normal monthly       -> transaction reporting by 10-day periods; payment monthly
real normal quarterly     -> transaction monthly
simplified VAT regime     -> transaction monthly; payment monthly
franchise en base         -> transaction every 2 months; payment every 2 months when applicable
```

Implement a backend reporting queue, not mobile timers.

Suggested tables:

```text
reporting_periods
reporting_batches
reporting_batch_items
reporting_events
```

Each batch needs states:

```text
open
ready
submitted
accepted
rejected
retry_pending
```

A PA may handle cadence itself. Even then, SmoothFacture needs enough state to prove what source data was supplied and whether it was accepted.

---

## 20. Database evolution

SQLite is acceptable for local P0, but the compliance MVP needs migrations and production durability.

Minimum new/changed tables:

```text
companies
company_pa_connections
customers
invoice_sequences
invoices
invoice_events
invoice_artifacts
regulatory_events
payments
reporting_periods
reporting_batches
reporting_batch_items
inbound_invoices
```

### 20.1 Mandatory DB properties

- versioned migrations;
- foreign keys;
- immutable finalized canonical snapshot;
- durable invoice sequence transaction;
- unique PA platform IDs where relevant;
- idempotency keys for outbound calls;
- append-only audit events;
- timestamps stored UTC;
- monetary fields represented safely (integer cents or decimal strategy; avoid relying on binary floating point for legal totals in production);
- backup/restore process tested.

Production should migrate from single-file SQLite to a backed-up transactional database such as PostgreSQL before public multi-tenant launch.

---

## 21. Authentication, authorization and tenant ownership

This is a legal/commercial blocker before exposing the backend.

Required:

- authenticated user accounts;
- server-side company membership/ownership;
- role checks on every company/invoice/payment/report request;
- PA connection belongs to a company and cannot be referenced across tenants;
- invoice seller identity is loaded from the authorized stored company profile, not trusted from arbitrary client JSON;
- audit actor on manual changes/confirmations.

A mobile-supplied `seller` object must never be authoritative after company sync.

---

## 22. Retention and auditability

French invoices and related accounting evidence must be retained for **10 years** as accounting documents.

SmoothFacture requirements:

- retain final canonical snapshot for at least 10 years;
- retain final electronic artifact(s) and human-readable representation;
- retain original invoice reference for credit notes/corrections;
- retain lifecycle and transmission evidence;
- retain payment/reporting evidence;
- prevent silent deletion of finalized invoices;
- backup policy must support the retention promise.

A user “delete account” operation must distinguish personal/product data deletion rights from legally required business-record retention. This requires legal/privacy design before production.

---

## 23. Privacy and security

Because rough artisan input may contain personal names, addresses, phone numbers and transaction details:

- free-form input remains local until the user explicitly proceeds to server persistence/transmission;
- TLS is mandatory outside local development;
- encrypt PA credentials at rest;
- never log access tokens;
- minimize raw input retention; define a retention purpose separately from the legally required invoice record;
- PA requests/responses are sanitized before logging;
- provide company data export;
- maintain a subprocessors/data-flow register for PA/provider integrations.

---

## 24. Mobile UX contract

The reform must remain almost invisible to the artisan.

### 24.1 Creation

```text
Type or dictate rough notes
-> parser extracts facts
-> canonical draft
-> targeted legal questions only when necessary
```

### 24.2 Targeted verification examples

Ask:

- “Client particulier ou entreprise ?”
- “SIREN du client ?” only for professional client if not resolved automatically;
- “Il s'agit de services, de fournitures, ou des deux ?” when uncertain;
- “La date de fin d'intervention était-elle le 19 mai ?” only if missing/ambiguous;
- “Taux 10 % : confirmez-vous que les conditions du taux réduit sont remplies ?”
- “Adresse de livraison différente ?” only when goods/delivery case requires it;
- “TVA sur les débits ?” should normally be a company setting, not asked on every invoice.

Do not expose BT-xx codes, AFNOR terminology or e-reporting forms to the artisan.

### 24.3 Finalization copy

Before finalization:

```text
✓ Informations obligatoires complètes
✓ Montants vérifiés
✓ Route: facture électronique entreprise

[Finaliser la facture]
```

After finalization:

```text
Facture n°104
Finalisée — contenu verrouillé
Transmission: en attente / déposée / rejetée / refusée
```

### 24.4 Payment

```text
[Marquer comme payé]
```

No user should manually construct an `ENCAISSEE` payload.

---

## 25. Backend API target

Suggested v1 API surface:

```text
POST   /api/auth/...

GET    /api/companies/:id
PUT    /api/companies/:id
POST   /api/companies/:id/pa-connections
GET    /api/companies/:id/pa-connection

POST   /api/invoices/drafts
PUT    /api/invoices/:id
POST   /api/invoices/:id/finalize
POST   /api/invoices/:id/generate
POST   /api/invoices/:id/submit
GET    /api/invoices/:id/status
POST   /api/invoices/:id/credit-note

POST   /api/invoices/:id/payments
GET    /api/invoices/:id/payments

GET    /api/inbound-invoices
GET    /api/inbound-invoices/:id
POST   /api/inbound-invoices/:id/refuse

GET    /api/reporting/periods
POST   /api/reporting/periods/:id/submit

GET    /api/invoices/:id/events
```

Finalization, artifact generation and transmission are separate operations so a transient PA outage never affects the legal invoice number transaction.

---

## 26. Server-side state machine

Recommended outbound flow:

```text
DRAFT
  -> READY
  -> FINALIZED
  -> ARTIFACT_VALIDATED
  -> SUBMISSION_PENDING
  -> DEPOSITED
  -> [REFUSED | REJECTED | COLLECTED | other PA states]
```

Rules:

- only `DRAFT` is editable;
- `FINALIZED` has immutable number/content;
- `REJECTED` does not mutate the original invoice; user creates a corrective document or fixes a pre-deposit technical artifact if legally possible without changing invoice substance;
- all retries use idempotency keys;
- lifecycle webhook processing is idempotent.

---

## 27. Legal validator architecture

Replace one monolithic readiness check with layered validators:

```text
validateInvoiceBase(invoice)
validateSeller(invoice, company)
validateBuyer(invoice, route)
validateLines(invoice, effectiveDate)
validateTax(invoice)
validatePaymentTerms(invoice)
validateCorrection(invoice)
validateElectronicInvoiceData(invoice, effectiveDate)
validateReportingReadiness(transaction, route)
validateSupportedCase(invoice, company)
```

Return structured issues:

```js
{
  code,
  field,
  severity: 'error' | 'warning' | 'info',
  blocking: true,
  legalSource,
  messageForUser,
  messageForDeveloper
}
```

The validation rules are versioned by legal effective date so tests can assert 2026 vs 2027 requirements.

---

## 28. Exact gap analysis against current `main`

### Already strong

- canonical invoice model exists;
- seller SIREN/SIRET exists;
- buyer individual/company and SIREN exist;
- buyer delivery address field exists in canonical party;
- VAT 293B / 20 / 10 / 5.5 exists;
- mixed VAT calculation exists;
- BTP reverse charge exists;
- reduced-rate explicit confirmation exists;
- server recalculates tax totals;
- drafts do not consume numbers;
- finalization is transactional/idempotent;
- finalized invoice is immutable;
- invoice event stream exists;
- mobile natural-language/dictation pipeline exists.

### Must change before compliant MVP

1. `schemaVersion: 2` -> v3 with legal routing, currency, service/supply date, PO reference, allowances, charges, correction metadata and PA fields.
2. `operationCategory` internal `goods/services/mixed` -> regulatory `LB/PS/LBPS` mapping/canonical representation.
3. Current country normalization silently defaults to `FR`; country must be explicit/legal when routing requires it.
4. Current line quantity defaults to 1 and unit price can be null while total exists; 2027 structured line requirements require explicit canonical quantity + unit price semantics.
5. Add seller VAT-on-debits option and actual VAT reporting regime for e-reporting cadence.
6. Add invoice-level exemption/legal-reference codes suitable for electronic serialization.
7. Add discount/allowance and charge models.
8. Add credit note/corrective invoice model referencing original number/date.
9. Add Factur-X/CII generator + validator.
10. Add PA abstraction and at least one production PA connector.
11. Add official/PA recipient routing lookup.
12. Add inbound PA invoice reception if SmoothFacture claims full reform coverage.
13. Add regulatory lifecycle states and PA webhook/status ingestion.
14. Add payment model + partial payments + payment e-reporting.
15. Add B2C daily transaction e-reporting aggregation.
16. Add reporting scheduler based on company VAT regime.
17. Add authentication/authorization/company ownership.
18. Stop trusting client-supplied seller identity; server must use stored company profile.
19. Add DB migrations and production backup strategy.
20. Replace production monetary `REAL` columns with a decimal/integer-money strategy.
21. Add 10-year final-record/artifact retention policy.
22. Add public-sector/international/special-regime route or explicit hard blockers.

---

## 29. MVP implementation phases

### Phase A — compliance data foundation

- canonical invoice v3 + migrations;
- company tax/reporting settings;
- regulatory route classifier;
- legal validators 2026/2027;
- LB/PS/LBPS;
- service/supply date;
- PO reference;
- discounts/charges;
- correction/credit-note model;
- seller identity trust boundary;
- auth + company ownership.

Exit criterion: any supported invoice can be finalized only if all required legal data exists.

### Phase B — compliant artifact

- exact PDF renderer;
- CII/Factur-X generator;
- XSD/semantic validation;
- artifact persistence/hash;
- correction/credit-note rendering.

Exit criterion: a finalized supported invoice produces a validated electronic artifact from the immutable canonical snapshot.

### Phase C — PA + reception

- choose a PA from the currently accredited list;
- implement adapter;
- connect company account;
- recipient routing;
- submit invoice;
- normalized lifecycle statuses/webhooks;
- inbound invoice inbox.

Exit criterion: domestic B2B invoice can be deposited through PA, and incoming supplier invoices are retrievable.

### Phase D — e-reporting + payments

- B2C daily transaction aggregator;
- company reporting-calendar engine;
- payment recording/partial payments;
- `ENCAISSEE` / payment report payloads;
- reporting batches and acceptance/retry states.

Exit criterion: supported B2C/service activity produces auditable reporting batches automatically.

### Phase E — production hardening

- PostgreSQL or equivalent production DB;
- backups/restore drills;
- secret management;
- TLS/domain/deployment;
- observability/alerts;
- 10-year retention implementation;
- data-export/privacy workflows;
- production PA sandbox/certification testing.

---

## 30. Mandatory automated test matrix

The MVP cannot be declared compliant without automated tests for at least the following.

### Domestic B2B

- franchise 293B professional invoice;
- VAT 20% professional invoice;
- mixed 10%/20% invoice;
- reduced VAT blocked without certification;
- BTP reverse charge professional invoice;
- professional buyer blocked without SIREN;
- LB/PS/LBPS required;
- seller/buyer country required;
- 2027 line quantity/description/unit price required;
- unique immutable final number;
- credit note references original number/date;
- PA submission idempotency;
- PA rejection/status ingestion.

### B2C

- no domestic B2B PA-invoice route;
- daily reporting aggregation by category/rate;
- exact transaction count;
- correct HT/TVA aggregation;
- no duplicate reporting when a batch is retried.

### Payments

- service invoice with VAT on collection creates payment-reporting obligation;
- VAT-on-debits option suppresses payment-reporting obligation;
- reverse-charge suppresses payment-reporting obligation;
- partial payments produce correct amounts by VAT rate;
- repeated webhook/report retry is idempotent.

### Unsupported cases

- public buyer blocked/routed to Chorus Pro;
- foreign business blocked if international route not implemented;
- special margin scheme blocked if unsupported;
- VAT-group/fiscal representative/self-billing blocked if unsupported.

### Security

- user from company A cannot read/write company B;
- arbitrary mobile seller payload cannot impersonate another company;
- finalized canonical JSON cannot be changed through update endpoints;
- PA credentials never returned to mobile/logs.

---

## 31. Definition of Done — “SmoothFacture compliant MVP”

The product may be described as compliant for the declared MVP envelope only when all of the following are true:

- supported-case classifier is explicit and tested;
- all ordinary invoice mentions and reform structured data are represented in the canonical model;
- finalization is blocked on missing legally required information;
- invoice numbering is chronological/continuous and finalized invoices immutable;
- corrections use credit notes/corrective invoices rather than editing originals;
- server recalculates all money/tax data;
- a validated structured/mixed electronic invoice can be generated;
- at least one accredited PA integration works end-to-end for domestic B2B;
- recipient routing uses PA/annuaire data rather than email;
- PA lifecycle statuses are persisted/auditable;
- inbound e-invoice reception is available or the product explicitly does not claim to cover the reception obligation;
- B2C transaction e-reporting works for the supported seller regime;
- payment e-reporting works when VAT is due on collection;
- reporting cadence is derived from the seller's VAT regime;
- authentication, tenant isolation and server-authoritative seller identity are in place;
- final documents/artifacts/events have a 10-year retention strategy;
- unsupported legal cases are blocked, never silently downgraded;
- automated tests cover the legal matrix above;
- legal/technical source versions are recorded so future regulatory updates can be diffed against the implementation.

---

## 32. Recommended immediate next engineering slice

The next implementation should **not** start with a PA API directly. First make the canonical model able to represent every datum we will need to send.

Recommended first PR:

```text
Canonical Invoice v3
+ regulatory route classifier
+ 2026/2027 legal validators
+ company VAT/reporting profile
+ LB/PS/LBPS
+ service/supply date
+ purchase-order reference
+ allowances/charges
+ correction/credit-note references
+ server-authoritative seller identity
+ schema migrations
+ tests
```

Once that is merged, Factur-X and PA work become serializers/transports over a stable legal model instead of re-creating tax logic inside integration code.

---

## 33. Product UX rule that must survive every implementation phase

The user should never be forced to understand the reform's vocabulary merely to create an invoice.

Example raw input:

```text
Monsieur et Madame Thierry Hornoy
7 rue de la Barre 62180 Neuville-Saint-Vaast

Le 19 mai 2026

Intervention 61 avenue du 4 septembre Lens appartement numéro 5

Remplacement WC fourni par le client
Une sortie WC 12 €
Meuble déplacement 48 €
```

SmoothFacture should infer safe facts, preserve uncertain ones, and ask only questions that materially change legality or money.

The architecture exists to make compliance strict **without making the artisan behave like an accountant**.
