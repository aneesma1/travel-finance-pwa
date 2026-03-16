// ─── app-a-family-hub/js/screens/add-document.js ────────────────────────────
// Add / Edit Document: person pill, doc type, expiry, alert toggles, Calendar sync

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../shared/db.js';
import { writeData } from '../../shared/drive.js';
import { navigate } from '../router.js';
import { PillSelect } from '../../shared/pill-select.js';
import { SmartInput } from '../../shared/smart-input.js';
import { uuidv4, today, daysFromToday, expiryStatus, showToast } from '../../shared/utils.js';
import { syncDocumentAlerts, deleteAllDocumentAlerts } from '../calendar.js';

const DOC_TYPES  = ['Passport','QID','Visa','Driving Licence','Other'];
const ALERT_DAYS = [90, 60, 30];

export async function renderAddDocument(container, params = {}) {
  const { docId, mode, personId: defaultPersonId } = params;
  const isEdit = mode === 'edit' && docId;

  const data = await getCachedTravelData();
  const { members = [], documents = [] } = data || {};

  const existing = isEdit ? documents.find(d => d.id === docId) : null;
  const allDocNumbers = [...new Set(documents.map(d => d.docNumber).filter(Boolean))];

  const state = {
    personId:   existing?.personId   || defaultPersonId || '',
    docName:    existing?.docName    || 'Passport',
    docNumber:  existing?.docNumber  || '',
    expiryDate: existing?.expiryDate || '',
    alertDays:  existing?.alertDays  || [90, 60, 30],
    calSynced:  existing?.calSynced  || false,
    calEventIds: existing?.calEventIds || {}, // { 90: eventId, 60: eventId, 30: eventId }
  };

  function render() {
    const expired = state.expiryDate && daysFromToday(state.expiryDate) < 0;

    container.innerHTML = `
      <div class="app-header">
        <button class="app-header-action" id="back-btn">←</button>
        <span class="app-header-title">${isEdit ? 'Edit Document' : 'Add Document'}</span>
        ${isEdit ? `<button class="app-header-action" id="delete-btn" style="color:#FCA5A5;">🗑️</button>` : '<span style="width:32px;"></span>'}
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:20px;">

        <div class="form-group" style="margin:0;">
          <label class="form-label">Person</label>
          <div id="person-pills"></div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Document Type</label>
          <div id="doctype-pills"></div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Document Number</label>
          <div id="docnum-input"></div>
        </div>

        <div class="form-group" style="margin:0;">
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

        <div class="card" style="${expired ? 'opacity:0.5;pointer-events:none;' : ''}">
          <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--text);">📅 Google Calendar Sync</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                ${expired
                  ? 'Disabled for expired documents'
                  : 'Creates alerts in your Google Calendar'}
              </div>
            </div>
            <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;">
              <input type="checkbox" id="cal-sync-toggle" ${state.calSynced ? 'checked' : ''}
                style="opacity:0;width:0;height:0;position:absolute;" />
              <span id="cal-toggle-track" style="
                position:absolute;inset:0;border-radius:13px;
                background:${state.calSynced ? 'var(--success)' : 'var(--border)'};
                transition:background 0.2s;
              ">
                <span style="
                  position:absolute;top:3px;left:${state.calSynced ? '25' : '3'}px;
                  width:20px;height:20px;border-radius:50%;background:#fff;
                  box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:left 0.2s;
                "></span>
              </span>
            </label>
          </div>
        </div>

        <div id="save-error" style="color:var(--danger);font-size:13px;text-align:center;"></div>

        <button class="btn btn-primary btn-full" id="save-btn">
          ${isEdit ? '💾 Save Changes' : '✅ Save Document'}
        </button>

      </div>
    `;

    // Back
    document.getElementById('back-btn').addEventListener('click', () => navigate('documents'));

    // Delete
    document.getElementById('delete-btn')?.addEventListener('click', () => deleteDoc());

    // Person pills
    new PillSelect(document.getElementById('person-pills'), {
      options: members.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
      selected: state.personId,
      color: 'indigo',
      onSelect: v => { state.personId = v || ''; }
    });

    // Doc type pills
    new PillSelect(document.getElementById('doctype-pills'), {
      options: DOC_TYPES.map(t => ({ value: t, label: t })),
      selected: state.docName,
      color: 'indigo',
      onSelect: v => { state.docName = v || 'Passport'; }
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

    // Calendar toggle
    const calToggle = document.getElementById('cal-sync-toggle');
    calToggle.addEventListener('change', () => {
      state.calSynced = calToggle.checked;
      const track = document.getElementById('cal-toggle-track');
      const knob  = track.querySelector('span');
      track.style.background = state.calSynced ? 'var(--success)' : 'var(--border)';
      knob.style.left = state.calSynced ? '25px' : '3px';
    });

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
        docNumber:   state.docNumber,
        expiryDate:  state.expiryDate,
        alertDays:   state.alertDays,
        calSynced:   state.calSynced,
        calEventIds: isEdit ? (existing.calEventIds || {}) : {}
      };

      // If cal sync turned OFF and was previously ON, delete events
      if (!state.calSynced && existing?.calSynced) {
        await deleteAllDocumentAlerts(existing).catch(() => {});
        docData.calEventIds = {};
      }

      // Sync calendar events if enabled
      if (state.calSynced && member) {
        try {
          docData.calEventIds = await syncDocumentAlerts(docData, member.name);
        } catch (calErr) {
          showToast('Saved — calendar sync had an error', 'warning');
          console.warn('Calendar sync error:', calErr);
        }
      }

      const newData = await writeData('travel', (remote) => {
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

  async function deleteDoc() {
    if (!confirm('Delete this document record? Calendar events will also be removed.')) return;
    try {
      if (existing?.calSynced) await deleteAllDocumentAlerts(existing).catch(() => {});
      const newData = await writeData('travel', (remote) => ({
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
