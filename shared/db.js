// v3.3.2 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── shared/db.js ────────────────────────────────────────────────────────────
// IndexedDB offline cache
// Stores the full data JSON locally so app works without internet

'use strict';

const DB_NAME    = 'TravelFinanceApp';
const DB_VERSION = 1;

const STORES = {
  travel:       'travel_data',
  finance:      'finance_data',
  syncQueue:    'sync_queue',   // Pending writes to push when back online
  appState:     'app_state',    // UI state, filter preferences
};

let _db = null;

// ── Open / init ───────────────────────────────────────────────────────────────
export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Key-value stores -- all use 'key' as keyPath
      Object.values(STORES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'key' });
        }
      });
    };

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = (e) => reject(e.target.error);
  });
}

// ── Generic get/set ───────────────────────────────────────────────────────────
async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function dbSet(storeName, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result.map(r => r.value));
    req.onerror   = () => reject(req.error);
  });
}

// ── Travel data cache ──────────────────────────────────────────────────────────
export async function getCachedTravelData() {
  return dbGet(STORES.travel, 'data');
}

export async function setCachedTravelData(data) {
  return dbSet(STORES.travel, 'data', data);
}

// ── Finance data cache ─────────────────────────────────────────────────────────
export async function getCachedFinanceData() {
  return dbGet(STORES.finance, 'data');
}

export async function setCachedFinanceData(data) {
  return dbSet(STORES.finance, 'data', data);
}

// ── Sync queue (offline writes) ────────────────────────────────────────────────
export async function enqueueSync(appName, operation) {
  // operation: { type: 'write', appName, mergeFnSerialized, timestamp }
  const queue = await dbGet(STORES.syncQueue, 'queue') || [];
  queue.push({
    id:        Date.now(),
    appName,
    operation,
    timestamp: new Date().toISOString()
  });
  return dbSet(STORES.syncQueue, 'queue', queue);
}

export async function getSyncQueue() {
  return dbGet(STORES.syncQueue, 'queue') || [];
}

export async function clearSyncQueue() {
  return dbDelete(STORES.syncQueue, 'queue');
}

export async function removeSyncItem(id) {
  const queue = await getSyncQueue();
  const updated = queue.filter(item => item.id !== id);
  return dbSet(STORES.syncQueue, 'queue', updated);
}

// ── App state ─────────────────────────────────────────────────────────────────
export async function getAppState(appName) {
  return dbGet(STORES.appState, appName) || {};
}

export async function setAppState(appName, state) {
  const current = await getAppState(appName);
  return dbSet(STORES.appState, appName, { ...current, ...state });
}

// ── Clear all data (for sign-out) ─────────────────────────────────────────────
export async function clearAllCachedData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    Object.values(STORES).forEach(store => tx.objectStore(store).clear());
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
