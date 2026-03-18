// v2.3 — 2026-03-18
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
    // Precondition failed — mid-air collision
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

// ── Mirror snapshot write ─────────────────────────────────────────────────────
async function writeMirrorSnapshot(appName, fullData) {
  const mirrorId = localStorage.getItem(
    appName === 'travel' ? KEYS.travelMirrorId : KEYS.financeMirrorId
  );
  if (!mirrorId) return;

  let snapshots = [];
  try {
    const { data } = await fetchJsonFile(mirrorId);
    snapshots = Array.isArray(data) ? data : [];
  } catch { snapshots = []; }

  const recordCount = appName === 'travel'
    ? (fullData.trips?.length || 0) + (fullData.documents?.length || 0)
    : (fullData.transactions?.length || 0);

  // Prepend new snapshot, keep last N
  snapshots.unshift({
    timestamp:   new Date().toISOString(),
    recordCount,
    data:        fullData
  });
  snapshots = snapshots.slice(0, MIRROR_SNAPSHOTS);

  await updateJsonFile(mirrorId, snapshots);
}

// ── Restore from mirror ───────────────────────────────────────────────────────
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
  const date     = new Date().toISOString().split('T')[0];
  const filename = `${appName}_backup_${date}.json`;
  const blob     = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = filename;
  a.click();
  URL.revokeObjectURL(url);
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
