# Session Notes — v5.5.x Bug Fixes & Sync Folder Design
_Last updated: 2026-04-27_

---

## 1. Android Storage — The Key Discovery

### Two completely different "Documents" paths on Android

| Path | Type | Permission needed | Visible in file manager |
|------|------|-------------------|------------------------|
| `/storage/emulated/0/Documents/TravelHub/` | **Public** | `MANAGE_EXTERNAL_STORAGE` (Android 11+) | ✅ Always |
| `/storage/emulated/0/Android/data/<pkg>/files/Documents/TravelHub/` | **App-private** | None — app's own dir | ❌ Hidden on Android 11+ |

### Current situation (before sync folder fix)
- `Directory.DOCUMENTS` in Capacitor 5 on Android = **app-private** path
- Files ARE written (no crash, no permission needed) but user cannot find them
- `AndroidManifest.xml` only has `INTERNET` permission — no storage permissions
- All exports (Excel, CSV, PDF) and auto-backups go to the hidden path
- The write works; the visibility doesn't

### Fix plan
- Add `MANAGE_EXTERNAL_STORAGE` to AndroidManifest (both apps)
- Add `android:requestLegacyExternalStorage="true"` to `<application>` tag
- At runtime, check permission; if not granted, show one-time prompt redirecting to Settings > Special App Access > All Files Access
- Once granted, write to real public path using `Directory.EXTERNAL_STORAGE` with `Documents/TravelHub/` prefix

---

## 2. Sync Folder Design — Agreed Spec

### Folder structure (public, visible)
```
/storage/emulated/0/Documents/
  TravelHub/
    sync_folder/
      TravelHub_latest.json          ← always current, overwritten on every open
      TravelHub_2026-04-27.json      ← daily dated snapshot, kept 30 days
    exports/                         ← existing: Excel, CSV, PDF exports
    TravelboxFiles/                  ← existing: .travelbox auto-backups
  PersonalVault/
    sync_folder/
      PersonalVault_latest.json
      PersonalVault_2026-04-27.json
    exports/
    VaultboxFiles/
```

### Auto-sync behaviour
- Fires at **every app open** (inside `bootBackup()` in sync-manager.js)
- Writes `_latest.json` (overwrite) + daily dated file (if not already today's)
- Prunes dated files older than 30 days
- Silently skips if `MANAGE_EXTERNAL_STORAGE` not granted (falls back to app-private)

### Settings screen — "Sync Folder" section (both apps)
| UI element | Behaviour |
|-----------|-----------|
| Permission status badge | Shows "✅ Granted" or "⚠️ Not granted" |
| "Grant All Files Access" button | Shown only when not granted; opens Android Settings for the app |
| "Sync Now" button | Manually force-writes to sync_folder immediately |
| Path display | Shows `/storage/emulated/0/Documents/TravelHub/sync_folder/` |
| Last sync timestamp | From localStorage |
| "Restore from sync_folder" button | Reads `_latest.json` directly — no file picker needed |

---

## 3. Bugs Fixed This Session (v5.5.5 — v5.5.6)

### Both apps — drive.js (v5.5.5)
- **Root crash fixed**: `Directory.Documents` / `Encoding.UTF8` were TypeScript enum references — don't exist at runtime in Capacitor WebView. Replaced with string literals `'DOCUMENTS'` / `'utf8'`
- This was crashing ALL exports and ALL manual backups
- Added `saveFileToExports()` for PDF and CSV saving

### Travel app — travel-export.js (v5.5.5)
- `getStayDays()` was defined only inside `exportWhatsApp()` forEach; `exportPDF()` called it at module scope → crash. Fixed by hoisting to module level
- `const lines = []` was missing in `exportWhatsApp()` → crash. Added declaration
- PDF/Excel/CSV now save to `Documents/TravelHub/exports/` via Capacitor
- "People" label → "Passengers"; bottom bar safe-area padding

### Travel app — travel-log.js (v5.5.5 / v5.5.6)
- Horizontal scroll passenger chips → replaced with keyboard-safe **bottom-sheet popup picker**
- Passenger filter now matches **primary passenger only** — trips where person appears only as companion are excluded (v5.5.6)
- Summary tab: added Share Text (`navigator.share`) + Share Image (share sheet)
- `generateTextReport()` now includes current location at top
- Share image: removed `navigator.canShare()` gatekeeper — just tries `navigator.share()` directly (v5.5.6)

### Travel app — dashboard.js (v5.5.5 / v5.5.6)
- `copyDashboardText()` was empty when `members[]` was empty (People tab not set up). Now falls back to passenger names from trip data
- Share image: removed `canShare()` gatekeeper; falls back to download instead of dead-end toast (v5.5.6)

### Vault app — transactions.js (v5.5.5 / v5.5.6)
- FAB `＋` button: `z-index` raised to 105 (nav bar is 100). CSS `.fab` already positions it correctly at `calc(nav-height + safe-area + 16px)` — previous inline `bottom:72px` was LOWER than CSS formula (80px), removed it (v5.5.6)
- Filter sheet: added **Cancel** button + `padding-bottom: calc(16px + env(safe-area-inset-bottom))` so Apply is never buried

### Both apps — sync-manager.js (v5.4.3)
- `writeAndPruneLocalBackup()` was private, only called on data SAVE
- View-only sessions (browsing without changes) never created a backup
- Fixed: exported `bootBackup(appName)`, called in both `index.html` boot sequences
- Now creates today's backup file on **every app open**

---

## 4. Backup File Format (Reference)

| App | Extension | Real format | Auto-created path |
|-----|-----------|-------------|-------------------|
| Travel | `.travelbox` | Plain JSON (`JSON.stringify(data)`) | `TravelHub/TravelboxFiles/TravelHub_Backup_YYYY-MM-DD.travelbox` |
| Vault | `.vaultbox` | Plain JSON | `PersonalVault/VaultboxFiles/Vault_Backup_YYYY-MM-DD.vaultbox` |

Both are restorable via Settings > Restore. Can be renamed to `.json` and opened in any text editor.

---

## 5. Next Build Tasks

- [ ] Add `MANAGE_EXTERNAL_STORAGE` + `WRITE_EXTERNAL_STORAGE` to both `AndroidManifest.xml`
- [ ] Add `android:requestLegacyExternalStorage="true"` to both `<application>` tags
- [ ] Update `sync-manager.js` (both): detect permission, write to public path when granted
- [ ] Update `drive.js` (both): use public path for exports when permission granted
- [ ] Build Settings "Sync Folder" section (both apps): permission status, Grant button, Sync Now, Restore
- [ ] Update `bootBackup()` to write to `sync_folder/` when permission available
- [ ] Rebuild APKs after all source changes

---

## 6. Capacitor Plugin Inventory (confirmed installed)

| Plugin | Package | Used for |
|--------|---------|---------|
| Filesystem | `@capacitor/filesystem` | All file read/write |
| App | `@capacitor/app` | Back button, exit hook |
| Share | `@capacitor/share` | (installed in node_modules — not yet wired into app code) |

`@capacitor/share` is installed in node_modules but **not yet used** in JS code. Can be used for native share sheet as an alternative to `navigator.share`.
