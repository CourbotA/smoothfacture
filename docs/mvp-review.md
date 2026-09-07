# Facture Facile MVP review

Reviewed 7 September 2026, starting from main f1184a5.

## Product assessment

The objective is a forgiving conversation with a precise document at the end. The current single composer, shared interpreter, targeted questions and actual PDF preview are the right foundation. This is a useful single-artisan prototype; it is not yet a dependable general-purpose invoicing product.

The acceptance criterion is not merely a plausible PDF. Every customer, address, date, work description and amount must either survive interpretation or be explicitly presented for a decision. Formatting may improve; commercial meaning must not silently change.

## The supplied example

Facture-103.pdf was extracted and visually inspected. It shows 12 EUR + 48 EUR = 60 EUR; the customer's address and worksite are separate; unpriced WC replacement survives as descriptive work. Its conversion of “Meuble déplacement” into labor/travel is a material interpretation, not spelling cleanup. The app should ask whether that is what the artisan meant. The current repository differs from this historical PDF: it defaults issue date to today, preserves unpriced work as a line, and uses a revised table/footer. Work date and issue date should remain distinct.

## Implemented in this branch

| Problem | Fix | Files |
| --- | --- | --- |
| Quantity/unit-price edits left the old amount in the PDF and summary | Recalculate the line total; make total read-only; reject malformed prices; recheck completeness before preview/download | src/services/invoiceAmounts.js; src/pages/InvoiceCreation.jsx |
| Dictation replaced the entire composer from a stale snapshot, overwriting typed corrections | Append final recognition results once; show replaceable interim text separately; prevent interpretation while recognition is active | src/services/dictation.js; src/pages/InvoiceCreation.jsx |
| “Quatre-vingts” was interpreted as 24 | Handle the French 80/90 construction and retain description tokens around hyphenated numbers | src/services/invoiceInterpreter.js |
| “Monsieur et Madame” lost one recipient | Preserve supplied civilities | src/services/invoiceInterpreter.js |
| Later dated work inherited the first work date | Apply standalone date markers to subsequent items | src/services/invoiceInterpreter.js |
| “Meuble déplacement” appeared certain | Keep source wording and ask for review | src/services/invoiceInterpreter.js |
| Accessing localStorage itself could throw outside the fallback guard | Guard storage access as well as reads/writes | src/services/invoiceNumberStore.js |
| UI implied durable saving and entirely local speech processing | Say changes are applied; qualify browser dictation processing | src/pages/InvoiceCreation.jsx |

Regression coverage: tests/mvpReliability.test.mjs.

## Consolidate next, in this order

1. **Account for all source text.** Unknown unpriced work outside WORK_WORDS can disappear; narrative splitting only runs above 105 characters. Keep unmatched fragments and ask “Garder dans les travaux ?”. Add a representative, anonymized corpus of real typed notes and speech transcripts, including omissions, corrections, dimensions, thousands, decimals and several customers. Measure omitted facts and wrong amounts, not only successful parses. Avoid growing a vocabulary of plumber-specific regex exceptions indefinitely.
2. **Save drafts and issued documents deliberately.** Only the counter currently persists. A refresh loses the document. Add draft recovery, a visible saved state, and a searchable document history. Store an issued snapshot so re-download is stable; make later changes explicit revisions. Design numbering at the same time: facture/devis currently share the counter, and browser-local counters cannot coordinate devices or simultaneous tabs.
3. **Make final-document validation independent of question dismissal.** This branch adds a guard for customer/items/amounts, but dates still accept arbitrary editor strings and PDF metadata can normalize them differently. Centralize validation and currency arithmetic; represent missing, zero and included work separately; show the exact fields to fix. Validate long descriptions and multipage PDFs: the table paginates, but surrounding header/payment/footer blocks use fixed coordinates and can overflow.
4. **Move business settings out of source code before onboarding another artisan.** Sender identity, bank details, VAT treatment and payment terms currently belong to one business. Ask for them once during onboarding, reuse them thereafter, and distinguish configured defaults from extracted job facts. This review is not a legal compliance audit.

## Improve after consolidation

- Offer corrections directly on the Client / Intervention / Prestations summary rather than sending routine edits to the full editor.
- For uncertain dictation, offer a grounded suggestion with the original alongside it, for example “Meuble déplacement” -> “Main-d’œuvre et déplacement ?”, requiring confirmation.
- Test actual speech capture on target Android/iPhone browsers, permission refusal, interruptions, silence and stop/start cycles. Browser feature detection is already present, but actual recognition quality is device/service dependent.
- Add a semantic interpreter only after the regression corpus exists. Keep the existing boundary; validate outputs; ground names, dates and amounts in source text; preserve unmatched information; retain manual fallback. No new paid API or frontend secret is introduced here.
- Add quote-to-invoice conversion and sharing after durable document history exists.

## Validation and limits

- `npm test`: 16 passing tests (10 existing, 6 new).
- `npm run build`: passed after local dependency repair with `npm install --ignore-scripts --package-lock=false`. The repository checks in node_modules with platform-specific/incomplete binaries; the initial build failed. Build retains a large-chunk warning. Dependency and generated-dist changes are not part of this branch.
- JSX parsed successfully with the existing Babel parser.
- The example PDF was visually inspected, but no revised PDF renderer is claimed or included.
- Live browser interaction was attempted; the remote browser blocked localhost with ERR_BLOCKED_BY_CLIENT. No end-to-end browser, microphone, or physical-device test is claimed. Pure dictation result processing is covered by a regression test.
- The deterministic parser remains limited: unsupported number words and ambiguous quantity-versus-total wording still require broader work; this patch is not arbitrary French speech understanding.

Recommended next task: implement source-coverage review plus the real-world regression corpus. It directly protects the product's central promise: accepting rough input without silently losing facts.
