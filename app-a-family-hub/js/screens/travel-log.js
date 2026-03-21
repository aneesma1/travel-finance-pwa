// v3.2.1 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── app-a-family-hub/js/screens/travel-log.js ──────────────────────────────
// Travel Log: scrollable trip list with filters, expand detail, swipe-delete

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import {
  formatDisplayDate, daysBetween, currentYear,
  getHashParams, setHashParams, clearHashParams,
  showToast, isOnline
} from '../../../shared/utils.js';

export async function renderTravelLog(container, params = {}) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Travel Log</span>
    </div>
    <div id="filter-bar-container"></div>
    <div id="log-content"></div>
    <button class="fab" id="add-trip-fab">＋</button>
  `;

  document.getElementById('add-trip-fab').addEventListener('click', () => navigate('add-trip'));

  const data = await getCachedTravelData();
  if (!data) { showEmpty(document.getElementById('log-content'), 'No data available'); return; }

  const { members = [], trips = [] } = data;

  // Merge any incoming params with URL hash
  if (params.personId) setHashParams({ person: params.personId });
  const hashParams = getHashParams();
  const filterPerson = hashParams.person || '';
  const filterYear   = hashParams.year   || String(currentYear());

  renderFilters(members, filterPerson, filterYear);
  renderTrips(members, trips, filterPerson, filterYear);

  function renderFilters(members, filterPerson, filterYear) {
    const bar = document.getElementById('filter-bar-container');
    const years = [...new Set(trips.map(t => t.dateOutIndia?.slice(0, 4)).filter(Boolean))].sort((a,b)=>b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));

    bar.innerHTML = `
      <div class="filter-bar">
        <div class="filter-chips">
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:4px;flex-shrink:0;">Person</span>
          <button class="filter-chip ${!filterPerson ? 'active' : ''}" data-filter="person" data-value="">All</button>
          ${members.map(m => `
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

  function renderTrips(members, trips, filterPerson, filterYear, resetPage = true) {
    if (resetPage) _tripPage = 1;
    const logContent = document.getElementById('log-content');
    const memberMap  = Object.fromEntries(members.map(m => [m.id, m]));

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
      const member = memberMap[trip.personId] || { name: 'Unknown', emoji: '👤', color: '#EEF2FF' };
      const travelWith = (trip.travelWith || [])
        .map(id => memberMap[id]?.name).filter(Boolean);

      const daysLabel = trip.daysInQatar != null
        ? `${trip.daysInQatar}d in Qatar`
        : trip.dateInQatar && !trip.dateOutQatar
          ? `${daysBetween(trip.dateInQatar, new Date().toISOString().split('T')[0])}d so far`
          : '—';

      const statusDot = !trip.dateOutQatar
        ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-right:5px;"></span>`
        : '';

      const row = document.createElement('div');
      row.className = 'swipe-row-container';
      row.innerHTML = `
        <div class="list-row trip-row" data-trip-id="${trip.id}">
          <div class="person-avatar" style="background:${member.color || '#EEF2FF'};width:40px;height:40px;font-size:18px;flex-shrink:0;">
            ${member.emoji || '👤'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:15px;font-weight:600;color:var(--text);">${member.name}</span>
              ${statusDot}
              <span style="font-size:12px;color:var(--text-muted);">${trip.reason || ''}</span>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
              ${formatDisplayDate(trip.dateOutIndia)} → ${trip.dateInIndia ? formatDisplayDate(trip.dateInIndia) : 'Present'}
            </div>
            ${travelWith.length ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;">with ${travelWith.join(', ')}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:14px;font-weight:700;color:var(--primary);">${daysLabel}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${trip.flightInward || '—'}</div>
          </div>
          <span style="color:var(--text-muted);font-size:16px;margin-left:4px;">›</span>
        </div>
        <div class="swipe-row-delete" data-trip-id="${trip.id}">
          <div style="text-align:center;"><div style="font-size:20px;">🗑️</div><div>Delete</div></div>
        </div>
      `;

      row.querySelector('.trip-row').addEventListener('click', () => {
        navigate('add-trip', { tripId: trip.id, mode: 'edit' });
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
      showToast('Delete failed — try again', 'error');
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
