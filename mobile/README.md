# Facture Facile mobile

First React Native/Expo client for SmoothFacture.

## What this slice includes

- Expo SDK 57 / React Native 0.86 mobile shell.
- Free-form invoice/devis input.
- Native French speech recognition through `expo-speech-recognition`.
- Shared deterministic interpreter from the existing application.
- Canonical P0 invoice model shared with the web codebase.
- Company profile with SIREN/SIRET and local persistence.
- Customer type (particulier / entreprise), customer SIREN and regulatory operation category.
- Electronic-invoice readiness validation before future Factur-X / PA transmission.

The existing Vite web application remains untouched while the native migration is validated.

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

## Validation from the repository root

The shared domain layer is covered by Node tests:

```bash
npm test
```

## Still intentionally out of scope for this first slice

- Mobile PDF generation / exact PDF preview.
- Factur-X generation.
- Plateforme Agréée API integration.
- Server-side company/account authentication.
- Server-side immutable invoice numbering and audit trail.
- Full multi-rate VAT editor/calculation engine.

Those should be implemented against the canonical model in `src/domain/` rather than recreating invoice data inside the mobile UI.
