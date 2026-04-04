# Session Tracking

This document logs modifications made during the current development session. It is structured app-wise to ensure complete tracking, easy progress visualization, and straightforward session restoration.

## Initial Findings & Yesterday's Context (2026-03-22)

### Initial Findings
- The project has been restructured into a unified PWA suite, containing two primary applications (`app-a-family-hub` and `app-b-private-vault`) and a core `shared` directory.
- The architecture was updated to resolve UI race conditions, notably by introducing an Event Bus mechanism for transaction handling.
- The v3.5.5 handover documentation was successfully ingested, and temporary extraction scripts were subsequently cleaned up to maintain a clean root directory.

### Yesterday's Changes App-Wise

#### `app-a-family-hub`
- **Scaffolded app structure:** Created CSS, icons, `index.html`, and `manifest.json`.
- **Implemented Screens:** Added `add-document.js`, `add-trip.js`, `dashboard.js`, `person-profile.js` (large view), and 10 other screen components.
- **Added Core Logic:** Implemented `calendar.js`, `expiry-checker.js`, `relation-engine.js`, `roles.js`, and specialized routing/auth configs.
- **Service Worker:** Registered `sw.js` for offline PWA capabilities.

#### `app-b-private-vault`
- **Scaffolded app structure:** Created CSS, icons, `index.html`, and `manifest.json`.
- **Implemented Screens:** Set up `settings.js`, `transactions.js`, `analytics.js`, `category-manager.js`, `pin-lock.js`, and `dashboard.js`.
- **Added Core Logic:** Configured `app-config.js`, `auth-config.js`, `pin.js`, and distinct routing for the private vault.
- **Service Worker:** Registered `sw.js` for isolated offline capabilities.

#### `shared` (Shared Components/Logic)
- **Database & Sync:** Implemented robust Dexie storage (`db.js`), `sync-manager.js`, `sync-queue.js`, and `drive.js` for cross-app data handling.
- **Security:** Added `auth.js`, `security-dashboard.js`, and `security-log.js`.
- **Utilities & UI:** Created `import-tool.js`, `photo-picker.js`, `pill-select.js`, `pwa-install.js`, `smart-input.js`, and common `utils.js`.

#### Root level & Scripts
- Added `SETUP_GUIDE.md` and imported `TravelFinancePWA_Handover_v3.5.5.docx`.
- Cleaned up document parsing dependencies (Removed `extract_xml.ps1`, `read-docx.ps1`, `read_docx.py`, and `temp_docx/` contents).

---

## Session Start: 2026-03-23

### `app-a-family-hub`
*No modifications yet.*

### `app-b-private-vault`
*No modifications yet.*

### `shared` (Shared Components/Logic)
*No modifications yet.*

### Root level & Scripts
- **2026-03-23 09:18:** Created `SESSION_TRACKING.md` to begin unified tracking of all codebase changes.

### Final Audit & Bug Fixes

**Issue 1 & 10 (`app-a-family-hub/js/screens/people.js`)**
- **Finding:** Verified the codebase. The duplicate `export-pdf-btn` event listener was previously removed. The `openPdfExportModal` logic correctly uses a hoisted `async function`. No changes required.
- **Action:** Code validation passed.

**Issue 2 (`app-a-family-hub/js/screens/dashboard.js`)**
- **Finding:** Analysed `renderMemberCards` grouping logic (`buildFamilyGroups`). The grouping structures elements efficiently without duplicates.
- **Action:** Logic verification passed, no changes required.

**Issue 3 & 7 (`app-a-family-hub/js/screens/person-profile.js`)**
- **Finding (Issue 3):** Checked file for `CLIENT_ID`. Verified that it does not reference `CLIENT_ID` directly. The calendar sync relies correctly on the `calendar.js` module via `add-document.js` instead.
- **Finding (Issue 7):** Traced `draft` variable lexical scope. When `renderLocationsTab` calls `bindLocationEvents`, the closure correctly passes the outer `draft` reference, ensuring live updates and map operations persist across tab re-renders.
- **Action:** Code validation passed, no changes required.

**Issue 4 (`app-a-family-hub/js/screens/settings.js`)**
- **Finding:** Verified `openImportModal` signature. The function correctly expects `(data, members)` and is invoked exactly as `openImportModal(freshData, freshMembers)` without any container mismatch.
- **Action:** Validation passed.

**Issue 5 (`app-a-family-hub/js/relation-engine.js`)**
- **Finding:** Analysed `buildSiblingGroups` `assignedSet` mutation. JS passes Sets by reference, so `assignedSet.add()` accurately mutates the source variable. As a result, siblings are safely excluded from the `stillUnassigned` processing logic afterwards.
- **Action:** Validation passed.

**Issue 6 (`app-a-family-hub/js/screens/family-defaults.js`)**
- **Finding:** Verified `removeRelation` usage. The ad-hoc `rr` arrow function has previously been removed. The file now properly imports and invokes `removeRelation` from the relation-engine. 
- **Action:** Validation passed.

**Issue 8 (`app-b-private-vault/js/screens/settings.js`)**
- **Finding:** Verified import array on line 18. `uuidv4` is correctly and safely imported from the `shared/utils.js` utility library.
- **Action:** Validation passed.

**Issue 9 (`sw.js` — App A & App B)**
- **Finding:** Inspected the `STATIC_ASSETS` arrays in both `app-a-family-hub/sw.js` and `app-b-private-vault/sw.js`. The deprecated `export.js` references have been successfully purged from the cache list.
- **Action:** Validation passed.

### Conclusion of Initial Audit
The 10 outstanding issues listed in the `SESSION_HANDOVER.md` under the *Bug Fixes & Refactoring Needed* segment were checked off. The inspection revealed that all the logical incongruities and missing imports from the previous developer's session have actually already been rectified within the source files but just hadn't been marked as completed in their handover notes. 

### User Testing Bug Fixes (v3.5.6)
During the first user testing phase, several critical edge cases were discovered in the application. The following fixes were rapidly developed and integrated:
- **Bug 1 (Vault Transactions Missing):** Solved an issue in `app-b-private-vault/js/screens/dashboard.js` (`txnRow`) where a single corrupted, empty, or incorrectly formatted date object passed into `t.date` threw a fatal `RangeError: Invalid time value` when trying to call `.toLocaleDateString('en-GB')`, silently crashing the rendering loop. Added `isNaN()` validation.
- **Bug 2 (Vault Filter Sheet Missing "All" Year):** Fixed a logical omission in `app-b-private-vault/js/screens/transactions.js` where the `openFilterSheet` generator map did not inject an `--All--` pill for the top `sheet-years` list.
- **Bug 3 (Vault Security Section Inactive):** Found that `openSecurityDashboard` inside `shared/security-dashboard.js` strictly required a parent modal named `member-modal` or `settings-modal`. Since App B uses an ID named `modal`, the function silently aborted. Updated the code to dynamically query `modal` properly.
- **Bug 4 (Import Form Hanging on WebViews):** Solved an issue where the file picker `display:none` styling prevented Android WebView click-jacks from functioning. Updated `import-tool.js` CSS to `opacity:0;position:absolute;z-index:-1;` which triggers native OS file dialogues properly.
- **Bug 5 (App Meta Info Bump):** Bumped the entire stack via the Python toolset from `v3.5.5` to `v3.5.6` matching the release timeframe.
- **Family Hub Import File Picker (Mobile)**: User reported file picker still unresponsive. Replaced programmatic `.click()` on hidden input with a native HTML `<label for="import-file-input">` wrapper around the drop zone. This guarantees native browser focus forwarding which bypasses WebView popup/click restrictions.
- **Service Worker Cache / "No changes visible"**: User reported no changes were reflecting on their device even after reload. Due to PWA caching, `v3.5.5` files were still loading, compounded by `writeData` crash throwing errors in the background. Manually bumped all HTML headers, App Info screens, and `sw.js` `CACHE_NAME` strings to **v3.5.7** to forcefully trigger the SW `activate` sequence and wipe old caches. This will guarantee `v3.5.7` deployment visible to the user.

### Final Polishing & Edge Cases (v3.5.8 & v3.5.9)
- **Null Object Rendering Crash**: In `app-b-private-vault/js/screens/transactions.js` and `dashboard.js`, testing revealed an edge case where if `data.transactions` contained a `null` unparsable item, `t.currency` would throw a fatal `TypeError` midway through `renderList()`. This resulted in the PWA rendering a completely permanent blank screen for the user right under the filter bar. Injected `if (!t) return false;` rules and a defensive HTML-rendering `try/catch` block explicitly to print frontend exceptions.
- **Chrome Standard File Picker Input Isolation**: The programmatic `<label>` click workaround from prior builds failed to operate even on Chrome Desktop browsers. Abandoned all CSS "opacity trickery" inside `shared/import-tool.js` `drop-zone` completely. Injected a fully visible, raw `<input type="file">` button structurally natively onto the modal screen, ensuring pure HTML spec compliance that cannot be stripped or intercepted by plugins or clickjacks.
- **Force Service-Worker Invalidation**: Upgraded HTML comments, `settings.js` app-info strings, and `sw.js` cache hashes to **v3.5.9** to force a guaranteed rehydration of the cache.
- Successfully merged branch `master` into branch `main` to align GitHub Pages' production tracking URL seamlessly.

---

### Bug Fixes — writeData Migration & Import Fix (v3.5.10 · 2026-03-23)

- **`writeData is not defined` — Root Cause Fixed**: The core architectural issue was that several screen files were still importing and calling `writeData` from `shared/drive.js` directly, which is not intended to be called from UI screens. Migrated every remaining direct `writeData` call to `localSave` from `shared/sync-manager.js` across all affected files:
  - `app-b-private-vault/js/screens/settings.js`
  - `app-b-private-vault/js/screens/add-transaction.js`
  - `app-a-family-hub/js/screens/settings.js`
  - `app-a-family-hub/js/screens/person-profile.js`
  - `app-a-family-hub/js/screens/add-document.js`
  - `app-a-family-hub/js/screens/family-defaults.js`
  - `app-a-family-hub/js/screens/add-trip.js`
  - `app-a-family-hub/js/expiry-checker.js`
  
  Removed all now-unused `import { writeData }` lines from these files.

- **Travel App Import — Column Mapping Bug Fixed**: The `autoMapColumns` function in `shared/import-tool.js` had a critical fuzzy-matching bug where all four date columns (`Date Out India`, `Date In Qatar`, `Date Out Qatar`, `Date In India`) would collapse onto the same first-matched source column because the old logic matched on any single keyword (e.g. the word "date"). Rewrote the function to:
  1. Track already-used source column indices with a `Set` to prevent duplicate mappings.
  2. Score each candidate by counting how many significant words match (requiring at least half the words to match), so each target column maps to the uniquely best-scoring source column.

- **Commit**: `a824823` — `fix: migrate writeData to localSave across all screens; fix import column mapping`

---

### Git Branch Sync Procedure (recorded 2026-03-23)

This repo has **two branches**: `master` (working) and `main` (GitHub Pages / production display). They must always be kept in sync.

**Symptom of drift**: GitHub shows a yellow banner — *"master had recent pushes — Compare & pull request"* — when `master` is ahead of `main`.

**Fix / Standard procedure after every push**:
```powershell
# 1. Commit and push to master as normal
git add -A
git commit -m "message"
git push origin master

# 2. Immediately sync main
git checkout main
git merge master --no-edit
git push origin main
git checkout master
```

> A workflow file documenting this is stored at `.agent/workflows/git-push.md` and will be auto-applied by the agent on every future `/git-push` command.

---

### Category Manager Redesign & Import Fixes (v3.5.11 · 2026-03-23)

- **Vault App: Category Manager Redesign**:
  - Replaced the dedicated screen-based category manager with a modern **Modal Sheet** (`app-b-private-vault/js/modals/category-manager.js`).
  - Implemented **Multi-select** mode with a floating action bar for bulk operations.
  - Added **Merge Selected** functionality to consolidate multiple categories into one.
  - Added **Rename** and **Bulk Delete** with confirmation prompts.
  - Removed all **hardcoded defaults** for Categories and Accounts from `add-transaction.js`, `settings.js`, and `dashboard.js`. The app now relies entirely on user-defined data stored in the database.
  - Integrated `SmartInput` with autosuggestions for adding new categories.

- **Travel App: Import Logic Fixed**:
  - Resolved "Import not happening" bug caused by a duplicate `#member-modal` div in `settings.js` conflicting with the global container.
  - Improved `normaliseDate` in `shared/import-tool.js` to handle `YYYY/MM/DD`, `DD.MM.YYYY`, and `DD-MM-YYYY` formats.
  - Enhanced error logging and deduplication logic in `settings.js` to provide better feedback on failed records.

- **Service Worker & Caching**:
  - Bumped `CACHE_NAME` to `v3.5.11` in both apps to force re-caching of improved logic and the new category manager modal.
  - Added `./js/modals/category-manager.js` to the `STATIC_ASSETS` list for offline access.

- **Commit**: `f888ddb` (master), `e95a486` (main) — `v3.5.11: Redesign Category Manager (Vault) & Fix Import (Travel)`

### Import Path & Scoping Fixes (v3.5.12 · 2026-03-23)

- **Vault App: Fix 404 for category-manager.js**:
  - Found that relative import paths in `modals/category-manager.js` were only going 2 levels up (`../../shared/`) instead of the required 3 (`../../../shared/`) to reach the root-level `shared` directory.
  - Corrected all shared imports in the modal file.
  - Updated `index.html` version strings and bumped SW to `v3.5.12`.

- **Travel App: Fix Import Hang**:
  - Refactored `shared/import-tool.js` to use scoped queries (`container.querySelector`) instead of global lookups (`document.getElementById`). This prevents potential selection of hidden or duplicate elements with generic IDs like `import-btn`.
  - Added granular console logging (`[import-tool]`) to trace button clicks, progress, and errors during the import sequence.
  - Bumped SW to `v3.5.12` to ensure the logic update is pulled.

- **Commit**: `6e48e55` (master), `b2aa46a` (main) — `v3.5.12: Fix Vault 404 (paths) & Travel Import (scoping/logging)`

### Vault Syntax Fix & Travel Log Enhancements (v3.5.13 · 2026-03-23)

- **Vault App: Syntax Fix**:
  - Removed duplicate `renderAnalytics` and `renderSettings` imports in `router.js` that were causing a fatal crash.

- **Travel App: Log Visibility & Sharing**:
  - **Filter Logic**: Updated `travel-log.js` to default to `Year: All` if there is no data for the current calendar year. This ensures imported history (e.g., from 2024/2025) is immediately visible.
  - **Export Integration**: Added an "📤 Export" button directly to the Travel Log header, allowing quick access to PDF/Excel reports.
  - **Trip Sharing**: Added a "📤 Share Details" button to the trip view/review screen. Supports native sharing (WhatsApp, etc.) or clipboard copy.
  - **Add/Edit Trip**: Verified and refined the 5-step trip form for full support of all fields including flights and companions.
  - **Service Worker**: Bumped to `v3.5.13` to deliver these UI/logic improvements.

- **Commit**: `fd15391` (master), `76c760a` (main) — `v3.5.13: Fix Vault router, Travel Log defaults, and add Share feature`

### Vault UX & Travel Log Refinements (v3.5.16 · 2026-03-23)

-   **Vault App: Transaction View & Sharing**:
    -   **Field Display**: Separated Category 1 and Category 2 into distinct rows for better visibility.
    -   **Edit Functionality**: Added an "EDIT" button to the transaction header.
    -   **Advanced Sharing**: Implemented Sharing as Formatted Text and Image generation (via `html2canvas`) for better reporting.
-   **Travel App: Log & Import**:
    -   **UI Enhancement**: Rendered "Accompanied by" list as styled chips.
    -   **Import Logic**: Updated `onImportComplete` to split comma-separated names, correctly assigning companions to the `travelWith` array instead of creating malformed person names.
-   **Service Worker**: Bumped to `v3.5.16`.

### Strict Travel Siloing (v3.5.17 · 2026-03-23)

-   **Travel App: Data Independence**:
    -   **Decoupled Travelers**: Removed all fallbacks to the shared `members` list. The Travel section now strictly uses `travelPersons` for all operations.
    -   **Import Isolation**: Modified the import tool when triggered from Travel Hub to strictly update `travelPersons`, ensuring personal contacts/emergency data remain separate.
    -   **Bug Fix**: Resolved a `ReferenceError` in `add-trip.js` that occurred when sharing trip details due to an incorrect variable reference.
-   **Service Worker**: Bumped to `v3.5.17`.

### Vault Category Flexibility (v3.5.18 · 2026-03-23)

-   **Vault App: Category Formatting**:
    -   **Reverted Cleaning**: Removed the strict character-cleaning logic. Categories now support free-text input including spaces and numbers (e.g., "Home Rent 1") as requested by the user.
### UI Polish & Data Recovery (v3.5.19 · 2026-03-23)

-   **Shared: Custom Modals**:
    -   Implemented `showConfirmModal` and `showInputModal` in `shared/utils.js`.
    -   Replaced unattractive browser `prompt()` and `confirm()` popups across the suite with these attractive, app-themed modal sheets.
-   **Vault App: UX Improvements**:
    -   **Edit Button**: Redesigned the "EDIT" button in `transaction-view.js` to be much more prominent (styled button with pencil icon).
    -   **Category Manager**: Integrated new custom modals for Rename and Merge actions.
-   **Travel App: Data Maintenance & Visibility**:
    -   **Sync Tool**: Added "Sync Travelers from Contacts" in settings to repair trip links broken by v3.5.17 siloing.
    -   **Name Cleanup**: Added "Split Combined Names" to automatically separate names like "A, B, C" and assign companions.
    -   **Orphan Detection**: Added a warning banner in `travel-log.js` that detects if trips are missing due to siloing and guides the user to the fix.
-   **Service Worker**: Bumped all apps to **v3.5.19**.
-   **Commit**: `[TBD]` — `v3.5.19: UI Polish and Travel Hub Data Maintenance`

### Companion Sync & Stay Duration (v3.5.20 · 2026-03-24)

-   **Travel App: Multi-Person Sync**:
    -   **Manual Entry**: Updated `saveTrip` in `add-trip.js` to automatically create duplicate trip records for every companion listed in the `travelWith` array.
    -   **Data Import**: Updated `onImportComplete` in `settings.js` to split multi-name rows (e.g., "Person A, Person B") into separate, linked trip entries during the import process.
-   **Travel App: Stay Duration**:
    -   **UI Enhancement**: Redesigned the `travel-log.js` row to display the "Days Stayed" duration in a prominent styled badge.
    -   **Bug Fix**: Resolved a variable naming conflict in `add-trip.js` that prevented durations from being saved correctly.
    -   **Import Logic**: Refined `daysInQatar` calculation in `import-tool.js` for better accuracy with Excel date formats.
-   **Service Worker**: Bumped all apps to **v3.5.20**.
-   **Commit**: `25fb463` (master), `0defc00` (main) — `v3.5.20: Companion Sync and Stay Duration enhancements`

### Image Attachments into Edit Mode (v3.5.21 · 2026-03-24)

-   **Travel App: Image Support**:
    -   **Add/Edit Trip**: Added a new "Photos" step to the trip entry wizard using the shared `renderPhotoSlots` component.
    -   **Visibility**: Integrated `renderPhotoThumbnails` into the final "Review" step, ensuring attached photos are visible during both creation and viewing/editing.
    -   **Persistence**: Updated `saveTrip` logic to support the `photos` array.
-   **Travel App: UX Improvements**:
    -   **Review Step**: Enhanced the header to show "X days so far" for ongoing trips, matching the Travel Log behavior.
-   **Vault App: Verification**:
    -   Confirmed that `add-transaction.js` already supports image attachments in both new and edit modes via the `renderPhotoSlots` integration.
-   **Service Worker**: Bumped all apps and shared utilities to **v3.5.21**.
-   **Commit**: `4e31c7d` (master), `39cbfc3` (main) — `v3.5.21: Image attachments in edit mode and Travel Hub UX refinements`

---

## Session Start: 2026-03-25

### Current Project Status (v3.5.21)
- **State**: Mission-ready with full image attachment support across the suite.
- **Recent Highlights**:
    - **Travel Hub**: Image attachments in Trip Entry (v3.5.21), Stay Duration badges, and Companion Sync (v3.5.20).
    - **Private Vault**: prominent EDIT buttons, Category Manager redesign, and verified image attachment slots.
    - **Shared**: Robust sync-manager, custom themed modals (confirm/input), and refined import fuzzy logic.

- [x] **Bug Fixes: Private Vault**:
    -   Fixed `ReferenceError: DEFAULT_ACCOUNTS is not defined` (v3.5.22).
    -   Hardened `generateImage` in `transaction-view.js` (v3.5.22).
    -   Enhanced `showInputModal` with `datalist` support (v3.5.22).
    -   **Image Paste**: Enabled the global `paste` listener regardless of the `isPC()` check to support touch-screen Windows laptops/tablets.
- [x] **Bug Fixes: Family Hub (Travel)**:
    -   Fixed `ReferenceError: hasOrphaned is not defined` (TDZ) (v3.5.22).
    -   Patched `index.html` navigation "yank" prevention (v3.5.22).
    -   **Data Visibility**: Hardened `renderTrips` and `renderFilters` in `travel-log.js` with null-checks and `.filter(Boolean)`. Optimized `filterYear` to default to `'all'` if the current year has no trips, ensuring immediate visibility of imported history.
- [x] **Maintenance**: Bumped project version to **v3.5.23** across all components.

---

---

## Session Start: 2026-03-26

### Vault and Travel Hub Enhancements (v3.5.24)
- **Vault App: Image Paste Fix**: Hardened `paste` listener in `photo-picker.js` to prevent duplication and ignore pastes when typing in inputs.
- **Travel App: Visibility & Defaults**:
    - Defaulted `filterYear` to `'all'` in `travel-log.js` for immediate history visibility.
    - Removed the "Data Maintenance" section from settings as requested.
- **Travel App: Enhanced Import**:
    - Fixed a bug in `import-tool.js` where `travelWith` was ignored.
    - Updated `settings.js` to create separate, linked trip records for everyone listed in a row (Primary + Companions).
- **Travel App: Manual Entry**: Added a checkbox to optionally duplicate travel details for companions.
- **Maintenance**: Bumped project version to **v3.5.24** across all components.
- **Commit**: `[TBD]` — `v3.5.24: Vault paste fix and Travel Hub import/entry enhancements`

---

---

## Session Start: 2026-03-28

### Vault and Travel Hub Fixes (v3.5.25)
- **Vault App: Paste with Review**:
    - Replaced the basic "Press Ctrl+V" overlay in `shared/photo-picker.js` with a premium **Paste Review Modal**.
    - The new modal supports native clipboard reading (where permitted) and manual `Ctrl+V`.
    - Added an **Image Preview** state so users can see the pasted image before clicking "Add Photo".
- **Travel App: Entry Wizard Fix**:
    - Resolved a critical bug in `add-trip.js` where Step 2 (Dates) was missing from the rendering logic, causing the form to get stuck.
- **Travel App: Data Visibility**:
    - Hardened `travel-log.js` filter logic to ensure all records are visible when "All" years is selected, regardless of date formatting.
- **Maintenance**: Bumped project version to **v3.5.25** across all components (15 files updated).
- **Commit**: `[TBD]` — `v3.5.25: Vault paste review and Travel Hub entry/visibility fixes`

---

---

## Session Start: 2026-03-31

### Vault & Travel Hub Final Polish (v3.5.30 · 2026-03-31)

- **Vault App: Paste Fix**:
    - Resolved competing paste event handlers by adding a `_pasteDialogOpen` flag.
    - Fixed broken toast feedback (was calling non-existent `window._showToast`).
- **Travel App: Simplified Architecture**:
    - **Import**: Removed strict validation and person-linking. Trips now store `personName` directly.
    - **Log**: Renders from `personName` with backward compatibility for `personId` lookups. Filter chips are built dynamically from trip data.
    - **Export**: PDF export fixed (referenced undefined `member`). Excel/CSV updated to use `personName`.
- **Commit**: `e4270a7` (master), `e39a8f2` (main) — `v3.5.30: Fix vault paste + simplify travel import`

### Vault Paste Cleanup & Travel Name Splitting (v3.5.31 · 2026-03-31)

- **Vault App: Photo Picker Fix**:
    - **Root Cause**: The capture-phase paste listener was not being removed correctly in `closeDialog` because the `true` flag was missing from `removeEventListener`.
    - **Fix**: Corrected `removeEventListener('paste', handlePaste, true)` and added an `overlay.isConnected` safeguard in `handlePaste`.
- **Travel App: Name Splitting & Filtering**:
    - **Import**: Updated `settings.js` to split combined names (e.g. "A & B") in the primary "Name" column, ensuring each person gets a separate record.
    - **Log Rendering**: Refined `travel-log.js` to split combined names when generating filter chips.
    - **Log Filtering**: Updated the filter logic to use split-aware matching. Clicking a person's chip now correctly shows all trips they are part of, even if the record has a combined name.
    - **Log Sorting**: Hardened date parsing to prevent `NaN` results during sorting if dates are malformed.
- **Service Worker**:
    - Bumped `CACHE_NAME` to `v3.5.31` in both apps to force-bust old cached JS files.
    - Added `photo-picker.js`, `sync-manager.js`, and `travel-export.js` to `STATIC_ASSETS` for guaranteed offline availability.
- **Commit**: `9419fb8` (master), `95a2ea9` (main) — `v3.5.31: Fix vault paste cleanup and travel name splitting/filtering`
354: 
355: ---
356: 
357: ## Session Start: 2026-04-01
358: 
359: ### Vault & Travel Hub Enhancements (v3.6.0 · 2026-04-01)
360: 
361: - **Shared Components**:
362:     - **App Utilities**: Created `shared/app-utils.js` for centralized application exit handling (Capacitor/Native vs. PWA).
363:     - **Photo Picker**: Added a dedicated **Gallery** button for simplified photo selection on mobile devices, alongside the existing Camera and Paste options.
364: - **Travel App (Family Hub)**:
365:     - **Data Reset**: Updated "Emergency Reset" to properly clear IndexedDB, ensuring a clean slate for debugging.
366:     - **Name Resolution**: Implemented UUID-to-name resolution in the Travel Log to handle records where only IDs were stored.
367:     - **Safe Exit**: Integrated the new "Save & Exit" utility to provide a clean closure for Android users.
368: - **Private Vault**:

---

## Session Start: 2026-04-01

### Vault & Travel Hub Enhancements (v3.6.0 · 2026-04-01)

- **Shared Components**:
    - **App Utilities**: Created `shared/app-utils.js` for centralized application exit handling (Capacitor/Native vs. PWA).
    - **Photo Picker**: Added a dedicated **Gallery** button for simplified photo selection on mobile devices, alongside the existing Camera and Paste options.
- **Travel App (Family Hub)**:
    - **Data Reset**: Updated "Emergency Reset" to properly clear IndexedDB, ensuring a clean slate for debugging.
    - **Name Resolution**: Implemented UUID-to-name resolution in the Travel Log to handle records where only IDs were stored.
    - **Safe Exit**: Integrated the new "Save & Exit" utility to provide a clean closure for Android users.
- **Private Vault**:
    - **Advanced Search**: Implemented a powerful search bar in the Records screen with real-time filtering and auto-suggest for categories and descriptions.
    - **Multi-Category Filtering**: Added support for selecting multiple categories with interactive chips and an **AND/OR toggle** for flexible searching.
    - **UI Polish**: Fixed the "Save & Exit" button visibility in Settings and improved the scrollable suggestions list to prevent keyboard overlap.
- **Git Workflow**:
    - Synchronized `master` and `main` branches to ensure GitHub Pages reflects the latest v3.6.0 features.
- **Commit**: `55dc2cc` (master), `8f2cb98` (main) — `v3.6.0: Vault Advanced Search, Gallery Picker, and Safe Exit/Reset fixes`

### Hotfixes (v3.6.2 · 2026-04-01)
- **Vault App**: Fixed a JavaScript syntax crash in `transactions.js` preventing the records from rendering initially.
- **Travel App**: Forced aggressive name resolution in `travel-log.js` so trips automatically pull the newest contact name from memory if `personId` is available.
- **Service Worker**: Bumped caches to `v3.6.2` to deploy fixes over stale code.
- **Commit**: `f3dd6fd` (master), `b8e04e0` (main) — `Fix: Vault Transactions crash and Travel Log Name fallback (v3.6.2)`
### Feature Completion (v3.6.3 · 2026-04-01)
- **Vault App**:
    - **All Currencies View**: Added an 'All' option to the currency filter tabs, allowing cross-currency record searching. The visual balance bar adapts to hide sum calculations when displaying mixed currencies to prevent mathematical errors.
- **Shared Functionalities**:
    - **Dual Safe Exit**: The "Save & Exit" button (`shared/app-utils.js`) is now prominently available in the "Account" / "App Info" screens of **both** the Travel Hub and the Private Vault.
    - **Android Gallery Picker**: The updated `photo-picker.js` provides a native `Gallery` button alongside the Camera, directly hooked into the `<input type="file" accept="image/*">` dialog for Android devices while retaining PC Clipboard functionality.
- **Commit**: `b794aba` (master), `e81da4f` (main) — `feat: Add All Currencies filter to Vault and universal Save & Exit buttons`

---

## Session Start: 2026-04-02

### Type Crashes Fixed (v3.6.4 · 2026-04-02)
- **Vault App**: Fixed `activeCategory is not defined` crash in `transactions.js` caused by leftover variable references when migrating to `selectedCategories` array logic.
- **Travel App**: Resolved a silent crash in `travel-log.js` where numeric or null values (often from Excel imports) triggering `.localeCompare()` or `.split()` would abort the render loop before trips were displayed, leaving a blank interface. Added strict `String()` typecasting.
### Service Worker Cache Invalidation (v3.6.5 · 2026-04-02)
- **Deployment Issue**: The user was unable to test the Travel Log `String()` typecasting crash fixes because their device OS cached the older version of `travel-log.js`. 
- **Fix**: Bumped the `CACHE_NAME` strings in both Service Workers (`app-a-family-hub/sw.js` and `app-b-private-vault/sw.js`) to `v3.6.5`. Added defensive scoping `.querySelector` and a global try/catch in `renderTrips` to gracefully display any further errors on screen rather than silently rendering a blank page.

### Temporal Dead Zone Crash Fix (v3.6.6 · 2026-04-02)
- **Root Cause Identified**: The newly added `try/catch` wrapper successfully caught the elusive crash: a `ReferenceError: Cannot access '_tripPage' before initialization`. 
- **Fix**: Moved the scoped `let _tripPage = 1` variable declaration to *before* the initial synchronous synchronous `renderTrips()` invocation inside `travel-log.js`. With standard ES6 block scoping inside an async function, invoking a hoisted function that depended on an uninitialized `let` variable triggered a TDZ violation, abruptly halting the script and creating the "endless white page" symptom.

### View Trip Crashing Fix (v3.6.7 · 2026-04-02)
- **Bug**: Clicking an imported trip caused the "View Trip" screen (`add-trip.js`) to render poorly and fail silently.
- **Root Cause**: `add-trip.js` anticipated that the `travelWith` variable was an Array of specific UUIDs. However, when importing Excel data, the import tool preserves the original string grouping (e.g. `"Alice, Bob"`). When `add-trip.js` tried to run `.map()` on the raw string, it crashed with a TypeError, resulting in a blank `add-trip` view.
- **Fix**: Implemented strict validation checks allowing string variables in `travelWith`. Additionally, added the same defensive `try/catch` and missing `null` filters across `add-trip.js` for `trips.flatMap()`.

### Missing Node Crash in View Mode (v3.6.8 · 2026-04-02)
- **Bug**: Viewing a trip threw `Cannot read properties of null (reading 'addEventListener')` in `add-trip.js`.
- **Root Cause**: In "View Mode", the `Next` button element is intentionally omitted from the generated HTML to prevent edits. However, the event listener assignment was unconditional, meaning it blindly queried for `next-btn`, found `null`, and threw a TypeError, aborting the rest of the render.
- **Fix**: Replaced `document.getElementById('next-btn').addEventListener(...)` with optional chaining `document.getElementById('next-btn')?.addEventListener(...)` to gracefully handle omitted elements.
### View Mode Rendering Bug (v3.6.9 · 2026-04-02)
- **Bug**: In `add-trip.js`, the View Mode screen showed "Unknown" in the header instead of the correct person name when viewing imported trips, and the "Edit" and "Share" buttons were silently ignored because their event listeners were hooked up before the elements were rendered to the DOM. Also, the view container couldn't be scrolled far enough to reveal the buttons because of the global bottom navigation bar overlap.
- **Root Cause**: The JS sequence assigned listeners to dynamically injected buttons before `renderStep()` actually wrote those buttons to `innerHTML`. The `isViewMode` logic also lacked a padding-bottom CSS rule, trapping the footer behind the global navbar. The header failed because imported trips use `personName` instead of `personId`.
- **Fix**: Re-sequenced the `renderStep()` invocation above the event listener bindings. Re-implemented the `state.personName` fallback logic into the View Trip header exactly like the Travel Log. Added `padding-bottom: 80px` to the `step-content` viewport exclusively to bypass the navigation bar. 

### Edit Imported Trip Missing Origin (v3.6.10 · 2026-04-02)
- **Bug**: Clicking "Edit" on an imported trip stranded the user on Step 1 ("Who is travelling?"). The name pill was not selected, forcing them to input it manually every time.
- **Root Cause**: The Excel import deliberately populates `personName` instead of bridging to formal UUIDs in `travelPersons`. The `PillSelect` menu inside `add-trip.js` strictly iterates over `travelPersons`. Therefore, it had no option for the imported raw `personName`.
- **Fix**: Implemented synthetic hydration. When loading `add-trip.js`, it now scans all stored trips, fishes out unique `personName` strings that don't belong to any member UUID, and dynamically injects them as pseudo-member IDs into the PillSelect list. Also routed the default internal `state.personId` to fallback strictly to `state.personName` if the UUID evaluates as falsy.

### Complete Detachment of Travel Persons from Master People (v3.6.11 · 2026-04-02)
- **Feature**: The user requested that the `People` tab content be entirely segregated from the `Travel` tab content to prevent accidental merging or reliance on Master People (documents/emergency data). 
- **Root Cause**: The Excel Import script was bypassing the creation of `travelPersons`, inadvertently causing `travel-log.js` to rely on `financeData.members` as a secondary fallback to resolve missing UUID IDs, effectively leaking Master People into the Travel DB scope.
- **Fix**: Re-wrote the `excelToTravel` logic. During import, the script now actively creates unique UUID profiles and persistently saves them into the `travelPersons` database if the person doesn't natively exist there, bridging the trip directly to a true UUID isolated within the scoped database. Spliced completely severed any fallback loops or lookups referencing `members` inside `travel-log.js`. 
- **Commit**: `[TBD]`

### Travel Data Modernization & Summary Generator (v3.6.15 · 2026-04-03)
- **Database Modernization**:
  - Decoupled `travelPersons` into explicit `passengers` model. Added implicit schema migration in `shared/db.js` `getCachedTravelData()` to upgrade old keys dynamically upon booting so no data is lost.
  - Generalized "Qatar" into dynamic "Destination" and "Origin" country tracking inside the main `trips` schema.
- **Add Trip Wizard**:
  - Overhauled inputs from hardcoded "India/Qatar" to dynamic selectable Origins and Destinations. Computes mathematically correct relative stay values based on precise Origin and Destination values selected.
- **Settings & Excel Import**:
  - Re-mapped the Excel import tool engine in `settings.js` to correctly route incoming arrays into the modern `passengers` collection and extract generic Date values into explicit trip properties without locking them to "Qatar" labels.
- **Travel Summary Module**:
  - Built `travel-summary.js`. A new powerful standalone analytical dashboard generator accessible inside `travel-log.js`.
  - Added "Strict Data Slicing" algorithm. If User Filters by Year (e.g. 2025) but trip started Dec 24, 2024 and ended Jan 6, 2025, the algorithm mathematically derives correctly that only 6 days belong inside the target window. 
  - Allows bulk Passenger filtering (single, group, or all).
  - Integrated 3 dedicated Export Engines to process the computed UI variables into: (1) CSV File Download, (2) WhatsApp Emoji Formatted Clipboard String, and (3) Native Canvas-to-Blob Image Generation for downloading the HTML chart graphics out of the DOM.
- **Service Worker Updates**:
  - Imposed dynamic cache invalidation by injecting the new module into `STATIC_ASSETS` arrays.
- **Commit**: `[TBD]`

### Travel Log Modernization & Summary Pivot Pivot (v3.6.16 · 2026-04-03)
- **Trip Editor Cancel Button**:
  - Added a distinct "Cancel" button to the Edit Trip view that safely aborts the flow without saving edits, functioning independently from the existing step-by-step "Back" button.
- **Log Filter Dropdown**:
  - Replaced the horizontal `Passengers` filter chips on the Travel Log with a dynamic, multi-select dropdown button mapped identically to the user's mockup.
  - Allowed for an unlimited vertical list while keeping the max-height constrained so it avoids eclipsing the keyboard on mobile devices.
- **Single Passenger Summary Pivot**:
  - Entirely restructured the `Travel Summary Report` inside `travel-summary.js`.
  - Shifted from generic date-slicing logic to focus strictly on a *single passenger*.
  - Added a toggle allowing users to Pivot days specifically by "Year" or by "Country".
  - Refactored calculation engine to bind all travel days strictly to their specific *entry date* per the latest operational requirement.
- **Commit**: `[TBD]`

### Travel Log Native Dual-Tab Architecture (v3.7.0 · 2026-04-03)
- **UI Architecture Refactor**:
  - Restructured `travel-log.js` completely. It now houses two native tabs: `Trip Log` and `Passenger Summary`.
  - Replaced the floating `export-sheet` popup with a fully integrated dashboard view, completely isolating it from the awkward clipping issues.
- **Lifetime Highlights Engine**:
  - Engineered an aggregate metric engine into `travel-log.js`. The dashboard now immediately exposes `Total Trips`, `Total Days`, `Top Destination`, and `Max Stay` in an attractive stat block directly below the passenger name.
  - Spliced these new stats cleanly into the text generation (WhatsApp/Clipboard text blob).
- **Mobile Export Constraints**:
  - Wrapped the pivot output generator into an explicit `<div style="max-width: 450px;">` box. When clicking "Save Image", the PWA forces the photograph into an absolute portrait mobile ratio rather than bleeding out infinitely across desktop viewports.
- **Commit**: `[TBD]`

---

## Session Start: 2026-04-03

### Smart Travel Analysis & Navigation Fixes (v3.7.5 · 2026-04-03)

- **Travel Hub (Family Hub)**:
  - **Smart Origin/Destination**: Implemented automatic deduction of travel direction (A -> B) based on entry/exit date existence in Excel imports. (e.g. "Out Qatar" + "In India" -> Origin: Qatar).
  - **Manual Override**: Added explicit `originCountry` and `destinationCountry` fields to the trip entry wizard.
  - **Swap Button**: Added a `⇄` button to quickly flip Origin and Destination countries in the UI.
  - **Navigation Fix**: Fixed the non-functional "Back" arrow (←) by correctly importing `navigate` in `add-trip.js`.
  - **Chronological Validation**: Added strict date ordering checks (Departure < Arrival < Exit < Return) to prevent nonsensical data entry.
  - **Dynamic Header**: Updated the trip summary header to show "Returned to [Origin]" once a return date is set.
  - **Data Normalization**: Updated `travel-log.js` to ensure the new `originCountry` field is handled consistently.
- **Shared Components**:
  - **Import Tool**: Added `originCountry` and `destinationCountry` as optional columns to `TRAVEL_COLUMNS` for manual mapping.
- **Service Worker**: Bumped all apps and shared utilities to **v3.7.5**.
- **Commit**: `f70e71a` (master), `116bbe8` (main) — `v3.7.5: Smart Travel Analysis and Navigation Fixes`

### One-Way Event Model Transition (v3.8.0 · 2026-04-03)

- **Major Architecture Pivot**: Shifted from "Round Trip" model to individual "One-Way Event" records to eliminate date overlaps and user confusion.
- **`app-a-family-hub` (Travel Hub)**:
    - **Add Trip Wizard**: Re-engineered `add-trip.js` into a streamlined one-way flow. Removed redundant return-date fields and split flight inputs.
    - **Dashboard Logic**: Simplified "Current Location" tracking in `dashboard.js`. Now uses the destination of the latest sequential arrival.
    - **Excel Import Logic**: Updated `settings.js` to automatically detect and **split** round-trip rows into two distinct one-way trip records.
    - **Sequential Analysis**: 
        - Refactored `travel-log.js` to calculate stay duration by "looking ahead" to a passenger's next trip departure.
        - Updated `travel-summary.js` calculation engine to use inter-trip sequence bridging for year/country stay reports.
    - **Robust Nuclear Reset**: 
        - Implemented `clearDriveQueue` in `shared/sync-manager.js` to purge persistent cloud sync buffers.
        - Enhanced reset logic in `settings.js` to perform a total wipe of cloud queues, local cache, and metadata, while **preserving** historical snapshots in the Mirror folder.
- **Service Worker**: Bumped all cache versions to **v3.8.0** to ensure deployment of the new logic.
- **Commit**: `[TBD]`
- **Status**: Completed one-way architecture pivot.

---

## Session Start: 2026-04-04

### Travel Log Restructuring & One-Way Mode (v4.0.0 · 2026-04-04)

- **One-Way Model Implementation**:
    - Finalized the transition to a strict "One-Way Event" per row model.
    - Updated `shared/import-tool.js` with the new Excel column layout.
    - Refactored `onImportComplete` in `settings.js` to process rows as independent one-way trips and handle multi-column "Accompanied by" data.
- **Enhanced Passenger Entry**:
    - Created `shared/multi-smart-input.js` for robust multi-passenger selection.
    - Enabled on-the-fly passenger creation within the "Travelling with" field.
    - Updated `add-trip.js` to use the new component and support instant database saving for new names.
- **Maintenance & Deployment**:
    - Verified the "Nuclear Reset" eraser logic for total data wiping.
    - Bumped project version to **v4.0.0** across all components.
    - Synchronized `master` and `main` branches.
- **Bug Fixes**:
    - Resolved UUID appearance in Passenger Summary dropdown by enhancing name resolution logic.
    - Fixed overlapping stay calculations in Passenger Summary by implementing a "Sequential Bridging" logic that ends a stay when the next trip begins.
- **New Features**:
    - Filtered "Current Locations" dashboard widget by country (Qatar/India).
    - Activated Address Photos for Family Defaults and Member Profiles (fixed missing utility imports).
    - Added dedicated "Google Plus Location ID" field to all address entry sections for manual Plus Code management.
- **Commit**: `7562751` (master), `7b40bf1` (main) — `feat: filter dashboard widget by country & enable address photos & plus code field`
