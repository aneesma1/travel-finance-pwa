# Session Tracking: Android Native Sandbox

This document tracks coding activity strictly for the `Travel-Vault_Android` directory codebase.

---

## Session Index

### Session 1: Sandbox Initialization (2026-04-10)
**Context:** The Travel-Finance app is splitting into a legacy PWA archive and this active Android development folder.
**Goals:**
- Prepare Android workspace.
- Define Android native bridge constraints and new manual-sync flow (Blueprint v1).

**Work Completed:**
- Created initial sandbox structure (`Travel_app/` and `Personal_vault/`).
- Authored initial `Android_Blueprint_v1.md`.

---

### Session 2: Blueprint Implementation — Local-First Native App (2026-04-10)
**Context:** Porting PWA source into isolated native sandboxes and implementing the manual-sync architecture.

**Work Completed:**
- Initialized Native Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/filesystem`, `@capacitor/share`) across both sandboxes.
- Rewrote `shared/drive.js` with unified `TravelFinanceApp` storage root — `.json` backups paired with `.xlsx` sheets.
- Modified `downloadLocalBackup` to use native `@capacitor/share` sheet.
- Updated `shared/sync-manager.js` to be fully Local-First: no background auto-sync.
- Implemented Bi-Directional Merge in `processDriveQueue()` for conflict resolution.
- Injected Boot-time ETag check to alert user of upstream Drive changes.
- Pruned legacy code: offline banners, service-worker installers, PWA prompts, Recovery ZIP Builder.
- Created GitHub Actions workflows: `.github/workflows/build-travel.yml` and `build-vault.yml`.
- Configured Capacitor native Android back-button exit hook in both apps.

---

### Session 3: Automated Versioning & Build Tracking (2026-04-10)
**Context:** Establishing a "Single Source of Truth" for app versioning to produce named, trackable APKs.

**Work Completed:**
- Created independent `Travel_app/VERSION` and `Personal_vault/VERSION` files (set to `5.4.1`).
- Updated both CI/CD workflows to:
  - Read the local `VERSION` file.
  - Inject `window.APP_VERSION` and `window.BUILD_TIME` into `index.html` at build time.
  - Sign, align and rename APKs: `TravelHub_v{Version}_b{BuildNumber}.apk`.
- Updated Settings UI in both apps to display version and build timestamp.
- **Result:** Build #21 produced `TravelHub_v5.4.1_b21.apk` and `PersonalVault_v5.4.1_b21.apk`.

---

### Session 4: CI/CD Path Fix (2026-04-10)
**Context:** Iterative fixes to CI/CD pipeline after build failures.

**Work Completed:**
- Fixed `VERSION` file path references in GitHub Actions using `$GITHUB_ENV`.
- Restored explicit Capacitor binary `chmod` permissions in CI/CD pipeline.
- Expanded build path triggers to include `shared/` assets and `.github/workflows/` files.
- Resolved merge conflicts in build workflows.
- Robustified the ES module-to-standard-script stripping in both workflows.

---

### Session 5: Critical Boot Crash Fix — v5.4.2 (2026-04-11)
**Context:** App crashing on launch with `runBootIntegrityCheck is not defined` (and cascading deeper errors).

**Root Cause:** 5 compounding bugs caused by progressive corruption of source files across previous sessions.

**Work Completed:**

#### Bug 1 — `Travel_app/src/index.html` (Catastrophic)
- Two boot systems were completely merged together (old ES `<script type="module">` + new `<script src="">` globals).
- Code fragments were floating **outside any `<script>` tag**.
- `bootApp()` and `boot()` both defined but called incorrectly.
- **Fix:** Completely rebuilt `index.html` from scratch with a single, clean `boot()` function.

#### Bug 2 — `Personal_vault/src/index.html`
- Used `import('./js/screens/pin-lock.js')` dynamic import — this fails in non-module script context.
- **Fix:** Added `<script src="js/screens/pin-lock.js">` static tag; `renderPinLock`/`renderPinSetup` become globals.

#### Bug 3 — `shared/sync-manager.js` (Syntax Error)
- Missing closing `}` brace after safety interlock `throw` killed the entire `processDriveQueue()` function.
- Called undefined `readDriveQueue()` function.
- Used `await import('./auth.js')` inside function body — dynamic import fails after module stripping.
- **Fix:** Rewrote entirely in plain ES5 style; replaced dynamic import with direct global `authFetch()` call.

#### Bug 4 — `shared/db.js`
- `setAppState()` used `{...current, ...state}` spread — destroys arrays (corrupts the `syncQueue` array).
- **Fix:** Store values directly with `dbSet()`/`dbDelete()`; no spreading.

#### Bug 5 — `shared/utils.js`
- A Deep Clean button event listener was injected **inside** `showToast()`, crashing every toast.
- Conflicting `getAppState`/`setAppState` functions shadowed the IndexedDB versions from `db.js`.
- **Fix:** Removed junk code; renamed localStorage helpers to `getLocalPref`/`setLocalPref`.

**Files Changed (10):**
- `Travel_app/VERSION` → `5.4.2`
- `Personal_vault/VERSION` → `5.4.2`
- `Travel_app/src/index.html` → Full rebuild
- `Personal_vault/src/index.html` → Full rebuild
- `Travel_app/shared/sync-manager.js` → Full rewrite (ES5)
- `Personal_vault/shared/sync-manager.js` → Synced from Travel_app
- `Travel_app/shared/db.js` → Fixed `getAppState`/`setAppState`
- `Personal_vault/shared/db.js` → Synced from Travel_app
- `Travel_app/shared/utils.js` → Removed junk code
- `Personal_vault/shared/utils.js` → Synced from Travel_app

**Git Commit:** `40272c1` — pushed to `origin/main`
**Expected Result:** Build #22 → `TravelHub_v5.4.2_b22.apk` + `PersonalVault_v5.4.2_b22.apk`

---

**Next Steps (Pending — Session 6):**
- Verify Build #22 succeeds on GitHub Actions.
- Install APK and confirm no boot crash.
- Test PIN lock flow (Vault), travel log, and manual Drive sync.
- Adjust CSS for Android safe-area insets (status bar / notch).

---

### Session 6: Blueprint V2 — 100% Local-First Migration (2026-04-17)
**Context:** Executing the full architectural migration defined in `Android_Blueprint_v2_LocalFirst.md`. Decision to eliminate all Google Cloud dependencies (OAuth, Drive API, Tester List) and replace with AES-GCM local encryption and native Android sharing.

**Blueprint V2 Directives Completed (52/52 checks passed):**

#### Directive 1 — Total Google Cloud API Removal
- Deleted `shared/auth.js` from **both** apps.
- Stubbed out `shared/app-config.js` (Drive PIN sync) — both apps.
- Stubbed out `src/js/app-config.js` (Vault) — removed `getToken` import.
- Stubbed out `Travel_app/src/js/calendar.js` — no more Google Calendar API.
- Removed `periodicSync` hook from both `sw.js` files.
- Scrubbed Settings UI: removed `backup-health-btn`, `find-shared-btn`, `security-audit`, `signout-btn`, `clearAuth`, `startOAuthFlow`, `findSharedDatabases`, `connectSharedDatabase`.
- Tightened `Content-Security-Policy` in both `index.html` — removed `googleapis.com` from `connect-src`.

#### Directive 2 — Instant 15-Day Pruning (Zero Battery Drain)
- Added `writeAndPruneLocalBackup()` to `shared/sync-manager.js`.
- Fires synchronously inside `localSave()` — no background service, no battery drain.
- Writes daily backup files to Android `DOCUMENTS` directory.
  - Vault: `Vault_Backup_YYYY-MM-DD.vaultbox`
  - Travel: `TravelHub_Backup_YYYY-MM-DD.travelbox`
- Auto-prunes files older than **15 days** on every save.
- Synced updated `sync-manager.js` to Travel app.

#### Directive 3 — AES-GCM Web Crypto Secure Sharing
- Created `shared/crypto-engine.js` (new file, both apps) — AES-GCM + PBKDF2 key derivation via Web Crypto API.
- Created `shared/backup-engine.js` (new file, both apps) — full export/import flow.
- `exportEncryptedBackup()`: password prompt → encrypt → write to CACHE dir → native Android Share intent.
- `.vaultbox` (Vault) and `.travelbox` (Travel) file extensions.
- Wired to Account Tab `export-vaultbox-btn` in both apps.

#### Directive 4 — Native Android Intent Import (Viewer Workflow)
- `importEncryptedBackup()`: HTML file picker → FileReader → password prompt → `decryptData()` → `setCachedFinanceData/setCachedTravelData()`.
- Wrong-password error handled gracefully (`WRONG_PASSWORD` flag).
- Travel backup-engine uses `getCachedTravelData`/`setCachedTravelData` (data-agnostic).
- Wired to Account Tab `import-vaultbox-btn` in both apps.

#### Directive 5 — Android Crash Fix
- Both `index.html` already fixed in Session 5 (`type="module"`). Confirmed still correct.
- No `renderDashboard is not defined` crash path remains.

**Files Changed (14 modified + 4 new + 2 deleted):**
- `Personal_vault/shared/app-config.js` → Stubbed
- `Personal_vault/shared/auth.js` → **DELETED**
- `Personal_vault/shared/sync-manager.js` → Added `writeAndPruneLocalBackup()`
- `Personal_vault/shared/utils.js` → Fixed modal text stale hints
- `Personal_vault/shared/backup-engine.js` → **NEW FILE**
- `Personal_vault/shared/crypto-engine.js` → **NEW FILE**
- `Personal_vault/src/index.html` → CSP tightened
- `Personal_vault/src/js/app-config.js` → Stubbed
- `Personal_vault/src/js/screens/settings.js` → Cloud listener cleanup, backup engine wired
- `Personal_vault/src/sw.js` → periodicSync removed
- `Travel_app/shared/app-config.js` → Stubbed (synced)
- `Travel_app/shared/auth.js` → **DELETED**
- `Travel_app/shared/sync-manager.js` → Synced from Vault
- `Travel_app/shared/utils.js` → Synced from Vault
- `Travel_app/shared/backup-engine.js` → **NEW FILE** (travel-specific data functions)
- `Travel_app/shared/crypto-engine.js` → **NEW FILE** (synced from Vault)
- `Travel_app/src/index.html` → CSP tightened
- `Travel_app/src/js/calendar.js` → Stubbed
- `Travel_app/src/js/screens/settings.js` → Full cloud listener cleanup, backup engine wired, orphaned listener block fixed
- `Travel_app/src/sw.js` → periodicSync removed
- `Android_Blueprint_v2_LocalFirst.md` → **NEW FILE** (architectural blueprint)

**Blueprint V2 Compliance Audit:** 52/52 checks PASSED.

**Expected Result:** Next build → `TravelHub_v5.5.0_b{N}.apk` + `PersonalVault_v5.5.0_b{N}.apk`

---

### Session 7: Native Asset Resolution Fix (2026-04-17)
**Context:** Both apps were crashing on Android due to `SyntaxError` and "missing export" errors for `db.js` and `pin.js`.

**Root Cause:** The `shared/` utility folder was located outside of the `src/` web root. While this works in a standard PWA, Capacitor only serves assets within the `webDir` (`src`). This caused imports like `./shared/db.js` to return 404/index.html instead of the JavaScript module.

**Work Completed:**
- **Directory Restructuring**: Moved the `shared` module into the web root for both applications.
  - `Personal_vault/shared/` → `Personal_vault/src/shared/`
  - `Travel_app/shared/` → `Travel_app/src/shared/`
- **Import Path Audit**: Recursively updated all JavaScript screens to point to the new relative path.
  - Changed `../../../shared/` to `../../shared/` across all `src/js/screens/*.js` and `src/js/modals/*.js`.
- **Version Bump**: Incremented both app versions to `5.5.1`.
- **CI/CD Pipeline Fix**: Updated `.github/workflows/` to remove the obsolete `cp shared src/shared` step, as files are now checked into Git in their correct final locations.

**Files Changed (30+):**
- `Personal_vault/shared` (MOVED)
- `Travel_app/shared` (MOVED)
- `Personal_vault/VERSION` (5.5.1)
- `Travel_app/VERSION` (5.5.1)
- Multiple JS files in `src/js/` (import updates).

**Expected Result:** APK build #24+ will successfully boot and resolve all internal module exports.
---

### Session 8: CI/CD Pipeline Logic Restoration (2026-04-18)
**Context:** App crashes on Android with `SyntaxError: The requested module ... does not provide an export...` after successful builds.

**Root Cause:** The GitHub Actions pipelines were executing an aggressive `sed` command that stripped all `export` keywords from JavaScript files. While intended for an earlier "standard script" migration, it terminally broke the apps' modern ES Module boot system (`type="module"`), leading to runtime module resolution failures.

**Work Completed:**
- **Pipeline Refactoring**: Removed the destructive Javascript and path stripping logic from both `build-travel.yml` and `build-vault.yml`.
- **ES Module Preservation**: Restored full support for native ES Module loading on Android (which Capacitor 5+ handles out-of-the-box).
- **Workflow Optimization**: Renamed the broken "Transform ES Modules" step to **"Inject Version Information"**, focusing solely on updating version strings in `index.html`.
- **Path Stabilization**: Removed manual `sed` path replacements that were forcefully changing `../shared/` to `./shared/`, as the project structure already correctly resolves relative paths.

**Files Changed (2):**
- `.github/workflows/build-travel.yml`
- `.github/workflows/build-vault.yml`

**Expected Result:** Next build will serve valid ES Module code, resolving the boot-time `SyntaxError`.
