# Project Communication Protocol
_How to talk to Claude without mixing APK and HTML builds_

---

## THE TWO BUILDS — NEVER MIX THEM

| Label | What it means | Root folder |
|---|---|---|
| **[APK]** | Android app, built by GitHub Actions, installed on phone | `Travel-Vault_Android/` |
| **[HTML]** | Standalone browser HTML, local dev, no git required | `Travel-Vault_PWA/` |

### Rule 1 — Always tag your request

Start every message with either `[APK]` or `[HTML]` when asking about one specific build.

```
✅ Good:  "[APK] The share button is not working in TravelHub"
✅ Good:  "[HTML] The dashboard is showing wrong currency"
✅ Good:  "[APK+HTML] I want this feature in both builds" ← only when you explicitly want both
❌ Bad:   "The share button is not working" ← ambiguous — which build?
```

---

## WHAT EACH TAG MEANS FOR CLAUDE

### When you write [APK]:

Claude will ONLY touch files in:
```
Travel-Vault_Android/
  Travel_app/src/          ← TravelHub source
  Personal_vault/src/      ← PersonalVault source
```
Claude will NOT touch anything in `Travel-Vault_PWA/`.
Claude will commit + push to git when done (triggers GitHub Actions build).

### When you write [HTML]:

Claude will ONLY touch files in:
```
Travel-Vault_PWA/
  app-a-family-hub/        ← Family Hub HTML
  app-b-private-vault/     ← Private Vault HTML
  shared/                  ← shared HTML modules
```
Claude will NOT touch anything in `Travel-Vault_Android/`.
Claude will NOT commit/push unless you say "push to git" or a benchmark is reached (see below).

### When you write [APK+HTML]:

Claude will explicitly state which files it will touch in BOTH builds before making changes.
You can review and approve before it proceeds.

---

## [APK] BUILD — HOW IT WORKS

**You never build locally. You push to git → GitHub Actions builds it.**

1. Make code changes in `Travel-Vault_Android/Travel_app/src/` or `Personal_vault/src/`
2. Bump `VERSION` file (e.g. `5.6.2` → `5.6.3`)
3. `git add`, `git commit`, `git push origin master`
4. GitHub Actions fires automatically (only for files under `Travel-Vault_Android/**`)
5. ~5 minutes later: signed APK available in Actions → Artifacts tab
6. Download, install, test

**What triggers a build:**
- Any file under `Travel-Vault_Android/Travel_app/**`
- Any file under `Travel-Vault_Android/Personal_vault/**`
- Changes to `.github/workflows/build-travel.yml` or `build-vault.yml`
- Manual trigger from GitHub Actions tab

**What does NOT trigger a build:**
- Any file under `Travel-Vault_PWA/**` ← intentionally excluded
- Session notes, docs, README files

---

## [HTML] BUILD — HOW IT WORKS

**No build tool. No Capacitor. No Android SDK. Just files.**

### Running locally

Option A — Python (simplest, already on Windows):
```
cd "Travel-Vault_PWA/app-a-family-hub"
python -m http.server 8080
# Open: http://localhost:8080
```

Option B — VS Code Live Server extension:
- Right-click `index.html` → "Open with Live Server"

Option C — Node (if installed):
```
npx serve Travel-Vault_PWA/app-a-family-hub
```

> ⚠️ You CANNOT just double-click `index.html` in Windows Explorer.
> ES modules (`import`/`export`) do not work on the `file://` protocol.
> You must use a local HTTP server (any of the above — takes 2 seconds).

### Testing workflow (no git needed)
1. Edit files in `Travel-Vault_PWA/`
2. Refresh browser → see changes instantly
3. No build step, no compile, no APK signing
4. Changes are only on your local disk

### VERSION tracking for HTML
Version file: `Travel-Vault_PWA/HTML_VERSION`
Starting version: `3.5.9`
Format: `MAJOR.MINOR.PATCH` — same as APK but completely independent numbering.

---

## [HTML] GIT PUSH — BENCHMARK RULES

HTML changes are NOT pushed to git on every edit. Push only when a benchmark is reached.

### Push benchmarks (push to git when ANY of these are true):
1. **Feature complete** — a full feature works end-to-end (not mid-development)
2. **Both apps stable** — both Family Hub AND Private Vault tested and working for the feature
3. **Version bump** — HTML_VERSION file has been updated to reflect the new state
4. **Before a session break** — before ending a work session so the state is saved
5. **Milestone reached** — e.g. "Phase 1 complete", "OAuth removed", "Export working"

### Do NOT push to git when:
- Mid-feature (half-done code)
- Untested change
- Debugging attempt that might not work
- Minor CSS tweak alone (wait and bundle with next feature push)

### How to ask Claude to push HTML:
```
"[HTML] Push to git — phase 1 complete, both apps working"
```
Claude will verify HTML_VERSION is bumped, then commit and push.

---

## FILE PATH CHEAT SHEET

### APK — TravelHub
| What | Path |
|---|---|
| Main HTML | `Travel-Vault_Android/Travel_app/src/index.html` |
| Dashboard | `Travel-Vault_Android/Travel_app/src/js/screens/dashboard.js` |
| Settings | `Travel-Vault_Android/Travel_app/src/js/screens/settings.js` |
| Drive/Storage | `Travel-Vault_Android/Travel_app/src/shared/drive.js` |
| Sync Manager | `Travel-Vault_Android/Travel_app/src/shared/sync-manager.js` |
| Version | `Travel-Vault_Android/Travel_app/VERSION` |
| CSS | `Travel-Vault_Android/Travel_app/src/css/app.css` |

### APK — PersonalVault
| What | Path |
|---|---|
| Main HTML | `Travel-Vault_Android/Personal_vault/src/index.html` |
| Dashboard | `Travel-Vault_Android/Personal_vault/src/js/screens/dashboard.js` |
| Settings | `Travel-Vault_Android/Personal_vault/src/js/screens/settings.js` |
| Drive/Storage | `Travel-Vault_Android/Personal_vault/src/shared/drive.js` |
| Sync Manager | `Travel-Vault_Android/Personal_vault/src/shared/sync-manager.js` |
| Version | `Travel-Vault_Android/Personal_vault/VERSION` |

### HTML — Family Hub
| What | Path |
|---|---|
| Main HTML | `Travel-Vault_PWA/app-a-family-hub/index.html` |
| Dashboard | `Travel-Vault_PWA/app-a-family-hub/js/screens/dashboard.js` |
| Settings | `Travel-Vault_PWA/app-a-family-hub/js/screens/settings.js` |
| CSS | `Travel-Vault_PWA/app-a-family-hub/css/app.css` |
| Shared Drive | `Travel-Vault_PWA/shared/drive.js` |
| Shared Sync | `Travel-Vault_PWA/shared/sync-manager.js` |
| Version | `Travel-Vault_PWA/HTML_VERSION` |

### HTML — Private Vault
| What | Path |
|---|---|
| Main HTML | `Travel-Vault_PWA/app-b-private-vault/index.html` |
| Dashboard | `Travel-Vault_PWA/app-b-private-vault/js/screens/dashboard.js` |
| Settings | `Travel-Vault_PWA/app-b-private-vault/js/screens/settings.js` |
| CSS | `Travel-Vault_PWA/app-b-private-vault/css/app.css` |
| Shared Drive | `Travel-Vault_PWA/shared/drive.js` ← same shared folder as Family Hub |
| Shared Sync | `Travel-Vault_PWA/shared/sync-manager.js` |

---

## HOW SHARED FILES WORK (CRITICAL UNDERSTANDING)

### APK shared files — EACH APP HAS ITS OWN COPY
```
Travel-Vault_Android/Travel_app/src/shared/drive.js      ← TravelHub copy
Travel-Vault_Android/Personal_vault/src/shared/drive.js  ← PersonalVault copy
```
They happen to be identical right now but are INDEPENDENT files.
Changing one does NOT change the other — must be updated separately.

### HTML shared files — ONE COPY SHARED BY BOTH HTML APPS
```
Travel-Vault_PWA/shared/drive.js     ← used by BOTH Family Hub AND Private Vault
Travel-Vault_PWA/shared/sync-manager.js
Travel-Vault_PWA/shared/db.js
... etc
```
Changing `Travel-Vault_PWA/shared/drive.js` affects BOTH HTML apps simultaneously.

### Cross-build: APK shared ≠ HTML shared
```
Travel-Vault_Android/Travel_app/src/shared/drive.js   ← APK (Capacitor Filesystem)
Travel-Vault_PWA/shared/drive.js                       ← HTML (Google Drive / browser File API)
```
These are COMPLETELY DIFFERENT implementations. They share the same filename but do different things.
Changing the APK drive.js NEVER affects the HTML drive.js and vice versa.

---

## WHAT FEATURES EXIST WHERE (CURRENT STATE)

| Feature | APK | HTML |
|---|---|---|
| IndexedDB local storage | ✅ | ✅ |
| Login / Auth | ❌ No login needed | ⚠️ Google OAuth (to be removed) |
| Cloud sync | ❌ Local only | ⚠️ Google Drive (to be removed) |
| XLSX export | ✅ Saves to Documents/exports/ | ⚠️ Needs local server for XLSX lib |
| Share image (native) | ✅ Capacitor Share | 🔲 navigator.share (browser) |
| Save image | ✅ Capacitor Filesystem | 🔲 browser download |
| Sync folder (auto-write) | ✅ | 🔲 Not possible silently in browser |
| Encrypted backup | ✅ backup-engine.js | 🔲 Not yet ported |
| Sync folder settings UI | ✅ | 🔲 Replace with Export/Import JSON |
| FAB z-index fix | ✅ | 🔲 Needs port |
| PIN lock (Vault) | ✅ | ✅ |
| Service worker offline | ✅ (APK handles offline natively) | ✅ sw.js (optional) |
| Version display | ✅ injected by CI | ⚠️ Manual in index.html |

Legend: ✅ Done | ⚠️ Exists but wrong/old | 🔲 Not yet built | ❌ Not applicable

---

## VERSION NUMBERS — SEPARATE TRACKS

| Build | Current version | File |
|---|---|---|
| TravelHub APK | `5.6.2` | `Travel-Vault_Android/Travel_app/VERSION` |
| PersonalVault APK | `5.6.2` | `Travel-Vault_Android/Personal_vault/VERSION` |
| HTML (both apps) | `3.5.9` | `Travel-Vault_PWA/HTML_VERSION` |

APK and HTML version numbers are COMPLETELY INDEPENDENT.
APK at v5.6.x does NOT mean HTML is at v5.6.x.
Do not try to synchronize version numbers between the two builds.

---

## QUICK DECISION TREE

```
I have a bug / feature request
         │
         ▼
Is it about the Android app?     → [APK]  → touches Travel-Vault_Android/ → push → CI builds APK
Is it about the browser HTML?    → [HTML] → touches Travel-Vault_PWA/     → local test → push at benchmark
Is it about both?                → [APK+HTML] → state explicitly, approve before changes
Not sure which?                  → Ask: "which build should this apply to?"
```

---

_Last updated: 2026-05-01_
_APK at: v5.6.2 | HTML at: v3.5.9_
