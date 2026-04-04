// v4.0.0 — 2026-04-04
// ─── app-a-family-hub/js/screens/settings.js ────────────────────────────────
// Settings screen — People, Data, Security, Account tabs

'use strict';

import { getCachedTravelData, setCachedTravelData, clearAllCachedData } from '../../../shared/db.js';
import { downloadLocalBackup, restoreFromLocalFile, getMirrorSnapshots, restoreFromMirror, writeData, getBackupHealthReport } from '../../../shared/drive.js';
import { localSave, clearDriveQueue } from '../../../shared/sync-manager.js';
import { clearAuth, getUser } from '../../../shared/auth.js';
import { navigate } from '../router.js';
import { isAdmin, renderAccessControl } from '../roles.js';
import { getActiveSessions, getActivityLog } from '../../../shared/security-log.js';
import { uuidv4, formatDisplayDate, showToast, isOnline, toISODate } from '../../../shared/utils.js';
import { authFetch } from '../../../shared/auth.js';
import { renderImportTool } from '../../../shared/import-tool.js';
import { openPersonManage } from './person-manage.js';
import { exitApp } from '../../../shared/app-utils.js';

const MEMBER_EMOJIS = ['👤','👨','👩','🧑','👦','👧','🧔','👱','🧒'];
const MEMBER_COLORS = ['#EEF2FF','#D1FAE5','#FEF3C7','#FCE7F3','#E0F2FE','#F3E8FF'];

// ── Main entry ────────────────────────────────────────────────────────────────
export async function renderSettings(container, params = {}) {
  const { tab: activeTab = 'people' } = params;
  const data = await getCachedTravelData();
  const { members = [] } = data || {};
  const user = getUser();

  const tabs = ['people','data','security','account'];
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 4px;">
      ${tabs.map(id => `
        <button class="settings-tab ${activeTab===id?'active':''}" data-tab="${id}"
          style="flex:1;padding:12px 4px;border:none;background:none;cursor:pointer;
            font-size:11px;font-weight:600;font-family:inherit;
            color:${activeTab===id?'var(--primary)':'var(--text-muted)'};
            border-bottom:2px solid ${activeTab===id?'var(--primary)':'transparent'};
            transition:all 0.15s;">
          ${id==='people'?'👥 People':id==='data'?'💾 Data':id==='security'?'🔐 Security':'👤 Account'}
        </button>`).join('')}
    </div>
    <div id="tab-content" style="padding-bottom:32px;"></div>
    <input type="file" id="restore-file-input" accept=".json" style="display:none;" />
  `;

  // Reset the global modal to hidden state when navigating to settings
  const globalModal = document.getElementById('member-modal');
  if (globalModal) {
    globalModal.classList.add('hidden');
    globalModal.innerHTML = '';
  }

  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  if      (activeTab === 'people')   renderPeopleTab(container, data, members, user);
  else if (activeTab === 'data')     renderDataTab(data, members, container);
  else if (activeTab === 'security') renderSecurityTab();
  else if (activeTab === 'account')  renderAccountTab(data, members, user, container);
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
      renderAccessControl(document.getElementById('access-control-container'), saved, getUser()?.email || '', onSave);
    };
    renderAccessControl(document.getElementById('access-control-container'), data, user?.email || '', onSave);
  });
}

function buildDupeWarning(members) {
  const dupes = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i].name.toLowerCase().trim();
      const b = members[j].name.toLowerCase().trim();
      const dp = Array.from({length:a.length+1}, (_,r) =>
        Array.from({length:b.length+1}, (_,c) => r===0?c:c===0?r:0));
      for (let r=1;r<=a.length;r++)
        for (let c=1;c<=b.length;c++)
          dp[r][c]=a[r-1]===b[c-1]?dp[r-1][c-1]:1+Math.min(dp[r-1][c],dp[r][c-1],dp[r-1][c-1]);
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
        <div style="width:40px;height:40px;border-radius:50%;background:${m.color||'#EEF2FF'};display:flex;align-items:center;justify-content:center;font-size:20px;">
          ${m.photo?.startsWith('data:') ? `<img src="${m.photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />` : (m.emoji||'👤')}
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
      <div class="list-row" id="restore-mirror-btn">
        <span style="font-size:20px;">☁️</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Restore from Drive Mirror</div><div style="font-size:12px;color:var(--text-muted);">Choose from last 3 snapshots</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="import-btn">
        <span style="font-size:20px;">📥</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div><div style="font-size:12px;color:var(--text-muted);">Migrate existing travel data</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="photo-zip-btn">
        <span style="font-size:20px;">📦</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Export All Photos as ZIP</div><div style="font-size:12px;color:var(--text-muted);">Document scans, address photos</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="clear-cache-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">🗑️</span>
        <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Clear Local Cache</div><div style="font-size:12px;color:var(--text-muted);">Force fresh re-download from Drive</div></div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>

    <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
    <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
      <div class="list-row" id="reset-db-btn" style="border:none;border-radius:var(--radius-lg);">
        <span style="font-size:20px;">🔥</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
          <div style="font-size:11px;color:var(--text-muted);">Permanently delete all travel records.</div>
        </div>
        <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
      </div>
    </div>
    <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
      ⚠️ Resetting will wipe your local cache <b>and</b> your Drive mirror. This is irreversible. Please <b>Backup Now</b> before resetting.
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

  document.getElementById('restore-mirror-btn').addEventListener('click', async () => {
    if (!isOnline()) { showToast('Internet required', 'warning'); return; }
    try {
      const snaps = await getMirrorSnapshots('travel');
      if (!snaps.length) { showToast('No snapshots found', 'warning'); return; }
      showMirrorModal(snaps);
    } catch { showToast('Could not load snapshots', 'error'); }
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    const freshData = await getCachedTravelData();
    const freshPersons = freshData?.travelPersons || [];
    openImportModal(freshData, freshPersons);
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
      (cached.members||[]).forEach(m => {
        if (m.photo?.startsWith('data:')) {
          zip.folder('profiles').file((m.name||'member')+'_profile.jpg', m.photo.split(',')[1], {base64:true});
          count++;
        }
      });
      (cached.documents||[]).forEach(doc => {
        const mn = (cached.members||[]).find(m=>m.id===doc.personId)?.name||'unknown';
        (doc.photos||[]).forEach((p,i) => {
          if (p?.startsWith('data:')) {
            zip.folder('documents').file(mn+'_'+(doc.docName||'doc')+'_'+(i===0?'front':'back')+'.jpg', p.split(',')[1], {base64:true});
            count++;
          }
        });
      });
      if (count===0) { showToast('No photos found', 'warning'); return; }
      const ts = new Date().toISOString().replace('T','_').slice(0,16).replace(':','-');
      const blob = await zip.generateAsync({type:'blob'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Travel_Photos_'+ts+'.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('✅ '+count+' photos exported', 'success');
    } catch (err) { showToast('ZIP failed: '+err.message, 'error'); }
  });


  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    if (!confirm('Clear local cache? Drive data is safe. App will re-download on next open.')) return;
    await clearAllCachedData();
    showToast('Cache cleared — reloading…', 'success');
    setTimeout(() => window.location.reload(), 1200);
  });

  document.getElementById('reset-db-btn').addEventListener('click', async () => {
    const doubleConfirm = confirm('☢️ NUCLEAR RESET: This will PERMANENTLY DELETE all local travel data AND your Google Drive cloud records.\n\nProceed to wipe everything?');
    if (!doubleConfirm) return;
    const tripleConfirm = confirm('Are you 100% sure? All history will be lost forever.');
    if (!tripleConfirm) return;

    try {
      showToast('Wiping cloud database clean…', 'info', 5000);
      const emptySet = { 
        schemaVersion: 1,
        trips: [], 
        passengers: [], 
        members: [], 
        documents: [], 
        familyDefaults: {},
        familyRelations: [],
        customDocTypes: [],
        appInfo: { version: 'v4.0.0', lastReset: new Date().toISOString() } 
      };
      
      const fileId = localStorage.getItem('drive_travel_file_id');
      if (isOnline() && fileId) {
        // 1. Wipe Cloud Sync Queue (the primary cause of data reappearing)
        await clearDriveQueue();

        // 2. Wipe main Drive data file
        await authFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emptySet, null, 2)
        });
      }
      
      // 3. Wipe local IndexedDB entirely
      await clearAllCachedData();

      // 4. Wipe Service Worker & Cache
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // 5. Final Clear-All of LocalStorage (removes file IDs, forcing re-init)
      localStorage.clear();
      sessionStorage.clear();

      showToast('☢️ TOTAL WIPE COMPLETE', 'success');
      setTimeout(() => window.location.href = './', 1500);
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'error');
      console.error('Reset error:', err);
    }
  });

  document.getElementById('force-update-btn')?.addEventListener('click', async () => {
    if (!confirm('This will unregister the Service Worker and force the app to reload fresh. Continue?')) return;
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload(true);
    } catch { window.location.reload(true); }
  });
}

// ── SECURITY TAB ──────────────────────────────────────────────────────────────
function renderSecurityTab() {
  const tab = document.getElementById('tab-content');
  tab.innerHTML = `
    <div class="section-title">Security Dashboard</div>
    <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
      <div class="list-row" id="security-dashboard-btn" style="border-radius:var(--radius-lg);">
        <span style="font-size:20px;">🛡️</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Security &amp; Access</div>
          <div style="font-size:12px;color:var(--text-muted);">Sessions · Activity log · Revoke access</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>
    <div class="section-title" style="margin-top:16px;">Session</div>
    <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
      <div class="list-row" id="safe-exit-btn" style="border-radius:var(--radius-lg);">
        <span style="font-size:20px;">🚪</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Save &amp; Exit</div>
          <div style="font-size:12px;color:var(--text-muted);">Sync data then close cleanly</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>`;

  document.getElementById('security-dashboard-btn').addEventListener('click', async () => {
    const modal = document.getElementById('member-modal');
    modal.classList.remove('hidden');
    modal.innerHTML = '<div class="modal-sheet" style="max-height:90vh;">' +
      '<div class="modal-handle"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 12px;">' +
        '<span style="font-size:16px;font-weight:700;">🛡️ Security</span>' +
        '<button id="close-sec" style="background:none;border:none;font-size:22px;cursor:pointer;">×</button>' +
      '</div>' +
      '<div id="security-content" style="overflow-y:auto;max-height:70vh;padding:0 20px 24px;">' +
        '<div style="font-size:13px;color:var(--text-muted);">Loading…</div>' +
      '</div></div>';
    document.getElementById('close-sec').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    const [sessions, log] = await Promise.all([
      getActiveSessions().catch(() => []),
      getActivityLog(30).catch(() => [])
    ]);
    const sc = document.getElementById('security-content');
    if (!sc) return;
    const ri = r => r==='high'?'🔴':r==='medium'?'🟠':r==='low'?'🟡':'🟢';
    sc.innerHTML =
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Active Sessions ('+sessions.length+')</div>' +
      (sessions.length ? sessions.map(s =>
        '<div style="background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:12px 14px;margin-bottom:8px;">' +
        '<div style="font-size:13px;font-weight:600;">'+s.userEmail+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">'+s.device+' · '+new Date(s.lastActive).toLocaleString()+'</div></div>'
      ).join('') : '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">No active sessions logged</div>') +
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Activity Log (last 30)</div>' +
      (log.length ? log.map(e =>
        '<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-light);">' +
        '<span>'+ri(e.risk)+'</span><div><div style="font-size:13px;font-weight:500;">'+e.action+'</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">'+e.detail+' · '+new Date(e.time).toLocaleString()+'</div></div></div>'
      ).join('') : '<div style="font-size:13px;color:var(--text-muted);">No activity logged yet</div>');
  });

  document.getElementById('safe-exit-btn').addEventListener('click', async () => {
    showToast('Syncing before exit…', 'info', 2000);
    await new Promise(r => setTimeout(r, 1500));
    await exitApp();
  });
}

// ── ACCOUNT TAB ───────────────────────────────────────────────────────────────
function renderAccountTab(data, members, user, container) {
  const tab = document.getElementById('tab-content');
  tab.innerHTML = `
    <div class="section-title">Signed In As</div>
    <div class="card" style="margin:0 16px;">
      <div class="card-body" style="display:flex;align-items:center;gap:12px;">
        ${user?.picture
          ? `<img src="${user.picture}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" />`
          : '<div style="width:44px;height:44px;border-radius:50%;background:var(--primary-bg);display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>'}
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.name||'Signed in'}</div>
          <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.email||''}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;color:var(--text-secondary);">Drive sync</span>
          <span style="font-size:13px;font-weight:600;color:${isOnline()?'var(--success)':'var(--warning)'};">${isOnline()?'● Online':'● Offline'}</span>
        </div>
        ${data?.lastSync?`<div style="font-size:11px;color:var(--text-muted);">Last sync: ${formatDisplayDate(data.lastSync.split('T')[0])}</div>`:''}
        <button class="btn btn-primary btn-full" style="margin-top:16px; margin-bottom:10px;" id="account-exit-btn">💾 Save & Exit App</button>
        <button class="btn btn-secondary btn-full" id="signout-btn">Sign out of Google</button>
      </div>
    </div>
    <div class="section-title" style="margin-top:16px;">App Info</div>
    <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
      <div style="font-size:13px;color:var(--text-muted);">Family Hub v3.5.47 · 2026-03-31</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v1.1 · Travel &amp; Finance PWA Suite</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Members: ${members.length} · Trips: ${data?.trips?.length||0} · Docs: ${data?.documents?.length||0}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Role: ${isAdmin()?'👑 Admin':'👁 Viewer'} · ${user?.email||'Not signed in'}</div>
      
      <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border-light);">
        <div style="display:flex; gap:10px;">
          <button id="repair-data-btn" class="btn btn-secondary" style="flex:1; padding:10px; font-size:11px;">🔍 Repair Data</button>
          <button id="backup-health-btn" class="btn btn-secondary" style="flex:1; padding:10px; font-size:11px;">📊 Backup Health</button>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:8px; text-align:center;">
          Maintenance: Repairs records & verifies Drive backup compliance.
        </div>
      </div>

      <button id="force-update-btn" style="
        margin-top:20px; width:100%; padding:10px; font-size:12px; font-weight:700;
        background:var(--danger-bg); color:var(--danger); border:1px solid var(--danger);
        border-radius:var(--radius-md); cursor:pointer;
      ">⚠️ Emergency Reset & Update App</button>
    </div>`;

  document.getElementById('repair-data-btn')?.addEventListener('click', async () => {
    const ok = await showConfirmModal('🔍 Scan & Repair Data?', 'This tool will:\n1. Merge exact duplicate entries\n2. Create missing travel records for companions\n\nThis will permanently update your data.', {
      confirmText: 'Run Health Check'
    });
    if (!ok) return;

    try {
      showToast('Scanning trip data…', 'info');
      const newData = await localSave('travel', (remote) => {
        let trips = [...(remote.trips || [])];
        const passengers = remote.passengers || [];
        
        // Build name-to-id map for repair
        const nameToId = {};
        passengers.forEach(p => { if (p.name) nameToId[p.name.toLowerCase().trim()] = p.id; });

        // --- 1. Deduplicate ---
        const seen = new Set();
        const nonDupes = [];
        let mergedCount = 0;
        
        trips.forEach(t => {
          const d = toISODate(t.dateLeftOrigin || t.dateArrivedDest);
          const key = `${t.passengerId || t.passengerName}|${d}|${t.destinationCountry}`;
          if (seen.has(key)) {
            mergedCount++;
          } else {
            seen.add(key);
            nonDupes.push(t);
          }
        });
        
        trips = nonDupes;

        // --- 2. Companion Repair (Advanced) ---
        let repairedCount = 0;
        const tripsToAdd = [];
        
        // First pass: identify missing records
        trips.forEach(t => {
          const tDate = toISODate(t.dateLeftOrigin || t.dateArrivedDest);
          if (!tDate) return;

          // Collect all potential companion names/IDs from both fields
          const companionIdsSet = new Set(Array.isArray(t.travelWith) ? t.travelWith : []);
          
          // Add from travelWithNames string/array
          const namesStr = Array.isArray(t.travelWithNames) ? t.travelWithNames.join(', ') : String(t.travelWithNames || '');
          namesStr.split(/[,;]+/).forEach(n => {
            const clean = n.trim().toLowerCase();
            if (clean && nameToId[clean]) companionIdsSet.add(nameToId[clean]);
          });

          companionIdsSet.delete(t.passengerId); // Don't duplicate self

          companionIdsSet.forEach(cid => {
            // Check if this companion already has a trip on this normalized date
            const hasTrip = trips.some(other => 
              (other.passengerId === cid || (other.passengerName && nameToId[other.passengerName.toLowerCase().trim()] === cid)) && 
              toISODate(other.dateLeftOrigin || other.dateArrivedDest) === tDate
            );
            
            if (!hasTrip) {
              // Create missing trip
              const companion = passengers.find(p => p.id === cid);
              const compTrip = {
                ...t,
                id: uuidv4(),
                passengerId: cid,
                passengerName: companion?.name || 'Unknown',
                travelWith: [
                  t.passengerId,
                  ...Array.from(companionIdsSet).filter(tid => tid !== cid)
                ],
                travelWithNames: [
                  t.passengerName,
                  ...Array.from(companionIdsSet).map(tid => passengers.find(p => p.id === tid)?.name).filter(n => n && n !== companion?.name)
                ].filter(Boolean).join(', '),
                timestamp: new Date().toISOString()
              };
              tripsToAdd.push(compTrip);
              repairedCount++;
            }
          });
        });
        
        const finalTrips = [...trips, ...tripsToAdd];
        
        window._repairSummary = { merged: mergedCount, repaired: repairedCount };
        return { ...remote, trips: finalTrips };
      });
      
      await setCachedTravelData(newData);
      const { merged, repaired } = window._repairSummary || {};
      showToast(`Success! Merged: ${merged}, Repaired: ${repaired}`, 'success', 5000);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) { 
      showToast('Repair failed: ' + err.message, 'error');
      console.error(err);
    }
  });

  document.getElementById('backup-health-btn')?.addEventListener('click', async () => {
    try {
      showToast('Scanning Drive folders…', 'info');
      const report = await getBackupHealthReport('travel');
      
      const formatBytes = (b) => {
        const bytes = Number(b);
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024*1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024*1024)).toFixed(1) + ' MB';
      };
      
      const message = `
        <div style="text-align:left; font-size:13px; line-height:1.6; color:var(--text); max-width:300px;">
          <b style="color:var(--primary); font-size:14px;">📂 Working Folder (Current)</b><br/>
          • Data File: ${report.working.mainFile ? `✅ ${report.working.mainFile.name} (${formatBytes(report.working.mainFile.size)})` : '❌ Missing'}<br/>
          • Sync Queue: ${report.working.queueActive ? '✅ Active' : '⚪ Empty'}<br/>
          • Misc Files: ${report.working.files - (report.working.mainFile ? 1 : 0) - (report.working.queueActive ? 1 : 0)} found
          
          <div style="margin:14px 0; border-top:1px solid var(--border-light); opacity:0.5;"></div>
          
          <b style="color:var(--primary); font-size:14px;">🕒 Mirror System (Historical)</b><br/>
          • <b>Edits Tier</b> (Target 5): <span style="font-weight:700; color:${report.mirror.edits.count >= 1 ? 'var(--success)' : 'var(--warning)'}">${report.mirror.edits.count} / ${report.mirror.edits.target}</span><br/>
          • <b>Daily Tier</b> (Target 5): <span style="font-weight:700; color:${report.mirror.daily.count >= 1 ? 'var(--success)' : 'var(--primary)'}">${report.mirror.daily.count} / ${report.mirror.daily.target}</span><br/>
          • <b>Monthly Tier</b> (Target 3): <span style="font-weight:700; color:${report.mirror.monthly.count >= 1 ? 'var(--success)' : 'var(--primary)'}">${report.mirror.monthly.count} / ${report.mirror.monthly.target}</span>
          
          <div style="margin-top:16px; padding:10px; background:var(--primary-bg); border-radius:8px; border-left:4px solid var(--primary);">
            <div style="font-weight:700; color:var(--primary); font-size:12px;">Compliance Feedback:</div>
            <div style="font-size:11px; margin-top:4px;">${report.status === 'Healthy' ? '✅ System is correctly mirroring and pruning data to your Google Drive.' : '⌛ System is still initializing first-time snapshots.'}</div>
          </div>
        </div>
      `;
      
      await showConfirmModal(`Status: ${report.status}`, message, { 
        confirmText: 'Done', 
        cancelText: '' 
      });
    } catch (err) {
      showToast('Health scan failed: ' + err.message, 'error');
    }
  });

  document.getElementById('force-update-btn')?.addEventListener('click', async () => {
    if (confirm('This will unregister the Service Worker and hard-reload the app. Continue?')) {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      await clearAllCachedData(); // CRITICAL: Wipe IndexedDB too
      localStorage.clear();      // Safe to clear local UI state
      window.location.reload(true);
    }
  });

  document.getElementById('account-exit-btn')?.addEventListener('click', async () => {
    showToast('Syncing before exit…', 'info', 2000);
    await new Promise(r => setTimeout(r, 1500));
    await exitApp();
  });

  document.getElementById('signout-btn').addEventListener('click', () => {
    if (confirm('Sign out?')) { clearAuth(); window.location.reload(); }
  });
}

// ── Mirror restore modal ───────────────────────────────────────────────────────
function showMirrorModal(snapshots) {
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="padding:0 20px 20px;">
        <div style="font-size:17px;font-weight:700;margin-bottom:16px;">Restore from Mirror</div>
        ${snapshots.map((s,i) => `
          <button class="list-row" data-snapshot="${i}" style="width:100%;text-align:left;border-radius:var(--radius-md);margin-bottom:8px;border:1px solid var(--border);">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">${new Date(s.timestamp).toLocaleString('en-GB')}</div>
              <div style="font-size:12px;color:var(--text-muted);">${s.recordCount} records</div>
            </div>
            <span style="color:var(--primary);font-weight:600;font-size:13px;">Restore</span>
          </button>`).join('')}
        <button class="btn btn-secondary btn-full" id="close-mirror" style="margin-top:8px;">Cancel</button>
      </div>
    </div>`;
  modal.querySelectorAll('[data-snapshot]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.snapshot);
      if (!confirm('Restore this snapshot? Current data will be overwritten.')) return;
      try {
        showToast('Restoring…', 'info', 2000);
        const restored = await restoreFromMirror('travel', idx);
        await setCachedTravelData(restored);
        showToast('Restored!', 'success');
        modal.classList.add('hidden');
        navigate('dashboard');
      } catch { showToast('Restore failed', 'error'); }
    });
  });
  document.getElementById('close-mirror').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

// ── Import modal ──────────────────────────────────────────────────────────────
// SIMPLIFIED: Import trips as-is. Store personName directly. No person-linking.
function openImportModal(data, persons) {
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh;">
      <div class="modal-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 8px;">
        <span style="font-size:16px;font-weight:700;">Import Travel Data</span>
        <button id="close-import" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">×</button>
      </div>
      <div id="import-status" style="display:none;padding:10px 20px;font-size:14px;font-weight:600;"></div>
      <div id="import-tool-container" style="overflow-y:auto;max-height:70vh;"></div>
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
  const statusBar    = document.getElementById('import-status');

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
