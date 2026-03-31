# Travel Finance Record New Codex Blueprint

## Project Goal

Build a simpler, more maintainable travel-and-finance record system using:

- a PWA frontend for mobile and desktop use
- Google Sheets as the data store
- Google Apps Script as the API layer

The new system should preserve the useful purpose of the older suite while reducing complexity, sync fragility, and deployment overhead.

## Product Direction

This rebuild is intentionally lean.

What we are keeping:

- travel records
- people records
- document expiry tracking
- finance transaction tracking
- dashboard summaries
- installable PWA experience
- offline read cache with controlled sync

What we are not building in the first phase:

- Google Drive JSON sync
- multi-branch mirror snapshots
- ETag retry architecture
- Google Calendar integration
- complex family-tree logic
- image-heavy workflows
- advanced analytics beyond essential summaries
- multiple PWAs

## High-Level Architecture

### Frontend

One PWA application:

- `pwa/index.html`
- `pwa/css/`
- `pwa/js/`
- `pwa/manifest.json`
- `pwa/sw.js`

The PWA will:

- authenticate the user with Google
- fetch data through an Apps Script web app
- cache the latest synced payload locally
- queue simple create/update/delete actions when offline
- replay queued actions when connectivity returns

### Backend

Google Apps Script will act as the API:

- receives requests from the PWA
- validates payloads
- reads/writes rows in the spreadsheet
- returns normalized JSON to the app

The backend will live in:

- `apps-script/Code.gs`
- `apps-script/appsscript.json`
- optional helper files if the script grows

### Data Store

One Google Spreadsheet with separate sheets:

- `People`
- `Trips`
- `Documents`
- `Transactions`
- `Settings`
- `AuditLog`

## Data Model Plan

### People

Core identity records used by travel and documents.

Suggested columns:

- `id`
- `name`
- `nickname`
- `phone`
- `email`
- `nationality`
- `notes`
- `isActive`
- `createdAt`
- `updatedAt`

### Trips

Travel movement records.

Suggested columns:

- `id`
- `personId`
- `personName`
- `fromCountry`
- `toCountry`
- `dateOut`
- `dateIn`
- `reason`
- `flightNumber`
- `companions`
- `notes`
- `status`
- `createdAt`
- `updatedAt`

### Documents

Expiry-driven records.

Suggested columns:

- `id`
- `personId`
- `personName`
- `documentType`
- `documentNumber`
- `issueDate`
- `expiryDate`
- `issuingCountry`
- `notes`
- `createdAt`
- `updatedAt`

### Transactions

Private finance records.

Suggested columns:

- `id`
- `date`
- `type`
- `amount`
- `currency`
- `category`
- `subCategory`
- `account`
- `description`
- `notes`
- `createdAt`
- `updatedAt`

### Settings

System-level values.

Suggested keys:

- `appName`
- `defaultCurrency`
- `homeCountry`
- `alertDays`
- `lastMigration`

### AuditLog

Operational tracking from Apps Script.

Suggested columns:

- `id`
- `timestamp`
- `actor`
- `action`
- `entityType`
- `entityId`
- `status`
- `details`

## Frontend Module Plan

### App Shell

- `app.js`: boot flow and global initialization
- `router.js`: simple hash-based navigation
- `state.js`: in-memory state and cached payload access
- `api.js`: communication with Apps Script web app
- `storage.js`: IndexedDB/localStorage persistence
- `sync.js`: offline queue and replay

### Screens

- `screens/dashboard.js`
- `screens/people.js`
- `screens/trips.js`
- `screens/documents.js`
- `screens/finance.js`
- `screens/settings.js`

### Shared UI

- `components/header.js`
- `components/nav.js`
- `components/modal.js`
- `components/toast.js`
- `components/forms.js`

## Apps Script API Plan

The backend will start with a small, explicit contract.

### Endpoints

Single web-app entrypoint with action-based dispatch:

- `action=getBootstrap`
- `action=listPeople`
- `action=savePerson`
- `action=deletePerson`
- `action=listTrips`
- `action=saveTrip`
- `action=deleteTrip`
- `action=listDocuments`
- `action=saveDocument`
- `action=deleteDocument`
- `action=listTransactions`
- `action=saveTransaction`
- `action=deleteTransaction`

### Response Shape

All responses should normalize to:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "ISO8601",
    "version": "0.1.0"
  }
}
```

## Offline Strategy

The app should use a simpler offline model than the current suite:

- cache the last successful bootstrap payload
- allow draft writes into a local queue
- replay queue serially when back online
- if replay fails, preserve the queue and show a user-visible sync warning

We will avoid background complexity until the core experience is stable.

## Authentication Strategy

Preferred approach:

- Google Identity Services on the frontend for sign-in
- Apps Script validates allowed user email where possible

If Apps Script deployment constraints become awkward, we can temporarily start with a public web app plus an allowlist key model for development, then harden authentication next.

## Delivery Phases

### Phase 1

- create project skeleton
- define spreadsheet schema
- create Apps Script bootstrap endpoint
- create PWA shell and dashboard

### Phase 2

- people CRUD
- trips CRUD
- documents CRUD
- transaction CRUD

### Phase 3

- offline queue
- settings screen
- dashboard summaries
- install polish

### Phase 4

- validation hardening
- export helpers
- audit log improvements
- production setup guide

## Success Criteria

The rebuild is successful if:

- one PWA works across phone and desktop
- data is readable and editable through Google Sheets
- travel, document, and finance records all work in one app
- offline cache works for viewing and deferred saves
- the system is easier to reason about than the previous suite

## First Build Priorities

Immediate implementation order:

1. create documentation and session workflow
2. scaffold the PWA shell
3. scaffold Apps Script backend
4. define the spreadsheet schema and payload contract
5. connect bootstrap read flow