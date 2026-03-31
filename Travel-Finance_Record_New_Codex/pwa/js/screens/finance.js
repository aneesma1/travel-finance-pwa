export function renderFinanceScreen({ state }) {
  const rows = state.bootstrap.transactions;
  const content = rows.length
    ? rows.map((row) => `
        <div class="list-row">
          <div>
            <strong>${row.description || row.category || 'Transaction'}</strong>
            <p>${row.type || 'entry'}${row.account ? ' • ' + row.account : ''}</p>
          </div>
          <span>${row.amount || ''} ${row.currency || ''}</span>
        </div>
      `).join('')
    : '<p class="empty">No transactions loaded yet.</p>';

  return `
    <section class="screen-card">
      <p class="eyebrow">Finance</p>
      <h3>Transactions</h3>
      <div class="list">${content}</div>
    </section>
  `;
}