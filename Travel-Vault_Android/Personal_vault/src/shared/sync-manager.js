// v5.4.2 — 2026-04-11 — Fixed critical syntax errors for native build

// ─── shared/sync-manager.js ──────────────────────────────────────────────────
// Core of Phase 3 -- Local-first architecture
// Handles: sequential Drive writes, pending queue, write-ahead safety,
//          boot integrity checks, sync status broadcasting
//
// ⚠️ NATIVE BUILD NOTE: This file uses NO import/export statements until v5.4.3.
// All dependencies (authFetch, isOnline, etc.) must be global (loaded via <script> tags).

'use strict';

import { getCachedTravelData, setCachedTravelData, getCachedFinanceData, setCachedFinanceData, openDB } from './db.js';
import { getAppState, setAppState, uuidv4 } from './utils.js';

// ── Sync status broadcast ─────────────────────────────────────────────────────
function broadcastStatus(status, detail) {
  detail = detail || '';
  window.dispatchEvent(new CustomEvent('sync:status', { detail: { status: status, detail: detail } }));
}

// ── Operation queue (in-memory, persisted to appState) ────────────────────────
var _queue   = [];   // { id, appName, mergeFn, queuedAt, status }
var _running = false;

async function loadQueue() {
  try {
    var stored = await getAppState('syncQueue');
    if (stored && Array.isArray(stored) && stored.length > 0) {
      _queue = stored;
    } else {
      _queue = [];
    }
  } catch (e) { _queue = []; }
}

async function saveQueue() {
  try {
    var serialisable = _queue.map(function(item) {
      return { id: item.id, appName: item.appName, queuedAt: item.queuedAt, status: item.status, dataSnapshot: item.dataSnapshot };
    });
    await setAppStatePrim('syncQueue', serialisable);
  } catch (e) { /* non-blocking */ }
}

// ── Primitive-safe state setters (avoids object-spread bug for arrays/primitives) ──
async function setAppStatePrim(key, value) {
  try {
    var db = await openDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction('app_state', 'readwrite');
      var req = tx.objectStore('app_state').put({ key: key, value: value });
      req.onsuccess = function() { resolve(); };
      req.onerror   = function() { reject(req.error); };
    });
  } catch (e) { /* silent */ }
}

// ── Drive-side pending queue cleared ─────────────────────────────────────────
async function clearDriveQueue() {
  _queue = [];
  await setAppStatePrim('syncQueue', []);
}

// ── Public: enqueue a local-first save ───────────────────────────────────────
export async function localSave(appName, mergeFn) {
  // ① Write to IndexedDB immediately -- user sees result in <10ms
  var current = appName === 'travel'
    ? await getCachedTravelData()
    : await getCachedFinanceData();

  var merged = await mergeFn(current || getEmptyData(appName));
  merged.lastModifiedLocal = new Date().toISOString();

  if (appName === 'travel') await setCachedTravelData(merged);
  else await setCachedFinanceData(merged);

  // ② Write a daily local device backup + prune old backups (instant, no background)
  try { await writeAndPruneLocalBackup(appName, merged); } catch (e) { /* non-blocking */ }

  // ③ Add to drive sync queue
  var op = {
    id:           uuidv4(),
    appName:      appName,
    queuedAt:     new Date().toISOString(),
    status:       'pending',
    dataSnapshot: merged,
  };
  _queue.push(op);
  await saveQueue();

  broadcastStatus('pending', _queue.filter(function(q){ return q.status === 'pending'; }).length + ' pending');

  // ④ Background sync is DISABLED in Android Native. User MUST sync manually.

  return merged;
}

// ── Instant Local Backup + 15-Day Prune ──────────────────────────────────────
// Fires synchronously inside localSave(). Zero background processes, zero battery drain.
// Uses Capacitor Filesystem if available; silently skips on Web/PWA.
async function writeAndPruneLocalBackup(appName, data) {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Filesystem) return;

  var Filesystem = window.Capacitor.Plugins.Filesystem;
  var dir = 'DOCUMENTS'; // Android: /storage/emulated/0/Documents/
  // Organised subfolder per app
  var subDir = appName === 'travel' ? 'TravelHub/TravelboxFiles' : 'PersonalVault/VaultboxFiles';
  var prefix = appName === 'travel' ? 'TravelHub_Backup_' : 'Vault_Backup_';
  var ext = appName === 'travel' ? '.travelbox' : '.vaultbox';

  // Ensure subfolder exists
  try { await Filesystem.mkdir({ path: subDir, directory: dir, recursive: true }); } catch (e) { /* already exists */ }

  // Write today's backup (one file per day, overwrites same-day)
  var today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  var fileName = prefix + today + ext;

  await Filesystem.writeFile({
    path: subDir + '/' + fileName,
    data: JSON.stringify(data),
    directory: dir,
    encoding: 'utf8',
    recursive: true
  });

  // Prune backup files older than 15 days
  var cutoffMs = 15 * 24 * 60 * 60 * 1000;
  var now = Date.now();

  try {
    var listResult = await Filesystem.readdir({ path: subDir, directory: dir });
    var files = (listResult.files || []);

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var name = f.name || f; // Capacitor returns object or string depending on version
      if (typeof name !== 'string' || !name.startsWith(prefix) || !name.endsWith(ext)) continue;

      // Extract date from filename: PREFIX_YYYY-MM-DD.ext
      var datePart = name.replace(prefix, '').replace(ext, '');
      var fileDate = new Date(datePart).getTime();
      if (isNaN(fileDate)) continue;

      if (now - fileDate > cutoffMs) {
        try {
          await Filesystem.deleteFile({ path: subDir + '/' + name, directory: dir });
        } catch (delErr) { /* non-blocking */ }
      }
    }
  } catch (listErr) { /* non-blocking -- directory may not exist yet */ }
}


// ── Local queue flush (Drive removed in Blueprint V2) ─────────────────────────
// Data is already written to IndexedDB inside localSave() before this queue
// is even populated. This function simply confirms each pending op and clears
// the queue so it does not grow unbounded.
async function processDriveQueue() {
  if (_running) return;
  if (!_queue.some(function(q){ return q.status === 'pending'; })) return;

  _running = true;
  broadcastStatus('syncing', 'Confirming…');

  var pendingOps = _queue.filter(function(q){ return q.status === 'pending'; });
  for (var i = 0; i < pendingOps.length; i++) {
    var op = pendingOps[i];
    op.status = 'syncing';
    await saveQueue();

    try {
      // Data snapshot is already confirmed in IndexedDB — clear safe file and mark done.
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
  _queue = _queue.filter(function(q){ return q.status !== 'done'; });
  await saveQueue();

  _running = false;
  broadcastStatus('synced', 'All saved');
}

// ── Write-ahead safe snapshot ─────────────────────────────────────────────────
var SAFE_KEY = {
  travel:  'safe_snapshot_travel',
  finance: 'safe_snapshot_finance',
};

async function writeSafeSnapshot(appName, data) {
  try {
    await setAppStatePrim(SAFE_KEY[appName], {
      data: data,
      writtenAt: new Date().toISOString()
    });
  } catch (e) { /* non-blocking */ }
}

async function clearSafeSnapshot(appName) {
  try { await setAppStatePrim(SAFE_KEY[appName], null); }
  catch (e) { /* non-blocking */ }
}

async function getSafeSnapshot(appName) {
  try {
    return await getAppState(SAFE_KEY[appName]);
  } catch (e) { return null; }
}

// ── Boot integrity check ──────────────────────────────────────────────────────
async function runBootIntegrityCheck(appName) {
  var issues = [];

  // Check 1: Interrupted write detected?
  var safe = await getSafeSnapshot(appName);
  if (safe && safe.writtenAt) {
    issues.push({
      type:    'interrupted_write',
      message: 'Last session ended unexpectedly during a save.',
      detail:  'Safe snapshot from ' + new Date(safe.writtenAt).toLocaleString(),
      data:    safe.data,
    });
  }

  // Check 2: Pending queue from previous session?
  await loadQueue();
  var stuck = _queue.filter(function(q){ return q.status === 'syncing'; });
  stuck.forEach(function(op){ op.status = 'pending'; });
  if (stuck.length) await saveQueue();

  var pending = _queue.filter(function(q){ return q.status === 'pending' || q.status === 'failed'; });
  if (pending.length) {
    issues.push({
      type:    'pending_queue',
      message: pending.length + ' change' + (pending.length > 1 ? 's' : '') + ' not yet synced to Drive.',
      detail:  'Will sync automatically when online.',
      autoFix: true,
    });
  }

  // Check 3: Record count sanity
  var cached = appName === 'travel'
    ? await getCachedTravelData()
    : await getCachedFinanceData();

  if (cached) {
    var lastCount    = await getAppState('lastKnownCount_' + appName);
    var currentCount = appName === 'travel'
      ? (cached.trips ? cached.trips.length : 0)
      : (cached.transactions ? cached.transactions.length : 0);

    if (lastCount && currentCount < lastCount * 0.8 && lastCount > 5) {
      issues.push({
        type:    'suspicious_drop',
        message: 'Record count dropped significantly (' + lastCount + ' → ' + currentCount + ').',
        detail:  'This may indicate data loss. Check your records before continuing.',
      });
    }

    // Update last known count
    await setAppStatePrim('lastKnownCount_' + appName, currentCount);
  }

  return issues;
}

// ── Retry failed/pending queue items ─────────────────────────────────────────
async function retryQueue() {
  _queue.filter(function(q){ return q.status === 'failed'; }).forEach(function(q){ q.status = 'pending'; });
  await saveQueue();
  return processDriveQueue();
}

// ── Sync status helpers ───────────────────────────────────────────────────────
async function getPendingCount() {
  await loadQueue();
  return _queue.filter(function(q){ return q.status === 'pending' || q.status === 'failed'; }).length;
}

function watchSync() {
  window.addEventListener('online', function() {
    // Auto-sync is DISABLED. User MUST trigger manually.
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
async function initSyncManager() {
  await loadQueue();
  _queue.filter(function(q){ return q.status === 'syncing'; }).forEach(function(q){ q.status = 'pending'; });
  await saveQueue();
}
