// v3.5.5 — 2026-03-22

// ─── shared/auth.js ──────────────────────────────────────────────────────────
// Google OAuth 2.0 -- Implicit flow (token response)
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
  // Generate random state to prevent CSRF + Identify target app for native bridge
  const appTag = window.location.pathname.includes('vault') ? 'vault' : 'travel';
  const randomStr = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2,'0')).join('');
  const state = `${appTag}_${randomStr}`;
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'token',   // implicit -- token returned in hash, no secret needed
    scope:         SCOPES,
    state,
    prompt:        'consent',
    include_granted_scopes: 'true'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // 🛡️ NATIVE CAPACITOR ENHANCEMENT
  // If running in a native app, use Browser plugin and listen for Deep Link return
  if (window.Capacitor?.isNative) {
    const { Browser } = await import('@capacitor/browser');
    const { App }     = await import('@capacitor/app');

    // Remove any existing listeners to avoid duplicates
    App.removeAllListeners();

    // Listen for the app being opened via Deep Link (the redirect)
    App.addListener('appUrlOpen', async (data) => {
      const url = new URL(data.url);
      
      // If the URL has a hash (where Google puts the token), process it
      if (url.hash) {
        // Mock a window.location change so handleOAuthCallback can pick it up
        window.location.hash = url.hash;
        
        // Close the system browser tab
        await Browser.close();
        
        // Trigger the callback handler
        window.dispatchEvent(new CustomEvent('oauth:callback_received'));
      }
    });

    // Open the login page in the system browser
    await Browser.open({ url: authUrl, windowName: '_self' });
  } else {
    // Normal Web PWA flow
    window.location.href = authUrl;
  }
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
    throw new Error('OAuth state mismatch -- possible CSRF attack');
  }

  // Save token
  saveToken({ access_token: accessToken, expires_in: expiresIn || 3600 });
  localStorage.removeItem(STATE_KEY);

  // Fetch user profile
  await fetchAndSaveProfile();

  // Clean URL -- remove hash
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

// ── Authenticated fetch wrapper with Drive Gatekeeper safety ─────────────────
export async function authFetch(url, options = {}, clientId) {
  let token = getToken();

  if (!token) {
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('Authentication required');
  }

  // 🛡️ DRIVE GATEKEEPER (v4.9.1)
  // Internal safety interlock to restrict access to app-owned folders only
  if (url.includes('googleapis.com/drive') || url.includes('googleapis.com/upload/drive')) {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      validateDriveRequest(url, options);
    }
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

/**
 * Validates that a Drive write request is targeting a whitelisted app resource.
 */
function validateDriveRequest(url, options) {
  const method = (options.method || 'GET').toUpperCase();
  
  // Whitelist of app-owned IDs stored in localStorage
  const SAFE_KEYS = [
    'drive_app_folder_id', 'drive_mirror_folder_id',
    'drive_travel_file_id', 'drive_finance_file_id',
    'drive_travel_mirror_id', 'drive_finance_mirror_id',
    'drive_pending_queue_id'
  ];
  const SAFE_IDS = SAFE_KEYS.map(k => localStorage.getItem(k)).filter(id => !!id);

  // 🗃️ Check 1: File/ID updates (PATCH, DELETE)
  const fileIdMatch = url.match(/\/files\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    const targetId = fileIdMatch[1];
    if (!SAFE_IDS.includes(targetId)) {
      const detail = { action: method, targetId, url, reason: 'Unrecognized Drive ID' };
      addSecurityLog(detail).catch(() => {});
      showToast('🛑 Security Interlock: Blocked unauthorized Drive edit.', 'error', 5000);
      throw new Error(`Security Interlock: Action on unrecognised Drive ID [${targetId}] is forbidden.`);
    }
  }

  // 📁 Check 2: File creation (POST)
  if (method === 'POST') {
    let bodyStr = '';
    if (typeof options.body === 'string') bodyStr = options.body;
    
    const hasSafeParent = SAFE_IDS.some(id => bodyStr.includes(id));
    if (bodyStr && !hasSafeParent) {
      const detail = { action: 'CREATE', url, reason: 'Unsafe Parent Folder' };
      addSecurityLog(detail).catch(() => {});
      showToast('🛑 Security Interlock: Blocked file creation in external folder.', 'error', 5000);
      throw new Error('Security Interlock: Attempted to create file in a non-app folder.');
    }
  }
}

// ── Compatibility exports (used by index.html) ────────────────────────────────
export async function refreshTokenIfNeeded() { return false; }
