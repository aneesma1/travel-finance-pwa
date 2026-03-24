// v3.5.20 — 2026-03-24

// ─── app-a-family-hub/js/screens/travel-log.js ──────────────────────────────
// Travel Log: scrollable trip list with filters, expand detail, swipe-delete

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { openTravelExportSheet } from './travel-export.js';
import {
  formatDisplayDate, daysBetween, currentYear,
  getHashParams, setHashParams, clearHashParams,
  showToast, isOnline
} from '../../../shared/utils.js';

export async function renderTravelLog(container, params = {}) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Travel Log</span>
      <button class="app-header-action" id="header-export-btn" title="Export History">📤</button>
    </div>
    ${hasOrphaned ? `
      <div id="migration-banner" style="background:#FEF3C7; border-bottom:1px solid #F59E0B; padding:10px 16px; display:flex; align-items:center; gap:12px;">
        <span style="font-size:20px;">⚠️</span>
        <div style="flex:1; font-size:12px; line-height:1.4; color:#92400E;">
          <b>Missing trips?</b> Some records are still linked to your Contact list.
        </div>
        <button id="fix-silo-btn" class="btn" style="background:#F59E0B; color:#fff; padding:6px 12px; font-size:11px; font-weight:700;">FIX NOW</button>
      </div>
    ` : ''}
    <div id="filter-bar-container"></div>
    <div id="log-content"></div>
    <button class="fab" id="add-trip-fab">＋</button>
  `;

  document.getElementById('add-trip-fab').addEventListener('click', () => navigate('add-trip'));
  document.getElementById('fix-silo-btn')?.addEventListener('click', () => navigate('settings', { tab: 'data' }));

  const data = await getCachedTravelData();
  if (!data) { showEmpty(document.getElementById('log-content'), 'No data available'); return; }

  const { travelPersons = [], trips = [], members = [] } = data;
  const persons = travelPersons;

  // Detect orphaned trips (linked to members but not travelPersons)
  const tpIds = new Set(travelPersons.map(p => p.id));
  const hasOrphaned = trips.some(t => t.personId && !tpIds.has(t.personId) && members.some(m => m.id === t.personId));

  // Merge any incoming params with URL hash
  if (params.personId) setHashParams({ person: params.personId });
  const hashParams = getHashParams();
  const filterPerson = hashParams.person || '';
  // Default year logic: if current year has no data, default to 'all'
  const hasCurrentYearData = trips.some(t => t.dateOutIndia?.startsWith(String(currentYear())));
  // If no year in hash, default to 'all' to ensure imported data is visible
  const filterYear = hashParams.year || (hasCurrentYearData ? String(currentYear()) : 'all');

  document.getElementById('header-export-btn')?.addEventListener('click', () => {
    openTravelExportSheet(persons, trips, data.documents || []);
  });

  renderFilters(persons, filterPerson, filterYear);
  renderTrips(persons, trips, filterPerson, filterYear);

  function renderFilters(members, filterPerson, filterYear) {
    const bar = document.getElementById('filter-bar-container');
    const years = [...new Set(trips.map(t => t.dateOutIndia?.slice(0, 4)).filter(Boolean))].sort((a,b)=>b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));

    bar.innerHTML = `
      <div class="filter-bar">
        <div class="filter-chips">
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Person</span>
          <button class="filter-chip ${!filterPerson ? 'active' : ''}" data-filter="person" data-value="">All</button>
          ${persons.map(m => `
            <button class="filter-chip ${filterPerson === m.id ? 'active' : ''}" data-filter="person" data-value="${m.id}">
              ${m.emoji || '👤'} ${m.name}
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

  function renderTrips(persons, trips, filterPerson, filterYear, resetPage = true) {
    if (resetPage) _tripPage = 1;
    const logContent = document.getElementById('log-content');
    const personMap  = Object.fromEntries(persons.map(m => [m.id, m]));

    let filtered = [...trips].sort((a, b) => new Date(b.dateOutIndia) - new Date(a.dateOutIndia));
    if (filterPerson) filtered = filtered.filter(t => t.personId === filterPerson);
    if (filterYear && filterYear !== 'all') {
      filtered = filtered.filter(t => t.dateOutIndia?.startsWith(filterYear));
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
      if (!yearlyTotals[t.personId]) yearlyTotals[t.personId] = 0;
      yearlyTotals[t.personId] += (t.daysInQatar || 0);
    });

    logContent.innerHTML = `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;color:var(--text-muted);">${filtered.length} trip${filtered.length !== 1 ? 's' : ''}</span>
        ${Object.keys(yearlyTotals).length === 1
          ? `<span style="font-size:13px;font-weight:600;color:var(--primary);">
               Total Qatar days: ${Object.values(yearlyTotals)[0]}
             </span>`
          : ''}
      </div>
      <div id="trips-list"></div>
    `;

    const list = document.getElementById('trips-list');

    filtered.forEach((trip, idx) => {
      const person = personMap[trip.personId] || { name: 'Unknown', emoji: '👤', color: '#EEF2FF' };
      const travelWith = (trip.travelWith || [])
        .map(id => personMap[id]?.name).filter(Boolean);

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
          <div class="person-avatar" style="background:${person.color || '#EEF2FF'};width:40px;height:40px;font-size:18px;flex-shrink:0;">
            ${person.emoji || '👤'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:15px;font-weight:600;color:var(--text);">${person.name}</span>
              ${statusDot}
              <span style="font-size:12px;color:var(--text-muted);">${trip.reason || ''}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              ${formatDisplayDate(trip.dateOutIndia)} → ${trip.dateInIndia ? formatDisplayDate(trip.dateInIndia) : 'Present'}
            </div>
            ${travelWith.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                <span style="font-size:10px;color:var(--text-muted);margin-right:2px;align-self:center;">with</span>
                ${travelWith.map(name => `
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
