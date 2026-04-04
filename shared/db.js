// v3.5.5 — 2026-03-22

// ─── shared/db.js ────────────────────────────────────────────────────────────
// IndexedDB offline cache
// Stores the full data JSON locally so app works without internet

'use strict';

const DB_NAME    = 'TravelFinanceApp';
const DB_VERSION = 2;

const STORES = {
  travel:       'travel_data',
  finance:      'finance_data',
  syncQueue:    'sync_queue',   // Pending writes to push when back online
  appState:     'app_state',    // UI state, filter preferences
  securityLog:  'security_log', // Persistent security audit events
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
  let data = await dbGet(STORES.travel, 'data');
  if (data) {
    let migrated = false;

    // Phase 1 Migration: travelPersons to passengers
    if (data.travelPersons && !data.passengers) {
      data.passengers = data.travelPersons;
      migrated = true;
    } else if (data.travelPersons && data.passengers) {
      // both exist? merge uniquely by id
      const pMap = new Map();
      [...data.passengers, ...data.travelPersons].forEach(p => { if (p.id) pMap.set(p.id, p); });
      data.passengers = Array.from(pMap.values());
      migrated = true;
    }

    if (data.trips && Array.isArray(data.trips)) {
      data.trips.forEach(t => {
        if (t.personId !== undefined) { t.passengerId = t.personId; delete t.personId; migrated = true; }
        if (t.personName !== undefined) { t.passengerName = t.personName; delete t.personName; migrated = true; }
        if (t.dateOutIndia !== undefined) { t.dateLeftOrigin = t.dateOutIndia; delete t.dateOutIndia; migrated = true; }
        if (t.dateInQatar !== undefined) { t.dateArrivedDest = t.dateInQatar; delete t.dateInQatar; migrated = true; }
        if (t.dateOutQatar !== undefined) { t.dateLeftDest = t.dateOutQatar; delete t.dateOutQatar; migrated = true; }
        if (t.dateInIndia !== undefined) { t.dateReturnedOrigin = t.dateInIndia; delete t.dateInIndia; migrated = true; }
        if (t.daysInQatar !== undefined) { t.daysInDest = t.daysInQatar; delete t.daysInQatar; migrated = true; }

        // Give defaults if they didn't exist
        if (!t.originCountry) { t.originCountry = 'India'; migrated = true; }
        if (!t.destinationCountry) { t.destinationCountry = t.destination || 'Qatar'; migrated = true; }
      });
    }

    if (migrated) {
      delete data.travelPersons;
      // Note: we just silently upgrade memory, and let the next localSave persist it to Drive.
      // But we should write it locally so subsequent reads are fast
      await dbSet(STORES.travel, 'data', data);
    }
  }
  return data;
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

// ── Security Logging ──────────────────────────────────────────────────────────
export async function addSecurityLog(event) {
  const logs = await dbGetAll(STORES.securityLog) || [];
  logs.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...event
  });
  // Keep last 50 logs
  const trimmed = logs.slice(-50);
  // Clear and rewrite (simplest for small audit log)
  const db = await openDB();
  const tx = db.transaction(STORES.securityLog, 'readwrite');
  const store = tx.objectStore(STORES.securityLog);
  store.clear();
  trimmed.forEach(log => store.put({ key: log.id, value: log }));
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getSecurityLogs() {
  return dbGetAll(STORES.securityLog);
}

export async function clearSecurityLogs() {
  const db = await openDB();
  const tx = db.transaction(STORES.securityLog, 'readwrite');
  tx.objectStore(STORES.securityLog).clear();
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
