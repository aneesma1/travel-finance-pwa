// ─── app-a-family-hub/js/screens/add-trip.js ────────────────────────────────
// Add / Edit Trip: 5-step form with smart search and live computed fields

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../shared/db.js';
import { writeData } from '../../shared/drive.js';
import { navigate } from '../router.js';
import { PillSelect }  from '../../shared/pill-select.js';
import { SmartInput }  from '../../shared/smart-input.js';
import {
  uuidv4, today, toISODate, daysBetween, formatDisplayDate, showToast
} from '../../shared/utils.js';

const STEPS = ['Person', 'Dates', 'Flights', 'Reason', 'Review'];

export async function renderAddTrip(container, params = {}) {
  const { tripId, mode } = params;
  const isEdit = mode === 'edit' && tripId;

  const data = await getCachedTravelData();
  const { members = [], trips = [] } = data || {};

  // Load existing trip if editing
  let existingTrip = isEdit ? trips.find(t => t.id === tripId) : null;

  // Form state
  const state = {
    personId:     existingTrip?.personId     || '',
    dateOutIndia: existingTrip?.dateOutIndia || '',
    dateInQatar:  existingTrip?.dateInQatar  || '',
    dateOutQatar: existingTrip?.dateOutQatar || '',
    dateInIndia:  existingTrip?.dateInIndia  || '',
    flightInward: existingTrip?.flightInward || '',
    flightOutward:existingTrip?.flightOutward|| '',
    reason:       existingTrip?.reason       || '',
    travelWith:   existingTrip?.travelWith   || [],
  };

  let currentStep = 0;

  // Suggestions from history
  const allFlights = [...new Set(trips.flatMap(t => [t.flightInward, t.flightOutward]).filter(Boolean))];
  const allReasons = [...new Set(trips.map(t => t.reason).filter(Boolean))];

  function render() {
    container.innerHTML = `
      <div class="app-header">
        <button class="app-header-action" id="back-btn">←</button>
        <span class="app-header-title">${isEdit ? 'Edit Trip' : 'Add Trip'}</span>
        <span style="width:32px;"></span>
      </div>
      <div class="step-indicator">
        ${STEPS.map((s, i) => `
          <div class="step-dot ${i < currentStep ? 'done' : i === currentStep ? 'active' : ''}"></div>
        `).join('')}
      </div>
      <div style="padding:0 20px 4px 20px;font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
        Step ${currentStep + 1} of ${STEPS.length} — ${STEPS[currentStep]}
      </div>
      <div id="step-content" style="padding:20px;"></div>
      <div style="padding:16px 20px 32px;display:flex;gap:10px;">
        ${currentStep > 0 ? `<button class="btn btn-secondary" style="flex:1;" id="prev-btn">← Back</button>` : ''}
        <button class="btn btn-primary" style="flex:2;" id="next-btn">
          ${currentStep === STEPS.length - 1 ? (isEdit ? '💾 Save Changes' : '✅ Save Trip') : 'Next →'}
        </button>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => navigate('travel-log'));
    document.getElementById('prev-btn')?.addEventListener('click', () => { currentStep--; render(); });
    document.getElementById('next-btn').addEventListener('click', () => handleNext());

    renderStep();
  }

  function renderStep() {
    const stepContent = document.getElementById('step-content');

    switch (currentStep) {
      case 0: renderPersonStep(stepContent, members); break;
      case 1: renderDatesStep(stepContent); break;
      case 2: renderFlightsStep(stepContent); break;
      case 3: renderReasonStep(stepContent, members); break;
      case 4: renderReviewStep(stepContent, members); break;
    }
  }

  // ── Step 0: Person ──────────────────────────────────────────────────
  function renderPersonStep(el, members) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Who is travelling?</label>
        <div id="person-pills"></div>
      </div>
    `;
    new PillSelect(document.getElementById('person-pills'), {
      options: members.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
      selected: state.personId,
      multi: false,
      color: 'indigo',
      onSelect: (val) => { state.personId = val || ''; }
    });
  }

  // ── Step 1: Dates ───────────────────────────────────────────────────
  function renderDatesStep(el) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Date Out of India</label>
        <input type="date" class="form-input" id="dateOutIndia" value="${state.dateOutIndia}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Arrived in Qatar</label>
        <input type="date" class="form-input" id="dateInQatar" value="${state.dateInQatar}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Out of Qatar <span style="color:var(--text-muted);font-weight:400;">(leave blank if still in Qatar)</span></label>
        <input type="date" class="form-input" id="dateOutQatar" value="${state.dateOutQatar}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Back in India <span style="color:var(--text-muted);font-weight:400;">(leave blank if not returned)</span></label>
        <input type="date" class="form-input" id="dateInIndia" value="${state.dateInIndia}" />
      </div>
      <div id="days-computed" style="background:var(--primary-bg);border-radius:var(--radius-md);padding:12px 16px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;"></div>
    `;

    ['dateOutIndia','dateInQatar','dateOutQatar','dateInIndia'].forEach(field => {
      const input = document.getElementById(field);
      input.addEventListener('change', () => {
        state[field] = input.value;
        updateDaysComputed();
      });
    });
    updateDaysComputed();
  }

  function updateDaysComputed() {
    const el = document.getElementById('days-computed');
    if (!el) return;
    const parts = [];

    if (state.dateInQatar && state.dateOutQatar) {
      const days = daysBetween(state.dateInQatar, state.dateOutQatar);
      parts.push(`<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:var(--primary);">${days}</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">Days in Qatar</div></div>`);
    } else if (state.dateInQatar) {
      const days = daysBetween(state.dateInQatar, today());
      parts.push(`<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:var(--success);">${days}</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">Days so far</div></div>`);
    }

    if (state.dateOutIndia && state.dateInIndia) {
      const days = daysBetween(state.dateOutIndia, state.dateInIndia);
      parts.push(`<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:var(--text);">${days}</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">Total trip days</div></div>`);
    }

    el.innerHTML = parts.join('<div style="width:1px;background:var(--border);align-self:stretch;"></div>') || `<span style="font-size:13px;color:var(--text-muted);">Enter dates above to see calculations</span>`;
  }

  // ── Step 2: Flights ─────────────────────────────────────────────────
  function renderFlightsStep(el) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Inward Flight to Qatar</label>
        <div id="flight-inward-input"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Outward Flight back to India</label>
        <div id="flight-outward-input"></div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">e.g. QR512, AI351 — tap a suggestion or type new</p>
    `;

    new SmartInput(document.getElementById('flight-inward-input'), {
      suggestions: allFlights,
      value: state.flightInward,
      placeholder: 'e.g. QR512',
      onInput: (v) => { state.flightInward = v; },
      onSelect: (v) => { state.flightInward = v; }
    });

    new SmartInput(document.getElementById('flight-outward-input'), {
      suggestions: allFlights,
      value: state.flightOutward,
      placeholder: 'e.g. QR513',
      onInput: (v) => { state.flightOutward = v; },
      onSelect: (v) => { state.flightOutward = v; }
    });
  }

  // ── Step 3: Reason + Travel With ────────────────────────────────────
  function renderReasonStep(el, members) {
    const otherMembers = members.filter(m => m.id !== state.personId);

    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Reason for Travel</label>
        <div id="reason-input"></div>
      </div>
      ${otherMembers.length > 0 ? `
        <div class="form-group">
          <label class="form-label">Travelling with</label>
          <div id="travel-with-pills"></div>
        </div>
      ` : ''}
    `;

    new SmartInput(document.getElementById('reason-input'), {
      suggestions: allReasons,
      value: state.reason,
      placeholder: 'e.g. Work, Holiday, Medical…',
      onInput: (v) => { state.reason = v; },
      onSelect: (v) => { state.reason = v; }
    });

    if (otherMembers.length) {
      new PillSelect(document.getElementById('travel-with-pills'), {
        options: otherMembers.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
        selected: state.travelWith,
        multi: true,
        color: 'indigo',
        onSelect: (val) => { state.travelWith = val || []; }
      });
    }
  }

  // ── Step 4: Review ──────────────────────────────────────────────────
  function renderReviewStep(el, members) {
    const member = members.find(m => m.id === state.personId);
    const daysInQatar = state.dateInQatar && state.dateOutQatar
      ? daysBetween(state.dateInQatar, state.dateOutQatar) : null;
    const travelWithNames = (state.travelWith || [])
      .map(id => members.find(m => m.id === id)?.name).filter(Boolean);

    const row = (label, value) => value
      ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light);">
           <span style="font-size:13px;color:var(--text-muted);">${label}</span>
           <span style="font-size:13px;font-weight:600;color:var(--text);text-align:right;max-width:200px;">${value}</span>
         </div>`
      : '';

    el.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;">
        <div style="background:var(--primary);padding:14px 20px;display:flex;align-items:center;gap:12px;">
          <div style="font-size:28px;">${member?.emoji || '👤'}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:#fff;">${member?.name || 'Unknown'}</div>
            ${daysInQatar !== null ? `<div style="font-size:13px;color:rgba(255,255,255,0.75);">${daysInQatar} days in Qatar</div>` : ''}
          </div>
        </div>
        <div style="padding:0 16px 8px;">
          ${row('Out of India', formatDisplayDate(state.dateOutIndia))}
          ${row('Arrived Qatar', formatDisplayDate(state.dateInQatar))}
          ${row('Left Qatar', state.dateOutQatar ? formatDisplayDate(state.dateOutQatar) : 'Still in Qatar')}
          ${row('Back in India', state.dateInIndia ? formatDisplayDate(state.dateInIndia) : 'Not yet')}
          ${row('Inward Flight', state.flightInward)}
          ${row('Outward Flight', state.flightOutward)}
          ${row('Reason', state.reason)}
          ${row('Travelling with', travelWithNames.join(', '))}
        </div>
      </div>
      <div id="save-error" style="color:var(--danger);font-size:13px;margin-top:12px;text-align:center;"></div>
    `;
  }

  // ── Validation ──────────────────────────────────────────────────────
  function validate() {
    if (currentStep === 0 && !state.personId) {
      showToast('Please select a person', 'warning');
      return false;
    }
    if (currentStep === 1) {
      if (!state.dateOutIndia) { showToast('Please enter Date Out of India', 'warning'); return false; }
      if (!state.dateInQatar)  { showToast('Please enter Date Arrived in Qatar', 'warning'); return false; }
      if (state.dateInQatar < state.dateOutIndia) {
        showToast('Arrival in Qatar must be after departure from India', 'error');
        return false;
      }
      if (state.dateOutQatar && state.dateOutQatar < state.dateInQatar) {
        showToast('Date Out Qatar must be after Date In Qatar', 'error');
        return false;
      }
      if (state.dateInIndia && state.dateOutQatar && state.dateInIndia < state.dateOutQatar) {
        showToast('Return to India must be after leaving Qatar', 'error');
        return false;
      }
    }
    return true;
  }

  // ── Save ────────────────────────────────────────────────────────────
  async function saveTrip() {
    const daysInQatar = state.dateInQatar && state.dateOutQatar
      ? daysBetween(state.dateInQatar, state.dateOutQatar) : null;

    const tripData = {
      id:           isEdit ? existingTrip.id : uuidv4(),
      timestamp:    isEdit ? existingTrip.timestamp : new Date().toISOString(),
      personId:     state.personId,
      dateOutIndia: state.dateOutIndia,
      dateInQatar:  state.dateInQatar,
      dateOutQatar: state.dateOutQatar || null,
      dateInIndia:  state.dateInIndia  || null,
      daysInQatar:  daysInQatar,
      flightInward: state.flightInward,
      flightOutward:state.flightOutward,
      reason:       state.reason,
      travelWith:   state.travelWith,
    };

    // Duplicate check for new trips
    if (!isEdit) {
      const duplicate = (data?.trips || []).find(
        t => t.personId === state.personId && t.dateOutIndia === state.dateOutIndia
      );
      if (duplicate) {
        const ok = confirm(`A trip for this person starting on ${formatDisplayDate(state.dateOutIndia)} already exists. Save anyway?`);
        if (!ok) return;
      }
    }

    try {
      document.getElementById('next-btn').disabled = true;
      document.getElementById('next-btn').textContent = 'Saving…';

      const newData = await writeData('travel', (remote) => {
        const trips = remote.trips || [];
        if (isEdit) {
          const idx = trips.findIndex(t => t.id === tripData.id);
          if (idx > -1) trips[idx] = tripData;
          else trips.push(tripData);
        } else {
          trips.push(tripData);
        }
        return { ...remote, trips };
      });

      await setCachedTravelData(newData);
      showToast(isEdit ? 'Trip updated!' : 'Trip saved!', 'success');
      navigate('travel-log');
    } catch (err) {
      const errEl = document.getElementById('save-error');
      if (errEl) errEl.textContent = 'Save failed: ' + err.message;
      document.getElementById('next-btn').disabled = false;
      document.getElementById('next-btn').textContent = isEdit ? '💾 Save Changes' : '✅ Save Trip';
      showToast('Save failed — check connection', 'error');
    }
  }

  function handleNext() {
    if (!validate()) return;
    if (currentStep === STEPS.length - 1) {
      saveTrip();
    } else {
      currentStep++;
      render();
    }
  }

  render();
}
