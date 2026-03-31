function metricCard(label, value, hint) {
  return `
    <article class="metric">
      <span class="kicker">${label}</span>
      <strong>${value}</strong>
      <p>${hint}</p>
    </article>
  `;
}

export function renderDashboardScreen({ state }) {
  const people = state.bootstrap.people.length;
  const trips = state.bootstrap.trips.length;
  const documents = state.bootstrap.documents.length;
  const transactions = state.bootstrap.transactions.length;

  return `
    <section class="screen-card">
      <p class="eyebrow">Overview</p>
      <h3>Bootstrap summary</h3>
      <div class="metric-grid">
        ${metricCard('People', people, 'Shared identity records ready for travel and document views.')}
        ${metricCard('Trips', trips, 'Travel logs will be listed here once the sheet is connected.')}
        ${metricCard('Documents', documents, 'Expiry records will feed this section.')}
        ${metricCard('Transactions', transactions, 'Finance totals will come from the Transactions sheet.')}
      </div>
    </section>
    <section class="screen-card">
      <p class="eyebrow">Next step</p>
      <h3>Connect the Apps Script URL</h3>
      <p class="empty">Open Settings, paste the deployed Apps Script web app URL, and use Refresh to load the spreadsheet payload.</p>
    </section>
  `;
}