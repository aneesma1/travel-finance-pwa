// v4.0.0 — 2026-05-01 — Local-first rewrite: Drive queue removed
// ─── shared/sync-manager.js ──────────────────────────────────────────────────
// Local-first save orchestration
// All data lives in IndexedDB. No cloud sync. No Drive queue.
//
// Exports:
//   localSave(appName, mergeFn)       — merge + write to IndexedDB, broadcast status
//   bootBackup(appName)               — run integrity check on every boot (non-blocking)
//   runBootIntegrityCheck(appName)    — count-sanity check, returns issues[]

'use strict';

import {
  getCachedTravelData, setCachedTravelData,
  getCachedFinanceData, setCachedFinanceData,
  getAppState, setAppState
} from './db.js';
import { uuidv4, showToast } from './utils.js';

// ── Sync status broadcast ─────────────────────────────────────────────────────
function broadcastStatus(status, detail = '') {
  window.dispatchEvent(new CustomEvent('sync:status', { detail: { status, detail } }));
}

// ── Empty data templates ──────────────────────────────────────────────────────
function getEmptyData(appName) {
  if (appName === 'travel') {
    return {
      schemaVersion: 1, members: [], trips: [], documents: [],
      familyDefaults: {}, familyRelations: [], customDocTypes: []
    };
  }
  return { schemaVersion: 1, transactions: [], categories: [], accounts: [] };
}

// ── Local save — write to IndexedDB immediately ───────────────────────────────
export async function localSave(appName, mergeFn) {
  broadcastStatus('syncing', 'Saving…');
  try {
    const current = appName === 'travel'
      ? await getCachedTravelData()
      : await getCachedFinanceData();

    const merged = await mergeFn(current || getEmptyData(appName));
    merged.lastModifiedLocal = new Date().toISOString();

    if (appName === 'travel') await setCachedTravelData(merged);
    else                      await setCachedFinanceData(merged);

    broadcastStatus('synced', 'Saved');
    return merged;
  } catch (err) {
    broadcastStatus('failed', err.message);
    throw err;
  }
}

// ── Boot backup — integrity check on every app open ──────────────────────────
export async function bootBackup(appName) {
  try {
    const issues = await runBootIntegrityCheck(appName);
    return issues;
  } catch { return []; }
}

// ── Boot integrity check ──────────────────────────────────────────────────────
export async function runBootIntegrityCheck(appName) {
  const issues = [];

  const cached = appName === 'travel'
    ? await getCachedTravelData()
    : await getCachedFinanceData();

  if (!cached) return issues;

  // Check: record count dropped suspiciously since last boot
  const lastCount = await getAppState(`lastKnownCount_${appName}`);
  const currentCount = appName === 'travel'
    ? (cached.trips?.length || 0)
    : (cached.transactions?.length || 0);

  if (lastCount && currentCount < lastCount * 0.8 && lastCount > 5) {
    issues.push({
      type:    'suspicious_drop',
      message: `Record count dropped (${lastCount} → ${currentCount}). Check your data.`,
    });
  }

  await setAppState(`lastKnownCount_${appName}`, currentCount);
  return issues;
}
