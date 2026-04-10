# Travel & Finance PWA Suite — Setup Guide

## The only thing you ever edit: your Client ID

Open both files and paste your Google Client ID:
- `app-a-family-hub/js/auth-config.js`
- `app-b-private-vault/js/auth-config.js`

Replace `YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com` with your real ID.

---

## One-time Google Cloud Setup

### Step 1 — Create project & enable APIs
1. Go to https://console.cloud.google.com/
2. Create a new project (e.g. "Travel Finance App")
3. APIs & Services → Library → enable **Google Drive API**
4. APIs & Services → Library → enable **Google Calendar API**

### Step 2 — Create OAuth credentials
1. APIs & Services → Credentials → **Create Credentials** → OAuth 2.0 Client ID
2. Application type: **Web application**
3. Name: "Travel Finance PWA"

### Step 3 — Add Authorised JavaScript Origins
Add all of these (covers common local server ports):
```
http://localhost:8080
http://localhost:5500
http://localhost:5501
http://localhost:3000
http://localhost:8000
http://127.0.0.1:8080
http://127.0.0.1:5500
http://127.0.0.1:5501
http://127.0.0.1:3000
```

### Step 4 — Add Authorised Redirect URIs
Add all of these for App A:
```
http://localhost:8080/app-a-family-hub/
http://localhost:5500/app-a-family-hub/
http://localhost:5501/app-a-family-hub/
http://localhost:3000/app-a-family-hub/
http://localhost:8000/app-a-family-hub/
http://127.0.0.1:8080/app-a-family-hub/
http://127.0.0.1:5500/app-a-family-hub/
http://127.0.0.1:5501/app-a-family-hub/
http://127.0.0.1:3000/app-a-family-hub/
```
And for App B:
```
http://localhost:8080/app-b-private-vault/
http://localhost:5500/app-b-private-vault/
http://localhost:5501/app-b-private-vault/
http://localhost:3000/app-b-private-vault/
http://localhost:8000/app-b-private-vault/
http://127.0.0.1:8080/app-b-private-vault/
http://127.0.0.1:5500/app-b-private-vault/
http://127.0.0.1:5501/app-b-private-vault/
http://127.0.0.1:3000/app-b-private-vault/
```

### Step 5 — Copy your Client ID
After creating the credential, copy the Client ID (ends in `.apps.googleusercontent.com`)
and paste it into both `auth-config.js` files.

---

## How to run the app

The app uses ES modules (`import`/`export`) which require a local HTTP server.
You cannot open `index.html` directly as a `file://` URL — it will fail.

### Option A — VS Code Live Server (easiest)
1. Install the "Live Server" extension in VS Code
2. Open the `travel-finance-pwa/` folder in VS Code
3. Right-click `app-a-family-hub/index.html` → **Open with Live Server**
4. Browser opens at `http://127.0.0.1:5500/app-a-family-hub/`

### Option B — Python (built into macOS/Linux)
```bash
cd travel-finance-pwa
python3 -m http.server 8080
```
Then open: `http://localhost:8080/app-a-family-hub/`

### Option C — Node.js serve
```bash
npm install -g serve
cd travel-finance-pwa
serve -p 8080
```
Then open: `http://localhost:8080/app-a-family-hub/`

---

## Moving the folder — what works, what doesn't

| Action | Works? | Notes |
|--------|--------|-------|
| Move `travel-finance-pwa/` to a different drive/folder | ✅ Yes | Internal relative paths stay valid |
| Rename `travel-finance-pwa/` | ✅ Yes | No paths reference the parent folder name |
| Move to USB / external drive | ✅ Yes | Run your local server from the new location |
| Rename `app-a-family-hub/` or `app-b-private-vault/` | ❌ No | Breaks the path detection in auth-config.js AND Google redirect URIs |
| Rename `shared/` | ❌ No | All `../../shared/` imports break |
| Serve from a different port | ✅ Yes | Just make sure that port is in Google Console |

**Summary: move freely, rename nothing inside the folder.**

---

## If you serve from a new port not in Google Console

1. Go to https://console.cloud.google.com/
2. APIs & Services → Credentials → your OAuth 2.0 Client ID → Edit
3. Add the new origin and redirect URI
4. Save — takes ~5 minutes to propagate

---

## Folder structure (do not rename these)
```
travel-finance-pwa/           ← can rename/move this freely
├── app-a-family-hub/         ← do NOT rename
│   ├── js/auth-config.js     ← paste Client ID here
│   └── ...
├── app-b-private-vault/      ← do NOT rename
│   ├── js/auth-config.js     ← paste Client ID here
│   └── ...
└── shared/                   ← do NOT rename
    └── ...
```
