// v3.5.10 — 2026-05-15 — Dashboard person chips clickable → navigate to travel log filtered by person

// ─── app-a-family-hub/js/screens/dashboard.js ───────────────────────────────
// Family Hub Dashboard
// Shows: live status per member, days in location, next doc expiry, filter bar

'use strict';

import { getCachedTravelData } from '../../shared/db.js';
import { navigate } from '../router.js';
import {
  formatDisplayDate, daysFromToday, daysBetween,
  expiryStatus, expiryStatusColor, today,
  getHashParams, setHashParams, clearHashParams,
  showToast, copyToClipboard
} from '../../shared/utils.js';
import { buildFamilyGroups, getMemberRelations } from '../relation-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentLocationFromTrips(passengerName, trips) {
  // Match trips where this passenger is primary or a companion
  const nameLower = String(passengerName || '').toLowerCase().trim();
  const personTrips = trips
    .filter(t => {
      const prim = String(t.passengerName || '').toLowerCase() === nameLower;
      const companions = (Array.isArray(t.travelWith) ? t.travelWith : String(t.travelWith || '').split(/[,;]+/))
        .map(n => String(n || '').trim().toLowerCase());
      return prim || companions.includes(nameLower);
    })
    .sort((a, b) => {
      // Sort by arrival date (latest first)
      const da = new Date(a.dateArrivedDest || 0).getTime();
      const db = new Date(b.dateArrivedDest || 0).getTime();
      return db - da; 
    });

  if (!personTrips.length) return { location: 'Unknown', country: '', days: null };

  const latest = personTrips[0];
  const todayStr = today();
  const destCountry = latest.destinationCountry || 'Qatar';

  // In the One-Way model, you are always in the destination of your latest trip
  const days = daysBetween(latest.dateArrivedDest, todayStr);
  return { 
    location: destCountry, 
    country: destCountry, 
    days: days, 
    tripId: latest.id 
  };
}

function getCurrentLocation(person, trips) {
  // Legacy support — delegates to new function using name
  return getCurrentLocationFromTrips(person.name || '', trips);
}

function getPersonDocs(person, documents) {
  return documents.filter(d => d.personId === person.id);
}

function getNextExpiry(docs) {
  const future = docs
    .map(d => ({ ...d, daysLeft: daysFromToday(d.expiryDate) }))
    .filter(d => d.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return future[0] || null;
}

function getYearlyDestDays(passengerName, trips, year) {
  const nameLower = String(passengerName || '').toLowerCase().trim();
  return trips
    .filter(t => String(t.passengerName || '').toLowerCase() === nameLower)
    .filter(t => {
      const entryDate = t.dateArrivedDest || t.dateLeftOrigin;
      return entryDate && new Date(entryDate).getFullYear() === year;
    })
    .reduce((sum, t) => sum + (Number(t.daysInDest) || Number(t.daysInQatar) || 0), 0);
}

// ── Render ────────────────────────────────────────────────────────────────────

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Family Hub</span>
      <div style="display:flex;gap:8px;">
        <button class="app-header-action" id="export-locations-btn" title="Export current locations">📊</button>
        <button class="app-header-action" id="share-btn" title="Share dashboard">⬆️</button>
      </div>
    </div>
    <div id="offline-content"></div>
    <div id="filter-bar-container"></div>
    <div id="dashboard-content" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:center;padding:40px 0;">
        <div class="spinner"></div>
      </div>
    </div>
    <div id="share-popup-anchor" style="position:fixed;bottom:80px;right:20px;z-index:150;"></div>
  `;


  document.getElementById('share-btn').addEventListener('click', () => toggleSharePopup());
  document.getElementById('export-locations-btn').addEventListener('click', () => exportCurrentLocationsXLSX());

  await loadAndRender();

  async function loadAndRender() {
    const data = await getCachedTravelData();
    const content = document.getElementById('dashboard-content');
    // Clear the loading spinner before rendering anything
    content.innerHTML = '';

    if (!data) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No data yet</div>
          <div class="empty-state-text">Go to Settings → Import from Excel to add your travel records.</div>
          <button class="btn btn-primary" style="margin-top:20px;" id="go-settings-btn">⚙️ Open Settings</button>
        </div>`;
      content.querySelector('#go-settings-btn')?.addEventListener('click', () => navigate('settings'));
      return;
    }

    const { members = [], passengers = [], trips = [], documents = [] } = data;

    // Read filter state from URL hash
    const params = getHashParams();
    const filterPerson   = params.person   ? params.person.split(',')   : [];
    const filterLocation = params.location || 'all';
    const filterDocStatus= params.docstatus || 'all';

    // Build a combined list — passengers from travel data take priority for location widget
    const allPassengerNames = [...new Set(
      trips.filter(Boolean).map(t => String(t.passengerName || '').trim()).filter(Boolean)
    )].sort();

    // Render travel location widget first (works independently of People tab)
    renderLocationWidget(allPassengerNames, trips, filterLocation);

    renderFilterBar(members, filterPerson, filterLocation, filterDocStatus);
    renderMemberCards(members, passengers, trips, documents, filterPerson, filterLocation, filterDocStatus, allPassengerNames);
  }

  // ── Travel Location Widget (works from passenger/trip data, no People needed) ──
  function renderLocationWidget(allPassengerNames, trips, filterLocation = 'all') {
    const content = document.getElementById('dashboard-content');
    if (!allPassengerNames.length) return;

    const year = new Date().getFullYear();

    // Compute current location for each passenger
    const located = allPassengerNames.map(name => {
      const { location, country, days, tripId } = getCurrentLocationFromTrips(name, trips);
      const yearDays = getYearlyDestDays(name, trips, year);
      return { name, location, country, days, yearDays, tripId };
    });

    // Group by location
    const groups = {};
    located.forEach(p => {
      if (!groups[p.location]) groups[p.location] = [];
      groups[p.location].push(p);
    });

    let locationOrder = Object.keys(groups).sort((a, b) => {
      // Show Qatar first, India second, others after
      const order = ['Qatar', 'India', 'In transit', 'Unknown'];
      return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
    });

    // Apply country filter to the widget itself
    if (filterLocation !== 'all') {
      locationOrder = locationOrder.filter(loc => loc === filterLocation);
    }

    const flagMap = { Qatar: '🇶🇦', India: '🇮🇳', 'In transit': '✈️' };
    const colorMap = {
      Qatar: 'background:#FEF9C3; color:#854D0E; border-color:#FDE68A',
      India: 'background:#FEE2E2; color:#991B1B; border-color:#FECACA',
      'In transit': 'background:#EEF2FF; color:#3730A3; border-color:#A5B4FC',
    };

    const widgetHtml = `
      <div style="background:var(--surface); border-radius:var(--radius-lg); border:1px solid var(--border); overflow:hidden; margin-bottom:4px;">
        <div style="padding:12px 16px 8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light);">
          <span style="font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">📍 Current Locations</span>
          <span style="font-size:12px; color:var(--text-muted);">${allPassengerNames.length} tracked</span>
        </div>
        ${locationOrder.map(loc => `
          <div style="padding:10px 16px; border-bottom:1px solid var(--border-light);">
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">${flagMap[loc] || '📍'} ${loc} (${groups[loc].length})</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${groups[loc].map(p => `
                <button class="loc-person-btn" data-person="${p.name}" data-trip-id="${p.tripId || ''}" style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:99px; border:1px solid; ${colorMap[loc] || 'background:var(--surface-3); color:var(--text); border-color:var(--border)'}; font-size:13px; font-weight:600; cursor:pointer; background:inherit;">
                  ${p.name}
                  ${p.days !== null ? `<span style="font-size:10px; opacity:0.7; margin-left:2px;">·&nbsp;${p.days}d</span>` : ''}
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Inject at the top of dashboard-content
    content.insertAdjacentHTML('afterbegin', widgetHtml);

    // Tap person chip → open that specific current trip entry (not the full log)
    content.querySelectorAll('.loc-person-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tripId = btn.dataset.tripId;
        if (tripId) {
          navigate('add-trip', { tripId, mode: 'view' });
        } else {
          navigate('travel-log', { person: btn.dataset.person });
        }
      });
    });
  }

  function renderFilterBar(members, filterPerson, filterLocation, filterDocStatus) {
    const bar = document.getElementById('filter-bar-container');
    const activeCount = [
      filterPerson.length > 0,
      filterLocation !== 'all',
      filterDocStatus !== 'all'
    ].filter(Boolean).length;

    bar.innerHTML = `
      <div class="filter-bar">
        <div class="filter-chips">
          <!-- Person pills -->
          ${[...members].sort((a,b) => (b.headOfHousehold?1:0) - (a.headOfHousehold?1:0)).map(m => {
            const active = filterPerson.includes(m.id);
            return `<button class="filter-chip ${active ? 'active' : ''}" data-filter="person" data-value="${m.id}">
              ${m.emoji || '👤'} ${m.name}
            </button>`;
          }).join('')}

          <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 4px;"></div>

          <!-- Location filter -->
          ${['all','Qatar','India'].map(loc => {
            const labels = { all: '🌍 All', Qatar: '🇶🇦 Qatar', India: '🇮🇳 India' };
            const active = filterLocation === loc;
            return `<button class="filter-chip ${active ? 'active' : ''}" data-filter="location" data-value="${loc}">
              ${labels[loc]}
            </button>`;
          }).join('')}

          <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 4px;"></div>

          <!-- Doc status filter -->
          ${[
            { v:'all', label:'📋 All docs' },
            { v:'expiring', label:'⚠️ Expiring' },
            { v:'expired', label:'🔴 Expired' }
          ].map(({ v, label }) => {
            const active = filterDocStatus === v;
            return `<button class="filter-chip ${active ? 'active' : ''}" data-filter="docstatus" data-value="${v}">
              ${label}
            </button>`;
          }).join('')}

          ${activeCount > 0 ? `
            <button id="clear-filters" class="filter-clear">✕ Clear</button>
          ` : ''}
        </div>
      </div>
    `;

    // Bind filter chips
    bar.querySelectorAll('.filter-chip[data-filter="person"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.value;
        const cur = filterPerson.includes(id)
          ? filterPerson.filter(p => p !== id)
          : [...filterPerson, id];
        setHashParams({ person: cur.join(',') || null });
        renderDashboard(container);
      });
    });

    bar.querySelectorAll('.filter-chip[data-filter="location"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ location: btn.dataset.value === 'all' ? null : btn.dataset.value });
        renderDashboard(container);
      });
    });

    bar.querySelectorAll('.filter-chip[data-filter="docstatus"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ docstatus: btn.dataset.value === 'all' ? null : btn.dataset.value });
        renderDashboard(container);
      });
    });

    bar.querySelector('#clear-filters')?.addEventListener('click', () => {
      clearHashParams();
      renderDashboard(container);
    });
  }

  function renderMemberCards(members, passengers, trips, documents, filterPerson, filterLocation, filterDocStatus, allPassengerNames = []) {
    const content = document.getElementById('dashboard-content');
    const year = new Date().getFullYear();
    const { familyRelations = [], familyDefaults = {} } = window._travelData || {};

    if (!members.length && !allPassengerNames.length) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👨‍👩‍👧‍👦</div>
          <div class="empty-state-title">No family members yet</div>
          <div class="empty-state-text">Add members in the People tab to get started</div>
          <button class="btn btn-primary" style="margin-top:20px;">Go to People</button>
        </div>`;
      content.querySelector('.btn')?.addEventListener('click', () => navigate('people'));
      return;
    }

    // If there are no members (People tab), location widget is the whole dashboard
    if (!members.length && allPassengerNames.length > 0) {
      // Location widget already rendered above — nothing more needed
      // (spinner was already cleared in loadAndRender before we got here)
      return;
    }

    // Apply filters
    let visibleMembers = filterPerson.length > 0
      ? members.filter(m => filterPerson.includes(m.id))
      : members;

    if (filterLocation !== 'all') {
      visibleMembers = visibleMembers.filter(m => {
        const { location } = getCurrentLocation(m, trips);
        return location === filterLocation;
      });
    }

    if (!visibleMembers.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No matches</div></div>`;
      return;
    }

    const inQatar = members.filter(m => getCurrentLocation(m, trips).location === 'Qatar').length;
    const totalDangerDocs = documents.filter(d => ['danger','expired'].includes(expiryStatus(d.expiryDate))).length;

    // Build family groups for grouped display
    const groups = buildFamilyGroups(visibleMembers, familyRelations);

    content.innerHTML = `
      ${totalDangerDocs > 0 ? `
        <div style="background:var(--danger-bg);border:1px solid #FECACA;border-radius:var(--radius-md);
          padding:12px 16px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">🚨</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:#991B1B;">${totalDangerDocs} document${totalDangerDocs > 1 ? 's' : ''} need attention</div>
            <div style="font-size:12px;color:#B91C1C;">Expiring within 30 days or already expired</div>
          </div>
          <button class="btn btn-danger" style="padding:6px 12px;font-size:12px;" id="view-docs-btn">View</button>
        </div>` : ''}

      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <div style="flex:1;background:var(--primary-bg);border-radius:var(--radius-md);padding:12px 16px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--primary);">${inQatar}</div>
          <div style="font-size:11px;font-weight:600;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">In Qatar</div>
        </div>
        <div style="flex:1;background:var(--surface-3);border-radius:var(--radius-md);padding:12px 16px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--text);">${members.length - inQatar}</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">In India</div>
        </div>
      </div>

      <div id="member-cards"></div>
    `;

    document.getElementById('view-docs-btn')?.addEventListener('click', () => navigate('documents'));

    const cardsContainer = document.getElementById('member-cards');

    groups.forEach(group => {
      // Apply doc status filter per member in group
      const visibleGroupMembers = group.members.filter(member => {
        if (filterDocStatus === 'all') return true;
        const memberDocs = documents.filter(d => d.personId === member.id);
        return memberDocs.some(d => {
          const st = expiryStatus(d.expiryDate);
          if (filterDocStatus === 'expiring') return st === 'warning' || st === 'danger';
          if (filterDocStatus === 'expired')  return st === 'expired';
          return true;
        });
      });
      if (!visibleGroupMembers.length) return;

      // Group header if multiple
      if (visibleGroupMembers.length > 1) {
        const groupTypeIcon = { 'family-unit':'👨‍👩‍👧‍👦','couple':'💑','siblings':'👫','solo':'👤' };
        const headerEl = document.createElement('div');
        headerEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0 6px;';
        headerEl.innerHTML = `
          <span style="font-size:15px;">${groupTypeIcon[group.type] || '👥'}</span>
          <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${group.label}</span>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        `;
        cardsContainer.appendChild(headerEl);

        // Render grouped members with left border
        const groupWrap = document.createElement('div');
        groupWrap.style.cssText = 'padding-left:10px;border-left:2px solid var(--primary-border);display:flex;flex-direction:column;gap:8px;margin-bottom:8px;';
        visibleGroupMembers.forEach(member => {
          groupWrap.insertAdjacentHTML('beforeend', buildStatusCard(member, trips, documents, year, familyDefaults));
        });
        cardsContainer.appendChild(groupWrap);
      } else {
        visibleGroupMembers.forEach(member => {
          cardsContainer.insertAdjacentHTML('beforeend', buildStatusCard(member, trips, documents, year, familyDefaults));
        });
      }
    });

    // Tap → travel log
    cardsContainer.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', () => navigate('travel-log', { personId: card.dataset.memberId }));
    });
  }

  function buildStatusCard(member, trips, documents, year, familyDefaults) {
    const { location, country, days } = getCurrentLocationFromTrips(member.name || '', trips);
    const memberDocs = documents.filter(d => d.personId === member.id);
    const nextExpiry = getNextExpiry(memberDocs);
    const yearDays   = getYearlyDestDays(member.name, trips, year);

    const locLabel = { Qatar:'🇶🇦 Qatar', India:'🇮🇳 India', 'In transit':'✈️ Transit' };
    const locBadgeClass = location === 'Qatar' ? 'qatar' : location === 'India' ? 'india' : '';
    const hasPhoto = member.photo?.startsWith('data:');

    // Effective address (override > family default)
    const effectiveAddr = (location === 'Qatar')
      ? (member.homeQatarOverride || familyDefaults?.homeQatar)
      : (member.homeIndiaOverride  || familyDefaults?.homeIndia);

    let expiryHtml = '';
    if (nextExpiry) {
      const st = expiryStatus(nextExpiry.expiryDate);
      const color = expiryStatusColor(st);
      const dl = daysFromToday(nextExpiry.expiryDate);
      expiryHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-light);">
          <div style="font-size:12px;color:var(--text-muted);">${nextExpiry.docName}
            <span style="color:var(--text-secondary);font-weight:500;margin-left:4px;">···${(nextExpiry.docNumber||'').slice(-4)}</span>
          </div>
          <div style="font-size:12px;font-weight:700;color:${color};">
            ${dl < 0 ? 'EXPIRED' : dl === 0 ? 'Expires today!' : `${dl}d left`}
          </div>
        </div>
        <div class="life-bar-track" style="margin-top:6px;">
          <div class="life-bar-fill" style="width:${Math.max(0,Math.min(100,(dl/365)*100))}%;background:${color};"></div>
        </div>`;
    } else {
      expiryHtml = `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">No documents tracked</div>`;
    }

    return `
      <div class="person-card fade-in" data-member-id="${member.id}" style="cursor:pointer;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;overflow:hidden;
            background:${member.color||'#EEF2FF'};display:flex;align-items:center;
            justify-content:center;font-size:22px;">
            ${hasPhoto ? `<img src="${member.photo}" style="width:100%;height:100%;object-fit:cover;" />` : (member.emoji||'👤')}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:700;color:var(--text);">${member.name}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
              <span class="location-badge ${locBadgeClass}">${locLabel[location]||location}</span>
              ${days !== null ? `<span style="font-size:12px;color:var(--text-muted);">Day ${days}</span>` : ''}
            </div>
            ${effectiveAddr?.address ? `
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                📍 ${effectiveAddr.label || effectiveAddr.address}
              </div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:11px;color:var(--text-muted);font-weight:500;">${year} Qatar</div>
            <div style="font-size:15px;font-weight:700;color:var(--primary);">${yearDays}d</div>
          </div>
        </div>
        ${expiryHtml}
      </div>
    `;
  }

  // ── Share functionality ────────────────────────────────────────────
  function toggleSharePopup() {
    const anchor = document.getElementById('share-popup-anchor');
    if (anchor.querySelector('.share-popup')) {
      anchor.innerHTML = '';
      return;
    }
    anchor.innerHTML = `
      <div class="share-popup slide-in">
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Share Dashboard</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-secondary" id="share-image-btn" style="justify-content:flex-start;gap:10px;">
            <span style="font-size:20px;">🖼️</span>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:600;">Share as image</div>
              <div style="font-size:11px;color:var(--text-muted);">PNG via WhatsApp / share sheet</div>
            </div>
          </button>
          <button class="btn btn-secondary" id="copy-text-btn" style="justify-content:flex-start;gap:10px;">
            <span style="font-size:20px;">📋</span>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:600;">Copy as text</div>
              <div style="font-size:11px;color:var(--text-muted);">WhatsApp-ready format</div>
            </div>
          </button>
        </div>
      </div>
    `;

    document.getElementById('share-image-btn').addEventListener('click', () => {
      anchor.innerHTML = '';
      shareAsImage();
    });
    document.getElementById('copy-text-btn').addEventListener('click', () => {
      anchor.innerHTML = '';
      copyDashboardText();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!anchor.contains(e.target) && e.target.id !== 'share-btn') {
          anchor.innerHTML = '';
        }
      }, { once: true });
    }, 10);
  }

  async function shareAsImage() {
    try {
      // Dynamically load html2canvas from CDN
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      showToast('Capturing dashboard…', 'info', 1500);
      const target = document.getElementById('dashboard-content');
      const canvas = await window.html2canvas(target, {
        backgroundColor: '#F8FAFC',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        const filename = `family-hub-${today()}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        // Show share options sheet
        showImageShareSheet(url, filename, file, blob);
      }, 'image/png');
    } catch (err) {
      showToast('Could not capture image', 'error');
    }
  }

  function showImageShareSheet(url, filename, file, blob) {
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);padding:16px 20px calc(32px + env(safe-area-inset-bottom, 0px));box-shadow:0 -4px 24px rgba(0,0,0,0.2);';
    const preview = '<img src="' + url + '" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px;border:1px solid var(--border);margin-bottom:16px;" />';
    sheet.innerHTML = '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 14px;"></div>' +
      preview +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button id="img-share-btn" class="btn btn-primary btn-full" style="font-size:15px;">📤 Share via apps</button>' +
        '<button id="img-save-btn" class="btn btn-secondary btn-full" style="font-size:15px;">💾 Save to device</button>' +
        '<button id="img-copy-btn" class="btn btn-secondary btn-full" style="font-size:15px;">📋 Copy image</button>' +
      '</div>';

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const close = () => { sheet.remove(); backdrop.remove(); URL.revokeObjectURL(url); };
    backdrop.addEventListener('click', close);

    document.getElementById('img-share-btn').addEventListener('click', async () => {
      const FS          = window.Capacitor?.Plugins?.Filesystem;
      const SharePlugin = window.Capacitor?.Plugins?.Share;
      if (FS && SharePlugin) {
        try {
          showToast('Preparing share…', 'info', 1500);
          const base64 = await _blobToBase64(blob);
          await FS.writeFile({ path: filename, data: base64, directory: 'CACHE' });
          const { uri } = await FS.getUri({ path: filename, directory: 'CACHE' });
          await SharePlugin.share({ title: 'Family Travel Status', files: [uri], dialogTitle: 'Share Dashboard' });
          await FS.deleteFile({ path: filename, directory: 'CACHE' }).catch(() => {});
          close(); return;
        } catch (e) {
          await FS.deleteFile({ path: filename, directory: 'CACHE' }).catch(() => {});
          const msg = String(e?.message || e);
          if (msg.toLowerCase().includes('cancel') || e.name === 'AbortError') { close(); return; }
          // Show actual error so we can diagnose
          showToast('Share error: ' + msg, 'warning', 5000);
          close(); return;
        }
      }
      // No Capacitor — browser download
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      showToast('Saved to Downloads', 'success');
      close();
    });

    document.getElementById('img-save-btn').addEventListener('click', async () => {
      // Save to Documents/share_images/ — root-level public folder, easy to find in Files app
      const FS = window.Capacitor?.Plugins?.Filesystem;
      if (FS) {
        try {
          const base64 = await _blobToBase64(blob);
          // Try public external storage first (requires All Files Access permission)
          // Falls back to app-private DOCUMENTS if permission not granted.
          let saved = false;
          for (const dir of ['EXTERNAL_STORAGE', 'DOCUMENTS']) {
            try {
              await FS.mkdir({ path: 'Documents/share_images', directory: dir, recursive: true }).catch(() => {});
              await FS.writeFile({ path: `Documents/share_images/${filename}`, data: base64, directory: dir });
              const displayPath = dir === 'EXTERNAL_STORAGE'
                ? `/storage/emulated/0/Documents/share_images/${filename}`
                : `Documents/share_images/${filename}`;
              showToast('💾 Saved → ' + displayPath, 'success', 5000);
              saved = true;
              break;
            } catch (_) { /* try next */ }
          }
          if (saved) { close(); return; }
        } catch (e) { /* fall through to web fallback */ }
      }
      // Web / PWA fallback
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      showToast('Image saved to Downloads', 'success');
      close();
    });

    document.getElementById('img-copy-btn').addEventListener('click', async () => {
      try {
        const data = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([data]);
        showToast('Image copied to clipboard!', 'success');
      } catch {
        showToast('Copy not supported — use Save instead', 'warning');
      }
      close();
    });
  }

  async function copyDashboardText() {
    const data = await getCachedTravelData();
    if (!data) return;
    const { members = [], trips = [], documents = [] } = data;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // Fallback passenger list when People tab hasn't been set up
    const fallbackNames = members.length === 0
      ? [...new Set(trips.filter(Boolean).map(t => String(t.passengerName || '').trim()).filter(Boolean))].sort()
      : [];

    let text = `✈️ Family Travel Status — ${dateStr}\n`;
    text += `─────────────────────────────\n`;

    if (members.length > 0) {
      // Full mode — members with docs
      members.forEach(m => {
        const { location, days } = getCurrentLocation(m, trips);
        const locEmoji = location === 'Qatar' ? '🇶🇦' : location === 'India' ? '🇮🇳' : '✈️';
        text += `\n👤 ${m.name}   ${locEmoji} ${location}${days !== null ? ' · Day ' + days : ''}\n`;
        const docs = getPersonDocs(m, documents);
        docs.forEach(d => {
          const daysLeft = daysFromToday(d.expiryDate);
          const icon = d.docName === 'Passport' ? '🛂' : d.docName === 'QID' ? '🪪' : '📄';
          const status = daysLeft < 0 ? '❌ EXPIRED' :
                         daysLeft <= 30 ? `⚠️ ${daysLeft}d left` :
                         `✅ ${daysLeft}d left`;
          text += `   ${icon} ${d.docName}: ${status}\n`;
        });
      });
    } else if (fallbackNames.length > 0) {
      // No People tab — build from trip passenger names
      fallbackNames.forEach(name => {
        const { location, days } = getCurrentLocationFromTrips(name, trips);
        const locEmoji = location === 'Qatar' ? '🇶🇦' : location === 'India' ? '🇮🇳' : '✈️';
        text += `\n👤 ${name}   ${locEmoji} ${location}${days !== null ? ' · Day ' + days : ''}\n`;
      });
    } else {
      text += '\nNo passenger data found.\n';
    }

    text += `─────────────────────────────\n`;
    text += `Shared via Family Hub App`;

    const ok = await copyToClipboard(text);
    if (ok) showToast('Copied to clipboard!', 'success');
    else    showToast('Copy failed — try again', 'error');
  }

  // ── Internal helper ───────────────────────────────────────────────────────────
  function _blobToBase64(blob) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }

  // ── Export current locations as XLSX ─────────────────────────────────────────
  async function exportCurrentLocationsXLSX() {
    try {
      const data = await getCachedTravelData();
      if (!data) { showToast('No data to export', 'warning'); return; }

      const { trips = [], passengers = [] } = data;
      const todayStr = today();
      const allNames = [...new Set(
        trips.filter(Boolean).map(t => String(t.passengerName || '').trim()).filter(Boolean)
      )].sort();

      if (!allNames.length) { showToast('No passenger data found', 'warning'); return; }

      showToast('Preparing export…', 'info', 2000);

      // Load XLSX
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.setAttribute('data-internal', 'xlsx-loader');
          s.src = './js/lib/xlsx.full.min.js';
          s.onload = res;
          s.onerror = () => {
            const s2 = document.createElement('script');
            s2.setAttribute('data-internal', 'xlsx-loader');
            s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s2.onload = res; s2.onerror = rej;
            document.head.appendChild(s2);
          };
          document.head.appendChild(s);
        });
      }

      // Build rows
      const rows = allNames.map(name => {
        const { location, days } = getCurrentLocationFromTrips(name, trips);
        const nameLower = name.toLowerCase();
        const personTrips = trips.filter(t =>
          String(t.passengerName || '').toLowerCase() === nameLower ||
          (t._resolvedCompanionNames || []).map(n => n.toLowerCase()).includes(nameLower)
        ).sort((a, b) => new Date(b.dateArrivedDest || 0) - new Date(a.dateArrivedDest || 0));
        const entryDate = personTrips[0]?.dateArrivedDest || personTrips[0]?.dateLeftOrigin || '';
        return {
          'Passenger Name': name,
          'Current Country': location || 'Unknown',
          'Entry Date': entryDate,
          'Days in Country': days !== null ? days : ''
        };
      });

      const ws = window.XLSX.utils.json_to_sheet(rows);
      // Column widths
      ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Current Locations');

      // Save via Capacitor Filesystem
      const { saveXLSXToExports } = await import('../../shared/drive.js');
      const savedPath = await saveXLSXToExports('travel', wb, `CurrentLocations_${todayStr}`);
      showToast(`✅ Saved: ${savedPath}`, 'success', 4000);
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  }
}
