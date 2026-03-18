// v2.2 — 2026-03-18
// ─── app-a-family-hub/js/auth-config.js ─────────────────────────────────────
// Google OAuth client configuration for App A
//
// ── SETUP (one-time only) ────────────────────────────────────────────────────
// 1. Go to https://console.cloud.google.com/
// 2. Create/select a project → Enable: Google Drive API + Google Calendar API
// 3. APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application
// 4. Authorised JavaScript origins — add ALL of these:
//      http://localhost:8080
//      http://localhost:5500
//      http://localhost:3000
//      http://127.0.0.1:8080
//      http://127.0.0.1:5500
//    (add more ports if your local server uses a different one)
// 5. Authorised redirect URIs — add ALL of these:
//      http://localhost:8080/app-a-family-hub/
//      http://localhost:5500/app-a-family-hub/
//      http://localhost:3000/app-a-family-hub/
//      http://127.0.0.1:8080/app-a-family-hub/
//      http://127.0.0.1:5500/app-a-family-hub/
// 6. Paste your Client ID below — that's the ONLY thing you ever need to change
//
// ── MOVING THE FOLDER ────────────────────────────────────────────────────────
// You can move the entire travel-finance-pwa/ folder anywhere on your computer.
// Internal relative paths (../../shared/) always work as long as the folder
// structure inside travel-finance-pwa/ is not changed.
// The REDIRECT_URI below is auto-detected from window.location — no hardcoding.
// ─────────────────────────────────────────────────────────────────────────────

export const CLIENT_ID = '36787254386-o0pikuppj1ebcceh4qrjofu3fvqch6bo.apps.googleusercontent.com';

// Auto-detects current origin + path — works regardless of where folder is moved
// e.g. http://localhost:8080/app-a-family-hub/
//   or http://127.0.0.1:5500/app-a-family-hub/
//   or https://yoursite.com/app-a-family-hub/
function detectRedirectUri() {
  const loc = window.location;
  // Find the app folder in the current path
  const pathParts = loc.pathname.split('/');
  const appIndex  = pathParts.findIndex(p => p === 'app-a-family-hub');
  if (appIndex !== -1) {
    // Reconstruct path up to and including the app folder
    const basePath = pathParts.slice(0, appIndex + 1).join('/') + '/';
    return loc.origin + basePath;
  }
  // Fallback: use origin + expected path
  return loc.origin + '/app-a-family-hub/';
}

export const REDIRECT_URI = detectRedirectUri();
