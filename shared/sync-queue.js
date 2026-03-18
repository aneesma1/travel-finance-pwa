// v2.1 — 2026-03-18
// ─── shared/sync-queue.js ────────────────────────────────────────────────────
// Offline sync queue processor
// When writes fail offline, they're stored in IndexedDB.
// This module replays them when connectivity is restored.

'use strict';

import { getSyncQueue, removeSyncItem, clearSyncQueue } from './db.js';
import { writeData } from './drive.js';
import { setCachedTravelData, setCachedFinanceData } from './db.js';
import { isOnline } from './utils.js';

let _processing = false;

// ── Enqueue a pending write ───────────────────────────────────────────────────
export async function queueWrite(appName, mergeFnSource) {
  // mergeFnSource is a serialisable description of the change
  const { enqueueSync } = await import('./db.js');
  await enqueueSync(appName, { mergeFnSource, queuedAt: new Date().toISOString() });
}

// ── Process all queued writes ─────────────────────────────────────────────────
export async function processQueue(onProgress) {
  if (_processing || !isOnline()) return { processed: 0, failed: 0 };
  _processing = true;

  const queue = await getSyncQueue();
  if (!queue.length) { _processing = false; return { processed: 0, failed: 0 }; }

  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      onProgress?.(`Syncing ${processed + 1} of ${queue.length}…`);

      // Re-execute the queued merge operation
      const newData = await writeData(item.appName, (remote) => {
        // The queued item stores the full intended data state
        return item.operation?.data || remote;
      });

      // Update local cache
      if (item.appName === 'travel') await setCachedTravelData(newData);
      else await setCachedFinanceData(newData);

      await removeSyncItem(item.id);
      processed++;
    } catch (err) {
      console.warn(`[SyncQueue] Failed to process item ${item.id}:`, err.message);
      failed++;
    }
  }

  _processing = false;
  return { processed, failed };
}

// ── Check queue size ──────────────────────────────────────────────────────────
export async function getPendingCount() {
  const queue = await getSyncQueue();
  return queue.length;
}

// ── Auto-process when back online ─────────────────────────────────────────────
export function watchConnectivity(onSyncComplete) {
  window.addEventListener('online', async () => {
    const pending = await getPendingCount();
    if (pending > 0) {
      const result = await processQueue();
      onSyncComplete?.(result);
    }
  });
}
