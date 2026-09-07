# Facture Facile mobile

React Native/Expo client for SmoothFacture.

## What this slice includes

- Expo SDK 57 / React Native 0.86 mobile shell.
- Free-form invoice/devis input.
- Native French speech recognition through `expo-speech-recognition`.
- Shared deterministic interpreter from the existing application.
- Canonical P0 invoice model shared with the web codebase.
- Company profile with SIREN/SIRET and local persistence.
- Customer type (particulier / entreprise), customer SIREN and regulatory operation category.
- Electronic-invoice readiness validation before future Factur-X / PA transmission.
- Optional client for the P0 persistence API under `src/services/smoothfactureApi.js`.

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

## Connect the persistent backend

Start the backend from `../server` and set an API URL reachable from the phone:

```text
EXPO_PUBLIC_SMOOTHFACTURE_API_URL=http://192.168.1.20:35457
```

The mobile API client supports:

- synchronizing the company profile;
- creating/updating invoice drafts;
- finalizing a saved draft and receiving its server-issued number;
- listing persisted invoices.

If `EXPO_PUBLIC_SMOOTHFACTURE_API_URL` is not set, these network operations stay disabled rather than silently sending business data somewhere.

## Validation from the repository root

The shared domain layer is covered by Node tests:

```bash
npm test
```

The persistence/numbering backend has its own tests:

```bash
cd server
npm install
npm test
```

## Still intentionally out of scope

- Wiring the persistence actions into every mobile screen/action.
- Mobile PDF generation / exact PDF preview.
- Factur-X generation.
- Plateforme Agréée API integration.
- Authentication/authorization and company ownership enforcement.
- Full multi-rate VAT editor/calculation engine.

The server now owns durable company/customer/invoice storage, final numbering and invoice lifecycle events. Future output and PA integrations should consume the canonical model in `src/domain/` instead of rebuilding invoice data.
