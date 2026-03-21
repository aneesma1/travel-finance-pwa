// v3.2.1 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── shared/auth.js ──────────────────────────────────────────────────────────
// Google OAuth 2.0 — Implicit flow (token response)
// No client secret needed. Token returned directly in URL hash.
// Safe for public browser PWAs with Web Application client type.

'use strict';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'profile',
  'email'
].join(' ');

const TOKEN_KEY  = 'gauth_token';
const EXPIRY_KEY = 'gauth_expiry';
const USER_KEY   = 'gauth_user';
const STATE_KEY  = 'gauth_state';

// ── Token storage ─────────────────────────────────────────────────────────────
export function saveToken(tokenData) {
  localStorage.setItem(TOKEN_KEY, tokenData.access_token);
  const expiry = Date.now() + (Number(tokenData.expires_in) * 1000);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
}

export function getToken() {
  const token  = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY));
  if (!token || !expiry) return null;
  if (Date.now() > expiry - 60000) return null; // 60s buffer
  return token;
}

export function saveUser(profile) {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch { return null; }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(STATE_KEY);
}

export function isAuthenticated() {
  return getToken() !== null;
}

// ── Start OAuth implicit flow ─────────────────────────────────────────────────
export async function startOAuthFlow(clientId, redirectUri) {
  // Generate random state to prevent CSRF
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'token',   // implicit — token returned in hash, no secret needed
    scope:         SCOPES,
    state,
    prompt:        'consent',
    include_granted_scopes: 'true'
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ── Handle OAuth callback (reads token from URL hash) ─────────────────────────
export async function handleOAuthCallback(clientId, redirectUri) {
  // Implicit flow returns token in URL hash (#access_token=...&expires_in=...)
  const hash   = window.location.hash.slice(1); // remove leading #
  const params = new URLSearchParams(hash);

  const accessToken = params.get('access_token');
  const expiresIn   = params.get('expires_in');
  const error       = params.get('error');
  const state       = params.get('state');

  // Also check query string for error (some flows put error there)
  const queryParams = new URLSearchParams(window.location.search);
  const queryError  = queryParams.get('error');

  if (error || queryError) {
    throw new Error(`OAuth error: ${error || queryError}`);
  }

  if (!accessToken) return null; // Not a callback

  // Validate state
  const savedState = localStorage.getItem(STATE_KEY);
  if (savedState && state && state !== savedState) {
    throw new Error('OAuth state mismatch — possible CSRF attack');
  }

  // Save token
  saveToken({ access_token: accessToken, expires_in: expiresIn || 3600 });
  localStorage.removeItem(STATE_KEY);

  // Fetch user profile
  await fetchAndSaveProfile();

  // Clean URL — remove hash
  window.history.replaceState({}, '', window.location.pathname);
  return { access_token: accessToken };
}

// ── Fetch user profile ────────────────────────────────────────────────────────
async function fetchAndSaveProfile() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) saveUser(await res.json());
  } catch { /* non-blocking */ }
}

// ── Authenticated fetch wrapper ───────────────────────────────────────────────
export async function authFetch(url, options = {}, clientId) {
  let token = getToken();

  if (!token) {
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('Authentication required');
  }

  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` }
  });

  if (res.status === 401) {
    clearAuth();
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('Session expired. Please sign in again.');
  }

  return res;
}

// ── Compatibility exports (used by index.html) ────────────────────────────────
export async function refreshTokenIfNeeded() { return false; }
