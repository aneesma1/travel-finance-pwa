// v4.0.0 — 2026-05-01 — Local-first: Drive/Auth/Mirror removed
// ─── app-a-family-hub/js/screens/settings.js ────────────────────────────────
// Settings screen — People, Data, About tabs

'use strict';

import { getCachedTravelData, setCachedTravelData, clearAllCachedData } from '../../../shared/db.js';
import { downloadLocalBackup, restoreFromLocalFile, saveXLSXToExports, timestampSuffix } from '../../../shared/drive.js';
import { showRestoreDialog } from '../../../shared/restore-dialog.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { isAdmin, renderAccessControl } from '../roles.js';
import { uuidv4, formatDisplayDate, showToast, toISODate, showConfirmModal } from '../../../shared/utils.js';
import { renderImportTool } from '../../../shared/import-tool.js';
import { openPersonManage } from './person-manage.js';

const MEMBER_EMOJIS = ['👤', '👨', '👩', '🧑', '👦', '👧', '🧔', '👱', '🧒'];
const MEMBER_COLORS = ['#EEF2FF', '#D1FAE5', '#FEF3C7', '#FCE7F3', '#E0F2FE', '#F3E8FF'];

// ── Main entry ────────────────────────────────────────────────────────────────
export async function renderSettings(container, params = {}) {
  const { tab: activeTab = 'people' } = params;
  const data = await getCachedTravelData();
  const { members = [] } = data || {};

  const tabs = ['people', 'data', 'about'];
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 4px;">
      ${tabs.map(id => `
        <button class="settings-tab ${activeTab === id ? 'active' : ''}" data-tab="${id}"
          style="flex:1;padding:12px 4px;border:none;background:none;cursor:pointer;
            font-size:11px;font-weight:600;font-family:inherit;
            color:${activeTab === id ? 'var(--primary)' : 'var(--text-muted)'};
            border-bottom:2px solid ${activeTab === id ? 'var(--primary)' : 'transparent'};
            transition:all 0.15s;">
          ${id === 'people' ? '👥 People' : id === 'data' ? '💾 Data' : 'ℹ️ About'}
        </button>`).join('')}
    </div>
    <div id="tab-content" style="padding-bottom:32px;"></div>
    <input type="file" id="restore-file-input" accept=".json,.travelbox" style="display:none;" />
  `;

  const globalModal = document.getElementById('member-modal');
  if (globalModal) {
    globalModal.classList.add('hidden');
    globalModal.innerHTML = '';
  }

  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  if (activeTab === 'people')     renderPeopleTab(container, data, members);
  else if (activeTab === 'data')  renderDataTab(data, members, container);
  else if (activeTab === 'about') renderAboutTab(data, members);
}

// ── PEOPLE TAB ────────────────────────────────────────────────────────────────
function renderPeopleTab(container, data, members) {
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
          dp[r][c] = a[r-1] === b[c-1] ? dp[r-1][c-1] : 1 + Math.min(dp[r-1][c], dp[r][c-1], dp[r-1][c-1]);
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
    <div class="section-title">Backup &amp; Restore</div>
    <div class="card" style="margin:0 16px;overflow:visible;">
      <div class="list-row" id="backup-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
        <span style="font-size:20px;">💾</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Backup Now</div>
          <div style="font-size:12px;color:var(--text-muted);">Download .travelbox file to device</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="restore-local-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">📂</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Restore from Backup</div>
          <div style="font-size:12px;color:var(--text-muted);">Pick a .travelbox or .json backup file</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>
    <div id="export-status" style="font-size:11px;color:var(--text-muted);padding:6px 24px;word-break:break-all;overflow-wrap:break-word;line-height:1.5;"></div>

    <div class="section-title" style="margin-top:8px;">Import &amp; Export</div>
    <div class="card" style="margin:0 16px;">
      <div class="list-row" id="import-btn" style="border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
        <span style="font-size:20px;">📥</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div>
          <div style="font-size:12px;color:var(--text-muted);">Migrate existing travel data</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="list-row" id="photo-zip-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <span style="font-size:20px;">📦</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Export All Photos as ZIP</div>
          <div style="font-size:12px;color:var(--text-muted);">Document scans, address photos</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>

    <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
    <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
      <div class="list-row" id="reset-db-btn" style="border:none;border-radius:var(--radius-lg);">
        <span style="font-size:20px;">🔥</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
          <div style="font-size:11px;color:var(--text-muted);">Permanently delete all local travel records.</div>
        </div>
        <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
      </div>
    </div>
    <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
      ⚠️ This is irreversible. Please <b>Backup Now</b> before resetting.
    </div>
  `;

  const statusEl = document.getElementById('export-status');

  document.getElementById('backup-btn').addEventListener('click', async () => {
    const cached = await getCachedTravelData();
    if (!cached) { showToast('No data to backup', 'warning'); return; }
    const filename = downloadLocalBackup('travel', cached);
    statusEl.textContent = '✅ ' + filename;
    showToast('✅ Backup downloaded: ' + filename, 'success', 5000);
  });

  document.getElementById('restore-local-btn').addEventListener('click', () =>
    document.getElementById('restore-file-input').click());

  document.getElementById('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be picked again
    const strategy = await showRestoreDialog({
      title: 'How should the backup be loaded?',
      source: file.name,
    });
    if (!strategy) return; // cancelled
    try {
      showToast('Restoring…', 'info', 2000);
      const restored = await restoreFromLocalFile(file, 'travel', strategy);
      await setCachedTravelData(restored);
      const label = strategy === 'wipe' ? 'Wiped & replaced' : strategy === 'append' ? 'Appended' : 'Merged';
      showToast('✅ ' + label + ' successfully!', 'success');
      navigate('dashboard');
    } catch (err) { showToast('Restore failed: ' + err.message, 'error'); }
  });

  document.getElementById('import-btn').addEventListener('click', async () => {
    const freshData = await getCachedTravelData();
    openImportModal(freshData, freshData?.travelPersons || []);
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
      const ts = timestampSuffix();
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Travel_Photos_' + ts + '.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('✅ ' + count + ' photos exported', 'success');
    } catch (err) { showToast('ZIP failed: ' + err.message, 'error'); }
  });

  document.getElementById('reset-db-btn').addEventListener('click', async () => {
    const first  = confirm('⚠️ This will permanently delete ALL local travel data.\n\nProceed?');
    if (!first) return;
    const second = confirm('Are you 100% sure? This cannot be undone. Have you made a backup?');
    if (!second) return;
    try {
      await clearAllCachedData();
      localStorage.clear();
      sessionStorage.clear();
      showToast('All data cleared.', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'error');
    }
  });
}

// ── ABOUT TAB ─────────────────────────────────────────────────────────────────
function renderAboutTab(data, members) {
  const tab = document.getElementById('tab-content');
  tab.innerHTML = `
    <div class="section-title">App Info</div>
    <div class="card" style="margin:0 16px;">
      <div class="card-body" style="padding:16px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="font-size:40px;">✈️</div>
          <div>
            <div style="font-size:18px;font-weight:700;">Family Hub</div>
            <div style="font-size:12px;color:var(--text-muted);">v${window.HTML_VERSION || '4.0.0'} · ${window.BUILD_TIME || ''}</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
          <div>👥 Members: <b>${members.length}</b></div>
          <div>✈️ Trips: <b>${data?.trips?.length || 0}</b></div>
          <div>🪪 Documents: <b>${data?.documents?.length || 0}</b></div>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:var(--radius-md);font-size:11px;color:var(--text-muted);line-height:1.6;">
          All data stored locally on this device.<br>
          No account, no cloud, no internet required.
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top:16px;">Storage</div>
    <div class="card" style="margin:0 16px;">
      <div class="list-row" id="clear-local-btn" style="border-radius:var(--radius-lg);">
        <span style="font-size:20px;">🗑️</span>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">Clear App Cache</div>
          <div style="font-size:12px;color:var(--text-muted);">Wipe service worker and cached files</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>
  `;

  document.getElementById('clear-local-btn').addEventListener('click', async () => {
    if (!confirm('Clear cached app files? Your data is safe — only the service worker cache is removed.')) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      showToast('Cache cleared — reloading…', 'success');
      setTimeout(() => window.location.reload(true), 800);
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    }
  });
}

// ── Import modal ──────────────────────────────────────────────────────────────
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
  const statusBar     = document.getElementById('import-status');
  const setStatus = (msg, color) => {
    statusBar.style.display = 'block';
    statusBar.textContent = msg;
    statusBar.style.color = color || 'var(--text-secondary)';
  };

  renderImportTool(toolContainer, {
    appType: 'travel',
    existingData: data,
    onImportComplete: async (records, progressCb, strategy = 'merge') => {
      importInProgress = true;
      setStatus(`Importing ${records.length} records…`);
      let imported = 0, skipped = 0;
      try {
        const newData = await localSave('travel', remote => {
          const trips      = strategy === 'wipe' ? [] : [...(remote.trips || [])];
          const passengers = strategy === 'wipe' ? [] : [...(remote.passengers || remote.travelPersons || [])];

          const getOrAddPassenger = (nameStr) => {
            const n = (nameStr || '').trim();
            if (!n) return null;
            let p = passengers.find(x => x.name?.toLowerCase() === n.toLowerCase());
            if (!p) { p = { id: uuidv4(), name: n, emoji: '👤' }; passengers.push(p); }
            return p;
          };

          // For merge: track existing keys to skip dupes. For append/wipe: always insert.
          const existingKeys = (strategy === 'merge')
            ? new Set(trips.map(t => ((t.passengerName || '').toLowerCase().trim()) + '|' + toISODate(t.dateLeftOrigin)))
            : new Set();

          records.forEach(rec => {
            const primaryName = (rec.personName || 'Unknown').trim();
            const dateStr = rec.dateOut || rec.dateIn;
            if (!dateStr) { skipped++; return; }
            const doi = toISODate(dateStr);
            const companionsRaw = [rec.accompanied1, rec.accompanied2, rec.accompanied3, rec.accompanied4]
              .map(n => String(n || '').trim()).filter(Boolean);
            if (rec.travelWith) {
              String(rec.travelWith).split(/[,;]+/).map(n => n.trim()).filter(Boolean).forEach(n => companionsRaw.push(n));
            }
            const allNames        = [...new Set([primaryName, ...companionsRaw])];
            const resolvedPersons = allNames.map(n => getOrAddPassenger(n)).filter(Boolean);
            resolvedPersons.forEach(person => {
              const key = person.name.toLowerCase() + '|' + doi;
              if (strategy === 'merge' && existingKeys.has(key)) { skipped++; return; }
              existingKeys.add(key);
              const companionsForThis = resolvedPersons.filter(p => p.id !== person.id).map(p => p.name).join(', ');
              const companionIds      = resolvedPersons.filter(p => p.id !== person.id).map(p => p.id);
              trips.push({
                id: uuidv4(), timestamp: new Date().toISOString(),
                passengerId: person.id, passengerName: person.name,
                originCountry: rec.origin || 'India', destinationCountry: rec.destination || 'Qatar',
                dateLeftOrigin: rec.dateOut || rec.dateIn, dateArrivedDest: rec.dateIn || rec.dateOut,
                flightNumber: rec.flightDetails || '', reason: rec.reason || '',
                travelWith: companionIds, travelWithNames: companionsForThis, photos: []
              });
              imported++;
            });
          });
          return { ...remote, trips, passengers };
        });

        await setCachedTravelData(newData);
        const modeLabel = strategy === 'wipe' ? 'replaced' : strategy === 'append' ? 'appended' : 'merged';
        const msg = imported > 0
          ? '✅ ' + imported + ' trips imported (' + modeLabel + ')!' + (skipped > 0 ? ' (' + skipped + ' skipped)' : '')
          : '⚠️ 0 imported — all ' + skipped + ' already exist';
        setStatus(msg, imported > 0 ? 'var(--success)' : 'var(--warning)');
        progressCb(imported, skipped);
        importInProgress = false;
        toolContainer.scrollTop = 0;
        return { imported, skipped };
      } catch (err) {
        importInProgress = false;
        setStatus('❌ Failed: ' + (err.message || 'Unknown error'), 'var(--danger)');
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
