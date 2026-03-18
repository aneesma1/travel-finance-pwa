// v2.1 — 2026-03-18
// ─── app-a-family-hub/js/screens/dashboard.js ───────────────────────────────
// Family Hub Dashboard
// Shows: live status per member, days in location, next doc expiry, filter bar

'use strict';

import { getCachedTravelData } from '../../../shared/db.js';
import { navigate } from '../router.js';
import {
  formatDisplayDate, daysFromToday, daysBetween,
  expiryStatus, expiryStatusColor, today,
  getHashParams, setHashParams, clearHashParams,
  showToast, copyToClipboard
} from '../../../shared/utils.js';
import { buildFamilyGroups, getMemberRelations } from '../relation-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentLocation(person, trips) {
  // Find the most recent trip for this person
  const personTrips = trips
    .filter(t => t.personId === person.id)
    .sort((a, b) => new Date(b.dateOutIndia) - new Date(a.dateOutIndia));

  if (!personTrips.length) return { location: 'India', days: null, tripId: null };

  const latest = personTrips[0];
  const todayStr = today();

  // Still in Qatar: arrived but not yet left
  if (latest.dateInQatar && !latest.dateOutQatar) {
    const days = daysBetween(latest.dateInQatar, todayStr);
    return { location: 'Qatar', days, tripId: latest.id };
  }

  // Returned from Qatar: dateInIndia exists
  if (latest.dateInIndia) {
    const days = daysBetween(latest.dateInIndia, todayStr);
    return { location: 'India', days, tripId: latest.id };
  }

  // Left India but not yet arrived in Qatar
  if (latest.dateOutIndia && !latest.dateInQatar) {
    return { location: 'In transit', days: null, tripId: latest.id };
  }

  // Left Qatar but not arrived back in India
  if (latest.dateOutQatar && !latest.dateInIndia) {
    return { location: 'In transit', days: null, tripId: latest.id };
  }

  return { location: 'India', days: null, tripId: null };
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

function getYearlyQatarDays(personId, trips, year) {
  return trips
    .filter(t => t.personId === personId && t.daysInQatar)
    .filter(t => {
      const y = t.dateInQatar ? new Date(t.dateInQatar).getFullYear() : null;
      return y === year;
    })
    .reduce((sum, t) => sum + (t.daysInQatar || 0), 0);
}

// ── Render ────────────────────────────────────────────────────────────────────

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">✈️ Family Hub</span>
      <div style="display:flex;gap:8px;">
        <button class="app-header-action" id="share-btn" title="Share dashboard">⬆️</button>
        <button class="app-header-action" id="refresh-btn" title="Refresh">🔄</button>
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

  document.getElementById('refresh-btn').addEventListener('click', () => renderDashboard(container));
  document.getElementById('share-btn').addEventListener('click', () => toggleSharePopup());

  await loadAndRender();

  async function loadAndRender() {
    const data = await getCachedTravelData();
    if (!data) {
      document.getElementById('dashboard-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No data yet</div>
          <div class="empty-state-text">Sign in to load your family data</div>
        </div>`;
      return;
    }

    const { members = [], trips = [], documents = [] } = data;

    // Read filter state from URL hash
    const params = getHashParams();
    const filterPerson   = params.person   ? params.person.split(',')   : [];
    const filterLocation = params.location || 'all';
    const filterDocStatus= params.docstatus || 'all';

    renderFilterBar(members, filterPerson, filterLocation, filterDocStatus);
    renderMemberCards(members, trips, documents, filterPerson, filterLocation, filterDocStatus);
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
          ${members.map(m => {
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

  function renderMemberCards(members, trips, documents, filterPerson, filterLocation, filterDocStatus) {
    const content = document.getElementById('dashboard-content');
    const year = new Date().getFullYear();
    const { familyRelations = [], familyDefaults = {} } = window._travelData || {};

    if (!members.length) {
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
    const { location, days } = getCurrentLocation(member, trips);
    const memberDocs = documents.filter(d => d.personId === member.id);
    const nextExpiry = getNextExpiry(memberDocs);
    const yearDays   = getYearlyQatarDays(member.id, trips, year);

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
        const file = new File([blob], `family-hub-${today()}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Family Travel Status' });
        } else {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href    = url;
          a.download = `family-hub-${today()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Image downloaded', 'success');
        }
      }, 'image/png');
    } catch (err) {
      showToast('Could not capture image', 'error');
    }
  }

  async function copyDashboardText() {
    const data = await getCachedTravelData();
    if (!data) return;
    const { members = [], trips = [], documents = [] } = data;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    let text = `✈️ Family Travel Status — ${dateStr}\n`;
    text += `─────────────────────────────\n`;

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

    text += `─────────────────────────────\n`;
    text += `Shared via Family Hub App`;

    const ok = await copyToClipboard(text);
    if (ok) showToast('Copied to clipboard!', 'success');
    else    showToast('Copy failed — try again', 'error');
  }
}
