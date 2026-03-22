// v3.3.5 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── app-b-private-vault/js/screens/dashboard.js ────────────────────────────
// Finance Vault Dashboard
// Summary cards: Income / Spend / Net per currency
// Recent transactions list, filter bar, share dashboard

'use strict';

import { getCachedFinanceData } from '../../../shared/db.js';
import { navigate } from '../router.js';
import {
  formatAmount, currentMonth, currentYear,
  getHashParams, setHashParams, clearHashParams,
  showToast, copyToClipboard, today
} from '../../../shared/utils.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENCIES = ['QAR','INR','USD'];

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">🔐 Private Vault</span>
      <div style="display:flex;gap:8px;">
        <button class="app-header-action" id="share-btn" title="Share">⬆️</button>
        <button class="app-header-action" id="refresh-btn" title="Refresh">🔄</button>
      </div>
    </div>
    <div id="filter-bar-wrap"></div>
    <div id="dash-content" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;justify-content:center;padding:40px 0;"><div class="spinner"></div></div>
    </div>
    <button class="fab" id="add-fab">＋</button>
    <div id="share-anchor" style="position:fixed;bottom:80px;right:20px;z-index:150;"></div>
  `;

  document.getElementById('add-fab').addEventListener('click', () => navigate('add-transaction'));
  document.getElementById('refresh-btn').addEventListener('click', () => renderDashboard(container));
  document.getElementById('share-btn').addEventListener('click', toggleSharePopup);

  const data = await getCachedFinanceData();
  if (!data) {
    document.getElementById('dash-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💰</div>
        <div class="empty-state-title">No data yet</div>
        <div class="empty-state-text">Add your first transaction to get started</div>
      </div>`;
    return;
  }

  const { transactions = [], categories = [] } = data;

  // Read filters from URL hash
  const p = getHashParams();
  const activeCurrency = p.currency || 'QAR';
  const activeYear     = p.year     ? Number(p.year)  : currentYear();
  const activeMonth    = p.month    ? Number(p.month) : currentMonth();
  const activeCategory = p.category || '';
  const activeAccount  = p.account  || '';

  renderFilterBar({ activeCurrency, activeYear, activeMonth, activeCategory, activeAccount, transactions, categories });
  renderContent({ transactions, activeCurrency, activeYear, activeMonth, activeCategory, activeAccount });

  // ── Filter bar ──────────────────────────────────────────────────────
  function renderFilterBar({ activeCurrency, activeYear, activeMonth, activeCategory, activeAccount, transactions, categories }) {
    const years = [...new Set(transactions.map(t => t.date?.slice(0,4)).filter(y => y && Number(y) >= 2000 && Number(y) <= 2100))].sort((a,b) => b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));
    const allCategories = [...new Set(transactions.map(t => t.category1).filter(Boolean))];
    const allAccounts   = ['Cash','Card','Bank','Other'];
    const activeCount   = [activeCategory, activeAccount, activeMonth !== currentMonth(), activeYear !== currentYear()].filter(Boolean).length;

    document.getElementById('filter-bar-wrap').innerHTML = `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);">
        <!-- Currency tabs -->
        <div style="padding:10px 16px 0;">
          <div class="currency-tabs">
            ${CURRENCIES.map(c => `
              <button class="currency-tab ${activeCurrency === c ? 'active' : ''}" data-currency="${c}">${c}</button>
            `).join('')}
          </div>
        </div>
        <!-- Scroll chips -->
        <div class="filter-bar" style="border-bottom:none;padding-top:8px;">
          <div class="filter-chips">
            ${years.map(y => `
              <button class="filter-chip ${activeYear === Number(y) ? 'active' : ''}" data-year="${y}">${y}</button>
            `).join('')}
            <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px;"></div>
            <button class="filter-chip ${!activeMonth ? 'active' : ''}" data-month="0">All year</button>
            ${MONTHS.map((m, i) => `
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

    // Bind currency tabs
    document.querySelectorAll('[data-currency]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ currency: btn.dataset.currency });
        renderDashboard(container);
      });
    });

    // Bind year chips
    document.querySelectorAll('[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ year: Number(btn.dataset.year) !== currentYear() ? btn.dataset.year : null });
        renderDashboard(container);
      });
    });

    // Bind month chips
    document.querySelectorAll('[data-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = Number(btn.dataset.month);
        setHashParams({ month: m !== 0 ? m : null });
        renderDashboard(container);
      });
    });

    // Category
    document.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ category: activeCategory === btn.dataset.category ? null : btn.dataset.category });
        renderDashboard(container);
      });
    });

    // Account
    document.querySelectorAll('[data-account]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHashParams({ account: activeAccount === btn.dataset.account ? null : btn.dataset.account });
        renderDashboard(container);
      });
    });

    document.getElementById('clear-filters')?.addEventListener('click', () => {
      clearHashParams();
      renderDashboard(container);
    });
  }

  // ── Main content ────────────────────────────────────────────────────
  function renderContent({ transactions, activeCurrency, activeYear, activeMonth, activeCategory, activeAccount }) {
    // Apply all filters
    let filtered = transactions.filter(t => {
      if (t.currency !== activeCurrency) return false;
      if (activeYear  && t.date?.slice(0,4) !== String(activeYear))  return false;
      if (activeMonth && Number(t.date?.slice(5,7)) !== activeMonth)  return false;
      if (activeCategory && t.category1 !== activeCategory)           return false;
      if (activeAccount  && t.account   !== activeAccount)            return false;
      return true;
    });

    // Totals
    const totalIncome = filtered.reduce((s, t) => s + (Number(t.income)      || 0), 0);
    const totalSpend  = filtered.reduce((s, t) => s + (Number(t.amountSpend) || 0), 0);
    const net         = totalIncome - totalSpend;

    const content = document.getElementById('dash-content');

    // Period label
    const periodLabel = activeMonth
      ? `${MONTHS[activeMonth-1]} ${activeYear}`
      : `${activeYear}`;

    content.innerHTML = `
      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;" id="summary-cards">
        ${summaryCard('💰 Income',  totalIncome, activeCurrency, 'var(--success)')}
        ${summaryCard('💸 Spend',   totalSpend,  activeCurrency, 'var(--danger)')}
      </div>
      <!-- Net balance full width -->
      <div style="background:var(--surface);border-radius:var(--radius-lg);padding:16px 20px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Net Balance · ${periodLabel}</div>
          <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px;color:${net >= 0 ? 'var(--success)' : 'var(--danger)'};">
            ${net >= 0 ? '+' : ''}${formatAmount(net)} <span style="font-size:14px;font-weight:600;">${activeCurrency}</span>
          </div>
        </div>
        <div style="font-size:36px;">${net >= 0 ? '📈' : '📉'}</div>
      </div>

      <!-- Recent transactions header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 4px 0;">
        <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">
          Recent · ${filtered.length} record${filtered.length !== 1 ? 's' : ''}
        </span>
        ${filtered.length > 10 ? `
          <button style="font-size:12px;color:var(--primary);font-weight:600;background:none;border:none;cursor:pointer;" id="view-all-btn">
            View all →
          </button>` : ''}
      </div>

      <div id="recent-list" style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;"></div>
    `;

    document.getElementById('view-all-btn')?.addEventListener('click', () => navigate('transactions'));

    const recent = [...filtered].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    renderRecentList(recent);
  }

  function summaryCard(label, amount, currency, color) {
    return `
      <div style="background:var(--surface);border-radius:var(--radius-lg);padding:14px 16px;border:1px solid var(--border);">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color};font-family:'DM Mono',monospace;letter-spacing:-0.5px;">
          ${formatAmount(amount)}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${currency}</div>
      </div>`;
  }

  function renderRecentList(txns) {
    const list = document.getElementById('recent-list');
    if (!txns.length) {
      list.innerHTML = `<div class="empty-state" style="padding:32px 20px;">
        <div class="empty-state-icon" style="font-size:32px;">📭</div>
        <div class="empty-state-text">No transactions for this period</div>
      </div>`;
      return;
    }
    list.innerHTML = txns.map((t, i) => txnRow(t, i === txns.length - 1)).join('');
    list.querySelectorAll('.txn-tap').forEach(row => {
      row.addEventListener('click', () => navigate('transaction-view', { txnId: row.dataset.id }));
    });
  }

  // ── Share ────────────────────────────────────────────────────────────
  function toggleSharePopup() {
    const anchor = document.getElementById('share-anchor');
    if (anchor.querySelector('.share-popup')) { anchor.innerHTML = ''; return; }
    anchor.innerHTML = `
      <div class="share-popup slide-in">
        <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Share Dashboard</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-secondary" id="share-img-btn" style="justify-content:flex-start;gap:10px;">
            <span style="font-size:20px;">🖼️</span>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:600;">Share as image</div>
              <div style="font-size:11px;color:var(--text-muted);">PNG via share sheet</div>
            </div>
          </button>
          <button class="btn btn-secondary" id="copy-txt-btn" style="justify-content:flex-start;gap:10px;">
            <span style="font-size:20px;">📋</span>
            <div style="text-align:left;">
              <div style="font-size:14px;font-weight:600;">Copy as text</div>
              <div style="font-size:11px;color:var(--text-muted);">WhatsApp-ready format</div>
            </div>
          </button>
        </div>
      </div>`;
    document.getElementById('share-img-btn').addEventListener('click', () => { anchor.innerHTML = ''; shareImage(); });
    document.getElementById('copy-txt-btn').addEventListener('click', () => { anchor.innerHTML = ''; copyText(); });
    setTimeout(() => {
      document.addEventListener('click', e => {
        if (!anchor.contains(e.target) && e.target.id !== 'share-btn') anchor.innerHTML = '';
      }, { once: true });
    }, 10);
  }

  async function shareImage() {
    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      showToast('Capturing…', 'info', 1500);
      const target = document.getElementById('dash-content');
      const canvas = await window.html2canvas(target, { backgroundColor: '#F8FAFC', scale: 2, logging: false });
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `vault-${today()}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Finance Summary' });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `vault-${today()}.png`; a.click();
          URL.revokeObjectURL(url);
          showToast('Image downloaded', 'success');
        }
      }, 'image/png');
    } catch { showToast('Could not capture image', 'error'); }
  }

  async function copyText() {
    const data = await getCachedFinanceData();
    if (!data) return;
    const { transactions = [] } = data;
    const p = getHashParams();
    const cur = p.currency || 'QAR';
    const yr  = p.year  ? Number(p.year)  : currentYear();
    const mo  = p.month ? Number(p.month) : currentMonth();

    const filtered = transactions.filter(t =>
      t.currency === cur &&
      t.date?.slice(0,4) === String(yr) &&
      (!mo || Number(t.date?.slice(5,7)) === mo)
    );

    const inc  = filtered.reduce((s,t) => s + (Number(t.income) || 0), 0);
    const spnd = filtered.reduce((s,t) => s + (Number(t.amountSpend) || 0), 0);
    const net  = inc - spnd;
    const recent3 = [...filtered].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,3);
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    const period  = mo ? `${MONTHS[mo-1]} ${yr}` : String(yr);

    let text = `💰 Finance Summary -- ${dateStr}\n`;
    text += `─────────────────────────────\n`;
    text += `Period: ${period}\n\n`;
    text += `${cur} Income: ${formatAmount(inc)}   Spend: ${formatAmount(spnd)}   Net: ${net >= 0 ? '+' : ''}${formatAmount(net)}\n`;
    text += `─────────────────────────────\n`;
    if (recent3.length) {
      text += `Last ${recent3.length} transactions:\n`;
      recent3.forEach(t => {
        const amt = t.amountSpend ? `${cur} ${formatAmount(t.amountSpend)}` : `+${cur} ${formatAmount(t.income)}`;
        text += `  • ${t.description || '--'} -- ${amt} (${t.account || '--'}) -- ${t.date}\n`;
      });
      text += `─────────────────────────────\n`;
    }
    text += `Private Vault (filtered view)`;

    const ok = await copyToClipboard(text);
    if (ok) showToast('Copied to clipboard!', 'success');
    else    showToast('Copy failed', 'error');
  }
}

// ── Shared transaction row renderer (used by dashboard + transaction list) ──
export function txnRow(t, isLast = false) {
  const hasSpend  = t.amountSpend != null && t.amountSpend !== '';
  const hasIncome = t.income      != null && t.income !== '';
  const catEmoji  = categoryEmoji(t.category1);
  const dateStr   = t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : '--';

  return `
    <div class="txn-tap" data-id="${t.id}" style="
      display:flex;align-items:center;gap:12px;padding:13px 16px;
      border-bottom:${isLast ? 'none' : '1px solid var(--border-light)'};
      cursor:pointer;transition:background 0.1s;
      -webkit-tap-highlight-color:transparent;
    " onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
      <div class="txn-category-badge">${catEmoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${t.description || '--'}
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;display:flex;gap:6px;">
          <span>${t.category1 || '--'}</span>
          ${t.category2 ? `<span>· ${t.category2}</span>` : ''}
          ${t.account   ? `<span>· ${t.account}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        ${hasSpend  ? `<div class="txn-amount-spend" style="font-size:14px;">-${formatAmount(t.amountSpend)}</div>` : ''}
        ${hasIncome ? `<div class="txn-amount-income" style="font-size:14px;">+${formatAmount(t.income)}</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${t.currency} · ${dateStr}</div>
      </div>
    </div>`;
}

export function categoryEmoji(cat) {
  const map = {
    'Food': '🍽️', 'Groceries': '🛒', 'Rent': '🏠', 'Salary': '💵',
    'Transport': '🚗', 'Medical': '🏥', 'Education': '📚', 'Shopping': '🛍️',
    'Utilities': '⚡', 'Travel': '✈️', 'Entertainment': '🎬', 'Transfer': '🔄',
    'Investment': '📈', 'Insurance': '🛡️', 'Freelance': '💻', 'Other': '📌',
  };
  return map[cat] || '📌';
}
