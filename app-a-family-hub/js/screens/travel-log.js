// v3.5.32 — 2026-03-31

// ─── app-a-family-hub/js/screens/travel-log.js ──────────────────────────────
// Travel Log: scrollable trip list with filters, expand detail, swipe-delete
// SIMPLIFIED: Uses personName directly from trips — no travelPersons linking needed

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { openTravelExportSheet } from './travel-export.js';
import {
  formatDisplayDate, daysBetween, currentYear,
  getHashParams, setHashParams,
  showToast
} from '../../../shared/utils.js';

export async function renderTravelLog(container, params = {}) {
  const data = await getCachedTravelData();
  const { travelPersons = [], trips = [], members = [] } = data || {};

  // ── Backfill personName from travelPersons for legacy trips ──
  const tpMap = Object.fromEntries(travelPersons.map(p => [p.id, p]));
  const safeTrips = Array.isArray(trips) ? trips.filter(Boolean).map(t => {
    // If trip has personId but no personName, look up from travelPersons
    if (t.personId && !t.personName) {
      const person = tpMap[t.personId];
      if (person) t.personName = person.name;
      else t.personName = 'Unknown';
    }
    // Ensure every trip has a personName
    if (!t.personName) t.personName = 'Unknown';
    return t;
  }) : [];

  // ── Extract unique persons by splitting ALL combined name fields ──
  const personNamesSet = new Set();
  const personInfoMap = {};  // name → { name, emoji, color }

  safeTrips.forEach(t => {
    // Treat the primary personName as a single entry (as it is in the data)
    // Only split companion names for chip discovery
    const namesInTrip = [
      t.personName || '',
      ...(t.travelWithNames || '').split(/[&,]+/)
    ].map(n => n.trim()).filter(Boolean);

    namesInTrip.forEach(name => {
      if (!personNamesSet.has(name)) {
        personNamesSet.add(name);
        const tp = travelPersons.find(p => p.name?.toLowerCase() === name.toLowerCase());
        personInfoMap[name] = {
          name,
          emoji: tp?.emoji || '👤',
          color: tp?.color || '#EEF2FF',
        };
      }
    });
  });
  const uniquePersons = [...personNamesSet].sort().map(n => personInfoMap[n]);

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Travel Log</span>
      <button class="app-header-action" id="header-export-btn" title="Export History">📤</button>
    </div>
    <div id="filter-bar-container"></div>
    <div id="log-content"></div>
    <button class="fab" id="add-trip-fab">＋</button>
  `;

  if (!data) { showEmpty(document.getElementById('log-content'), 'No data available'); return; }

  document.getElementById('add-trip-fab').addEventListener('click', () => navigate('add-trip'));

  // Merge any incoming params with URL hash
  if (params.personId) setHashParams({ person: params.personId });
  const hashParams = getHashParams();
  const filterPerson = hashParams.person || '';
  const filterYear = hashParams.year || 'all';

  document.getElementById('header-export-btn')?.addEventListener('click', () => {
    openTravelExportSheet(uniquePersons, safeTrips, data.documents || []);
  });

  renderFilters(filterPerson, filterYear);
  renderTrips(filterPerson, filterYear);

  function renderFilters(filterPerson, filterYear) {
    const bar = document.getElementById('filter-bar-container');
    const years = [...new Set(safeTrips.map(t => t.dateOutIndia?.slice(0, 4)).filter(Boolean))].sort((a,b)=>b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));

    bar.innerHTML = `
      <div class="filter-bar">
        <div class="filter-chips">
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Person</span>
          <button class="filter-chip ${!filterPerson ? 'active' : ''}" data-filter="person" data-value="">All</button>
          ${uniquePersons.map(p => `
            <button class="filter-chip ${filterPerson === p.name ? 'active' : ''}" data-filter="person" data-value="${p.name}">
              ${p.emoji || '👤'} ${p.name}
            </button>
          `).join('')}
          <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 4px;"></div>
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Year</span>
          <button class="filter-chip ${filterYear === 'all' ? 'active' : ''}" data-filter="year" data-value="all">All</button>
          ${years.map(y => `
            <button class="filter-chip ${filterYear === y ? 'active' : ''}" data-filter="year" data-value="${y}">${y}</button>
          `).join('')}
        </div>
      </div>
    `;

    bar.querySelectorAll('.filter-chip[data-filter="person"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ person: btn.dataset.value || null });
        renderTravelLog(container);
      });
    });
    bar.querySelectorAll('.filter-chip[data-filter="year"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ year: btn.dataset.value === String(currentYear()) ? null : btn.dataset.value });
        renderTravelLog(container);
      });
    });
  }

  let _tripPage = 1;
  const PAGE_SIZE = 25;

  function renderTrips(filterPerson, filterYear, resetPage = true) {
    if (resetPage) _tripPage = 1;
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    let filtered = [...safeTrips].sort((a, b) => {
      const da = a.dateOutIndia ? new Date(a.dateOutIndia).getTime() : 0;
      const db = b.dateOutIndia ? new Date(b.dateOutIndia).getTime() : 0;
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
    });

    // Filter by person name
    if (filterPerson) {
      const lowFilter = filterPerson.toLowerCase();
      filtered = filtered.filter(t => {
        const primaryMatch = (t.personName || '').toLowerCase().trim() === lowFilter;
        const travelWithNames = (t.travelWithNames || '').toLowerCase().split(/[&,]+/).map(n => n.trim());
        return primaryMatch || travelWithNames.includes(lowFilter);
      });
    }
    if (filterYear && filterYear !== 'all') {
      filtered = filtered.filter(t => (t.dateOutIndia || '').startsWith(filterYear));
    }

    if (!filtered.length) {
      showEmpty(logContent, 'No trips found for this filter');
      return;
    }

    const totalCount = filtered.length;
    filtered = filtered.slice(0, _tripPage * PAGE_SIZE);

    // Year totals per person
    const yearlyTotals = {};
    filtered.forEach(t => {
      const name = t.personName || 'Unknown';
      if (!yearlyTotals[name]) yearlyTotals[name] = 0;
      yearlyTotals[name] += (t.daysInQatar || 0);
    });

    logContent.innerHTML = `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;color:var(--text-muted);">${filtered.length} trip${filtered.length !== 1 ? 's' : ''}${totalCount > filtered.length ? ` of ${totalCount}` : ''}</span>
        ${Object.keys(yearlyTotals).length === 1
          ? `<span style="font-size:13px;font-weight:600;color:var(--primary);">
               Total Qatar days: ${Object.values(yearlyTotals)[0]}
             </span>`
          : ''}
      </div>
      <div id="trips-list"></div>
    `;

    const list = document.getElementById('trips-list');

    filtered.forEach((trip) => {
      const pName = trip.personName || 'Unknown';
      const pInfo = personInfoMap[pName] || { name: pName, emoji: '👤', color: '#EEF2FF' };

      // Travel companions — show from travelWithNames (plain text) or travelWith (IDs)
      let travelWithDisplay = [];
      if (trip.travelWithNames) {
        // New format: plain text string
        travelWithDisplay = trip.travelWithNames.split(/[&,]+/).map(n => n.trim()).filter(Boolean);
      } else if (trip.travelWith?.length) {
        // Legacy format: array of IDs
        travelWithDisplay = trip.travelWith.map(id => tpMap[id]?.name).filter(Boolean);
      }

      const dest = trip.destination || 'Qatar';
      const days = trip.daysInQatar || 0;
      const daysLabel = trip.daysInQatar != null
        ? `${days}d in ${dest}`
        : trip.dateInQatar && !trip.dateOutQatar
          ? `${daysBetween(trip.dateInQatar, new Date().toISOString().split('T')[0])}d so far`
          : '--';

      const statusDot = !trip.dateOutQatar
        ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-right:5px;"></span>`
        : '';

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
              ${trip.dateOutIndia ? formatDisplayDate(trip.dateOutIndia) : 'No date'} → ${trip.dateInIndia ? formatDisplayDate(trip.dateInIndia) : 'Present'}
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
