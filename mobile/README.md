# Facture Facile mobile

React Native/Expo client for SmoothFacture.

## P0 flow implemented

- Expo SDK 57 / React Native 0.86 mobile shell.
- Free-form invoice/devis input.
- Native French speech recognition through `expo-speech-recognition`.
- Shared deterministic interpreter from the existing application.
- Canonical invoice model shared with the backend/web codebase.
- Company profile with SIREN/SIRET and local persistence.
- Optional server synchronization through `EXPO_PUBLIC_SMOOTHFACTURE_API_URL`.
- Customer type (particulier / entreprise), customer SIREN and regulatory operation category.
- Draft save/update without consuming a final number.
- Server finalization with an immutable assigned number.
- Electronic-invoice readiness validation before finalization.
- VAT P0 workflow: franchise 293 B, 20 %, 10 %, 5.5 %, mixed line rates and BTP autoliquidation.
- Explicit confirmation before a reduced 10 % / 5.5 % rate can be finalized.

The existing Vite web application remains available while the native migration continues.

## Run

Expo SDK 57 requires Node.js 22.13 or newer.

```bash
cd mobile
npm install
npm start
```

Speech recognition uses a native config plugin, so use a development build for microphone dictation:

```bash
npm run android
# or on macOS
npm run ios
```

## Connect the backend

Start the API first:

```bash
cd server
npm install
npm test
npm start
```

Then configure an address reachable from the device. For a physical phone, do not use `localhost` unless the API is running on the phone itself.

Example:

```text
EXPO_PUBLIC_SMOOTHFACTURE_API_URL=http://192.168.1.20:35457
```

With the API configured, the mobile flow is:

```text
Dictate / type
→ interpret
→ verify client + tax
→ save draft
→ finalize
→ server assigns number
→ finalized content becomes read-only
```

If the API URL is absent, interpretation/review and the local company profile still work, but Save draft / Finalize are disabled.

## VAT behavior

The company profile chooses either:

- `Franchise 293 B` — no collected VAT, article 293 B mention;
- `Assujetti TVA` — default line rate of 20 %, 10 % or 5.5 %.

For VAT-registered companies, the review screen can change each line independently. Reduced rates are never inferred automatically from dictated text; selecting 10 % or 5.5 % requires explicit confirmation that the conditions are met.

For BTP subcontracting, `Autoliquidation BTP` is available for a professional customer. The invoice remains HT and the tax breakdown uses the `Autoliquidation` treatment.

The backend recalculates all tax totals before storing/finalizing the document.

## Validation from the repository root

Shared interpreter/domain tests:

```bash
npm test
```

Backend tests:

```bash
cd server
npm install
npm test
```

## Still intentionally out of scope

- Authentication / authorization.
- Mobile PDF generation / exact PDF preview.
- Factur-X generation.
- Plateforme Agréée integration.
- E-reporting.
- Production database/backups/deployment.

Those next layers should consume the canonical invoice persisted by the server rather than recreate business data inside the UI.
