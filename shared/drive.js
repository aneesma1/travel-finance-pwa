// v3.5.3 — 2026-03-22

// ─── shared/drive.js ─────────────────────────────────────────────────────────
// Google Drive API wrapper
// Handles: folder creation, file create/fetch/update, ETag conflict detection,
// mirror folder writes, and backup download

'use strict';

import { authFetch } from './auth.js';

const DRIVE_API      = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD   = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER     = 'TravelFinanceApp';
const MIRROR_FOLDER  = 'TravelFinanceApp_Mirror';
const MAX_RETRIES    = 3;
const MIRROR_SNAPSHOTS = 3;

// localStorage keys
const KEYS = {
  appFolderId:    'drive_app_folder_id',
  mirrorFolderId: 'drive_mirror_folder_id',
  travelFileId:   'drive_travel_file_id',
  financeFileId:  'drive_finance_file_id',
  travelMirrorId: 'drive_travel_mirror_id',
  financeMirrorId:'drive_finance_mirror_id',
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
  const content  = JSON.stringify(data, null, 2);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file',     new Blob([content],                  { type: 'application/json' }));

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
  const fileKey   = appName === 'travel' ? KEYS.travelFileId : KEYS.financeFileId;
  const fileName  = appName === 'travel' ? 'travel_data.json' : 'finance_data.json';
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
  const mirrorKey  = appName === 'travel' ? KEYS.travelMirrorId : KEYS.financeMirrorId;
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
  const fileId  = localStorage.getItem(fileKey);
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
      writeMirrorSnapshot(appName, newData).catch(() => {});
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
const TIER_EDITS   = 5;   // last N individual saves
const TIER_DAYS    = 5;   // last N edit-days (one file per day, overwritten)
const TIER_MONTHS  = 3;   // last N edit-months (one file per month, overwritten)

async function writeMirrorSnapshot(appName, fullData) {
  if (!isOnline()) return;
  const mirrorFolderId = localStorage.getItem(KEYS.mirrorFolderId);
  if (!mirrorFolderId) return;

  const ts    = timestampSuffix();
  const label = appName === 'travel' ? 'travel' : 'finance';
  const token = getToken();
  if (!token) return;

  try {
    // Ensure subfolder structure exists
    const appFolder = await findOrCreateFolder(label, mirrorFolderId);
    const editsFolder   = await findOrCreateFolder('edits',   appFolder);
    const dailyFolder   = await findOrCreateFolder('daily',   appFolder);
    const monthlyFolder = await findOrCreateFolder('monthly', appFolder);

    const jsonBlob = JSON.stringify(fullData, null, 2);
    const today    = ts.slice(0, 10);               // YYYY-MM-DD
    const month    = ts.slice(0, 7);                // YYYY-MM

    // ── Tier 1: edits/ -- timestamped per save ──────────────────────────────
    await createMirrorFile(editsFolder, `${label}_${ts}.json`, jsonBlob, token);
    await pruneFolder(editsFolder, TIER_EDITS, token);

    // ── Tier 2: daily/ -- one file per edit-day, overwrite same day ──────────
    const dailyName = `${label}_${today}.json`;
    await upsertMirrorFile(dailyFolder, dailyName, jsonBlob, token);
    await pruneFolder(dailyFolder, TIER_DAYS, token);

    // ── Tier 3: monthly/ -- one file per edit-month, overwrite same month ────
    const monthlyName = `${label}_${month}.json`;
    await upsertMirrorFile(monthlyFolder, monthlyName, jsonBlob, token);
    await pruneFolder(monthlyFolder, TIER_MONTHS, token);

  } catch { /* non-blocking mirror -- never fail main save */ }
}

async function createMirrorFile(folderId, name, jsonBlob, token) {
  const meta    = JSON.stringify({ name, parents: [folderId] });
  const form    = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', new Blob([jsonBlob], { type: 'application/json' }));
  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
}

async function upsertMirrorFile(folderId, name, jsonBlob, token) {
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
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: jsonBlob
      }
    );
  } else {
    // Create new
    await createMirrorFile(folderId, name, jsonBlob, token);
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
    }).catch(() => {});
  }
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
  const ts       = timestampSuffix();
  const label    = appName === 'travel' ? 'Travel' : 'Finance';
  const filename = `${label}_Backup_${ts}.json`;
  const blob     = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Timestamp suffix helper -- YYYY-MM-DD_HH-MM ───────────────────────────────
export function timestampSuffix() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
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
