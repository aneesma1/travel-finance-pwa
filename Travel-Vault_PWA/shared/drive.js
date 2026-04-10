// v3.5.5 — 2026-03-22

// ─── shared/drive.js ─────────────────────────────────────────────────────────
// Google Drive API wrapper
// Handles: folder creation, file create/fetch/update, ETag conflict detection,
// mirror folder writes, and backup download

'use strict';

import { authFetch } from './auth.js';
import { isOnline } from './utils.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = 'TravelFinanceApp';
const MIRROR_FOLDER = 'TravelFinanceApp_Mirror';
const MAX_RETRIES = 3;
const MIRROR_SNAPSHOTS = 3;

// localStorage keys
const KEYS = {
  appFolderId: 'drive_app_folder_id',
  mirrorFolderId: 'drive_mirror_folder_id',
  travelFileId: 'drive_travel_file_id',
  financeFileId: 'drive_finance_file_id',
  travelMirrorId: 'drive_travel_mirror_id',
  financeMirrorId: 'drive_finance_mirror_id',
};

// ── Folder management ─────────────────────────────────────────────────────────
async function findOrCreateFolder(name, parentId = null) {
  const token = null; // authFetch handles token injection
  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const searchRes = await authFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { method: 'GET' }
  );
  const data = await searchRes.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create folder
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];

  const createRes = await authFetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const folder = await createRes.json();
  return folder.id;
}

export async function initDriveFolders() {
  // Main app folder
  let appFolderId = localStorage.getItem(KEYS.appFolderId);
  if (!appFolderId) {
    appFolderId = await findOrCreateFolder(APP_FOLDER);
    localStorage.setItem(KEYS.appFolderId, appFolderId);
  }

  // Mirror folder (sibling of main)
  let mirrorFolderId = localStorage.getItem(KEYS.mirrorFolderId);
  if (!mirrorFolderId) {
    mirrorFolderId = await findOrCreateFolder(MIRROR_FOLDER);
    localStorage.setItem(KEYS.mirrorFolderId, mirrorFolderId);
  }

  return { appFolderId, mirrorFolderId };
}

// ── File create / fetch / update ──────────────────────────────────────────────
async function createJsonFile(name, data, parentId) {
  const metadata = { name, parents: [parentId], mimeType: 'application/json' };
  const content = JSON.stringify(data, null, 2);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const res = await authFetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    { method: 'POST', body: form }
  );
  const file = await res.json();
  return file.id;
}

export async function fetchJsonFile(fileId) {
  // Returns { data, etag }
  // First get etag via HEAD-like fields request
  const metaRes = await authFetch(
    `${DRIVE_API}/files/${fileId}?fields=md5Checksum,size,modifiedTime`,
    { method: 'GET' }
  );
  const meta = await metaRes.json();
  const etag = meta.md5Checksum || meta.modifiedTime;

  // Then fetch content
  const contentRes = await authFetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    { method: 'GET' }
  );
  const data = await contentRes.json();
  return { data, etag };
}

async function updateJsonFile(fileId, data, expectedEtag = null) {
  const content = JSON.stringify(data, null, 2);
  const headers = { 'Content-Type': 'application/json' };

  // ETag conflict detection via If-Match
  if (expectedEtag) {
    headers['If-Match'] = expectedEtag;
  }

  const res = await authFetch(
    `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`,
    { method: 'PATCH', headers, body: content }
  );

  if (res.status === 412) {
    // Precondition failed -- mid-air collision
    throw new Error('ETAG_CONFLICT');
  }

  if (!res.ok) {
    throw new Error(`Drive update failed: ${res.status}`);
  }

  return await res.json();
}

// ── App data file helpers ─────────────────────────────────────────────────────
export async function initDataFile(appName) {
  // appName: 'travel' | 'finance'
  const fileKey = appName === 'travel' ? KEYS.travelFileId : KEYS.financeFileId;
  const fileName = appName === 'travel' ? 'travel_data.json' : 'finance_data.json';
  const emptyData = appName === 'travel'
    ? { schemaVersion: 1, members: [], trips: [], documents: [], lastSync: null }
    : { schemaVersion: 1, transactions: [], categories: [], accounts: [], lastSync: null };

  let fileId = localStorage.getItem(fileKey);
  if (!fileId) {
    // Try to find by name in app folder first (new device recovery)
    const { appFolderId } = await initDriveFolders();
    const searchRes = await authFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`name='${fileName}' and '${appFolderId}' in parents and trashed=false`)}&fields=files(id)`,
      { method: 'GET' }
    );
    const found = await searchRes.json();
    if (found.files && found.files.length > 0) {
      fileId = found.files[0].id;
    } else {
      fileId = await createJsonFile(fileName, emptyData, appFolderId);
    }
    localStorage.setItem(fileKey, fileId);
  }
  return fileId;
}

export async function initMirrorFile(appName) {
  const mirrorKey = appName === 'travel' ? KEYS.travelMirrorId : KEYS.financeMirrorId;
  const mirrorName = appName === 'travel' ? 'travel_data_mirror.json' : 'finance_data_mirror.json';

  let mirrorId = localStorage.getItem(mirrorKey);
  if (!mirrorId) {
    const { mirrorFolderId } = await initDriveFolders();
    const searchRes = await authFetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`name='${mirrorName}' and '${mirrorFolderId}' in parents and trashed=false`)}&fields=files(id)`,
      { method: 'GET' }
    );
    const found = await searchRes.json();
    if (found.files && found.files.length > 0) {
      mirrorId = found.files[0].id;
    } else {
      mirrorId = await createJsonFile(mirrorName, [], mirrorFolderId);
    }
    localStorage.setItem(mirrorKey, mirrorId);
  }
  return mirrorId;
}

// ── Read data ─────────────────────────────────────────────────────────────────
export async function readData(appName) {
  const fileId = localStorage.getItem(
    appName === 'travel' ? KEYS.travelFileId : KEYS.financeFileId
  );
  if (!fileId) throw new Error('Data file not initialised');
  return fetchJsonFile(fileId);
}

// ── Write data with ETag retry ─────────────────────────────────────────────────
export async function writeData(appName, mergeFn) {
  // mergeFn receives the latest remote data and returns the data to save
  // This ensures safe concurrent writes from multiple family members
  const fileKey = appName === 'travel' ? KEYS.travelFileId : KEYS.financeFileId;
  const fileId = localStorage.getItem(fileKey);
  if (!fileId) throw new Error('Data file not initialised');

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const { data: remoteData, etag } = await fetchJsonFile(fileId);
      const newData = await mergeFn(remoteData);
      newData.lastSync = new Date().toISOString();
      await updateJsonFile(fileId, newData, etag);

      // Non-blocking mirror write
      writeMirrorSnapshot(appName, newData).catch(() => { });
      return newData;
    } catch (err) {
      if (err.message === 'ETAG_CONFLICT' && attempt < MAX_RETRIES) {
        // Wait briefly and retry
        await new Promise(r => setTimeout(r, 300 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to save after maximum retries. Please try again.');
}

// ── Tiered mirror backup -- 3 tiers: edits(5), daily(5), monthly(3) ──────────
// Each tier stores JSON. XLSX export is queued as best-effort after JSON write.
const TIER_SESSIONS = 5;   // last N 30-min sessions
const TIER_DAYS = 5;      // last N edit-days
const TIER_MONTHS = 3;    // last N edit-months
const SESSION_WINDOW = 30 * 60 * 1000; // 30 minutes

async function writeMirrorSnapshot(appName, fullData) {
  if (!isOnline()) return;
  const mirrorFolderId = localStorage.getItem(KEYS.mirrorFolderId);
  if (!mirrorFolderId) return;

  const ts = timestampSuffix();
  const label = appName === 'travel' ? 'travel' : 'finance';
  const token = getToken();
  if (!token) return;

  try {
    const appFolder = await findOrCreateFolder(label, mirrorFolderId);
    const sessionsFolder = await findOrCreateFolder('sessions', appFolder); // Renamed from edits
    const dailyFolder = await findOrCreateFolder('daily', appFolder);
    const monthlyFolder = await findOrCreateFolder('monthly', appFolder);

    const jsonBlob = JSON.stringify(fullData, null, 2);
    const xlsxBlob = await generateXLSXBlob(appName, fullData);
    
    const now = Date.now();
    const lastSessionTime = Number(localStorage.getItem(`last_session_time_${appName}`) || 0);

    // ── Tier 1: sessions/ -- One snapshot per 30-min session window ─────────
    if (now - lastSessionTime > SESSION_WINDOW) {
      const sessionName = `${label}_session_${ts}`;
      await createMirrorFile(sessionsFolder, `${sessionName}.json`, jsonBlob, token, 'application/json');
      if (xlsxBlob) {
        await createMirrorFile(sessionsFolder, `${sessionName}.xlsx`, xlsxBlob, token, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
      await pruneFolder(sessionsFolder, TIER_SESSIONS * 2, token); // * 2 because we have JSON + XLSX pairs
      localStorage.setItem(`last_session_time_${appName}`, String(now));
    }

    // ── Tier 2: daily/ -- one file per edit-day, overwrite same day ──────────
    const today = ts.slice(0, 10);
    const dailyName = `${label}_${today}`;
    await upsertMirrorFile(dailyFolder, `${dailyName}.json`, jsonBlob, token, 'application/json');
    if (xlsxBlob) {
      await upsertMirrorFile(dailyFolder, `${dailyName}.xlsx`, xlsxBlob, token, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    await pruneFolder(dailyFolder, TIER_DAYS * 2, token);

    // ── Tier 3: monthly/ -- one file per edit-month, overwrite same month ────
    const month = ts.slice(0, 7);
    const monthlyName = `${label}_${month}`;
    await upsertMirrorFile(monthlyFolder, `${monthlyName}.json`, jsonBlob, token, 'application/json');
    if (xlsxBlob) {
      await upsertMirrorFile(monthlyFolder, `${monthlyName}.xlsx`, xlsxBlob, token, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    await pruneFolder(monthlyFolder, TIER_MONTHS * 2, token);

  } catch (err) { console.error('Mirror failed:', err); }
}

async function generateXLSXBlob(appName, data) {
  if (!window.XLSX) return null;
  try {
    const wb = XLSX.utils.book_new();
    if (appName === 'travel') {
      const trips = data.trips || [];
      const passengers = data.passengers || [];
      const pMap = {};
      passengers.forEach(p => { pMap[p.id] = p.name; });
      const wsData = trips.map(t => ({
        Date: t.dateLeftOrigin || t.dateArrivedDest,
        Passenger: t.passengerName || pMap[t.passengerId] || t.passengerId,
        Origin: t.originCountry,
        Destination: t.destinationCountry,
        Stay: t.duration || t.daysInDest || 0,
        Note: t.notes || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), 'Trips');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(passengers), 'Passengers');
    } else {
      const txns = data.transactions || [];
      const wsData = txns.map(t => ({
        Date: t.date,
        Amount: t.amountSpend || t.income || 0,
        Description: t.description || '',
        Category: t.category1 || '',
        Account: t.account || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), 'Transactions');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.categories || []), 'Categories');
    }
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (err) {
    console.error('XLSX generation failed:', err);
    return null;
  }
}

async function createMirrorFile(folderId, name, blob, token, contentType) {
  const meta = JSON.stringify({ name, parents: [folderId] });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', blob);
  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
}

async function upsertMirrorFile(folderId, name, blob, token, contentType) {
  // Search for existing file with this name in folder
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${name}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!searchRes.ok) return;
  const { files } = await searchRes.json();

  if (files && files.length > 0) {
    // Update existing
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': contentType },
        body: blob
      }
    );
  } else {
    // Create new
    await createMirrorFile(folderId, name, blob, token, contentType);
  }
}

async function pruneFolder(folderId, keepCount, token) {
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&orderBy=name+desc&fields=files(id,name)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!listRes.ok) return;
  const { files } = await listRes.json();
  if (!files || files.length <= keepCount) return;
  // Delete oldest files beyond keepCount
  const toDelete = files.slice(keepCount);
  for (const f of toDelete) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => { });
  }
}

export async function getBackupHealthReport(appName) {
  if (!isOnline()) throw new Error('Internet connection required');
  const token = (await import('./auth.js')).getToken();
  if (!token) throw new Error('Not signed in');

  const appFolderId = localStorage.getItem(KEYS.appFolderId);
  const mirrorFolderId = localStorage.getItem(KEYS.mirrorFolderId);
  const label = appName === 'travel' ? 'travel' : 'finance';
  
  const appFolder = await findOrCreateFolder(label, mirrorFolderId); // Subfolder in mirror
  const sessionsFolder = await findOrCreateFolder('sessions', appFolder);
  const dailyFolder    = await findOrCreateFolder('daily',   appFolder);
  const monthlyFolder  = await findOrCreateFolder('monthly', appFolder);

  const listFiles = async (id) => {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents+and+trashed=false&fields=files(id,name,size,modifiedTime)&orderBy=name+desc`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data.files || [];
  };

  // 1. Working Folder Audit
  const workingFiles = await listFiles(appFolderId);
  const mainFile = workingFiles.find(f => f.name.includes(label));
  const queueFile = workingFiles.find(f => f.name.includes('queue'));

  // 2. Mirror Tier Audit
  const cSessions = await listFiles(sessionsFolder);
  const cDaily    = await listFiles(dailyFolder);
  const cMonthly  = await listFiles(monthlyFolder);

  return {
    working: {
      folderId: appFolderId,
      files: workingFiles.length,
      mainFile: mainFile ? { name: mainFile.name, size: mainFile.size } : null,
      queueActive: !!queueFile
    },
    mirror: {
      sessions: { count: Math.ceil(cSessions.length / 2), target: TIER_SESSIONS }, // Pairs count as 1
      daily:    { count: Math.ceil(cDaily.length / 2),    target: TIER_DAYS },
      monthly:  { count: Math.ceil(cMonthly.length / 2),  target: TIER_MONTHS }
    },
    status: (mainFile && cSessions.length >= 1) ? 'Healthy' : 'Initializing'
  };
}


export async function getMirrorSnapshots(appName) {
  const mirrorId = localStorage.getItem(
    appName === 'travel' ? KEYS.travelMirrorId : KEYS.financeMirrorId
  );
  if (!mirrorId) return [];
  try {
    const { data } = await fetchJsonFile(mirrorId);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function restoreFromMirror(appName, snapshotIndex) {
  const snapshots = await getMirrorSnapshots(appName);
  if (!snapshots[snapshotIndex]) throw new Error('Snapshot not found');
  const snapshot = snapshots[snapshotIndex];

  return writeData(appName, () => snapshot.data);
}

// ── Local device backup ───────────────────────────────────────────────────────
export function downloadLocalBackup(appName, data) {
  const ts = timestampSuffix();
  const label = appName === 'travel' ? 'Travel' : 'Finance';
  const filename = `${label}_Backup_${ts}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Timestamp suffix helper -- YYYY-MM-DD_HH-MM ───────────────────────────────
export function timestampSuffix() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export async function restoreFromLocalFile(file, appName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Validate schema
        if (!data.schemaVersion) throw new Error('Invalid backup file format');
        const restored = await writeData(appName, () => data);
        resolve(restored);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
/**
 * Safely moves orphaned files in the root app folder and the sessions mirror 
 * folder to trash. Whitelists the main data file, active sync queue, and 
 * any session file whose ID is still present in the local database.
 */
export async function purgeOrphanedFiles(appName, localData) {
  if (!isOnline()) throw new Error('Internet connection required');
  const token = (await import('./auth.js')).getToken();
  if (!token) throw new Error('Not signed in');

  const appFolderId = localStorage.getItem(KEYS.appFolderId);
  const mirrorFolderId = localStorage.getItem(KEYS.mirrorFolderId);
  const label = appName === 'travel' ? 'travel' : 'finance';
  
  // 1. Audit Root App Folder
  const rootRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${appFolderId}'+in+parents+and+trashed=false&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { files: rootFiles } = await rootRes.json();
  
  let purged = 0;
  if (rootFiles) {
    for (const f of rootFiles) {
      const isMainData = f.name.endsWith('_data.json');
      const isQueue = f.name.includes('queue');
      if (!isMainData && !isQueue) {
        await trashFile(f.id, token);
        purged++;
      }
    }
  }

  // 2. Audit Session Mirror Folder (The Deep Clean)
  const appFolder = await findOrCreateFolder(label, mirrorFolderId);
  const sessionsFolder = await findOrCreateFolder('sessions', appFolder);
  
  const sessRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${sessionsFolder}'+in+parents+and+trashed=false&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { files: sessFiles } = await sessRes.json();
  
  if (sessFiles && localData) {
    // Collect all valid IDs from the local database
    const validIds = new Set();
    if (appName === 'travel') {
      (localData.trips || []).forEach(t => validIds.add(String(t.id)));
    } else {
      (localData.transactions || []).forEach(t => validIds.add(String(t.id)));
    }

    for (const f of sessFiles) {
      // Session files are normally named {id}.json or txn_{id}.json
      const fileId = f.name.replace('txn_', '').replace('.json', '');
      if (!validIds.has(fileId)) {
        await trashFile(f.id, token);
        purged++;
      }
    }
  }

  return purged;
}

async function trashFile(fileId, token) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  }).catch(() => { });
}
