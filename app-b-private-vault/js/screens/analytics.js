// ─── app-b-private-vault/js/screens/analytics.js ────────────────────────────
// Analytics: monthly bar chart, category donut, year-over-year comparison
// Pure Canvas API — no external chart library needed

'use strict';

import { getCachedFinanceData } from '../../../shared/db.js';
import { navigate } from '../router.js';
import { formatAmount, currentYear, currentMonth } from '../../../shared/utils.js';

const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENCIES = ['QAR','INR','USD'];
const PALETTE   = ['#3730A3','#065F46','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#10B981','#EC4899','#6366F1'];

export async function renderAnalytics(container) {
  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">📊 Analytics</span>
    </div>
    <!-- Currency tabs -->
    <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px 16px;">
      <div class="currency-tabs" id="currency-tabs">
        ${CURRENCIES.map(c => `<button class="currency-tab" data-c="${c}">${c}</button>`).join('')}
      </div>
    </div>
    <div id="analytics-body" style="padding:16px;display:flex;flex-direction:column;gap:16px;padding-bottom:32px;">
      <div style="display:flex;justify-content:center;padding:40px 0;"><div class="spinner"></div></div>
    </div>
  `;

  const data = await getCachedFinanceData();
  if (!data || !data.transactions?.length) {
    document.getElementById('analytics-body').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No data yet</div>
        <div class="empty-state-text">Add transactions to see analytics</div>
      </div>`;
    return;
  }

  let activeCurrency = 'QAR';

  // Set active currency tab
  document.querySelectorAll('[data-c]').forEach(btn => {
    if (btn.dataset.c === activeCurrency) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeCurrency = btn.dataset.c;
      document.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('active', b.dataset.c === activeCurrency));
      renderCharts(data.transactions, activeCurrency);
    });
  });

  renderCharts(data.transactions, activeCurrency);
}

function renderCharts(transactions, currency) {
  const body = document.getElementById('analytics-body');
  const year = currentYear();

  // Filter to this currency
  const filtered = transactions.filter(t => t.currency === currency);

  body.innerHTML = `
    <!-- Year selector -->
    <div id="year-row" style="display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;"></div>

    <!-- Monthly bar chart -->
    <div class="card">
      <div class="card-header">
        <span style="font-size:14px;font-weight:700;">Monthly Income vs Spend</span>
        <span style="font-size:12px;color:var(--text-muted);" id="bar-year-label">${year}</span>
      </div>
      <div style="padding:16px 12px 12px;">
        <canvas id="bar-chart" height="180"></canvas>
        <div style="display:flex;gap:16px;justify-content:center;margin-top:10px;">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);">
            <div style="width:12px;height:12px;border-radius:3px;background:var(--success);"></div> Income
          </div>
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);">
            <div style="width:12px;height:12px;border-radius:3px;background:var(--danger);"></div> Spend
          </div>
        </div>
      </div>
    </div>

    <!-- Category donut -->
    <div class="card">
      <div class="card-header">
        <span style="font-size:14px;font-weight:700;">Spend by Category</span>
        <div style="display:flex;gap:6px;">
          <button class="filter-chip active" id="donut-spend">Spend</button>
          <button class="filter-chip" id="donut-income">Income</button>
        </div>
      </div>
      <div style="padding:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
        <canvas id="donut-chart" width="150" height="150" style="flex-shrink:0;"></canvas>
        <div id="donut-legend" style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:6px;"></div>
      </div>
    </div>

    <!-- Year-over-year -->
    <div class="card">
      <div class="card-header">
        <span style="font-size:14px;font-weight:700;">Year-over-Year</span>
      </div>
      <div style="padding:12px;">
        <canvas id="yoy-chart" height="160"></canvas>
      </div>
    </div>

    <!-- Top spending categories this month -->
    <div class="card">
      <div class="card-header">
        <span style="font-size:14px;font-weight:700;">This Month's Top Categories</span>
        <span style="font-size:12px;color:var(--text-muted);">${MONTHS[currentMonth()-1]}</span>
      </div>
      <div id="top-cats" style="padding:0 0 8px;"></div>
    </div>
  `;

  // Year buttons
  const years = [...new Set(filtered.map(t => t.date?.slice(0,4)).filter(Boolean))].sort((a,b) => b-a);
  if (!years.includes(String(year))) years.unshift(String(year));
  let selectedYear = year;

  const yearRow = document.getElementById('year-row');
  function renderYearBtns() {
    yearRow.innerHTML = years.map(y => `
      <button class="filter-chip ${Number(y) === selectedYear ? 'active' : ''}" data-yr="${y}">${y}</button>
    `).join('');
    yearRow.querySelectorAll('[data-yr]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedYear = Number(btn.dataset.yr);
        document.getElementById('bar-year-label').textContent = selectedYear;
        renderYearBtns();
        drawBarChart(filtered, selectedYear);
        drawYoY(filtered, years.map(Number));
      });
    });
  }
  renderYearBtns();

  // Donut toggle
  let donutMode = 'spend';
  document.getElementById('donut-spend').addEventListener('click', () => {
    donutMode = 'spend';
    document.getElementById('donut-spend').classList.add('active');
    document.getElementById('donut-income').classList.remove('active');
    drawDonut(filtered, donutMode, selectedYear);
  });
  document.getElementById('donut-income').addEventListener('click', () => {
    donutMode = 'income';
    document.getElementById('donut-income').classList.add('active');
    document.getElementById('donut-spend').classList.remove('active');
    drawDonut(filtered, donutMode, selectedYear);
  });

  // Draw all charts
  drawBarChart(filtered, selectedYear);
  drawDonut(filtered, donutMode, selectedYear);
  drawYoY(filtered, years.map(Number));
  renderTopCats(filtered);
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
function drawBarChart(txns, year) {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 340;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Monthly totals
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const mo = String(i + 1).padStart(2, '0');
    const mo_txns = txns.filter(t => t.date?.startsWith(`${year}-${mo}`));
    return {
      income: mo_txns.reduce((s, t) => s + (Number(t.income) || 0), 0),
      spend:  mo_txns.reduce((s, t) => s + (Number(t.amountSpend) || 0), 0),
    };
  });

  const maxVal = Math.max(...monthly.flatMap(m => [m.income, m.spend]), 1);
  const pad = { l: 8, r: 8, t: 10, b: 28 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const barGap = 2, groupGap = 4;
  const groupW = chartW / 12;
  const barW   = (groupW - groupGap * 2 - barGap) / 2;

  // Gridlines
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border') || '#E2E8F0';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + chartH - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
  }

  monthly.forEach((m, i) => {
    const x = pad.l + i * groupW + groupGap;

    // Income bar
    const incomeH = (m.income / maxVal) * chartH;
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.roundRect(x, pad.t + chartH - incomeH, barW, incomeH, [3, 3, 0, 0]);
    ctx.fill();

    // Spend bar
    const spendH = (m.spend / maxVal) * chartH;
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.roundRect(x + barW + barGap, pad.t + chartH - spendH, barW, spendH, [3, 3, 0, 0]);
    ctx.fill();

    // Month label
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary') || '#64748B';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(MONTHS[i].slice(0,1), x + barW, H - 8);
  });
}

// ── Donut Chart ──────────────────────────────────────────────────────────────
function drawDonut(txns, mode, year) {
  const canvas = document.getElementById('donut-chart');
  const legend = document.getElementById('donut-legend');
  if (!canvas || !legend) return;

  const yearTxns = txns.filter(t => t.date?.startsWith(String(year)));
  const catTotals = {};
  yearTxns.forEach(t => {
    const cat = t.category1 || 'Other';
    const amt = mode === 'spend' ? (Number(t.amountSpend) || 0) : (Number(t.income) || 0);
    catTotals[cat] = (catTotals[cat] || 0) + amt;
  });

  const total = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!total) {
    canvas.getContext('2d').clearRect(0, 0, 150, 150);
    legend.innerHTML = `<div style="font-size:13px;color:var(--text-muted);">No ${mode} data for ${year}</div>`;
    return;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 150, 150);

  let startAngle = -Math.PI / 2;
  sorted.forEach(([cat, val], i) => {
    const slice = (val / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(75, 75);
    ctx.arc(75, 75, 65, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    startAngle += slice;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(75, 75, 38, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-background-primary') || '#fff';
  ctx.fill();

  // Centre total
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary') || '#0F172A';
  ctx.font = 'bold 12px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(formatAmount(total, ''), 75, 72);
  ctx.font = '9px DM Sans, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('total', 75, 84);

  // Legend
  legend.innerHTML = sorted.map(([cat, val], i) => `
    <div style="display:flex;align-items:center;gap:7px;">
      <div style="width:10px;height:10px;border-radius:2px;background:${PALETTE[i % PALETTE.length]};flex-shrink:0;"></div>
      <div style="flex:1;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat}</div>
      <div style="font-size:12px;font-weight:600;color:var(--text);font-family:'DM Mono',monospace;">${Math.round((val/total)*100)}%</div>
    </div>
  `).join('');
}

// ── Year-over-Year ────────────────────────────────────────────────────────────
function drawYoY(txns, years) {
  const canvas = document.getElementById('yoy-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 340;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const activeYears = years.slice(0, 4).sort();
  const yData = activeYears.map(y => ({
    year: y,
    income: txns.filter(t => t.date?.startsWith(String(y))).reduce((s,t) => s + (Number(t.income)||0), 0),
    spend:  txns.filter(t => t.date?.startsWith(String(y))).reduce((s,t) => s + (Number(t.amountSpend)||0), 0),
  }));

  if (!yData.length) return;

  const maxVal = Math.max(...yData.flatMap(d => [d.income, d.spend]), 1);
  const pad = { l: 8, r: 8, t: 10, b: 28 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const groupW = chartW / activeYears.length;
  const barW = (groupW - 16) / 2;

  // Gridlines
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + chartH - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
  }

  yData.forEach((d, i) => {
    const x = pad.l + i * groupW + 8;

    const incH = (d.income / maxVal) * chartH;
    ctx.fillStyle = '#10B981';
    ctx.beginPath(); ctx.roundRect(x, pad.t + chartH - incH, barW, incH, [3,3,0,0]); ctx.fill();

    const spH = (d.spend / maxVal) * chartH;
    ctx.fillStyle = '#EF4444';
    ctx.beginPath(); ctx.roundRect(x + barW + 4, pad.t + chartH - spH, barW, spH, [3,3,0,0]); ctx.fill();

    ctx.fillStyle = '#64748B';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(d.year).slice(2), x + barW, H - 8);
  });
}

// ── Top categories this month ─────────────────────────────────────────────────
function renderTopCats(txns) {
  const mo = String(currentMonth()).padStart(2, '0');
  const yr = currentYear();
  const thisMonth = txns.filter(t => t.date?.startsWith(`${yr}-${mo}`));
  const catTotals = {};
  thisMonth.forEach(t => {
    const cat = t.category1 || 'Other';
    catTotals[cat] = (catTotals[cat] || 0) + (Number(t.amountSpend) || 0);
  });
  const sorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).slice(0,5);
  const maxAmt = sorted[0]?.[1] || 1;
  const el = document.getElementById('top-cats');

  if (!sorted.length) {
    el.innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-muted);">No spend data this month</div>`;
    return;
  }

  el.innerHTML = sorted.map(([cat, amt]) => `
    <div style="padding:10px 16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
        <span style="font-size:13px;font-weight:600;color:var(--text);">${cat}</span>
        <span style="font-size:13px;font-weight:700;color:var(--danger);font-family:'DM Mono',monospace;">${formatAmount(amt)}</span>
      </div>
      <div class="life-bar-track">
        <div class="life-bar-fill" style="width:${Math.round((amt/maxAmt)*100)}%;background:var(--danger);"></div>
      </div>
    </div>
  `).join('');
}
