// v3.5.3 — 2026-03-22

// ─── app-b-private-vault/js/app-config.js ───────────────────────────────────
// app_config.json on Drive -- stores PIN hash + salt + lock timeout
// Survives browser cache clear. Restored automatically on sign-in.

'use strict';

import { getToken } from '../../shared/auth.js';
import { isOnline } from '../../shared/utils.js';

const CONFIG_KEY = 'drive_app_config_id';

// ── Save config to Drive ──────────────────────────────────────────────────────
export async function saveConfigToDrive(config) {
  if (!isOnline()) return;
  const token = getToken();
  if (!token) return;

  try {
    const fileId = localStorage.getItem(CONFIG_KEY);
    const body = JSON.stringify({ ...config, updatedAt: new Date().toISOString() });

    if (fileId) {
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body }
      );
    } else {
      // Create file in app folder
      const folderId = localStorage.getItem('drive_app_folder_id');
      if (!folderId) return;
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: 'app_config.json', parents: [folderId] })], { type: 'application/json' }));
      form.append('file', new Blob([body], { type: 'application/json' }));
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
      );
      if (res.ok) {
        const { id } = await res.json();
        localStorage.setItem(CONFIG_KEY, id);
      }
    }
  } catch { /* non-blocking */ }
}

// ── Restore config from Drive ─────────────────────────────────────────────────
export async function restoreConfigFromDrive() {
  const token = getToken();
  if (!token || !isOnline()) return null;

  try {
    let fileId = localStorage.getItem(CONFIG_KEY);

    if (!fileId) {
      // Search for app_config.json in Drive
      const folderId = localStorage.getItem('drive_app_folder_id');
      if (!folderId) return null;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='app_config.json'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!searchRes.ok) return null;
      const { files } = await searchRes.json();
      if (!files?.length) return null;
      fileId = files[0].id;
      localStorage.setItem(CONFIG_KEY, fileId);
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Sync PIN hash to Drive after any PIN change ───────────────────────────────
export async function syncPinToDrive() {
  const pinHash = localStorage.getItem('vault_pin_hash');
  const pinSalt = localStorage.getItem('vault_pin_salt');
  const lockTimeout = localStorage.getItem('vault_lock_timeout_ms');
  if (!pinHash) return;
  await saveConfigToDrive({ pinHash, pinSalt, lockTimeout });
}

// ── Restore PIN from Drive (call after cache clear) ───────────────────────────
export async function restorePinFromDrive() {
  // Only restore if local PIN is missing
  if (localStorage.getItem('vault_pin_hash')) return false;
  const config = await restoreConfigFromDrive();
  if (!config?.pinHash) return false;
  localStorage.setItem('vault_pin_hash', config.pinHash);
  if (config.pinSalt) localStorage.setItem('vault_pin_salt', config.pinSalt);
  if (config.lockTimeout) localStorage.setItem('vault_lock_timeout_ms', config.lockTimeout);
  return true;
}
