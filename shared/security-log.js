// v3.2.2 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── shared/security-log.js ─────────────────────────────────────────────────
// Session registry and activity log stored on Google Drive
// sessions.json + activity_log.json shared between both apps

'use strict';

import { getToken, getUser, isAuthenticated } from './auth.js';
import { isOnline, uuidv4 } from './utils.js';

const SESSION_FILE_KEY  = 'drive_sessions_file_id';
const ACTIVITY_FILE_KEY = 'drive_activity_log_file_id';
const SESSION_ID_KEY    = 'current_session_id';
const APP_FOLDER_KEY    = 'drive_app_folder_id';

// ── Device fingerprint ────────────────────────────────────────────────────────
function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent.slice(0, 120),
    platform:  navigator.platform,
    language:  navigator.language,
    screen:    `${screen.width}x${screen.height}`,
    timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function getDeviceLabel() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua))  return ua.match(/\(([^)]+)\)/)?.[1]?.split(';')[0] || 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
  if (/Windows/i.test(ua))  return 'Windows PC';
  if (/Mac/i.test(ua))      return 'Mac';
  return 'Unknown device';
}

// ── Drive file helpers ────────────────────────────────────────────────────────
async function readDriveFile(fileKey) {
  const fileId = localStorage.getItem(fileKey);
  if (!fileId || !isOnline()) return null;
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function writeDriveFile(fileKey, fileName, data) {
  if (!isOnline()) return;
  const token = getToken();
  if (!token) return;
  const body = JSON.stringify(data);
  let fileId = localStorage.getItem(fileKey);
  try {
    if (fileId) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
    } else {
      const folderId = localStorage.getItem(APP_FOLDER_KEY);
      if (!folderId) return;
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
      form.append('file', new Blob([body], { type: 'application/json' }));
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
      if (res.ok) {
        const { id } = await res.json();
        localStorage.setItem(fileKey, id);
      }
    }
  } catch { /* non-blocking */ }
}

// ── Session registry ──────────────────────────────────────────────────────────
export async function registerSession(appName) {
  const user = getUser();
  if (!user?.email) return;
  const sessionId = uuidv4();
  localStorage.setItem(SESSION_ID_KEY, sessionId);

  const sessions = (await readDriveFile(SESSION_FILE_KEY)) || { sessions: [] };
  const session = {
    id:          sessionId,
    userEmail:   user.email,
    userName:    user.name || '',
    device:      getDeviceLabel(),
    deviceInfo:  getDeviceInfo(),
    app:         appName,
    signInTime:  new Date().toISOString(),
    lastActive:  new Date().toISOString(),
    status:      'active',
  };
  sessions.sessions.push(session);
  // Keep last 50 sessions only
  if (sessions.sessions.length > 50) sessions.sessions = sessions.sessions.slice(-50);
  await writeDriveFile(SESSION_FILE_KEY, 'sessions.json', sessions);
  logActivity(appName, 'SIGN_IN', 'Successful sign-in', 'none');
  return sessionId;
}

export async function updateSessionHeartbeat() {
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId || !isOnline()) return;
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return;
  const session = sessions.sessions.find(s => s.id === sessionId);
  if (session) {
    session.lastActive = new Date().toISOString();
    await writeDriveFile(SESSION_FILE_KEY, 'sessions.json', sessions);
  }
}

export async function endSession() {
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) return;
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return;
  const session = sessions.sessions.find(s => s.id === sessionId);
  if (session) {
    session.status    = 'ended';
    session.endedAt   = new Date().toISOString();
    await writeDriveFile(SESSION_FILE_KEY, 'sessions.json', sessions);
  }
  localStorage.removeItem(SESSION_ID_KEY);
}

export async function getActiveSessions() {
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return [];
  // Active = last heartbeat within 15 minutes
  const cutoff = Date.now() - 15 * 60 * 1000;
  return (sessions.sessions || []).filter(s =>
    s.status === 'active' && new Date(s.lastActive).getTime() > cutoff
  );
}

export async function revokeSession(sessionId) {
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return;
  const session = sessions.sessions.find(s => s.id === sessionId);
  if (session) {
    session.status   = 'revoked';
    session.revokedAt = new Date().toISOString();
    await writeDriveFile(SESSION_FILE_KEY, 'sessions.json', sessions);
  }
}

export async function revokeAllSessions() {
  const myId    = localStorage.getItem(SESSION_ID_KEY);
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return;
  sessions.sessions.forEach(s => {
    if (s.id !== myId) {
      s.status    = 'revoked';
      s.revokedAt = new Date().toISOString();
    }
  });
  await writeDriveFile(SESSION_FILE_KEY, 'sessions.json', sessions);
}

// ── Activity log ──────────────────────────────────────────────────────────────
const RISK_LEVELS = {
  SIGN_IN: 'none', SIGN_OUT: 'none', PIN_SUCCESS: 'none',
  PIN_FAIL: 'low', EXPORT: 'low', BACKUP: 'low',
  PIN_LOCKOUT: 'medium', DELETE: 'medium', RESTORE: 'medium', SETTINGS_CHANGE: 'low',
  SIGN_IN_BLOCKED: 'high', DATA_RESTORE: 'high', SUSPICIOUS_DROP: 'high',
};

export async function logActivity(appName, action, detail = '', riskOverride = null) {
  const user = getUser();
  const entry = {
    id:        uuidv4(),
    time:      new Date().toISOString(),
    userEmail: user?.email || 'unknown',
    device:    getDeviceLabel(),
    app:       appName,
    action,
    detail,
    risk:      riskOverride ?? RISK_LEVELS[action] ?? 'none',
  };

  // Store in localStorage for instant access
  const local = JSON.parse(localStorage.getItem('recent_activity') || '[]');
  local.unshift(entry);
  localStorage.setItem('recent_activity', JSON.stringify(local.slice(0, 20)));

  // Write to Drive (non-blocking)
  if (isOnline()) {
    writeDriveActivity(entry).catch(() => {});
  }
}

async function writeDriveActivity(entry) {
  const log = (await readDriveFile(ACTIVITY_FILE_KEY)) || { log: [] };
  log.log.unshift(entry);
  // Keep last 500 entries
  if (log.log.length > 500) log.log = log.log.slice(0, 500);
  await writeDriveFile(ACTIVITY_FILE_KEY, 'activity_log.json', log);
}

export async function getActivityLog(limit = 50) {
  const log = await readDriveFile(ACTIVITY_FILE_KEY);
  return (log?.log || []).slice(0, limit);
}

// ── Check if current session has been revoked ─────────────────────────────────
export async function checkRevocation() {
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) return false;
  const sessions = await readDriveFile(SESSION_FILE_KEY);
  if (!sessions) return false;
  const session = sessions.sessions.find(s => s.id === sessionId);
  return session?.status === 'revoked';
}

// ── High-risk event check for banner on login ─────────────────────────────────
export async function getUnseenHighRiskEvents() {
  const lastSeen = Number(localStorage.getItem('last_security_seen') || 0);
  const log = await readDriveFile(ACTIVITY_FILE_KEY);
  if (!log) return [];
  const highRisk = (log.log || []).filter(e =>
    e.risk === 'high' && new Date(e.time).getTime() > lastSeen
  );
  if (highRisk.length > 0) {
    localStorage.setItem('last_security_seen', String(Date.now()));
  }
  return highRisk;
}

// Heartbeat every 5 minutes while app is open
export function startHeartbeat() {
  setInterval(() => updateSessionHeartbeat().catch(() => {}), 5 * 60 * 1000);
}
