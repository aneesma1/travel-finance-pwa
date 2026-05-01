# Build State — v5.6.2 (as of 2026-05-01)

> See also: `COMMUNICATION_PROTOCOL.md` at repo root — how to reference each build correctly.

---

## REPOSITORY STRUCTURE

```
travel-finance-pwa/                        ← git root
├── .github/
│   └── workflows/
│       ├── build-travel.yml               ← CI: builds TravelHub APK
│       └── build-vault.yml                ← CI: builds PersonalVault APK
├── Travel-Vault_Android/                  ← APK source (ACTIVE, maintained)
│   ├── Travel_app/                        ← App 1: TravelHub
│   └── Personal_vault/                    ← App 2: PersonalVault
└── Travel-Vault_PWA/                      ← PWA source (OLDER, partially maintained)
    ├── app-a-family-hub/                  ← PWA App 1
    ├── app-b-private-vault/               ← PWA App 2
    └── shared/                            ← Shared PWA modules
```

---

## BUILD 1 — APK (Android Native) — ACTIVE / CURRENT

### Overview
- Two independent Android apps, each compiled via GitHub Actions
- No local Android SDK needed. Push to master → GitHub Actions builds → signed APK uploaded as artifact
- Architecture: **Capacitor 8 WebView** wrapping plain HTML/JS/CSS
- Storage: **100% local** — IndexedDB (runtime) + Capacitor Filesystem (file exports)
- Sync: **No cloud**. Local file sync folder only.
- Auth: **No Google OAuth**. Travel uses role-based access (admin/viewer). Vault uses PIN.

### App 1: TravelHub

| Property | Value |
|---|---|
| App ID | `com.antigravity.travel` |
| App Name | TravelHub |
| Icon BG Color | `#3730A3` (indigo) |
| Source dir | `Travel-Vault_Android/Travel_app/src/` |
| Capacitor webDir | `src` |
| Version | **5.6.2** (file: `Travel_app/VERSION`) |
| APK artifact name | `TravelHub_v{VER}_b{RUN}.apk` |

### App 2: PersonalVault

| Property | Value |
|---|---|
| App ID | `com.antigravity.vault` |
| App Name | PrivateVault |
| Icon BG Color | `#065F46` (emerald) |
| Source dir | `Travel-Vault_Android/Personal_vault/src/` |
| Capacitor webDir | `src` |
| Version | **5.6.2** (file: `Personal_vault/VERSION`) |
| APK artifact name | `PersonalVault_v{VER}_b{RUN}.apk` |

### APK Capacitor Plugins (both apps, identical)

| Plugin | npm package | Version | Used for |
|---|---|---|---|
| Core | `@capacitor/core` | ^8.3.0 | Bridge layer |
| Android | `@capacitor/android` | ^8.3.0 | Android runtime |
| Filesystem | `@capacitor/filesystem` | ^8.1.2 | All file read/write/export |
| Share | `@capacitor/share` | ^8.0.1 | Native share sheet |
| App | `@capacitor/app` | ^8.1.0 | Back button, exitApp |
| Browser | `@capacitor/browser` | ^8.0.3 | External links |
| XLSX | `xlsx` | ^0.18.5 | Excel export (bundled to src/js/lib/) |

### Android Permissions (both apps, AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
```
Also: `android:requestLegacyExternalStorage="true"` on `<application>` tag.

FileProvider registered with `file_paths.xml`:
- `<external-path path="." />` — public external storage
- `<cache-path path="." />` — app cache (used for share temp files)

### APK Source File Versions (current)

| File | Version |
|---|---|
| `Travel_app/src/shared/drive.js` | v5.6.0 |
| `Travel_app/src/shared/sync-manager.js` | v5.5.0 |
| `Travel_app/src/js/screens/dashboard.js` | v3.5.8 |
| `Travel_app/src/js/screens/settings.js` | v4.11.1 |
| `Personal_vault/src/shared/drive.js` | v5.6.0 (identical) |
| `Personal_vault/src/shared/sync-manager.js` | v5.5.0 (identical) |
| `Personal_vault/src/js/screens/dashboard.js` | v3.5.8 |
| `Personal_vault/src/js/screens/settings.js` | v4.11.0 |

### APK Shared File Inventory (`src/shared/` in both apps)

| File | Role |
|---|---|
| `drive.js` | Device storage: public/private path routing, sync folder write/restore, all file exports |
| `sync-manager.js` | Local save orchestration: IndexedDB write + sync folder write, bootBackup |
| `db.js` | IndexedDB wrapper (openDB, getCached*, setCached*, clearAll*) |
| `backup-engine.js` | AES-GCM encrypted backup (v5.5.0 local-first) |
| `crypto-engine.js` | AES-GCM WebCrypto primitives |
| `app-utils.js` | Capacitor exitApp, utility helpers |
| `app-config.js` | App-level constants |
| `import-tool.js` | Import JSON/travelbox/vaultbox files |
| `photo-picker.js` | Camera/gallery photo picker (Capacitor) |
| `multi-smart-input.js` | Tag input widget |
| `pill-select.js` | Pill selector widget |
| `smart-input.js` | Auto-suggest text input |
| `pwa-install.js` | Install prompt (dormant in APK build — no browser install prompt) |
| `recovery.js` | Data recovery utilities |
| `security-dashboard.js` | Security events UI |
| `security-log.js` | Security event logging |
| `sync-queue.js` | Queue utilities |
| `utils.js` | General utilities (showToast, formatDate, uuidv4, etc.) |

**APK does NOT have:** `auth.js` (no Google OAuth)

### APK Storage Layout on Device

```
/storage/emulated/0/Documents/
  TravelHub/
    sync_folder/
      TravelHub_latest.json          ← overwritten on every app open
      TravelHub_YYYY-MM-DD.json      ← daily snapshot (30-day rotation)
    exports/
      TravelHub_Export_*.xlsx
      TravelHub_Export_*.csv
      TravelHub_Export_*.pdf
      dashboard_*.png                ← saved dashboard images
    TravelboxFiles/
      TravelHub_Backup_YYYY-MM-DD.travelbox   ← daily auto-backup
  PersonalVault/
    sync_folder/
      PersonalVault_latest.json
      PersonalVault_YYYY-MM-DD.json
    exports/
      Finance_Export_*.xlsx
      dashboard_*.png
    VaultboxFiles/
      Vault_Backup_YYYY-MM-DD.vaultbox
```
Public path requires `MANAGE_EXTERNAL_STORAGE`. Falls back to app-private dir if not granted.

### GitHub Actions Build Process (per app, identical pattern)

1. `actions/checkout@v4` — full repo checkout
2. `actions/setup-node@v4` — Node 22
3. `actions/setup-java@v4` — Zulu JDK 21
4. `npm install` in app dir
5. Copy `xlsx.full.min.js` to `src/js/lib/` (offline XLSX)
6. Verify `src/shared/sync-manager.js` exists
7. Read `VERSION` file → inject into `index.html` (`window.APP_VERSION`, `window.BUILD_TIME`)
8. Generate icons: `@capacitor/assets generate` with brand color
9. `cap sync android`
10. `./gradlew assembleRelease`
11. `zipalign` + `apksigner` with secrets (keystore B64, store pass, key alias, key pass)
12. Upload signed APK as artifact (retained 3 days)

**Build triggers:** push to master touching `Travel-Vault_Android/Travel_app/**` OR `Travel-Vault_PWA/shared/**` OR `.github/workflows/build-travel.yml` (same pattern for vault).

> ⚠️ Note: `Travel-Vault_PWA/shared/**` is in the trigger path but is NOT copied or used in the APK build steps. This trigger path is a legacy leftover from an older shared-source design. The APK now has fully independent copies of all shared files.

---

## BUILD 2 — PWA (Web) — OLDER / PARTIALLY MAINTAINED

### Overview
- Two separate web apps sharing a `/shared/` folder
- Designed to be hosted on a web server or served via localhost
- Architecture: Plain HTML/CSS/JS with ES modules + Service Worker (installable PWA)
- Storage: **IndexedDB local** + **Google Drive cloud sync**
- Auth: **Google OAuth 2.0 implicit flow** — required to open the app
- Currently: NOT cleanly standalone — requires a server with valid OAuth redirect URI

### App A: Family Hub (Travel)

| Property | Value |
|---|---|
| Path | `Travel-Vault_PWA/app-a-family-hub/` |
| Theme color | `#3730A3` |
| Title | Family Hub |
| Version (index.html) | v3.5.9 |
| sw.js cache version | hub-cache-v4.14.0 |

### App B: Private Vault (Finance)

| Property | Value |
|---|---|
| Path | `Travel-Vault_PWA/app-b-private-vault/` |
| Theme color | `#065F46` |
| Title | Private Vault |
| Version (index.html) | v3.5.11 |

### PWA Shared File Versions (current)

| File | Version |
|---|---|
| `shared/drive.js` | v3.5.5 (Google Drive API wrapper — full cloud sync) |
| `shared/sync-manager.js` | v3.5.5 (Drive queue, offline pending queue) |
| `shared/auth.js` | v3.5.5 (Google OAuth 2.0 implicit flow) |
| `app-a/js/screens/settings.js` | v4.11.1 |
| `app-b/js/screens/settings.js` | v4.11.0 |
| `app-a/js/screens/dashboard.js` | v3.5.5 |
| `app-b/js/screens/dashboard.js` | v3.5.5 |

### PWA Shared File Inventory (`Travel-Vault_PWA/shared/`)

| File | Present in APK? | Role |
|---|---|---|
| `drive.js` | ✅ (different version) | PWA: Google Drive API. APK: device storage only |
| `sync-manager.js` | ✅ (different version) | PWA: Drive queue + pending. APK: local only |
| `auth.js` | ❌ APK has NO auth.js | Google OAuth 2.0 |
| `db.js` | ✅ | IndexedDB wrapper (shared, same) |
| `utils.js` | ✅ | General utilities |
| `app-utils.js` | ✅ | Has Capacitor exitApp guard |
| `app-config.js` | ✅ | App constants |
| `import-tool.js` | ✅ | Import JSON |
| `photo-picker.js` | ✅ | Photo picker |
| `multi-smart-input.js` | ✅ | Tag input |
| `pill-select.js` | ✅ | Pill selector |
| `smart-input.js` | ✅ | Auto-suggest input |
| `pwa-install.js` | ✅ (dormant in APK) | Install prompt banner |
| `recovery.js` | ✅ | Recovery utilities |
| `security-dashboard.js` | ✅ | Security events UI |
| `security-log.js` | ✅ | Security logging |
| `sync-queue.js` | ✅ | Queue utilities |
| `backup-engine.js` | ❌ PWA doesn't have it | APK-only: AES-GCM encrypted backup |
| `crypto-engine.js` | ❌ PWA doesn't have it | APK-only: WebCrypto primitives |

### PWA Boot Flow (Family Hub)

1. Service worker registered (`sw.js`)
2. Google OAuth: check if token in localStorage → if no, redirect to Google OAuth
3. Handle OAuth callback (token in URL hash)
4. `initDriveFolders()` → find/create app folder on Drive
5. `readData()` → download JSON from Drive into IndexedDB
6. `initSyncManager()` → start Drive queue processor
7. Render screen via router

### PWA Settings — Data Tab Features

- Download Local Backup (JSON file)
- Restore from Local Backup (file picker)
- Restore from Drive Mirror (last 3 snapshots on Drive)
- Import tool (CSV/JSON importer)
- Photo ZIP download
- Clear local cache
- Deep clean Drive
- Nuclear reset (wipes local + Drive)

---

## KEY SEPARATION CONFIRMED

The APK and PWA builds are **fully independent** with no shared runtime code:

| Aspect | APK | PWA |
|---|---|---|
| Source root | `Travel-Vault_Android/Travel_app/src/` | `Travel-Vault_PWA/app-a-family-hub/` |
| Shared modules | Own copy in `src/shared/` | Own copy in `shared/` |
| drive.js role | Device filesystem | Google Drive cloud |
| Auth | None (role-based or PIN) | Google OAuth 2.0 |
| sync-manager | Local IndexedDB + file sync folder | Drive queue + pending queue |
| Service worker | ❌ None | ✅ Registered |
| Capacitor | ✅ Core of build | ❌ Not used |
| XLSX | Bundled locally (`src/js/lib/`) | CDN or not used |
| CSP | Includes `capacitor://localhost` | Includes `googleapis.com` |
| Boot dependency | None — opens immediately | Google OAuth required |

Editing a file in `Travel-Vault_PWA/shared/` does NOT affect APK code.
Editing a file in `Travel-Vault_Android/Travel_app/src/shared/` does NOT affect PWA code.

---

## CURRENT APK FEATURE STATE (v5.6.2) — What Works

| Feature | TravelHub APK | PersonalVault APK |
|---|---|---|
| Local IndexedDB storage | ✅ | ✅ |
| Auto-backup on boot (.travelbox/.vaultbox) | ✅ | ✅ |
| XLSX export | ✅ Visible in exports/ | ✅ |
| CSV export | ✅ | — |
| PDF export | ✅ | — |
| Dashboard share image (native share) | ✅ v3.5.8 | ✅ v3.5.8 |
| Dashboard save image (Documents/exports/) | ✅ v3.5.8 | ✅ v3.5.8 |
| Sync folder (public Documents) | ✅ v5.6.0 | ✅ v5.6.0 |
| Sync folder settings UI | ✅ | ✅ |
| Sync folder path word-wrap | ✅ v5.6.2 | ✅ v5.6.2 |
| Export status word-wrap | ✅ | ✅ |
| FAB z-index fix | ✅ (transactions) | ✅ dashboard v3.5.8 |
| AES-GCM encrypted backup | ✅ backup-engine.js | ✅ |
| Native back button | ✅ | ✅ |
| MANAGE_EXTERNAL_STORAGE | ✅ AndroidManifest | ✅ |
| FileProvider for sharing | ✅ file_paths.xml | ✅ |

---

*Saved: 2026-05-01*
*Git commit at save: c4d30cc (v5.6.2)*
