// v3.5.47 — 2026-03-31

// ─── app-a-family-hub/js/screens/travel-log.js ──────────────────────────────
// Travel Log: scrollable trip list with filters, expand detail, swipe-delete
// SIMPLIFIED: Uses personName directly from trips — no travelPersons linking needed

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { openTravelExportSheet } from './travel-export.js';
import { renderTravelSummarySheet } from './travel-summary.js';
import {
  formatDisplayDate, daysBetween, today, currentYear,
  getHashParams, setHashParams,
  showToast
} from '../../../shared/utils.js';

// Helper to extract a 4-digit year from any raw date string (e.g. YYYY-MM-DD or DD/MM/YYYY)
function extractYear(val) {
  if (!val) return '';
  const s = String(val).trim();
  const match = s.match(/\b(20\d{2})\b/);
  return match ? match[1] : '';
}

export async function renderTravelLog(container, params = {}) {
  const data = await getCachedTravelData();
  const { passengers = [], trips = [] } = data || {};

  // ── Completely detached from Master People: Use ONLY passengers ──
  const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  const tpMap = Object.fromEntries(passengers.map(p => [p.id, p]));

  const safeTrips = Array.isArray(trips) ? trips.filter(Boolean).map(t => {
    // Robust name resolution
    const person = tpMap[t.passengerId || t.personId];
    if (person) {
      t.passengerName = person.name;
    }
    
    // Fallback for cases without passengerId but passengerName looks like an ID
    const rawName = t.passengerName || t.personName || '';
    if (!t.passengerId && !t.personId && rawName && isUuid(String(rawName))) {
      const p = tpMap[rawName];
      if (p) t.passengerName = p.name;
    }

    if (!t.passengerName) t.passengerName = 'Unknown';
    
    // Ensure dates are mapped correctly
    t.dateLeftOrigin = t.dateLeftOrigin || t.dateOutIndia;
    t.dateReturnedOrigin = t.dateReturnedOrigin || t.dateInIndia;
    t.dateArrivedDest = t.dateArrivedDest || t.dateInQatar;
    t.dateLeftDest = t.dateLeftDest || t.dateOutQatar;
    t.daysInDest = t.daysInDest || t.daysInQatar;
    t.destinationCountry = t.destinationCountry || t.destination || 'Qatar';
    
    return t;
  }) : [];

  // ── Extract unique passengers and years ──
  const passengerNamesSet = new Set();
  const passengerInfoMap = {};
  const yearsSet = new Set();

  safeTrips.forEach(t => {
    const travelWithArr = Array.isArray(t.travelWith) ? t.travelWith : String(t.travelWith || '').split(/[,;]+/);
    const namesInTrip = [
      String(t.passengerName || ''),
      ...travelWithArr
    ].map(n => String(n || '').trim()).filter(Boolean);

    namesInTrip.forEach(name => {
      const cleanName = name.trim();
      if (!passengerNamesSet.has(cleanName)) {
        passengerNamesSet.add(cleanName);
        const tp = passengers.find(p => p.name?.toLowerCase() === cleanName.toLowerCase());
        passengerInfoMap[cleanName] = {
          name: cleanName,
          emoji: tp?.emoji || '👤',
          color: tp?.color || '#EEF2FF',
        };
      }
    });

    const yr = extractYear(t.dateLeftOrigin);
    if (yr) yearsSet.add(yr);
  });
  const uniquePassengers = [...passengerNamesSet].sort().map(n => passengerInfoMap[n]);
  const availableYears = [...yearsSet].sort((a,b) => b - a);

  // Default year logic: use URL param, otherwise 'all'
  const urlYear = params.year || getHashParams().year;
  let filterYear = urlYear || 'all';

  let filterPassenger = params.passenger || getHashParams().passenger;

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Travel Log</span>
      <button class="app-header-action" id="header-export-btn" title="Export History">📤</button>
    </div>
    <div style="padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);">
      <button id="travel-summary-btn" class="btn btn-secondary btn-full" style="padding:10px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px;">
        <span>📊</span> Travel Summary Report
      </button>
    </div>
    <div id="filter-bar-container"></div>
    <div id="log-content"></div>
    <button class="fab" id="add-trip-fab">＋</button>
  `;

  if (!data) { showEmpty(container.querySelector('#log-content'), 'No data available'); return; }

  document.getElementById('add-trip-fab').addEventListener('click', () => navigate('add-trip'));
  document.getElementById('travel-summary-btn')?.addEventListener('click', () => {
    renderTravelSummarySheet(uniquePassengers, safeTrips, filterYear, filterPassenger);
  });

  // Merge any incoming params with URL hash
  if (params.passengerId) setHashParams({ passenger: params.passengerId });
  const hashParams = getHashParams();
  filterPassenger = hashParams.passenger || '';
  // If no year in hash, we already calculated a smart default in 'filterYear' above
  if (hashParams.year) filterYear = hashParams.year;

  document.getElementById('header-export-btn')?.addEventListener('click', () => {
    openTravelExportSheet(uniquePassengers, safeTrips, data.documents || []);
  });

  let _tripPage = 1;
  const PAGE_SIZE = 25;

  renderFilters(filterPassenger, filterYear);
  renderTrips(filterPassenger, filterYear);

  function renderFilters(filterPassenger, filterYear) {
    const bar = container.querySelector('#filter-bar-container');
    const yearsDisplay = [...availableYears];
    if (!yearsDisplay.includes(String(currentYear()))) {
      yearsDisplay.unshift(String(currentYear()));
    }

    const selectedPasses = filterPassenger ? filterPassenger.split(',').map(s => s.trim()).filter(Boolean) : [];

    bar.innerHTML = `
      <div class="filter-bar">
        <div class="filter-chips">
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Passengers</span>
          
          <div style="position:relative; display:inline-block;" id="passenger-dropdown-container">
             <button class="btn btn-secondary" style="padding:6px 12px; font-size:13px; border-radius:99px;" id="passenger-dropdown-btn">
               ${selectedPasses.length === 0 ? 'All' : selectedPasses.length === 1 ? selectedPasses[0] : `${selectedPasses.length} selected`} ▾
             </button>
             
             <div id="passenger-dropdown-menu" style="display:none; position:absolute; top:100%; left:0; width:220px; background:var(--surface); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); margin-top:8px; z-index:100; max-height:50vh; overflow-y:auto; padding:8px;">
               
               <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; border-radius:6px;">
                 <input type="checkbox" value="" ${selectedPasses.length === 0 ? 'checked' : ''} class="pass-checkbox pass-all-cb" />
                 <span style="font-size:13px; font-weight:600;">All Passengers</span>
               </label>
               <div style="height:1px; background:var(--border-light); margin:4px 0;"></div>
               ${uniquePassengers.map(p => `
                 <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer;" class="pass-label">
                    <input type="checkbox" value="${p.name}" ${selectedPasses.includes(p.name) ? 'checked' : ''} class="pass-checkbox pass-item-cb" />
                    <span style="font-size:13px;">${p.emoji || '👤'} ${p.name}</span>
                 </label>
               `).join('')}
               <div style="margin-top:8px; display:flex; justify-content:flex-end;">
                 <button class="btn btn-primary" style="padding:4px 12px; font-size:12px;" id="pass-apply-btn">Apply</button>
               </div>
             </div>
          </div>

          <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 4px;"></div>
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Year</span>
          <button class="filter-chip ${filterYear === 'all' ? 'active' : ''}" data-filter="year" data-value="all">All</button>
          ${yearsDisplay.map(y => `
            <button class="filter-chip ${filterYear === y ? 'active' : ''}" data-filter="year" data-value="${y}">${y}</button>
          `).join('')}
        </div>
      </div>
    `;

    // Dropdown toggle logic
    const dropBtn = bar.querySelector('#passenger-dropdown-btn');
    const dropMenu = bar.querySelector('#passenger-dropdown-menu');
    
    dropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropMenu.style.display = dropMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!bar.querySelector('#passenger-dropdown-container').contains(e.target)) {
        dropMenu.style.display = 'none';
      }
    });

    const allCb = bar.querySelector('.pass-all-cb');
    const itemCbs = bar.querySelectorAll('.pass-item-cb');
    
    allCb.addEventListener('change', () => {
      if (allCb.checked) {
        itemCbs.forEach(cb => cb.checked = false);
      } else {
        allCb.checked = true; // prevent unchecking if no others are checked
      }
    });

    itemCbs.forEach(cb => {
      cb.addEventListener('change', () => {
        const anyChecked = Array.from(itemCbs).some(c => c.checked);
        allCb.checked = !anyChecked;
      });
    });

    bar.querySelector('#pass-apply-btn').addEventListener('click', () => {
      const checked = Array.from(itemCbs).filter(c => c.checked).map(c => c.value);
      setHashParams({ passenger: checked.length > 0 ? checked.join(',') : null });
      renderTravelLog(container);
    });

    // Year filters
    bar.querySelectorAll('.filter-chip[data-filter="year"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ year: btn.dataset.value === String(currentYear()) ? null : btn.dataset.value });
        setHashParams({ year: btn.dataset.value === 'all' ? null : btn.dataset.value });
        renderTravelLog(container);
      });
    });
  }

  function renderTrips(filterPassenger, filterYear, resetPage = true) {
    const logContent = container.querySelector('#log-content');
    if (!logContent) return;

    try {
      if (resetPage) _tripPage = 1;

      let filtered = [...safeTrips].sort((a, b) => {
      const da = String(a.dateLeftOrigin || '');
      const db = String(b.dateLeftOrigin || '');
      // Try ISO first
      const ta = new Date(da).getTime();
      const tb = new Date(db).getTime();
      if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
      // Fallback to string comparison (desc)
      return db.localeCompare(da);
    });

    // Filter by passenger name (supports comma-separated list)
    if (filterPassenger) {
      const selectedArr = filterPassenger.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
      filtered = filtered.filter(t => {
        const primaryMatch = String(t.passengerName || '').toLowerCase().trim();
        const travelWithNames = (Array.isArray(t.travelWith) ? t.travelWith : String(t.travelWith || '').split(/[,;]+/))
          .map(n => String(n || '').trim().toLowerCase());
        
        return selectedArr.some(sel => primaryMatch === sel || travelWithNames.includes(sel));
      });
    }
    if (filterYear && filterYear !== 'all') {
      filtered = filtered.filter(t => extractYear(t.dateLeftOrigin) === filterYear);
    }

    if (!filtered.length) {
      showEmpty(logContent, 'No trips found for this filter');
      return;
    }

    const totalCount = filtered.length;
    filtered = filtered.slice(0, _tripPage * PAGE_SIZE);

    // Year totals per passenger (only used locally for quick preview)
    const yearlyTotals = {};
    filtered.forEach(t => {
      const name = t.passengerName || 'Unknown';
      if (!yearlyTotals[name]) yearlyTotals[name] = 0;
      yearlyTotals[name] += (t.daysInDest || 0);
    });

    logContent.innerHTML = `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;color:var(--text-muted);">${filtered.length} trip${filtered.length !== 1 ? 's' : ''}${totalCount > filtered.length ? ` of ${totalCount}` : ''}</span>
      </div>
      <div id="trips-list"></div>
    `;

    const list = document.getElementById('trips-list');

    filtered.forEach((trip) => {
      const pName = trip.passengerName || 'Unknown';
      const pInfo = passengerInfoMap[pName] || { name: pName, emoji: '👤', color: '#EEF2FF' };

      // Travel companions
      let travelWithDisplay = [];
      if (Array.isArray(trip.travelWith)) {
        travelWithDisplay = trip.travelWith.filter(Boolean);
      } else if (trip.travelWith) {
        travelWithDisplay = String(trip.travelWith).split(/[,;]+/).map(n => String(n || '').trim()).filter(Boolean);
      }

      const dest = trip.destinationCountry || 'Destination';
      let days = (trip.daysInDest != null && trip.daysInDest !== '') ? Number(trip.daysInDest) : null;
      
      if (days === null || isNaN(days)) {
        if (trip.dateArrivedDest && trip.dateLeftDest) {
          days = daysBetween(trip.dateArrivedDest, trip.dateLeftDest);
        } else if (trip.dateArrivedDest && !trip.dateLeftDest) {
          days = daysBetween(trip.dateArrivedDest, today());
        }
      }
      
      const daysLabel = (days !== null && !isNaN(days)) ? `${days}d in ${dest}` : '--';
      const statusDot = (trip.dateArrivedDest && !trip.dateLeftDest) ? `<span class="status-dot-active"></span>` : '';
      const row = document.createElement('div');
      row.className = 'swipe-row-container';
      row.innerHTML = `
        <div class="list-row trip-row" data-trip-id="${trip.id}">
          <div class="person-avatar" style="background:${pInfo.color || '#EEF2FF'};width:40px;height:40px;font-size:18px;flex-shrink:0;">
            ${pInfo.emoji || '👤'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:15px;font-weight:600;color:var(--text);">${pName}</span>
              ${statusDot}
              <span style="font-size:12px;color:var(--text-muted);">${trip.reason || ''}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              ${trip.dateLeftOrigin ? formatDisplayDate(trip.dateLeftOrigin) : 'No date'} → ${trip.dateReturnedOrigin ? formatDisplayDate(trip.dateReturnedOrigin) : 'Present'}
            </div>
            ${travelWithDisplay.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                <span style="font-size:10px;color:var(--text-muted);margin-right:2px;align-self:center;">with</span>
                ${travelWithDisplay.map(name => `
                  <span style="font-size:10px;background:var(--primary-bg);color:var(--primary);padding:1px 6px;border-radius:99px;font-weight:600;">${name}</span>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;min-width:70px;">
            <div style="font-size:12px;font-weight:700;background:var(--primary-bg);color:var(--primary);padding:2px 8px;border-radius:6px;display:inline-block;">${daysLabel}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:500;">${trip.flightInward || '--'}</div>
          </div>
          <span style="color:var(--text-muted);font-size:16px;margin-left:4px;">›</span>
        </div>
        <div class="swipe-row-delete" data-trip-id="${trip.id}">
          <div style="text-align:center;"><div style="font-size:20px;">🗑️</div><div>Delete</div></div>
        </div>
      `;

      row.querySelector('.trip-row').addEventListener('click', () => {
        navigate('add-trip', { tripId: trip.id, mode: 'view' });
      });

      // Swipe to delete (touch)
      let startX = 0;
      const rowEl = row.querySelector('.list-row');
      const delEl = row.querySelector('.swipe-row-delete');

      rowEl.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
      rowEl.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx < -60) {
          delEl.style.transform = 'translateX(0)';
          rowEl.style.transform = 'translateX(-80px)';
        } else if (dx > 20) {
          delEl.style.transform = 'translateX(100%)';
          rowEl.style.transform = 'translateX(0)';
        }
      }, { passive: true });

      delEl.addEventListener('click', () => deleteTrip(trip.id));

      list.appendChild(row);
    });
    
    } catch (err) {
      console.error('[travel-log] renderTrips error:', err);
      logContent.innerHTML = `<div style="padding:20px;color:red;font-size:12px;background:#fee2e2;border:1px solid #ef4444;border-radius:8px;margin:16px;"><b>Render crashed:</b><br>${err.stack || err.message || err}</div>`;
    }
  }

  async function deleteTrip(tripId) {
    if (!confirm('Delete this trip record? This cannot be undone.')) return;
    try {
      const newData = await localSave('travel', (remote) => ({
        ...remote,
        trips: (remote.trips || []).filter(t => t.id !== tripId)
      }));
      await setCachedTravelData(newData);
      showToast('Trip deleted', 'success');
      renderTravelLog(container);
    } catch {
      showToast('Delete failed -- try again', 'error');
    }
  }
}

function showEmpty(container, msg) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">✈️</div>
      <div class="empty-state-title">${msg}</div>
      <div class="empty-state-text">Tap + to add your first trip</div>
    </div>`;
}
