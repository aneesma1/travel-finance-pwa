// v3.3.8 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── shared/sync-manager.js ──────────────────────────────────────────────────
// Core of Phase 3 -- Local-first architecture
// Handles: sequential Drive writes, pending queue, write-ahead safety,
//          boot integrity checks, sync status broadcasting

'use strict';

import { getCachedTravelData, setCachedTravelData,
         getCachedFinanceData, setCachedFinanceData,
         getAppState, setAppState } from './db.js';
import { writeData, fetchJsonFile, initDriveFolders,
         initDataFile, downloadLocalBackup, timestampSuffix } from './drive.js';
import { isOnline, uuidv4, showToast } from './utils.js';

// ── Sync status broadcast ─────────────────────────────────────────────────────
// Screens listen for 'sync:status' events on window
function broadcastStatus(status, detail = '') {
  window.dispatchEvent(new CustomEvent('sync:status', { detail: { status, detail } }));
}

// ── Operation queue (in-memory, persisted to appState) ────────────────────────
let _queue    = [];   // { id, appName, mergeFn, queuedAt, status }
let _running  = false;

async function loadQueue() {
  try {
    const stored = await getAppState('syncQueue');
    if (stored && stored.length > 0) {
      _queue = stored;
    } else {
      // IndexedDB empty (possibly cleared) -- try Drive-side queue
      const driveQueue = await readDriveQueue().catch(() => null);
      _queue = driveQueue || [];
      if (_queue.length > 0) {
        // Restore to IndexedDB
        await setAppState('syncQueue', _queue);
      }
    }
  } catch { _queue = []; }
}

async function saveQueue() {
  try {
    const serialisable = _queue.map(({ id, appName, queuedAt, status, dataSnapshot }) =>
      ({ id, appName, queuedAt, status, dataSnapshot }));
    await setAppState('syncQueue', serialisable);
    // Also write to Drive queue file (non-blocking -- best effort)
    writeDriveQueue(serialisable).catch(() => {});
  } catch { /* non-blocking */ }
}

// ── Drive-side pending queue (survives IndexedDB clear) ───────────────────────
const QUEUE_KEY = 'drive_pending_queue_id';

async function writeDriveQueue(queueData) {
  if (!isOnline()) return;
  const fileId = localStorage.getItem(QUEUE_KEY);
  if (!fileId) return; // Will be created on next initDriveFolders call
  try {
    const token = (await import('./auth.js')).getToken();
    if (!token) return;
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: queueData, updatedAt: new Date().toISOString() })
      }
    );
  } catch { /* non-blocking */ }
}

async function readDriveQueue() {
  const fileId = localStorage.getItem(QUEUE_KEY);
  if (!fileId || !isOnline()) return null;
  try {
    const token = (await import('./auth.js')).getToken();
    if (!token) return null;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.queue || [];
  } catch { return null; }
}

// ── Public: enqueue a local-first save ───────────────────────────────────────
// Call this instead of writeData() directly from screens
export async function localSave(appName, mergeFn) {
  // ① Write to IndexedDB immediately -- user sees result in <10ms
  const current = appName === 'travel'
    ? await getCachedTravelData()
    : await getCachedFinanceData();

  const merged = await mergeFn(current || getEmptyData(appName));
  merged.lastModifiedLocal = new Date().toISOString();

  if (appName === 'travel') await setCachedTravelData(merged);
  else await setCachedFinanceData(merged);

  // ② Add to drive sync queue
  const op = {
    id:           uuidv4(),
    appName,
    queuedAt:     new Date().toISOString(),
    status:       'pending',
    dataSnapshot: merged,   // Store full data snapshot for recovery
    mergeFn,                // Keep in memory for current session
  };
  _queue.push(op);
  await saveQueue();

  broadcastStatus('pending', `${_queue.filter(q=>q.status==='pending').length} pending`);

  // ③ Attempt Drive sync immediately (non-blocking)
  processDriveQueue().catch(() => {});

  return merged;
}

// ── Sequential Drive queue processor ─────────────────────────────────────────
export async function processDriveQueue() {
  if (_running || !isOnline()) return;
  if (!_queue.some(q => q.status === 'pending')) return;

  _running = true;
  broadcastStatus('syncing', 'Syncing…');

  for (const op of _queue.filter(q => q.status === 'pending')) {
    op.status = 'syncing';
    await saveQueue();

    try {
      // Write-ahead: mark safe file before touching main file
      await writeSafeSnapshot(op.appName, op.dataSnapshot);

      // Drive write -- use snapshot directly (already merged locally)
      const newData = await writeData(op.appName, () => op.dataSnapshot);

      // Update local cache with server-confirmed version
      if (op.appName === 'travel') await setCachedTravelData(newData);
      else await setCachedFinanceData(newData);

      // Clean up safe file
      await clearSafeSnapshot(op.appName);

      op.status = 'done';
      await saveQueue();

    } catch (err) {
      op.status = 'failed';
      op.error  = err.message;
      await saveQueue();
      broadcastStatus('failed', err.message);
      _running = false;
      return;
    }
  }

  // Prune done items
  _queue = _queue.filter(q => q.status !== 'done');
  await saveQueue();

  _running = false;
  const stillPending = _queue.filter(q => q.status === 'pending').length;
  if (stillPending > 0) {
    broadcastStatus('pending', `${stillPending} pending`);
  } else {
    broadcastStatus('synced', 'All saved');
  }
}

// ── Write-ahead safe snapshot ─────────────────────────────────────────────────
const SAFE_KEY = {
  travel:  'safe_snapshot_travel',
  finance: 'safe_snapshot_finance',
};

async function writeSafeSnapshot(appName, data) {
  try {
    await setAppState(SAFE_KEY[appName], {
      data,
      writtenAt: new Date().toISOString()
    });
  } catch { /* non-blocking */ }
}

async function clearSafeSnapshot(appName) {
  try { await setAppState(SAFE_KEY[appName], null); }
  catch { /* non-blocking */ }
}

export async function getSafeSnapshot(appName) {
  try { return await getAppState(SAFE_KEY[appName]); }
  catch { return null; }
}

// ── Boot integrity check ──────────────────────────────────────────────────────
export async function runBootIntegrityCheck(appName) {
  const issues = [];

  // Check 1: Interrupted write detected?
  const safe = await getSafeSnapshot(appName);
  if (safe) {
    issues.push({
      type:    'interrupted_write',
      message: 'Last session ended unexpectedly during a save.',
      detail:  `Safe snapshot from ${new Date(safe.writtenAt).toLocaleString()}`,
      data:    safe.data,
    });
  }

  // Check 2: Pending queue from previous session?
  await loadQueue();
  const stuck = _queue.filter(q => q.status === 'syncing');
  stuck.forEach(op => { op.status = 'pending'; }); // Reset stuck syncing items
  if (stuck.length) await saveQueue();

  const pending = _queue.filter(q => q.status === 'pending' || q.status === 'failed');
  if (pending.length) {
    issues.push({
      type:    'pending_queue',
      message: `${pending.length} change${pending.length > 1 ? 's' : ''} not yet synced to Drive.`,
      detail:  'Will sync automatically when online.',
      autoFix: true,
    });
  }

  // Check 3: Record count sanity (compare cached vs last known count)
  const cached = appName === 'travel'
    ? await getCachedTravelData()
    : await getCachedFinanceData();

  if (cached) {
    const lastCount = await getAppState(`lastKnownCount_${appName}`);
    const currentCount = appName === 'travel'
      ? (cached.trips?.length || 0)
      : (cached.transactions?.length || 0);

    if (lastCount && currentCount < lastCount * 0.8 && lastCount > 5) {
      issues.push({
        type:    'suspicious_drop',
        message: `Record count dropped significantly (${lastCount} → ${currentCount}).`,
        detail:  'This may indicate data loss. Check your records before continuing.',
      });
    }

    // Update last known count
    await setAppState(`lastKnownCount_${appName}`, currentCount);
  }

  return issues;
}

// ── Retry failed/pending queue items ─────────────────────────────────────────
export async function retryQueue() {
  _queue.filter(q => q.status === 'failed').forEach(q => { q.status = 'pending'; });
  await saveQueue();
  return processDriveQueue();
}

// ── Sync status helpers ───────────────────────────────────────────────────────
export async function getPendingCount() {
  await loadQueue();
  return _queue.filter(q => q.status === 'pending' || q.status === 'failed').length;
}

export function watchConnectivity() {
  window.addEventListener('online', () => {
    showToast('Back online -- syncing…', 'success', 2000);
    processDriveQueue().catch(() => {});
  });
}

// ── Empty data templates ──────────────────────────────────────────────────────
function getEmptyData(appName) {
  if (appName === 'travel') {
    return { schemaVersion: 1, members: [], trips: [], documents: [],
             familyDefaults: {}, familyRelations: [], customDocTypes: [] };
  }
  return { schemaVersion: 1, transactions: [], categories: [], accounts: [] };
}

// ── Initialise ────────────────────────────────────────────────────────────────
export async function initSyncManager() {
  await loadQueue();
  // Reset any operations stuck in 'syncing' from a previous crash
  _queue.filter(q => q.status === 'syncing').forEach(q => { q.status = 'pending'; });
  await saveQueue();
}
