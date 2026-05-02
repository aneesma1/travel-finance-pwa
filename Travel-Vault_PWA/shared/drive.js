// v4.0.0 — 2026-05-01 — Local-first rewrite: Google Drive removed
// ─── shared/drive.js ─────────────────────────────────────────────────────────
// Browser file utilities (replaces Google Drive API wrapper)
// All storage is local: IndexedDB (runtime) + browser file download (export)
//
// Exports:
//   downloadLocalBackup(appName, data)          — download JSON backup to browser Downloads
//   saveFileToExports(appName, filename, text)  — download any text/JSON file
//   saveXLSXToExports(appName, filename, wb)    — download XLSX workbook
//   restoreFromLocalFile(file, appName)         — restore IndexedDB from picked .json file
//   timestampSuffix()                           — "YYYY-MM-DD_HH-MM" string

'use strict';

import { setCachedTravelData, setCachedFinanceData } from './db.js';

// ── Timestamp helper ──────────────────────────────────────────────────────────
export function timestampSuffix() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hr  = now.getHours();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12  = hr % 12 || 12;
  return `${pad(now.getDate())}-${_monthAbbr(now.getMonth())}-${now.getFullYear()}_${pad(h12)}-${pad(now.getMinutes())}_${ampm}`;
}

function _monthAbbr(m) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m];
}

// ── Download JSON backup ──────────────────────────────────────────────────────
export function downloadLocalBackup(appName, data) {
  const ts    = timestampSuffix();
  const label = appName === 'travel' ? 'TravelHub' : 'PersonalVault';
  const ext   = appName === 'travel' ? 'travelbox' : 'vaultbox';
  const filename = `${label}_Backup_${ts}.${ext}`;
  _triggerDownload(JSON.stringify(data, null, 2), filename, 'application/json');
  return filename;
}

// ── Save any text file to browser Downloads ───────────────────────────────────
export function saveFileToExports(appName, filename, textContent) {
  _triggerDownload(textContent, filename, 'application/octet-stream');
  return filename;
}

// ── Save XLSX workbook to browser Downloads ────────────────────────────────────
export function saveXLSXToExports(appName, filename, workbook) {
  if (!window.XLSX) throw new Error('XLSX library not loaded');
  // XLSX.writeFile triggers browser download directly
  XLSX.writeFile(workbook, filename);
  return filename;
}

// ── Restore from local file (file picker result) ──────────────────────────────
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

// ── Internal: trigger browser download ────────────────────────────────────────
function _triggerDownload(content, filename, mimeType) {
  const blob = (content instanceof Blob)
    ? content
    : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
