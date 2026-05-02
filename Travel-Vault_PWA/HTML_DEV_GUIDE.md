# HTML Build — Local Development Guide

Version: see `HTML_VERSION` file
Last updated: 2026-05-02

---

## What This Is

Two HTML web apps — a local-server dev version and a standalone double-click version (see
Standalone Build below). No cloud, no server required for production use.

```
app-a-family-hub/     → Family Hub (Travel tracker)
app-b-private-vault/  → Private Vault (Finance tracker)
shared/               → Shared JS modules (used by both apps)
dist/                 → Standalone single-file builds (double-click on PC, no server)
```

---

## Running Locally During Development (Pick Any Method)

> Development uses ES modules which require a local HTTP server (browsers block `import`/`export`
> on `file://`). For end-user use, use the **Standalone Build** in `dist/` instead.

### Method 1 — Python (recommended, no install needed on Windows/Mac)

```bash
# Family Hub:
cd "Travel-Vault_PWA/app-a-family-hub"
python -m http.server 8080
# Visit: http://localhost:8080

# Private Vault (separate terminal):
cd "Travel-Vault_PWA/app-b-private-vault"
python -m http.server 8081
# Visit: http://localhost:8081
```

### Method 2 — VS Code Live Server

1. Open VS Code in `Travel-Vault_PWA/`
2. Install extension: "Live Server" by Ritwick Dey
3. Right-click `app-a-family-hub/index.html` → "Open with Live Server"
4. Auto-reloads on save

### Method 3 — Node (if installed)
```bash
npx serve Travel-Vault_PWA/app-a-family-hub -p 8080
npx serve Travel-Vault_PWA/app-b-private-vault -p 8081
```

---

## Standalone Build (Double-Click on PC — No Server Needed)

### What It Does

The Python script `build-standalone.py` produces two single-file HTML files in `dist/`:

```
dist/FamilyHub_Standalone.html      → Family Hub (Travel tracker)
dist/PrivateVault_Standalone.html   → Private Vault (Finance tracker)
```

These files can be double-clicked directly in Windows Explorer (or any OS) and open in the
browser via `file://` — no Python, no Node, no VS Code needed.

### How the Bundler Works

1. Reads `app-a-family-hub/index.html` (or `app-b-private-vault/index.html`)
2. Traces all `import` / `export` statements recursively across all `.js` files
3. Resolves the correct load order (topological sort of dependency graph)
4. Strips `import` / `export` / `export default` declarations
5. Converts dynamic `import('./path')` calls to direct function calls
6. Inlines all local `.css` files into `<style>` blocks
7. Inlines all resolved `.js` into a single `<script>` block
8. CDN libraries (xlsx.js, jsPDF, html2canvas) remain as CDN `<script src>` tags —
   they still require internet on first load but are cached by the browser

### Running the Bundler

```bash
cd Travel-Vault_PWA
python build-standalone.py
```

Output will be at `Travel-Vault_PWA/dist/FamilyHub_Standalone.html` and
`Travel-Vault_PWA/dist/PrivateVault_Standalone.html`.

### Bundler Notes

- Uses Python stdlib only — no pip install, no npm needed
- Safe to re-run any time; overwrites `dist/` files
- After ANY code change in `app-a-*`, `app-b-*`, or `shared/`, re-run the bundler
- `dist/` files are committed to git so users can download without running the script

---

## Edit → Test Cycle

### During development (dev server):
```
1. Edit any .js or .css file in Travel-Vault_PWA/
2. Save the file
3. Refresh the browser tab (F5 or Ctrl+R)
4. Changes are live immediately — no build step needed
```

### Before committing or distributing:
```
1. Make code changes in app-a-*/, app-b-*/, shared/
2. Run: python build-standalone.py
3. Test dist/ files by double-clicking them
4. Commit both source and dist/ together
```

No APK signing. No GitHub Actions. No Capacitor. No npm install needed.

---

## Shared Files — Important

`Travel-Vault_PWA/shared/` is used by BOTH apps.
If you change `shared/drive.js`, it affects both Family Hub AND Private Vault.
Always test both apps after changing shared/ files.

---

## 3-Option Restore Dialog — Design Spec

All restore/import paths in BOTH apps must show a 3-option choice before overwriting data.

### Restore paths affected:

| App | Path |
|---|---|
| Family Hub | Settings → Restore from Backup (.travelbox) |
| Family Hub | Welcome screen → Restore from Backup |
| Family Hub | Settings → Import from Excel/CSV |
| Private Vault | Settings → Restore from Backup (.vaultbox) |
| Private Vault | Welcome screen → Restore from Backup |
| Private Vault | Forgot PIN → Restore from Backup |
| Private Vault | Settings → Import from Excel/CSV |

### The 3 options:

| Option | Key | Behaviour |
|---|---|---|
| **Merge (skip duplicates)** | `'merge'` | Add records from file; skip any that already exist (matched by dedup key) |
| **Append all** | `'append'` | Add all records from file regardless of duplicates |
| **Wipe & Replace** | `'wipe'` | Delete all existing data, then load file data fresh |

### Dedup keys per data type:

| Store | Dedup key |
|---|---|
| Finance transactions | `date + description + amountSpend + income` |
| Travel trips | `personId + dateOutIndia + destination` |
| Members / contacts | `name` (or `id` if present) |
| Documents | `personId + docName + docNumber` |

### Implementation plan:

1. **`shared/restore-dialog.js`** — new file
   - `showRestoreDialog()` → returns `Promise<'merge'|'append'|'wipe'|null>` (null = cancelled)
   - `applyMergeStrategy(strategy, currentRecords, incomingRecords, dedupKeyFn)` → merged array

2. **`shared/drive.js`** — update `restoreFromLocalFile()`
   - Show dialog before applying restore
   - Pass strategy to merge logic

3. **`shared/import-tool.js`** — update Excel/CSV import
   - Show dialog before processing rows

4. **`app-a-family-hub/js/screens/settings.js`** — restore button uses dialog
5. **`app-a-family-hub/index.html`** — welcome screen restore uses dialog
6. **`app-b-private-vault/js/screens/settings.js`** — restore button uses dialog
7. **`app-b-private-vault/index.html`** — welcome + forgot PIN restore uses dialog

---

## Git Push Benchmarks

Do NOT push to git on every small change. Push only when:

| Condition | Example |
|---|---|
| Feature complete | "Restore dialog added to all paths" |
| Both apps tested | Family Hub + Private Vault both working |
| Version bumped | HTML_VERSION updated |
| Before session break | Saving progress before stopping work |
| Phase milestone | "Phase 2A complete — 3-option restore dialog" |

### How to push:
```bash
cd <repo root>
git add Travel-Vault_PWA/
git commit -m "HTML v4.1.0 — Phase 2A: 3-option restore dialog all paths"
git push origin master
```

> Note: pushing HTML files does NOT trigger APK builds (workflow triggers are scoped to
> Travel-Vault_Android/** only). HTML pushes are safe — they won't start unwanted CI jobs.

---

## Version Roadmap

```
3.5.9      ← frozen (Google OAuth / Drive era)
4.0.0      ← Phase 1 complete: local-first, no Drive/auth dependency (DONE)
4.1.0      ← Phase 2A: 3-option restore dialog — all paths, both apps
4.2.0      ← Phase 2B: standalone single-file build (double-click on PC)
4.3.0      ← Phase 3: polish, encrypted backup, future improvements
```

Version is shown in app via `window.HTML_VERSION` (set manually in each `index.html`, unlike
APK which has it auto-injected by GitHub Actions CI).

---

## What APK Features Look Like in HTML (Reference)

| APK feature | HTML equivalent |
|---|---|
| Capacitor Filesystem write | Browser `<a href="blob:..." download>` |
| Capacitor Share plugin | `navigator.share({ files: [blob] })` (Chrome Android) |
| MANAGE_EXTERNAL_STORAGE | Not needed — browser uses Downloads folder |
| Sync folder auto-write | Manual "Export JSON" button (browser cannot write silently) |
| App back button | Browser back button |
| exitApp() | `window.close()` or just navigate away |
