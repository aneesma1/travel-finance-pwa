// v5.5.4 — 2026-04-24 — Drive sync removed (Blueprint V2). File kept for cache manifest compatibility.

// ─── shared/sync-queue.js ────────────────────────────────────────────────────
// Previously: offline Drive sync queue processor.
// Now: no-op stub. All data is local-first via IndexedDB (sync-manager.js).
// This file exists only because it is listed in the recovery.js cache manifest.

'use strict';

export async function queueWrite()      { /* no-op — data written to IndexedDB in localSave() */ }
export async function processQueue()    { return { processed: 0, failed: 0 }; }
export async function getPendingCount() { return 0; }
export function watchConnectivity()     { /* no-op */ }
