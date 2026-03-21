// v3.2.1 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── app-a-family-hub/js/roles.js ───────────────────────────────────────────
// Admin / Viewer role system for App A — Family Hub
// Roles stored in travel_data.json under data.roles: { email: 'admin'|'viewer' }
// The signed-in account's email is checked on every boot.
// Only admin can edit, add, delete, import, export.

'use strict';

let _currentRole = 'viewer'; // default safe — upgraded after data loads

export function setCurrentRole(role) {
  _currentRole = role || 'viewer';
}

export function isAdmin() {
  return _currentRole === 'admin';
}

// ── Apply role restrictions to the DOM ───────────────────────────────────────
// Call after every screen render. Hides/disables edit controls for viewers.
export function applyRoleRestrictions() {
  if (isAdmin()) return; // Admin sees everything

  // Hide FABs (add buttons)
  document.querySelectorAll('.fab, #add-trip-fab, #add-doc-fab, #add-person-fab')
    .forEach(el => el.style.display = 'none');

  // Hide edit/delete/add buttons
  document.querySelectorAll(
    '[id$="-edit-btn"], [id^="edit-"], [id^="delete-"], [id^="add-"], ' +
    '.edit-btn, .delete-btn, .btn-primary[id*="save"], ' +
    '#import-btn, #backup-btn, #restore-local-btn, #restore-mirror-btn'
  ).forEach(el => el.style.display = 'none');

  // Make list rows non-interactive
  document.querySelectorAll('.trip-row, .doc-card, [data-trip-id]')
    .forEach(el => {
      el.style.cursor = 'default';
      el.style.pointerEvents = 'none';
    });

  // Add viewer badge to header
  const header = document.querySelector('.app-header-title');
  if (header && !header.querySelector('.viewer-badge')) {
    const badge = document.createElement('span');
    badge.className = 'viewer-badge';
    badge.textContent = '👁 View only';
    badge.style.cssText = 'font-size:11px;font-weight:400;color:var(--text-muted);margin-left:8px;';
    header.appendChild(badge);
  }
}

// ── Resolve role from data ────────────────────────────────────────────────────
export function resolveRole(data, userEmail) {
  if (!data || !userEmail) return 'viewer';
  const roles = data.roles || {};

  // If no roles defined yet — first run — treat signed-in user as admin
  if (Object.keys(roles).length === 0) {
    return 'admin';
  }

  return roles[userEmail.toLowerCase()] || 'viewer';
}

// ── Render Access Control in settings ────────────────────────────────────────
export function renderAccessControl(container, data, userEmail, onSave) {
  const roles = data.roles || {};
  const members = Object.entries(roles);

  container.innerHTML = `
    <div style="padding:0 16px;">
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
        Control who can edit family data. Viewers can see everything but cannot add, edit, or delete.
      </div>

      <div id="roles-list" style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;margin-bottom:12px;">
        ${members.length === 0 ? `
          <div style="padding:16px;font-size:13px;color:var(--text-muted);">
            No access rules set yet. Add family member emails below.
          </div>
        ` : members.map(([email, role], idx) => {
          const isYou = email.toLowerCase() === userEmail.toLowerCase();
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;${idx < members.length-1 ? 'border-bottom:1px solid var(--border-light);' : ''}">
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:500;">${email}</div>
                <div style="font-size:11px;color:var(--text-muted);">${isYou ? 'You' : ''} · ${role === 'admin' ? '👑 Admin' : '👁 Viewer'}</div>
              </div>
              ${!isYou ? `
                <select data-email="${email}" class="role-select" style="padding:6px 10px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);font-size:13px;">
                  <option value="admin" ${role==='admin'?'selected':''}>👑 Admin</option>
                  <option value="viewer" ${role==='viewer'?'selected':''}>👁 Viewer</option>
                </select>
                <button data-remove="${email}" style="background:none;border:1px solid var(--danger-bg);border-radius:8px;padding:5px 10px;color:var(--danger);font-size:13px;cursor:pointer;">Remove</button>
              ` : `<span style="font-size:12px;color:var(--primary);font-weight:600;">Admin (you)</span>`}
            </div>
          `;
        }).join('')}
      </div>

      <div style="display:flex;gap:8px;">
        <input id="new-email-input" type="email" class="form-input" placeholder="family@gmail.com" style="flex:1;" />
        <select id="new-role-select" style="padding:10px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);font-size:14px;">
          <option value="viewer">👁 Viewer</option>
          <option value="admin">👑 Admin</option>
        </select>
        <button id="add-role-btn" class="btn btn-primary" style="padding:10px 14px;white-space:nowrap;">Add</button>
      </div>
    </div>
  `;

  // Handle role change
  container.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', () => {
      roles[sel.dataset.email] = sel.value;
      onSave({ ...data, roles });
    });
  });

  // Handle remove
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.remove;
      if (!confirm(`Remove access for ${email}?`)) return;
      delete roles[email];
      onSave({ ...data, roles });
    });
  });

  // Handle add
  document.getElementById('add-role-btn').addEventListener('click', () => {
    const email = document.getElementById('new-email-input').value.trim().toLowerCase();
    const role  = document.getElementById('new-role-select').value;
    if (!email || !email.includes('@')) { return; }
    if (roles[email]) { return; }
    roles[email] = role;
    onSave({ ...data, roles });
  });
}
