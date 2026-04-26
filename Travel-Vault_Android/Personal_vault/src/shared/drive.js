// v5.5.5 — 2026-04-26 — Fixed Directory/Encoding enum crash (use string literals)

// ─── shared/drive.js ─────────────────────────────────────────────────────────
// Device Storage Utilities (formerly Google Drive wrapper — Drive removed in Blueprint V2)
// Active exports:
//   downloadLocalBackup()  — manual JSON backup to Documents/<App>/exports/
//   saveXLSXToExports()    — save XLSX workbook to Documents/<App>/exports/
//   saveFileToExports()    — save any text/binary file to Documents/<App>/exports/
//   restoreFromLocalFile() — restore IndexedDB from a picked .json file
//   timestampSuffix()      — DD-MMM-YYYY_HH-MM_AM string for filenames

'use strict';

import { setCachedTravelData, setCachedFinanceData } from './db.js';

// ── Manual JSON backup to device ─────────────────────────────────────────────
// Saves a plain-text JSON snapshot to Documents/<AppFolder>/exports/.
// Returns the saved path string for display in toasts.
export async function downloadLocalBackup(appName, data) {
  const ts         = timestampSuffix();
  const appFolder  = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const label      = appName === 'travel' ? 'TravelHub' : 'Vault';
  const exportDir  = `${appFolder}/exports`;
  const filename   = `${label}_Backup_${ts}.json`;
  const jsonContent = JSON.stringify(data, null, 2);

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
    try {
      const { Filesystem } = window.Capacitor.Plugins;

      await Filesystem.mkdir({ path: exportDir, directory: 'DOCUMENTS', recursive: true }).catch(() => {});

      await Filesystem.writeFile({
        path:      `${exportDir}/${filename}`,
        data:      jsonContent,
        directory: 'DOCUMENTS',
        encoding:  'utf8',
      });

      return `Documents/${exportDir}/${filename}`;
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

// ── Save XLSX workbook to Documents/<AppFolder>/exports/ ─────────────────────
// wb           — SheetJS workbook object
// filenameBase — base name without timestamp or extension
// Returns the saved path string.
export async function saveXLSXToExports(appName, wb, filenameBase) {
  const appFolder = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const exportDir = `${appFolder}/exports`;
  const ts        = timestampSuffix();
  const filename  = `${filenameBase}_${ts}.xlsx`;

  if (!window.XLSX) throw new Error('XLSX library not loaded');

  const buf    = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const base64 = _arrayBufferToBase64(buf);

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
    const { Filesystem } = window.Capacitor.Plugins;
    await Filesystem.mkdir({ path: exportDir, directory: 'DOCUMENTS', recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path: `${exportDir}/${filename}`, data: base64, directory: 'DOCUMENTS' });
    return `Documents/${exportDir}/${filename}`;
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

// ── Save any file (text or base64) to Documents/<AppFolder>/exports/ ─────────
// content: string (text) or base64 string
// encoding: 'utf8' for text, omit for base64 binary
// Returns path string for toast display.
export async function saveFileToExports(appName, filename, content, encoding) {
  const appFolder = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const exportDir = `${appFolder}/exports`;

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
    const { Filesystem } = window.Capacitor.Plugins;
    await Filesystem.mkdir({ path: exportDir, directory: 'DOCUMENTS', recursive: true }).catch(() => {});
    const writeOpts = { path: `${exportDir}/${filename}`, data: content, directory: 'DOCUMENTS' };
    if (encoding) writeOpts.encoding = encoding;
    await Filesystem.writeFile(writeOpts);
    return `Documents/${exportDir}/${filename}`;
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

// ── Internal helper ───────────────────────────────────────────────────────────
function _arrayBufferToBase64(buffer) {
  let bin = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
