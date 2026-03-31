// v3.5.30 — 2026-03-31

// ─── app-a-family-hub/js/screens/add-trip.js ────────────────────────────────
// Add / Edit Trip: 5-step form with smart search and live computed fields

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { PillSelect }  from '../../../shared/pill-select.js';
import { SmartInput }  from '../../../shared/smart-input.js';
import {
  uuidv4, today, toISODate, daysBetween, formatDisplayDate, showToast
} from '../../../shared/utils.js';
import { renderPhotoSlots, renderPhotoThumbnails } from '../../../shared/photo-picker.js';

const STEPS = ['Person', 'Dates', 'Flights', 'Reason', 'Photos', 'Review'];

export async function renderAddTrip(container, params = {}) {
  const { tripId, mode } = params;
  const isExisting = !!tripId;
  const isEdit = isExisting;  // any existing trip can be edited
  let isViewMode = isExisting && mode !== 'edit';  // view by default, edit when explicit

  const data = await getCachedTravelData();
  const { travelPersons = [], trips = [] } = data || {};
  const persons = travelPersons;

  // Load existing trip if editing
  let existingTrip = isExisting ? trips.find(t => t.id === tripId) : null;

  // Form state
  const state = {
    personId:     existingTrip?.personId     || '',
    personName:   existingTrip?.personName   || '',
    dateOutIndia: existingTrip?.dateOutIndia || '',
    dateInQatar:  existingTrip?.dateInQatar  || '',
    dateOutQatar: existingTrip?.dateOutQatar || '',
    dateInIndia:  existingTrip?.dateInIndia  || '',
    flightInward: existingTrip?.flightInward || '',
    flightOutward:existingTrip?.flightOutward|| '',
    reason:       existingTrip?.reason       || '',
    travelWith:   existingTrip?.travelWith   || [],
    destination:  existingTrip?.destination  || 'Qatar',
    photos:       existingTrip?.photos       || [],
  };

  let currentStep = isViewMode ? (STEPS.length - 1) : 0;  // view starts on Review

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
        Step ${currentStep + 1} of ${STEPS.length} -- ${STEPS[currentStep]}
      </div>
      <div id="step-content" style="padding:20px;"></div>
      ${isViewMode ? '' : `
      <div style="padding:16px 20px 32px;display:flex;gap:10px;">
        ${currentStep > 0 ? '<button class="btn btn-secondary" style="flex:1;" id="prev-btn">← Back</button>' : ''}
        <button class="btn btn-primary" style="flex:2;" id="next-btn">
          ${currentStep === STEPS.length - 1 ? (isEdit ? '💾 Save Changes' : '✅ Save Trip') : 'Next →'}
        </button>
      </div>
      `}
    `;

    document.getElementById('back-btn').addEventListener('click', () => navigate('travel-log'));

    if (isViewMode) {
      document.getElementById('edit-trip-btn')?.addEventListener('click', () => {
        isViewMode = false;
        currentStep = 0;
        render();
      });
      document.getElementById('share-trip-btn')?.addEventListener('click', () => shareTripText());
    }
    document.getElementById('prev-btn')?.addEventListener('click', () => { currentStep--; render(); });
    document.getElementById('next-btn').addEventListener('click', () => handleNext());

    renderStep();
  }

  async function shareTripText() {
    const member = members.find(m => m.id === state.personId);
    const text = [
      `✈️ *Travel Details: ${member?.name || 'Unknown'}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🇮🇳 Departed India: ${formatDisplayDate(state.dateOutIndia)}`,
      `🇶🇦 Arrived Qatar: ${formatDisplayDate(state.dateInQatar)}`,
      state.dateOutQatar ? `🇶🇦 Left Qatar: ${formatDisplayDate(state.dateOutQatar)}` : `🇶🇦 Status: Still in Qatar`,
      state.dateInIndia  ? `🇮🇳 Back in India: ${formatDisplayDate(state.dateInIndia)}` : '',
      `⏱️ Duration: ${state.dateInQatar && state.dateOutQatar ? daysBetween(state.dateInQatar, state.dateOutQatar) + ' days' : daysBetween(state.dateInQatar, today()) + ' days so far'}`,
      state.flightInward ? `✈️ Inward: ${state.flightInward}` : '',
      state.flightOutward? `✈️ Outward: ${state.flightOutward}` : '',
      state.reason       ? `📝 Reason: ${state.reason}` : '',
      state.travelWith.length ? `👥 With: ${state.travelWith.map(id => persons.find(m => m.id === id)?.name).join(', ')}` : '',
      `━━━━━━━━━━━━━━━━━━━━`,
      `_Shared from Family Hub PWA_`
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      await navigator.share({ title: `Travel Details - ${member?.name}`, text }).catch(() => {});
    } else {
      const { copyToClipboard } = await import('../../../shared/utils.js');
      const ok = await copyToClipboard(text);
      showToast(ok ? 'Details copied to clipboard!' : 'Failed to copy', ok ? 'success' : 'error');
    }
  }

  function renderStep() {
    const stepContent = document.getElementById('step-content');

    switch (currentStep) {
      case 0: renderPersonStep(stepContent, persons); break;
      case 1: renderDatesStep(stepContent); break;
      case 2: renderFlightsStep(stepContent); break;
      case 3: renderReasonStep(stepContent, persons); break;
      case 4: renderPhotosStep(stepContent); break;
      case 5: renderReviewStep(stepContent, persons); break;
    }
  }

  // ── Step 0: Person ──────────────────────────────────────────────────
  function renderPersonStep(el, persons) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Who is travelling?</label>
        <div id="person-pills"></div>
      </div>
      <div style="margin-top:12px;text-align:center;">
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 14px;" id="add-new-person-btn">+ Add New Travel Person</button>
      </div>
    `;
    new PillSelect(document.getElementById('person-pills'), {
      options: persons.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
      selected: state.personId,
      multi: false,
      color: 'indigo',
      onSelect: (val) => {
        state.personId = val || '';
        const selected = persons.find(m => m.id === val);
        state.personName = selected?.name || '';
      }
    });

    document.getElementById('add-new-person-btn').addEventListener('click', () => {
      const name = prompt('Enter name of travel person:');
      if (!name) return;
      const newPerson = { id: uuidv4(), name: name.trim(), emoji: '👤', color: '#EEF2FF' };
      saveNewPerson(newPerson);
    });
  }

  async function saveNewPerson(person) {
    try {
      const newData = await localSave('travel', (remote) => {
        const travelPersons = remote.travelPersons || [];
        travelPersons.push(person);
        return { ...remote, travelPersons };
      });
      await setCachedTravelData(newData);
      persons.push(person);
      state.personId = person.id;
      navigate('add-trip', params); // refresh with new person list
    } catch { showToast('Failed to add person', 'error'); }
  }

  // ── Step 1: Dates ───────────────────────────────────────────────────
  function renderDatesStep(el) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Destination Country</label>
        <div id="dest-input"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Date Out of India</label>
        <input type="date" class="form-input" id="dateOutIndia" value="${state.dateOutIndia}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Arrived in ${state.destination}</label>
        <input type="date" class="form-input" id="dateInQatar" value="${state.dateInQatar}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Out of ${state.destination} <span style="color:var(--text-muted);font-weight:400;">(leave blank if still there)</span></label>
        <input type="date" class="form-input" id="dateOutQatar" value="${state.dateOutQatar}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date Back in India <span style="color:var(--text-muted);font-weight:400;">(leave blank if not returned)</span></label>
        <input type="date" class="date-input" id="dateInIndia" value="${state.dateInIndia}" />
      </div>
      <div id="days-computed" style="background:var(--primary-bg);border-radius:var(--radius-md);padding:12px 16px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;"></div>
    `;

    new SmartInput(document.getElementById('dest-input'), {
      suggestions: ['Qatar', 'UAE', 'Saudi Arabia', 'Oman', 'Bahrain', 'Kuwait', 'USA', 'UK', 'Canada'],
      value: state.destination,
      placeholder: 'e.g. Qatar',
      onInput: (v) => { state.destination = v; renderDatesStep(el); },
      onSelect: (v) => { state.destination = v; renderDatesStep(el); }
    });

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
      parts.push(`<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:var(--primary);">${days}</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">Days in ${state.destination}</div></div>`);
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
      <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">e.g. QR512, AI351 -- tap a suggestion or type new</p>
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
  function renderReasonStep(el, persons) {
    const otherPersons = persons.filter(m => m.id !== state.personId);

    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Reason for Travel</label>
        <div id="reason-input"></div>
      </div>
      ${otherPersons.length > 0 ? `
        <div class="form-group">
          <label class="form-label">Travelling with</label>
          <div id="travel-with-pills"></div>
          <div style="margin-top:12px; display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--surface-3); border-radius:var(--radius-md); border:1px solid var(--border);">
            <input type="checkbox" id="create-copy-check" checked style="width:18px;height:18px;cursor:pointer;" />
            <label for="create-copy-check" style="font-size:12px;font-weight:600;color:var(--text);cursor:pointer;">
              Create same travel details for each person
            </label>
          </div>
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

    if (otherPersons.length) {
      new PillSelect(document.getElementById('travel-with-pills'), {
        options: otherPersons.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
        selected: state.travelWith,
        multi: true,
        color: 'indigo',
        onSelect: (val) => { state.travelWith = val || []; }
      });
    }
  }

  // ── Step 4: Photos ──────────────────────────────────────────────────
  function renderPhotosStep(el) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Attach Photos <span style="color:var(--text-muted);font-weight:400;">(tickets, visa, receipts)</span></label>
        <div id="trip-photo-slots" style="margin-bottom:12px;"></div>
        <p style="font-size:12px;color:var(--text-muted);">Max 3 photos per trip entry.</p>
      </div>
    `;

    renderPhotoSlots(document.getElementById('trip-photo-slots'), state.photos, 3, (newPhotos) => {
      state.photos = newPhotos;
    });
  }

  // ── Step 4: Review ──────────────────────────────────────────────────
  function renderReviewStep(el, persons) {
    const person = persons.find(m => m.id === state.personId) || { name: 'Unknown', emoji: '👤' };
    const daysInDest = state.dateInQatar && state.dateOutQatar
      ? daysBetween(state.dateInQatar, state.dateOutQatar) : null;
    const daysSoFar = state.dateInQatar && !state.dateOutQatar
      ? daysBetween(state.dateInQatar, today()) : null;
      
    const travelWithNames = (state.travelWith || [])
      .map(id => persons.find(m => m.id === id)?.name).filter(Boolean);

    const row = (label, value) => value
      ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light);">
           <span style="font-size:13px;color:var(--text-muted);">${label}</span>
           <span style="font-size:13px;font-weight:600;color:var(--text);text-align:right;max-width:200px;">${value}</span>
         </div>`
      : '';

    el.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;">
        <div style="background:var(--primary);padding:14px 20px;display:flex;align-items:center;gap:12px;">
          <div style="font-size:28px;">${person?.emoji || '👤'}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:#fff;">${person?.name || 'Unknown'}</div>
            ${daysInDest !== null ? `<div style="font-size:13px;color:rgba(255,255,255,0.75);">${daysInDest} days in ${state.destination}</div>` : ''}
            ${daysSoFar !== null ? `<div style="font-size:13px;color:rgba(255,255,255,0.75);">${daysSoFar} days so far</div>` : ''}
          </div>
        </div>
        <div style="padding:0 16px 8px;">
          ${row('Destination', state.destination)}
          ${row('Out of India', formatDisplayDate(state.dateOutIndia))}
          ${row('Arrived ' + state.destination, formatDisplayDate(state.dateInQatar))}
          ${row('Left ' + state.destination, state.dateOutQatar ? formatDisplayDate(state.dateOutQatar) : 'Still there')}
          ${row('Back in India', state.dateInIndia ? formatDisplayDate(state.dateInIndia) : 'Not yet')}
          ${row('Inward Flight', state.flightInward)}
          ${row('Outward Flight', state.flightOutward)}
          ${row('Reason', state.reason)}
          ${travelWithNames.length ? `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light);">
              <span style="font-size:13px;color:var(--text-muted);">Travelling with</span>
              <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:200px;">
                ${travelWithNames.map(name => `
                  <span style="font-size:10px;background:var(--primary-bg);color:var(--primary);padding:2px 8px;border-radius:99px;font-weight:600;">${name}</span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        
        <div id="review-photos" style="padding:0 16px 16px;"></div>
      </div>

      <div style="margin-top:20px;display:flex;gap:10px;">
        <button id="share-trip-btn" class="btn btn-secondary" style="flex:1;">📤 Share Details</button>
        ${isViewMode ? `<button id="edit-trip-btn" class="btn btn-primary" style="flex:1;">📝 Edit Details</button>` : ''}
      </div>

      <div id="save-error" style="color:var(--danger);font-size:13px;margin-top:12px;text-align:center;"></div>
    `;
    
    if (state.photos?.length) {
      renderPhotoThumbnails(document.getElementById('review-photos'), state.photos);
    }
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

    // Resolve personName from the selected person
    const selectedPerson = persons.find(m => m.id === state.personId);
    const personName = state.personName || selectedPerson?.name || 'Unknown';

    const tripData = {
      id:           isEdit ? existingTrip.id : uuidv4(),
      timestamp:    isEdit ? existingTrip.timestamp : new Date().toISOString(),
      personId:     state.personId,
      personName:   personName,
      destination:  state.destination,
      dateOutIndia: state.dateOutIndia,
      dateInQatar:  state.dateInQatar,
      dateOutQatar: state.dateOutQatar || null,
      dateInIndia:  state.dateInIndia  || null,
      daysInQatar:  daysInQatar,
      flightInward: state.flightInward,
      flightOutward:state.flightOutward,
      reason:       state.reason,
      travelWith:   state.travelWith,
      travelWithNames: state.travelWith.map(id => persons.find(m => m.id === id)?.name).filter(Boolean).join(', '),
      photos:       state.photos || [],
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

      const newData = await localSave('travel', (remote) => {
        const trips = remote.trips || [];
        
        // 1. Prepare all trips to be saved (Main + Companions if new)
        const tripsToSave = [tripData];
        
        if (!isEdit && state.travelWith.length > 0) {
          const shouldDuplicate = document.getElementById('create-copy-check')?.checked;
          if (shouldDuplicate) {
            state.travelWith.forEach(companionId => {
              const companionTrip = {
                ...tripData,
                id: uuidv4(),
                personId: companionId,
                // Replace companionId in travelWith with the main personId
                travelWith: [
                  state.personId,
                  ...state.travelWith.filter(bid => bid !== companionId)
                ]
              };
              tripsToSave.push(companionTrip);
            });
          }
        }

        // 2. Update the trips array
        if (isEdit) {
          const idx = trips.findIndex(t => t.id === tripData.id);
          if (idx > -1) trips[idx] = tripData;
          else trips.push(tripData);
        } else {
          trips.push(...tripsToSave);
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
      showToast('Save failed -- check connection', 'error');
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
