# Android Native Blueprint v1 (Living Document)

## Current Status
- **Baseline:** Freshly created sandbox. Needs porting of `Travel-Vault_PWA` source code to form the core UI.
- **Goal:** Native Android `.apk` generation using Capacitor with completely manual Google Drive sync and dedicated App Exit hooks.

## 1. Local-First Manual Sync Strategy
Instead of syncing silently in the background:
- `localSave()` in `shared/db.js` will *only* alter IndexedDB and queue a 'pending' sync operation.
- A global UI Warning Banner ("⚠️ Unsaved Changes") will evaluate `_queue` lengths via `getPendingCount()`.
- A dedicated "Sync with Google Drive" button in the Settings menu will trigger `processDriveQueue()` explicitly.
- The `beforeunload` event (or native Capacitor exit hook) will be patched to intercept attempts to close the app while the queue is non-empty.

## 2. Capacitor Wrapper Configuration (Planned)
- Capacitor will package the HTML/CSS/JS exactly as it is for the browser WebView.
- Capacitor's `@capacitor/app` library provides the critical `App.addListener('backButton', ...)` mechanism.
- This back button hook will be captured at the top-level Router. If on the main dashboard, tapping back will trigger the custom UI prompt: "Are you sure you want to exit? (Sync first?)".

## 3. UI and Legacy Code Cleanup
- Redundant real-time elements (like the rotating Drive Sync Spinner in the headers) will be pruned.
- The "Drive Deep Clean" tools will be removed from standard menus and perhaps archived or hidden, as manual sync eliminates the background rapid-fire sync race conditions.
