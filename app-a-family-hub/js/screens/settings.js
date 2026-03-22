// v3.4.1 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
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

const MEMBER_EMOJIS  = ['👤','👨','👩','🧑','👦','👧','🧔','👱','🧒'];
const MEMBER_COLORS  = ['#EEF2FF','#D1FAE5','#FEF3C7','#FCE7F3','#E0F2FE','#F3E8FF'];

export async function renderSettings(container) {
  const data = await getCachedTravelData();
  const { members = [] } = data || {};
  const user = getUser();

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>
    <div style="padding-bottom:24px;">

      <!-- Account -->
      <div class="section-title">Account</div>
      <div class="card" style="margin:0 16px;">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;">
          ${user?.picture ? `<img src="${user.picture}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" />` : '<div style="width:44px;height:44px;border-radius:50%;background:var(--primary-bg);display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>'}
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.name || 'Signed in'}</div>
            <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.email || ''}</div>
          </div>
          <button class="btn btn-secondary" style="padding:8px 14px;font-size:13px;" id="signout-btn">Sign out</button>
        </div>
        <div class="divider"></div>
        <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;color:var(--text-secondary);">Drive sync</span>
            <span style="font-size:13px;font-weight:600;color:${isOnline() ? 'var(--success)' : 'var(--warning)'};">
              ${isOnline() ? '● Online' : '● Offline'}
            </span>
          </div>
          ${data?.lastSync ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Last sync: ${formatDisplayDate(data.lastSync.split('T')[0])}</div>` : ''}
        </div>
      </div>

      <!-- Family Members -->
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;padding-right:16px;">
        <span>Family Members</span>
        <button class="btn btn-primary" style="padding:6px 14px;font-size:12px;" id="add-member-btn">+ Add</button>
      </div>
      <div id="members-list" style="padding:0 16px;display:flex;flex-direction:column;gap:8px;"></div>

      <!-- Data Management -->
      <div class="section-title">Data Management</div>
      <div class="card" style="margin:0 16px;overflow:visible;">
        <div class="list-row" id="backup-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
          <span style="font-size:20px;">💾</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Backup Now</div>
            <div style="font-size:12px;color:var(--text-muted);">Download JSON to device</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="restore-local-btn">
          <span style="font-size:20px;">📂</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Restore from Local Backup</div>
            <div style="font-size:12px;color:var(--text-muted);">Pick a downloaded backup file</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="restore-mirror-btn">
          <span style="font-size:20px;">☁️</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Restore from Drive Mirror</div>
            <div style="font-size:12px;color:var(--text-muted);">Choose from last 3 snapshots</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="import-btn">
          <span style="font-size:20px;">📥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div>
            <div style="font-size:12px;color:var(--text-muted);">Migrate existing travel data</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="photo-zip-btn">
          <span style="font-size:20px;">📦</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Export All Photos as ZIP</div>
            <div style="font-size:12px;color:var(--text-muted);">Document scans, address photos</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="clear-cache-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
          <span style="font-size:20px;">🗑️</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Clear Local Cache</div>
            <div style="font-size:12px;color:var(--text-muted);">Force fresh re-download from Drive</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <!-- Access Control -- admin only -->
      ${isAdmin() ? `
      <div class="section-title">Family Access</div>
      <div class="card" style="margin:0 16px;">
        <div class="list-row" id="access-control-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">👥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Manage Access</div>
            <div style="font-size:12px;color:var(--text-muted);">Set Admin or Viewer roles</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>
      ` : ''}

      <!-- Security -->
      <div class="section-title">Security</div>
      <div class="card" style="margin:0 16px;">
        <div class="list-row" id="security-dashboard-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🛡️</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Security & Access</div>
            <div style="font-size:12px;color:var(--text-muted);">Sessions, activity log, revoke access</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <!-- Safe Exit -->
      <div class="section-title">Session</div>
      <div class="card" style="margin:0 16px;">
        <div class="list-row" id="safe-exit-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🚪</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Save &amp; Exit</div>
            <div style="font-size:12px;color:var(--text-muted);">Sync data then close cleanly</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <!-- App info -->
      <div class="section-title">App Info</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-muted);">Family Hub v3.4.1 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- Phase 1A</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v3.4.1 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 · Travel & Finance PWA Suite</div>
      </div>

      <!-- Hidden file inputs -->
      <input type="file" id="restore-file-input" accept=".json" style="display:none;" />
    </div>

    <!-- Member modal -->
    <div class="modal-overlay hidden" id="member-modal"></div>
  `;

  renderMembersList(members);
  bindEvents(members, data, container);
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
      statusBar.style.display = 'block';
      statusBar.style.color = 'var(--text-secondary)';
      statusBar.textContent = 'Resolving members…';

      // Resolve person names to IDs (fuzzy: trim, case, partial)
      const memberMap = Object.fromEntries(members.map(m => [m.name.toLowerCase().trim(), m.id]));
      let imported = 0, skipped = 0;
      const unmatchedNames = new Set();

      const resolved = [];
      records.forEach(rec => {
        const rawName = rec.personName?.toLowerCase().trim() || '';
        // Exact match first
        let personId = memberMap[rawName];
        // Partial match: member name starts with or contains the value
        if (!personId) {
          const match = members.find(m =>
            m.name.toLowerCase().includes(rawName) ||
            rawName.includes(m.name.toLowerCase())
          );
          personId = match?.id;
        }
        if (!personId) { skipped++; unmatchedNames.add(rec.personName); return; }
        resolved.push({ ...rec, id: rec.id || uuidv4(), personId });
      });

      if (unmatchedNames.size > 0) {
        const unmatchedList = [...unmatchedNames].join(', ');
        statusBar.textContent = '⚠️ Could not match names: ' + unmatchedList;
        statusBar.style.color = 'var(--warning)';
        statusBar.style.display = 'block';
        statusBar.style.fontWeight = '600';
        showToast('Name mismatch: ' + unmatchedList + '. Check member names in Settings → People.', 'warning', 6000);
        await new Promise(r => setTimeout(r, 2500));
      }

      statusBar.textContent = `Saving ${resolved.length} records to Drive…`;

      try {
        const newData = await localSave('travel', (remote) => {
          const trips = [...(remote.trips || [])];
          const existingKeys = new Set(trips.map(t => t.personId + '|' + t.dateOutIndia));

          resolved.forEach(rec => {
            const key = rec.personId + '|' + rec.dateOutIndia;
            if (existingKeys.has(key)) { skipped++; return; }
            trips.push(rec);
            existingKeys.add(key);
            imported++;
          });

          return { ...remote, trips };
        });

        await setCachedTravelData(newData);
        const msg = imported > 0
          ? '✅ Imported ' + imported + ' trip' + (imported !== 1 ? 's' : '')
            + (skipped > 0 ? ' (' + skipped + ' duplicates skipped)' : '')
          : '⚠️ All ' + skipped + ' records already exist (duplicates skipped)';
        statusBar.style.color = imported > 0 ? 'var(--success)' : 'var(--warning)';
        statusBar.textContent = msg;
        statusBar.style.display = 'block';
        statusBar.style.fontSize = '14px';
        statusBar.style.fontWeight = '600';
        statusBar.style.padding = '12px 20px';
        showToast(msg, imported > 0 ? 'success' : 'warning', 4000);
        progressCb(imported, skipped);
        importInProgress = false;
        // Scroll all parent containers to top
        const tc = document.getElementById('import-tool-container');
        if (tc) { let el = tc; while (el) { el.scrollTop = 0; el = el.parentElement; } }
        return { imported, skipped };
      } catch (err) {
        importInProgress = false;
        statusBar.style.color = 'var(--danger)';
        statusBar.style.display = 'block';
        statusBar.style.fontWeight = '600';
        statusBar.style.padding = '12px 20px';
        statusBar.textContent = '❌ Import failed: ' + (err.message || 'Unknown error');
        showToast('Import failed: ' + (err.message || 'Unknown error'), 'error', 8000);
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
