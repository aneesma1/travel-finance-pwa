// v2.2 — 2026-03-18
// ─── app-b-private-vault/js/screens/transactions.js ─────────────────────────
// Full transaction list with filter bar, running balance, swipe-to-delete

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { navigate } from '../router.js';
import { txnRow } from './dashboard.js';
import {
  formatAmount, currentMonth, currentYear,
  getHashParams, setHashParams, clearHashParams,
  showToast
} from '../../../shared/utils.js';

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENCIES = ['QAR','INR','USD'];

export async function renderTransactions(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">📋 Transactions</span>
      <button class="app-header-action" id="export-btn" title="Export">📤</button>
    </div>
    <div id="filter-bar-wrap"></div>
    <div id="balance-bar" class="running-balance hidden"></div>
    <div id="txn-list-wrap"></div>
    <button class="fab" id="add-fab">＋</button>
  `;

  document.getElementById('add-fab').addEventListener('click', () => navigate('add-transaction'));
  document.getElementById('export-btn').addEventListener('click', () => navigate('settings', { tab: 'export' }));

  const data = await getCachedFinanceData();
  if (!data) { renderEmpty(document.getElementById('txn-list-wrap')); return; }

  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data;
  const allCategories = [...new Set(transactions.map(t => t.category1).filter(Boolean))];
  const allAccounts   = ['Cash','Card','Bank','Other', ...savedAccounts];

  const p = getHashParams();
  const activeCurrency = p.currency || 'QAR';
  const activeYear     = p.year   ? Number(p.year)  : currentYear();
  const activeMonth    = p.month  ? Number(p.month) : 0;
  const activeCategory = p.category || '';
  const activeAccount  = p.account  || '';

  renderFilterBar();
  renderList();

  function renderFilterBar() {
    const years = [...new Set(transactions.map(t => t.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));
    const activeCount = [activeCategory, activeAccount, activeMonth !== 0].filter(Boolean).length;

    document.getElementById('filter-bar-wrap').innerHTML = `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);">
        <div style="padding:10px 16px 0;">
          <div class="currency-tabs">
            ${CURRENCIES.map(c => `
              <button class="currency-tab ${activeCurrency === c ? 'active' : ''}" data-currency="${c}">${c}</button>
            `).join('')}
          </div>
        </div>
        <div class="filter-bar" style="border-bottom:none;padding-top:8px;">
          <div class="filter-chips">
            ${years.map(y => `
              <button class="filter-chip ${activeYear === Number(y) ? 'active' : ''}" data-year="${y}">${y}</button>
            `).join('')}
            <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px;"></div>
            <button class="filter-chip ${!activeMonth ? 'active' : ''}" data-month="0">All</button>
            ${MONTHS.map((m,i) => `
              <button class="filter-chip ${activeMonth === i+1 ? 'active' : ''}" data-month="${i+1}">${m}</button>
            `).join('')}
            ${allCategories.length ? `
              <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px;"></div>
              ${allCategories.map(c => `
                <button class="filter-chip ${activeCategory === c ? 'active' : ''}" data-category="${c}">🏷 ${c}</button>
              `).join('')}
            ` : ''}
            <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px;"></div>
            ${allAccounts.map(a => `
              <button class="filter-chip ${activeAccount === a ? 'active' : ''}" data-account="${a}">${a}</button>
            `).join('')}
            ${activeCount > 0 ? `<button id="clear-filters" class="filter-clear">✕ Clear</button>` : ''}
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('[data-currency]').forEach(btn =>
      btn.addEventListener('click', () => { setHashParams({ currency: btn.dataset.currency }); renderTransactions(container); }));
    document.querySelectorAll('[data-year]').forEach(btn =>
      btn.addEventListener('click', () => { setHashParams({ year: btn.dataset.year }); renderTransactions(container); }));
    document.querySelectorAll('[data-month]').forEach(btn =>
      btn.addEventListener('click', () => { setHashParams({ month: Number(btn.dataset.month) || null }); renderTransactions(container); }));
    document.querySelectorAll('[data-category]').forEach(btn =>
      btn.addEventListener('click', () => { setHashParams({ category: activeCategory === btn.dataset.category ? null : btn.dataset.category }); renderTransactions(container); }));
    document.querySelectorAll('[data-account]').forEach(btn =>
      btn.addEventListener('click', () => { setHashParams({ account: activeAccount === btn.dataset.account ? null : btn.dataset.account }); renderTransactions(container); }));
    document.getElementById('clear-filters')?.addEventListener('click', () => { clearHashParams(); renderTransactions(container); });
  }

  function renderList() {
    // Filter
    let filtered = transactions.filter(t => {
      if (t.currency !== activeCurrency) return false;
      if (activeYear   && t.date?.slice(0,4)    !== String(activeYear))  return false;
      if (activeMonth  && Number(t.date?.slice(5,7)) !== activeMonth)    return false;
      if (activeCategory && t.category1 !== activeCategory)              return false;
      if (activeAccount  && t.account   !== activeAccount)               return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Running balance bar
    const totalIncome = filtered.reduce((s,t) => s + (Number(t.income)      || 0), 0);
    const totalSpend  = filtered.reduce((s,t) => s + (Number(t.amountSpend) || 0), 0);
    const net = totalIncome - totalSpend;

    const balanceBar = document.getElementById('balance-bar');
    if (filtered.length > 0) {
      balanceBar.classList.remove('hidden');
      balanceBar.innerHTML = `
        <div class="balance-item">
          <div class="balance-item-label">In</div>
          <div class="balance-item-value" style="color:var(--success);">+${formatAmount(totalIncome)}</div>
        </div>
        <div class="balance-item">
          <div class="balance-item-label">Out</div>
          <div class="balance-item-value" style="color:var(--danger);">-${formatAmount(totalSpend)}</div>
        </div>
        <div style="width:1px;background:var(--primary-border);align-self:stretch;margin:0 4px;"></div>
        <div class="balance-item">
          <div class="balance-item-label">Net · ${activeCurrency}</div>
          <div class="balance-item-value" style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'};">
            ${net >= 0 ? '+' : ''}${formatAmount(net)}
          </div>
        </div>
        <div style="margin-left:auto;font-size:12px;color:var(--primary);font-weight:600;align-self:center;">
          ${filtered.length} records
        </div>
      `;
    }

    const wrap = document.getElementById('txn-list-wrap');
    if (!filtered.length) { renderEmpty(wrap); return; }

    // Group by month
    const groups = {};
    filtered.forEach(t => {
      const key = t.date?.slice(0, 7) || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    wrap.innerHTML = Object.entries(groups).map(([monthKey, txns]) => {
      const [yr, mo] = monthKey.split('-');
      const label = `${MONTHS[Number(mo)-1] || ''} ${yr}`;
      const gIncome = txns.reduce((s,t) => s + (Number(t.income) || 0), 0);
      const gSpend  = txns.reduce((s,t) => s + (Number(t.amountSpend) || 0), 0);

      return `
        <div style="background:var(--surface-3);padding:8px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-light);">
          <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
          <span style="font-size:12px;color:var(--text-muted);">
            ${gIncome > 0 ? `<span style="color:var(--success);font-weight:600;">+${formatAmount(gIncome)}</span> ` : ''}
            ${gSpend  > 0 ? `<span style="color:var(--danger);font-weight:600;">-${formatAmount(gSpend)}</span>` : ''}
          </span>
        </div>
        <div style="background:var(--surface);">
          ${txns.map((t, i) => buildSwipeRow(t, i === txns.length - 1)).join('')}
        </div>
      `;
    }).join('');

    // Bind tap events
    wrap.querySelectorAll('.txn-tap').forEach(row => {
      row.addEventListener('click', () => navigate('add-transaction', { txnId: row.dataset.id, mode: 'edit' }));
    });
  }

  function buildSwipeRow(t, isLast) {
    return `
      <div style="position:relative;overflow:hidden;">
        ${txnRow(t, isLast)}
        <div class="swipe-delete-reveal" data-id="${t.id}" style="
          position:absolute;right:0;top:0;bottom:0;width:80px;
          background:var(--danger);display:flex;align-items:center;justify-content:center;
          flex-direction:column;color:#fff;font-size:12px;font-weight:600;
          transform:translateX(100%);transition:transform 0.2s;cursor:pointer;
        ">
          <span style="font-size:20px;">🗑️</span>Delete
        </div>
      </div>`;
  }

  // Swipe & delete
  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchend',   handleTouchEnd,   { passive: true });

  let touchStartX = 0, touchTarget = null;

  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchTarget = e.target.closest('.txn-tap');
  }

  function handleTouchEnd(e) {
    if (!touchTarget) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const container = touchTarget.closest('[style*="overflow:hidden"]');
    const reveal = container?.querySelector('.swipe-delete-reveal');
    if (!reveal) return;
    if (dx < -60) {
      reveal.style.transform = 'translateX(0)';
      touchTarget.style.transform = 'translateX(-80px)';
    } else if (dx > 20) {
      reveal.style.transform = 'translateX(100%)';
      touchTarget.style.transform = 'translateX(0)';
    }
    touchTarget = null;
  }

  document.getElementById('txn-list-wrap').addEventListener('click', async (e) => {
    const del = e.target.closest('.swipe-delete-reveal');
    if (!del) return;
    if (!confirm('Delete this transaction?')) return;
    const id = del.dataset.id;
    try {
      const newData = await writeData('finance', (remote) => ({
        ...remote,
        transactions: (remote.transactions || []).filter(t => t.id !== id)
      }));
      await setCachedFinanceData(newData);
      showToast('Deleted', 'success');
      renderTransactions(container);
    } catch { showToast('Delete failed', 'error'); }
  });
}

function renderEmpty(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">No transactions</div>
      <div class="empty-state-text">Tap + to record your first transaction</div>
    </div>`;
}
