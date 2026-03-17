// ─── app-a-family-hub/js/screens/family-defaults.js ─────────────────────────
// Family Defaults — shared Qatar/India addresses, shared emergency contacts,
// visual SVG family tree, relation management with auto-reverse + auto-emergency wiring

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { navigate } from '../router.js';
import { uuidv4, showToast, copyToClipboard } from '../../../shared/utils.js';
import {
  RELATIONS, addRelation, removeRelation, getMemberRelations,
  resolveReverse, buildRelationEmergencyContacts, layoutFamilyTree
} from '../relation-engine.js';

const RELATIONSHIPS_EC = ['Spouse','Father','Mother','Brother','Sister','Son','Daughter','Friend','Doctor','Colleague','Other'];

export async function renderFamilyDefaults(container) {
  container.innerHTML = `
    <div class="app-header">
      <button class="app-header-action" id="back-btn">←</button>
      <span class="app-header-title">🏠 Family</span>
      <button class="app-header-action" id="save-btn" style="font-size:14px;font-weight:700;">💾 Save</button>
    </div>
    <!-- Section tabs -->
    <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;">
      ${[
        { id:'addresses', label:'🏠 Addresses' },
        { id:'contacts',  label:'🚨 Contacts'  },
        { id:'tree',      label:'🌳 Tree'       },
      ].map(t => `
        <button class="fd-tab" data-tab="${t.id}" style="
          flex:1;padding:12px 6px;border:none;background:none;cursor:pointer;
          font-size:12px;font-weight:600;font-family:inherit;
          color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.15s;
        ">${t.label}</button>
      `).join('')}
    </div>
    <div id="fd-body" style="padding-bottom:40px;"></div>
    <div class="modal-overlay hidden" id="fd-modal"></div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('people'));
  document.getElementById('save-btn').addEventListener('click', saveDefaults);

  const data = await getCachedTravelData();
  const members   = data?.members || [];
  const defaults  = data?.familyDefaults || {};
  const relations = data?.familyRelations || [];

  // Working drafts — saved on explicit Save
  let draftAddresses = {
    homeQatar: { label:'', address:'', lat:null, lng:null, plusCode:'', mapsUrl:'', ...(defaults.homeQatar || {}) },
    homeIndia: { label:'', address:'', lat:null, lng:null, plusCode:'', mapsUrl:'', ...(defaults.homeIndia  || {}) },
  };
  let draftContacts  = JSON.parse(JSON.stringify(defaults.emergencyContacts || []));
  let draftRelations = JSON.parse(JSON.stringify(relations));

  let activeTab = 'addresses';

  // Tab switching
  document.querySelectorAll('.fd-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      updateTabStyles();
      renderTab();
    });
  });

  updateTabStyles();
  renderTab();

  function updateTabStyles() {
    document.querySelectorAll('.fd-tab').forEach(btn => {
      const active = btn.dataset.tab === activeTab;
      btn.style.color        = active ? 'var(--primary)' : 'var(--text-muted)';
      btn.style.borderBottom = active ? '2px solid var(--primary)' : '2px solid transparent';
    });
  }

  function renderTab() {
    const body = document.getElementById('fd-body');
    body.innerHTML = '';
    if (activeTab === 'addresses') renderAddressesTab(body);
    if (activeTab === 'contacts')  renderContactsTab(body);
    if (activeTab === 'tree')      renderTreeTab(body);
  }

  // ── ADDRESSES TAB ───────────────────────────────────────────────────────────
  function renderAddressesTab(body) {
    const usingQatar = members.filter(m => !m.homeQatarOverride).length;
    const usingIndia = members.filter(m => !m.homeIndiaOverride).length;

    body.innerHTML = `
      <div style="background:var(--primary-bg);border-bottom:1px solid var(--primary-border);
        padding:10px 16px;font-size:13px;color:var(--primary);line-height:1.5;">
        💡 Set once — all members inherit these. Override per-person in their profile.
      </div>
      <div style="display:flex;gap:8px;padding:10px 16px;flex-wrap:wrap;">
        <span style="background:var(--success-bg);color:var(--success);font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:999px;">🇶🇦 ${usingQatar} using family Qatar address</span>
        <span style="background:var(--success-bg);color:var(--success);font-size:11px;font-weight:700;
          padding:3px 10px;border-radius:999px;">🇮🇳 ${usingIndia} using family India address</span>
      </div>

      ${addressSection('qatar', '🇶🇦 Family Qatar Home', draftAddresses.homeQatar)}
      ${addressSection('india', '🇮🇳 Family India Home', draftAddresses.homeIndia)}
    `;

    bindAddressEvents('qatar', draftAddresses.homeQatar);
    bindAddressEvents('india', draftAddresses.homeIndia);
  }

  function addressSection(key, title, loc) {
    return `
      <div class="section-title" style="margin-top:8px;">${title}</div>
      <div style="margin:0 16px;padding:16px;background:var(--surface);
        border-radius:var(--radius-lg);border:1px solid var(--border);
        display:flex;flex-direction:column;gap:12px;">

        <div class="form-group" style="margin:0;">
          <label class="form-label">Label</label>
          <input type="text" class="form-input" id="${key}-label"
            value="${esc(loc.label)}" placeholder="e.g. Pearl Qatar, Apt 12B" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Full Address</label>
          <textarea class="form-input" id="${key}-address" rows="2" style="resize:vertical;"
            placeholder="Street, area, city…">${esc(loc.address)}</textarea>
        </div>

        <!-- Map picker -->
        <div style="background:var(--surface-3);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">📍 Pick Location</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-secondary" style="justify-content:flex-start;gap:8px;font-size:13px;padding:9px 14px;"
              id="${key}-gps">📡 Use current GPS</button>
            <div style="display:flex;gap:8px;">
              <input type="text" class="form-input" id="${key}-paste"
                placeholder="Paste Google Maps / OSM link…" style="font-size:13px;padding:9px 12px;" />
              <button class="btn btn-primary" style="padding:9px 14px;font-size:13px;flex-shrink:0;"
                id="${key}-extract">Extract</button>
            </div>
            <div style="display:flex;gap:8px;">
              <input type="text" class="form-input" id="${key}-search"
                placeholder="Search address…" style="font-size:13px;padding:9px 12px;" />
              <button class="btn btn-primary" style="padding:9px 14px;font-size:13px;flex-shrink:0;"
                id="${key}-searchbtn">Search</button>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div id="${key}-results"></div>

        <!-- Coords display -->
        ${loc.lat ? `
          <div style="background:var(--primary-bg);border-radius:var(--radius-md);padding:12px;border:1px solid var(--primary-border);">
            <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:5px;">✅ Location Set</div>
            <div style="font-size:12px;color:var(--text-secondary);font-family:'DM Mono',monospace;line-height:1.8;">
              ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>
              ${loc.plusCode ? `Plus Code: ${loc.plusCode}<br>` : ''}
              ${esc(loc.formattedAddress || '')}
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button class="btn btn-secondary" style="font-size:11px;padding:6px 12px;"
                id="${key}-copy-loc">📋 Copy</button>
              <a href="${loc.mapsUrl || '#'}" target="_blank" rel="noopener"
                style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:6px 12px;
                border-radius:var(--radius-md);border:1.5px solid var(--border);
                background:var(--surface);color:var(--primary);font-weight:600;text-decoration:none;">
                🗺️ Open in Maps</a>
              <button class="btn btn-secondary" style="font-size:11px;padding:6px 12px;color:var(--danger);"
                id="${key}-clear-loc">✕ Clear</button>
            </div>
          </div>
          <div style="border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);height:150px;">
            <iframe
              src="https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng-0.005},${loc.lat-0.004},${loc.lng+0.005},${loc.lat+0.004}&layer=mapnik&marker=${loc.lat},${loc.lng}"
              width="100%" height="150" style="border:none;display:block;" loading="lazy"></iframe>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindAddressEvents(key, locObj) {
    // Live field updates
    document.getElementById(`${key}-label`)?.addEventListener('input', e => {
      locObj.label = e.target.value;
    });
    document.getElementById(`${key}-address`)?.addEventListener('input', e => {
      locObj.address = e.target.value;
    });

    // GPS
    document.getElementById(`${key}-gps`)?.addEventListener('click', () => {
      if (!navigator.geolocation) { showToast('GPS not available', 'error'); return; }
      const btn = document.getElementById(`${key}-gps`);
      btn.textContent = '📡 Getting location…'; btn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        async pos => {
          await applyCoords(key, locObj, pos.coords.latitude, pos.coords.longitude);
          btn.textContent = '📡 Use current GPS'; btn.disabled = false;
        },
        err => {
          showToast('GPS error: ' + err.message, 'error');
          btn.textContent = '📡 Use current GPS'; btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

    // Paste link
    document.getElementById(`${key}-extract`)?.addEventListener('click', async () => {
      const val = document.getElementById(`${key}-paste`)?.value.trim();
      if (!val) { showToast('Paste a map link first', 'warning'); return; }
      const coords = extractCoords(val);
      if (!coords) { showToast('Could not extract coordinates', 'error'); return; }
      await applyCoords(key, locObj, coords.lat, coords.lng);
      document.getElementById(`${key}-paste`).value = '';
    });

    // Search
    document.getElementById(`${key}-searchbtn`)?.addEventListener('click', async () => {
      const q = document.getElementById(`${key}-search`)?.value.trim();
      if (!q) { showToast('Enter an address to search', 'warning'); return; }
      const resultsEl = document.getElementById(`${key}-results`);
      resultsEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px;">🔍 Searching…</div>`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
          { headers: { 'Accept-Language':'en', 'User-Agent':'FamilyHubApp/1.0' } }
        );
        const places = await res.json();
        if (!places.length) { resultsEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:6px;">No results</div>`; return; }
        resultsEl.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">` +
          places.map((p, i) => `
            <button class="list-row srb" data-lat="${p.lat}" data-lng="${p.lon}"
              data-addr="${encodeURIComponent(p.display_name)}"
              style="width:100%;text-align:left;border-radius:0;${i === places.length-1 ? 'border-bottom:none' : ''};">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${esc(p.display_name.split(',').slice(0,2).join(','))}
                </div>
                <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${esc(p.display_name)}
                </div>
              </div>
              <span style="color:var(--primary);font-weight:600;font-size:13px;flex-shrink:0;">Select</span>
            </button>`
          ).join('') + '</div>';

        resultsEl.querySelectorAll('.srb').forEach(btn => {
          btn.addEventListener('click', async () => {
            await applyCoords(key, locObj, parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lng), decodeURIComponent(btn.dataset.addr));
            resultsEl.innerHTML = '';
            document.getElementById(`${key}-search`).value = '';
          });
        });
      } catch (err) {
        resultsEl.innerHTML = `<div style="font-size:13px;color:var(--danger);padding:6px;">Search failed: ${err.message}</div>`;
      }
    });

    // Copy location
    document.getElementById(`${key}-copy-loc`)?.addEventListener('click', async () => {
      const text = [
        locObj.label, locObj.address,
        locObj.lat ? `${locObj.lat.toFixed(6)}, ${locObj.lng.toFixed(6)}` : '',
        locObj.plusCode ? `Plus Code: ${locObj.plusCode}` : '',
        locObj.mapsUrl || '',
      ].filter(Boolean).join('\n');
      const ok = await copyToClipboard(text);
      if (ok) showToast('Copied!', 'success');
    });

    // Clear
    document.getElementById(`${key}-clear-loc`)?.addEventListener('click', () => {
      locObj.lat = null; locObj.lng = null;
      locObj.plusCode = ''; locObj.mapsUrl = ''; locObj.formattedAddress = '';
      renderTab();
    });
  }

  async function applyCoords(key, locObj, lat, lng, knownAddress = null) {
    locObj.lat = lat; locObj.lng = lng;
    locObj.mapsUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`;
    locObj.plusCode = generatePlusCode(lat, lng);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language':'en', 'User-Agent':'FamilyHubApp/1.0' } }
      );
      const place = await res.json();
      locObj.formattedAddress = knownAddress || place.display_name || '';
      if (!locObj.address) locObj.address = place.display_name || '';
    } catch {
      locObj.formattedAddress = knownAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    showToast('Location set!', 'success');
    renderTab();
  }

  // ── CONTACTS TAB ────────────────────────────────────────────────────────────
  function renderContactsTab(body) {
    const contacts = [...draftContacts].sort((a, b) => (a.priority || 9) - (b.priority || 9));
    body.innerHTML = `
      <div style="background:var(--primary-bg);border-bottom:1px solid var(--primary-border);
        padding:10px 16px;font-size:13px;color:var(--primary);line-height:1.5;">
        💡 These appear on <strong>every member's</strong> emergency card under "Family Contacts" — add shared numbers like parents, family doctor, etc.
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;">
        <span style="font-size:13px;font-weight:600;color:var(--text);">
          ${contacts.length} shared contact${contacts.length !== 1 ? 's' : ''}
        </span>
        <button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" id="add-ec-btn">+ Add</button>
      </div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:8px;" id="ec-list">
        ${contacts.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted);padding:8px 4px;">No shared contacts yet. Add emergency numbers that apply to all family members.</div>`
          : contacts.map((c, i) => ecCard(c, i)).join('')}
      </div>
    `;

    document.getElementById('add-ec-btn').addEventListener('click', () => openECModal(null));

    body.querySelectorAll('[data-edit-ec]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const c = draftContacts.find(x => x.id === btn.dataset.editEc);
        if (c) openECModal(c);
      });
    });
    body.querySelectorAll('[data-del-ec]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!confirm('Remove this shared contact?')) return;
        draftContacts = draftContacts.filter(x => x.id !== btn.dataset.delEc);
        renderTab();
      });
    });
  }

  function ecCard(c, i) {
    return `
      <div style="background:var(--surface);border-radius:var(--radius-md);padding:12px 14px;
        border:1px solid var(--border);border-left:3px solid var(--primary);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-bg);
            display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;
            color:var(--primary);flex-shrink:0;">${i + 1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;">${esc(c.name)}</div>
            <div style="font-size:12px;color:var(--text-muted);">${esc(c.relationship || '')} · <a href="tel:${esc(c.phone)}" style="color:var(--primary);text-decoration:none;">${esc(c.phone)}</a></div>
            ${c.description ? `<div style="font-size:11px;color:var(--text-muted);">${esc(c.description)}</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;">
            <button data-edit-ec="${c.id}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px;">✏️</button>
            <button data-del-ec="${c.id}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px;">🗑️</button>
          </div>
        </div>
      </div>`;
  }

  function openECModal(existing) {
    const modal = document.getElementById('fd-modal');
    modal.classList.remove('hidden');
    const c = existing || { id: uuidv4(), name:'', phone:'', relationship:'', description:'', priority: draftContacts.length + 1 };
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div style="padding:0 20px 24px;">
          <div style="font-size:17px;font-weight:700;margin-bottom:16px;">${existing ? 'Edit' : 'Add'} Shared Contact</div>
          <div class="form-group"><label class="form-label">Name *</label>
            <input type="text" class="form-input" id="ec-name" value="${esc(c.name)}" placeholder="Contact name" /></div>
          <div class="form-group"><label class="form-label">Phone *</label>
            <input type="tel" class="form-input" id="ec-phone" value="${esc(c.phone)}" placeholder="+91 98XXX XXXXX" /></div>
          <div class="form-group"><label class="form-label">Relationship</label>
            <select class="form-input" id="ec-rel" style="padding:11px 12px;">
              <option value="">— Select —</option>
              ${RELATIONSHIPS_EC.map(r => `<option value="${r}" ${c.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Description</label>
            <input type="text" class="form-input" id="ec-desc" value="${esc(c.description)}" placeholder="e.g. Family doctor in Doha" /></div>
          <div class="form-group"><label class="form-label">Priority (1 = first)</label>
            <input type="number" class="form-input" id="ec-pri" value="${c.priority}" min="1" max="20" /></div>
          <div id="ec-err" style="color:var(--danger);font-size:13px;min-height:16px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" style="flex:1;" id="ec-cancel">Cancel</button>
            <button class="btn btn-primary" style="flex:2;" id="ec-save">${existing ? 'Save' : 'Add Contact'}</button>
          </div>
        </div>
      </div>`;
    modal.querySelector('#ec-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    modal.querySelector('#ec-save').addEventListener('click', () => {
      const name  = modal.querySelector('#ec-name').value.trim();
      const phone = modal.querySelector('#ec-phone').value.trim();
      if (!name)  { modal.querySelector('#ec-err').textContent = 'Name required'; return; }
      if (!phone) { modal.querySelector('#ec-err').textContent = 'Phone required'; return; }
      const updated = { id: c.id, name, phone,
        relationship: modal.querySelector('#ec-rel').value,
        description:  modal.querySelector('#ec-desc').value.trim(),
        priority:     parseInt(modal.querySelector('#ec-pri').value) || 1 };
      const idx = draftContacts.findIndex(x => x.id === c.id);
      if (idx > -1) draftContacts[idx] = updated; else draftContacts.push(updated);
      modal.classList.add('hidden');
      renderTab();
    });
  }

  // ── TREE TAB ────────────────────────────────────────────────────────────────
  function renderTreeTab(body) {
    if (!members.length) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🌳</div>
        <div class="empty-state-title">No members yet</div>
        <div class="empty-state-text">Add family members first, then define their relationships here</div></div>`;
      return;
    }

    const layout = layoutFamilyTree(members, draftRelations);
    const svgW   = Math.max(layout.canvasW, 300);
    const svgH   = Math.max(layout.canvasH, 200);

    body.innerHTML = `
      <div style="background:var(--primary-bg);border-bottom:1px solid var(--primary-border);
        padding:10px 16px;font-size:13px;color:var(--primary);">
        💡 Define who is related to whom. The app auto-creates reverse relationships and can auto-add family members as emergency contacts.
      </div>

      <!-- SVG Tree -->
      <div style="overflow-x:auto;padding:16px;-webkit-overflow-scrolling:touch;">
        <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"
          style="display:block;margin:0 auto;min-width:${svgW}px;">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M2 2L8 5L2 8" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/>
            </marker>
          </defs>

          <!-- Edges -->
          ${layout.edges.map(e => {
            if (e.type === 'spouse') {
              return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}"
                stroke="#3730A3" stroke-width="2" stroke-dasharray="4 2"/>`;
            }
            if (e.type === 'parent-child') {
              const mx = (e.x1 + e.x2) / 2;
              const my = (e.y1 + e.y2) / 2;
              return `<path d="M${e.x1},${e.y1} C${e.x1},${my} ${e.x2},${my} ${e.x2},${e.y2}"
                fill="none" stroke="#10B981" stroke-width="1.5"/>`;
            }
            // Other / sibling
            return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}"
              stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="3 3"/>
              ${e.label ? `<text x="${(e.x1+e.x2)/2}" y="${(e.y1+e.y2)/2 - 4}"
                text-anchor="middle" font-size="9" fill="#94A3B8">${esc(e.label)}</text>` : ''}`;
          }).join('')}

          <!-- Nodes -->
          ${layout.nodes.map(n => {
            const hasPhoto = n.member.photo?.startsWith('data:');
            const myRels   = draftRelations.filter(r => r.fromId === n.id);
            const relLabel = myRels.length > 0
              ? myRels.slice(0,2).map(r => {
                  const other = members.find(m => m.id === r.toId);
                  return `${r.relation} of ${other?.name?.split(' ')[0] || '?'}`;
                }).join(', ')
              : '';
            return `
              <g class="tree-node" data-id="${n.id}" style="cursor:pointer;"
                onclick="document.dispatchEvent(new CustomEvent('tree-node-click', {detail:'${n.id}'}))">
                <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"
                  fill="${n.member.color || '#EEF2FF'}" stroke="#E2E8F0" stroke-width="1.5"/>
                <!-- Avatar circle -->
                <circle cx="${n.x + 20}" cy="${n.y + n.h/2}" r="15"
                  fill="${n.member.color || '#EEF2FF'}" stroke="white" stroke-width="1.5"/>
                <text x="${n.x + 20}" y="${n.y + n.h/2 + 6}" text-anchor="middle"
                  font-size="16">${n.member.emoji || '👤'}</text>
                <!-- Name -->
                <text x="${n.x + 38}" y="${n.y + 18}" font-size="11" font-weight="700"
                  fill="#1E293B" font-family="DM Sans, sans-serif">${esc(n.member.name.split(' ')[0])}</text>
                <!-- Relation label -->
                ${relLabel ? `<text x="${n.x + 38}" y="${n.y + 30}" font-size="8.5"
                  fill="#64748B" font-family="DM Sans, sans-serif">${esc(relLabel.slice(0,20))}</text>` : ''}
                <!-- Blood group badge -->
                ${n.member.bloodGroup ? `
                  <rect x="${n.x + n.w - 28}" y="${n.y + 4}" width="24" height="14" rx="4"
                    fill="#FEE2E2"/>
                  <text x="${n.x + n.w - 16}" y="${n.y + 14}" text-anchor="middle" font-size="8"
                    fill="#991B1B" font-weight="700">${esc(n.member.bloodGroup)}</text>
                ` : ''}
              </g>`;
          }).join('')}

          <!-- Legend -->
          <g transform="translate(10, ${svgH - 40})">
            <line x1="0" y1="8" x2="20" y2="8" stroke="#3730A3" stroke-width="2" stroke-dasharray="4 2"/>
            <text x="25" y="12" font-size="9" fill="#64748B">Spouse</text>
            <line x1="70" y1="8" x2="90" y2="8" stroke="#10B981" stroke-width="1.5"/>
            <text x="95" y="12" font-size="9" fill="#64748B">Parent–Child</text>
            <line x1="165" y1="8" x2="185" y2="8" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="3 3"/>
            <text x="190" y="12" font-size="9" fill="#64748B">Other</text>
          </g>
        </svg>
      </div>

      <!-- Relation list -->
      <div style="padding:0 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 10px;">
          <span style="font-size:13px;font-weight:700;color:var(--text);">
            ${draftRelations.length} relationship${draftRelations.length !== 1 ? 's' : ''} defined
          </span>
          <button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" id="add-rel-btn">+ Add</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;" id="rel-list">
          ${buildRelationsList()}
        </div>
      </div>
    `;

    // Tree node click → open add relation pre-filled with that member
    document.addEventListener('tree-node-click', e => openRelationModal(e.detail), { once: true });

    document.getElementById('add-rel-btn').addEventListener('click', () => openRelationModal(null));

    body.querySelectorAll('[data-del-rel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [fromId, toId] = btn.dataset.delRel.split('|');
        if (!confirm('Remove this relationship (both directions)?')) return;
        // use imported removeRelation
        draftRelations = removeRelation(draftRelations, fromId, toId);
        renderTab();
      });
    });
  }

  function buildRelationsList() {
    if (!draftRelations.length) return `<div style="font-size:13px;color:var(--text-muted);">No relationships defined yet. Tap + Add to start.</div>`;

    // Deduplicate — show only one direction per pair
    const shown = new Set();
    return draftRelations.map(r => {
      const pairKey = [r.fromId, r.toId].sort().join('|');
      if (shown.has(pairKey)) return '';
      shown.add(pairKey);
      const from = members.find(m => m.id === r.fromId);
      const to   = members.find(m => m.id === r.toId);
      if (!from || !to) return '';
      const reverseR = draftRelations.find(x => x.fromId === r.toId && x.toId === r.fromId);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
          background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
          <div style="width:30px;height:30px;border-radius:50%;background:${from.color||'#EEF2FF'};
            display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${from.emoji||'👤'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;">
              ${esc(from.name)} <span style="color:var(--primary);">is ${esc(r.relation)} of</span> ${esc(to.name)}
            </div>
            ${reverseR ? `<div style="font-size:11px;color:var(--text-muted);">↩ ${esc(to.name)} is ${esc(reverseR.relation)} of ${esc(from.name)}</div>` : ''}
          </div>
          <div style="width:30px;height:30px;border-radius:50%;background:${to.color||'#EEF2FF'};
            display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${to.emoji||'👤'}</div>
          <button data-del-rel="${r.fromId}|${r.toId}"
            style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px;flex-shrink:0;">🗑️</button>
        </div>`;
    }).join('');
  }

  function openRelationModal(preselectedFromId) {
    const modal = document.getElementById('fd-modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div style="padding:0 20px 24px;">
          <div style="font-size:17px;font-weight:700;margin-bottom:4px;">Add Relationship</div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
            The reverse relationship is created automatically.
          </div>

          <div class="form-group">
            <label class="form-label">Person A</label>
            <select class="form-input" id="rel-from" style="padding:11px 12px;">
              <option value="">— Select person —</option>
              ${members.map(m => `<option value="${m.id}" ${m.id === preselectedFromId ? 'selected' : ''}>${m.emoji||'👤'} ${esc(m.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Is the</label>
            <select class="form-input" id="rel-type" style="padding:11px 12px;">
              <option value="">— Select relationship —</option>
              ${RELATIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Of (Person B)</label>
            <select class="form-input" id="rel-to" style="padding:11px 12px;">
              <option value="">— Select person —</option>
              ${members.map(m => `<option value="${m.id}">${m.emoji||'👤'} ${esc(m.name)}</option>`).join('')}
            </select>
          </div>

          <!-- Preview of auto-reverse -->
          <div id="rel-preview" style="background:var(--surface-3);border-radius:var(--radius-md);
            padding:10px 14px;font-size:13px;color:var(--text-muted);min-height:36px;margin-bottom:12px;">
            Select both people and a relationship to see the preview.
          </div>

          <div id="rel-err" style="color:var(--danger);font-size:13px;min-height:16px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" style="flex:1;" id="rel-cancel">Cancel</button>
            <button class="btn btn-primary" style="flex:2;" id="rel-save">Add Relationship</button>
          </div>
        </div>
      </div>`;

    const updatePreview = () => {
      const fromId   = modal.querySelector('#rel-from').value;
      const relation = modal.querySelector('#rel-type').value;
      const toId     = modal.querySelector('#rel-to').value;
      const prev     = modal.querySelector('#rel-preview');
      if (!fromId || !relation || !toId) {
        prev.textContent = 'Select both people and a relationship to see the preview.';
        prev.style.color = 'var(--text-muted)';
        return;
      }
      if (fromId === toId) {
        prev.textContent = '⚠️ A person cannot be related to themselves.';
        prev.style.color = 'var(--danger)'; return;
      }
      const fromName = members.find(m => m.id === fromId)?.name || '?';
      const toName   = members.find(m => m.id === toId)?.name || '?';
      const reverse  = resolveReverse(relation);
      prev.style.color = 'var(--text)';
      prev.innerHTML = `
        <div>✅ <strong>${esc(fromName)}</strong> is <strong>${esc(relation)}</strong> of <strong>${esc(toName)}</strong></div>
        <div style="color:var(--text-muted);margin-top:3px;">↩ Auto-reverse: <strong>${esc(toName)}</strong> is <strong>${esc(reverse)}</strong> of <strong>${esc(fromName)}</strong></div>
      `;
    };

    ['#rel-from','#rel-type','#rel-to'].forEach(sel => {
      modal.querySelector(sel)?.addEventListener('change', updatePreview);
    });

    modal.querySelector('#rel-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    modal.querySelector('#rel-save').addEventListener('click', async () => {
      const fromId   = modal.querySelector('#rel-from').value;
      const relation = modal.querySelector('#rel-type').value;
      const toId     = modal.querySelector('#rel-to').value;
      const errEl    = modal.querySelector('#rel-err');

      if (!fromId || !relation || !toId) { errEl.textContent = 'All fields required'; return; }
      if (fromId === toId) { errEl.textContent = 'Cannot relate a person to themselves'; return; }

      draftRelations = addRelation(draftRelations, fromId, relation, toId);

      // Auto-emergency contact prompt
      const fromMember = members.find(m => m.id === fromId);
      const toMember   = members.find(m => m.id === toId);
      if (fromMember?.phone && toMember?.phone) {
        modal.innerHTML = `
          <div class="modal-sheet">
            <div class="modal-handle"></div>
            <div style="padding:20px;">
              <div style="font-size:17px;font-weight:700;margin-bottom:8px;">Auto-add Emergency Contacts?</div>
              <div style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:20px;">
                Since both profiles have phone numbers, would you like to add them to each other's emergency contacts?
                <br><br>
                <strong>${esc(fromMember.name)}</strong> → added to ${esc(toMember.name)}'s emergency contacts<br>
                <strong>${esc(toMember.name)}</strong> → added to ${esc(fromMember.name)}'s emergency contacts
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <button class="btn btn-primary" id="ec-yes">✅ Yes, add both</button>
                <button class="btn btn-secondary" id="ec-no">Skip — I'll manage contacts manually</button>
              </div>
            </div>
          </div>`;

        modal.querySelector('#ec-no').addEventListener('click', () => {
          modal.classList.add('hidden');
          renderTab();
        });

        modal.querySelector('#ec-yes').addEventListener('click', async () => {
          // Add toMember as emergency contact on fromMember's profile
          await addRelationAsEmergencyContact(fromId, toMember, resolveReverse(relation));
          // Add fromMember as emergency contact on toMember's profile
          await addRelationAsEmergencyContact(toId, fromMember, relation);
          modal.classList.add('hidden');
          showToast('Emergency contacts added!', 'success');
          renderTab();
        });
      } else {
        modal.classList.add('hidden');
        renderTab();
      }
    });
  }

  async function addRelationAsEmergencyContact(memberId, contactMember, relationship) {
    const currentData = await getCachedTravelData();
    const newData = await writeData('travel', remote => {
      const mems = remote.members || [];
      const idx  = mems.findIndex(m => m.id === memberId);
      if (idx === -1) return remote;
      const member   = { ...mems[idx] };
      const contacts = [...(member.personalEmergencyContacts || [])];
      const already  = contacts.find(c => c.memberId === contactMember.id);
      if (!already) {
        contacts.push({
          id: uuidv4(), name: contactMember.name, phone: contactMember.phone || '',
          relationship, description: `${relationship} — linked profile`,
          priority: contacts.length + 1, fromRelation: true, memberId: contactMember.id
        });
        member.personalEmergencyContacts = contacts;
        mems[idx] = member;
      }
      return { ...remote, members: mems };
    });
    await setCachedTravelData(newData);
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────────
  async function saveDefaults() {
    try {
      const btn = document.getElementById('save-btn');
      btn.textContent = '⏳'; btn.disabled = true;

      const newData = await writeData('travel', remote => ({
        ...remote,
        familyDefaults: {
          homeQatar:          draftAddresses.homeQatar,
          homeIndia:          draftAddresses.homeIndia,
          emergencyContacts:  draftContacts,
        },
        familyRelations: draftRelations,
      }));
      await setCachedTravelData(newData);

      showToast('Family defaults saved!', 'success');
      btn.textContent = '💾 Save'; btn.disabled = false;
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      document.getElementById('save-btn').textContent = '💾 Save';
      document.getElementById('save-btn').disabled = false;
    }
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function extractCoords(url) {
  let m;
  m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);             if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);        if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);            if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/mlat=(-?\d+\.\d+).*mlon=(-?\d+\.\d+)/);   if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);   if (m) return { lat: +m[1], lng: +m[2] };
  m = url.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);        if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}

function generatePlusCode(lat, lng) {
  try {
    const ALPHA = '23456789CFGHJMPQRVWX';
    const enc = (v, lo, hi, s) => {
      let c = ''; v = (Math.min(Math.max(v, lo), hi - 1e-10) - lo) / (hi - lo);
      for (let i = 0; i < s; i++) { v *= 20; c += ALPHA[Math.floor(v)]; v -= Math.floor(v); }
      return c;
    };
    const lc = enc(lat + 90, 0, 180, 4), mc = enc(lng + 180, 0, 360, 4);
    const code = lc[0]+mc[0]+lc[1]+mc[1]+lc[2]+mc[2]+lc[3]+mc[3];
    return code.slice(0,4) + '+' + code.slice(4);
  } catch { return ''; }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
