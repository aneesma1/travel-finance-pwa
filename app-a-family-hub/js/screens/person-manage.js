// v3.5.5 — 2026-03-22
// ─── app-a-family-hub/js/screens/person-manage.js ───────────────────────────
// Comprehensive Person Management: rename, merge, duplicate detection
// Opens as a bottom sheet from the People screen

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { showToast } from '../../../shared/utils.js';

// ── Levenshtein distance for duplicate detection ─────────────────────────────
function levenshtein(a, b) {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function findDuplicates(members) {
  const pairs = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const dist = levenshtein(members[i].name, members[j].name);
      if (dist <= 2) pairs.push({ a: members[i], b: members[j], dist });
    }
  }
  return pairs;
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function openPersonManage(onDone) {
  const data = await getCachedTravelData();
  const { members = [], trips = [], documents = [] } = data || {};

  if (!members.length) { showToast('No members yet', 'warning'); return; }

  const dupes = findDuplicates(members);

  // Sheet
  const sheet = document.createElement('div');
  sheet.id = 'person-manage-sheet';
  sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;' +
    'background:var(--surface);border-radius:20px 20px 0 0;' +
    'border-top:1px solid var(--border);max-height:88vh;' +
    'display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,0.18);';

  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  const close = (changed) => {
    sheet.remove();
    backdrop.remove();
    if (changed) onDone();
  };
  backdrop.addEventListener('click', () => close(false));

  function renderSheet() {
    const currentData = data;
    const currentMembers = data.members || [];
    const currentDupes = findDuplicates(currentMembers);

    sheet.innerHTML =
      '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:12px auto 0;flex-shrink:0;"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px 10px;flex-shrink:0;">' +
        '<span style="font-size:17px;font-weight:700;">👥 Manage People</span>' +
        '<button id="pm-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">×</button>' +
      '</div>' +

      // Duplicate warning banner
      (currentDupes.length > 0 ?
        '<div style="margin:0 16px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:10px 14px;flex-shrink:0;">' +
          '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:4px;">⚠️ Possible duplicates detected</div>' +
          currentDupes.map(p =>
            '<div style="font-size:12px;color:#78350F;margin-top:2px;">' +
            '"' + p.a.name + '" and "' + p.b.name + '" look similar — consider merging</div>'
          ).join('') +
        '</div>' : '') +

      '<div style="overflow-y:auto;flex:1;padding:0 16px 24px;">' +

        '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">All Members</div>' +

        currentMembers.map(m => {
          const tripCount = (data.trips || []).filter(t => t.personId === m.id).length;
          const docCount  = (data.documents || []).filter(d => d.personId === m.id).length;
          const isDupe = currentDupes.some(p => p.a.id === m.id || p.b.id === m.id);
          return '<div style="background:var(--surface-3);border:1px solid ' + (isDupe ? '#F59E0B' : 'var(--border)') + ';' +
            'border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
              '<div style="font-size:24px;">' + (m.emoji || '👤') + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:15px;font-weight:700;">' + m.name + '</div>' +
                '<div style="font-size:12px;color:var(--text-muted);">' + tripCount + ' trips · ' + docCount + ' documents</div>' +
              '</div>' +
              (isDupe ? '<span style="font-size:18px;" title="Possible duplicate">⚠️</span>' : '') +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button class="pm-rename" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g,'&quot;') + '" ' +
                'style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);' +
                'background:var(--surface);font-size:13px;cursor:pointer;font-family:inherit;">✏️ Rename</button>' +
              '<button class="pm-merge" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g,'&quot;') + '" ' +
                'style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);' +
                'background:var(--surface);font-size:13px;cursor:pointer;font-family:inherit;">🔀 Merge into…</button>' +
            '</div>' +
          '</div>';
        }).join('') +

      '</div>';

    document.getElementById('pm-close').addEventListener('click', () => close(false));

    // Rename
    sheet.querySelectorAll('.pm-rename').forEach(btn => {
      btn.addEventListener('click', () => openRenameSheet(btn.dataset.id, btn.dataset.name));
    });

    // Merge
    sheet.querySelectorAll('.pm-merge').forEach(btn => {
      btn.addEventListener('click', () => openMergeSheet(btn.dataset.id, btn.dataset.name));
    });
  }

  // ── Rename sheet ─────────────────────────────────────────────────────────
  function openRenameSheet(memberId, currentName) {
    const inner = document.createElement('div');
    inner.style.cssText = 'position:fixed;inset:0;z-index:1001;display:flex;align-items:flex-end;justify-content:center;';
    inner.innerHTML =
      '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.4);" id="rename-bg"></div>' +
      '<div style="position:relative;width:100%;max-width:480px;background:var(--surface);' +
        'border-radius:20px 20px 0 0;padding:20px 20px 40px;z-index:1;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">✏️ Rename Person</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">This will update the name everywhere — trips, documents, everything.</div>' +
        '<input id="rename-input" type="text" class="form-input" value="' + currentName + '" style="margin-bottom:14px;" />' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="rename-cancel" class="btn btn-secondary" style="flex:1;">Cancel</button>' +
          '<button id="rename-confirm" class="btn btn-primary" style="flex:2;">Save Name</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(inner);
    const input = document.getElementById('rename-input');
    setTimeout(() => { input.focus(); input.select(); }, 100);

    const closeInner = () => inner.remove();
    document.getElementById('rename-bg').addEventListener('click', closeInner);
    document.getElementById('rename-cancel').addEventListener('click', closeInner);

    document.getElementById('rename-confirm').addEventListener('click', async () => {
      const newName = input.value.trim();
      if (!newName) { showToast('Name cannot be empty', 'warning'); return; }
      if (newName === currentName) { closeInner(); return; }

      const saved = await localSave('travel', r => ({
        ...r,
        members: (r.members || []).map(m =>
          m.id === memberId ? { ...m, name: newName } : m
        )
      }));
      await setCachedTravelData(saved);
      // Update local data reference
      const member = data.members.find(m => m.id === memberId);
      if (member) member.name = newName;

      closeInner();
      showToast('"' + currentName + '" renamed to "' + newName + '"', 'success', 3000);
      renderSheet(); // refresh
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('rename-confirm').click();
    });
  }

  // ── Merge sheet ───────────────────────────────────────────────────────────
  function openMergeSheet(fromId, fromName) {
    const others = (data.members || []).filter(m => m.id !== fromId);
    if (!others.length) { showToast('No other members to merge into', 'warning'); return; }

    const fromTrips = (data.trips || []).filter(t => t.personId === fromId).length;
    const fromDocs  = (data.documents || []).filter(d => d.personId === fromId).length;

    const inner = document.createElement('div');
    inner.style.cssText = 'position:fixed;inset:0;z-index:1001;display:flex;align-items:flex-end;justify-content:center;';
    inner.innerHTML =
      '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.4);" id="merge-bg"></div>' +
      '<div style="position:relative;width:100%;max-width:480px;background:var(--surface);' +
        'border-radius:20px 20px 0 0;padding:20px 20px 40px;z-index:1;max-height:80vh;overflow-y:auto;">' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">🔀 Merge "' + fromName + '"</div>' +
        '<div style="background:var(--surface-3);border-radius:8px;padding:10px 14px;margin-bottom:16px;">' +
          '<div style="font-size:13px;color:var(--text-muted);">Will move to the selected person:</div>' +
          '<div style="font-size:14px;font-weight:600;margin-top:4px;">✈️ ' + fromTrips + ' trips &nbsp;·&nbsp; 🪪 ' + fromDocs + ' documents</div>' +
          '<div style="font-size:12px;color:var(--danger);margin-top:4px;">Then "' + fromName + '" will be deleted</div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Select target person</div>' +
        '<div id="merge-targets">' +
          others.map(m => {
            const tc = (data.trips || []).filter(t => t.personId === m.id).length;
            const dc = (data.documents || []).filter(d => d.personId === m.id).length;
            return '<button class="merge-target" data-id="' + m.id + '" data-name="' + m.name.replace(/"/g,'&quot;') + '" ' +
              'style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;' +
              'border-radius:10px;border:1.5px solid var(--border);background:transparent;' +
              'margin-bottom:8px;cursor:pointer;text-align:left;font-family:inherit;">' +
              '<span style="font-size:22px;">' + (m.emoji || '👤') + '</span>' +
              '<div style="flex:1;">' +
                '<div style="font-size:14px;font-weight:600;">' + m.name + '</div>' +
                '<div style="font-size:12px;color:var(--text-muted);">' + tc + ' trips · ' + dc + ' docs</div>' +
              '</div>' +
              '<span style="font-size:13px;color:var(--text-muted);">→</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<button id="merge-cancel" class="btn btn-secondary btn-full" style="margin-top:4px;">Cancel</button>' +
      '</div>';

    document.body.appendChild(inner);

    const closeInner = () => inner.remove();
    document.getElementById('merge-bg').addEventListener('click', closeInner);
    document.getElementById('merge-cancel').addEventListener('click', closeInner);

    inner.querySelectorAll('.merge-target').forEach(btn => {
      btn.addEventListener('click', () => {
        const toId   = btn.dataset.id;
        const toName = btn.dataset.name;
        closeInner();
        confirmMerge(fromId, fromName, toId, toName, fromTrips, fromDocs);
      });
    });
  }

  // ── Confirm + execute merge ───────────────────────────────────────────────
  function confirmMerge(fromId, fromName, toId, toName, tripCount, docCount) {
    const total = tripCount + docCount;
    if (!confirm(
      'Merge "' + fromName + '" into "' + toName + '"?\n\n' +
      '• ' + tripCount + ' trips will move to ' + toName + '\n' +
      '• ' + docCount + ' documents will move to ' + toName + '\n' +
      '• "' + fromName + '" will be deleted\n\n' +
      'This cannot be undone.'
    )) return;

    executeMerge(fromId, fromName, toId, toName);
  }

  async function executeMerge(fromId, fromName, toId, toName) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    overlay.innerHTML = '<div class="spinner" style="border-color:#fff;border-top-color:transparent;width:36px;height:36px;"></div>' +
      '<div style="color:#fff;font-size:15px;font-weight:600;">Merging people…</div>';
    document.body.appendChild(overlay);

    try {
      const saved = await localSave('travel', r => ({
        ...r,
        // Reassign all trips from fromId to toId
        trips: (r.trips || []).map(t =>
          t.personId === fromId ? { ...t, personId: toId } : t
        ),
        // Reassign all documents from fromId to toId
        documents: (r.documents || []).map(d =>
          d.personId === fromId ? { ...d, personId: toId } : d
        ),
        // Remove the merged-from member
        members: (r.members || []).filter(m => m.id !== fromId)
      }));
      await setCachedTravelData(saved);

      // Update local data
      data.trips     = saved.trips;
      data.documents = saved.documents;
      data.members   = saved.members;

      overlay.remove();
      showToast('"' + fromName + '" merged into "' + toName + '" successfully', 'success', 4000);
      renderSheet(); // refresh with updated data
    } catch (err) {
      overlay.remove();
      showToast('Merge failed: ' + err.message, 'error');
    }
  }

  renderSheet();
}
