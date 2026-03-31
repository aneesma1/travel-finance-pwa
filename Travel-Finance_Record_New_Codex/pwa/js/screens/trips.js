export function renderTripsScreen({ state }) {
  const rows = state.bootstrap.trips;
  const content = rows.length
    ? rows.map((row) => `
        <div class="list-row">
          <div>
            <strong>${row.personName || 'Unknown traveler'}</strong>
            <p>${row.fromCountry || '-'} to ${row.toCountry || '-'}</p>
          </div>
          <span>${row.dateOut || ''}</span>
        </div>
      `).join('')
    : '<p class="empty">No trips loaded yet.</p>';

  return `
    <section class="screen-card">
      <p class="eyebrow">Trips</p>
      <h3>Travel records</h3>
      <div class="list">${content}</div>
    </section>
  `;
}