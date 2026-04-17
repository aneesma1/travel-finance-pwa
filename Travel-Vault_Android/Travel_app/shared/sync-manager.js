// v5.4.2 — 2026-04-11 — Fixed critical syntax errors for native build

// ─── shared/sync-manager.js ──────────────────────────────────────────────────
// Core of Phase 3 -- Local-first architecture
// Handles: sequential Drive writes, pending queue, write-ahead safety,
//          boot integrity checks, sync status broadcasting
//
// ⚠️ NATIVE BUILD NOTE: This file uses NO import/export statements.
// All dependencies (authFetch, isOnline, etc.) must be global (loaded via <script> tags).

'use strict';

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
async function localSave(appName, mergeFn) {
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
  var prefix = appName === 'travel' ? 'TravelHub_Backup_' : 'Vault_Backup_';
  var ext = appName === 'travel' ? '.travelbox' : '.vaultbox';

  // Write today's backup (unencrypted JSON, one file per day)
  var today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  var fileName = prefix + today + ext;

  await Filesystem.writeFile({
    path: fileName,
    data: JSON.stringify(data),
    directory: dir,
    encoding: 'utf8',
    recursive: true
  });

  // Prune any backup files older than 15 days
  var cutoffMs = 15 * 24 * 60 * 60 * 1000;
  var now = Date.now();

  try {
    var listResult = await Filesystem.readdir({ path: '', directory: dir });
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
          await Filesystem.deleteFile({ path: name, directory: dir });
        } catch (delErr) { /* non-blocking */ }
      }
    }
  } catch (listErr) { /* non-blocking -- directory may not exist yet */ }
}


// ── Sequential Drive queue processor ─────────────────────────────────────────
async function processDriveQueue() {
  if (_running || !isOnline()) return;
  if (!_queue.some(function(q){ return q.status === 'pending'; })) return;

  _running = true;
  broadcastStatus('syncing', 'Syncing…');

  var pendingOps = _queue.filter(function(q){ return q.status === 'pending'; });
  for (var i = 0; i < pendingOps.length; i++) {
    var op = pendingOps[i];
    op.status = 'syncing';
    await saveQueue();

    try {
      // Write-ahead: mark safe file before touching main file
      await writeSafeSnapshot(op.appName, op.dataSnapshot);

      // Drive write -- use snapshot directly (already merged locally)
      var newData = await writeData(op.appName, async function(driveData) {
        var localData  = op.dataSnapshot;
        var localCount = (localData.trips ? localData.trips.length : 0) + (localData.transactions ? localData.transactions.length : 0);
        var driveCount = (driveData && driveData.trips ? driveData.trips.length : 0) + (driveData && driveData.transactions ? driveData.transactions.length : 0);

        // SAFETY INTERLOCK: If local is empty but cloud has data, BLOCK the push.
        if (localCount === 0 && driveCount > 0) {
          console.error('SYNC BLOCK: Attempted to overwrite cloud data with empty local state.');
          throw new Error('Zero-Data Interlock: Cloud data preserved. Please "Restore from Cloud" first.');
        }

        // Bi-Directional Merge (Conflict Resolution)
        var mergedData = Object.assign({}, localData);
        if (op.appName === 'travel') {
          ['trips', 'passengers', 'documents'].forEach(function(key) {
            var localIds = new Set((localData[key] || []).map(function(x){ return x.id; }));
            var missing  = (driveData[key] || []).filter(function(x){ return x.id && !localIds.has(x.id); });
            if (missing.length > 0) {
              mergedData[key] = (localData[key] || []).concat(missing);
            }
          });
        } else if (op.appName === 'finance') {
          ['transactions', 'categories', 'accounts'].forEach(function(key) {
            var localIds = new Set((localData[key] || []).map(function(x){ return x.id; }));
            var missing  = (driveData[key] || []).filter(function(x){ return x.id && !localIds.has(x.id); });
            if (missing.length > 0) {
              mergedData[key] = (localData[key] || []).concat(missing);
            }
          });
        }
        return mergedData;
      });

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
  _queue = _queue.filter(function(q){ return q.status !== 'done'; });
  await saveQueue();

  _running = false;
  var stillPending = _queue.filter(function(q){ return q.status === 'pending'; }).length;
  if (stillPending > 0) {
    broadcastStatus('pending', stillPending + ' pending');
  } else {
    broadcastStatus('synced', 'All saved');
  }
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

    // Check 4: Smart ETag Check (only if authenticated & online)
    if (isOnline() && typeof authFetch === 'function' && typeof getToken === 'function' && getToken()) {
      try {
        var fileKey = appName === 'travel' ? 'drive_travel_file_id' : 'drive_finance_file_id';
        var fileId  = localStorage.getItem(fileKey);
        if (fileId) {
          var metaRes = await authFetch(
            'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=modifiedTime',
            { method: 'GET' }
          );
          if (metaRes.ok) {
            var meta      = await metaRes.json();
            var cloudTime = new Date(meta.modifiedTime).getTime();
            var localSync = new Date(cached.lastSync || 0).getTime();
            if (cloudTime > localSync + 60000) {
              issues.push({
                type:    'cloud_newer',
                message: 'Newer data is available on Google Drive',
                detail:  'Tap Settings → Data → Restore from Cloud to download the newest changes.',
                autoFix: false,
              });
            }
          }
        }
      } catch (err) { console.error('ETag Check Failed', err); }
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
