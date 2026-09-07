# AGENTS.md

## Mission

**Facture Facile** is a React application that helps French tradespeople create invoices and quotes from informal job notes.

The primary persona is a busy plumber or similar tradesperson who may:

- be uncomfortable with software;
- type quickly and make spelling mistakes;
- provide information in an inconsistent order;
- paste SMS/email/job notes;
- dictate instead of typing;
- want to correct a name, address, description, or price without navigating a large accounting form.

Primary product goal:

> Create a professional invoice in under two minutes with as little structured data entry as possible.

Core product philosophy:

> **Input like a conversation. Output like accounting software.**

Optimize changes for this user before optimizing for accounting-software completeness.

---

## Non-negotiable product rules

### Free-form input is the primary interface

Users should be able to enter rough French notes such as:

```text
client tranian marcel aubigny 24 rue emile delombe
entretien chaudiere 105
flexible fioul 35
185 main oeuvre
janvier 2026
```

Do not require a fixed order, rigid syntax, or a traditional invoice form before interpretation.

### Never silently invent business facts

Facture Facile may improve **presentation**, but must not silently invent or materially alter **business facts**.

Safe normalization examples:

- `main d oeuvre` -> `Main-d'œuvre`
- capitalization and spacing
- harmless punctuation
- `6.5 €` -> `6,50 €`

Unsafe without explicit evidence or user review:

- `janvier 2026` -> `01/01/2026`
- guessing a surname spelling
- turning an uncertain product phrase into a different commercial designation
- inventing a quantity or price
- assuming every isolated number is money
- inventing VAT treatment

When unsure, preserve the original wording and surface the uncertainty.

### Distinguish certainty states

Interpretation must be able to distinguish at least the equivalent of:

- `confident` — safe to use directly;
- `normalized` — presentation changed, meaning preserved;
- `uncertain` — material interpretation needs review;
- `missing` — useful input exists but important information is absent.

Prefer understandable categorical states over arbitrary numeric confidence scores.

### Missing information is not parsing failure

Extract whatever is useful.

Example:

```text
Dupont
Entretien chaudière 105 €
Flexible fioul 35 €
```

should preserve the work and prices and report the address as missing rather than rejecting the entire input.

Only genuinely unusable input should fail completely.

### Preserve date precision

Do not manufacture precise dates.

- `19 mai 2026` -> exact date
- `mai 2026` -> month-level information
- `2026` -> year-level information

Invoice issue date and intervention/work date are different concepts.

If the invoice issue date needs an exact value, existing product behavior may default it to today. Work dates must reflect what the user actually supplied.

### Preserve unpriced work

A note such as:

```text
Démontage repose radiateur fonte
```

must not be discarded just because it has no explicit price.

Keep it as detected work and allow the user to decide whether to price, keep, or remove it.

### Verification should be targeted

Preferred journey:

```text
Describe
-> interpret
-> review missing/uncertain information
-> preview
-> download/send
```

Do not make the full accounting editor the normal correction experience.

Keep a full editor as an escape hatch for advanced/manual corrections.

### Voice and typing are one input model

Voice input should populate the same editable raw-text composer and use the same interpretation pipeline.

Do not create separate "voice invoice" and "text invoice" products.

If using browser speech recognition, feature-detect it and degrade gracefully. Microphone problems must never block normal invoice creation.

---

## Current code areas

Always search the repository before editing. Filenames below are important known entry points, not a complete project map.

### `InvoiceCreation.jsx`

Current responsibilities include:

- free-form input;
- facture/devis selection;
- parser invocation;
- parsed invoice state;
- verification summary;
- manual correction UI;
- PDF preview/download orchestration.

Keep complex interpretation rules out of JSX. This component should primarily orchestrate state and presentation.

### `parseEmail.js`

Current parsing is deterministic and historically converts raw text directly into invoice-shaped data using line-oriented rules and regexes.

Desired conceptual direction:

```text
raw input
-> normalization
-> fact/entity extraction
-> interpretation + certainty
-> validation/questions
-> confirmed invoice data
```

Prefer a stable interpreter boundary, conceptually similar to:

```js
interpretInvoiceInput(rawText)
```

The UI should not need to know whether the interpreter uses rules today or a semantic model later.

Maintain compatibility wrappers such as `parseEmail` / `parseEmails` when existing callers still rely on them.

Do not endlessly patch arbitrary natural-language understanding with positional regex special cases.

### `pdfGenerator.js`

PDF generation is downstream of interpretation.

Known responsibilities include:

- facture/devis labels;
- metadata preparation;
- invoice number assignment through the numbering service;
- totals;
- PDF blob/document generation;
- downloads.

Do not put natural-language parsing into PDF code.

Avoid unrelated PDF layout changes unless explicitly requested.

### `invoiceNumberStore.js`

Invoice numbering is persisted in browser `localStorage` with an in-memory fallback.

Do not casually change numbering semantics.

Do not reserve final invoice numbers merely for speculative parsing or preview unless the existing workflow requires it.

Preserve graceful behavior when storage is unavailable.

### `InvoicePreview.jsx`

The preview renders the actual generated PDF blob in an iframe.

Preserve the principle that the preview should match the real generated document rather than a separately recreated HTML approximation whenever practical.

### Secondary / possibly legacy files

Files such as `InvoiceForm.jsx`, `Dashboard.jsx`, `InvoicesList.jsx`, and `NavigationBar.jsx` may be incomplete, secondary, or legacy.

Search for usages before editing or deleting them.

Do not assume a file is active just because it exists.

---

## Interpretation model

Prefer an intermediate interpretation object instead of treating parsing as only:

```text
rawText -> invoice
```

A suitable model should be able to carry, where relevant:

- interpreted value;
- source/original text;
- certainty/status;
- review requirement;
- missing fields;
- warnings;
- clarification questions.

Example concept only:

```js
{
  invoice: {
    client: {},
    intervention: {},
    items: []
  },
  interpretation: {
    fields: {
      clientName: {
        value: 'Marcel Tranian',
        sourceText: 'tranian Marcel',
        status: 'uncertain'
      }
    },
    missingFields: [],
    warnings: [],
    questions: []
  }
}
```

Do not over-engineer the schema. Keep it small and maintainable.

---

## Parsing guidelines

### Prefer content over position

Do not assume:

- name is line 1;
- address is line 2;
- prices always follow descriptions;
- the user uses line breaks;
- input is logically ordered.

Voice-like single sentences are valid input.

### Be conservative with numbers

Common valid patterns may include:

```text
Flexible fioul 35 €
Flexible 35 euros
Flexible 35
35 flexible fioul
2 x 35 €
2 pièces à 35 €
3 h à 45 €
```

But street numbers, postal codes, dates, model numbers, plumbing dimensions such as `12/17`, quantities, and prices may coexist.

Do not convert every number into money.

### Preserve source wording when uncertain

Prefer a slightly imperfect but faithful description over an invented polished one.

Example:

```text
pâte wc serinite sans bride
```

should remain recognizable unless a correction is genuinely supported.

### Be cautious with customer identity

Formatting `tranian marcel` as `Marcel Tranian` may be a reasonable interpretation.

Changing an unknown surname's spelling based on spellcheck is not.

Names and addresses must be especially easy to review and edit.

### Deterministic parsing has limits

Do not pretend regex can reliably understand arbitrary French speech.

If no semantic/AI service exists:

- implement maintainable deterministic extraction;
- expose uncertainty honestly;
- keep a clean future integration boundary;
- do not introduce an external paid AI API or frontend API key unless explicitly requested or already supported by project architecture.

---

## UI and copy rules

The target user is a tradesperson, not an accountant.

Optimize for **recognition and correction**, not data entry.

Prefer:

- one large free-form composer;
- plain French;
- obvious primary actions;
- Client / Intervention / Prestations / Total summaries;
- contextual questions;
- showing only points requiring attention;
- direct correction of names, addresses, descriptions, and prices;
- exact PDF preview before final output.

Avoid:

- parser/database terminology in the UI;
- mandatory structured syntax;
- unnecessary accounting choices;
- forcing invoice-number selection;
- giant forms before useful output;
- generic errors when partial extraction succeeded;
- presenting uncertain values as confirmed;
- broad visual redesign during behavioral tasks.

User-facing copy should be short and concrete.

Prefer wording such as:

- `Décrivez le chantier`
- `Écrivez comme vous parleriez`
- `2 points à vérifier`
- `Adresse du client à compléter`
- `Garder ce texte`
- `Modifier`

---

## Facture and devis

Facture/devis support is regression-sensitive.

When changing shared creation logic:

- preserve both document types;
- keep shared behavior shared;
- keep type-specific labels centralized where possible;
- verify generated headings, dates, filenames, metadata, and preview behavior for both.

Do not fork the entire flow unless behavior genuinely needs to diverge.

---

## Money and totals

Monetary data is business-critical.

When changing parsing or calculations:

- support French comma decimals;
- avoid floating-point display artifacts;
- distinguish quantity, unit price, and total;
- never invent missing prices;
- keep UI summary totals and PDF totals on the same source of truth;
- reuse shared calculation/formatting helpers instead of duplicating them in components.

---

## Business and legal defaults

The current code contains business-specific sender, payment, VAT, and footer information.

Treat these values as product configuration, not universal legal truth.

Do not silently change business identity, SIRET/APE, IBAN, payment terms, VAT note, late-fee wording, or footer content during unrelated tasks.

If current French legal compliance is explicitly in scope, verify current requirements instead of relying on memory and distinguish legal requirements from current repository behavior.

Long-term migration of hardcoded business settings should be a deliberate feature, not incidental cleanup.

---

## Architecture boundaries

Maintain this direction of dependency whenever practical:

```text
input capture
    ↓
text normalization
    ↓
fact/entity extraction
    ↓
interpretation + certainty
    ↓
validation/questions
    ↓
confirmed invoice model
    ↓
totals + metadata
    ↓
PDF preview/generation
    ↓
download/send
```

Rules:

- PDF code must not parse raw natural language.
- React rendering code should not become the source of truth for parsing rules.
- Invoice numbering must not influence interpretation.
- Parsing code must not manipulate the DOM.
- Preview consumes structured invoice data, not raw notes.

---

## Coding-agent workflow

For non-trivial changes:

1. Read this file.
2. Inspect the repository structure.
3. Search for relevant callers, helpers, tests, and styles.
4. Read complete relevant implementations before editing.
5. Identify regression-sensitive behavior.
6. Make the smallest coherent change that solves the requested problem.
7. Add/update focused tests when a test setup exists.
8. Run relevant validation commands.
9. Fix regressions introduced by the change.
10. Report what changed, validation performed, and known limitations.

Do not stop after planning unless the user explicitly asks for planning only or a genuine blocker prevents implementation.

---

## Commands and repository discovery

Do not invent commands.

Before running validation:

- inspect `package.json`;
- inspect the lockfile to determine the package manager;
- inspect existing scripts/test configuration;
- use repository-supported commands only.

Relevant categories commonly include:

- focused parser/unit tests;
- broader tests;
- lint;
- build.

If no automated tests exist, state that explicitly and perform focused manual validation rather than claiming tests passed.

---

## Core regression fixtures

When changing interpretation, protect behavior equivalent to these cases.

### Structured input

```text
Marcel Tranian
24 rue Émile Delombe 62690 Aubigny-en-Artois
19 mai 2026
Entretien chaudière fioul 105 €
Flexible fioul 35 €
Main d'oeuvre 185 €
```

Expected: customer/address/date recognized and amounts preserved.

### Badly ordered input

```text
105 entretien chaudière
185 main oeuvre
client tranian marcel
24 rue emile delombe aubigny en artois 62690
flexible 35 euros
```

Expected: useful information still extracted; name must not need to be first.

### Month-only date

```text
Janvier 2026
Entretien chaudière 105 €
```

Expected: do not assert `01/01/2026` as the supplied work date.

### Missing address

```text
Dupont
Entretien chaudière 105 €
Flexible fioul 35 €
```

Expected: preserve useful data and mark address missing.

### Uncertain description

```text
pâte wc serinite sans bride 295 €
```

Expected: preserve wording; do not invent a commercial product name.

### Unpriced work

```text
Démontage repose radiateur fonte
Flexible fioul 35 €
```

Expected: both work entries remain represented.

### Voice-like sentence

```text
alors client tranian marcel à aubigny 24 rue emile delombe entretien chaudiere 105 euros flexible 35 et 185 euros de main d oeuvre
```

Expected: best-effort extraction without requiring line breaks; uncertainty remains explicit.

Also test numeric ambiguity involving postal codes, street numbers, dates, `12/17`, quantities, and prices.

---

## Regression-sensitive existing behavior

Unless the task explicitly changes it, preserve:

- facture and devis;
- multiple-document parsing if currently supported;
- free-form input;
- automatic totals;
- invoice numbering;
- PDF generation/download;
- exact PDF preview;
- manual correction capability;
- current business/payment/footer data;
- graceful browser-storage fallback behavior.

Search the repository to confirm current behavior before modifying any of these.

---

## Code quality

Prefer:

- small focused helpers;
- pure functions for parsing/normalization;
- explicit domain names;
- immutable React state updates;
- shared formatting/calculation logic;
- minimal dependencies;
- accessible labels and controls;
- comments explaining domain decisions rather than restating code.

Avoid:

- one giant parser accumulating every special case;
- regex rules inside JSX;
- duplicated money/date formatting;
- silent fallback values that look user-supplied;
- unrelated refactors;
- broad rewrites when a smaller change works;
- speculative abstractions with no current need.

---

## Privacy and future AI integration

The current creation UI states that information remains on the user's device.

Do not introduce network-based processing that makes that statement false without explicitly addressing the product/privacy change.

If a future task adds an LLM or semantic service:

- keep a stable interpreter interface;
- validate model output;
- retain source text;
- ground names, dates, quantities, and prices in user input;
- distinguish extracted facts from stylistic normalization;
- handle network/model failure gracefully;
- retain a deterministic/manual fallback;
- never expose secrets or API keys in frontend code.

---

## Scope discipline

Solve the requested task fully, but avoid unrelated cleanup.

Do not:

- redesign branding unless requested;
- replace dependencies without a concrete reason;
- delete files without searching their usages;
- rewrite working PDF/numbering logic during parser work;
- expand a focused task into a broad architecture rewrite unnecessarily.

Mention worthwhile adjacent issues in the final report instead of silently expanding scope.

---

## Definition of done

A change is complete when:

- requested behavior works;
- the plumber's primary journey remains simple;
- no new silent guessing of business facts was introduced;
- missing/uncertain information is handled intentionally;
- relevant facture/devis behavior still works;
- totals, numbering, preview, and PDF output remain consistent;
- relevant tests pass when tests exist;
- configured lint/build checks pass when relevant;
- unresolved limitations are stated clearly.

For interpretation changes, manually reason through at least one messy plumber input in addition to automated tests.

---

## Final report format for coding agents

After a non-trivial implementation, report concisely:

### What changed

Major behavioral/architectural changes.

### Files changed

Each changed file and its purpose.

### Validation

Exact test/lint/build commands run and outcomes.

### Limitations

Cases the current deterministic parser or architecture still cannot reliably handle.

### Next step

The single most valuable logical follow-up, not a large unsolicited roadmap.
