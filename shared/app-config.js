
// ─── shared/app-config.js ────────────────────────────────────────────────────
// Stores app configuration (PIN hash, settings) in Drive app_config.json
// Survives browser cache clear -- config restored on next sign-in

'use strict';

import { getToken } from './auth.js';
import { isOnline } from './utils.js';

const CONFIG_KEY = 'drive_app_config_id';

// ── Read config from Drive ────────────────────────────────────────────────────
export async function readAppConfig() {
  const fileId = localStorage.getItem(CONFIG_KEY);
  if (!fileId || !isOnline()) return null;
  try {
    const token = getToken();
    if (!token) return null;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Write config to Drive ─────────────────────────────────────────────────────
export async function writeAppConfig(config) {
  if (!isOnline()) return;
  const token = getToken();
  if (!token) return;

  let fileId = localStorage.getItem(CONFIG_KEY);

  if (!fileId) {
    // Find app folder first
    const folderRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='TravelFinanceApp'+and+trashed=false+and+mimeType='application/vnd.google-apps.folder'&fields=files(id)`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    ).catch(() => null);
    if (!folderRes?.ok) return;
    const { files } = await folderRes.json();
    if (!files?.length) return;
    const folderId = files[0].id;

    // Create app_config.json in app folder
    const meta = JSON.stringify({ name: 'app_config.json', parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(config)], { type: 'application/json' }));
    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
    ).catch(() => null);
    if (!createRes?.ok) return;
    const { id } = await createRes.json();
    localStorage.setItem(CONFIG_KEY, id);
    return;
  }

  // Update existing
  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }
  ).catch(() => {});
}

// ── Sync PIN hash to Drive ────────────────────────────────────────────────────
export async function syncPinHashToDrive() {
  const pinHash = localStorage.getItem('vault_pin_hash');
  const pinSalt = localStorage.getItem('vault_pin_salt');
  if (!pinHash || !pinSalt) return;

  const existing = await readAppConfig() || {};
  await writeAppConfig({
    ...existing,
    pinHash,
    pinSalt,
    lockTimeout: localStorage.getItem('vault_lock_timeout_ms') || '300000',
    updatedAt: new Date().toISOString(),
  });
}

// ── Restore PIN hash from Drive (after cache clear) ───────────────────────────
export async function restorePinHashFromDrive() {
  const config = await readAppConfig();
  if (!config?.pinHash || !config?.pinSalt) return false;
  localStorage.setItem('vault_pin_hash', config.pinHash);
  localStorage.setItem('vault_pin_salt', config.pinSalt);
  if (config.lockTimeout) localStorage.setItem('vault_lock_timeout_ms', config.lockTimeout);
  return true;
}
