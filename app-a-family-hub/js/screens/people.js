// v3.2 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── app-a-family-hub/js/screens/people.js ──────────────────────────────────
// People tab — grouped family view, Family Defaults button, member cards

'use strict';

import { getCachedTravelData } from '../../../shared/db.js';
import { navigate } from '../router.js';
import { daysFromToday, expiryStatus, expiryStatusColor, today, showToast } from '../../../shared/utils.js';
import { buildFamilyGroups, getMemberRelations } from '../relation-engine.js';

export async function renderPeople(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">👥 People</span>
      <div style="display:flex;gap:8px;">
        <button class="app-header-action" id="export-pdf-btn" title="Export contact cards">📄</button>
        <button class="app-header-action" id="refresh-btn">🔄</button>
      </div>
    </div>
    <div id="people-content" style="padding:16px;display:flex;flex-direction:column;gap:12px;padding-bottom:80px;">
      <div style="display:flex;justify-content:center;padding:40px 0;"><div class="spinner"></div></div>
    </div>
    <button class="fab" id="add-person-fab" title="Add person">＋</button>
  `;

  document.getElementById('add-person-fab').addEventListener('click', () => navigate('person-profile', { mode: 'new' }));
  document.getElementById('refresh-btn').addEventListener('click', () => renderPeople(container));
  document.getElementById('export-pdf-btn').addEventListener('click', () => openPdfExportModal(container));

  const data = await getCachedTravelData();
  if (!data) { document.getElementById('people-content').innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">No data</div></div>`; return; }

  const { members = [], trips = [], documents = [], familyRelations = [], familyDefaults = {} } = data;
  const content = document.getElementById('people-content');

  // ── Family Defaults banner ─────────────────────────────────────────────────
  const hasDefaults = !!(familyDefaults.homeQatar?.address || familyDefaults.homeIndia?.address || familyDefaults.emergencyContacts?.length || familyRelations.length);
  content.innerHTML = `
    <!-- Family button -->
    <button id="family-defaults-btn" style="
      display:flex;align-items:center;gap:12px;padding:14px 16px;
      background:var(--surface);border-radius:var(--radius-lg);border:1.5px solid var(--primary-border);
      cursor:pointer;width:100%;text-align:left;font-family:inherit;transition:all 0.15s;
    ">
      <div style="width:44px;height:44px;border-radius:12px;background:var(--primary-bg);
        display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🏠</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:var(--primary);">Family Defaults</div>
        <div style="font-size:12px;color:var(--text-muted);">
          ${hasDefaults
            ? `Shared addresses, ${familyRelations.length} relationship${familyRelations.length!==1?'s':''}, ${(familyDefaults.emergencyContacts||[]).length} shared contact${(familyDefaults.emergencyContacts||[]).length!==1?'s':''}`
            : 'Set shared addresses, contacts & family tree'}
        </div>
      </div>
      <span style="font-size:18px;color:var(--primary);">›</span>
    </button>

    <div id="members-area"></div>
  `;

  document.getElementById('family-defaults-btn').addEventListener('click', () => navigate('family-defaults'));

  if (!members.length) {
    document.getElementById('members-area').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">No family members yet</div>
        <div class="empty-state-text">Tap + to add the first family member profile</div>
      </div>`;
    return;
  }

  // ── Grouped family view ────────────────────────────────────────────────────
  const groups = buildFamilyGroups(members, familyRelations);
  const membersArea = document.getElementById('members-area');

  groups.forEach(group => {
    const groupEl = document.createElement('div');

    if (group.members.length > 1) {
      // Group header
      const groupTypeIcon = { 'family-unit':'👨‍👩‍👧‍👦', 'couple':'💑', 'siblings':'👫', 'solo':'👤' };
      groupEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 4px 8px;">
          <span style="font-size:16px;">${groupTypeIcon[group.type] || '👥'}</span>
          <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
            ${group.label}
          </span>
          <div style="flex:1;height:1px;background:var(--border);"></div>
        </div>
        <div class="group-cards" style="display:flex;flex-direction:column;gap:8px;
          padding-left:12px;border-left:2px solid var(--primary-border);">
        </div>
      `;
      const cardsContainer = groupEl.querySelector('.group-cards');
      group.members.forEach(member => {
        const card = document.createElement('div');
        card.innerHTML = buildMemberCard(member, trips, documents, familyRelations, familyDefaults);
        cardsContainer.appendChild(card.firstElementChild);
      });
    } else {
      // Solo member — no group wrapper
      const card = document.createElement('div');
      card.innerHTML = buildMemberCard(group.members[0], trips, documents, familyRelations, familyDefaults);
      groupEl.appendChild(card.firstElementChild);
    }

    membersArea.appendChild(groupEl);
  });

  // Tap to open profile
  membersArea.querySelectorAll('.member-card[data-id]').forEach(card => {
    card.addEventListener('click', () => navigate('person-profile', { memberId: card.dataset.id, mode: 'view' }));
  });
}

function buildMemberCard(member, trips, documents, relations, familyDefaults) {
  const memberTrips = trips.filter(t => t.personId === member.id)
    .sort((a,b) => new Date(b.dateOutIndia) - new Date(a.dateOutIndia));
  const latest = memberTrips[0];
  let location = 'India', locationColor = '#FEE2E2', locationTextColor = '#991B1B';
  if (latest?.dateInQatar && !latest?.dateOutQatar) {
    location = 'Qatar'; locationColor = '#FEF9C3'; locationTextColor = '#854D0E';
  }

  const memberDocs = documents.filter(d => d.personId === member.id);
  const urgentDocs = memberDocs.filter(d => ['danger','expired'].includes(expiryStatus(d.expiryDate)));
  const nextExpiry = memberDocs
    .map(d => ({ ...d, daysLeft: daysFromToday(d.expiryDate) }))
    .filter(d => d.daysLeft !== null && d.daysLeft >= 0)
    .sort((a,b) => a.daysLeft - b.daysLeft)[0];

  // Relations label
  const myRels = getMemberRelations(relations, member.id);
  const relLabel = myRels.slice(0,2).map(r => {
    // We don't have members array here so just show relation
    return r.relation;
  }).join(' · ');

  // Resolve effective address (override > family default)
  const effectiveQatar = member.homeQatarOverride || familyDefaults?.homeQatar;
  const effectiveIndia = member.homeIndiaOverride  || familyDefaults?.homeIndia;

  // Personal + family contacts count
  const personalContacts = (member.personalEmergencyContacts || []).length;
  const familyContacts   = (familyDefaults?.emergencyContacts || []).length;
  const totalContacts    = personalContacts + familyContacts;

  const hasPhoto = member.photo?.startsWith('data:');

  return `
    <div class="member-card card fade-in" data-id="${member.id}" style="cursor:pointer;padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;">
        <!-- Avatar -->
        <div style="width:56px;height:56px;border-radius:50%;flex-shrink:0;overflow:hidden;
          background:${member.color || '#EEF2FF'};
          display:flex;align-items:center;justify-content:center;font-size:26px;
          border:2px solid var(--border);">
          ${hasPhoto ? `<img src="${member.photo}" style="width:100%;height:100%;object-fit:cover;" />` : (member.emoji || '👤')}
        </div>

        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:16px;font-weight:700;color:var(--text);">${member.name}</span>
            ${member.headOfHousehold ? '<span title="Head of Household" style="font-size:14px;">👑</span>' : ''}
            <span style="background:${locationColor};color:${locationTextColor};
              padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">
              ${location === 'Qatar' ? '🇶🇦' : '🇮🇳'} ${location}
            </span>
            ${urgentDocs.length > 0 ? `<span style="background:var(--danger-bg);color:var(--danger);
              padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700;">⚠️ ${urgentDocs.length}</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
            ${member.bloodGroup ? `<span style="font-size:11px;color:var(--danger);font-weight:700;
              background:var(--danger-bg);padding:2px 7px;border-radius:6px;">🩸 ${member.bloodGroup}</span>` : ''}
            ${member.occupation ? `<span style="font-size:11px;color:var(--text-muted);">💼 ${member.occupation}</span>` : ''}
          </div>
          ${nextExpiry ? `
            <div style="font-size:11px;color:${expiryStatusColor(expiryStatus(nextExpiry.expiryDate))};margin-top:3px;font-weight:600;">
              ${nextExpiry.docName}: ${nextExpiry.daysLeft}d left
            </div>` : ''}
          ${relLabel ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;">${relLabel}</div>` : ''}
        </div>

        <div style="text-align:center;flex-shrink:0;">
          <div style="font-size:16px;font-weight:700;color:var(--primary);">${totalContacts}</div>
          <div style="font-size:10px;color:var(--text-muted);">Contacts</div>
        </div>
        <span style="color:var(--text-muted);font-size:16px;">›</span>
      </div>

      <!-- Address strip -->
      ${(effectiveQatar?.address || effectiveIndia?.address) ? `
        <div style="background:var(--surface-3);padding:7px 16px;border-top:1px solid var(--border-light);
          display:flex;gap:12px;overflow:hidden;">
          ${effectiveQatar?.address ? `
            <div style="flex:1;min-width:0;">
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:1px;">
                🇶🇦 Qatar ${member.homeQatarOverride ? '(custom)' : '(family)'}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${effectiveQatar.label || effectiveQatar.address}
              </div>
            </div>` : ''}
          ${effectiveIndia?.address ? `
            <div style="flex:1;min-width:0;">
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:1px;">
                🇮🇳 India ${member.homeIndiaOverride ? '(custom)' : '(family)'}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${effectiveIndia.label || effectiveIndia.address}
              </div>
            </div>` : ''}
        </div>` : ''}
    </div>
  `;
}


async function openPdfExportModal(container) {
  const data = await getCachedTravelData();
  if (!data?.members?.length) { showToast('No members to export', 'warning'); return; }

  const { members, documents = [] } = data;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'pdf-export-modal';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:88vh;">
      <div class="modal-handle"></div>
      <div style="padding:0 20px 24px;">
        <div style="font-size:17px;font-weight:700;margin-bottom:4px;">Export Contact Cards</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
          Each person gets one A5 page with full profile, locations, emergency contacts & documents.
        </div>

        <!-- Select all -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light);margin-bottom:8px;">
          <input type="checkbox" id="select-all-members" style="width:18px;height:18px;cursor:pointer;" />
          <label for="select-all-members" style="font-size:14px;font-weight:600;cursor:pointer;">Select All</label>
          <span id="selected-count" style="margin-left:auto;font-size:13px;color:var(--primary);font-weight:600;"></span>
        </div>

        <!-- Member list -->
        <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;" id="member-select-list">
          ${members.map(m => {
            const hasPhoto = m.photo?.startsWith('data:');
            const docCount = documents.filter(d => d.personId === m.id).length;
            return `
              <label style="display:flex;align-items:center;gap:12px;padding:10px 12px;
                border-radius:var(--radius-md);border:1px solid var(--border);cursor:pointer;
                transition:background 0.1s;" class="member-select-row">
                <input type="checkbox" class="member-checkbox" data-id="${m.id}"
                  style="width:18px;height:18px;cursor:pointer;flex-shrink:0;" />
                <div style="width:36px;height:36px;border-radius:50%;
                  background:${m.color || '#EEF2FF'};display:flex;align-items:center;
                  justify-content:center;font-size:18px;flex-shrink:0;overflow:hidden;">
                  ${hasPhoto ? `<img src="${m.photo}" style="width:100%;height:100%;object-fit:cover;" />` : (m.emoji || '👤')}
                </div>
                <div style="flex:1;">
                  <div style="font-size:14px;font-weight:600;">${m.name}</div>
                  <div style="font-size:11px;color:var(--text-muted);">
                    ${m.bloodGroup ? m.bloodGroup + ' · ' : ''}${docCount} doc${docCount !== 1 ? 's' : ''}
                    ${(m.emergencyContacts||[]).length ? ' · ' + (m.emergencyContacts||[]).length + ' contacts' : ''}
                  </div>
                </div>
              </label>`;
          }).join('')}
        </div>

        <div id="export-error" style="color:var(--danger);font-size:13px;margin-top:10px;min-height:16px;"></div>

        <div style="display:flex;gap:10px;margin-top:16px;">
          <button class="btn btn-secondary" style="flex:1;" id="close-export-modal">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" id="generate-pdf-btn">
            📄 Generate PDF
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Select all toggle
  const selectAll = modal.querySelector('#select-all-members');
  const checkboxes = modal.querySelectorAll('.member-checkbox');
  const countEl = modal.querySelector('#selected-count');

  function updateCount() {
    const checked = modal.querySelectorAll('.member-checkbox:checked').length;
    countEl.textContent = checked ? `${checked} selected` : '';
    selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
    selectAll.checked = checked === checkboxes.length;
  }

  selectAll.addEventListener('change', () => {
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateCount();
  });
  checkboxes.forEach(cb => cb.addEventListener('change', updateCount));

  modal.querySelector('#close-export-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#generate-pdf-btn').addEventListener('click', async () => {
    const selectedIds = [...modal.querySelectorAll('.member-checkbox:checked')].map(cb => cb.dataset.id);
    if (!selectedIds.length) {
      modal.querySelector('#export-error').textContent = 'Please select at least one person';
      return;
    }
    const btn = modal.querySelector('#generate-pdf-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';

    try {
      const selectedMembers = members.filter(m => selectedIds.includes(m.id));
      await generateContactCardsPDF(selectedMembers, documents);
      modal.remove();
    } catch (err) {
      modal.querySelector('#export-error').textContent = 'Export failed: ' + err.message;
      btn.disabled = false;
      btn.textContent = '📄 Generate PDF';
    }
  });
}

// ── PDF Generation ────────────────────────────────────────────────────────────
async function generateContactCardsPDF(members, documents) {
  // Load jsPDF from CDN
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load PDF library'));
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  // A5 dimensions: 148mm × 210mm
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const W = 148, H = 210;
  const margin = 10;
  const contentW = W - margin * 2;

  members.forEach((member, idx) => {
    if (idx > 0) doc.addPage('a5', 'portrait');
    const memberDocs = documents.filter(d => d.personId === member.id);
    renderMemberPage(doc, member, memberDocs, W, H, margin, contentW);
  });

  // Save
  const filename = members.length === 1
    ? `${members[0].name.replace(/\s+/g,'-')}_Contact_Card.pdf`
    : `Family_Contact_Cards_${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);
  showToast(`PDF saved: ${filename}`, 'success', 4000);
}

function renderMemberPage(doc, member, memberDocs, W, H, margin, contentW) {
  let y = margin;
  const x = margin;

  // ── HEADER BAND ───────────────────────────────────────────────────────────
  // Background colour bar
  const hexColor = member.color || '#EEF2FF';
  const rgb = hexToRgb(hexColor);
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.roundedRect(x, y, contentW, 36, 3, 3, 'F');

  // Photo circle
  if (member.photo?.startsWith('data:')) {
    try {
      doc.addImage(member.photo, 'JPEG', x + 4, y + 4, 28, 28, undefined, 'FAST');
      // Clip circle approximation with white ring
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(1);
      doc.circle(x + 18, y + 18, 14, 'S');
    } catch { /* photo load failure */ }
  } else {
    // Emoji placeholder
    doc.setFontSize(20);
    doc.text(member.emoji || '👤', x + 11, y + 21);
  }

  // Name + blood group
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(member.name || '—', x + 36, y + 14);

  if (member.bloodGroup) {
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(x + 36, y + 17, 18, 6, 1, 1, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`🩸 ${member.bloodGroup}`, x + 37, y + 21.5);
  }

  if (member.nationality) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(member.nationality, x + 36 + (member.bloodGroup ? 22 : 0), y + 22);
  }

  // Occupation
  if (member.occupation || member.employer) {
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const occLine = [member.occupation, member.employer].filter(Boolean).join(' @ ');
    doc.text(occLine, x + 36, y + 29);
  }

  y += 40;

  // ── PERSONAL INFO SECTION ─────────────────────────────────────────────────
  y = sectionHeader(doc, '👤 Personal Information', x, y, contentW);

  const personalRows = [
    ['Date of Birth', formatDate(member.dateOfBirth)],
    ['Phone', member.phone],
    ['Email', member.email],
    ['Employer', member.employer],
    ['Employer Phone', member.employerPhone],
  ].filter(r => r[1]);

  personalRows.forEach(([label, value]) => {
    y = infoRow(doc, label, value, x, y, contentW);
  });

  if (member.medicalNotes) {
    y = infoRow(doc, '⚕️ Medical', member.medicalNotes, x, y, contentW, true);
  }

  // ── LOCATIONS ─────────────────────────────────────────────────────────────
  if (member.homeQatar || member.homeIndia) {
    y += 3;
    y = sectionHeader(doc, '📍 Home Locations', x, y, contentW);

    if (member.homeQatar?.address) {
      y = locationBlock(doc, '🇶🇦 Qatar', member.homeQatar, x, y, contentW);
    }
    if (member.homeIndia?.address) {
      y = locationBlock(doc, '🇮🇳 India', member.homeIndia, x, y, contentW);
    }
  }

  // ── EMERGENCY CONTACTS ────────────────────────────────────────────────────
  const contacts = (member.emergencyContacts || []).sort((a,b) => a.priority - b.priority);
  if (contacts.length) {
    y += 3;
    y = sectionHeader(doc, '🚨 Emergency Contacts', x, y, contentW);

    contacts.slice(0, 4).forEach((contact, i) => {
      const label = `${i + 1}. ${contact.relationship || 'Contact'}`;
      const value = `${contact.name} — ${contact.phone}${contact.description ? '\n    ' + contact.description : ''}`;
      y = infoRow(doc, label, value, x, y, contentW);
    });
  }

  // ── DOCUMENTS ─────────────────────────────────────────────────────────────
  if (memberDocs.length) {
    y += 3;
    y = sectionHeader(doc, '🪪 Documents', x, y, contentW);

    memberDocs.forEach(d => {
      const daysLeft = daysFromToday(d.expiryDate);
      const status = daysLeft === null ? '—'
        : daysLeft < 0 ? `EXPIRED ${Math.abs(daysLeft)}d ago`
        : `${daysLeft}d remaining`;
      const masked = d.docNumber ? '···' + d.docNumber.slice(-4) : '—';
      y = infoRow(doc, d.docName, `${masked}  |  Expires: ${d.expiryDate}  |  ${status}`, x, y, contentW);
    });
  }

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(x, H - 12, x + contentW, H - 12);
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}  |  Family Hub App  |  CONFIDENTIAL`, x, H - 7);
}

// ── PDF Helper functions ──────────────────────────────────────────────────────
function sectionHeader(doc, title, x, y, contentW) {
  doc.setFillColor(245, 245, 250);
  doc.rect(x, y, contentW, 7, 'F');
  doc.setTextColor(55, 48, 163);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + 2, y + 5);
  return y + 9;
}

function infoRow(doc, label, value, x, y, contentW, wrap = false) {
  const labelW = 36;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(label, x + 2, y + 4.5);

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');

  if (wrap && value && value.length > 55) {
    const lines = doc.splitTextToSize(value, contentW - labelW - 4);
    doc.text(lines, x + labelW, y + 4.5);
    return y + Math.max(7, lines.length * 4.5);
  }

  const displayValue = value && value.length > 65 ? value.slice(0, 62) + '…' : (value || '—');
  doc.text(displayValue, x + labelW, y + 4.5);
  return y + 7;
}

function locationBlock(doc, countryLabel, location, x, y, contentW) {
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(countryLabel, x + 2, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  const addrLines = doc.splitTextToSize(
    [location.label, location.address].filter(Boolean).join(' — '),
    contentW - 36
  );
  doc.text(addrLines, x + 36, y + 4.5);
  let lineY = y + 4.5 + (addrLines.length - 1) * 4;

  if (location.lat && location.lng) {
    lineY += 4.5;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.text(`📍 ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${location.plusCode ? '  |  ' + location.plusCode : ''}`, x + 36, lineY);
  }

  if (location.mapsUrl) {
    lineY += 4;
    doc.setTextColor(55, 48, 163);
    doc.setFontSize(7);
    doc.text(location.mapsUrl.slice(0, 70), x + 36, lineY);
  }

  return lineY + 6;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1],16), g: parseInt(result[2],16), b: parseInt(result[3],16) }
    : { r: 238, g: 242, b: 255 };
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  } catch { return dateStr; }
}
