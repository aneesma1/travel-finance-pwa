# HTML Build — Local Development Guide

Version: see `HTML_VERSION` file
Last updated: 2026-05-01

---

## What This Is

Two standalone HTML web apps — no server required for production use, but you need a
local HTTP server during development because browsers block ES module imports on `file://`.

```
app-a-family-hub/     → Family Hub (Travel tracker)
app-b-private-vault/  → Private Vault (Finance tracker)
shared/               → Shared JS modules (used by both apps)
```

---

## Running Locally (Pick Any Method)

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

## ⚠️ Why You Cannot Double-Click index.html

Modern browsers block `import` / `export` (ES modules) when loading from `file://` protocol.
You'll see a CORS error in the console. Always use a local HTTP server.

---

## Edit → Test Cycle

```
1. Edit any .js or .css file in Travel-Vault_PWA/
2. Save the file
3. Refresh the browser tab (F5 or Ctrl+R)
4. Changes are live immediately — no build step, no compile
```

No APK signing. No GitHub Actions. No Capacitor. No npm install needed.

---

## Shared Files — Important

`Travel-Vault_PWA/shared/` is used by BOTH apps.
If you change `shared/drive.js`, it affects both Family Hub AND Private Vault.
Always test both apps after changing shared/ files.

---

## Git Push Benchmarks

Do NOT push to git on every small change. Push only when:

| Condition | Example |
|---|---|
| Feature complete | "Google Auth removed, app opens without login" |
| Both apps tested | Family Hub + Private Vault both working |
| Version bumped | HTML_VERSION updated |
| Before session break | Saving progress before stopping work |
| Phase milestone | "Phase 1 complete — local-first, no Drive dependency" |

### How to push:
```bash
cd <repo root>
git add Travel-Vault_PWA/
git commit -m "HTML v3.6.0 — Phase 1: removed Google Auth, local-first boot"
git push origin master
```

> Note: pushing HTML files does NOT trigger APK builds (workflow triggers are scoped to
> Travel-Vault_Android/** only). HTML pushes are safe — they won't start unwanted CI jobs.

---

## Version Bumping

Edit `Travel-Vault_PWA/HTML_VERSION` before pushing:

```
3.5.9      ← current frozen state (Google OAuth / Drive)
3.6.0      ← next: Phase 1 (remove Google OAuth, local-first)
3.7.0      ← Phase 2: APK feature parity (share image, export, FAB fix)
3.8.0      ← Phase 3: encrypted backup, polishing
```

Version is shown in app via `window.HTML_VERSION` (set manually in index.html, unlike APK
which has it auto-injected by GitHub Actions CI).

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
