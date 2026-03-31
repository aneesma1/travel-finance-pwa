export function renderDocumentsScreen({ state }) {
  const rows = state.bootstrap.documents;
  const content = rows.length
    ? rows.map((row) => `
        <div class="list-row">
          <div>
            <strong>${row.personName || 'Unknown person'}</strong>
            <p>${row.documentType || 'Document'}${row.documentNumber ? ' • ' + row.documentNumber : ''}</p>
          </div>
          <span>${row.expiryDate || ''}</span>
        </div>
      `).join('')
    : '<p class="empty">No documents loaded yet.</p>';

  return `
    <section class="screen-card">
      <p class="eyebrow">Documents</p>
      <h3>Expiry records</h3>
      <div class="list">${content}</div>
    </section>
  `;
}