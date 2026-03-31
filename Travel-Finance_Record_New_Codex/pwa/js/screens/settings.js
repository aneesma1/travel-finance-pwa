export function renderSettingsScreen({ state }) {
  const apiUrl = state.apiBaseUrl || '';
  const lastSync = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : 'Not synced yet';

  return `
    <section class="screen-card">
      <p class="eyebrow">Settings</p>
      <h3>Connection</h3>
      <label for="api-url"><strong>Apps Script Web App URL</strong></label>
      <input id="api-url" type="url" value="${escapeHtml(apiUrl)}" placeholder="https://script.google.com/.../exec" style="width:100%;margin-top:10px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);" />
      <p style="margin-top:12px;color:var(--muted);">Last sync: ${lastSync}</p>
      <button id="save-api-url" class="primary-btn" type="button">Save URL</button>
    </section>
    <section class="screen-card">
      <p class="eyebrow">Scope</p>
      <h3>Phase 1 focus</h3>
      <p class="empty">This first scaffold supports a bootstrap fetch only. CRUD routes and offline queue replay will come next.</p>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}