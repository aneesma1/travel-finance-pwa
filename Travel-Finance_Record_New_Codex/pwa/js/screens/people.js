export function renderPeopleScreen({ state }) {
  const rows = state.bootstrap.people;
  const content = rows.length
    ? rows.map((row) => `
        <div class="list-row">
          <div>
            <strong>${row.name || 'Unnamed person'}</strong>
            <p>${row.nationality || 'No nationality set'}</p>
          </div>
          <span>${row.phone || ''}</span>
        </div>
      `).join('')
    : '<p class="empty">No people loaded yet.</p>';

  return `
    <section class="screen-card">
      <p class="eyebrow">People</p>
      <h3>Directory</h3>
      <div class="list">${content}</div>
    </section>
  `;
}