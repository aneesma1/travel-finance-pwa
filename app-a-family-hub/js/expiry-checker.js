// v3.2 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── app-a-family-hub/js/expiry-checker.js ──────────────────────────────────
// Expiry alert system
// Runs on every app load:
//   1. Checks all documents for upcoming expiry
//   2. Surfaces in-app alerts for docs expiring within 90 days
//   3. Creates missed Google Calendar events for alert days = today
//   4. Triggers browser Notification API if permission granted

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../shared/db.js';
import { writeData } from '../../shared/drive.js';
import { syncDocumentAlerts } from './calendar.js';
import { daysFromToday, expiryStatus, showToast, isOnline } from '../../shared/utils.js';

const CHECKED_KEY = 'expiry_last_checked'; // localStorage — avoid re-alerting same day

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runExpiryCheck() {
  const today = new Date().toISOString().split('T')[0];
  const lastChecked = localStorage.getItem(CHECKED_KEY);

  // Only run once per day per session
  if (lastChecked === today) return;

  const data = await getCachedTravelData();
  if (!data) return;

  const { members = [], documents = [] } = data;
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  const urgent = []; // docs expiring within 30 days
  const calSyncNeeded = []; // docs where calendar events need creating

  for (const doc of documents) {
    if (!doc.expiryDate) continue;
    const daysLeft = daysFromToday(doc.expiryDate);
    const status   = expiryStatus(doc.expiryDate);
    const member   = memberMap[doc.personId];
    if (!member) continue;

    // Collect urgent docs for in-app alert
    if (status === 'danger' || status === 'expired') {
      urgent.push({ doc, member, daysLeft });
    }

    // Check if calendar sync needed for any alert day
    if (doc.calSynced && isOnline()) {
      const missingAlerts = (doc.alertDays || []).filter(days => {
        // Alert day is today or in the past but no event created yet
        const alertDaysLeft = daysLeft - days;
        return alertDaysLeft <= 0 && !doc.calEventIds?.[days];
      });

      if (missingAlerts.length > 0) {
        calSyncNeeded.push({ doc, member, missingAlerts });
      }
    }
  }

  // ── In-app notifications ──────────────────────────────────────────────────
  if (urgent.length > 0) {
    requestBrowserNotificationPermission(urgent, memberMap);
    showExpiryBanner(urgent);
  }

  // ── Fill missing calendar events (non-blocking) ────────────────────────────
  if (calSyncNeeded.length > 0 && isOnline()) {
    fillMissingCalendarEvents(calSyncNeeded, data);
  }

  localStorage.setItem(CHECKED_KEY, today);
}

// ── Show in-app sticky banner ─────────────────────────────────────────────────
function showExpiryBanner(urgent) {
  const existing = document.getElementById('expiry-alert-banner');
  if (existing) return; // already showing

  const count = urgent.length;
  const first = urgent[0];
  const label = first.daysLeft < 0
    ? `${first.member.name}'s ${first.doc.docName} has EXPIRED`
    : `${first.member.name}'s ${first.doc.docName} expires in ${first.daysLeft} days`;

  const banner = document.createElement('div');
  banner.id = 'expiry-alert-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 480px; z-index: 300;
    background: #B91C1C; color: #fff;
    padding: 10px 16px; display: flex; align-items: center; gap: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    animation: slideDown 0.3s ease;
  `;
  banner.innerHTML = `
    <style>
      @keyframes slideDown { from { transform: translateX(-50%) translateY(-100%); } to { transform: translateX(-50%) translateY(0); } }
    </style>
    <span style="font-size:18px;flex-shrink:0;">🚨</span>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:700;">${label}</div>
      ${count > 1 ? `<div style="font-size:11px;opacity:0.85;">+${count - 1} more document${count > 2 ? 's' : ''} need attention</div>` : ''}
    </div>
    <button id="expiry-banner-view" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;">View</button>
    <button id="expiry-banner-close" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:20px;cursor:pointer;padding:0 4px;flex-shrink:0;">×</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('expiry-banner-view').addEventListener('click', () => {
    banner.remove();
    // Navigate to documents — import navigate dynamically to avoid circular dep
    import('./router.js').then(m => m.navigate('documents'));
  });

  document.getElementById('expiry-banner-close').addEventListener('click', () => banner.remove());

  // Auto-dismiss after 12 seconds
  setTimeout(() => banner?.remove(), 12000);
}

// ── Browser Notification API ──────────────────────────────────────────────────
async function requestBrowserNotificationPermission(urgent, memberMap) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  // Fire one notification per urgent doc
  urgent.slice(0, 3).forEach(({ doc, member, daysLeft }) => {
    const title = daysLeft < 0
      ? `⚠️ ${doc.docName} EXPIRED — ${member.name}`
      : `🛂 ${doc.docName} expiring soon — ${member.name}`;
    const body = daysLeft < 0
      ? `${member.name}'s ${doc.docName} expired on ${doc.expiryDate}. Please renew immediately.`
      : `${member.name}'s ${doc.docName} expires in ${daysLeft} days (${doc.expiryDate}).`;

    try {
      new Notification(title, {
        body,
        icon: '../icons/icon-192.png',
        badge: '../icons/icon-192.png',
        tag: `expiry-${doc.id}`,
        requireInteraction: daysLeft < 0
      });
    } catch { /* Notification failed silently */ }
  });
}

// ── Fill missing calendar events ──────────────────────────────────────────────
async function fillMissingCalendarEvents(needed, data) {
  let updated = false;

  for (const { doc, member, missingAlerts } of needed) {
    try {
      const newEventIds = await syncDocumentAlerts(
        { ...doc, alertDays: missingAlerts },
        member.name
      );

      // Merge new event IDs back into the doc
      const merged = { ...doc.calEventIds, ...newEventIds };

      // Update in Drive (non-blocking)
      const newData = await writeData('travel', (remote) => {
        const docs = remote.documents || [];
        const idx  = docs.findIndex(d => d.id === doc.id);
        if (idx > -1) docs[idx] = { ...docs[idx], calEventIds: merged };
        return { ...remote, documents: docs };
      });
      await setCachedTravelData(newData);
      updated = true;
    } catch { /* calendar sync failures are silent */ }
  }

  if (updated) {
    console.log('[ExpiryChecker] Calendar events created for missed alerts');
  }
}

// ── Get expiry summary (used by dashboard) ─────────────────────────────────────
export function getExpirySummary(documents) {
  const today = new Date();
  const summary = { expired: [], danger: [], warning: [], total: 0 };

  documents.forEach(doc => {
    if (!doc.expiryDate) return;
    const status = expiryStatus(doc.expiryDate);
    if (status === 'expired') summary.expired.push(doc);
    else if (status === 'danger')  summary.danger.push(doc);
    else if (status === 'warning') summary.warning.push(doc);
    summary.total++;
  });

  return summary;
}

// ── Format expiry message for display ─────────────────────────────────────────
export function formatExpiryMessage(doc, memberName) {
  const days = daysFromToday(doc.expiryDate);
  if (days === null) return '';
  if (days < 0) return `${memberName}'s ${doc.docName} EXPIRED ${Math.abs(days)} days ago`;
  if (days === 0) return `${memberName}'s ${doc.docName} expires TODAY`;
  if (days <= 30) return `${memberName}'s ${doc.docName} expires in ${days} days`;
  if (days <= 90) return `${memberName}'s ${doc.docName} expires in ${days} days`;
  return `${memberName}'s ${doc.docName} valid for ${days} more days`;
}
