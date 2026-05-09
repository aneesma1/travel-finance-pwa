// v3.5.6 — 2026-05-09 — Replace dead Google Calendar toggle with Android Calendar + task.org reminder button

// ─── app-a-family-hub/js/screens/add-document.js ────────────────────────────
// Add / Edit Document: person pill, doc type, expiry, alert toggles, Reminder button

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../shared/db.js';
import { localSave } from '../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { PillSelect } from '../../shared/pill-select.js';
import { renderPhotoSlots } from '../../shared/photo-picker.js';
import { SmartInput } from '../../shared/smart-input.js';
import { uuidv4, today, daysFromToday, expiryStatus, showToast } from '../../shared/utils.js';
// calendar.js is fully stubbed — kept import for compatibility but no longer called

const DOC_TYPES_DEFAULT = ['Passport','QID','Visa','Driving Licence'];
const ALERT_DAYS = [90, 60, 30];

export async function renderAddDocument(container, params = {}) {
  const { docId, mode, personId: defaultPersonId } = params;
  const isExisting = !!docId;
  const isEdit = isExisting;  // any existing doc can be edited
  let isViewMode = isExisting && mode !== 'edit';  // view by default, edit only when explicitly requested

  const data = await getCachedTravelData();
  const { members = [], documents = [], customDocTypes = [] } = data || {};
  const allDocTypes = [...DOC_TYPES_DEFAULT, ...customDocTypes.filter(t => !DOC_TYPES_DEFAULT.includes(t))];

  const existing = isEdit ? documents.find(d => d.id === docId) : null;
  const allDocNumbers = [...new Set(documents.map(d => d.docNumber).filter(Boolean))];

  const state = {
    personId:   existing?.personId   || defaultPersonId || '',
    docName:    existing?.docName    || 'Passport',
    photos:     existing?.photos     || [],
    docNumber:  existing?.docNumber  || '',
    expiryDate: existing?.expiryDate || '',
    alertDays:  existing?.alertDays  || [90, 60, 30],
    // calSynced / calEventIds kept in schema for backward compat — not actively used
  };

  function render() {
    const expired = state.expiryDate && daysFromToday(state.expiryDate) < 0;

    container.innerHTML = `
      <div class="app-header">
        <button class="app-header-action" id="back-btn">←</button>
        <span class="app-header-title">${isViewMode ? 'Document' : isEdit ? 'Edit Document' : 'Add Document'}</span>
        <div style="display:flex;gap:4px;">
          ${isViewMode
            ? `<button class="app-header-action" id="share-doc-btn" title="Share" style="font-size:18px;">💬</button>
               <button class="app-header-action" id="edit-doc-btn" style="font-size:13px;font-weight:700;">✏️ Edit</button>`
            : isEdit
              ? `<button class="app-header-action" id="delete-btn" style="color:#FCA5A5;">🗑️</button>`
              : '<span style="width:32px;"></span>'
          }
        </div>
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:20px;">

        <div class="form-group" style="margin:0;">
          <label class="form-label">Person</label>
          <div id="person-pills"></div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Document Type</label>
          <div id="doctype-pills" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" id="doctype-new-input" class="form-input" placeholder="Type a new document type…"
              style="flex:1;font-size:13px;" list="doctype-datalist" />
            <datalist id="doctype-datalist"></datalist>
            <button id="doctype-add-btn" class="btn btn-secondary" style="padding:10px 14px;font-size:13px;white-space:nowrap;">+ Add</button>
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Document Number</label>
          <div id="docnum-input"></div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Document Photos <span style="color:var(--text-muted);font-weight:400;">(optional -- front & back)</span></label>
          <div id="doc-photo-slots" style="margin-bottom:4px;"></div>

          <label class="form-label">Expiry Date</label>
          <input type="date" class="form-input" id="expiry-date" value="${state.expiryDate}" />
          ${state.expiryDate ? `
            <div id="expiry-info" style="margin-top:8px;"></div>
          ` : ''}
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Alert me before expiry</label>
          <div id="alert-toggles" style="display:flex;gap:8px;"></div>
        </div>

        ${!expired && state.expiryDate ? `
        <button id="add-reminder-btn" class="btn btn-secondary btn-full" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px;">
          <span style="font-size:20px;">📅</span>
          <div style="text-align:left;">
            <div style="font-size:14px;font-weight:600;">Add Reminder</div>
            <div style="font-size:11px;color:var(--text-muted);">Opens Calendar or task.org with expiry alert pre-filled</div>
          </div>
        </button>
        ` : ''}

        <div id="save-error" style="color:var(--danger);font-size:13px;text-align:center;"></div>

        <button class="btn btn-primary btn-full" id="save-btn">
          ${isEdit ? '💾 Save Changes' : '✅ Save Document'}
        </button>

      </div>
    `;

    // Back
    document.getElementById('back-btn').addEventListener('click', () => navigate('documents'));

    // View / Edit / Share mode
    if (isViewMode) {
      document.getElementById('edit-doc-btn')?.addEventListener('click', () => {
        isViewMode = false; render();
      });
      document.getElementById('share-doc-btn')?.addEventListener('click', () => shareDocText());
      setTimeout(() => {
        container.querySelectorAll('input, select, textarea, button:not(#back-btn):not(#share-doc-btn):not(#edit-doc-btn)').forEach(el => {
          el.disabled = true; el.style.opacity = '0.75'; el.style.cursor = 'default';
        });
      }, 0);
    }

    // Delete
    document.getElementById('delete-btn')?.addEventListener('click', () => deleteDoc());

    // Photo slots
    const photoContainer = document.getElementById('doc-photo-slots');
    if (photoContainer) {
      renderPhotoSlots(photoContainer, state.photos, 2, (newPhotos) => {
        state.photos = newPhotos;
      });
    }

    // Person pills
    new PillSelect(document.getElementById('person-pills'), {
      options: members.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
      selected: state.personId,
      color: 'indigo',
      onSelect: v => { state.personId = v || ''; }
    });

    // Doc type chips - custom, deletable
    function renderDocTypeChips() {
      const el = document.getElementById('doctype-pills');
      if (!el) return;
      el.innerHTML = allDocTypes.map(t => {
        const active = state.docName === t;
        const isDefault = DOC_TYPES_DEFAULT.includes(t);
        return '<div style="display:inline-flex;align-items:center;gap:4px;padding:7px 12px;' +
          'border-radius:20px;border:1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)') + ';' +
          'background:' + (active ? 'var(--primary-bg)' : 'transparent') + ';' +
          'cursor:pointer;font-size:13px;font-weight:' + (active ? '600' : '400') + ';' +
          'color:' + (active ? 'var(--primary)' : 'var(--text)') + ';" data-type="' + t + '">' +
          '<span>' + t + '</span>' +
          (!isDefault ? '<button data-delete-type="' + t + '" style="background:none;border:none;cursor:pointer;' +
            'color:' + (active ? 'var(--primary)' : 'var(--text-muted)') + ';font-size:14px;padding:0 0 0 4px;' +
            'line-height:1;">×</button>' : '') +
          '</div>';
      }).join('');

      el.querySelectorAll('[data-type]').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.dataset.deleteType) return; // handled below
          state.docName = chip.dataset.type;
          renderDocTypeChips();
        });
      });
      el.querySelectorAll('[data-delete-type]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const t = btn.dataset.deleteType;
          if (!confirm('Remove "' + t + '" from document types?')) return;
          const newCustom = (data.customDocTypes || []).filter(x => x !== t);
          const saved = await localSave('travel', r => ({ ...r, customDocTypes: newCustom }));
          await setCachedTravelData(saved);
          allDocTypes.splice(allDocTypes.indexOf(t), 1);
          if (state.docName === t) state.docName = 'Passport';
          renderDocTypeChips();
          showToast('"' + t + '" removed', 'success');
        });
      });

      // Datalist
      const dl = document.getElementById('doctype-datalist');
      if (dl) dl.innerHTML = allDocTypes.map(t => '<option value="' + t + '">').join('');
    }
    renderDocTypeChips();

    // Add new doc type
    document.getElementById('doctype-add-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('doctype-new-input');
      const val = input?.value.trim();
      if (!val) { showToast('Enter a document type name', 'warning'); return; }
      if (allDocTypes.includes(val)) { state.docName = val; input.value = ''; renderDocTypeChips(); return; }
      allDocTypes.push(val);
      state.docName = val;
      input.value = '';
      const newCustom = [...(data.customDocTypes || []).filter(t => !DOC_TYPES_DEFAULT.includes(t)), val];
      const saved = await localSave('travel', r => ({ ...r, customDocTypes: newCustom }));
      await setCachedTravelData(saved);
      renderDocTypeChips();
      showToast('"' + val + '" added', 'success');
    });
    document.getElementById('doctype-new-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('doctype-add-btn')?.click();
    });

    // Doc number smart input
    new SmartInput(document.getElementById('docnum-input'), {
      suggestions: allDocNumbers,
      value: state.docNumber,
      placeholder: 'Enter document number',
      onInput: v  => { state.docNumber = v; },
      onSelect: v => { state.docNumber = v; }
    });

    // Expiry date
    const expiryInput = document.getElementById('expiry-date');
    expiryInput.addEventListener('change', () => {
      state.expiryDate = expiryInput.value;
      updateExpiryInfo();
    });
    updateExpiryInfo();

    // Alert toggles
    renderAlertToggles();

    // Reminder button — opens device Calendar (any app) or task.org if installed
    document.getElementById('add-reminder-btn')?.addEventListener('click', () => openReminderIntent());

    // Save
    document.getElementById('save-btn').addEventListener('click', () => saveDocument());
  }

  function updateExpiryInfo() {
    const el = document.getElementById('expiry-info');
    if (!el || !state.expiryDate) return;
    const days   = daysFromToday(state.expiryDate);
    const status = expiryStatus(state.expiryDate);
    const colors = { expired:'var(--danger)', danger:'var(--danger)', warning:'var(--warning)', valid:'var(--success)' };
    const msgs   = {
      expired: '❌ Already expired',
      danger:  `⚠️ Expires in ${days} days`,
      warning: `⚠️ Expires in ${days} days`,
      valid:   `✅ Valid for ${days} days`
    };
    el.innerHTML = `<div style="font-size:13px;font-weight:600;color:${colors[status] || 'var(--text-muted)'};">${msgs[status] || ''}</div>`;
  }

  function renderAlertToggles() {
    const el = document.getElementById('alert-toggles');
    ALERT_DAYS.forEach(days => {
      const active = state.alertDays.includes(days);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = `
        flex:1; padding:10px; border-radius:var(--radius-md); cursor:pointer;
        font-size:13px; font-weight:600; border:1.5px solid;
        border-color:${active ? 'var(--primary-border)' : 'var(--border)'};
        background:${active ? 'var(--primary-bg)' : 'var(--surface)'};
        color:${active ? 'var(--primary)' : 'var(--text-muted)'};
        transition:all 0.15s; font-family:inherit;
      `;
      btn.textContent = `${days}d`;
      btn.addEventListener('click', () => {
        if (state.alertDays.includes(days)) {
          state.alertDays = state.alertDays.filter(d => d !== days);
        } else {
          state.alertDays = [...state.alertDays, days].sort((a,b) => b-a);
        }
        renderAlertToggles();
      });
      el.appendChild(btn);
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveDocument() {
    if (!state.personId) { showToast('Please select a person', 'warning'); return; }
    if (!state.docName)  { showToast('Please select a document type', 'warning'); return; }
    if (!state.expiryDate){ showToast('Please enter an expiry date', 'warning'); return; }

    try {
      document.getElementById('save-btn').disabled = true;
      document.getElementById('save-btn').textContent = 'Saving…';

      const member = (data?.members || []).find(m => m.id === state.personId);
      let docData = {
        id:          isEdit ? existing.id : uuidv4(),
        timestamp:   isEdit ? existing.timestamp : new Date().toISOString(),
        personId:    state.personId,
        docName:     state.docName,
        photos:      state.photos || [],
        docNumber:   state.docNumber,
        expiryDate:  state.expiryDate,
        alertDays:   state.alertDays,
      };

      const newData = await localSave('travel', (remote) => {
        const docs = remote.documents || [];
        if (isEdit) {
          const idx = docs.findIndex(d => d.id === docData.id);
          if (idx > -1) docs[idx] = docData;
          else docs.push(docData);
        } else {
          docs.push(docData);
        }
        return { ...remote, documents: docs };
      });

      await setCachedTravelData(newData);
      showToast(isEdit ? 'Document updated!' : 'Document saved!', 'success');
      navigate('documents');
    } catch (err) {
      const errEl = document.getElementById('save-error');
      if (errEl) errEl.textContent = 'Save failed: ' + err.message;
      document.getElementById('save-btn').disabled = false;
      document.getElementById('save-btn').textContent = isEdit ? '💾 Save Changes' : '✅ Save Document';
    }
  }

  // ── Share document as WhatsApp text ──────────────────────────────────────
  async function shareDocText() {
    if (!existing) return;
    const member = (data?.members || []).find(m => m.id === existing.personId);
    const days = existing.expiryDate
      ? Math.floor((new Date(existing.expiryDate) - new Date()) / 86400000) : null;
    const status = days == null ? '' : days < 0 ? '⛔ EXPIRED' : days < 30 ? '⚠️ Expires in ' + days + 'd' : days < 90 ? '⏰ ' + days + ' days left' : '✅ Valid (' + days + 'd left)';

    const lines = [
      '🪪 *Document Details*',
      '',
      '👤 Person: ' + (member?.name || 'Unknown'),
      '📄 Type: ' + (existing.docName || '—'),
      '🔢 Number: ' + (existing.docNumber || '—'),
      '📅 Expires: ' + (existing.expiryDate || '—') + (status ? '  ' + status : ''),
    ];
    if (existing.alertDays?.length) {
      lines.push('🔔 Alerts: ' + existing.alertDays.join('d, ') + 'd before');
    }
    lines.push('');
    lines.push('_Shared from Family Hub_');

    const text = lines.join('\n');
    showTextShareSheet(text);
  }

  function showTextShareSheet(text) {
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);padding:16px 20px 36px;box-shadow:0 -4px 24px rgba(0,0,0,0.2);';
    sheet.innerHTML = '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 14px;"></div>' +
      '<pre style="font-size:12px;color:var(--text-secondary);background:var(--surface-3);border-radius:8px;padding:12px;max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;margin-bottom:14px;">' + text.replace(/</g,'&lt;') + '</pre>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button id="ts-share-btn" class="btn btn-primary btn-full">📤 Share via apps</button>' +
        '<button id="ts-copy-btn" class="btn btn-secondary btn-full">📋 Copy to clipboard</button>' +
      '</div>';
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
    document.body.appendChild(backdrop); document.body.appendChild(sheet);
    const close = () => { sheet.remove(); backdrop.remove(); };
    backdrop.addEventListener('click', close);
    document.getElementById('ts-share-btn').addEventListener('click', async () => {
      if (navigator.share) { try { await navigator.share({ text }); close(); return; } catch {} }
      showToast('Use Copy instead', 'warning');
    });
    document.getElementById('ts-copy-btn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); showToast('✅ Copied!', 'success', 3000); }
      catch { showToast('Could not copy', 'error'); }
      close();
    });
  }

  // ── Reminder button — Android Calendar intent + task.org deep-link ─────────
  async function openReminderIntent() {
    if (!state.expiryDate) {
      showToast('Set an expiry date first', 'warning'); return;
    }
    const App = window.Capacitor?.Plugins?.App;
    if (!App) {
      showToast('Reminder only works in the Android app', 'info', 3000); return;
    }

    // Reminder fires on the earliest alert day before expiry (default 30 days)
    const alertDay = Math.min(...(state.alertDays.length ? state.alertDays : [30]));
    const reminderDate = new Date(state.expiryDate);
    reminderDate.setDate(reminderDate.getDate() - alertDay);

    const member    = members.find(m => m.id === state.personId);
    const personStr = member ? ` (${member.name})` : '';
    const title     = `Renew ${state.docName}${personStr}`;
    const notes     = `Document expires ${state.expiryDate}. Reminder set ${alertDay} days early.`;
    const dueDateStr = reminderDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // ── Try task.org first (if installed — handles 'tasks://' URI scheme) ────
    const tasksUri = `tasks://tasks/new?title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}&due=${dueDateStr}`;
    try {
      const { completed } = await App.openUrl({ url: tasksUri });
      if (completed) return; // task.org opened successfully
    } catch (_) { /* not installed — fall through to calendar */ }

    // ── Android Calendar insert intent ────────────────────────────────────────
    // All calendar apps (Google Calendar, Samsung, etc.) handle this intent.
    const beginMs = reminderDate.setHours(9, 0, 0, 0); // 9 AM on reminder day
    const endMs   = beginMs + 3_600_000; // 1 hour duration
    const calUri  = `intent://insert?beginTime=${beginMs}&endTime=${endMs}` +
      `&title=${encodeURIComponent(title)}&description=${encodeURIComponent(notes)}` +
      `#Intent;scheme=content;host=com.android.calendar;action=android.intent.action.INSERT;end`;
    try {
      await App.openUrl({ url: calUri });
    } catch (_) {
      showToast('Could not open Calendar. Add reminder manually.', 'warning', 4000);
    }
  }

  async function deleteDoc() {
    if (!confirm('Delete this document record?')) return;
    try {
      const newData = await localSave('travel', (remote) => ({
        ...remote,
        documents: (remote.documents || []).filter(d => d.id !== docId)
      }));
      await setCachedTravelData(newData);
      showToast('Document deleted', 'success');
      navigate('documents');
    } catch {
      showToast('Delete failed', 'error');
    }
  }

  render();
}
