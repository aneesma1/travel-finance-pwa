// v3.5.30 — 2026-03-31

// ─── app-a-family-hub/js/screens/add-trip.js ────────────────────────────────
// Add / Edit Trip: 5-step form with smart search and live computed fields

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { PillSelect }  from '../../../shared/pill-select.js';
import { SmartInput }  from '../../../shared/smart-input.js';
import { MultiSmartInput } from '../../../shared/multi-smart-input.js';
import {
  uuidv4, today, toISODate, daysBetween, formatDisplayDate, showToast
} from '../../../shared/utils.js';
import { navigate } from '../router.js';
import { renderPhotoSlots, renderPhotoThumbnails } from '../../../shared/photo-picker.js';

const STEPS = ['Passenger', 'Dates', 'Flights', 'Reason', 'Photos', 'Review'];

export async function renderAddTrip(container, params = {}) {
  const { tripId, mode } = params;
  const isExisting = !!tripId;
  const isEdit = isExisting;  // any existing trip can be edited
  let isViewMode = isExisting && mode !== 'edit';  // view by default, edit when explicit

  const isUuid = (str) => {
    const s = String(str || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || (s.length === 36 && s.includes('-'));
  };
  const data = await getCachedTravelData();
  const { passengers = [], trips = [] } = data || {};
  const persons = [...passengers];

  // Auto-discover imported names that aren't in the official persons list to populate the pills
  const existingNames = new Set(persons.map(p => String(p.name || '').trim().toLowerCase()));
  trips.forEach(t => {
    const pName = String(t.passengerName || '').trim();
    if (pName && !existingNames.has(pName.toLowerCase())) {
      // Use the name itself as a pseudo-ID so the PillSelect matches it natively
      persons.push({ id: pName, name: pName, emoji: '👤' });
      existingNames.add(pName.toLowerCase());
    }
  });

  // Load existing trip if editing
  let existingTrip = isExisting ? trips.find(t => t.id === tripId) : null;

  // Form state
  const state = {
    passengerId:     existingTrip?.passengerId     || existingTrip?.passengerName || '',
    passengerName:   existingTrip?.passengerName   || '',
    dateLeftOrigin:  existingTrip?.dateLeftOrigin  || today(),
    dateArrivedDest: existingTrip?.dateArrivedDest || today(),
    flightNumber:    existingTrip?.flightNumber    || '',
    reason:          existingTrip?.reason          || '',
    travelWith:      existingTrip?.travelWith      || [],
    originCountry:   existingTrip?.originCountry   || 'India',
    destinationCountry: existingTrip?.destinationCountry || 'Qatar',
    photos:          existingTrip?.photos          || [],
  };

  let currentStep = isViewMode ? (STEPS.length - 1) : 0;  // view starts on Review

  // Suggestions from history
  const safeTrips = trips.filter(Boolean);
  const allFlights = [...new Set(safeTrips.flatMap(t => [t?.flightInward, t?.flightOutward]).filter(Boolean))];
  const allReasons = [...new Set(safeTrips.map(t => t?.reason).filter(Boolean))];

  function render() {
    try {
      container.innerHTML = `
      <div class="app-header">
        <button class="app-header-action" id="back-btn">←</button>
        <span class="app-header-title">${isViewMode ? 'Trip Details' : (isEdit ? 'Edit Trip' : 'Add Trip')}</span>
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
      <div id="step-content" style="padding:20px 20px 80px 20px;"></div>
      ${isViewMode ? '' : `
      <div style="padding:16px 20px 32px;display:flex;gap:8px;">
        <button class="btn btn-secondary" style="flex:1;color:var(--danger);background-color:#fee2e2;border:none;" id="cancel-btn">✕ Cancel</button>
        ${currentStep > 0 ? '<button class="btn btn-secondary" style="flex:1;" id="prev-btn">← Back</button>' : ''}
        <button class="btn btn-primary" style="flex:2;" id="next-btn">
          ${currentStep === STEPS.length - 1 ? (isEdit ? '💾 Save Changes' : '✅ Save Trip') : 'Next →'}
        </button>
      </div>
      `}
    `;

    document.getElementById('back-btn').addEventListener('click', () => navigate('travel-log'));

    renderStep();

    if (isViewMode) {
      document.getElementById('edit-trip-btn')?.addEventListener('click', () => {
        isViewMode = false;
        currentStep = 0;
        render();
      });
      document.getElementById('share-trip-btn')?.addEventListener('click', () => shareTripText());
    } else {
      document.getElementById('cancel-btn')?.addEventListener('click', () => {
        // Navigate away immediately — tapping Cancel is explicit intent
        if (isExisting) {
          navigate('add-trip', { tripId: existingTrip.id, mode: 'view' });
        } else {
          navigate('travel-log');
        }
      });
    }
    
    document.getElementById('prev-btn')?.addEventListener('click', () => { currentStep--; render(); });
    document.getElementById('next-btn')?.addEventListener('click', () => handleNext());
    } catch (err) {
      console.error('[add-trip] render error:', err);
      container.innerHTML = `<div style="padding:20px;color:red;"><b>Add Trip Crashed:</b><br>${err.stack || err.message || err}</div>`;
    }
  }

  async function shareTripText() {
    const member = persons.find(m => m.id === state.passengerId);
    const text = [
      `✈️ *Travel Details: ${member?.name || 'Unknown'}*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🛫 Departed Origin: ${formatDisplayDate(state.dateLeftOrigin)}`,
      `🛬 Arrived Destination: ${formatDisplayDate(state.dateArrivedDest)}`,
      state.dateLeftDest ? `🛫 Left Destination: ${formatDisplayDate(state.dateLeftDest)}` : `📍 Status: Still in Destination`,
      state.dateReturnedOrigin  ? `🇮🇳 Back in Origin: ${formatDisplayDate(state.dateReturnedOrigin)}` : '',
      `⏱️ Duration: ${state.dateArrivedDest && state.dateLeftDest ? daysBetween(state.dateArrivedDest, state.dateLeftDest) + ' days' : daysBetween(state.dateArrivedDest, today()) + ' days so far'}`,
      state.flightInward ? `✈️ Inward: ${state.flightInward}` : '',
      state.flightOutward? `✈️ Outward: ${state.flightOutward}` : '',
      state.reason       ? `📝 Reason: ${state.reason}` : '',
      (state.travelWith && state.travelWith.length) ? `👥 With: ${Array.isArray(state.travelWith) ? state.travelWith.map(id => persons.find(m => m.id === id)?.name).filter(Boolean).join(', ') : state.travelWith}` : '',
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
        <label class="form-label">Who is the Passenger?</label>
        <div id="person-pills"></div>
      </div>
      <div style="margin-top:12px;text-align:center;">
        <button class="btn btn-secondary" style="font-size:12px;padding:6px 14px;" id="add-new-person-btn">+ Add New Passenger</button>
      </div>
    `;
    new PillSelect(document.getElementById('person-pills'), {
      options: persons.map(m => ({ value: m.id, label: m.name, emoji: m.emoji || '👤' })),
      selected: state.passengerId,
      multi: false,
      color: 'indigo',
      onSelect: (val) => {
        state.passengerId = val || '';
        const selected = persons.find(m => m.id === val);
        state.passengerName = selected?.name || '';
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
        const passengers = remote.passengers || [];
        passengers.push(person);
        return { ...remote, passengers };
      });
      await setCachedTravelData(newData);
      persons.push(person);
      state.passengerId = person.id;
      navigate('add-trip', params); // refresh with new person list
    } catch { showToast('Failed to add person', 'error'); }
  }

  // ── Step 1: Dates ───────────────────────────────────────────────────
  function renderDatesStep(el) {
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px;">
        <div class="form-group" style="flex:1;">
          <label class="form-label">Origin Country</label>
          <div id="origin-input"></div>
        </div>
        <div style="padding-bottom:10px;">
          <button class="btn btn-secondary" id="swap-countries-btn" style="padding:6px 10px;font-size:16px;" title="Swap Countries">⇄</button>
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">Destination Country</label>
          <div id="dest-input"></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Departure Date</label>
        <input type="date" class="form-input" id="dateLeftOrigin" value="${state.dateLeftOrigin}" />
      </div>
      <div class="form-group">
        <label class="form-label">Arrival Date</label>
        <input type="date" class="form-input" id="dateArrivedDest" value="${state.dateArrivedDest}" />
      </div>
      <div id="days-computed" style="background:var(--primary-bg);border-radius:var(--radius-md);padding:12px 16px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;"></div>
    `;

    new SmartInput(document.getElementById('origin-input'), {
      suggestions: ['India', 'Qatar', 'UAE', 'USA', 'UK', 'Canada'],
      value: state.originCountry,
      placeholder: 'e.g. India',
      onInput: (v) => { state.originCountry = v; },
      onSelect: (v) => { state.originCountry = v; renderDatesStep(el); }
    });

    new SmartInput(document.getElementById('dest-input'), {
      suggestions: ['Qatar', 'UAE', 'Saudi Arabia', 'Oman', 'Bahrain', 'Kuwait', 'USA', 'UK', 'Canada'],
      value: state.destinationCountry,
      placeholder: 'e.g. Qatar',
      onInput: (v) => { state.destinationCountry = v; },
      onSelect: (v) => { state.destinationCountry = v; renderDatesStep(el); }
    });

    document.getElementById('swap-countries-btn').onclick = () => {
      const temp = state.originCountry;
      state.originCountry = state.destinationCountry;
      state.destinationCountry = temp;
      renderDatesStep(el);
    };

    ['dateLeftOrigin','dateArrivedDest'].forEach(field => {
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
    const days = daysBetween(state.dateLeftOrigin, state.dateArrivedDest);
    el.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Travel Time</div>
        <div style="font-size:16px;font-weight:700;color:var(--primary);">${days} day${days===1?'':'s'}</div>
      </div>`;
  }

  // ── Step 2: Flights ─────────────────────────────────────────────────
  function renderFlightsStep(el) {
    el.innerHTML = `
      <div class="form-group">
        <label class="form-label">Flight Number</label>
        <div id="flight-number-input"></div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">e.g. QR512, AI351 -- tap a suggestion or type new</p>
      </div>
    `;

    new SmartInput(document.getElementById('flight-number-input'), {
      suggestions: allFlights,
      value: state.flightNumber,
      placeholder: 'e.g. QR512',
      onInput: (v) => { state.flightNumber = v.toUpperCase(); },
      onSelect: (v) => { state.flightNumber = v.toUpperCase(); }
    });
  }

  // ── Step 3: Reason + Travel With ────────────────────────────────────
  function renderReasonStep(el, persons) {
    const otherPersons = persons.filter(m => m.id !== state.passengerId);

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

    if (otherPersons.length || true) { // Always show even if empty list to allow adding new
      const msi = new MultiSmartInput(document.getElementById('travel-with-pills'), {
        suggestions: otherPersons.map(m => ({ id: m.id, name: m.name, emoji: m.emoji || '👤' })),
        selected: Array.isArray(state.travelWith) 
          ? state.travelWith.map(id => persons.find(p => p.id === id)).filter(Boolean)
          : [],
        placeholder: 'Search or type name to add...',
        onAdd: async (name) => {
          const newPerson = { id: uuidv4(), name: name, emoji: '👤', color: '#EEF2FF' };
          await saveNewPerson(newPerson);
          // After saving, add to selected list
          msi.add(newPerson);
        },
        onChange: (selected) => {
          state.travelWith = selected.map(s => s.id);
        }
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
    let person = persons.find(m => m.id === state.passengerId);
    if (!person && state.passengerName) person = { name: state.passengerName, emoji: '👤' };
    if (!person) person = { name: 'Unknown', emoji: '👤' };

    const daysInDest = state.dateArrivedDest && state.dateLeftDest
      ? daysBetween(state.dateArrivedDest, state.dateLeftDest) : null;
    const daysSoFar = state.dateArrivedDest && !state.dateLeftDest
      ? daysBetween(state.dateArrivedDest, today()) : null;
      
    let travelWithNames = [];
    if (Array.isArray(state.travelWith)) {
      travelWithNames = state.travelWith.map(id => persons.find(m => m.id === id)?.name).filter(Boolean);
    } else if (state.travelWith) {
      travelWithNames = String(state.travelWith).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    }

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
            <div style="font-size:13px;color:rgba(255,255,255,0.75);">Moving to ${state.destinationCountry}</div>
          </div>
        </div>
        <div style="padding:0 16px 8px;">
          ${row('Origin', state.originCountry)}
          ${row('Destination', state.destinationCountry)}
          ${row('Departure Date', formatDisplayDate(state.dateLeftOrigin))}
          ${row('Arrival Date', formatDisplayDate(state.dateArrivedDest))}
          ${row('Flight Number', state.flightNumber)}
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
    if (currentStep === 0 && !state.passengerId) {
      showToast('Please select a person', 'warning');
      return false;
    }
    if (currentStep === 1) {
      if (!state.dateLeftOrigin) { showToast(`Please enter Departure Date`, 'warning'); return false; }
      if (!state.dateArrivedDest)  { showToast(`Please enter Arrival Date`, 'warning'); return false; }
      
      if (state.dateArrivedDest < state.dateLeftOrigin) {
        showToast(`Arrival must be on or after departure date`, 'error');
        return false;
      }
    }
    return true;
  }

  // ── Save ────────────────────────────────────────────────────────────
  async function saveTrip() {
    const daysInDest = state.dateArrivedDest && state.dateLeftDest
      ? daysBetween(state.dateArrivedDest, state.dateLeftDest) : null;

    // Resolve passengerName from the selected person
    const selectedPerson = persons.find(m => m.id === state.passengerId);
    const passengerName = state.passengerName || selectedPerson?.name || 'Unknown';

    const shouldDuplicate = !isEdit && state.travelWith.length > 0 && document.getElementById('create-copy-check')?.checked;

    const tripData = {
      id:           isEdit ? existingTrip.id : uuidv4(),
      timestamp:    isEdit ? existingTrip.timestamp : new Date().toISOString(),
      passengerId:     state.passengerId,
      passengerName:   passengerName,
      originCountry:       state.originCountry,
      destinationCountry:  state.destinationCountry,
      dateLeftOrigin: state.dateLeftOrigin,
      dateArrivedDest:  state.dateArrivedDest,
      flightNumber: state.flightNumber,
      reason:       state.reason,
      travelWith:   state.travelWith,
      travelWithNames: Array.isArray(state.travelWith) ? state.travelWith.map(id => persons.find(m => m.id === id)?.name).filter(Boolean).join(', ') : String(state.travelWith || ''),
      photos:       state.photos || [],
    };

    // Duplicate check for new trips
    if (!isEdit) {
      const duplicate = (data?.trips || []).find(
        t => t.passengerId === state.passengerId && t.dateLeftOrigin === state.dateLeftOrigin
      );
      if (duplicate) {
        const ok = confirm(`A trip for this person starting on ${formatDisplayDate(state.dateLeftOrigin)} already exists. Save anyway?`);
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
        
        if (shouldDuplicate) {
          state.travelWith.forEach(companionId => {
            const compPerson = persons.find(m => m.id === companionId);
            const companionTrip = {
              ...tripData,
              id: uuidv4(),
              passengerId: companionId,
              passengerName: compPerson?.name || 'Unknown',
              // Replace companionId in travelWith with the main passengerId
              travelWith: [
                state.passengerId,
                ...state.travelWith.filter(bid => bid !== companionId)
              ]
            };
            tripsToSave.push(companionTrip);
          });
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
