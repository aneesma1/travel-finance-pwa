// ─── app-a-family-hub/js/screens/documents.js ───────────────────────────────
// Document Tracker: cards grouped by person, life bars, expiry badges

'use strict';

import { getCachedTravelData } from '../../shared/db.js';
import { navigate } from '../router.js';
import {
  daysFromToday, formatDisplayDate,
  expiryStatus, expiryStatusColor, expiryLifePercent
} from '../../shared/utils.js';

export async function renderDocuments(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">🪪 Documents</span>
    </div>
    <div id="docs-content" style="padding-bottom:20px;"></div>
    <button class="fab" id="add-doc-fab">＋</button>
  `;

  document.getElementById('add-doc-fab').addEventListener('click', () => navigate('add-document'));

  const data = await getCachedTravelData();
  if (!data) { renderEmpty(document.getElementById('docs-content')); return; }

  const { members = [], documents = [] } = data;
  renderDocCards(document.getElementById('docs-content'), members, documents);
}

function renderDocCards(container, members, documents) {
  if (!members.length) {
    renderEmpty(container);
    return;
  }

  // Sort: most urgent first (expired, then danger, then warning, then valid)
  const statusOrder = { expired: 0, danger: 1, warning: 2, valid: 3, unknown: 4 };

  container.innerHTML = members.map(member => {
    const memberDocs = documents
      .filter(d => d.personId === member.id)
      .sort((a, b) => {
        const sa = expiryStatus(a.expiryDate);
        const sb = expiryStatus(b.expiryDate);
        return (statusOrder[sa] ?? 5) - (statusOrder[sb] ?? 5);
      });

    return `
      <div style="padding:0 0 4px;">
        <div class="section-title" style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:18px;">${member.emoji || '👤'}</span>
          ${member.name}
          ${memberDocs.some(d => expiryStatus(d.expiryDate) === 'danger' || expiryStatus(d.expiryDate) === 'expired')
            ? `<span style="background:var(--danger);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;letter-spacing:0.3px;">!</span>` : ''}
        </div>
        <div style="padding:0 16px;">
          ${memberDocs.length === 0
            ? `<div style="font-size:13px;color:var(--text-muted);padding:12px 4px;">No documents added yet</div>`
            : memberDocs.map(doc => renderDocCard(doc)).join('')
          }
          <button class="btn btn-secondary" style="width:100%;margin-top:6px;font-size:13px;padding:10px;"
            data-member-id="${member.id}" onclick="">
            + Add Document for ${member.name}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Bind add buttons
  container.querySelectorAll('button[data-member-id]').forEach(btn => {
    btn.addEventListener('click', () => navigate('add-document', { personId: btn.dataset.memberId }));
  });

  // Bind doc card taps for editing
  container.querySelectorAll('.doc-card[data-doc-id]').forEach(card => {
    card.addEventListener('click', () => navigate('add-document', { docId: card.dataset.docId, mode: 'edit' }));
  });
}

function renderDocCard(doc) {
  const status   = expiryStatus(doc.expiryDate);
  const color    = expiryStatusColor(status);
  const daysLeft = daysFromToday(doc.expiryDate);
  const pct      = Math.max(0, Math.min(100, daysLeft !== null ? Math.round((daysLeft / 365) * 100) : 0));
  const maskedNum = doc.docNumber
    ? doc.docNumber.length > 4
      ? '···' + doc.docNumber.slice(-4)
      : doc.docNumber
    : '—';

  const statusLabels = {
    expired: 'EXPIRED',
    danger:  daysLeft === 0 ? 'EXPIRES TODAY' : `${daysLeft}d left`,
    warning: `${daysLeft}d left`,
    valid:   `${daysLeft}d left`,
    unknown: '—'
  };

  const docIcons = {
    'Passport': '🛂',
    'QID': '🪪',
    'Visa': '🔏',
    'Driving Licence': '🚗',
    'Other': '📄'
  };

  const alertIcons = (doc.alertDays || []).map(d => {
    const labels = { 90: '90d', 60: '60d', 30: '30d' };
    return `<span style="background:var(--surface-3);color:var(--text-muted);font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;">${labels[d] || d}</span>`;
  }).join('');

  return `
    <div class="doc-card status-${status}" data-doc-id="${doc.id}" style="cursor:pointer;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">${docIcons[doc.docName] || '📄'}</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${doc.docName}</div>
            <div style="font-size:12px;color:var(--text-muted);font-family:monospace;">${maskedNum}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:700;color:${color};">${statusLabels[status]}</div>
          <div style="font-size:11px;color:var(--text-muted);">${formatDisplayDate(doc.expiryDate)}</div>
        </div>
      </div>

      <div class="life-bar-track">
        <div class="life-bar-fill" style="width:${pct}%;background:${color};"></div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <div style="display:flex;gap:4px;">${alertIcons}</div>
        <div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${doc.calSynced ? 'var(--success)' : 'var(--text-muted)'};">
          ${doc.calSynced ? '📅 Synced' : '📅 Not synced'}
        </div>
      </div>
    </div>
  `;
}

function renderEmpty(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🪪</div>
      <div class="empty-state-title">No documents yet</div>
      <div class="empty-state-text">Track passport, QID, and visa expiry dates with calendar alerts</div>
    </div>`;
}
