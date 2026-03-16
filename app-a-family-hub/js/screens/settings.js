// ─── app-a-family-hub/js/screens/settings.js ────────────────────────────────
// Settings: family profiles, backup/restore, import, auth, sync status

'use strict';

import { getCachedTravelData, setCachedTravelData, clearAllCachedData } from '../../shared/db.js';
import {
  writeData, downloadLocalBackup, restoreFromLocalFile,
  getMirrorSnapshots, restoreFromMirror, readData
} from '../../shared/drive.js';
import { clearAuth, getUser } from '../../shared/auth.js';
import { navigate } from '../router.js';
import { uuidv4, formatDisplayDate, showToast, isOnline } from '../../shared/utils.js';
import { renderImportTool } from '../../shared/import-tool.js';

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
        <div class="list-row" id="import-btn" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
          <span style="font-size:20px;">📥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div>
            <div style="font-size:12px;color:var(--text-muted);">Migrate existing travel data</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <!-- App info -->
      <div class="section-title">App Info</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-muted);">Family Hub v1.0 — Phase 1A</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v1.1 · Travel & Finance PWA Suite</div>
      </div>

      <!-- Hidden file inputs -->
      <input type="file" id="restore-file-input" accept=".json" style="display:none;" />
    </div>

    <!-- Member modal -->
    <div class="modal-overlay hidden" id="member-modal"></div>
  `;

  renderMembersList(members);
  bindEvents(members, data);
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
    btn.addEventListener('click', () => openMemberModal(btn.dataset.editMember));
  });
}

function bindEvents(members, data) {
  document.getElementById('add-member-btn').addEventListener('click', () => openMemberModal(null));
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
      <div id="import-tool-container" style="overflow-y:auto;max-height:70vh;"></div>
    </div>
  `;
  document.getElementById('close-import').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  const toolContainer = document.getElementById('import-tool-container');

  renderImportTool(toolContainer, {
    appType: 'travel',
    existingData: data,
    onImportComplete: async (records, progressCb) => {
      // Resolve person names to IDs, skip unknowns
      const memberMap = Object.fromEntries(members.map(m => [m.name.toLowerCase(), m.id]));
      let imported = 0, skipped = 0;

      const newData = await writeData('travel', (remote) => {
        const trips = remote.trips || [];
        const existingKeys = new Set(trips.map(t => `${t.personId}|${t.dateOutIndia}`));

        records.forEach(rec => {
          const personId = memberMap[rec.personName?.toLowerCase()];
          if (!personId) { skipped++; return; } // Person not found

          const key = `${personId}|${rec.dateOutIndia}`;
          if (existingKeys.has(key)) { skipped++; return; } // Duplicate

          trips.push({ ...rec, id: rec.id || uuidv4(), personId });
          existingKeys.add(key);
          imported++;
        });

        return { ...remote, trips };
      });

      await setCachedTravelData(newData);
      progressCb(imported, skipped);
      return { imported, skipped };
    }
  });

  // Handle import complete navigation
  toolContainer.addEventListener('import:complete', () => {
    modal.classList.add('hidden');
    navigate('travel-log');
  });
}
  const modal = document.getElementById('member-modal');
  modal.classList.remove('hidden');

  getCachedTravelData().then(data => {
    const { members = [] } = data || {};
    const existing = memberId ? members.find(m => m.id === memberId) : null;
    const state = {
      name:  existing?.name  || '',
      emoji: existing?.emoji || '👤',
      color: existing?.color || MEMBER_COLORS[0]
    };

    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div style="padding:0 20px 24px;">
          <div style="font-size:17px;font-weight:700;margin-bottom:20px;">${existing ? 'Edit Member' : 'Add Member'}</div>

          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="member-name" value="${state.name}" placeholder="Family member name" />
          </div>

          <div class="form-group">
            <label class="form-label">Avatar</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;" id="emoji-grid">
              ${MEMBER_EMOJIS.map(e => `
                <button type="button" style="
                  width:44px;height:44px;border-radius:50%;font-size:22px;
                  border:2px solid ${state.emoji === e ? 'var(--primary)' : 'transparent'};
                  background:${state.emoji === e ? 'var(--primary-bg)' : 'var(--surface-3)'};
                  cursor:pointer;
                " data-emoji="${e}">${e}</button>
              `).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color</label>
            <div style="display:flex;gap:8px;">
              ${MEMBER_COLORS.map(c => `
                <button type="button" style="
                  width:36px;height:36px;border-radius:50%;background:${c};
                  border:2px solid ${state.color === c ? 'var(--primary)' : 'transparent'};
                  cursor:pointer;
                " data-color="${c}"></button>
              `).join('')}
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:8px;">
            ${existing ? `<button class="btn btn-danger" style="flex:1;" id="delete-member-btn">Delete</button>` : ''}
            <button class="btn btn-primary" style="flex:2;" id="save-member-btn">
              ${existing ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Emoji selection
    modal.querySelectorAll('[data-emoji]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.emoji = btn.dataset.emoji;
        modal.querySelectorAll('[data-emoji]').forEach(b => {
          b.style.border = `2px solid ${b.dataset.emoji === state.emoji ? 'var(--primary)' : 'transparent'}`;
          b.style.background = b.dataset.emoji === state.emoji ? 'var(--primary-bg)' : 'var(--surface-3)';
        });
      });
    });

    // Color selection
    modal.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.color = btn.dataset.color;
        modal.querySelectorAll('[data-color]').forEach(b => {
          b.style.border = `2px solid ${b.dataset.color === state.color ? 'var(--primary)' : 'transparent'}`;
        });
      });
    });

    // Save member
    document.getElementById('save-member-btn').addEventListener('click', async () => {
      const name = document.getElementById('member-name').value.trim();
      if (!name) { showToast('Please enter a name', 'warning'); return; }

      const memberData = {
        id:    existing?.id || uuidv4(),
        name, emoji: state.emoji, color: state.color
      };

      try {
        const newData = await writeData('travel', (remote) => {
          const mems = remote.members || [];
          if (existing) {
            const idx = mems.findIndex(m => m.id === memberData.id);
            if (idx > -1) mems[idx] = memberData;
            else mems.push(memberData);
          } else {
            mems.push(memberData);
          }
          return { ...remote, members: mems };
        });
        await setCachedTravelData(newData);
        showToast(existing ? 'Member updated!' : 'Member added!', 'success');
        modal.classList.add('hidden');
        renderSettings(document.querySelector('#screen'));
      } catch {
        showToast('Save failed', 'error');
      }
    });

    // Delete member
    document.getElementById('delete-member-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete ${existing.name}? Their trip and document records will be kept.`)) return;
      try {
        const newData = await writeData('travel', (remote) => ({
          ...remote,
          members: (remote.members || []).filter(m => m.id !== memberId)
        }));
        await setCachedTravelData(newData);
        showToast('Member removed', 'success');
        modal.classList.add('hidden');
        renderSettings(document.querySelector('#screen'));
      } catch {
        showToast('Delete failed', 'error');
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}
