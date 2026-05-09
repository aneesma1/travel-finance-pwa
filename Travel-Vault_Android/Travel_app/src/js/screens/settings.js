// v4.13.0 — 2026-05-09 — Remove sync folder Restore button (use JSON backup restore instead)
// ─── app-a-family-hub/js/screens/settings.js ────────────────────────────────
// Settings screen — People, Data, Security, Account tabs

'use strict';

import { getCachedTravelData, setCachedTravelData, clearAllCachedData } from '../../shared/db.js';
import { localSave } from '../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { isAdmin, renderAccessControl } from '../roles.js';
import { uuidv4, formatDisplayDate, showToast, toISODate, showConfirmModal, showInputModal } from '../../shared/utils.js';
import { renderImportTool } from '../../shared/import-tool.js';
import { downloadLocalBackup, restoreFromLocalFile, hasPublicStorageAccess, requestPublicStorage, syncFolderWrite } from '../../shared/drive.js';
import { openPersonManage } from './person-manage.js';
import { exitApp } from '../../shared/app-utils.js';
import { exportEncryptedBackup, importEncryptedBackup } from '../../shared/backup-engine.js';

const MEMBER_EMOJIS = ['👤', '👨', '👩', '🧑', '👦', '👧', '🧔', '👱', '🧒'];
const MEMBER_COLORS = ['#EEF2FF', '#D1FAE5', '#FEF3C7', '#FCE7F3', '#E0F2FE', '#F3E8FF'];

// ── Main entry ────────────────────────────────────────────────────────────────
export async function renderSettings(container, params = {}) {
  const { tab: activeTab = 'people' } = params;
  const data = await getCachedTravelData();
  const { members = [] } = data || {};

  const tabs = ['people', 'data', 'account'];
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
      <button id="header-exit-btn" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">💾 Save &amp; Exit</button>
    </div>
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 4px;">
      ${tabs.map(id => `
        <button class="settings-tab ${activeTab === id ? 'active' : ''}" data-tab="${id}"
          style="flex:1;padding:12px 4px;border:none;background:none;cursor:pointer;
            font-size:11px;font-weight:600;font-family:inherit;
            color:${activeTab === id ? 'var(--primary)' : 'var(--text-muted)'};
            border-bottom:2px solid ${activeTab === id ? 'var(--primary)' : 'transparent'};
            transition:all 0.15s;">
          ${id === 'people' ? '👥 People' : id === 'data' ? '💾 Data' : '👤 Account'}
        </button>`).join('')}
    </div>
    <div id="tab-content" style="padding-bottom:32px;"></div>
    <input type="file" id="restore-file-input" accept=".json" style="display:none;" />
  `;

  document.getElementById('header-exit-btn')?.addEventListener('click', async () => {
    showToast('Saving & exiting…', 'info', 1500);
    await new Promise(r => setTimeout(r, 800));
    await exitApp();
  });

  // Reset the global modal to hidden state when navigating to settings
  const globalModal = document.getElementById('member-modal');
  if (globalModal) {
    globalModal.classList.add('hidden');
    globalModal.innerHTML = '';
  }

  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  if (activeTab === 'people') renderPeopleTab(container, data, members, null);
  else if (activeTab === 'data') renderDataTab(data, members, container);
  else if (activeTab === 'account') renderAccountTab(data, members, null, container);
}

// ── PEOPLE TAB ────────────────────────────────────────────────────────────────
function renderPeopleTab(container, data, members, user) {
  const tab = document.getElementById('tab-content');
  const dupeWarn = buildDupeWarning(members);
  tab.innerHTML = `
    ${dupeWarn}
    <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;padding-right:16px;">
      <span>Family Members</span>
      <button class="btn btn-primary" style="padding:6px 14px;font-size:12px;" id="add-member-btn">+ Add</button>
    </div>
    <div id="members-list" style="padding:0 16px;display:flex;flex-direction:column;gap:8px;"></div>
    ${isAdmin() ? `
    <div class="section-title" style="margin-top:16px;">Passenger Management</div>
    <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
      <div class="list-row" id="manage-people-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
        <span style="font-size:20px;">🔀</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Rename &amp; Merge Passengers</div>
          <div style="font-size:12px;color:var(--text-muted);">Fix misspellings, merge duplicate entries</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="access-control-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">👑</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Manage Access</div>
          <div style="font-size:12px;color:var(--text-muted);">Set Admin or Viewer roles per person</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>` : ''}
  `;

  renderMembersList(members);

  document.getElementById('add-member-btn')?.addEventListener('click', () =>
    navigate('person-profile', { mode: 'new' }));

  document.getElementById('manage-people-btn')?.addEventListener('click', () =>
    openPersonManage(() => renderSettings(container, { tab: 'people' })));

  document.getElementById('access-control-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('member-modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="modal-sheet" style="max-height:85vh;">
        <div class="modal-handle"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 12px;">
          <span style="font-size:16px;font-weight:700;">👥 Family Access</span>
          <button id="close-access" style="background:none;border:none;font-size:22px;cursor:pointer;">×</button>
        </div>
        <div id="access-control-container" style="overflow-y:auto;max-height:60vh;"></div>
      </div>`;
    document.getElementById('close-access').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    const onSave = async (newData) => {
      const saved = await localSave('travel', () => newData);
      await setCachedTravelData(saved);
      showToast('Access updated', 'success');
      renderAccessControl(document.getElementById('access-control-container'), saved, '', onSave);
    };
    renderAccessControl(document.getElementById('access-control-container'), data, '', onSave);
  });
}

function buildDupeWarning(members) {
  const dupes = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i].name.toLowerCase().trim();
      const b = members[j].name.toLowerCase().trim();
      const dp = Array.from({ length: a.length + 1 }, (_, r) =>
        Array.from({ length: b.length + 1 }, (_, c) => r === 0 ? c : c === 0 ? r : 0));
      for (let r = 1; r <= a.length; r++)
        for (let c = 1; c <= b.length; c++)
          dp[r][c] = a[r - 1] === b[c - 1] ? dp[r - 1][c - 1] : 1 + Math.min(dp[r - 1][c], dp[r][c - 1], dp[r - 1][c - 1]);
      if (dp[a.length][b.length] <= 2)
        dupes.push('"' + members[i].name + '" and "' + members[j].name + '"');
    }
  }
  if (!dupes.length) return '';
  return '<div style="margin:12px 16px 0;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:10px 14px;">' +
    '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:4px;">⚠️ Possible duplicate names</div>' +
    dupes.map(d => '<div style="font-size:12px;color:#78350F;">' + d + ' — use Rename &amp; Merge to fix</div>').join('') +
    '</div>';
}

function renderMembersList(members) {
  const list = document.getElementById('members-list');
  if (!list) return;
  if (!members.length) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:8px 4px;">No family members added yet</div>';
    return;
  }
  list.innerHTML = members.map(m => `
    <div class="card" style="padding:0;">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;">
        <div style="width:40px;height:40px;border-radius:50%;background:${m.color || '#EEF2FF'};display:flex;align-items:center;justify-content:center;font-size:20px;">
          ${m.photo?.startsWith('data:') ? `<img src="${m.photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />` : (m.emoji || '👤')}
        </div>
        <div style="flex:1;"><div style="font-size:15px;font-weight:600;">${m.name}</div></div>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" data-edit="${m.id}">Edit</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => navigate('person-profile', { memberId: btn.dataset.edit, mode: 'view' })));
}

// ── DATA TAB ──────────────────────────────────────────────────────────────────
function renderDataTab(data, members, container) {
  const tab = document.getElementById('tab-content');
  tab.innerHTML = `
    <div class="section-title">Data Management</div>
    <div class="card" style="margin:0 16px;overflow:visible;">
      <div class="list-row" id="backup-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
        <span style="font-size:20px;">💾</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Backup Now</div><div style="font-size:12px;color:var(--text-muted);">Download JSON to device</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="restore-local-btn">
        <span style="font-size:20px;">📂</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Restore from Local Backup</div><div style="font-size:12px;color:var(--text-muted);">Pick a downloaded backup file</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="import-excel-btn">
        <span style="font-size:20px;">📊</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div><div style="font-size:12px;color:var(--text-muted);">Import travel history from spreadsheet</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="photo-zip-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">📦</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Export All Photos as ZIP</div><div style="font-size:12px;color:var(--text-muted);">Document scans, address photos</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>

    <div class="section-title" style="margin-top:24px;">📁 Sync Folder</div>
    <div class="card" style="margin:0 16px;overflow:visible;">
      <div style="padding:14px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;">All Files Access</span>
          <span id="sync-perm-badge" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:#E5E7EB;color:#374151;">Checking…</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;word-break:break-all;overflow-wrap:break-word;">📂 /storage/emulated/0/Documents/TravelHub/sync_folder/</div>
        <div id="sync-grant-row" style="display:none;margin-bottom:10px;">
          <button id="sync-grant-btn" class="btn btn-secondary btn-full" style="font-size:13px;">🔓 Grant All Files Access</button>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:center;">Android Settings → Special App Access → All Files Access</div>
        </div>
        <div style="margin-bottom:8px;">
          <button id="sync-now-btn" class="btn btn-primary btn-full" style="font-size:13px;">🔄 Sync Now</button>
        </div>
        <div id="sync-last-time" style="font-size:11px;color:var(--text-muted);text-align:center;min-height:16px;"></div>
      </div>
    </div>

    <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
    <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
      <div class="list-row" id="clear-cache-btn" style="border:none;border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:1px solid var(--border);">
        <span style="font-size:20px;">🧹</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;color:var(--text);">Clear App Cache</div>
          <div style="font-size:11px;color:var(--text-muted);">Clears service-worker & temp caches. Your data is kept.</div>
        </div>
        <span style="color:var(--text-muted);font-weight:700;font-size:12px;">CLEAR</span>
      </div>
      <div class="list-row" id="reset-db-btn" style="border:none;border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">🔥</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
          <div style="font-size:11px;color:var(--text-muted);">Permanently deletes ALL travel records &amp; cache. Irreversible.</div>
        </div>
        <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
      </div>
    </div>
    <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
      ⚠️ <b>Clear App Cache</b> = remove temp files only (data is safe). <b>Reset All Data</b> = wipe everything permanently. Always <b>Backup Now</b> before resetting.
    </div>
  `;

  document.getElementById('backup-btn').addEventListener('click', async () => {
    const cached = await getCachedTravelData();
    if (!cached) { showToast('No data to backup', 'warning'); return; }
    downloadLocalBackup('travel', cached);
    showToast('Backup downloaded!', 'success');
  });

  document.getElementById('restore-local-btn').addEventListener('click', () =>
    document.getElementById('restore-file-input').click());

  document.getElementById('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('This will overwrite your current trip records. Continue?')) return;
    try {
      showToast('Restoring…', 'info', 2000);
      const restored = await restoreFromLocalFile(file, 'travel');
      await setCachedTravelData(restored);
      showToast('Restored!', 'success');
      navigate('dashboard');
    } catch (err) { showToast('Restore failed: ' + err.message, 'error'); }
  });

  document.getElementById('import-excel-btn').addEventListener('click', () => {
    openImportModal(data, members);
  });

  document.getElementById('photo-zip-btn').addEventListener('click', async () => {
    try {
      showToast('Preparing photos…', 'info', 2000);
      const cached = await getCachedTravelData();
      if (!cached) { showToast('No data found', 'warning'); return; }
      if (!window.JSZip) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const zip = new window.JSZip();
      let count = 0;
      (cached.members || []).forEach(m => {
        if (m.photo?.startsWith('data:')) {
          zip.folder('profiles').file((m.name || 'member') + '_profile.jpg', m.photo.split(',')[1], { base64: true });
          count++;
        }
      });
      (cached.documents || []).forEach(doc => {
        const mn = (cached.members || []).find(m => m.id === doc.personId)?.name || 'unknown';
        (doc.photos || []).forEach((p, i) => {
          if (p?.startsWith('data:')) {
            zip.folder('documents').file(mn + '_' + (doc.docName || 'doc') + '_' + (i === 0 ? 'front' : 'back') + '.jpg', p.split(',')[1], { base64: true });
            count++;
          }
        });
      });
      if (count === 0) { showToast('No photos found', 'warning'); return; }
      const ts = new Date().toISOString().replace('T', '_').slice(0, 16).replace(':', '-');
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Travel_Photos_' + ts + '.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('✅ ' + count + ' photos exported', 'success');
    } catch (err) { showToast('ZIP failed: ' + err.message, 'error'); }
  });


  document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
    if (!confirm('Clear app cache? Your travel data will NOT be deleted.')) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      sessionStorage.clear();
      showToast('Cache cleared. Reloading…', 'success');
      setTimeout(() => window.location.reload(true), 1200);
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    }
  });

  document.getElementById('reset-db-btn').addEventListener('click', async () => {
    const doubleConfirm = confirm('☢️ NUCLEAR RESET: This will PERMANENTLY DELETE all local travel data from this device.\n\n✅ Your backup files in Documents/TravelHub/ are NOT affected.\n\nProceed to wipe everything?');
    if (!doubleConfirm) return;
    const tripleConfirm = confirm('Are you 100% sure? All history will be lost forever.');
    if (!tripleConfirm) return;
    try {
      await clearAllCachedData();
      localStorage.clear();
      sessionStorage.clear();
      showToast('☢️ TOTAL WIPE COMPLETE', 'success');
      setTimeout(() => window.location.href = './', 1500);
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'error');
    }
  });

  // ── Sync Folder section ───────────────────────────────────────────────────
  (async () => {
    const badge    = document.getElementById('sync-perm-badge');
    const grantRow = document.getElementById('sync-grant-row');
    const lastEl   = document.getElementById('sync-last-time');

    const updatePermBadge = async () => {
      const granted = await hasPublicStorageAccess();
      if (badge) {
        badge.textContent  = granted ? '✅ Granted' : '⚠️ Not granted';
        badge.style.background = granted ? '#D1FAE5' : '#FEF3C7';
        badge.style.color      = granted ? '#065F46' : '#92400E';
      }
      if (grantRow) grantRow.style.display = granted ? 'none' : 'block';
      return granted;
    };
    await updatePermBadge();

    const raw = localStorage.getItem('syncFolder_lastSync_travel');
    if (raw && lastEl) {
      lastEl.textContent = 'Last sync: ' + new Date(raw).toLocaleString();
    }

    document.getElementById('sync-grant-btn')?.addEventListener('click', async () => {
      showToast('Opening Android settings…', 'info', 1500);
      const granted = await requestPublicStorage();
      await updatePermBadge();
      if (granted) showToast('✅ All Files Access granted!', 'success');
      else showToast('Permission not granted — tap Allow in Settings', 'warning');
    });

    document.getElementById('sync-now-btn')?.addEventListener('click', async () => {
      const cached = await getCachedTravelData();
      if (!cached) { showToast('No data to sync', 'warning'); return; }
      showToast('Syncing…', 'info', 1500);
      const path = await syncFolderWrite('travel', cached);
      if (path) {
        const ts = new Date().toLocaleString();
        if (lastEl) lastEl.textContent = 'Last sync: ' + ts;
        showToast('✅ Synced to ' + path, 'success', 4000);
      } else {
        showToast('⚠️ Sync failed — check Files Access permission', 'warning');
      }
    });

  })();
}

// Security tab removed in favour of complete local architecture.


// ── ACCOUNT TAB ───────────────────────────────────────────────────────────────
function renderAccountTab(data, members, user, container) {
  const tab = document.getElementById('tab-content');
  tab.innerHTML = `
    <div class="section-title">Account</div>
    <div class="card" style="margin:0 16px;">
      <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
        <div style="font-size:14px; font-weight:700; text-align:center;">Local-First Edition</div>
        <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:8px;">
           Your data is securely stored directly on this device.
        </div>
        <div style="border-top:1px dashed var(--border); margin:8px 0;"></div>
        
        <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:var(--primary);">👨‍👩‍👧 Encrypted Backup Sharing</div>
        <button class="btn btn-secondary btn-full" id="export-vaultbox-btn">📤 Export Encrypted Travelbox</button>
        <div style="font-size:10px; color:var(--text-muted); margin-top:6px; text-align:center;">
           Generate a secure, password-protected file to share via WhatsApp.
        </div>
        
        <button class="btn btn-secondary btn-full" id="import-vaultbox-btn" style="margin-top:12px; border-style: dashed;">📥 Import Travelbox File</button>
      </div>
    </div>
    <div class="section-title" style="margin-top:16px;">App Info</div>
    <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
      <div class="card-body" style="font-size:12px;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">
      <div>Version: ${window.APP_VERSION || 'v5.5.0'}</div>
      <div>Build: ${window.BUILD_TIME || 'Offline Build'}</div>
      <div>Platform: Native Android</div>
    </div>
Members: ${members.length} · Trips: ${data?.trips?.length || 0} · Docs: ${data?.documents?.length || 0}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Role: Device Owner</div>
      
        <div style="margin-top:12px; display:flex; gap:10px;">
          <button id="repair-data-btn" class="btn btn-secondary" style="flex:1; padding:10px; font-size:11px;">🔍 Verify & Repair Data</button>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:8px; text-align:center;">
          Merges duplicate trip entries and creates any missing companion records. Local only — does not affect Google Drive.
        </div>
      </div>
    </div>`;

  // --- Account Tab Listeners ---
  document.getElementById('export-vaultbox-btn')?.addEventListener('click', async () => {
    const data = await getCachedTravelData();
    exportEncryptedBackup('travel', data);
  });

  document.getElementById('import-vaultbox-btn')?.addEventListener('click', () => {
    importEncryptedBackup('travel');
  });

  document.getElementById('repair-data-btn')?.addEventListener('click', async () => {
    const ok = await showConfirmModal('🔍 Scan & Repair Data?', 'This tool will:\n1. Merge exact duplicate trip entries\n2. Create missing travel records for companions\n\nThis will permanently update your data.', {
      confirmText: 'Run Health Check'
    });
    if (!ok) return;

    try {
      showToast('Scanning trip data…', 'info');
      const newData = await localSave('travel', (remote) => {
        let trips = [...(remote.trips || [])];
        const passengers = remote.passengers || [];
        const nameToId = {};
        passengers.forEach(p => { if (p.name) nameToId[p.name.toLowerCase().trim()] = p.id; });

        const seen = new Set();
        const nonDupes = [];
        let mergedCount = 0;

        trips.forEach(t => {
          const d = toISODate(t.dateLeftOrigin || t.dateArrivedDest);
          const key = `${t.passengerId || t.passengerName}|${d}|${t.destinationCountry}`;
          if (seen.has(key)) {
            mergedCount++;
            const original = nonDupes.find(x => `${x.passengerId || x.passengerName}|${toISODate(x.dateLeftOrigin || x.dateArrivedDest)}|${x.destinationCountry}` === key);
            if (original && (!original.photos?.length && t.photos?.length)) {
              nonDupes[nonDupes.indexOf(original)] = t;
            }
          } else {
            seen.add(key);
            nonDupes.push(t);
          }
        });
        trips = nonDupes;

        let repairedCount = 0;
        const tripsToAdd = [];
        trips.forEach(t => {
          const tDate = toISODate(t.dateLeftOrigin || t.dateArrivedDest);
          if (!tDate) return;
          const companionIdsSet = new Set(Array.isArray(t.travelWith) ? t.travelWith : []);
          const namesStr = Array.isArray(t.travelWithNames) ? t.travelWithNames.join(', ') : String(t.travelWithNames || '');
          namesStr.split(/[,;]+/).forEach(n => {
            const clean = n.trim().toLowerCase();
            if (clean && nameToId[clean]) companionIdsSet.add(nameToId[clean]);
          });
          companionIdsSet.delete(t.passengerId);
          companionIdsSet.forEach(cid => {
            const hasTrip = trips.some(other =>
              (other.passengerId === cid || (other.passengerName && nameToId[other.passengerName.toLowerCase().trim()] === cid)) &&
              toISODate(other.dateLeftOrigin || other.dateArrivedDest) === tDate
            );
            if (!hasTrip) {
              const companion = passengers.find(p => p.id === cid);
              tripsToAdd.push({
                ...t, id: uuidv4(),
                passengerId: cid, passengerName: companion?.name || 'Unknown',
                travelWith: [t.passengerId, ...Array.from(companionIdsSet).filter(tid => tid !== cid)],
                travelWithNames: [t.passengerName, ...Array.from(companionIdsSet).map(tid => passengers.find(p => p.id === tid)?.name).filter(n => n && n !== companion?.name)].filter(Boolean).join(', '),
                timestamp: new Date().toISOString()
              });
              repairedCount++;
            }
          });
        });
        window._repairSummary = { merged: mergedCount, repaired: repairedCount };
        return { ...remote, trips: [...trips, ...tripsToAdd] };
      });

      await setCachedTravelData(newData);
      const { merged, repaired } = window._repairSummary || {};
      const summary = `<div style="text-align:left; font-size:14px; line-height:1.6;">• Duplicates Merged: <b>${merged}</b><br/>• Missing Records Created: <b>${repaired}</b><br/><div style="margin-top:12px; padding:10px; background:var(--primary-bg); border-radius:8px; border-left:4px solid var(--primary); font-size:12px;">✅ Your database is now clean and consistent.</div></div>`;
      await showConfirmModal('✅ Repair Complete', summary, { confirmText: 'Done', cancelText: '' });
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      showToast('Repair failed: ' + err.message, 'error');
      console.error(err);
    }
  });

  document.getElementById('force-update-btn')?.addEventListener('click', async () => {
    if (confirm('This will unregister the Service Worker and hard-reload the app. Continue?')) {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      await clearAllCachedData();
      localStorage.clear();
      window.location.reload(true);
    }
  });
}

// ── Import modal ──────────────────────────────────────────────────────────────
// SIMPLIFIED: Import trips as-is. Store personName directly. No person-linking.
function openImportModal(data, persons) {
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh;display:flex;flex-direction:column;">
      <div class="modal-handle" style="flex-shrink:0;"></div>
      <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 20px 8px;">
        <span style="font-size:16px;font-weight:700;">Import Travel Data</span>
        <button id="close-import" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">×</button>
      </div>
      <div id="import-status" style="flex-shrink:0;display:none;padding:10px 20px;font-size:14px;font-weight:600;"></div>
      <div id="import-tool-container" style="overflow-y:auto;flex:1;min-height:0;"></div>
      <div id="import-action-bar" style="display:none;flex-shrink:0;padding:12px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));background:var(--surface);border-top:1px solid var(--border);"></div>
    </div>`;

  let importInProgress = false;

  document.getElementById('close-import').addEventListener('click', () => {
    if (importInProgress && !confirm('Import in progress. Close anyway?')) return;
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', e => {
    if (e.target === modal && !importInProgress) modal.classList.add('hidden');
  });

  const toolContainer = document.getElementById('import-tool-container');
  const statusBar = document.getElementById('import-status');

  const setStatus = (msg, color) => {
    statusBar.style.display = 'block';
    statusBar.textContent = msg;
    statusBar.style.color = color || 'var(--text-secondary)';
  };

  renderImportTool(toolContainer, {
    appType: 'travel',
    existingData: data,
    onImportComplete: async (records, progressCb) => {
      importInProgress = true;
      setStatus(`Importing ${records.length} records…`);

      let imported = 0, skipped = 0;

      try {
        const newData = await localSave('travel', remote => {
          const trips = [...(remote.trips || [])];
          const passengers = [...(remote.passengers || remote.travelPersons || [])];

          const getOrAddPassenger = (nameStr) => {
            const n = (nameStr || '').trim();
            if (!n) return null;
            let p = passengers.find(x => x.name?.toLowerCase() === n.toLowerCase());
            if (!p) {
              p = { id: uuidv4(), name: n, emoji: '👤' };
              passengers.push(p);
            }
            return p;
          };

          const existingKeys = new Set(
            trips.map(t => ((t.passengerName || '').toLowerCase().trim()) + '|' + toISODate(t.dateLeftOrigin))
          );

          records.forEach(rec => {
            const primaryName = (rec.personName || 'Unknown').trim();
            const dateStr = rec.dateOut || rec.dateIn;
            if (!dateStr) { skipped++; return; }

            const doi = toISODate(dateStr);

            const companionsRaw = [
              rec.accompanied1, rec.accompanied2, rec.accompanied3, rec.accompanied4
            ].map(n => String(n || '').trim()).filter(Boolean);

            if (rec.travelWith) {
              const legacy = String(rec.travelWith).split(/[,;]+/).map(n => n.trim()).filter(Boolean);
              companionsRaw.push(...legacy);
            }

            const allNames = [...new Set([primaryName, ...companionsRaw])];
            const resolvedPersons = allNames.map(n => getOrAddPassenger(n)).filter(Boolean);

            resolvedPersons.forEach(person => {
              const key = person.name.toLowerCase() + '|' + doi;
              if (existingKeys.has(key)) { skipped++; return; }
              existingKeys.add(key);

              const companionsForThis = resolvedPersons
                .filter(p => p.id !== person.id)
                .map(p => p.name)
                .join(', ');

              const companionIds = resolvedPersons
                .filter(p => p.id !== person.id)
                .map(p => p.id);

              trips.push({
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                passengerId: person.id,
                passengerName: person.name,
                originCountry: rec.origin || 'India',
                destinationCountry: rec.destination || 'Qatar',
                dateLeftOrigin: rec.dateOut || rec.dateIn,
                dateArrivedDest: rec.dateIn || rec.dateOut,
                flightNumber: rec.flightDetails || '',
                reason: rec.reason || '',
                travelWith: companionIds,
                travelWithNames: companionsForThis,
                photos: []
              });
              imported++;
            });
          });

          return { ...remote, trips, passengers };
        });

        await setCachedTravelData(newData);
        const msg = imported > 0
          ? '✅ ' + imported + ' trips imported!' + (skipped > 0 ? ' (' + skipped + ' duplicates skipped)' : '')
          : '⚠️ 0 imported — all ' + skipped + ' already exist';
        setStatus(msg, imported > 0 ? 'var(--success)' : 'var(--warning)');
        progressCb(imported, skipped);
        importInProgress = false;
        toolContainer.scrollTop = 0;
        return { imported, skipped };
      } catch (err) {
        importInProgress = false;
        console.error('[travel-import] Save failed:', err);
        setStatus('❌ Failed: ' + (err.message || 'Unknown error during save'), 'var(--danger)');
        throw err;
      }
    }
  });

  toolContainer.addEventListener('import:complete', () => {
    setTimeout(() => {
      modal.classList.add('hidden');
      navigate('travel-log');
      showToast('Import complete! Travel log updated.', 'success');
    }, 1200);
  });
}
