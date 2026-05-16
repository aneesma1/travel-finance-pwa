// v3.7.2 — 2026-05-16

// ─── app-a-family-hub/js/screens/travel-log.js ──────────────────────────────
// Travel Log: Dual-tab architecture (Trip Log & Passenger Summary)

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { openTravelExportSheet } from './travel-export.js';
import {
  formatDisplayDate, daysBetween, today, currentYear,
  getHashParams, setHashParams,
  showToast, copyToClipboard
} from '../../../shared/utils.js';

// Helper to extract a 4-digit year from any raw date string
function extractYear(val) {
  if (!val) return '';
  const s = String(val).trim();
  const match = s.match(/\b(20\d{2})\b/);
  return match ? match[1] : '';
}

export async function renderTravelLog(container, params = {}) {
  const data = await getCachedTravelData();
  const { passengers = [], trips = [] } = data || {};

  // ── 1. Data Normalization ──
  const isUuid = (str) => {
    const s = String(str || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || (s.length === 36 && s.includes('-'));
  };
  const tpMap = Object.fromEntries(passengers.map(p => [p.id, p]));

  const safeTrips = Array.isArray(trips) ? trips.filter(Boolean).map(t => {
    const person = tpMap[t.passengerId || t.personId];
    if (person) t.passengerName = person.name;
    
    const rawName = t.passengerName || t.personName || '';
    if (!t.passengerId && !t.personId && rawName && isUuid(String(rawName))) {
      const p = tpMap[rawName];
      if (p) t.passengerName = p.name;
    }
    if (!t.passengerName) t.passengerName = 'Unknown';
    
    // Resolve companion names
    let companionNames = [];
    if (Array.isArray(t.travelWith)) {
      companionNames = t.travelWith.map(id => tpMap[id]?.name).filter(Boolean);
    } else if (t.travelWithNames) {
      companionNames = String(t.travelWithNames).split(/[,;]+/).map(n => n.trim()).filter(Boolean);
    } else if (t.travelWith) {
      // Legacy string or mixed IDs
      companionNames = String(t.travelWith).split(/[,;]+/).map(n => {
        const trimmed = n.trim();
        return isUuid(trimmed) ? (tpMap[trimmed]?.name || '') : trimmed;
      }).filter(Boolean);
    }
    t._resolvedCompanionNames = companionNames;

    // One-Way Model Normalization
    t.dateLeftOrigin = t.dateLeftOrigin || t.dateOutIndia || t.dateOutQatar;
    t.dateArrivedDest = t.dateArrivedDest || t.dateInQatar || t.dateInIndia;
    t.originCountry = t.originCountry || 'India';
    t.destinationCountry = t.destinationCountry || t.destination || 'Qatar';
    t.flightNumber = t.flightNumber || t.flightInward || t.flightOutward || '';
    
    return t;
  }) : [];

  // Extract unique passengers and years
  const passengerNamesSet = new Set();
  const passengerInfoMap = {};
  const yearsSet = new Set();

  safeTrips.forEach(t => {
    const namesInTrip = [t.passengerName, ...(t._resolvedCompanionNames || [])]
      .map(n => String(n || '').trim())
      .filter(n => n && !isUuid(n) && n.toLowerCase() !== 'unknown');

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

  // ── 2. State Management ──
  const urlYear = params.year || getHashParams().year;
  let filterYear = urlYear || 'all';
  
  if (params.passengerId) setHashParams({ passenger: params.passengerId });
  const hashParams = getHashParams();
  let filterPassenger = params.person
    ? params.person
    : (hashParams.passenger || '');
  let searchQuery = hashParams.q || '';

  // Tab State
  let activeTab = 'trips'; // 'trips' or 'summary'
  let summaryState = {
    selectedPassenger: filterPassenger ? filterPassenger.split(',')[0].trim() : (uniquePassengers[0]?.name || ''),
    pivotMode: 'year'
  };

  // Suggestion pool (Unique names, countries, reasons)
  const suggestionPool = {
    names: [...passengerNamesSet].sort(),
    countries: Array.from(new Set(safeTrips.flatMap(t => [t.originCountry, t.destinationCountry]))).filter(Boolean).sort(),
    reasons: Array.from(new Set(safeTrips.map(t => t.reason))).filter(Boolean).sort()
  };

  if (!data) { 
     container.innerHTML = `
      <div class="app-header"><span class="app-header-title">✈️ Travel Log</span></div>
      <div class="empty-state">
        <div class="empty-state-icon">✈️</div>
        <div class="empty-state-title">No data available</div>
        <div class="empty-state-text">Add some data or sync to begin</div>
      </div>
     `; 
     return; 
  }

  // ── 3. Base Layout Renderer ──
  function renderLayout() {
    container.innerHTML = `
      <div class="app-header">
        <span class="app-header-title">✈️ Travel</span>
        <button class="app-header-action" id="header-export-btn" title="Export History">📤</button>
      </div>
      <div style="display:flex; background:var(--surface); border-bottom:2px solid var(--border); position:sticky; top:60px; z-index:40;">
         <button id="tab-btn-trips" style="flex:1; padding:12px; font-size:14px; font-weight:700; text-align:center; border-bottom:3px solid ${activeTab === 'trips' ? 'var(--primary)' : 'transparent'}; color:${activeTab === 'trips' ? 'var(--primary)' : 'var(--text-muted)'}; background:none; border-top:none; border-left:none; border-right:none; transition:all 0.2s; cursor:pointer;">Trip Log</button>
         <button id="tab-btn-summary" style="flex:1; padding:12px; font-size:14px; font-weight:700; text-align:center; border-bottom:3px solid ${activeTab === 'summary' ? 'var(--primary)' : 'transparent'}; color:${activeTab === 'summary' ? 'var(--primary)' : 'var(--text-muted)'}; background:none; border-top:none; border-left:none; border-right:none; transition:all 0.2s; cursor:pointer;">Passenger Summary</button>
      </div>
      <div id="tab-content" style="background:var(--page-bg);"></div>
    `;

    container.querySelector('#tab-btn-trips').addEventListener('click', () => { activeTab = 'trips'; renderLayout(); });
    container.querySelector('#tab-btn-summary').addEventListener('click', () => { 
       if (!summaryState.selectedPassenger && uniquePassengers.length > 0) summaryState.selectedPassenger = uniquePassengers[0].name;
       activeTab = 'summary'; renderLayout(); 
    });

    const tabContent = container.querySelector('#tab-content');
    if (activeTab === 'trips') renderTripsTab(tabContent);
    else renderSummaryTab(tabContent);
  }

  // ── 4. Trips Tab Logic ──
  let _tripPage = 1;
  const PAGE_SIZE = 25;

  function renderTripsTab(tabContent) {
    tabContent.innerHTML = `
      <div style="padding:16px 16px 8px 16px; background:var(--surface); position:sticky; top:104px; z-index:35;">
        <div style="position:relative; display:flex; align-items:center;">
          <input type="text" id="log-search-input" placeholder="Search people, countries, flights..." 
            style="width:100%; padding:12px 36px 12px 42px; border-radius:12px; border:1px solid var(--border); background:var(--page-bg); font-size:14px; transition:border-color 0.2s;" 
            value="${searchQuery}">
          <span style="position:absolute; left:16px; top:50%; transform:translateY(-50%); font-size:16px; opacity:0.5;">🔍</span>
          <button id="search-clear-btn" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; padding:4px; cursor:pointer; display:${searchQuery ? 'block' : 'none'}; font-size:18px; color:var(--text-muted);">ⓧ</button>
          <div id="search-suggestions" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--surface); border:1px solid var(--border); border-radius:12px; margin-top:8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100; max-height:250px; overflow-y:auto; padding:8px;"></div>
        </div>
      </div>
      <div id="filter-bar-container"></div>
      <div id="log-content"></div>
      <button class="fab" id="add-trip-fab">＋</button>
    `;

    const input = tabContent.querySelector('#log-search-input');
    const suggestions = tabContent.querySelector('#search-suggestions');
    const clearBtn = tabContent.querySelector('#search-clear-btn');

    const updateUIState = () => {
      clearBtn.style.display = searchQuery ? 'block' : 'none';
      setHashParams({ q: searchQuery || null });
      renderTrips(filterPassenger, filterYear, true, tabContent.querySelector('#log-content'));
    };

    input.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      updateSuggestions(searchQuery, suggestions, input);
      updateUIState();
    });

    clearBtn.addEventListener('click', () => {
      searchQuery = '';
      input.value = '';
      suggestions.style.display = 'none';
      updateUIState();
      input.focus();
    });

    input.addEventListener('focus', () => searchQuery && updateSuggestions(searchQuery, suggestions, input));
    document.addEventListener('click', (e) => { if (!input.contains(e.target)) suggestions.style.display = 'none'; });

    tabContent.querySelector('#add-trip-fab').addEventListener('click', () => navigate('add-trip'));
    renderFilters(filterPassenger, filterYear, tabContent.querySelector('#filter-bar-container'));
    renderTrips(filterPassenger, filterYear, true, tabContent.querySelector('#log-content'));
  }

  function updateSuggestions(query, container, input) {
    if (!query || query.length < 1) { container.style.display = 'none'; return; }
    const q = query.toLowerCase().trim();
    
    // Build actual suggestion list
    const filteredNames = suggestionPool.names.filter(n => n.toLowerCase().includes(q)).slice(0, 3);
    const filteredCountries = suggestionPool.countries.filter(c => c.toLowerCase().includes(q)).slice(0, 3);
    const filteredReasons = suggestionPool.reasons.filter(r => r.toLowerCase().includes(q)).slice(0, 3);

    const all = [
      ...filteredNames.map(n => ({ type: '👤 Passenger', val: n })),
      ...filteredCountries.map(c => ({ type: '📍 Country', val: c })),
      ...filteredReasons.map(r => ({ type: '📝 Purpose', val: r }))
    ];

    if (all.length === 0) { container.style.display = 'none'; return; }

    container.innerHTML = all.map(s => `
      <div class="suggestion-item" style="padding:10px 12px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" data-val="${s.val}">
        <span style="font-size:13px; font-weight:500;">${s.val}</span>
        <span style="font-size:10px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">${s.type}</span>
      </div>
    `).join('');

    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        searchQuery = item.dataset.val;
        input.value = searchQuery;
        container.style.display = 'none';
        renderTrips(filterPassenger, filterYear, true, document.getElementById('log-content'));
      });
    });
    container.style.display = 'block';
  }

  function renderFilters(fPass, fYear, bar) {
    if(!bar) return;
    const yearsDisplay = [...availableYears];
    if (!yearsDisplay.includes(String(currentYear()))) yearsDisplay.unshift(String(currentYear()));

    const selectedPasses = fPass ? fPass.split(',').map(s => s.trim()).filter(Boolean) : [];

    bar.innerHTML = `
      <div class="filter-bar" style="border-bottom:1px solid var(--border); padding:8px 16px;">
        <div class="filter-chips" style="padding:0;">
          <span style="font-size:12px;font-weight:600;color:var(--text-muted);margin-right:8px;flex-shrink:0;">Filter</span>
          
          <div style="position:relative; display:inline-block;" id="passenger-dropdown-container">
             <button class="btn btn-secondary" style="padding:6px 12px; font-size:12px; border-radius:99px;" id="passenger-dropdown-btn">
               👤 ${selectedPasses.length === 0 ? 'All' : selectedPasses.length === 1 ? selectedPasses[0] : `${selectedPasses.length} Selected`} ▾
             </button>
             
             <div id="passenger-dropdown-menu" style="display:none; position:absolute; top:100%; left:0; width:220px; background:var(--surface); border:1px solid var(--border); border-radius:12px; margin-top:8px; box-shadow:0 8px 32px rgba(0,0,0,0.15); z-index:100; max-height:50vh; overflow-y:auto; padding:8px;">
               <label style="display:flex; align-items:center; gap:10px; padding:8px 10px; cursor:pointer; border-radius:8px;">
                 <input type="checkbox" value="" ${selectedPasses.length === 0 ? 'checked' : ''} class="pass-checkbox pass-all-cb">
                 <span style="font-size:13px; font-weight:700;">All Passengers</span>
               </label>
               <div style="height:1px; background:var(--border); margin:6px 0;"></div>
               ${uniquePassengers.map(p => `
                 <label style="display:flex; align-items:center; gap:10px; padding:8px 10px; cursor:pointer;" class="pass-label">
                    <input type="checkbox" value="${p.name}" ${selectedPasses.includes(p.name) ? 'checked' : ''} class="pass-checkbox pass-item-cb">
                    <span style="font-size:13px;">${p.emoji || '👤'} ${p.name}</span>
                 </label>
               `).join('')}
               <div style="margin-top:12px; display:flex;">
                 <button class="btn btn-primary" style="flex:1; padding:8px; font-size:12px;" id="pass-apply-btn">Apply Filters</button>
               </div>
             </div>
          </div>

          <div style="width:1px;height:16px;background:var(--border);flex-shrink:0;margin:0 8px;"></div>
          <button class="filter-chip ${fYear === 'all' ? 'active' : ''}" data-filter="year" data-value="all">All</button>
          ${yearsDisplay.map(y => `
            <button class="filter-chip ${fYear === y ? 'active' : ''}" data-filter="year" data-value="${y}">${y}</button>
          `).join('')}
        </div>
      </div>
    `;

    // DROP-DOWN TOGGLE: Bulletproof implementation
    const dropBtn = bar.querySelector('#passenger-dropdown-btn');
    const dropMenu = bar.querySelector('#passenger-dropdown-menu');
    if (dropBtn && dropMenu) {
      dropBtn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = dropMenu.style.display === 'none' || dropMenu.style.display === '';
        dropMenu.style.display = isHidden ? 'block' : 'none';
      };
    }
    
    bar.querySelector('#pass-apply-btn').addEventListener('click', () => {
      const checked = Array.from(bar.querySelectorAll('.pass-item-cb')).filter(c => c.checked).map(c => c.value);
      filterPassenger = checked.length > 0 ? checked.join(',') : null;
      setHashParams({ passenger: filterPassenger });
      _tripPage = 1;
      const content = document.getElementById('log-content');
      if (content) renderTrips(filterPassenger, filterYear, true, content);
      bar.querySelector('.filter-dropdown').classList.add('hidden');
    });

    bar.querySelectorAll('.filter-chip[data-filter="year"]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterYear = btn.dataset.value === 'all' ? null : btn.dataset.value;
        setHashParams({ year: filterYear });
        _tripPage = 1;
        
        // Update active UI state for pills immediately
        bar.querySelectorAll('.filter-chip[data-filter="year"]').forEach(b => {
          b.classList.toggle('active', b.dataset.value === (filterYear || 'all'));
        });

        const content = document.getElementById('log-content');
        if (content) renderTrips(filterPassenger, filterYear, true, content);
      });
    });
  }

  function renderTrips(fPass, fYear, resetPage = true, logContent) {
    if (!logContent) return;
    try {
      if (resetPage) _tripPage = 1;

      const sorted = [...safeTrips].sort((a, b) => {
        const ta = new Date(a.dateLeftOrigin || 0).getTime();
        const tb = new Date(b.dateLeftOrigin || 0).getTime();
        if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return tb - ta;
        const aa = new Date(a.dateArrivedDest || 0).getTime();
        const ab = new Date(b.dateArrivedDest || 0).getTime();
        return ab - aa;
      });

      let filtered = sorted;

      // ── 1. Search Query Multi-Field Match ──
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(t => {
          return (t.passengerName || '').toLowerCase().includes(q) ||
                 (t.destinationCountry || '').toLowerCase().includes(q) ||
                 (t.originCountry || '').toLowerCase().includes(q) ||
                 (t.flightNumber || '').toLowerCase().includes(q) ||
                 (t.reason || '').toLowerCase().includes(q) ||
                 (t._resolvedCompanionNames || []).some(n => n.toLowerCase().includes(q));
        });
      }

      // ── 2. Passenger Filter ──
      if (fPass) {
        const selectedArr = fPass.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
        filtered = filtered.filter(t => {
          const primaryMatch = String(t.passengerName || '').toLowerCase().trim();
          const travelWithNames = (t._resolvedCompanionNames || []).map(n => n.toLowerCase());
          return selectedArr.some(sel => primaryMatch === sel || travelWithNames.includes(sel));
        });
      }
      
      // ── 3. Year Filter ──
      const actualYearStr = fYear || 'all'; 
      if (actualYearStr && actualYearStr !== 'all') {
        filtered = filtered.filter(t => extractYear(t.dateLeftOrigin) === actualYearStr);
      }

      if (!filtered.length) {
        logContent.innerHTML = `
          <div class="empty-state" style="padding:40px 0;">
            <div class="empty-state-icon">🔎</div>
            <div class="empty-state-title">No matching trips</div>
            <div class="empty-state-text">Try a different search term or filter</div>
          </div>`;
        return;
      }

      const totalCount = filtered.length;
      filtered = filtered.slice(0, _tripPage * PAGE_SIZE);

      logContent.innerHTML = `
        <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;color:var(--text-muted);">${filtered.length} trip${filtered.length !== 1 ? 's' : ''}${totalCount > filtered.length ? ` of ${totalCount}` : ''}</span>
        </div>
        <div id="trips-list"></div>
      `;

      const list = logContent.querySelector('#trips-list');

      filtered.forEach((trip, index) => {
        const pName = trip.passengerName || 'Unknown';
        const pInfo = passengerInfoMap[pName] || { name: pName, emoji: '👤', color: '#EEF2FF' };

        // Find next trip to see if currently active (most recent)
        const nextTripForPerson = sorted.find(t => 
           (t.passengerId === trip.passengerId || t.passengerName === pName) && 
           new Date(t.dateLeftOrigin).getTime() > new Date(trip.dateArrivedDest).getTime()
        );
        const isCurrent = !nextTripForPerson; 
        const statusDot = isCurrent ? `<span class="status-dot-active"></span>` : '';

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
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-weight:500;">
                <span style="color:var(--text-secondary);">${trip.originCountry}</span> 
                <span style="margin:0 4px;opacity:0.5;">→</span> 
                <span style="color:var(--primary);">${trip.destinationCountry}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;font-weight:600;">
                Arrived on ${formatDisplayDate(trip.dateArrivedDest || trip.dateLeftOrigin)}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:11px;color:var(--text-muted);font-weight:700;background:var(--primary-bg);color:var(--primary);padding:4px 8px;border-radius:6px;display:inline-block;">${trip.flightNumber || '--'}</div>
            </div>
            <span style="color:var(--text-muted);font-size:16px;margin-left:4px;">›</span>
          </div>
          <div class="swipe-row-delete" data-trip-id="${trip.id}">
            <div style="text-align:center;"><div style="font-size:20px;">🗑️</div><div>Delete</div></div>
          </div>
        `;

        row.querySelector('.trip-row').addEventListener('click', () => navigate('add-trip', { tripId: trip.id, mode: 'view' }));

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
      logContent.innerHTML = `<div style="padding:20px;color:red;font-size:12px;"><b>Render crashed:</b><br>${err.message}</div>`;
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
    } catch { showToast('Delete failed', 'error'); }
  }


  // ── 5. Passenger Summary Tab Logic ──
  function getEmoji(name) {
    const p = uniquePassengers.find(x => x.name === name);
    return p ? (p.emoji || '👤') : '👤';
  }

  // Local-time date string (avoids UTC toISOString() shifting date by timezone offset)
  function toLocalDate(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function computeSummaryData() {
    if (!summaryState.selectedPassenger) return null;
    const pNameLower = summaryState.selectedPassenger.toLowerCase();
    
    const pTrips = safeTrips.filter(t => {
      const prim = String(t.passengerName || '').toLowerCase() === pNameLower;
      const travelWithNames = (Array.isArray(t.travelWith) ? t.travelWith : String(t.travelWith || '').split(/[,;]+/))
        .map(n => String(n || '').trim().toLowerCase());
      return prim || travelWithNames.includes(pNameLower);
    });

    // Sort trips chronologically to bridge them correctly
    const pTripsSorted = pTrips.sort((a,b) => {
      const da = a.dateArrivedDest || a.dateLeftOrigin;
      const db = b.dateArrivedDest || b.dateLeftOrigin;
      return new Date(da) - new Date(db);
    });

    const records = [];
    let lifetimeDays = 0;
    const countryCounts = {};
    let longestStay = 0;

    pTripsSorted.forEach((t, idx) => {
      const entryDt = t.dateArrivedDest || t.dateLeftOrigin;
      if (!entryDt) return;
      
      const nextTrip = pTripsSorted[idx + 1];
      const endDt = nextTrip ? (nextTrip.dateArrivedDest || nextTrip.dateLeftOrigin) : today();
      
      const startMs = new Date(entryDt + 'T00:00:00').getTime();
      const finalEndMs = new Date(endDt + 'T00:00:00').getTime();
      
      if (isNaN(startMs) || isNaN(finalEndMs) || finalEndMs < startMs) return;

      const totalStayDays = Math.round((finalEndMs - startMs) / 86400000) + (nextTrip ? 0 : 1);
      if (totalStayDays > longestStay) longestStay = totalStayDays;
      lifetimeDays += totalStayDays;

      // ── Split Stay by Year ──
      let currentStart = new Date(startMs);
      const country = t.destinationCountry || 'Qatar';

      while (currentStart.getTime() < finalEndMs || (!nextTrip && currentStart.getTime() === finalEndMs)) {
        const curYear = currentStart.getFullYear();
        const yearEnd = new Date(`${curYear}-12-31T23:59:59.999`).getTime();
        
        // Find if we end this fragment at year end or final end
        let fragmentEndMs = Math.min(finalEndMs, yearEnd);
        
        // Calculate days in this fragment
        // If it's the very last day of an ongoing trip, we need to ensure the +1 is handled
        let fragmentDays = Math.round((fragmentEndMs - currentStart.getTime()) / 86400000);
        
        // inclusive logic: if we are at the end and it's ongoing, add the +1
        if (!nextTrip && fragmentEndMs === finalEndMs) {
          fragmentDays += 1;
        }

        if (fragmentDays > 0) {
          records.push({
            year: String(curYear),
            country,
            days: fragmentDays,
            dateIn: toLocalDate(currentStart),
            dateOut: (fragmentEndMs === finalEndMs && !nextTrip) ? null : toLocalDate(new Date(fragmentEndMs)),
            reason: t.reason || '',
          });
          
          countryCounts[country] = (countryCounts[country] || 0) + fragmentDays;
        }

        // Move to start of next year
        currentStart = new Date(`${curYear + 1}-01-01T00:00:00`);
        if (currentStart.getTime() > finalEndMs) break;
      }
    });

    let topDest = 'None';
    let topDestDays = 0;
    Object.keys(countryCounts).forEach(c => {
      if (countryCounts[c] > topDestDays) {
        topDestDays = countryCounts[c];
        topDest = c;
      }
    });

    // Build pivot structures that also store individual trip records
    const pivotYear = {};   // { '2025': { 'Qatar': { total: 58, trips: [...] } } }
    const pivotCountry = {}; // { 'Qatar': { '2025': { total: 58, trips: [...] } } }
    records.forEach(r => {
      if (!pivotYear[r.year]) pivotYear[r.year] = {};
      if (!pivotYear[r.year][r.country]) pivotYear[r.year][r.country] = { total: 0, trips: [] };
      pivotYear[r.year][r.country].total += r.days;
      pivotYear[r.year][r.country].trips.push(r);

      if (!pivotCountry[r.country]) pivotCountry[r.country] = {};
      if (!pivotCountry[r.country][r.year]) pivotCountry[r.country][r.year] = { total: 0, trips: [] };
      pivotCountry[r.country][r.year].total += r.days;
      pivotCountry[r.country][r.year].trips.push(r);
    });

    return { totalTrips: pTrips.length, lifetimeDays, topDest, longestStay, pivotYear, pivotCountry };
  }

  function renderPivotHtml(data) {
    if (Object.keys(data.pivotYear).length === 0) {
      return '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:14px;">No travel recorded for this passenger.</div>';
    }

    function tripRows(tripsArr) {
      if (!tripsArr || tripsArr.length === 0) return '';
      return tripsArr.sort((a,b) => a.dateIn.localeCompare(b.dateIn)).map(r => {
        const dateInFmt = r.dateIn ? formatDisplayDate(r.dateIn) : '--';
        const dateOutFmt = r.dateOut ? formatDisplayDate(r.dateOut) : 'Present';
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0 5px 8px;border-left:2px solid var(--primary-border);margin:4px 0;">
            <div>
              <div style="font-size:12px;color:var(--text-secondary);">${dateInFmt} → ${dateOutFmt}</div>
              ${r.reason ? `<div style="font-size:11px;color:var(--text-muted);">${r.reason}</div>` : ''}
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--primary);flex-shrink:0;margin-left:8px;">${r.days}d</span>
          </div>
        `;
      }).join('');
    }

    let html = '';
    if (summaryState.pivotMode === 'year') {
      const years = Object.keys(data.pivotYear).sort((a,b) => b - a);
      years.forEach(y => {
        html += `<div style="margin-bottom:20px;">`;
        html += `<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;border-bottom:2px solid var(--primary-border);padding-bottom:6px;">📅 ${y}</div>`;
        const countries = Object.keys(data.pivotYear[y]).sort((a,b) => data.pivotYear[y][b].total - data.pivotYear[y][a].total);
        countries.forEach(c => {
          const entry = data.pivotYear[y][c];
          html += `
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">📍 ${c}</span>
                <span style="font-size:14px;font-weight:700;color:var(--primary);">${entry.total} <span style="font-size:11px;font-weight:500;">days</span></span>
              </div>
              ${tripRows(entry.trips)}
            </div>
          `;
        });
        html += `</div>`;
      });
    } else {
      const countries = Object.keys(data.pivotCountry).sort();
      countries.forEach(c => {
        html += `<div style="margin-bottom:20px;">`;
        html += `<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;border-bottom:2px solid var(--primary-border);padding-bottom:6px;">📍 ${c}</div>`;
        const years = Object.keys(data.pivotCountry[c]).sort((a,b) => b - a);
        years.forEach(y => {
          const entry = data.pivotCountry[c][y];
          html += `
            <div style="margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
                <span style="font-size:14px;font-weight:600;color:var(--text-secondary);">📅 ${y}</span>
                <span style="font-size:14px;font-weight:700;color:var(--primary);">${entry.total} <span style="font-size:11px;font-weight:500;">days</span></span>
              </div>
              ${tripRows(entry.trips)}
            </div>
          `;
        });
        html += `</div>`;
      });
    }
    return html;
  }

  function renderSummaryTab(tabContent) {
    const data = computeSummaryData();

    tabContent.innerHTML = `
      <div style="padding:16px; padding-bottom:80px;">
        
        <!-- Passenger & View Style Picker -->
        <div style="background:var(--surface);border-radius:var(--radius-lg);padding:16px;margin-bottom:24px;border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Select Passenger</div>
          <select id="sum-pass-select" class="form-input" style="margin-bottom:16px;background-color:var(--surface);border:1px solid var(--border);">
            ${uniquePassengers.map(p => `
              <option value="${p.name}" ${summaryState.selectedPassenger === p.name ? 'selected' : ''}>${p.emoji || '👤'} ${p.name}</option>
            `).join('')}
          </select>

          <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">View Style</div>
          <div style="display:flex;background:var(--surface-3);border-radius:var(--radius-md);padding:4px;">
            <button class="btn ${summaryState.pivotMode === 'year' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;padding:6px;font-size:13px;" id="mode-year-btn">Pivot by Year</button>
            <button class="btn ${summaryState.pivotMode === 'country' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;padding:6px;font-size:13px;" id="mode-country-btn">Pivot by Country</button>
          </div>
        </div>
        
        <!-- Mobile-Constrained Summary Export Area -->
        <div id="summary-render-target" style="max-width: 450px; margin: 0 auto;">
          <div style="background:var(--surface);border-radius:var(--radius-lg);padding:16px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            
            <div style="text-align:center;margin-bottom:16px;">
              <div style="font-size:36px;margin-bottom:8px;">${getEmoji(summaryState.selectedPassenger)}</div>
              <h2 style="margin:0;font-size:20px;">${summaryState.selectedPassenger || 'Select a Passenger'}</h2>
              <p style="margin:4px 0 0;font-size:12px;color:var(--text-muted);">
                Travel Summary <br/> <span style="opacity:0.7">(Days grouped by entry date)</span>
              </p>
            </div>
            
            <!-- Lifetime Highlights -->
            ${data ? `
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; background:var(--primary-bg); padding:12px; border-radius:12px;">
               <div style="flex:1; min-width:40%;">
                  <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Total Trips</div>
                  <div style="font-size:16px; font-weight:800; color:var(--primary);">${data.totalTrips}</div>
               </div>
               <div style="flex:1; min-width:40%;">
                  <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Total Days</div>
                  <div style="font-size:16px; font-weight:800; color:var(--primary);">${data.lifetimeDays}</div>
               </div>
               <div style="flex:1; min-width:40%;">
                  <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Top Dest.</div>
                  <div style="font-size:14px; font-weight:800; color:var(--primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${data.topDest}</div>
               </div>
               <div style="flex:1; min-width:40%;">
                  <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Max Stay</div>
                  <div style="font-size:14px; font-weight:800; color:var(--primary);">${data.longestStay}d</div>
               </div>
            </div>
            ` : ''}

            <!-- Pivot Details -->
            <div style="padding:0 8px;">
              ${data ? renderPivotHtml(data) : ''}
            </div>
            
            <div style="text-align:center;margin-top:24px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">
              Generated by Family Hub
            </div>
          </div>
        </div>
        
        <!-- Actions (Constrained to export area width) -->
        <div style="display:flex; gap:12px; margin-top:20px; max-width:450px; margin-left:auto; margin-right:auto;">
           <button class="btn btn-secondary" style="flex:1; display:flex; flex-direction:column; align-items:center; padding:12px 0;" id="sum-export-txt">
             <span style="font-size:18px;margin-bottom:2px;">📋</span><span style="font-size:11px;">Copy Text</span>
           </button>
           <button class="btn btn-secondary" style="flex:1; display:flex; flex-direction:column; align-items:center; padding:12px 0;" id="sum-export-image">
             <span style="font-size:18px;margin-bottom:2px;">📸</span><span style="font-size:11px;">Save Image</span>
           </button>
           <button class="btn btn-primary" style="flex:1.5; display:flex; flex-direction:column; align-items:center; padding:12px 0;" id="sum-share-wa">
             <span style="font-size:18px;margin-bottom:2px;">💬</span><span style="font-size:11px;">WhatsApp</span>
           </button>
        </div>

      </div>
    `;

    tabContent.querySelector('#sum-pass-select').addEventListener('change', (e) => {
      summaryState.selectedPassenger = e.target.value;
      renderLayout();
    });

    tabContent.querySelector('#mode-year-btn').addEventListener('click', () => { summaryState.pivotMode = 'year'; renderLayout(); });
    tabContent.querySelector('#mode-country-btn').addEventListener('click', () => { summaryState.pivotMode = 'country'; renderLayout(); });

    tabContent.querySelector('#sum-export-txt').addEventListener('click', () => {
      copyToClipboard(generateTextReport(data));
      showToast('Report copied to clipboard', 'success');
    });
    
    tabContent.querySelector('#sum-share-wa').addEventListener('click', () => {
      copyToClipboard(generateTextReport(data));
      showToast('Copied text for WhatsApp!', 'success');
    });
    
    tabContent.querySelector('#sum-export-image').addEventListener('click', async () => {
      const target = tabContent.querySelector('#summary-render-target');
      if (!target) return;
      
      showToast('Generating image…', 'info');
      
      if (!window.html2canvas) {
        await new Promise(resolve => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }
      try {
        const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: '#f8fafc' });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Travel_Summary_${summaryState.selectedPassenger.replace(/ /g, '_')}_${Date.now()}.jpg`;
        a.click();
        showToast('Image downloaded!', 'success');
      } catch(err) {
        console.error(err);
        showToast('Failed to create image', 'error');
      }
    });
  }

  function generateTextReport(data) {
     if (!data || Object.keys(data.pivotYear).length === 0) return 'No data to share.';
     
     let text = `✈️ *Travel Summary: ${summaryState.selectedPassenger}*\n━━━━━━━━━━━━━━\n`;
     text += `📋 Total Trips: ${data.totalTrips}\n`;
     text += `🗓️ Total Days: ${data.lifetimeDays}\n`;
     text += `🏆 Top Dest: ${data.topDest}\n`;
     
     if (summaryState.pivotMode === 'year') {
       const years = Object.keys(data.pivotYear).sort((a,b) => b - a);
       years.forEach(y => {
         text += `\n📅 *Year ${y}*\n`;
         Object.keys(data.pivotYear[y]).sort((a,b) => data.pivotYear[y][b].total - data.pivotYear[y][a].total).forEach(c => {
           const entry = data.pivotYear[y][c];
           text += `   📍 ${c}: ${entry.total} days\n`;
           entry.trips.sort((a,b) => a.dateIn.localeCompare(b.dateIn)).forEach(r => {
             const dIn = r.dateIn ? formatDisplayDate(r.dateIn) : '--';
             const dOut = r.dateOut ? formatDisplayDate(r.dateOut) : 'Present';
             text += `      • ${dIn} → ${dOut} (${r.days}d)${r.reason ? ' ' + r.reason : ''}\n`;
           });
         });
       });
     } else {
       const countries = Object.keys(data.pivotCountry).sort();
       countries.forEach(c => {
         text += `\n📍 *${c}*\n`;
         Object.keys(data.pivotCountry[c]).sort((a,b) => b - a).forEach(y => {
           const entry = data.pivotCountry[c][y];
           text += `   📅 ${y}: ${entry.total} days\n`;
           entry.trips.sort((a,b) => a.dateIn.localeCompare(b.dateIn)).forEach(r => {
             const dIn = r.dateIn ? formatDisplayDate(r.dateIn) : '--';
             const dOut = r.dateOut ? formatDisplayDate(r.dateOut) : 'Present';
             text += `      • ${dIn} → ${dOut} (${r.days}d)${r.reason ? ' ' + r.reason : ''}\n`;
           });
         });
       });
     }
     text += `\n_Generated by Family Hub PWA_`;
     return text;
  }

  // Initial Boot
  renderLayout();
}
