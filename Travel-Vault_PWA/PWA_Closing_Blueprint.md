# Travel-Vault PWA: Closing Blueprint

## 1. Current Status (Frozen)
The Progressive Web App (PWA) build of the Travel-Finance suite has been officially frozen and archived. All active feature development has migrated to the dedicated `Travel-Vault_Android` directory to focus on native Android deployment and offline-first manual sync behaviors.
 
This directory contains the highly optimized, finalized version of the PWA build prior to the native migration.

## 2. Architecture Overview
- **Deployment:** Standard Web technologies (HTML/CSS/JS/ES6 Modules). 
- **Applications:** Dual PWA suite.
  - `app-a-family-hub`: Travel log and passenger tracking.
  - `app-b-private-vault`: Transaction tracking and private document storage.
- **Service Workers:** Local offline caching managed by explicit `sw.js` implementations utilizing CacheStorage.

## 3. Data Synchronization Model (The "Live" Model)
This PWA directory uses the **Phase 3 Local-First Queue-Based Real-time Sync** architecture:
- Data is written immediately to IndexedDB for `<10ms` response times.
- Operations are enqueued in `_queue` (in-memory, persisted locally and remotely).
- `processDriveQueue()` dynamically flushes changes to Google Drive files automatically in the background when the device is online.
- Heavy reliance on Drive Sync Indicators UI spinners and network state watchers.

## 4. Known Issues in Frozen State
- **Passenger Selector Bug:** The "All" dropdown in `app-a-family-hub/js/screens/travel-log.js` has a bug where it fails to close properly when clicking "Apply Filters" because of an incorrect DOM class deletion (`.filter-dropdown`).
- Lack of Native exit hooks.

## 5. Next Steps
This folder is to be kept as a reference and backup. Any logic needed for the Capacitor Android build will be directly ported from `Travel-Vault_PWA/shared` and the respective app folders to `Travel-Vault_Android`.
