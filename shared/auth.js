// v2.2 — 2026-03-18
// ─── shared/auth.js ──────────────────────────────────────────────────────────
// Google OAuth 2.0 PKCE flow — no client secret, browser-safe
// Used by both App A and App B

'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
// CLIENT_ID is set per-app in the app's own auth-config.js
// Scopes needed: drive.file + calendar.events
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'profile',
  'email'
].join(' ');

const TOKEN_KEY   = 'gauth_token';
const EXPIRY_KEY  = 'gauth_expiry';
const USER_KEY    = 'gauth_user';
const PKCE_KEY    = 'gauth_pkce_verifier';

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64URLEncode(hashed);
}

function generateRandomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// ── Token storage ─────────────────────────────────────────────────────────────
export function saveToken(tokenData) {
  localStorage.setItem(TOKEN_KEY, tokenData.access_token);
  const expiry = Date.now() + (tokenData.expires_in * 1000);
  localStorage.setItem(EXPIRY_KEY, String(expiry));
}

export function getToken() {
  const token  = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY));
  if (!token || !expiry) return null;
  // Return null if expired (with 60s buffer)
  if (Date.now() > expiry - 60000) return null;
  return token;
}

export function saveUser(profile) {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch { return null; }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PKCE_KEY);
}

export function isAuthenticated() {
  return getToken() !== null;
}

// ── OAuth PKCE flow ───────────────────────────────────────────────────────────
export async function startOAuthFlow(clientId, redirectUri) {
  const verifier  = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);

  // Store verifier — use localStorage so it survives PWA session boundaries
  localStorage.setItem(PKCE_KEY, verifier);

  const params = new URLSearchParams({
    client_id:             clientId,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 SCOPES,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    access_type:           'offline',
    prompt:                'consent'
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleOAuthCallback(clientId, redirectUri) {
  const params   = new URLSearchParams(window.location.search);
  const code     = params.get('code');
  const error    = params.get('error');

  if (error) throw new Error(`OAuth error: ${error}`);
  if (!code)  return null; // Not a callback

  const verifier = localStorage.getItem(PKCE_KEY);
  if (!verifier) throw new Error('PKCE verifier missing. Please sign in again.');

  // Exchange code for tokens
  // NOTE: PKCE public client — no client_secret needed
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier: verifier
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error_description || 'Token exchange failed');
  }

  const tokenData = await response.json();
  saveToken(tokenData);
  sessionStorage.removeItem(PKCE_KEY);

  // Fetch user profile
  await fetchAndSaveProfile();

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);
  return tokenData;
}

async function fetchAndSaveProfile() {
  const token = getToken();
  if (!token) return;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const profile = await res.json();
    saveUser(profile);
  }
}

// ── Silent token refresh ──────────────────────────────────────────────────────
export async function refreshTokenIfNeeded(clientId) {
  // If token still valid, no action needed
  if (getToken()) return true;

  // Attempt silent refresh via hidden iframe
  // Google will re-issue a token if the user has an active session
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  `${window.location.origin}${window.location.pathname}`,
      response_type: 'token',
      scope:         SCOPES,
      prompt:        'none'
    });

    const timeout = setTimeout(() => {
      document.body.removeChild(iframe);
      resolve(false);
    }, 5000);

    iframe.onload = () => {
      clearTimeout(timeout);
      document.body.removeChild(iframe);
      // If silent refresh worked, token will be in URL fragment
      // (handled by the iframe's own load — for full refresh, redirect to login)
      resolve(false); // Trigger full re-login
    };

    document.body.appendChild(iframe);
  });
}

// ── Authenticated fetch wrapper ───────────────────────────────────────────────
export async function authFetch(url, options = {}, clientId) {
  let token = getToken();

  if (!token) {
    // Try refresh first
    const refreshed = clientId ? await refreshTokenIfNeeded(clientId) : false;
    token = getToken();
    if (!token) {
      // Dispatch global event for app to handle
      window.dispatchEvent(new CustomEvent('auth:required'));
      throw new Error('Authentication required');
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    clearAuth();
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('Session expired. Please sign in again.');
  }

  return res;
}
