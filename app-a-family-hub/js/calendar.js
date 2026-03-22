// v3.3.2 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── app-a-family-hub/js/calendar.js ────────────────────────────────────────
// Google Calendar API wrapper
// Handles: create / update / delete expiry alert events
// Called from add-document.js and the expiry checker

'use strict';

import { authFetch } from '../../shared/auth.js';
import { CLIENT_ID } from './auth-config.js';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// ── Create a single alert event ───────────────────────────────────────────────
export async function createAlertEvent(doc, memberName, daysBeforeExpiry) {
  const alertDate = calcAlertDate(doc.expiryDate, daysBeforeExpiry);
  const body = buildEventBody(doc, memberName, daysBeforeExpiry, alertDate);

  const res = await authFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, CLIENT_ID);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Calendar create failed: ${res.status}`);
  }
  const event = await res.json();
  return event.id;
}

// ── Update an existing alert event ───────────────────────────────────────────
export async function updateAlertEvent(eventId, doc, memberName, daysBeforeExpiry) {
  const alertDate = calcAlertDate(doc.expiryDate, daysBeforeExpiry);
  const body = buildEventBody(doc, memberName, daysBeforeExpiry, alertDate);

  const res = await authFetch(`${BASE}/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, CLIENT_ID);

  if (res.status === 404) {
    // Event was deleted externally -- create fresh
    return createAlertEvent(doc, memberName, daysBeforeExpiry);
  }
  if (!res.ok) throw new Error(`Calendar update failed: ${res.status}`);
  const event = await res.json();
  return event.id;
}

// ── Delete one event ──────────────────────────────────────────────────────────
export async function deleteAlertEvent(eventId) {
  const res = await authFetch(`${BASE}/${eventId}`, {
    method: 'DELETE'
  }, CLIENT_ID);
  // 404 = already gone, that's fine
  if (!res.ok && res.status !== 404) {
    throw new Error(`Calendar delete failed: ${res.status}`);
  }
}

// ── Sync all alert days for one document ─────────────────────────────────────
// Returns updated calEventIds map: { 90: 'event_id', 60: 'event_id', 30: 'event_id' }
export async function syncDocumentAlerts(doc, memberName) {
  if (!doc.calSynced || !doc.expiryDate) return {};

  const newEventIds = { ...(doc.calEventIds || {}) };
  const errors = [];

  for (const days of (doc.alertDays || [])) {
    try {
      const existingId = newEventIds[days];
      if (existingId) {
        newEventIds[days] = await updateAlertEvent(existingId, doc, memberName, days);
      } else {
        newEventIds[days] = await createAlertEvent(doc, memberName, days);
      }
    } catch (err) {
      errors.push(`${days}d alert: ${err.message}`);
    }
  }

  // Delete events for alert days that were toggled OFF
  const allDays = [90, 60, 30];
  for (const days of allDays) {
    if (!doc.alertDays.includes(days) && newEventIds[days]) {
      try {
        await deleteAlertEvent(newEventIds[days]);
        delete newEventIds[days];
      } catch { /* silent */ }
    }
  }

  if (errors.length) {
    console.warn('Some calendar events failed:', errors);
  }

  return newEventIds;
}

// ── Delete all events for a document ─────────────────────────────────────────
export async function deleteAllDocumentAlerts(doc) {
  const ids = Object.values(doc.calEventIds || {}).filter(Boolean);
  await Promise.allSettled(ids.map(id => deleteAlertEvent(id)));
}

// ── Check for documents expiring soon and send alerts ────────────────────────
// Called on app load -- creates calendar events for newly expiring docs
export async function runExpiryCheck(data) {
  if (!data) return;
  const { members = [], documents = [] } = data;
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
  const results = [];

  for (const doc of documents) {
    if (!doc.calSynced || !doc.expiryDate || !doc.alertDays?.length) continue;
    const member = memberMap[doc.personId];
    if (!member) continue;

    // Check if any alert day is TODAY (create immediate notification)
    const today = new Date().toISOString().split('T')[0];
    for (const days of doc.alertDays) {
      const alertDate = calcAlertDate(doc.expiryDate, days);
      if (alertDate === today && !doc.calEventIds?.[days]) {
        try {
          const eventId = await createAlertEvent(doc, member.name, days);
          results.push({ docId: doc.id, days, eventId, action: 'created' });
        } catch { /* non-blocking */ }
      }
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAlertDate(expiryDate, daysBeforeExpiry) {
  const expiry = new Date(expiryDate + 'T00:00:00');
  expiry.setDate(expiry.getDate() - daysBeforeExpiry);
  return expiry.toISOString().split('T')[0];
}

function buildEventBody(doc, memberName, daysBeforeExpiry, alertDate) {
  const docIcons = {
    'Passport': '🛂', 'QID': '🪪', 'Visa': '🔏',
    'Driving Licence': '🚗', 'Other': '📄'
  };
  const icon = docIcons[doc.docName] || '📄';

  return {
    summary: `${icon} ${memberName} -- ${doc.docName} expires in ${daysBeforeExpiry} days`,
    description: [
      `Document: ${doc.docName}`,
      `Number: ${doc.docNumber || '--'}`,
      `Expiry Date: ${doc.expiryDate}`,
      `Person: ${memberName}`,
      `Alert: ${daysBeforeExpiry} days before expiry`,
      '',
      'Created by Family Hub App'
    ].join('\n'),
    start:       { date: alertDate },
    end:         { date: alertDate },
    colorId:     daysBeforeExpiry <= 30 ? '11' : daysBeforeExpiry <= 60 ? '5' : '2', // red/yellow/green
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 480  },  // 8 AM same day
        { method: 'popup', minutes: 1440 },  // Day before
      ]
    }
  };
}
