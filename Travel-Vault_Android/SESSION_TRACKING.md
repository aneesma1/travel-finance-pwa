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
- **Deep Import Audit**: Ran automated resolution checks across all files and resolved 11 hidden `SyntaxError` crashes, including broken paths in `expiry-checker.js` and obsolete `auth.js` dependencies inside `drive.js`, `recovery.js` and `security-log.js` by stubbing local functions.

**Files Changed (2):**
- `.github/workflows/build-travel.yml`
- `.github/workflows/build-vault.yml`

**Expected Result:** Next build will serve valid ES Module code, resolving the boot-time `SyntaxError`.

---

### Session 9: Post-Audit Fixes — Missing Exports, Safe-Area, Settings Crashes (2026-04-18)
**Context:** Following the CI/CD restoration in Session 8, a full codebase audit found additional runtime crashes: missing function exports causing `SyntaxError` on import, unsafe-area bar overlap on Android, a `getUser` crash in Travel settings, a broken Excel import flow, and an Exit Confirm dialog issue.

**Work Completed:**
- **Missing Exports Audit**: Added missing `export` keywords for `showToast`, `localSave`, `getAppState`, `setAppState` across `utils.js` and `sync-manager.js` in both apps.
- **Safe-Area CSS**: Added `padding-top: env(safe-area-inset-top)` and `padding-bottom: env(safe-area-inset-bottom)` to `.app-header` and `.bottom-nav` in both `app.css` files to prevent content hiding behind the Android status bar and navigation bar.
- **Travel Settings — `getUser` crash**: Removed a dangling `getUser()` call inside the "Manage Access" button handler (People tab). `auth.js` was deleted in Blueprint V2; the call now passes an empty string.
- **Excel Import fix**: Resolved a broken path that prevented `import-tool.js` from loading correctly after the `src/shared/` restructure.
- **Exit Confirm Dialog**: Wired the native Android back-button `exitApp()` call to show a confirmation dialog before closing.

**Files Changed (6):**
- `Personal_vault/src/shared/utils.js`
- `Personal_vault/src/shared/sync-manager.js`
- `Personal_vault/src/shared/app-utils.js`
- `Personal_vault/src/css/app.css`
- `Travel_app/src/shared/app-utils.js`
- `Travel_app/src/css/app.css`
- `Travel_app/src/js/screens/settings.js`

**Git Commits:** `9dacd41`, `7b73738`

---

### Session 10: Settings UX Overhaul, Import Preview Fix, Vault Cleanup (2026-04-19)
**Context:** Full review of both apps based on user-reported issues across Travel and Vault settings, import flow, dashboard, and travel log. Focused on removing dead/redundant code, fixing crashes, and improving UX clarity.

---

#### Issues Reported & Resolved

##### Both Apps — Import Excel
**Problem 1:** "Preview" step's "Import All Records" button was cut off below the Android navigation bar — impossible to tap.
**Fix:** Rewrote `renderPreview()` in `shared/import-tool.js` to make the action button `position:sticky; bottom:0` with `padding-bottom: env(safe-area-inset-bottom, 12px)`. The preview table scrolls independently above it.

**Problem 2 (Vault):** Import would show "Processing…" and freeze with no error if `localSave` threw internally.
**Fix:** Wrapped `onImportComplete()` call in `try/catch`. On failure, button resets to "Retry Import" and an inline red error message shows the exact reason.

**Problem 3 (Travel):** Import failed with `"GetCachedTravelData is not defined"` (capital G) — this error was from a **stale APK** built before Session 8 fixes. The current source does not have this issue. However, a related real bug was found and fixed: `downloadLocalBackup` and `restoreFromLocalFile` were **never imported** in `Travel_app/src/js/screens/settings.js`, meaning "Backup Now" and "Restore from Local Backup" would also crash with `ReferenceError`. These are now properly imported from `../../shared/drive.js`.

---

##### Both Apps — "Save & Exit" outside settings
**Problem:** "Save & Exit" button was buried inside the Account tab. Users had to navigate to Account tab just to exit.
**Fix:** Added a `💾 Save & Exit` button directly to the `app-header` bar of the Settings screen (top-right, always visible regardless of active tab). The old duplicate button inside the Account tab was removed.

---

##### Both Apps — "Clear local cache" vs "Reset All Data"
**Problem:** User saw two confusingly named options and didn't understand the difference.
**Root Cause:** The current code only had "Reset All Data" (nuclear wipe). There was no separate "Clear App Cache" option.
**Fix:** Added a **🧹 Clear App Cache** button above "Reset All Data" in the Danger Zone of both apps' Data tabs. Clear distinction:
- **Clear App Cache**: Unregisters service worker + clears `sessionStorage`. **All data is preserved.** Safe to use anytime to resolve stale UI issues.
- **Reset All Data**: Wipes `IndexedDB` + `localStorage` + `sessionStorage`. All records gone permanently.

Both buttons now have explanatory subtitles and a note below the danger zone explaining the difference.

---

##### Travel App — "Repair & Verify" button
**Question:** Is this button redundant or useful?
**Answer:** **Kept — it is genuinely useful.** Located in the Account tab, it does two real operations:
1. Deduplicates exact duplicate trip entries (same passenger + date).
2. Creates missing trip records for companions (e.g., if Person A's trip lists Person B as a companion but Person B has no matching trip record).
No code change needed.

---

##### Travel App — Passenger Filter in Travel Log
**Problem:** After selecting passengers and clicking "Apply Filters", the dropdown button still showed "👤 All ▾" even when the filter was active. Made it appear like the filter did nothing.
**Fix:** Added immediate label update in the Apply button click handler — after filtering, `dropBtn.textContent` is set to `"👤 {Name} ▾"` (single) or `"👤 N Selected ▾"` (multi) before calling `renderTrips`.

---

##### Travel App — Refresh Button in Home Screen
**Finding:** The Travel dashboard (`dashboard.js`) only has a Share (⬆️) button — **no refresh button exists**. No change needed.

---

##### Vault App — "Restore from Cloud Mirror" in Settings
**Finding:** `showMirrorModal()` was defined as a dead function (never called anywhere in the current UI). `getMirrorSnapshots` and `restoreFromMirror` were imported from `drive.js` but unused.
**Fix:** Removed the entire `showMirrorModal` function and both dead imports. The "Restore from Cloud Mirror" concept is fully incompatible with Blueprint V2 (no Google Cloud).

---

##### Vault App — "Security and Access" exits app
**Finding:** `openSecurityDashboard`, `getActiveSessions`, and `getActivityLog` were imported in vault `settings.js` but **never called** anywhere in the current three tabs (Data, Export, Account). No "Security" route exists in the vault router. This was a leftover from a pre-Blueprint V2 security tab.
**Fix:** Removed all three dead imports. If the user saw a "Security and Access" element that exited the app, it was from a **stale APK**. The current build has no such element.

---

##### Vault App — "Dashboard view of users" — Redundant?
**Finding:** The Vault dashboard (`dashboard.js`) shows financial summary data only (income/spend/net per currency, recent transactions, filter bar). There are **no user/member cards** in the Vault. This is a Travel app concept. No change needed in Vault.

---

##### Vault App — "Account tab > Blank"
**Root Cause (found):** Three compounding issues caused the Account tab to appear broken:
1. The "🚪 Exit App" button inside the Account tab had its `addEventListener` wired **after** the HTML was overwritten by a subsequent render, making it silently non-functional.
2. `repair-data-btn` was rendered in HTML but had **no event listener** attached — tapping it did nothing.
3. The outer `App Info` div had an extra stray `</div>` tag causing malformed HTML.

**Fix:**
- Removed the duplicate "Exit App" button from inside the Account tab (it now lives in the header as "Save & Exit").
- Removed `repair-data-btn` entirely (no useful dedup logic for flat finance records).
- Fixed malformed HTML (removed extra closing `</div>`).
- Added descriptive sub-labels to the Export/Import vaultbox buttons to clarify their purpose.

---

##### Vault App — Refresh Button in Home Screen
**Problem:** `🔄` Refresh button existed next to the Private Vault title. For a 100% local-first app, this just re-renders from IndexedDB — which happens automatically already.
**Fix:** Removed `refresh-btn` from vault `dashboard.js` header and its event listener.

---

##### Vault App — Missing Encrypted Backup Sharing
**Finding:** The encrypted backup buttons (`📤 Export Encrypted Vaultbox` and `📥 Import Vaultbox File`) **were already present** in the Account tab. They were hidden by the Account tab rendering issues listed above. Now that those are fixed, both buttons are visible and functional.

---

**Files Changed (6):**

| File | Change |
|------|--------|
| `Travel_app/src/shared/import-tool.js` | Sticky preview button, try/catch on import, fix renderDone inline onclick |
| `Personal_vault/src/shared/import-tool.js` | Synced from Travel (same changes) |
| `Travel_app/src/js/screens/settings.js` | Add Save&Exit to header; add Clear Cache button; fix missing imports (downloadLocalBackup, restoreFromLocalFile); remove getUser() crash; remove dead showMirrorModal; remove unused imports |
| `Personal_vault/src/js/screens/settings.js` | Add Save&Exit to header; add Clear Cache button; remove dead imports (getMirrorSnapshots, restoreFromMirror, openSecurityDashboard, getActiveSessions, getActivityLog); remove dead showMirrorModal; fix Account tab HTML; remove dead repair-data-btn and Exit App in-tab button |
| `Personal_vault/src/js/screens/dashboard.js` | Remove redundant Refresh button |
| `Travel_app/src/js/screens/travel-log.js` | Fix passenger filter dropdown label after Apply |

**Git Commit:** `b26aa99`

**Expected Result:** Next APK build (`v5.5.2+`) will resolve all above issues. Key verifications on device:
- Settings header shows "💾 Save & Exit" on all tabs
- Data tab shows two separate danger buttons (Clear Cache vs Reset)
- Import Excel preview button is visible and tappable above Android nav bar
- Import shows error message if it fails (no silent freeze)
- Travel Log passenger filter label updates after Apply
- Vault Account tab shows Vaultbox export/import buttons clearly
- No redundant Refresh button in Vault home

---

### Session 11: UX Improvements — Share Card, Passenger Filter, Folder Structure, Backup, Export (2026-04-24)
**Context:** Post-v5.5.2 user-testing feedback batch. 16 improvements across both apps in one commit.

---

#### Issues Resolved — Travel App

**1. Per-trip share → 3-option bottom sheet**
- Old behaviour: single "Copy to clipboard" only.
- New: bottom sheet with 3 options:
  - 💬 Copy WhatsApp Text — clipboard copy of formatted trip summary
  - 🖼️ Share as Card — canvas-rendered 640×360 JPG shared via Capacitor Share
  - 💾 Save JPG to Device — saved to `Documents/TravelHub/exports/TripCard_*.jpg`
- Canvas card: dark indigo gradient, passenger name, route pill with flags, stats grid, reason text.
- **Files:** `Travel_app/src/js/screens/add-trip.js`

**2. Passenger filter → chip-style multi-select**
- Old: radio-button single-select, no memory.
- New: scrollable chip rows (People / Year), multi-select, instant apply (no Apply button), persists to `localStorage` key `travellog_filter_passengers`.
- Filter initialised from localStorage on render.
- Removed `setHashParams` from filter logic (eliminated re-render loop).
- **Files:** `Travel_app/src/js/screens/travel-log.js`

**3. Export button (📤) wired in Travel Log header**
- `#header-export-btn` now calls `openTravelExportSheet(passengers, safeTrips, documents)`.
- **Files:** `Travel_app/src/js/screens/travel-log.js`

**4. Passenger Summary: current location line**
- Under passenger name in Passenger Summary tab: pill showing current country flag + entry date + days count.
- Example: `🇶🇦 Qatar · Since 10 Feb 2026 · 73 Days`
- **Files:** `Travel_app/src/js/screens/travel-log.js`

**5. Dashboard spinner fixed permanently**
- Root cause: spinner left in DOM when `members.length === 0` early-return path was hit.
- Fix: `content.innerHTML = ''` in `loadAndRender()` before any render call.
- **Files:** `Travel_app/src/js/screens/dashboard.js`

**6. Dashboard empty-state copy updated**
- "Sign in" → "Import from Excel via Settings" with navigation button.
- **Files:** `Travel_app/src/js/screens/dashboard.js`

**7. Dashboard: Export current locations as XLSX**
- New `📊` button in dashboard header → `exportCurrentLocationsXLSX()`.
- Builds XLSX with columns: Passenger Name, Current Country, Entry Date, Days in Country.
- Saved to `Documents/TravelHub/exports/CurrentLocations_YYYY-MM-DD_*.xlsx`.
- Toast shows exact saved path.
- **Files:** `Travel_app/src/js/screens/dashboard.js`

**8. Travel Settings: Verify & Repair description updated**
- New text: "Merges duplicate trip entries and creates any missing companion records. Local only — does not affect Google Drive."
- **Files:** `Travel_app/src/js/screens/settings.js`

---

#### Issues Resolved — Vault App

**9. Categories: Title Case normalization**
- `toTitleCase()` helper added to `category-manager.js` and `add-transaction.js`.
- All category names normalized on add, rename, merge (Anees → Anees, ANEES → Anees, etc.).
- All comparisons updated to case-insensitive (`toLowerCase()`).
- **Files:** `Personal_vault/src/js/modals/category-manager.js`, `Personal_vault/src/js/screens/add-transaction.js`

**10. Category manager: action bar above Android nav bar**
- `#multi-action-bar` moved outside `.modal-sheet` scroll area, `position:fixed; bottom:0`.
- `padding-bottom: calc(12px + env(safe-area-inset-bottom))`.
- List container gets `padding-bottom:100px` when bar is shown; `12px` when hidden.
- **Files:** `Personal_vault/src/js/modals/category-manager.js`

**11. XLSX export: save to Documents/PersonalVault/exports/**
- `exportToXlsx()` refactored to use `saveXLSXToExports('finance', wb, filenameBase)`.
- XLSX library: local `/js/lib/xlsx.full.min.js` first, CDN fallback.
- Toast shows exact saved path.
- **Files:** `Personal_vault/src/js/screens/settings.js`

**12. Backup JSON: save to Documents/PersonalVault/exports/**
- `backup-now` button now calls `downloadLocalBackup('finance', currentData)`.
- Returns path string → shown in success toast.
- **Files:** `Personal_vault/src/js/screens/settings.js`

**13. drive.js: updated downloadLocalBackup + added saveXLSXToExports**
- `downloadLocalBackup()` — rewrote to save JSON directly to `Documents/<AppFolder>/exports/` (no more Cache + Share flow).
- `saveXLSXToExports(appName, wb, filenameBase)` — new export: saves any XLSX workbook to exports folder.
- `_arrayBufferToBase64()` helper added.
- Applied to **both apps** (`Travel_app/src/shared/drive.js` and `Personal_vault/src/shared/drive.js`).

**14. Settings: labels for Restore JSON vs Import Vaultbox**
- Backup Now: "Saves plain-text JSON to Documents/PersonalVault/exports/ · No password needed"
- Restore JSON Backup: "Pick a Vault_Backup_*.json file — plain text, no password required"
- Import Vaultbox: "AES-GCM encrypted .vaultbox file — requires the password set during export."
- **Files:** `Personal_vault/src/js/screens/settings.js`

---

#### Issues Resolved — Both Apps

**15. Reset All Data dialog: backup files NOT deleted**
- Confirm dialog text updated to include: "✅ Your backup files in Documents/<AppFolder>/ are NOT affected."
- **Files:** `Travel_app/src/js/screens/settings.js`, `Personal_vault/src/js/screens/settings.js`

**16. Exit confirmation dialog on back button at root screen**
- When `canGoBack = false` (at root screen), native back button now shows styled bottom-sheet overlay.
- Overlay shows app icon, "Exit [App Name]?", "Your data is saved locally on this device.", Cancel + Exit buttons.
- Guards against double-tap with `_exitDialogOpen` flag.
- **Files:** `Travel_app/src/index.html`, `Personal_vault/src/index.html`

---

#### Folder Structure Fixes (Both Apps)

- Auto-backup files reorganized into organized subfolders:
  - `Documents/TravelHub/TravelboxFiles/` — daily `.travelbox` backups
  - `Documents/PersonalVault/VaultboxFiles/` — daily `.vaultbox` backups
  - `Documents/TravelHub/exports/` — XLSX exports, JSON backups, trip card JPGs
  - `Documents/PersonalVault/exports/` — XLSX exports, JSON backups
- **Files:** `Travel_app/src/shared/sync-manager.js`, `Personal_vault/src/shared/sync-manager.js`

---

**Files Changed (12):**

| File | Change |
|------|--------|
| `Travel_app/src/js/screens/add-trip.js` | Per-trip 3-option share: WhatsApp text + JPG card share + JPG save |
| `Travel_app/src/js/screens/travel-log.js` | Chip-style filter, export button wired, current location in Passenger Summary |
| `Travel_app/src/js/screens/dashboard.js` | Spinner fix, empty-state text, locations XLSX export |
| `Travel_app/src/js/screens/settings.js` | Verify & Repair description, Reset dialog text |
| `Travel_app/src/shared/drive.js` | `downloadLocalBackup` fixed, `saveXLSXToExports` added |
| `Travel_app/src/shared/sync-manager.js` | Auto-backup to `TravelboxFiles` subfolder |
| `Travel_app/src/index.html` | Exit confirmation dialog |
| `Personal_vault/src/js/modals/category-manager.js` | Title Case normalization, nav bar fix |
| `Personal_vault/src/js/screens/add-transaction.js` | `toTitleCase` on save |
| `Personal_vault/src/js/screens/settings.js` | XLSX/JSON to exports folder + path toast, labels, Reset dialog text |
| `Personal_vault/src/shared/drive.js` | `downloadLocalBackup` fixed, `saveXLSXToExports` added |
| `Personal_vault/src/shared/sync-manager.js` | Auto-backup to `VaultboxFiles` subfolder |
| `Personal_vault/src/index.html` | Exit confirmation dialog |

---

### Session 12: Sync Folder, Share Image, Export Crashes, Storage Permissions (2026-04-27 → 2026-05-10)
**Context:** Multiple follow-up sessions covering Android storage visibility, sync folder setup, share/export crash fixes, APK and PWA build infrastructure, and a batch of UI/UX bug fixes.

---

#### v5.5.3 → v5.5.6 (commits `121f347` → `5639f53` → `1750fcc`)
- **Sync-manager boot backup**: Exported `bootBackup(appName)` called in both `index.html` boot sequences — creates today's backup on every app open, not just on data save
- **drive.js crash fix**: `Directory.Documents` / `Encoding.UTF8` were TypeScript enum references, not valid at runtime. Replaced with string literals `'DOCUMENTS'` / `'utf8'`. Crashed ALL exports/backups before fix.
- **Travel export crashes** (`travel-export.js`): `getStayDays()` hoisted to module level; missing `const lines = []` declaration added; PDF/Excel/CSV now save to `Documents/TravelHub/exports/` via Capacitor
- **Travel log**: Horizontal scroll passenger chips → bottom-sheet popup picker; filter matches primary passenger only (companions excluded); Summary tab added Share Text + Share Image
- **Vault transactions**: FAB `＋` z-index raised to 105; filter sheet Cancel button + safe-area padding

#### v5.6.0 → v5.6.3 (commits `f36f21a` → `c4d30cc` → `09a3b43`)
- **Sync folder — public Documents**: Both apps write `TravelHub_latest.json` / `PersonalVault_latest.json` to public `Documents/` path using `MANAGE_EXTERNAL_STORAGE`
- **AndroidManifest.xml** (both apps): Added `MANAGE_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (≤Android 9), `READ_EXTERNAL_STORAGE` (≤Android 12), `android:requestLegacyExternalStorage="true"`
- **Settings "Sync Folder" section** (both apps): Permission status badge, Grant All Files Access button, Sync Now, Last sync timestamp, Restore from sync_folder (reads `_latest.json` directly)
- **3-option restore dialog**: merge/append/wipe choice on all restore and import paths (both apps)
- **Save image to Documents/share_images/**: Native Capacitor Filesystem write; share sheet fallback
- **Contacts picker graceful fallback**: `passengerName` fallback in all Travel export formats

#### PWA Infrastructure (commits `8b7c72a` → `9c5972c` → `e8880c6`)
- **Standalone bundler** (`Travel-Vault_PWA/build-standalone.py` v4.2.1): Bundles both apps into single-file HTML (no server needed, double-click to open); handles ES module → IIFE transform, dynamic import replacement, CSS inlining
- **PWA dist files** (`FamilyHub_Standalone.html` ~526KB, `PrivateVault_Standalone.html` ~296KB): First production builds

---

#### Issues Resolved (F-series Travel, V-series Vault)
- **F1**: Share button in Travel Log → native Android share sheet via `@capacitor/share`
- **F2**: Save image → `Documents/TravelHub/share_images/` via Capacitor Filesystem
- **F3**: Contacts picker — graceful fallback when no plugin available
- **F4**: Dashboard reminder button — wired correctly
- **F5**: UI safe-area fixes across sheets
- **F6**: Export layout (People → Passengers label)
- **V1**: Save image in Vault transaction view
- **V2**: Category manager action bar above Android nav bar

**Key commits:** `121f347`, `5639f53`, `1750fcc`, `f36f21a`, `c4d30cc`, `09a3b43`, `8b7c72a`, `9c5972c`, `e8880c6`

---

### Session 13: Contact Picker, GPS, Family Defaults, Share Card, Safe Area, Vault UX (2026-05-11 → 2026-05-12)
**Context:** User-testing batch of fixes across both APKs and PWA. Six separate issues resolved across two commits.

---

#### Issues Resolved — Travel App

**1. APK Build Fix — contacts plugin 404** (`3a7adf6`)
- `@capacitor/contacts` does not exist on npm. Corrected to `@capacitor-community/contacts@^7.2.0` in `Travel_app/package.json`

**2. Trip Share Card — wrong data** (`3dd91f2`)
- Card was showing "ARRIVED / DURATION" computed fields. Fixed to show actual trip data:
  - `Departure` → `formatDisplayDate(state.dateLeftOrigin)`
  - `Arrival` → `formatDisplayDate(state.dateArrivedDest)`
  - `Flight` → `state.flightNumber` (shown only if set)
- Was also using `state.flightInward` (non-existent field). Removed.
- **File:** `Travel_app/src/js/screens/add-trip.js` v3.5.32

**3. Android bottom nav bar hiding modal content** (`e88c096`)
- `.modal-sheet` CSS: added `padding: 8px 0 env(safe-area-inset-bottom, 0px)` (both `app.css` files)
- Inline JS bottom sheets in 5 files updated: `padding-bottom` → `calc(Xpx + env(safe-area-inset-bottom, 0px))`
- **Files:** `Travel_app/src/css/app.css`, `Personal_vault/src/css/app.css`, `Travel_app/add-document.js`, `Travel_app/dashboard.js`, `Travel_app/person-profile.js`, `Personal_vault/dashboard.js`, `Personal_vault/transactions.js`

**4. Contact Picker** (`bd14278` → `337d046`)
- Primary: Web Contact Picker API (`navigator.contacts.select()`)
- Fallback: `@capacitor-community/contacts` plugin
- Last resort: manual entry toast
- Note: `@capacitor-community/contacts` v7 has runtime permission API incompatibility with Capacitor 8; Web API confirmed working on user's device
- **File:** `Travel_app/src/js/screens/family-defaults.js` v3.5.9

**5. GPS Location — "User denied Geolocation"** (`841e00a`)
- Root cause: `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` missing from `AndroidManifest.xml`. OS immediately rejects without showing permission dialog.
- Fix: Added both permissions to `Travel_app/android/app/src/main/AndroidManifest.xml`

**6. Auto-populate home address for new family member** (`841e00a`)
- `createEmptyMember()` always set `homeQatar: null, homeIndia: null`
- Fixed: function now accepts `familyDefaults` parameter; copies address from defaults if set
- Call site updated: `createEmptyMember(familyDefaults)` — data destructuring updated to extract `familyDefaults`
- Independent copies via spread (`{ ...familyDefaults.homeQatar }`) so edits don't affect defaults
- **File:** `Travel_app/src/js/screens/person-profile.js`

---

#### Issues Resolved — Personal Vault

**7. Category & Sub-category auto-suggest** (`77cb93d`)
- `cat1` SmartInput: suggestions now built from `savedCats` UNION `transactions.map(t => t.category1)` — all ever-used categories appear
- `cat2` SmartInput: now uses `allSubCategories` built exclusively from `transactions.map(t => t.category2)` — proper sub-category list
- **File:** `Personal_vault/src/js/screens/add-transaction.js` v3.5.26

**8. Click category → filtered transaction list** (`77cb93d`)
- Clicking any category row in Manage Categories: closes modal, sets `sessionStorage('vault_search_cats', JSON.stringify([cat]))`, navigates to `transactions`
- Added `import { navigate } from '../router.js'` to category-manager.js
- **File:** `Personal_vault/src/js/modals/category-manager.js` v3.6.1

**9. Cancel button + safe area in Manage Categories** (`77cb93d`)
- Action bar is now always visible (`display:flex; position:fixed; bottom:0`) with `env(safe-area-inset-bottom, 0px)` padding
- Shows **Cancel** when no items selected; switches to **Delete / Merge** when items are checked
- List container has `padding-bottom:100px` so last item is always reachable
- **File:** `Personal_vault/src/js/modals/category-manager.js` v3.6.1

---

#### PWA Updates

- All changes applied to corresponding PWA source files:
  - `Travel-Vault_PWA/app-b-private-vault/js/screens/add-transaction.js` v3.5.26
  - `Travel-Vault_PWA/app-b-private-vault/js/modals/category-manager.js` v3.5.11
- PWA rebuilt: `PrivateVault_Standalone.html` (298 KB)

**Files Changed (10):**

| File | Change |
|------|--------|
| `Travel_app/package.json` | `@capacitor-community/contacts@^7.2.0` (was wrong package) |
| `Travel_app/src/js/screens/add-trip.js` | Share card: Departure/Arrival/Flight (was Arrived/Duration/wrong field) |
| `Travel_app/src/css/app.css` | `.modal-sheet` safe-area bottom padding |
| `Travel_app/android/app/src/main/AndroidManifest.xml` | Added ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION |
| `Travel_app/src/js/screens/family-defaults.js` | Contact picker 3-tier; safe-area on inline sheets |
| `Travel_app/src/js/screens/person-profile.js` | `createEmptyMember(familyDefaults)` auto-populates home addresses |
| `Personal_vault/src/css/app.css` | `.modal-sheet` safe-area bottom padding |
| `Personal_vault/src/js/screens/add-transaction.js` | Category from history; sub-cat from cat2 history |
| `Personal_vault/src/js/modals/category-manager.js` | Click-to-filter; always-visible bar; Cancel button |
| `Travel-Vault_PWA/dist/PrivateVault_Standalone.html` | Rebuilt with all vault changes |

**Git Commits:** `3dd91f2`, `e88c096`, `bd14278`, `337d046`, `841e00a`, `77cb93d`

---

### Session 14: Clone Mode, Export Category Chips, PWA Sync (2026-05-13)
**Context:** Completing pending items from Session 13 carried over to this session: add-transaction clone mode in PWA and export category multi-select chips in PWA settings. Rebuild + commit.

---

#### Issues Resolved — PWA Private Vault

**1. Clone transaction mode in PWA add-transaction.js**
- `isClone = mode === 'clone' && txnId` — loads existing data, generates new UUID on save, sets date to today, clears photos
- Save button shows `📋 Clone Transaction` label in clone mode
- **File:** `Travel-Vault_PWA/app-b-private-vault/js/screens/add-transaction.js` v3.5.27

**2. Export category multi-select chips in PWA settings.js**
- Settings export tab: two category filter rows (Category 1, Category 2) now rendered as scrollable chip buttons (multi-select), matching APK behaviour
- Chips use named functions (`toggleCat1`, `toggleCat2`) for strict-mode compliance (no `arguments.callee`)
- **File:** `Travel-Vault_PWA/app-b-private-vault/js/screens/settings.js` v4.0.x

**PWA rebuilt:** `dist/PrivateVault_Standalone.html` and `dist/FamilyHub_Standalone.html`

**Git Commit:** `e6a9e75`

---

### Session 15: Cancel Button, Bank/Card Name, Word Export, Modal Picker, Person Chips, Country Filter (2026-05-14 → 2026-05-15)
**Context:** Large batch of new features and fixes across both APKs and both PWA apps.

---

#### Issues Resolved — Both APKs

**1. Cancel (✕) button in New/Clone entry screens**
- Added `✕ Cancel` button below Save button in `add-transaction.js` (Vault) and `add-trip.js` (Travel)
- Navigates back to transactions/travel-log without saving
- **Files:** `Personal_vault/src/js/screens/add-transaction.js` v3.5.28, `Travel_app/src/js/screens/add-trip.js`

**2. Bank/Card Name optional field in Vault add-transaction**
- `SmartInput` field below Account/Method pills with auto-suggest from history
- Saved as `bankName` field in transaction data; shown in transaction-view with 🏛️ icon
- Included in CSV, XLSX, and Word export columns
- **Files:** `Personal_vault/src/js/screens/add-transaction.js` v3.5.28, `transaction-view.js`, `transactions.js` v3.5.8, `settings.js` v4.15.0

**3. Export from transactions record view (Vault) — blank bug + Word format + Share**
- **Blank export bug fix:** `if (t.currency !== activeCurrency)` when `activeCurrency === 'All'` filtered out all records. Fixed to `if (activeCurrency !== 'All' && t.currency !== activeCurrency)`
- **Word (.doc) export:** HTML-based file with `application/msword` MIME; each transaction as vertical card
- **3 export buttons:** Download / Share File / Share Text (was 2 buttons)
- **Share File:** Capacitor `Filesystem` + `Share` plugin (writes to CACHE, gets URI, shares, deletes)
- **Share Text:** Capacitor `Share` → clipboard fallback
- **File:** `Personal_vault/src/js/screens/transactions.js` v3.5.8

**4. Settings export tab — modal picker system (Vault)**
- Replaced congested inline chips/dropdowns with tappable modal picker rows (bottom sheet, max-height:50vh)
- Year, Month, Category 1, Category 2 → multi-select arrays; Currency → single string
- `openPickerModal()` pattern; `refreshFilterRows()` updates display after selection
- `exportToXlsx`: filename built from `frow-*` text content (not removed DOM selects); Bank/Card column added; column widths extended to 11 entries
- **File:** `Personal_vault/src/js/screens/settings.js` v4.15.0

**5. Travel Dashboard — person chip navigation (Travel APK)**
- Location widget person chips changed from `<div>` to `<button class="loc-person-btn" data-person="...">`
- Click → `navigate('travel-log', { person: btn.dataset.person })`
- **File:** `Travel_app/src/js/screens/dashboard.js` v3.5.10

**6. Travel Log — params.person pre-filter (Travel APK)**
- `filterPassenger` pre-set from `params.person` when navigating from dashboard chip
- **File:** `Travel_app/src/js/screens/travel-log.js` v3.7.4

**7. Travel Export — Destination Country filter pills (Travel APK)**
- `allCountries` built from trip `destinationCountry` data
- Country pills section: 🌍 All / flag + country name per unique destination
- `selCountry` state variable; `getFilteredTrips()` filters by it
- Year detection extended to all date fields; date filter uses `dateLeftOrigin` fallback
- **File:** `Travel_app/src/js/screens/travel-export.js` v3.5.45

---

#### Issues Resolved — Both PWA Apps

**8. All Batch 2 changes ported to PWA Private Vault**
- `add-transaction.js` v3.5.28: Cancel button + Bank/Card name SmartInput
- `transaction-view.js`: bankName row with 🏛️ icon
- `transactions.js` v3.5.8: Word export, 3 buttons, Share Text (uses `navigator.share` + `navigator.canShare`; no Capacitor in PWA); blank-export fix was already present
- `settings.js` v4.1.0: Modal picker rewrite; Bank/Card column in XLSX; filename builder uses `frow-*` text content
- **Files:** `Travel-Vault_PWA/app-b-private-vault/js/screens/` (4 files)

**9. PWA FamilyHub — person chip navigation (dashboard.js v3.5.6)**
- Location widget chips → `<button class="loc-person-btn" data-person="...">` with click → `navigate('travel-log', { person })`
- **File:** `Travel-Vault_PWA/app-a-family-hub/js/screens/dashboard.js` v3.5.6

**10. PWA FamilyHub — params.person pre-filter (travel-log.js v3.7.1)**
- `filterPassenger` pre-set from `params.person` when navigating from dashboard chip
- **File:** `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-log.js` v3.7.1

**11. PWA FamilyHub — Destination Country filter (travel-export.js v4.0.2)**
- `allCountries` from trip data; country pills section; `selCountry` state
- `getFilteredTrips()`: country filter + date filter uses `dateLeftOrigin` fallback; sort uses `dateLeftOrigin`
- **File:** `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-export.js` v4.0.2

**PWA rebuilt:** `dist/FamilyHub_Standalone.html` (528 KB) + `dist/PrivateVault_Standalone.html` (310 KB)

**Files Changed (APK, commit `77d5a20`):**

| File | Change |
|------|--------|
| `Personal_vault/src/js/screens/add-transaction.js` v3.5.28 | Cancel button + Bank/Card Name SmartInput |
| `Personal_vault/src/js/screens/transaction-view.js` | bankName row |
| `Personal_vault/src/js/screens/transactions.js` v3.5.8 | Word export, 3 buttons, Share File/Text, blank-export fix |
| `Personal_vault/src/js/screens/settings.js` v4.15.0 | Modal picker system, Bank/Card col, filename fix |
| `Travel_app/src/js/screens/dashboard.js` v3.5.10 | Person chip → navigate('travel-log') |
| `Travel_app/src/js/screens/travel-log.js` v3.7.4 | params.person pre-filter |
| `Travel_app/src/js/screens/travel-export.js` v3.5.45 | Country filter pills, date fix |

**Files Changed (PWA, commit `0667186`):**

| File | Change |
|------|--------|
| `Travel-Vault_PWA/app-b-private-vault/js/screens/add-transaction.js` | Cancel button + Bank/Card Name |
| `Travel-Vault_PWA/app-b-private-vault/js/screens/transaction-view.js` | bankName row |
| `Travel-Vault_PWA/app-b-private-vault/js/screens/transactions.js` | Word export, 3 buttons, Share |
| `Travel-Vault_PWA/app-b-private-vault/js/screens/settings.js` | Modal picker, Bank/Card col |
| `Travel-Vault_PWA/app-a-family-hub/js/screens/dashboard.js` v3.5.6 | Person chip → navigate |
| `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-log.js` v3.7.1 | params.person pre-filter |
| `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-export.js` v4.0.2 | Country filter pills |
| `Travel-Vault_PWA/dist/FamilyHub_Standalone.html` | Rebuilt (528 KB) |
| `Travel-Vault_PWA/dist/PrivateVault_Standalone.html` | Rebuilt (310 KB) |

**Git Commits:** `77d5a20` (APK + PWA Vault), `0667186` (PWA FamilyHub + dist)

---

### Session 16: Export Bug Fixes — PDF Days, WhatsApp Info, Word Android, Account Dedup (2026-05-16)
**Context:** Four bugs reported from testing Session 15 deliverables.

---

#### Issues Resolved

**1. [Vault APK + PWA] Account items duplicated in filter bar**
- `allAccounts` was `['Cash','Card','Bank','Other', ...savedAccounts]` — if savedAccounts already contained 'Cash' etc., they appeared twice.
- Fix: `[...new Set(['Cash','Card','Bank','Other', ...savedAccounts])]`
- **Files:** `Personal_vault/src/js/screens/transactions.js` v3.5.10, `Travel-Vault_PWA/app-b-private-vault/js/screens/transactions.js` v3.5.10

**2. [Travel APK + PWA] PDF export — one year shows more than 365 days**
- Root cause: `getStayDays(t)` for trips with no `dateOutQatar` fell back to `daysBetween(arrDate, today())` — computing from original arrival all the way to today regardless of subsequent trips (e.g. arrived Jan 2024 → 500+ days counted in 2024).
- Fix: Added `computeStayContext(pTrips)` — returns `{ stayMap, endDateMap }`. End-of-stay = next trip's `dateArrivedDest` (bridging logic), or `today()` if last/only trip. Yearly totals now group by `dateLeftOrigin` not `dateOutIndia`.
- PDF table: updated field references to `dateLeftOrigin`, `dateArrivedDest`, `destinationCountry`. Column headers: "Departed India"→"Departed", "Left"→"Returned". "Returned" shows next trip's arrival date or "Ongoing".
- **Files:** `Travel_app/src/js/screens/travel-export.js` v3.5.47, `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-export.js` v4.0.4

**3. [Travel APK + PWA] WhatsApp export shows incorrect info**
- Root cause: `exportWhatsApp()` used legacy field names (`dateOutIndia`, `dateInIndia`, `destination`) instead of one-way model fields.
- Fix: updated all field refs to `dateLeftOrigin`, `dateArrivedDest`, `destinationCountry`, `originCountry`. Dedup key updated. Yearly totals use `dateLeftOrigin` year. Line format now: `India → Qatar: Left DD-Mon-YYYY, Arrived DD-Mon-YYYY` + `↩️ Return: DD-Mon-YYYY  🕐 N days`.
- Also uses `computeStayContext(pTrips)` for correct stay-days per trip.

**4. [Travel APK] Word export not opening on Android**
- Root cause: `saveFileToExports()` saves to app's internal Documents folder — Android system has no URI to open it directly with Word/WPS.
- Fix: On Android (Capacitor available), always write to `CACHE` directory then call `Share.share({ files: [uri] })` which presents the system share/open-with sheet. User taps WPS/Word to open. `saveFileToExports` fallback retained for web/PWA.
- Word export also now uses `computeStayContext(pTrips)` so days column is correct.

---

#### Files Changed

| File | Version | Change |
|------|---------|--------|
| `Personal_vault/src/js/screens/transactions.js` | v3.5.10 | Account dedup with Set |
| `Travel_app/src/js/screens/travel-export.js` | v3.5.47 | computeStayContext; PDF/WhatsApp/Word field fixes; Word Android share intent |
| `Travel-Vault_PWA/app-b-private-vault/js/screens/transactions.js` | v3.5.10 | Account dedup with Set |
| `Travel-Vault_PWA/app-a-family-hub/js/screens/travel-export.js` | v4.0.4 | computeStayContext; PDF/WhatsApp field fixes; Word days fix |
| `Travel-Vault_PWA/dist/FamilyHub_Standalone.html` | — | Rebuilt |
| `Travel-Vault_PWA/dist/PrivateVault_Standalone.html` | — | Rebuilt |

**Git Commit:** `b4441e3` (APK + PWA, all 4 fixes)
