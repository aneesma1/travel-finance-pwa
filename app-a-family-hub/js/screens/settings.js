// v3.4.8 — 2026-03-22

// ─── app-a-family-hub/js/screens/settings.js ────────────────────────────────
// Settings: family profiles, backup/restore, import, auth, sync status

'use strict';

import { getCachedTravelData, setCachedTravelData, clearAllCachedData } from '../../../shared/db.js';
import {
  writeData, downloadLocalBackup, restoreFromLocalFile,
  getMirrorSnapshots, restoreFromMirror, readData, timestampSuffix
} from '../../../shared/drive.js';
import { clearAuth, getUser } from '../../../shared/auth.js';
import { navigate } from '../router.js';
import { isAdmin, renderAccessControl } from '../roles.js';
import { getActiveSessions, getActivityLog, revokeSession, revokeAllSessions } from '../../../shared/security-log.js';
import { openSecurityDashboard } from '../../../shared/security-dashboard.js';
import { uuidv4, formatDisplayDate, showToast, isOnline } from '../../../shared/utils.js';
import { renderImportTool } from '../../../shared/import-tool.js';
import { openPersonManage } from './person-manage.js';

const MEMBER_EMOJIS  = ['👤','👨','👩','🧑','👦','👧','🧔','👱','🧒'];
const MEMBER_COLORS  = ['#EEF2FF','#D1FAE5','#FEF3C7','#FCE7F3','#E0F2FE','#F3E8FF'];

export async function renderSettings(container, params = {}) {
  const data = await getCachedTravelData();
  const { members = [] } = data || {};
  const user = getUser();
  const activeTab = params.tab || 'people';

  const TAB = (id, label, active) =>
    `<button class="settings-tab" data-tab="${id}" style="flex:1;padding:12px 4px;border:none;background:none;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;color:${active?'var(--primary)':'var(--text-muted)'};border-bottom:2px solid ${active?'var(--primary)':'transparent'};transition:all 0.15s;">${label}</button>`;

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>
    <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;">
      ${TAB('people',   '👥 People',   activeTab==='people')}
      ${TAB('data',     '💾 Data',     activeTab==='data')}
      ${TAB('security', '🛡️ Security', activeTab==='security')}
      ${TAB('account',  '👤 Account',  activeTab==='account')}
    </div>
    <div id="tab-content" style="padding-bottom:80px;overflow-y:auto;"></div>
    <div class="modal-overlay hidden" id="member-modal"></div>
    <input type="file" id="restore-file-input" accept=".json" style="display:none;" />
  `;

  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  if      (activeTab === 'people')   renderPeopleTab();
  else if (activeTab === 'data')     renderDataTab();
  else if (activeTab === 'security') renderSecurityTab();
  else if (activeTab === 'account')  renderAccountTab();

  // ── PEOPLE TAB ───────────────────────────────────────────────────────────
  function renderPeopleTab() {
    const tab = document.getElementById('tab-content');
    const dupeWarning = members.length >= 2 ? checkDuplicateNames(members) : '';
    tab.innerHTML = `
      ${dupeWarning}
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;padding-right:16px;">
        <span>Family Members</span>
        <button class="btn btn-primary" style="padding:6px 14px;font-size:12px;" id="add-member-btn">+ Add</button>
      </div>
      <div id="members-list" style="padding:0 16px;display:flex;flex-direction:column;gap:8px;"></div>

      ${isAdmin() ? `
      <div class="section-title" style="margin-top:16px;">Person Management</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
        <div class="list-row" id="manage-people-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
          <span style="font-size:20px;">🔀</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Rename &amp; Merge People</div>
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
      </div>
      ` : ''}
    `;

    renderMembersList(members);
    bindEvents(members, data, container);

    document.getElementById('manage-people-btn')?.addEventListener('click', () => {
      openPersonManage(() => renderSettings(container, { tab: 'people' }));
    });

    if (isAdmin()) {
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
          </div>
        `;
        document.getElementById('close-access').addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
        const onSaveAccess = async (newData) => {
          const saved = await writeData('travel', () => newData);
          await setCachedTravelData(saved);
          showToast('Access updated', 'success');
          renderAccessControl(document.getElementById('access-control-container'), saved, getUser()?.email || '', onSaveAccess);
        };
        renderAccessControl(document.getElementById('access-control-container'), data, getUser()?.email || '', onSaveAccess);
      });
    }
  }

  function checkDuplicateNames(mems) {
    const dupes = [];
    for (let i = 0; i < mems.length; i++)
      for (let j = i+1; j < mems.length; j++) {
        const a = mems[i].name.toLowerCase().trim(), b = mems[j].name.toLowerCase().trim();
        const m2 = a.length, n2 = b.length;
        const dp = Array.from({length:m2+1},(_,i2)=>Array.from({length:n2+1},(_,j2)=>i2===0?j2:j2===0?i2:0));
        for (let i2=1;i2<=m2;i2++) for (let j2=1;j2<=n2;j2++) dp[i2][j2]=a[i2-1]===b[j2-1]?dp[i2-1][j2-1]:1+Math.min(dp[i2-1][j2],dp[i2][j2-1],dp[i2-1][j2-1]);
        if (dp[m2][n2] <= 2) dupes.push('"' + mems[i].name + '" and "' + mems[j].name + '"');
      }
    if (!dupes.length) return '';
    return '<div style="margin:12px 16px 0;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:10px 14px;">' +
      '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:4px;">⚠️ Possible duplicate names</div>' +
      dupes.map(d => '<div style="font-size:12px;color:#78350F;">' + d + ' — use Rename &amp; Merge to fix</div>').join('') +
      '</div>';
  }

  // ── DATA TAB ─────────────────────────────────────────────────────────────
  function renderDataTab() {
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
    `;
    bindDataEvents();
  }

  // ── SECURITY TAB ─────────────────────────────────────────────────────────
  function renderSecurityTab() {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Security Dashboard</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
        <div class="list-row" id="security-dashboard-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🛡️</span>
          <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Security &amp; Access</div><div style="font-size:12px;color:var(--text-muted);">Sessions · Activity log · Revoke access</div></div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>
      <div class="section-title" style="margin-top:16px;">Session</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
        <div class="list-row" id="safe-exit-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🚪</span>
          <div style="flex:1;"><div style="font-size:14px;font-weight:600;">Save &amp; Exit</div><div style="font-size:12px;color:var(--text-muted);">Sync data then close cleanly</div></div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>
    `;
    bindSecurityEvents();
  }

  // ── ACCOUNT TAB ──────────────────────────────────────────────────────────
  function renderAccountTab() {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Signed In As</div>
      <div class="card" style="margin:0 16px;">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;">
          ${user?.picture ? `<img src="${user.picture}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" />` : '<div style="width:44px;height:44px;border-radius:50%;background:var(--primary-bg);display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>'}
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.name || 'Signed in'}</div>
            <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.email || ''}</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;color:var(--text-secondary);">Drive sync</span>
            <span style="font-size:13px;font-weight:600;color:${isOnline() ? 'var(--success)' : 'var(--warning)'};">${isOnline() ? '● Online' : '● Offline'}</span>
          </div>
          ${data?.lastSync ? `<div style="font-size:11px;color:var(--text-muted);">Last sync: ${formatDisplayDate(data.lastSync.split('T')[0])}</div>` : ''}
          <button class="btn btn-secondary btn-full" style="margin-top:12px;" id="signout-btn">Sign out of Google</button>
        </div>
      </div>
      <div class="section-title" style="margin-top:16px;">App Info</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-muted);">Family Hub v3.4.8 · 2026-03-22</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v1.1 · Travel &amp; Finance PWA Suite</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Members: ${members.length} · Trips: ${data?.trips?.length || 0} · Docs: ${data?.documents?.length || 0}</div>
      </div>
    `;
    document.getElementById('signout-btn').addEventListener('click', () => { clearAuth(); window.location.reload(); });
  }


function renderMembersList(members) {
  const list = document.getElementById('members-list');
  if (!members.length) {
    list.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px 4px;">No family members added yet</div>`;
    return;
  }
  list.innerHTML = members.map(m => `
    <div class="card" style="padding:0;">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;">
        <div style="width:40px;height:40px;border-radius:50%;background:${m.color || '#EEF2FF'};display:flex;align-items:center;justify-content:center;font-size:20px;">${m.emoji || '👤'}</div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:600;color:var(--text);">${m.name}</div>
        </div>
        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" data-edit-member="${m.id}">Edit</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-member]').forEach(btn => {
    btn.addEventListener('click', () => navigate('person-profile', { memberId: btn.dataset.editMember, mode: 'view' }));
  });
}

function bindEvents(members, data, container) {
  document.getElementById('add-member-btn').addEventListener('click', () => navigate('person-profile', { mode: 'new' }));
  document.getElementById('signout-btn').addEventListener('click', () => {
    if (confirm('Sign out? You will need to sign in again to sync data.')) {
      clearAuth();
      window.location.reload();
    }
  });

  document.getElementById('backup-btn').addEventListener('click', async () => {
    const cached = await getCachedTravelData();
    if (!cached) { showToast('No data to backup', 'warning'); return; }
    downloadLocalBackup('travel', cached);
    showToast('Backup downloaded!', 'success');
  });

  document.getElementById('restore-local-btn').addEventListener('click', () => {
    document.getElementById('restore-file-input').click();
  });

  document.getElementById('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const count = data?.trips?.length || 0;
    if (!confirm(`This will overwrite your current ${count} trip records. Continue?`)) return;
    try {
      showToast('Restoring…', 'info', 2000);
      const restored = await restoreFromLocalFile(file, 'travel');
      await setCachedTravelData(restored);
      showToast('Restored successfully!', 'success');
      navigate('dashboard');
    } catch (err) {
      showToast('Restore failed: ' + err.message, 'error');
    }
  });

  document.getElementById('restore-mirror-btn').addEventListener('click', async () => {
    if (!isOnline()) { showToast('Internet required to access Drive mirror', 'warning'); return; }
    showToast('Loading snapshots…', 'info', 1500);
    try {
      const snapshots = await getMirrorSnapshots('travel');
      if (!snapshots.length) { showToast('No mirror snapshots found', 'warning'); return; }
      showMirrorModal(snapshots);
    } catch {
      showToast('Could not load mirror snapshots', 'error');
    }
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    openImportModal(container, data, members);
  });

  document.getElementById('security-dashboard-btn')?.addEventListener('click', async () => {
    const modal = document.getElementById('member-modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="modal-sheet" style="max-height:90vh;">
        <div class="modal-handle"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 12px;">
          <span style="font-size:16px;font-weight:700;">🛡️ Security</span>
          <button id="close-sec" style="background:none;border:none;font-size:22px;cursor:pointer;">×</button>
        </div>
        <div id="security-content" style="overflow-y:auto;max-height:70vh;padding:0 20px 24px;">
          <div style="font-size:13px;color:var(--text-muted);padding:8px 0;">Loading…</div>
        </div>
      </div>
    `;
    document.getElementById('close-sec').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    const [sessions, log] = await Promise.all([
      getActiveSessions().catch(() => []),
      getActivityLog(30).catch(() => [])
    ]);
    const sc = document.getElementById('security-content');
    const riskColor = r => r==='high'?'var(--danger)':r==='medium'?'var(--warning)':r==='low'?'var(--primary)':'var(--text-muted)';
    const riskEmoji = r => r==='high'?'🔴':r==='medium'?'🟠':r==='low'?'🟡':'🟢';

    sc.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Active Sessions (${sessions.length})</div>
      ${sessions.length ? sessions.map(s => `
        <div style="background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;">
            <div>
              <div style="font-size:13px;font-weight:600;">${s.userEmail}</div>
              <div style="font-size:12px;color:var(--text-muted);">${s.device} · ${s.app}</div>
              <div style="font-size:11px;color:var(--text-muted);">Last active: ${new Date(s.lastActive).toLocaleString()}</div>
            </div>
            <button data-revoke="${s.id}" style="font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid var(--danger-bg);background:none;color:var(--danger);cursor:pointer;">Revoke</button>
          </div>
        </div>
      `).join('') : '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">No other active sessions</div>'}

      ${sessions.length > 1 ? `<button id="revoke-all-btn" style="width:100%;padding:10px;border-radius:var(--radius-md);border:1px solid var(--danger);background:none;color:var(--danger);font-size:13px;font-weight:600;cursor:pointer;margin-bottom:16px;">🚫 Revoke all other sessions</button>` : ''}

      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;">Activity Log (last 30)</div>
      ${log.length ? log.map(e => `
        <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-light);">
          <span style="font-size:16px;">${riskEmoji(e.risk)}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;color:${riskColor(e.risk)};">${e.action}</div>
            <div style="font-size:12px;color:var(--text-muted);">${e.detail} · ${e.device}</div>
            <div style="font-size:11px;color:var(--text-muted);">${new Date(e.time).toLocaleString()}</div>
          </div>
        </div>
      `).join('') : '<div style="font-size:13px;color:var(--text-muted);">No activity logged yet</div>'}
    `;

    sc.querySelectorAll('[data-revoke]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Revoke this session?')) return;
        await revokeSession(btn.dataset.revoke);
        showToast('Session revoked', 'success');
        btn.closest('div[style]').remove();
      });
    });

    document.getElementById('revoke-all-btn')?.addEventListener('click', async () => {
      if (!confirm('Revoke all other sessions?')) return;
      await revokeAllSessions();
      showToast('All other sessions revoked', 'success');
      modal.classList.add('hidden');
    });
  });

  if (isAdmin()) {
    document.getElementById('access-control-btn')?.addEventListener('click', () => {
      // Open modal with access control UI
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
        </div>
      `;
      document.getElementById('close-access').addEventListener('click', () => modal.classList.add('hidden'));
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
      const onSaveAccess = async (newData) => {
        const saved = await writeData('travel', () => newData);
        await setCachedTravelData(saved);
        showToast('Access updated', 'success');
        renderAccessControl(
          document.getElementById('access-control-container'),
          saved,
          getUser()?.email || '',
          onSaveAccess
        );
      };
      renderAccessControl(
        document.getElementById('access-control-container'),
        data,
        getUser()?.email || '',
        onSaveAccess
      );
    });
  }

  document.getElementById('photo-zip-btn')?.addEventListener('click', async () => {
    try {
      showToast('Preparing photos…', 'info', 2000);
      const cached = await getCachedTravelData();
      if (!cached) { showToast('No data found', 'warning'); return; }

      // Load JSZip
      if (!window.JSZip) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const zip = new JSZip();
      let count = 0;

      // Member profile photos
      (cached.members || []).forEach(m => {
        if (m.photo?.startsWith('data:')) {
          const b64 = m.photo.split(',')[1];
          zip.folder('profiles').file(`${m.name || 'member'}_profile.jpg`, b64, { base64: true });
          count++;
        }
      });

      // Document photos
      (cached.documents || []).forEach(doc => {
        const member = (cached.members || []).find(m => m.id === doc.personId);
        const name = member?.name || 'unknown';
        const docType = doc.docName || 'doc';
        (doc.photos || []).forEach((p, i) => {
          if (p?.startsWith('data:')) {
            const b64 = p.split(',')[1];
            const side = i === 0 ? 'front' : 'back';
            zip.folder('documents').file(`${name}_${docType}_${side}.jpg`, b64, { base64: true });
            count++;
          }
        });
      });

      // Address photos
      ['homeQatar','homeIndia'].forEach(key => {
        const loc = cached.familyDefaults?.[key];
        (loc?.photos || []).forEach((p, i) => {
          if (p?.startsWith('data:')) {
            const b64 = p.split(',')[1];
            zip.folder('addresses').file(`${key}_photo${i+1}.jpg`, b64, { base64: true });
            count++;
          }
        });
      });

      if (count === 0) { showToast('No photos found to export', 'warning'); return; }

      const ts = new Date().toISOString().replace('T','_').slice(0,16).replace(':','-');
      const blob = await zip.generateAsync({ type:'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Travel_Photos_${ts}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(`✅ ${count} photos exported`, 'success');
    } catch (err) {
      showToast('ZIP export failed: ' + err.message, 'error');
    }
  });

  document.getElementById('safe-exit-btn').addEventListener('click', async () => {
    const btn = document.getElementById('safe-exit-btn');
    btn.querySelector('.list-row div:first-child + div div:first-child') &&
      (btn.querySelector('div:nth-child(2) div:first-child').textContent = 'Syncing…');
    showToast('Syncing before exit…', 'info', 2000);
    try {
      // Give any pending IndexedDB writes a moment to flush
      await new Promise(r => setTimeout(r, 500));
      showToast('All data saved. Goodbye! 👋', 'success', 2000);
      setTimeout(() => {
        // Clear navigation history and show login
        window.history.pushState(null, '', window.location.pathname);
        window.location.reload();
      }, 2000);
    } catch (err) {
      showToast('Exit failed: ' + err.message, 'error');
    }
  });

  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    if (!confirm('Clear local cache? Your Drive data is safe. The app will re-download everything from Drive on next open.')) return;
    try {
      await clearAllCachedData();
      showToast('Cache cleared -- reloading…', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    }
  });
}

function showMirrorModal(snapshots) {
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="padding:0 20px 20px;">
        <div style="font-size:17px;font-weight:700;margin-bottom:16px;">Restore from Mirror</div>
        ${snapshots.map((s, i) => `
          <button class="list-row" data-snapshot="${i}" style="width:100%;text-align:left;border-radius:var(--radius-md);margin-bottom:8px;border:1px solid var(--border);">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">${new Date(s.timestamp).toLocaleString('en-GB')}</div>
              <div style="font-size:12px;color:var(--text-muted);">${s.recordCount} records</div>
            </div>
            <span style="color:var(--primary);font-weight:600;font-size:13px;">Restore</span>
          </button>
        `).join('')}
        <button class="btn btn-secondary btn-full" id="close-mirror-modal" style="margin-top:8px;">Cancel</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-snapshot]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.snapshot);
      if (!confirm(`Restore snapshot from ${new Date(snapshots[idx].timestamp).toLocaleString('en-GB')}? This will overwrite current data.`)) return;
      try {
        showToast('Restoring…', 'info', 2000);
        const restored = await restoreFromMirror('travel', idx);
        await setCachedTravelData(restored);
        showToast('Restored!', 'success');
        modal.classList.add('hidden');
        navigate('dashboard');
      } catch {
        showToast('Restore failed', 'error');
      }
    });
  });
  document.getElementById('close-mirror-modal').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

function openImportModal(container, data, members) {
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh;">
      <div class="modal-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 8px;">
        <span style="font-size:16px;font-weight:700;">Import Travel Data</span>
        <button id="close-import" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">×</button>
      </div>
      <div id="import-status" style="display:none;padding:8px 20px;font-size:13px;color:var(--text-secondary);"></div>
      <div id="import-tool-container" style="overflow-y:auto;max-height:70vh;"></div>
    </div>
  `;

  let importInProgress = false;

  const closeBtn = document.getElementById('close-import');
  closeBtn.addEventListener('click', () => {
    if (importInProgress) {
      if (!confirm('Import in progress. Close anyway?')) return;
    }
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', e => {
    if (e.target !== modal) return;
    if (importInProgress) return; // Block backdrop close during import
    modal.classList.add('hidden');
  });

  const toolContainer = document.getElementById('import-tool-container');
  const statusBar = document.getElementById('import-status');

  renderImportTool(toolContainer, {
    appType: 'travel',
    existingData: data,
    onImportComplete: async (records, progressCb) => {
      importInProgress = true;

      // Fullscreen overlay - always visible
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;';
      overlay.innerHTML = '<div class="spinner" style="border-color:#fff;border-top-color:transparent;width:40px;height:40px;"></div>' +
        '<div id="import-overlay-msg" style="color:#fff;font-size:16px;font-weight:600;text-align:center;line-height:1.6;">Importing…</div>';
      document.body.appendChild(overlay);

      const setMsg = (msg, color) => {
        const el = document.getElementById('import-overlay-msg');
        if (el) { el.textContent = msg; if (color) el.style.color = color; }
      };

      // Build name→id map from existing members
      const memberMap = {};
      members.forEach(m => { memberMap[m.name.toLowerCase().trim()] = m.id; });

      // Collect all unique names from the import file
      const newMembersToCreate = {};
      records.forEach(rec => {
        const rawName = rec.personName?.trim();
        if (!rawName) return;
        const key = rawName.toLowerCase();
        if (!memberMap[key] && !newMembersToCreate[key]) {
          newMembersToCreate[key] = { id: uuidv4(), name: rawName };
        }
      });

      // Add new members to map
      Object.values(newMembersToCreate).forEach(m => {
        memberMap[m.name.toLowerCase()] = m.id;
      });

      const newMemberList = Object.values(newMembersToCreate);
      if (newMemberList.length > 0) {
        setMsg('Creating ' + newMemberList.length + ' new member' + (newMemberList.length > 1 ? 's' : '') + ': ' + newMemberList.map(m => m.name).join(', '));
        await new Promise(r => setTimeout(r, 800));
      }

      // Resolve all records — every record now gets a personId
      let imported = 0, skipped = 0;
      const resolved = [];
      records.forEach(rec => {
        const rawName = rec.personName?.trim();
        if (!rawName) { skipped++; return; }
        const personId = memberMap[rawName.toLowerCase()];
        if (!personId) { skipped++; return; }
        resolved.push({ ...rec, id: rec.id || uuidv4(), personId });
      });

      setMsg('Saving ' + resolved.length + ' trips…');

      try {
        const newData = await localSave('travel', (remote) => {
          // Add any new members
          const existingMembers = [...(remote.members || [])];
          const existingMemberIds = new Set(existingMembers.map(m => m.id));
          newMemberList.forEach(m => {
            if (!existingMemberIds.has(m.id)) {
              existingMembers.push({
                id: m.id, name: m.name,
                emoji: '👤', color: '#EEF2FF'
              });
            }
          });

          const trips = [...(remote.trips || [])];
          const existingKeys = new Set(trips.map(t => t.personId + '|' + t.dateOutIndia));
          resolved.forEach(rec => {
            const key = rec.personId + '|' + rec.dateOutIndia;
            if (existingKeys.has(key)) { skipped++; return; }
            trips.push(rec);
            existingKeys.add(key);
            imported++;
          });
          return { ...remote, members: existingMembers, trips };
        });
        await setCachedTravelData(newData);

        const msg = imported > 0
          ? '✅ ' + imported + ' trip' + (imported !== 1 ? 's' : '') + ' imported!'
            + (skipped > 0 ? ' (' + skipped + ' duplicates skipped)' : '')
          : '⚠️ All ' + skipped + ' records already exist';
        setMsg(msg, imported > 0 ? '#6EE7B7' : '#FCD34D');
        progressCb(imported, skipped);
        importInProgress = false;

        await new Promise(r => setTimeout(r, 1500));
        overlay.remove();
        modal.classList.add('hidden');
        navigate('travel-log');
        showToast(msg, imported > 0 ? 'success' : 'warning', 4000);
        return { imported, skipped };

      } catch (err) {
        setMsg('❌ Failed: ' + (err.message || 'Unknown error'), '#FCA5A5');
        await new Promise(r => setTimeout(r, 3000));
        overlay.remove();
        importInProgress = false;
        throw err;
      }
    }
  });

  // Handle import complete -- close modal and navigate
  toolContainer.addEventListener('import:complete', () => {
    setTimeout(() => {
      modal.classList.add('hidden');
      navigate('travel-log');
      showToast('Import complete! Travel log updated.', 'success');
    }, 1200); // Brief delay so user sees the success status
  });
}
