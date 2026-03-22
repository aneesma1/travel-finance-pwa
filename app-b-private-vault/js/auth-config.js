
// ─── app-b-private-vault/js/auth-config.js ──────────────────────────────────
// Google OAuth client configuration for App B
//
// ── SETUP (one-time only) ────────────────────────────────────────────────────
// Same Google Cloud project as App A -- just add App B redirect URIs too:
//   Authorised redirect URIs to add:
//      http://localhost:8080/app-b-private-vault/
//      http://localhost:5500/app-b-private-vault/
//      http://localhost:3000/app-b-private-vault/
//      http://127.0.0.1:8080/app-b-private-vault/
//      http://127.0.0.1:5500/app-b-private-vault/
//
// ── ONLY THING TO EDIT ───────────────────────────────────────────────────────
// Paste the same Client ID as App A below. That's it.
//
// ── MOVING THE FOLDER ────────────────────────────────────────────────────────
// Move travel-finance-pwa/ anywhere -- relative paths and auto-detected
// REDIRECT_URI will keep working without any changes.
// ─────────────────────────────────────────────────────────────────────────────

export const CLIENT_ID = '36787254386-n0ee36r22mhr3g5620q10ob4phe6i59o.apps.googleusercontent.com';

function detectRedirectUri() {
  const loc = window.location;
  const pathParts = loc.pathname.split('/');
  const appIndex  = pathParts.findIndex(p => p === 'app-b-private-vault');
  if (appIndex !== -1) {
    const basePath = pathParts.slice(0, appIndex + 1).join('/') + '/';
    return loc.origin + basePath;
  }
  return loc.origin + '/app-b-private-vault/';
}

export const REDIRECT_URI = detectRedirectUri();
