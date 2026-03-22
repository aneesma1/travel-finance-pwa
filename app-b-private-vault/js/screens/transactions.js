// v3.5.5 — 2026-03-22

// ─── app-b-private-vault/js/screens/transactions.js ─────────────────────────
// Full transaction list with filter bar, running balance, swipe-to-delete

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
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
  document.getElementById('export-btn').addEventListener('click', () => {
    openExportSheet();
  });

  function openExportSheet() {
    document.getElementById('export-sheet')?.remove();
    document.getElementById('export-backdrop')?.remove();

    const sheet = document.createElement('div');
    sheet.id = 'export-sheet';
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);padding:16px 20px 40px;box-shadow:0 -4px 24px rgba(0,0,0,0.15);';

    const { timestampSuffix } = window._driveHelpers || {};
    const ts = new Date().toISOString().replace('T','_').slice(0,16).replace(':','-');

    // Summary of active filters
    const filterSummary = [
      activeCurrency,
      activeYear,
      activeMonth ? MONTHS[activeMonth-1] : null,
      activeCategory || null,
      activeAccount || null,
    ].filter(Boolean).join(' · ');

    sheet.innerHTML = `
      <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px;"></div>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Export</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">Active filters: \${filterSummary}</div>

      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Format</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;" id="export-format-pills">
        <button class="sheet-pill active" data-fmt="xlsx">📊 Excel</button>
        <button class="sheet-pill" data-fmt="csv">📄 CSV</button>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Scope</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;" id="export-scope-pills">
        <button class="sheet-pill active" data-scope="filtered">Current filters</button>
        <button class="sheet-pill" data-scope="all">All data</button>
      </div>

      <div id="export-status" style="font-size:13px;color:var(--text-muted);min-height:20px;margin-bottom:12px;"></div>

      <div style="display:flex;gap:10px;">
        <button id="export-download" class="btn btn-primary" style="flex:1;">📥 Download</button>
        <button id="export-share" class="btn btn-secondary" style="flex:1;">📤 Share</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = '.sheet-pill{padding:8px 14px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:13px;cursor:pointer;} .sheet-pill.active{border-color:var(--primary);background:var(--primary-bg);color:var(--primary);font-weight:600;}';
    sheet.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'export-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:999;';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const close = () => { sheet.remove(); backdrop.remove(); };
    backdrop.addEventListener('click', close);

    let selectedFmt   = 'xlsx';
    let selectedScope = 'filtered';

    sheet.querySelectorAll('#export-format-pills .sheet-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFmt = btn.dataset.fmt;
        sheet.querySelectorAll('#export-format-pills .sheet-pill').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    sheet.querySelectorAll('#export-scope-pills .sheet-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedScope = btn.dataset.scope;
        sheet.querySelectorAll('#export-scope-pills .sheet-pill').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    async function doExport(deliver) {
      const status = document.getElementById('export-status');
      status.textContent = 'Preparing export…';

      const allTxns = (await getCachedFinanceData())?.transactions || [];
      const scopedTxns = selectedScope === 'filtered'
        ? allTxns.filter(t => {
            if (t.currency !== activeCurrency) return false;
            if (activeYear && t.date?.slice(0,4) !== String(activeYear)) return false;
            if (activeMonth && Number(t.date?.slice(5,7)) !== activeMonth) return false;
            if (activeCategory && t.category1 !== activeCategory) return false;
            if (activeAccount && t.account !== activeAccount) return false;
            return true;
          })
        : allTxns;

      const scopeLabel = selectedScope === 'filtered' ? filterSummary.replace(/ · /g,'_') : 'All';
      const filename = 'Finance_' + scopeLabel + '_' + ts + '.' + selectedFmt;

      status.textContent = 'Exporting ' + scopedTxns.length + ' records…';

      if (selectedFmt === 'csv') {
        const headers = ['Timestamp','Date','Description','Amount Spend','Income','Category 1','Category 2','Notes 1','Account','Currency'];
        const rows = scopedTxns.map(t => [
          t.timestamp||'', t.date||'', t.description||'',
          t.amountSpend??'', t.income??'', t.category1||'',
          t.category2||'', t.notes1||'', t.account||'', t.currency||''
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        if (deliver === 'download') {
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = filename; a.click(); URL.revokeObjectURL(a.href);
        } else if (navigator.share) {
          await navigator.share({ files: [new File([blob], filename, { type: 'text/csv' })] }).catch(()=>{});
        }
        status.textContent = '✅ ' + filename;
        return;
      }

      // XLSX export via SheetJS
      if (!window.XLSX) {
        await new Promise((res,rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const headers = ['Timestamp','Date','Description','Amount Spend','Income','Category 1','Category 2','Notes 1','Account','Currency'];
      const rows = scopedTxns.map(t => [
        t.timestamp||'', t.date||'', t.description||'',
        t.amountSpend??'', t.income??'', t.category1||'',
        t.category2||'', t.notes1||'', t.account||'', t.currency||''
      ]);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

      if (deliver === 'download') {
        XLSX.writeFile(wb, filename);
      } else if (navigator.share) {
        const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
        const blob = new Blob([wbout], { type:'application/octet-stream' });
        await navigator.share({ files: [new File([blob], filename, { type: blob.type })] }).catch(()=>{});
      }
      status.textContent = '✅ ' + filename;
      setTimeout(close, 1500);
    }

    document.getElementById('export-download').addEventListener('click', () => doExport('download'));
    document.getElementById('export-share').addEventListener('click', () => doExport('share'));
  }

  // Wait for data to be structurally ready (via global event)
  let data = await getCachedFinanceData();
  if (!data) {
    await new Promise(r => window.addEventListener('finance-data-ready', r, { once: true }));
    data = await getCachedFinanceData();
  }
  if (!data) {
    const wrap = document.getElementById('txn-list-wrap');
    wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px 24px;gap:12px;">' +
      '<div style="font-size:48px;">💳</div>' +
      '<div style="font-size:16px;font-weight:600;color:var(--text);">Loading transactions…</div>' +
      '<div style="font-size:13px;color:var(--text-muted);text-align:center;">Syncing from Drive. Tap retry if this persists.</div>' +
      '<button id="retry-load" class="btn btn-primary" style="margin-top:8px;">↻ Retry</button>' +
    '</div>';
    document.getElementById('retry-load')?.addEventListener('click', () => renderTransactions(container));
    return;
  }

  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data;
  const allCategories = [...new Set(transactions.map(t => t.category1).filter(Boolean))];
  const allAccounts   = ['Cash','Card','Bank','Other', ...savedAccounts];

  const p = getHashParams();
  const activeCurrency = p.currency || 'QAR';
  const activeYear     = p.year   ? Number(p.year)  : null;  // null = all years
  const activeMonth    = p.month  ? Number(p.month) : 0;
  const activeCategory = p.category || '';
  const activeAccount  = p.account  || '';

  renderFilterBar();
  renderList();

  function renderFilterBar() {
    const years = [...new Set(transactions.map(t => t.date?.slice(0,4)).filter(y => y && Number(y) >= 2000 && Number(y) <= 2100))].sort((a,b)=>b-a);
    if (!years.includes(String(currentYear()))) years.unshift(String(currentYear()));
    const activeCount = [activeCategory, activeAccount, activeMonth !== 0, !!activeYear].filter(Boolean).length;

    // Collapsed summary chips + filter icon
    const summaryParts = [];
    if (activeMonth) summaryParts.push(MONTHS[activeMonth-1]);
    if (activeCategory) summaryParts.push(activeCategory);
    if (activeAccount) summaryParts.push(activeAccount);
    const summaryText = summaryParts.length ? summaryParts.join(' · ') : 'All transactions';

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
        <!-- Collapsed filter summary row -->
        <div style="display:flex;align-items:center;gap:8px;padding:10px 16px 10px;" id="filter-summary-row">
          <div style="flex:1;font-size:13px;color:${activeCount > 0 ? 'var(--primary)' : 'var(--text-muted)'};">
            ${activeYear ? activeYear + ' · ' : ''}${summaryText}
          </div>
          ${activeCount > 0
            ? `<button id="clear-filters-quick" style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;border:1.5px solid var(--danger);background:transparent;color:var(--danger);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">✕ Clear all</button>`
            : ''}
          <button id="open-filter-sheet" style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;border:1px solid ${activeCount > 0 ? 'var(--primary)' : 'var(--border)'};background:${activeCount > 0 ? 'var(--primary-bg)' : 'transparent'};color:${activeCount > 0 ? 'var(--primary)' : 'var(--text-secondary)'};font-size:13px;font-weight:500;cursor:pointer;">
            ⚙️ Filters${activeCount > 0 ? ' (' + activeCount + ')' : ''}
          </button>
        </div>
      </div>
    `;

    // Currency tab handlers
    document.querySelectorAll('[data-currency]').forEach(btn =>
      btn.addEventListener('click', () => {
        _txnPage = 1;
        setHashParams({ currency: btn.dataset.currency });
        renderTransactions(container);
      }));

    // Use event delegation so clear button works even when conditionally rendered
    // Event delegation on stable parent - no { once: true } so it persists
    const fbWrap = document.getElementById('filter-bar-wrap');
    if (fbWrap && !fbWrap._clearBound) {
      fbWrap._clearBound = true;
      fbWrap.addEventListener('click', (e) => {
        if (e.target.id === 'clear-filters-quick' || e.target.closest?.('#clear-filters-quick')) {
          _txnPage = 1;
          // Keep currency, clear everything else
          clearHashParams();
          if (activeCurrency !== 'QAR') setHashParams({ currency: activeCurrency });
          renderTransactions(container);
        }
      });
    }

    // Open filter bottom sheet
    document.getElementById('open-filter-sheet').addEventListener('click', () => {
      openFilterSheet(years, allCategories, allAccounts);
    });
  }

  function openFilterSheet(years, categories, accounts) {
    document.getElementById('filter-sheet')?.remove();
    document.getElementById('filter-backdrop')?.remove();

    const sheet = document.createElement('div');
    sheet.id = 'filter-sheet';
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,0.15);';

    // Working copies
    let wYear     = activeYear;
    let wMonth    = activeMonth;
    let wCats     = activeCategory ? [activeCategory] : [];
    let wAccount  = activeAccount;

    sheet.innerHTML = `
      <div style="padding:12px 20px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto;position:absolute;left:50%;transform:translateX(-50%);top:8px;"></div>
        <span style="font-size:16px;font-weight:700;">Filters</span>
        <button id="sheet-clear-all" style="font-size:13px;color:var(--danger);background:none;border:none;cursor:pointer;">Clear all</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:16px 20px 0;">

        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Year</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;" id="sheet-years">
          ${years.map(y => `<button class="sheet-pill ${Number(y)===wYear?'active':''}" data-year="${y}">${y}</button>`).join('')}
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Month</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;" id="sheet-months">
          <button class="sheet-pill ${!wMonth?'active':''}" data-month="0">All</button>
          ${MONTHS.map((m,i) => `<button class="sheet-pill ${wMonth===i+1?'active':''}" data-month="${i+1}">${m}</button>`).join('')}
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Category <span style="font-weight:400;text-transform:none;font-size:11px;">(multi-select)</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;" id="sheet-cats">
          ${categories.map(c => `<button class="sheet-pill ${wCats.includes(c)?'active':''}" data-cat="${c}">${c}</button>`).join('')}
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Account</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:80px;" id="sheet-accounts">
          <button class="sheet-pill ${!wAccount?'active':''}" data-acc="">All</button>
          ${accounts.map(a => `<button class="sheet-pill ${wAccount===a?'active':''}" data-acc="${a}">${a}</button>`).join('')}
        </div>
      </div>

      <div style="padding:16px 20px;border-top:1px solid var(--border-light);flex-shrink:0;display:flex;gap:10px;background:var(--surface);">
        <button id="sheet-apply" class="btn btn-primary" style="flex:1;">Apply Filters</button>
      </div>
    `;

    // Inject pill styles
    const style = document.createElement('style');
    style.textContent = '.sheet-pill{padding:8px 14px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:13px;cursor:pointer;} .sheet-pill.active{border-color:var(--primary);background:var(--primary-bg);color:var(--primary);font-weight:600;}';
    sheet.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'filter-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:999;';
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const close = () => { sheet.remove(); backdrop.remove(); };
    backdrop.addEventListener('click', close);

    // Year pills
    sheet.querySelectorAll('[data-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        wYear = Number(btn.dataset.year);
        sheet.querySelectorAll('[data-year]').forEach(b => b.classList.toggle('active', Number(b.dataset.year) === wYear));
      });
    });

    // Month pills
    sheet.querySelectorAll('[data-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        wMonth = Number(btn.dataset.month);
        sheet.querySelectorAll('[data-month]').forEach(b => b.classList.toggle('active', Number(b.dataset.month) === wMonth));
      });
    });

    // Category pills (multi-select)
    sheet.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (wCats.includes(cat)) wCats = wCats.filter(c => c !== cat);
        else wCats.push(cat);
        btn.classList.toggle('active', wCats.includes(cat));
      });
    });

    // Account pills
    sheet.querySelectorAll('[data-acc]').forEach(btn => {
      btn.addEventListener('click', () => {
        wAccount = btn.dataset.acc;
        sheet.querySelectorAll('[data-acc]').forEach(b => b.classList.toggle('active', b.dataset.acc === wAccount));
      });
    });

    document.getElementById('sheet-clear-all').addEventListener('click', () => {
      close();
      _txnPage = 1;
      clearHashParams();
      if (activeCurrency !== 'QAR') setHashParams({ currency: activeCurrency });
      renderTransactions(container);
    });

    document.getElementById('sheet-apply').addEventListener('click', () => {
      close();
      _txnPage = 1;
      setHashParams({
        year:     wYear !== currentYear() ? wYear : null,
        month:    wMonth || null,
        category: wCats.length === 1 ? wCats[0] : null, // single for URL
        account:  wAccount || null,
      });
      // Store multi-cat in sessionStorage for this session
      if (wCats.length > 1) sessionStorage.setItem('txn_multi_cats', JSON.stringify(wCats));
      else sessionStorage.removeItem('txn_multi_cats');
      renderTransactions(container);
    });
  }

  let _txnPage = 1;
  const TXN_PAGE_SIZE = 30;

  function renderList(resetPage = true) {
    if (resetPage) _txnPage = 1;
    // Filter
    let filtered = transactions.filter(t => {
      if (t.currency !== activeCurrency) return false;
      if (activeYear && t.date?.slice(0,4) !== String(activeYear)) return false;
      if (activeMonth  && Number(t.date?.slice(5,7)) !== activeMonth)    return false;
      if (activeCategory && t.category1 !== activeCategory)              return false;
      if (activeAccount  && t.account   !== activeAccount)               return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalFiltered = filtered.length;
    const allFiltered   = filtered; // keep full for balance calc
    filtered = filtered.slice(0, _txnPage * TXN_PAGE_SIZE);

    // Running balance bar
    const totalIncome = allFiltered.reduce((s,t) => s + (Number(t.income)      || 0), 0);
    const totalSpend  = allFiltered.reduce((s,t) => s + (Number(t.amountSpend) || 0), 0);
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
          ${totalFiltered} records
        </div>
      `;
    }

    const wrap = document.getElementById('txn-list-wrap');
    if (!filtered.length) {
      const balanceBar = document.getElementById('balance-bar');
      if (balanceBar) balanceBar.classList.add('hidden');

      // Smart fallback: ONLY when a year filter is explicitly set AND
      // it's the sole cause of empty results (no other filters active)
      const hasDataAllTime = transactions.some(t => t.currency === activeCurrency);
      const onlyYearFiltering = !!activeYear && !activeMonth && !activeCategory && !activeAccount;
      if (hasDataAllTime && onlyYearFiltering) {
        // Year filter produced no results - clear it and show all
        clearHashParams();
        if (activeCurrency !== 'QAR') setHashParams({ currency: activeCurrency });
        renderTransactions(container);
        return;
      }

      wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px 24px;gap:12px;">' +
        '<div style="font-size:48px;">💳</div>' +
        '<div style="font-size:16px;font-weight:600;color:var(--text);">No ' + activeCurrency + ' transactions</div>' +
        '<div style="font-size:13px;color:var(--text-muted);text-align:center;line-height:1.6;">' +
          (activeMonth || activeCategory || activeAccount
            ? 'No records match the active filters. <button id="clear-filters-empty" style="color:var(--primary);background:none;border:none;cursor:pointer;font-size:13px;text-decoration:underline;">Clear filters</button>'
            : 'Tap ＋ to add your first ' + activeCurrency + ' transaction.') +
        '</div></div>';
      wrap.querySelector('#clear-filters-empty')?.addEventListener('click', () => {
        clearHashParams(); renderTransactions(container);
      });
      return;
    }
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
      row.addEventListener('click', () => navigate('transaction-view', { txnId: row.dataset.id }));
    });

    // Load-more sentinel
    document.getElementById('txn-sentinel')?.remove();
    if (filtered.length < totalFiltered) {
      const sentinel = document.createElement('div');
      sentinel.id = 'txn-sentinel';
      sentinel.style.cssText = 'height:60px;display:flex;align-items:center;justify-content:center;';
      sentinel.innerHTML = '<span style="font-size:13px;color:var(--text-muted);">Loading more…</span>';
      wrap.appendChild(sentinel);
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          _txnPage++;
          renderList(false);
        }
      }, { threshold: 0.1 });
      obs.observe(sentinel);
    } else if (totalFiltered > TXN_PAGE_SIZE) {
      const end = document.createElement('div');
      end.style.cssText = 'padding:16px;text-align:center;font-size:12px;color:var(--text-muted);';
      end.textContent = `All ${totalFiltered} records shown`;
      wrap.appendChild(end);
    }
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
      const newData = await localSave('finance', (remote) => ({
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
