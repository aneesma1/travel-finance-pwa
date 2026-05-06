// v5.7.0 — 2026-05-06 — syncFolderRestore: 3-option strategy (merge/append/wipe)

// ─── shared/drive.js ─────────────────────────────────────────────────────────
// Device Storage Utilities (formerly Google Drive wrapper — Drive removed in Blueprint V2)
// Active exports:
//   hasPublicStorageAccess()  — check if MANAGE_EXTERNAL_STORAGE is granted
//   requestPublicStorage()    — open system prompt to grant All Files Access
//   syncFolderWrite(appName, data)    — write _latest.json + dated snapshot to sync_folder/
//   syncFolderRestore(appName, strategy) — restore IndexedDB from sync_folder/_latest.json (merge/append/wipe)
//   downloadLocalBackup()  — manual JSON backup to <AppFolder>/exports/
//   saveXLSXToExports()    — save XLSX workbook to <AppFolder>/exports/
//   saveFileToExports()    — save any text/binary file to <AppFolder>/exports/
//   restoreFromLocalFile() — restore IndexedDB from a picked .json file
//   timestampSuffix()      — DD-MMM-YYYY_HH-MM_AM string for filenames

'use strict';

import { getCachedTravelData, getCachedFinanceData, setCachedTravelData, setCachedFinanceData } from './db.js';
import { applyMergeStrategy } from './restore-dialog.js';

// ── Storage directory constants ───────────────────────────────────────────────
// DIR_PUBLIC  → /storage/emulated/0/  (root of external storage — visible in Files)
// DIR_PRIVATE → Android/data/<pkg>/files/Documents/  (app-private, hidden on Android 11+)
const DIR_PUBLIC  = 'EXTERNAL_STORAGE';
const DIR_PRIVATE = 'DOCUMENTS';

// ── Permission helpers ────────────────────────────────────────────────────────

// Returns true if MANAGE_EXTERNAL_STORAGE is currently granted.
export async function hasPublicStorageAccess() {
  if (!window.Capacitor?.Plugins?.Filesystem) return false;
  try {
    const result = await window.Capacitor.Plugins.Filesystem.checkPermissions();
    return result.publicStorage === 'granted';
  } catch (e) {
    return false;
  }
}

// Opens the Android "All Files Access" settings screen for this app.
// Returns true if permission is granted after the prompt.
export async function requestPublicStorage() {
  if (!window.Capacitor?.Plugins?.Filesystem) return false;
  try {
    const result = await window.Capacitor.Plugins.Filesystem.requestPermissions();
    return result.publicStorage === 'granted';
  } catch (e) {
    return false;
  }
}

// ── Internal: resolve storage base depending on permission ───────────────────
// Returns { dir, root } where root is the folder path inside dir.
//   Public:  { dir: 'EXTERNAL_STORAGE', root: 'Documents/PersonalVault' }
//   Private: { dir: 'DOCUMENTS',        root: 'PersonalVault' }
async function resolveStorageBase(appName) {
  const appFolder = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const hasAccess = await hasPublicStorageAccess();
  if (hasAccess) {
    return { dir: DIR_PUBLIC, root: `Documents/${appFolder}` };
  }
  return { dir: DIR_PRIVATE, root: appFolder };
}

// ── Sync folder — write ───────────────────────────────────────────────────────
// Writes two files to <root>/sync_folder/:
//   <AppName>_latest.json         — always current (overwritten)
//   <AppName>_YYYY-MM-DD.json     — daily snapshot (one per day, kept 30 days)
// Falls back silently to app-private if public permission not granted.
// Returns the visible folder path string or null on failure.
export async function syncFolderWrite(appName, data) {
  if (!window.Capacitor?.Plugins?.Filesystem) return null;
  const { Filesystem } = window.Capacitor.Plugins;

  try {
    const { dir, root } = await resolveStorageBase(appName);
    const syncDir       = `${root}/sync_folder`;
    const prefix        = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
    const today         = _isoDate();
    const json          = JSON.stringify(data, null, 2);

    // Ensure directory exists
    await Filesystem.mkdir({ path: syncDir, directory: dir, recursive: true }).catch(() => {});

    // 1. Overwrite _latest.json
    await Filesystem.writeFile({
      path:      `${syncDir}/${prefix}_latest.json`,
      data:      json,
      directory: dir,
      encoding:  'utf8',
    });

    // 2. Write dated snapshot (skip if today's already exists)
    const datedName = `${prefix}_${today}.json`;
    const datedPath = `${syncDir}/${datedName}`;
    let datedExists = false;
    try {
      await Filesystem.stat({ path: datedPath, directory: dir });
      datedExists = true;
    } catch (e) { /* file not found — write it */ }

    if (!datedExists) {
      await Filesystem.writeFile({
        path:      datedPath,
        data:      json,
        directory: dir,
        encoding:  'utf8',
      });
    }

    // 3. Prune snapshots older than 30 days
    try {
      const listing = await Filesystem.readdir({ path: syncDir, directory: dir });
      const files   = listing.files || [];
      const cutoff  = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      for (const f of files) {
        const fname = typeof f === 'string' ? f : f.name;
        // Match dated pattern: <prefix>_YYYY-MM-DD.json
        const m = fname.match(/^.+_(\d{4}-\d{2}-\d{2})\.json$/);
        if (!m) continue;
        const fileDate = new Date(m[1]);
        if (fileDate < cutoff) {
          await Filesystem.deleteFile({ path: `${syncDir}/${fname}`, directory: dir }).catch(() => {});
        }
      }
    } catch (e) { /* prune failure is non-critical */ }

    // Store last sync timestamp
    localStorage.setItem(`syncFolder_lastSync_${appName}`, new Date().toISOString());

    // Return human-readable path
    if (dir === DIR_PUBLIC) {
      return `/storage/emulated/0/Documents/${appName === 'travel' ? 'TravelHub' : 'PersonalVault'}/sync_folder/`;
    }
    return `Android/data/.../Documents/${appName === 'travel' ? 'TravelHub' : 'PersonalVault'}/sync_folder/`;
  } catch (err) {
    console.error('syncFolderWrite failed:', err);
    return null;
  }
}

// ── Sync folder — restore ─────────────────────────────────────────────────────
// Reads <root>/sync_folder/<AppName>_latest.json and restores IndexedDB.
// strategy: 'wipe' (default) | 'merge' | 'append'
// Returns the final saved data object on success, throws on failure.
export async function syncFolderRestore(appName, strategy = 'wipe') {
  if (!window.Capacitor?.Plugins?.Filesystem) throw new Error('Filesystem not available');
  const { Filesystem } = window.Capacitor.Plugins;

  const { dir, root } = await resolveStorageBase(appName);
  const prefix        = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const latestPath    = `${root}/sync_folder/${prefix}_latest.json`;

  const result = await Filesystem.readFile({
    path:      latestPath,
    directory: dir,
    encoding:  'utf8',
  });

  const raw          = typeof result.data === 'string' ? result.data : new TextDecoder().decode(result.data);
  const incomingData = JSON.parse(raw);

  if (!incomingData.schemaVersion) throw new Error('Invalid sync file — missing schemaVersion');

  let finalData;
  if (strategy === 'wipe') {
    finalData = incomingData;
  } else {
    const currentData = appName === 'travel'
      ? (await getCachedTravelData()  || {})
      : (await getCachedFinanceData() || {});
    finalData = applyMergeStrategy(strategy, currentData, incomingData, appName);
  }

  if (appName === 'travel') {
    await setCachedTravelData(finalData);
  } else {
    await setCachedFinanceData(finalData);
  }

  return finalData;
}

// ── Manual JSON backup to device ─────────────────────────────────────────────
// Saves a plain-text JSON snapshot to <AppFolder>/exports/.
// Returns the saved path string for display in toasts.
export async function downloadLocalBackup(appName, data) {
  const ts          = timestampSuffix();
  const label       = appName === 'travel' ? 'TravelHub' : 'Vault';
  const filename    = `${label}_Backup_${ts}.json`;
  const jsonContent = JSON.stringify(data, null, 2);

  if (window.Capacitor?.Plugins?.Filesystem) {
    try {
      const { Filesystem }  = window.Capacitor.Plugins;
      const { dir, root }   = await resolveStorageBase(appName);
      const exportDir       = `${root}/exports`;

      await Filesystem.mkdir({ path: exportDir, directory: dir, recursive: true }).catch(() => {});
      await Filesystem.writeFile({
        path:      `${exportDir}/${filename}`,
        data:      jsonContent,
        directory: dir,
        encoding:  'utf8',
      });

      return dir === DIR_PUBLIC
        ? `/storage/emulated/0/Documents/${appName === 'travel' ? 'TravelHub' : 'PersonalVault'}/exports/${filename}`
        : `Documents/${exportDir}/${filename}`;
    } catch (err) {
      console.error('Filesystem backup failed:', err);
      throw new Error('Could not save backup: ' + err.message);
    }
  }

  // Web / PWA fallback — browser download
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

// ── Save XLSX workbook to <AppFolder>/exports/ ────────────────────────────────
// wb           — SheetJS workbook object
// filenameBase — base name without timestamp or extension
// Returns the saved path string.
export async function saveXLSXToExports(appName, wb, filenameBase) {
  const ts       = timestampSuffix();
  const filename = `${filenameBase}_${ts}.xlsx`;

  if (!window.XLSX) throw new Error('XLSX library not loaded');

  const buf    = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const base64 = _arrayBufferToBase64(buf);

  if (window.Capacitor?.Plugins?.Filesystem) {
    const { Filesystem } = window.Capacitor.Plugins;
    const { dir, root }  = await resolveStorageBase(appName);
    const exportDir      = `${root}/exports`;

    await Filesystem.mkdir({ path: exportDir, directory: dir, recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path: `${exportDir}/${filename}`, data: base64, directory: dir });

    return dir === DIR_PUBLIC
      ? `/storage/emulated/0/Documents/${appName === 'travel' ? 'TravelHub' : 'PersonalVault'}/exports/${filename}`
      : `Documents/${exportDir}/${filename}`;
  }

  // Web / PWA fallback
  const blob = new Blob([new Uint8Array(buf)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

// ── Save any file (text or base64) to <AppFolder>/exports/ ───────────────────
// content: string (text) or base64 string
// encoding: 'utf8' for text, omit for base64 binary
// Returns path string for toast display.
export async function saveFileToExports(appName, filename, content, encoding) {
  if (window.Capacitor?.Plugins?.Filesystem) {
    const { Filesystem } = window.Capacitor.Plugins;
    const { dir, root }  = await resolveStorageBase(appName);
    const exportDir      = `${root}/exports`;

    await Filesystem.mkdir({ path: exportDir, directory: dir, recursive: true }).catch(() => {});
    const writeOpts = { path: `${exportDir}/${filename}`, data: content, directory: dir };
    if (encoding) writeOpts.encoding = encoding;
    await Filesystem.writeFile(writeOpts);

    return dir === DIR_PUBLIC
      ? `/storage/emulated/0/Documents/${appName === 'travel' ? 'TravelHub' : 'PersonalVault'}/exports/${filename}`
      : `Documents/${exportDir}/${filename}`;
  }

  // Web / PWA fallback — trigger browser download
  const mime = encoding === 'utf8'
    ? (filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream')
    : 'application/octet-stream';
  const blob = encoding === 'utf8'
    ? new Blob([content], { type: mime })
    : new Blob([Uint8Array.from(atob(content), c => c.charCodeAt(0))], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

// ── Restore IndexedDB from a user-picked .json backup file ───────────────────
// Validates schema, writes directly to IndexedDB (no Drive involved).
export async function restoreFromLocalFile(file, appName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.schemaVersion) throw new Error('Invalid backup file — missing schemaVersion');

        if (appName === 'travel') {
          await setCachedTravelData(data);
        } else {
          await setCachedFinanceData(data);
        }

        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ── Timestamp suffix — DD-MMM-YYYY_HH-MM_AM ──────────────────────────────────
export function timestampSuffix() {
  const now    = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day    = String(now.getDate()).padStart(2, '0');
  const month  = months[now.getMonth()];
  const year   = now.getFullYear();
  let hours    = now.getHours();
  const ampm   = hours >= 12 ? 'PM' : 'AM';
  hours        = hours % 12 || 12;
  const mins   = String(now.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year}_${String(hours).padStart(2, '0')}-${mins}_${ampm}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function _arrayBufferToBase64(buffer) {
  let bin = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _isoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
