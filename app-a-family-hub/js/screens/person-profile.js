// v3.5.0 — 2026-03-22

// ─── app-a-family-hub/js/screens/person-profile.js ──────────────────────────
// Full person profile with 4 tabs:
// Profile | Locations | Emergency | Documents

'use strict';

import { getCachedTravelData, setCachedTravelData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { uuidv4, showToast, copyToClipboard, today, daysFromToday, expiryStatus, expiryStatusColor } from '../../../shared/utils.js';

const BLOOD_GROUPS    = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
const RELATIONSHIPS   = ['Spouse','Father','Mother','Brother','Sister','Son','Daughter','Friend','Doctor','Colleague','Other'];
const NATIONALITIES   = ['Indian','Qatari','Pakistani','Filipino','Bangladeshi','Sri Lankan','Nepali','Egyptian','Other'];

export async function renderPersonProfile(container, params = {}) {
  const { memberId, mode = 'view' } = params;
  const isNew = mode === 'new';
  let isViewMode = !isNew && mode !== 'edit';  // view by default, edit on demand

  const data = await getCachedTravelData();
  const { members = [], documents = [] } = data || {};
  const member = isNew ? createEmptyMember() : members.find(m => m.id === memberId);

  if (!member && !isNew) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Member not found</div></div>`;
    return;
  }

  // Working copy -- edits happen here, saved on explicit "Save"
  let draft = JSON.parse(JSON.stringify(member));
  let activeTab = 'profile';
  let hasUnsavedChanges = false;

  function markDirty() { hasUnsavedChanges = true; }

  function render() {
    container.innerHTML = `
      <div class="app-header" style="background:${draft.color || 'var(--primary)'};">
        <button class="app-header-action" id="back-btn" style="color:#fff;">←</button>
        <span class="app-header-title">${isNew ? 'New Profile' : draft.name || 'Profile'}</span>
        <div style="display:flex;gap:4px;">
          ${isViewMode
            ? `<button class="app-header-action" id="share-profile-btn" title="Share" style="color:#fff;font-size:18px;">💬</button>
               <button class="app-header-action" id="edit-profile-btn" title="Edit" style="color:#fff;font-size:14px;font-weight:700;">✏️ Edit</button>`
            : `<button class="app-header-action" id="save-btn" style="color:#fff;font-size:14px;font-weight:700;">💾 Save</button>`
          }
        </div>
      </div>

      <!-- Inner tab bar -->
      <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;overflow-x:auto;scrollbar-width:none;">
        ${[
          { id:'profile',   label:'👤 Profile'   },
          { id:'locations', label:'📍 Locations'  },
          { id:'emergency', label:'🚨 Emergency'  },
          { id:'documents', label:'🪪 Documents'  },
        ].map(tab => `
          <button class="profile-tab" data-tab="${tab.id}" style="
            flex:1;min-width:80px;padding:11px 8px;border:none;background:none;cursor:pointer;
            font-size:12px;font-weight:600;white-space:nowrap;font-family:inherit;
            color:${activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)'};
            border-bottom:2px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'};
            transition:all 0.15s;
          ">${tab.label}</button>
        `).join('')}
      </div>

      <div id="tab-content" style="padding-bottom:40px;"></div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => {
      if (hasUnsavedChanges && !confirm('Discard unsaved changes?')) return;
      navigate('people');
    });

    if (isViewMode) {
      // View mode buttons
      document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
        isViewMode = false;
        render();
      });
      document.getElementById('share-profile-btn')?.addEventListener('click', () => {
        shareProfileText();
      });
      // Disable all inputs in view mode
      setTimeout(() => {
        container.querySelectorAll('input, textarea, select, button:not(#back-btn):not(.profile-tab):not(.photo-thumb):not(.photo-remove)').forEach(el => {
          if (!el.id?.includes('share') && !el.id?.includes('edit')) {
            el.disabled = true;
            el.style.opacity = '0.75';
            el.style.cursor = 'default';
          }
        });
        // Hide FAB-like action buttons in view mode
        container.querySelectorAll('.edit-only').forEach(el => el.style.display = 'none');
      }, 0);
    } else {
      document.getElementById('save-btn').addEventListener('click', () => saveMember());
    }

    document.querySelectorAll('.profile-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    switch (activeTab) {
      case 'profile':   renderProfileTab();   break;
      case 'locations': renderLocationsTab(); break;
      case 'emergency': renderEmergencyTab(); break;
      case 'documents': renderDocumentsTab(); break;
    }
  }

  // ── TAB 1: PROFILE ─────────────────────────────────────────────────────────
  function renderProfileTab() {
    const tab = document.getElementById('tab-content');
    const hasPhoto = draft.photo?.startsWith('data:');

    tab.innerHTML = `
      <div style="padding:20px;display:flex;flex-direction:column;gap:18px;">

        <!-- Photo -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          <div id="photo-preview" style="
            width:100px;height:100px;border-radius:50%;overflow:hidden;
            background:${draft.color || '#EEF2FF'};
            display:flex;align-items:center;justify-content:center;
            font-size:48px;border:3px solid var(--border);cursor:pointer;
            position:relative;
          ">
            ${hasPhoto
              ? `<img src="${draft.photo}" style="width:100%;height:100%;object-fit:cover;" />`
              : (draft.emoji || '👤')}
            <div style="position:absolute;bottom:0;right:0;background:var(--primary);
              width:28px;height:28px;border-radius:50%;display:flex;align-items:center;
              justify-content:center;color:#fff;font-size:14px;border:2px solid #fff;">📷</div>
          </div>
          <input type="file" id="photo-input" accept="image/*" style="display:none;" />
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" id="change-photo-btn">Change Photo</button>
            ${hasPhoto ? `<button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;color:var(--danger);" id="remove-photo-btn">Remove</button>` : ''}
          </div>
        </div>

        <!-- Emoji & Color (avatar when no photo) -->
        <div style="display:flex;gap:12px;">
          <div class="form-group" style="margin:0;flex:1;">
            <label class="form-label">Display Name</label>
            <input type="text" class="form-input" id="member-name" value="${draft.name || ''}" placeholder="Full name" />
          </div>
        </div>

        <!-- Emoji row -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Avatar Emoji</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;" id="emoji-grid">
            ${['👤','👨','👩','🧑','👦','👧','🧔','👱','🧒','👴','👵','🧓'].map(e => `
              <button type="button" style="width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;
                border:2px solid ${draft.emoji === e ? 'var(--primary)' : 'transparent'};
                background:${draft.emoji === e ? 'var(--primary-bg)' : 'var(--surface-3)'};"
                data-emoji="${e}">${e}</button>
            `).join('')}
          </div>
        </div>

        <!-- Color -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Profile Color</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${['#EEF2FF','#D1FAE5','#FEF3C7','#FCE7F3','#E0F2FE','#F3E8FF','#FEE2E2','#E8F5E9'].map(c => `
              <button type="button" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
                border:3px solid ${draft.color === c ? 'var(--primary)' : 'transparent'};"
                data-color="${c}"></button>
            `).join('')}
          </div>
        </div>

        <div class="divider"></div>

        <!-- Personal details -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date of Birth</label>
          <input type="date" class="form-input" id="dob" value="${draft.dateOfBirth || ''}" max="${today()}" />
          <label class="form-label" style="margin-top:14px;">Role</label>
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);">
            <span style="font-size:20px;">👑</span>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">Head of Household</div>
              <div style="font-size:12px;color:var(--text-muted);">Shown at top of family tree with crown</div>
            </div>
            <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">
              <input type="checkbox" id="head-of-household" ${draft.headOfHousehold ? 'checked' : ''} style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${draft.headOfHousehold ? 'var(--primary)' : '#ccc'};border-radius:24px;transition:0.2s;">
                <span style="position:absolute;content:'';height:18px;width:18px;left:${draft.headOfHousehold ? '23px' : '3px'};bottom:3px;background:#fff;border-radius:50%;transition:0.2s;display:block;"></span>
              </span>
            </label>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">Nationality</label>
            <select class="form-input" id="nationality" style="padding:11px 12px;">
              <option value="">-- Select --</option>
              ${NATIONALITIES.map(n => `<option value="${n}" ${draft.nationality === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Blood Group</label>
            <select class="form-input" id="blood-group" style="padding:11px 12px;">
              <option value="">-- Select --</option>
              ${BLOOD_GROUPS.map(b => `<option value="${b}" ${draft.bloodGroup === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Phone Number</label>
          <div style="display:flex;gap:8px;">
            <select id="phone-cc" style="width:110px;padding:10px 8px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;flex-shrink:0;">
              ${[
                {code:'+974',flag:'🇶🇦',label:'QAR +974'},
                {code:'+91', flag:'🇮🇳',label:'IND +91'},
                {code:'+1',  flag:'🇺🇸',label:'USA +1'},
                {code:'+44', flag:'🇬🇧',label:'GBR +44'},
                {code:'+971',flag:'🇦🇪',label:'UAE +971'},
                {code:'+966',flag:'🇸🇦',label:'SAU +966'},
                {code:'+968',flag:'🇴🇲',label:'OMN +968'},
                {code:'+965',flag:'🇰🇼',label:'KWT +965'},
                {code:'+973',flag:'🇧🇭',label:'BHR +973'},
                {code:'+92', flag:'🇵🇰',label:'PAK +92'},
                {code:'+880',flag:'🇧🇩',label:'BGD +880'},
                {code:'+94', flag:'🇱🇰',label:'LKA +94'},
                {code:'+63', flag:'🇵🇭',label:'PHL +63'},
              ].map(c => {
                const currentCC = (draft.phone||'').match(/^([+][0-9]+)/)?.[1] || '+974';
                const sel = currentCC === c.code ? 'selected' : '';
                return '<option value="' + c.code + '" ' + sel + '>' + c.flag + ' ' + c.code + '</option>';
              }).join('')}
            </select>
            <input type="tel" class="form-input" id="phone" style="flex:1;"
              value="${(draft.phone||'').replace(/^\+\d+\s?/,'')}"
              placeholder="XXXX XXXX" inputmode="numeric" />
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Email</label>
          <input type="email" class="form-input" id="email" value="${draft.email || ''}" placeholder="name@email.com" />
        </div>

        <div class="form-group" style="margin:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;">
            <div>
              <div style="font-size:14px;font-weight:600;">👑 Head of Household</div>
              <div style="font-size:12px;color:var(--text-muted);">Shown at top of family tree with crown</div>
            </div>
            <label style="position:relative;width:44px;height:24px;cursor:pointer;">
              <input type="checkbox" id="head-of-household" ${draft.headOfHousehold ? 'checked' : ''}
                style="opacity:0;width:0;height:0;" />
              <span id="hoh-slider" style="position:absolute;inset:0;border-radius:12px;transition:0.2s;
                background:${draft.headOfHousehold ? 'var(--primary)' : 'var(--border)'};"></span>
              <span id="hoh-thumb" style="position:absolute;left:${draft.headOfHousehold ? '22' : '2'}px;top:2px;
                width:20px;height:20px;border-radius:50%;background:#fff;transition:0.2s;"></span>
            </label>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Work details -->
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Work Details</div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Occupation / Job Title</label>
          <input type="text" class="form-input" id="occupation" value="${draft.occupation || ''}" placeholder="e.g. Civil Engineer" />
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Employer / Company</label>
          <input type="text" class="form-input" id="employer" value="${draft.employer || ''}" placeholder="Company name" />
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Employer Phone</label>
          <div style="display:flex;gap:8px;">
            <select id="employer-phone-cc" style="width:110px;padding:10px 8px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;flex-shrink:0;">
              ${[
                {code:'+974',flag:'🇶🇦'},{code:'+91',flag:'🇮🇳'},{code:'+1',flag:'🇺🇸'},
                {code:'+44',flag:'🇬🇧'},{code:'+971',flag:'🇦🇪'},{code:'+966',flag:'🇸🇦'},
              ].map(c => {
                const currentCC = (draft.employerPhone||'').match(/^([+][0-9]+)/)?.[1] || '+974';
                const sel = currentCC === c.code ? 'selected' : '';
                return '<option value="' + c.code + '" ' + sel + '>' + c.flag + ' ' + c.code + '</option>';
              }).join('')}
            </select>
            <input type="tel" class="form-input" id="employer-phone" style="flex:1;"
              value="${(draft.employerPhone||'').replace(/^\+\d+\s?/,'')}"
              placeholder="XXXX XXXX" inputmode="numeric" />
          </div>
        </div>

        <div class="divider"></div>

        <!-- Medical -->
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Medical Information</div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Medical Notes <span style="color:var(--text-muted);font-weight:400;">(allergies, conditions, medications)</span></label>
          <textarea class="form-input" id="medical-notes" rows="3" placeholder="e.g. Allergic to penicillin. Takes metformin daily."
            style="resize:vertical;line-height:1.5;">${draft.medicalNotes || ''}</textarea>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label">Personal Notes</label>
          <textarea class="form-input" id="personal-notes" rows="2" placeholder="Any other notes…"
            style="resize:vertical;line-height:1.5;">${draft.personalNotes || ''}</textarea>
        </div>

        ${!isNew ? `
          <button class="btn" id="delete-member-btn" style="color:var(--danger);border:1px solid var(--danger);background:none;margin-top:8px;">
            🗑️ Delete This Profile
          </button>` : ''}
      </div>
    `;

    // Photo handlers
    // Head of Household toggle
    document.getElementById('head-of-household')?.addEventListener('change', (e) => {
      draft.headOfHousehold = e.target.checked;
      // Update toggle visuals
      const track = e.target.nextElementSibling;
      if (track) {
        track.style.background = draft.headOfHousehold ? 'var(--primary)' : 'var(--border)';
        const thumb = document.getElementById('hoh-thumb');
        if (thumb) thumb.style.left = draft.headOfHousehold ? '22px' : '2px';
      }
      markDirty();
    });

    document.getElementById('change-photo-btn').addEventListener('click', () =>
      document.getElementById('photo-input').click()
    );
    document.getElementById('photo-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const b64 = await compressPhoto(file);
        draft.photo = b64;
        markDirty();
        render();
      } catch { showToast('Could not load photo', 'error'); }
    });
    document.getElementById('remove-photo-btn')?.addEventListener('click', () => {
      draft.photo = null; markDirty(); render();
    });

    // Emoji
    tab.querySelectorAll('[data-emoji]').forEach(btn => {
      btn.addEventListener('click', () => { draft.emoji = btn.dataset.emoji; markDirty(); render(); });
    });

    // Color
    tab.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => { draft.color = btn.dataset.color; markDirty(); render(); });
    });

    // All text fields -- live update draft
    const fieldMap = {
      'member-name': 'name', 'dob': 'dateOfBirth', 'nationality': 'nationality',
      'blood-group': 'bloodGroup', 'email': 'email',
      'occupation': 'occupation', 'employer': 'employer',
      'employer-phone': 'employerPhone', 'medical-notes': 'medicalNotes',
      'personal-notes': 'personalNotes'
    };
    Object.entries(fieldMap).forEach(([id, key]) => {
      document.getElementById(id)?.addEventListener('input', e => {
        draft[key] = e.target.value; markDirty();
      });
    });

    // Delete
    document.getElementById('delete-member-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete ${draft.name}'s profile? Their trip and document records will be kept.`)) return;
      const newData = await writeData('travel', r => ({
        ...r, members: (r.members || []).filter(m => m.id !== draft.id)
      }));
      await setCachedTravelData(newData);
      showToast('Profile deleted', 'success');
      navigate('people');
    });
  }

  // ── TAB 2: LOCATIONS ───────────────────────────────────────────────────────
  function renderLocationsTab() {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div style="padding:20px;display:flex;flex-direction:column;gap:20px;">
        ${locationSection('Qatar', 'homeQatar', '🇶🇦')}
        ${locationSection('India', 'homeIndia', '🇮🇳')}
      </div>
    `;
    bindLocationEvents('Qatar', 'homeQatar');
    bindLocationEvents('India', 'homeIndia');
  }

  function locationSection(countryName, fieldKey, flag) {
    const loc = draft[fieldKey] || {};
    return `
      <div class="card" style="padding:0;overflow:visible;">
        <div style="background:var(--surface-3);padding:12px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:14px;font-weight:700;">${flag} ${countryName} Home Address</div>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">

          <div class="form-group" style="margin:0;">
            <label class="form-label">Location Label</label>
            <input type="text" class="form-input loc-label" data-loc="${fieldKey}"
              value="${loc.label || ''}" placeholder="e.g. Pearl Qatar, Apt 12B" />
          </div>

          <div class="form-group" style="margin:0;">
            <label class="form-label">Full Address</label>
            <textarea class="form-input loc-address" data-loc="${fieldKey}"
              rows="2" placeholder="Street, area, city…"
              style="resize:vertical;">${loc.address || ''}</textarea>
          </div>

          <!-- Map Picker -->
          <div style="background:var(--surface-3);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">📍 Pick Map Location</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="btn btn-secondary" style="justify-content:flex-start;gap:8px;font-size:13px;padding:10px 14px;"
                data-action="gps" data-loc="${fieldKey}">
                📡 Use my current GPS location
              </button>
              <div style="display:flex;gap:8px;align-items:center;">
                <input type="text" class="form-input" id="paste-link-${fieldKey}"
                  placeholder="Paste Google Maps link or Plus Code (7HQG+XR)…" style="font-size:13px;padding:10px 12px;" />
                <button class="btn btn-primary" style="padding:10px 14px;font-size:13px;flex-shrink:0;"
                  data-action="paste" data-loc="${fieldKey}">Extract</button>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <input type="text" class="form-input" id="search-addr-${fieldKey}"
                  placeholder="Search address (OpenStreetMap)…" style="font-size:13px;padding:10px 12px;" />
                <button class="btn btn-primary" style="padding:10px 14px;font-size:13px;flex-shrink:0;"
                  data-action="search" data-loc="${fieldKey}">Search</button>
              </div>
            </div>
          </div>

          <!-- Coordinates display -->
          <div id="coords-${fieldKey}" style="${loc.lat ? '' : 'display:none;'}">
            ${renderCoordsBlock(loc, fieldKey)}
          </div>

          <!-- Map preview -->
          <div id="map-preview-${fieldKey}">
            ${loc.lat ? renderMapPreview(loc) : ''}
          </div>

          <!-- Address search results -->
          <div id="search-results-${fieldKey}"></div>

          <!-- Address photos -->
          <div style="margin-top:8px;padding:0 16px 16px;">
            <label style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">
              📸 Address Photos <span style="font-weight:400;text-transform:none;">(ID board · building)</span>
            </label>
            <div id="addr-photos-${fieldKey}"></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCoordsBlock(loc, fieldKey) {
    if (!loc?.lat) return '';
    const mapsLink = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}&zoom=17`;
    const copyText = [
      loc.label || loc.address,
      `${loc.lat?.toFixed(6)}, ${loc.lng?.toFixed(6)}`,
      loc.plusCode ? `Plus Code: ${loc.plusCode}` : '',
      mapsLink
    ].filter(Boolean).join('\n');

    return `
      <div style="background:var(--primary-bg);border-radius:var(--radius-md);padding:12px;border:1px solid var(--primary-border);">
        <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:6px;">✅ Location Set</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;font-family:'DM Mono',monospace;">
          Lat: ${loc.lat?.toFixed(6)}<br>
          Lng: ${loc.lng?.toFixed(6)}<br>
          ${loc.plusCode ? `Plus Code: ${loc.plusCode}<br>` : ''}
          ${loc.formattedAddress ? `<span style="font-family:inherit;">${loc.formattedAddress}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" style="font-size:12px;padding:7px 12px;"
            data-copy="${encodeURIComponent(copyText)}">📋 Copy location</button>
          <a href="${mapsLink}" target="_blank" rel="noopener"
            style="display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:7px 12px;
            border-radius:var(--radius-md);border:1.5px solid var(--border);background:var(--surface);
            color:var(--primary);font-weight:600;text-decoration:none;">🗺️ Open in Maps</a>
          <button class="btn btn-secondary" style="font-size:12px;padding:7px 12px;color:var(--danger);"
            data-clear-loc="${fieldKey}">✕ Clear</button>
        </div>
      </div>
    `;
  }

  function renderMapPreview(loc) {
    if (!loc?.lat) return '';
    // OpenStreetMap static tile preview (no API key needed)
    const zoom = 16;
    const tileUrl = `https://tile.openstreetmap.org/${zoom}/`;
    // Use iframe-less embed: show a link-preview card with coordinates
    const osmEmbed = `https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng-0.005},${loc.lat-0.004},${loc.lng+0.005},${loc.lat+0.004}&layer=mapnik&marker=${loc.lat},${loc.lng}`;
    return `
      <div style="border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);height:160px;">
        <iframe src="${osmEmbed}" width="100%" height="160"
          style="border:none;display:block;" loading="lazy"
          title="Map location preview"></iframe>
      </div>
    `;
  }

  function bindLocationEvents(countryName, fieldKey) {
    // Address photos
    const photoEl = document.getElementById(`addr-photos-${fieldKey}`);
    if (photoEl) {
      if (!draft[fieldKey]) draft[fieldKey] = {};
      if (!draft[fieldKey].photos) draft[fieldKey].photos = [];
      renderPhotoSlots(photoEl, draft[fieldKey].photos, 2, (newPhotos) => {
        draft[fieldKey].photos = newPhotos;
      });
    }
    // Label + address live update
    document.querySelector(`.loc-label[data-loc="${fieldKey}"]`)?.addEventListener('input', e => {
      if (!draft[fieldKey]) draft[fieldKey] = {};
      draft[fieldKey].label = e.target.value;
      markDirty();
    });
    document.querySelector(`.loc-address[data-loc="${fieldKey}"]`)?.addEventListener('input', e => {
      if (!draft[fieldKey]) draft[fieldKey] = {};
      draft[fieldKey].address = e.target.value;
      markDirty();
    });

    // GPS
    document.querySelector(`[data-action="gps"][data-loc="${fieldKey}"]`)?.addEventListener('click', () => {
      if (!navigator.geolocation) { showToast('GPS not available on this device', 'error'); return; }
      const btn = document.querySelector(`[data-action="gps"][data-loc="${fieldKey}"]`);
      btn.textContent = '📡 Getting location…';
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          await applyCoordinates(fieldKey, lat, lng);
          btn.textContent = '📡 Use my current GPS location';
          btn.disabled = false;
        },
        (err) => {
          showToast('GPS error: ' + err.message, 'error');
          btn.textContent = '📡 Use my current GPS location';
          btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

    // Paste Google Maps / OSM link
    document.querySelector(`[data-action="paste"][data-loc="${fieldKey}"]`)?.addEventListener('click', async () => {
      const input = document.getElementById(`paste-link-${fieldKey}`);
      const text  = input.value.trim();
      if (!text) { showToast('Paste a Google Maps link, coordinates, or Plus Code', 'warning'); return; }

      const coords = extractCoordsFromUrl(text);
      if (!coords) { showToast('Format not recognised. Try: Google Maps link, coordinates (25.28, 51.53), or Plus Code (7HQG+XR)', 'error'); return; }

      await applyCoordinates(fieldKey, coords.lat, coords.lng);
      input.value = '';
    });

    // Search by address (OpenStreetMap Nominatim)
    document.querySelector(`[data-action="search"][data-loc="${fieldKey}"]`)?.addEventListener('click', async () => {
      const input   = document.getElementById(`search-addr-${fieldKey}`);
      const query   = input.value.trim();
      const results = document.getElementById(`search-results-${fieldKey}`);
      if (!query) { showToast('Enter an address to search', 'warning'); return; }

      results.innerHTML = `<div style="padding:8px;font-size:13px;color:var(--text-muted);">🔍 Searching…</div>`;

      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'FamilyHubApp/1.0' } });
        const places = await res.json();

        if (!places.length) {
          results.innerHTML = `<div style="padding:8px;font-size:13px;color:var(--text-muted);">No results found. Try a more specific address.</div>`;
          return;
        }

        results.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;">` +
          places.map((place, i) => `
            <button class="list-row search-result-btn" data-lat="${place.lat}" data-lng="${place.lon}"
              data-display="${encodeURIComponent(place.display_name)}"
              style="width:100%;text-align:left;border-radius:0;${i < places.length-1 ? '' : 'border-bottom:none;'}">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text);">${place.display_name.split(',').slice(0,2).join(',')}</div>
                <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${place.display_name}</div>
              </div>
              <span style="color:var(--primary);font-size:13px;font-weight:600;flex-shrink:0;">Select</span>
            </button>
          `).join('') + `</div>`;

        results.querySelectorAll('.search-result-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const lat  = parseFloat(btn.dataset.lat);
            const lng  = parseFloat(btn.dataset.lng);
            const addr = decodeURIComponent(btn.dataset.display);
            await applyCoordinates(fieldKey, lat, lng, addr);
            results.innerHTML = '';
            input.value = '';
          });
        });
      } catch (err) {
        results.innerHTML = `<div style="padding:8px;font-size:13px;color:var(--danger);">Search failed: ${err.message}</div>`;
      }
    });

    // Copy & clear buttons (delegated)
    document.getElementById(`coords-${fieldKey}`)?.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        const text = decodeURIComponent(copyBtn.dataset.copy);
        const ok = await copyToClipboard(text);
        if (ok) showToast('Location copied!', 'success');
      }
      const clearBtn = e.target.closest('[data-clear-loc]');
      if (clearBtn) {
        draft[fieldKey] = { label: draft[fieldKey]?.label, address: draft[fieldKey]?.address };
        markDirty();
        renderLocationsTab();
      }
    });
  }

  function extractCoordsFromUrl(url) {
    let m;
    m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);           if (m) return { lat: +m[1], lng: +m[2] };
    m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);      if (m) return { lat: +m[1], lng: +m[2] };
    m = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);          if (m) return { lat: +m[1], lng: +m[2] };
    m = url.match(/mlat=(-?\d+\.\d+).*mlon=(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
    m = url.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/); if (m) return { lat: +m[1], lng: +m[2] };
    // Google Plus Code -- e.g. "7HQG+XR Doha"
    const pcm = url.match(/([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i);
    if (pcm) {
      const decoded = decodePlusCode(pcm[1]);
      if (decoded) return decoded;
    }
    m = url.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);      if (m) return { lat: +m[1], lng: +m[2] };
    return null;
  }

  function decodePlusCode(code) {
    try {
      const ALPHA = '23456789CFGHJMPQRVWX';
      const clean = code.toUpperCase().replace(/\+/,'');
      if (clean.length < 6) return null;
      let lat = -90, lng = -180, latDeg = 20, lngDeg = 40;
      for (let i = 0; i < Math.min(clean.length, 8); i += 2) {
        const c1 = ALPHA.indexOf(clean[i]);
        const c2 = i+1 < clean.length ? ALPHA.indexOf(clean[i+1]) : 0;
        if (c1 < 0 || c2 < 0) return null;
        latDeg /= 20; lngDeg /= 20;
        lat += c1 * latDeg;
        lng += c2 * lngDeg;
      }
      return { lat: +(lat + latDeg/2).toFixed(6), lng: +(lng + lngDeg/2).toFixed(6) };
    } catch { return null; }
  }


  function generatePlusCode(lat, lng) {
    try {
      // Approximate Open Location Code (first 8 chars)
      const ALPHABET = '23456789CFGHJMPQRVWX';
      const encode = (val, lo, hi, steps) => {
        let code = '';
        val = Math.min(Math.max(val, lo), hi - 1e-10);
        val = (val - lo) / (hi - lo);
        for (let i = 0; i < steps; i++) {
          val *= 20;
          code += ALPHABET[Math.floor(val)];
          val -= Math.floor(val);
        }
        return code;
      };
      const latCode = encode(lat + 90,  0, 180, 4);
      const lngCode = encode(lng + 180, 0, 360, 4);
      const code = latCode[0] + lngCode[0] + latCode[1] + lngCode[1] +
                   latCode[2] + lngCode[2] + latCode[3] + lngCode[3];
      return code.slice(0,4) + '+' + code.slice(4);
    } catch { return ''; }
  }

  // ── TAB 3: EMERGENCY ───────────────────────────────────────────────────────
  function renderEmergencyTab() {
    const tab = document.getElementById('tab-content');
    const contacts = (draft.emergencyContacts || []).sort((a,b) => a.priority - b.priority);

    tab.innerHTML = `
      <div style="padding:20px;display:flex;flex-direction:column;gap:16px;">

        <!-- Contacts list -->
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Emergency Contacts</div>
          <button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" id="add-contact-btn">+ Add</button>
        </div>

        <div id="contacts-list" style="display:flex;flex-direction:column;gap:8px;">
          ${contacts.length === 0
            ? `<div style="font-size:13px;color:var(--text-muted);padding:8px 4px;">No emergency contacts added yet</div>`
            : contacts.map((c, i) => contactCard(c, i)).join('')}
        </div>

        <!-- Contact Picker (Android Chrome) -->
        ${('contacts' in navigator && 'ContactsManager' in window) ? `
          <button class="btn btn-secondary" id="contact-picker-btn" style="justify-content:flex-start;gap:10px;">
            <span style="font-size:20px;">📱</span>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:600;">Import from Phone Contacts</div>
              <div style="font-size:11px;color:var(--text-muted);">Pick directly from your contact list</div>
            </div>
          </button>` : ''}

        <div class="divider"></div>

        <!-- Emergency Card & QR -->
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Share Emergency Info</div>

        <div class="card" style="padding:0;overflow:hidden;">
          <div class="export-option" id="share-emergency-card">
            <div style="width:48px;height:48px;border-radius:12px;background:#FEE2E2;
              display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🆘</div>
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:600;">Emergency Card (PNG)</div>
              <div style="font-size:12px;color:var(--text-muted);">Share via WhatsApp, email, or save image</div>
            </div>
            <span style="color:var(--text-muted);">›</span>
          </div>
          <div class="divider"></div>
          <div class="export-option" id="show-qr-code">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--surface-3);
              display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">▣</div>
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:600;">QR Code</div>
              <div style="font-size:12px;color:var(--text-muted);">Scan in emergency -- no app needed</div>
            </div>
            <span style="color:var(--text-muted);">›</span>
          </div>
          <div class="divider"></div>
          <div class="export-option" id="copy-emergency-text">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--primary-bg);
              display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">📋</div>
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:600;">Copy as Text</div>
              <div style="font-size:12px;color:var(--text-muted);">WhatsApp-ready emergency info block</div>
            </div>
            <span style="color:var(--text-muted);">›</span>
          </div>
        </div>

        <!-- QR display area -->
        <div id="qr-display" style="display:none;text-align:center;"></div>

        <!-- Emergency card preview (hidden, for capture) -->
        <div id="emergency-card-preview" style="position:fixed;left:-9999px;top:-9999px;width:320px;"></div>
      </div>
    `;

    document.getElementById('add-contact-btn').addEventListener('click', () => openContactModal(null));

    // Contact Picker API
    document.getElementById('contact-picker-btn')?.addEventListener('click', async () => {
      try {
        const props    = ['name', 'tel'];
        const opts     = { multiple: false };
        const contacts = await navigator.contacts.select(props, opts);
        if (!contacts.length) return;
        const picked = contacts[0];
        openContactModal(null, {
          name:  picked.name?.[0] || '',
          phone: picked.tel?.[0]  || '',
        });
      } catch { showToast('Contact picker not available', 'error'); }
    });

    // Edit contacts
    tab.querySelectorAll('[data-edit-contact]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = contacts.find(c => c.id === btn.dataset.editContact);
        if (c) openContactModal(c);
      });
    });

    // Delete contacts
    tab.querySelectorAll('[data-delete-contact]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Remove this contact?')) return;
        draft.emergencyContacts = (draft.emergencyContacts || []).filter(c => c.id !== btn.dataset.deleteContact);
        markDirty();
        renderEmergencyTab();
      });
    });

    // Share Emergency Card
    document.getElementById('share-emergency-card').addEventListener('click', async () => {
      await shareEmergencyCard();
    });

    // QR Code
    document.getElementById('show-qr-code').addEventListener('click', () => {
      toggleQRCode();
    });

    // Copy text
    document.getElementById('copy-emergency-text').addEventListener('click', async () => {
      const text = buildEmergencyText(draft, documents);
      const ok = await copyToClipboard(text);
      if (ok) showToast('Emergency info copied!', 'success');
    });
  }

  function contactCard(contact, index) {
    return `
      <div style="background:var(--surface);border-radius:var(--radius-md);padding:12px 14px;
        border:1px solid var(--border);border-left:3px solid var(--primary);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-bg);
            display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;
            color:var(--primary);flex-shrink:0;">${index + 1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${contact.name}</div>
            <div style="font-size:12px;color:var(--text-muted);">${contact.relationship || 'Contact'}</div>
            <div style="font-size:13px;font-weight:600;color:var(--primary);margin-top:2px;">
              <a href="tel:${contact.phone}" style="color:inherit;text-decoration:none;">📞 ${contact.phone}</a>
            </div>
            ${contact.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${contact.description}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button data-edit-contact="${contact.id}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px;">✏️</button>
            <button data-delete-contact="${contact.id}" style="background:none;border:none;cursor:pointer;font-size:16px;padding:4px;">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  function openContactModal(existing, prefill = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const c = existing || {
      id: uuidv4(), name: prefill.name || '', phone: prefill.phone || '',
      relationship: '', description: '',
      priority: (draft.emergencyContacts || []).length + 1
    };
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div style="padding:0 20px 24px;">
          <div style="font-size:17px;font-weight:700;margin-bottom:16px;">
            ${existing ? 'Edit Contact' : 'Add Emergency Contact'}
          </div>
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-input" id="ec-name" value="${c.name}" placeholder="Contact name" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="tel" class="form-input" id="ec-phone" value="${c.phone}" placeholder="+91 98XXX XXXXX" />
          </div>
          <div class="form-group">
            <label class="form-label">Relationship</label>
            <select class="form-input" id="ec-relationship" style="padding:11px 12px;">
              <option value="">-- Select --</option>
              ${RELATIONSHIPS.map(r => `<option value="${r}" ${c.relationship === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description / Notes</label>
            <input type="text" class="form-input" id="ec-desc" value="${c.description || ''}" placeholder="e.g. Wife, lives in Doha" />
          </div>
          <div class="form-group">
            <label class="form-label">Priority (1 = call first)</label>
            <input type="number" class="form-input" id="ec-priority" value="${c.priority || 1}" min="1" max="10" />
          </div>
          <div id="ec-error" style="color:var(--danger);font-size:13px;margin-bottom:8px;min-height:16px;"></div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" style="flex:1;" id="ec-cancel">Cancel</button>
            <button class="btn btn-primary" style="flex:2;" id="ec-save">
              ${existing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#ec-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#ec-save').addEventListener('click', () => {
      const name  = modal.querySelector('#ec-name').value.trim();
      const phone = modal.querySelector('#ec-phone').value.trim();
      if (!name)  { modal.querySelector('#ec-error').textContent = 'Name is required'; return; }
      if (!phone) { modal.querySelector('#ec-error').textContent = 'Phone is required'; return; }

      const updated = {
        id:           c.id,
        name,
        phone,
        relationship: modal.querySelector('#ec-relationship').value,
        description:  modal.querySelector('#ec-desc').value.trim(),
        priority:     parseInt(modal.querySelector('#ec-priority').value) || 1,
      };

      if (!draft.emergencyContacts) draft.emergencyContacts = [];
      const idx = draft.emergencyContacts.findIndex(x => x.id === c.id);
      if (idx > -1) draft.emergencyContacts[idx] = updated;
      else draft.emergencyContacts.push(updated);

      markDirty();
      modal.remove();
      renderEmergencyTab();
    });
  }

  async function shareEmergencyCard() {
    // Build emergency card HTML, capture with html2canvas, share
    const memberDocs  = documents.filter(d => d.personId === draft.id);
    const contacts    = (draft.emergencyContacts || []).sort((a,b) => a.priority - b.priority);
    const cardEl      = document.getElementById('emergency-card-preview');
    const currentLoc  = draft.homeQatar; // simplified -- could detect from trips

    cardEl.style.cssText = `
      position:fixed;left:-9999px;top:0;width:340px;
      background:#fff;padding:20px;border-radius:16px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;
    cardEl.innerHTML = `
      <div style="background:#B91C1C;color:#fff;padding:14px 16px;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:28px;">🆘</div>
        <div>
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.8;">Emergency Contact Card</div>
          <div style="font-size:18px;font-weight:800;">${draft.name}</div>
          ${draft.bloodGroup ? `<div style="font-size:12px;margin-top:2px;">🩸 Blood Group: <strong>${draft.bloodGroup}</strong></div>` : ''}
        </div>
      </div>

      ${draft.medicalNotes ? `
        <div style="background:#FFF5F5;border:1px solid #FECACA;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#991B1B;">
          <strong>⚕️ Medical:</strong> ${draft.medicalNotes}
        </div>` : ''}

      <div style="margin-bottom:10px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6B7280;margin-bottom:6px;">Emergency Contacts</div>
        ${contacts.slice(0, 3).map((c, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#F9FAFB;border-radius:8px;margin-bottom:5px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#B91C1C;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">${i+1}</div>
            <div>
              <div style="font-size:13px;font-weight:700;">${c.name} <span style="font-weight:400;color:#6B7280;">(${c.relationship})</span></div>
              <div style="font-size:13px;color:#1D4ED8;">${c.phone}</div>
            </div>
          </div>`).join('')}
      </div>

      ${draft.homeQatar?.address ? `
        <div style="margin-bottom:10px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6B7280;margin-bottom:4px;">🏠 Address (Qatar)</div>
          <div style="font-size:12px;color:#374151;">${draft.homeQatar.label || ''} ${draft.homeQatar.address}</div>
          ${draft.homeQatar.lat ? `<div style="font-size:11px;color:#6B7280;">${draft.homeQatar.lat.toFixed(5)}, ${draft.homeQatar.lng.toFixed(5)}</div>` : ''}
        </div>` : ''}

      ${memberDocs.length ? `
        <div>
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6B7280;margin-bottom:4px;">🪪 Documents</div>
          ${memberDocs.map(d => {
            const dl = daysFromToday(d.expiryDate);
            return `<div style="font-size:11px;color:#374151;padding:2px 0;">${d.docName}: expires ${d.expiryDate} ${dl < 0 ? '⚠️ EXPIRED' : `(${dl}d)`}</div>`;
          }).join('')}
        </div>` : ''}

      <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:8px;font-size:10px;color:#9CA3AF;text-align:center;">
        Generated ${new Date().toLocaleDateString('en-GB')} · Family Hub App
      </div>
    `;

    if (!window.html2canvas) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    showToast('Generating card…', 'info', 1500);
    const canvas = await window.html2canvas(cardEl, { backgroundColor: '#fff', scale: 2, logging: false });

    canvas.toBlob(async (blob) => {
      const file = new File([blob], `${draft.name.replace(/\s+/g,'-')}-Emergency-Card.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${draft.name} -- Emergency Card` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
        showToast('Emergency card downloaded', 'success');
      }
    }, 'image/png');
  }

  function toggleQRCode() {
    const qrDiv = document.getElementById('qr-display');
    if (qrDiv.style.display !== 'none') { qrDiv.style.display = 'none'; return; }

    // Build compact vCard for QR
    const contacts = (draft.emergencyContacts || []).sort((a,b) => a.priority - b.priority);
    const qrData = [
      `BEGIN:VCARD`, `VERSION:3.0`,
      `FN:${draft.name}`,
      draft.phone     ? `TEL:${draft.phone}` : '',
      draft.bloodGroup ? `NOTE:Blood:${draft.bloodGroup}` : '',
      draft.medicalNotes ? `NOTE:Medical:${draft.medicalNotes.slice(0,100)}` : '',
      draft.homeQatar?.address ? `ADR:;;${draft.homeQatar.address};;;QA` : '',
      draft.homeIndia?.address ? `ADR:;;${draft.homeIndia.address};;;IN` : '',
      ...contacts.slice(0,3).map(c => `TEL;TYPE=EMERGENCY,${c.relationship}:${c.phone}`),
      `END:VCARD`
    ].filter(Boolean).join('\n');

    // Load QRCode.js
    const loadQR = window.QRCode
      ? Promise.resolve()
      : new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });

    loadQR.then(() => {
      qrDiv.style.display = 'block';
      qrDiv.innerHTML = `
        <div style="padding:16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text);">
            ▣ Emergency QR Code -- ${draft.name}
          </div>
          <div id="qr-canvas" style="display:flex;justify-content:center;margin-bottom:12px;"></div>
          <div style="font-size:11px;color:var(--text-muted);text-align:center;line-height:1.5;margin-bottom:12px;">
            Scan with any QR reader. Contains name, blood group,<br>emergency contacts, and home address.
          </div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-secondary" style="font-size:12px;padding:8px 16px;" id="download-qr">⬇️ Download</button>
            <button class="btn btn-secondary" style="font-size:12px;padding:8px 16px;" id="hide-qr">Hide</button>
          </div>
        </div>
      `;

      new window.QRCode(document.getElementById('qr-canvas'), {
        text: qrData, width: 220, height: 220,
        colorDark: '#0F172A', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });

      document.getElementById('hide-qr').addEventListener('click', () => {
        qrDiv.style.display = 'none';
      });

      document.getElementById('download-qr').addEventListener('click', () => {
        const canvas = qrDiv.querySelector('canvas');
        if (canvas) {
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = `${draft.name.replace(/\s+/g,'-')}-QR.png`;
          a.click();
          showToast('QR code downloaded', 'success');
        }
      });
    }).catch(() => showToast('Could not load QR generator', 'error'));
  }

  // ── TAB 4: DOCUMENTS ───────────────────────────────────────────────────────
  function renderDocumentsTab() {
    const tab = document.getElementById('tab-content');
    const memberDocs = documents.filter(d => d.personId === draft.id);

    const docIcons = { 'Passport':'🛂','QID':'🪪','Visa':'🔏','Driving Licence':'🚗','Other':'📄' };
    tab.innerHTML = `
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 4px 8px;">
          <span style="font-size:13px;color:var(--text-muted);">${memberDocs.length} document${memberDocs.length !== 1 ? 's' : ''}</span>
          <button class="btn btn-primary" style="padding:7px 14px;font-size:12px;" id="add-doc-for-member">+ Add Document</button>
        </div>
        ${memberDocs.length === 0
          ? `<div class="empty-state" style="padding:32px 0;">
               <div class="empty-state-icon">🪪</div>
               <div class="empty-state-text">No documents for ${draft.name} yet</div>
             </div>`
          : memberDocs.map(doc => {
              const daysLeft = daysFromToday(doc.expiryDate);
              const status   = expiryStatus(doc.expiryDate);
              const color    = expiryStatusColor(status);
              const pct      = Math.max(0, Math.min(100, daysLeft !== null ? Math.round((daysLeft/365)*100) : 0));
              return `
                <div class="doc-card status-${status}" data-doc-id="${doc.id}" style="cursor:pointer;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-size:20px;">${docIcons[doc.docName] || '📄'}</span>
                      <div>
                        <div style="font-size:14px;font-weight:700;">${doc.docName}</div>
                        <div style="font-size:12px;color:var(--text-muted);font-family:monospace;">
                          ···${(doc.docNumber || '').slice(-4) || '--'}
                        </div>
                      </div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:13px;font-weight:700;color:${color};">
                        ${daysLeft === null ? '--' : daysLeft < 0 ? 'EXPIRED' : `${daysLeft}d left`}
                      </div>
                      <div style="font-size:11px;color:var(--text-muted);">${doc.expiryDate}</div>
                    </div>
                  </div>
                  <div class="life-bar-track">
                    <div class="life-bar-fill" style="width:${pct}%;background:${color};"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-top:6px;">
                    <div style="display:flex;gap:4px;">
                      ${(doc.alertDays||[]).map(d => `<span style="background:var(--surface-3);color:var(--text-muted);font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;">${d}d</span>`).join('')}
                    </div>
                    <span style="font-size:11px;color:${doc.calSynced ? 'var(--success)' : 'var(--text-muted)'};">
                      ${doc.calSynced ? '📅 Synced' : '📅 Not synced'}
                    </span>
                  </div>
                </div>`;
            }).join('')}
      </div>
    `;

    document.getElementById('add-doc-for-member').addEventListener('click', () => {
      navigate('add-document', { personId: draft.id });
    });

    tab.querySelectorAll('[data-doc-id]').forEach(card => {
      card.addEventListener('click', () => navigate('add-document', { docId: card.dataset.docId, mode: 'edit' }));
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function saveMember() {
    const nameInput = document.getElementById('member-name');
    if (nameInput && !nameInput.value.trim()) {
      showToast('Please enter a name', 'warning');
      return;
    }

    // Collect all field values from whichever tab is active
    if (activeTab === 'profile') {
      draft.name          = document.getElementById('member-name')?.value.trim()   || draft.name;
      draft.dateOfBirth   = document.getElementById('dob')?.value                  || draft.dateOfBirth;
      draft.nationality   = document.getElementById('nationality')?.value           || draft.nationality;
      draft.bloodGroup    = document.getElementById('blood-group')?.value           || draft.bloodGroup;
      // Phone: combine country code + number
      const _pNum = document.getElementById('phone')?.value.trim();
      const _pCC  = document.getElementById('phone-cc')?.value || '+974';
      if (_pNum) draft.phone = _pCC + ' ' + _pNum;
      const _eNum = document.getElementById('employer-phone')?.value.trim();
      const _eCC  = document.getElementById('employer-phone-cc')?.value || '+974';
      if (_eNum) draft.employerPhone = _eCC + ' ' + _eNum;
      draft.email         = document.getElementById('email')?.value.trim()          || draft.email;
      draft.occupation    = document.getElementById('occupation')?.value.trim()     || draft.occupation;
      draft.employer      = document.getElementById('employer')?.value.trim()       || draft.employer;
      draft.employerPhone = document.getElementById('employer-phone')?.value.trim() || draft.employerPhone;
      draft.medicalNotes  = document.getElementById('medical-notes')?.value.trim()  || draft.medicalNotes;
      draft.personalNotes = document.getElementById('personal-notes')?.value.trim() || draft.personalNotes;
    }

    try {
      const btn = document.getElementById('save-btn');
      btn.textContent = '⏳';
      btn.disabled = true;

      const newData = await localSave('travel', (remote) => {
        const mems = remote.members || [];
        const idx  = mems.findIndex(m => m.id === draft.id);
        if (idx > -1) mems[idx] = draft;
        else mems.push(draft);
        return { ...remote, members: mems };
      });

      await setCachedTravelData(newData);
      hasUnsavedChanges = false;
      showToast('Profile saved!', 'success');
      btn.textContent = '💾 Save';
      btn.disabled = false;
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      document.getElementById('save-btn').textContent = '💾 Save';
      document.getElementById('save-btn').disabled = false;
    }
  }

  // ── Share profile as WhatsApp text ──────────────────────────────────────────
  async function shareProfileText() {
    const data2 = await import('../../../shared/db.js').then(m => m.getCachedTravelData());
    const docs = (data2?.documents || []).filter(d => d.personId === draft.id);
    const trips = (data2?.trips || []).filter(t => t.personId === draft.id);
    const totalDays = trips.reduce((s, t) => s + (t.daysInQatar || 0), 0);

    const lines = [
      '👤 *' + draft.name + '*',
    ];
    if (draft.nationality)  lines.push('🌍 ' + draft.nationality);
    if (draft.bloodGroup)   lines.push('🩸 Blood Group: ' + draft.bloodGroup);
    if (draft.phone)        lines.push('📞 ' + draft.phone);
    if (draft.email)        lines.push('📧 ' + draft.email);
    if (draft.occupation || draft.employer) {
      lines.push('💼 ' + [draft.occupation, draft.employer].filter(Boolean).join(' @ '));
    }

    if (docs.length) {
      lines.push('');
      lines.push('🪪 *Documents*');
      docs.forEach(d => {
        const days = d.expiryDate
          ? Math.floor((new Date(d.expiryDate) - new Date()) / 86400000) : null;
        const exp = days == null ? '' : days < 0 ? ' ⛔ EXPIRED' : ' (' + days + 'd left)';
        lines.push('  ' + d.docName + ': ' + (d.docNumber || '—') + exp);
      });
    }

    if (trips.length) {
      lines.push('');
      lines.push('✈️ *Travel: ' + trips.length + ' trips · ' + totalDays + 'd in Qatar*');
      const yr = {};
      trips.forEach(t => { const y = t.dateOutIndia?.slice(0,4)||'?'; yr[y] = (yr[y]||0)+(t.daysInQatar||0); });
      lines.push('  ' + Object.keys(yr).sort((a,b)=>b-a).map(y => y+': '+yr[y]+'d').join(' · '));
    }

    if (draft.homeQatar?.address || draft.homeQatar?.lat) {
      lines.push('');
      lines.push('🇶🇦 *Qatar*: ' + (draft.homeQatar.label || draft.homeQatar.address || ''));
      if (draft.homeQatar.plusCode) lines.push('  Plus Code: ' + draft.homeQatar.plusCode);
      if (draft.homeQatar.mapsUrl)  lines.push('  ' + draft.homeQatar.mapsUrl);
    }
    if (draft.homeIndia?.address || draft.homeIndia?.lat) {
      lines.push('');
      lines.push('🇮🇳 *India*: ' + (draft.homeIndia.label || draft.homeIndia.address || ''));
      if (draft.homeIndia.plusCode) lines.push('  Plus Code: ' + draft.homeIndia.plusCode);
      if (draft.homeIndia.mapsUrl)  lines.push('  ' + draft.homeIndia.mapsUrl);
    }

    lines.push('');
    lines.push('_Shared from Family Hub_');

    const text = lines.join('\n');
    const { copyToClipboard } = await import('../../../shared/utils.js');
    showTextShareSheet(text, draft.name + ' Profile');
  }

  function showTextShareSheet(text, title) {
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);padding:16px 20px 36px;box-shadow:0 -4px 24px rgba(0,0,0,0.2);';
    sheet.innerHTML = '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 14px;"></div>' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:12px;">' + title + '</div>' +
      '<pre style="font-size:12px;color:var(--text-secondary);background:var(--surface-3);border-radius:8px;padding:12px;max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;margin-bottom:14px;">' + text.replace(/</g,'&lt;') + '</pre>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button id="txt-share-btn" class="btn btn-primary btn-full">📤 Share via apps (WhatsApp…)</button>' +
        '<button id="txt-copy-btn" class="btn btn-secondary btn-full">📋 Copy to clipboard</button>' +
      '</div>';

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    const close = () => { sheet.remove(); backdrop.remove(); };
    backdrop.addEventListener('click', close);

    document.getElementById('txt-share-btn').addEventListener('click', async () => {
      if (navigator.share) {
        try { await navigator.share({ title, text }); close(); return; } catch {}
      }
      showToast('Share not available — use Copy instead', 'warning');
    });

    document.getElementById('txt-copy-btn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); showToast('✅ Copied! Paste in WhatsApp', 'success', 3000); }
      catch { showToast('Could not copy', 'error'); }
      close();
    });
  }

  render();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function createEmptyMember() {
  return {
    id: uuidv4(), name: '', emoji: '👤', color: '#EEF2FF',
    photo: null, dateOfBirth: null, nationality: '', bloodGroup: null,
    phone: '', email: '', occupation: '', employer: '', employerPhone: '',
    medicalNotes: '', personalNotes: '',
    homeQatar: null, homeIndia: null,
    emergencyContacts: [],
  };
}

async function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Max 400×400, JPEG quality 0.7 → ~40–80KB
        const MAX = 400;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildEmergencyText(member, documents) {
  const contacts   = (member.emergencyContacts || []).sort((a,b) => a.priority - b.priority);
  const memberDocs = documents.filter(d => d.personId === member.id);
  const date       = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  let text = `🆘 EMERGENCY INFORMATION -- ${member.name}\n`;
  text += `Generated: ${date}\n`;
  text += `─────────────────────────────\n`;
  if (member.bloodGroup) text += `🩸 Blood Group: ${member.bloodGroup}\n`;
  if (member.nationality) text += `🌍 Nationality: ${member.nationality}\n`;
  if (member.phone)       text += `📞 Phone: ${member.phone}\n`;
  if (member.medicalNotes) text += `⚕️ Medical: ${member.medicalNotes}\n`;
  text += `─────────────────────────────\n`;

  if (contacts.length) {
    text += `🚨 Emergency Contacts:\n`;
    contacts.forEach((c, i) => {
      text += `  ${i+1}. ${c.name} (${c.relationship}) -- ${c.phone}\n`;
      if (c.description) text += `     ${c.description}\n`;
    });
    text += `─────────────────────────────\n`;
  }

  if (member.homeQatar?.address) {
    text += `🇶🇦 Qatar Address:\n${member.homeQatar.label ? member.homeQatar.label + '\n' : ''}${member.homeQatar.address}\n`;
    if (member.homeQatar.lat) text += `📍 ${member.homeQatar.lat.toFixed(6)}, ${member.homeQatar.lng.toFixed(6)}\n`;
    if (member.homeQatar.mapsUrl) text += `🗺️ ${member.homeQatar.mapsUrl}\n`;
  }
  if (member.homeIndia?.address) {
    text += `🇮🇳 India Address:\n${member.homeIndia.label ? member.homeIndia.label + '\n' : ''}${member.homeIndia.address}\n`;
    if (member.homeIndia.lat) text += `📍 ${member.homeIndia.lat.toFixed(6)}, ${member.homeIndia.lng.toFixed(6)}\n`;
  }

  if (memberDocs.length) {
    text += `─────────────────────────────\n🪪 Documents:\n`;
    memberDocs.forEach(d => {
      const dl = daysFromToday(d.expiryDate);
      text += `  ${d.docName}: ${d.expiryDate} (${dl < 0 ? 'EXPIRED' : dl + 'd left'})\n`;
    });
  }

  return text;
}
