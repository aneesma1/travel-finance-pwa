// v3.5.3 — 2026-03-22

// ─── app-b-private-vault/js/screens/transaction-view.js ─────────────────────
// Transaction View -- read-only display with edit button and WhatsApp copy

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { formatDisplayDate, formatAmount, showToast } from '../../../shared/utils.js';
import { renderPhotoThumbnails } from '../../../shared/photo-picker.js';

export async function renderTransactionView(container, params = {}) {
  const { txnId } = params;
  if (!txnId) { navigate('transactions'); return; }

  const data = await getCachedFinanceData();
  const { transactions = [] } = data || {};
  const t = transactions.find(x => x.id === txnId);
  if (!t) { navigate('transactions'); return; }

  const isIncome  = t.income && Number(t.income) > 0;
  const isSpend   = t.amountSpend && Number(t.amountSpend) > 0;
  const amountColor = isIncome && !isSpend ? 'var(--success)' : 'var(--danger)';
  const amountSign  = isIncome && !isSpend ? '+' : isSpend ? '-' : '';
  const amountVal   = isIncome && !isSpend
    ? formatAmount(Number(t.income))
    : isSpend ? formatAmount(Number(t.amountSpend)) : '--';

  container.innerHTML = `
    <div class="app-header">
      <button class="app-header-action" id="back-btn">←</button>
      <span class="app-header-title">Transaction</span>
      <button class="app-header-action" id="edit-btn" style="font-size:13px;font-weight:700;color:var(--primary);">Edit</button>
    </div>

    <div style="padding:20px 16px;display:flex;flex-direction:column;gap:12px;padding-bottom:100px;">

      <!-- Amount hero card -->
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:24px 20px;text-align:center;">
        <div style="font-size:36px;font-weight:700;color:${amountColor};">${amountSign}${amountVal}</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">${t.currency || 'QAR'}</div>
        ${isIncome && isSpend ? `
          <div style="margin-top:12px;display:flex;justify-content:center;gap:24px;font-size:13px;">
            <span>📥 <span style="color:var(--success);font-weight:600;">+${formatAmount(Number(t.income))}</span></span>
            <span>📤 <span style="color:var(--danger);font-weight:600;">-${formatAmount(Number(t.amountSpend))}</span></span>
          </div>
        ` : ''}
      </div>

      <!-- Details card -->
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;">
        ${row('📅', 'Date', formatDisplayDate(t.date))}
        ${row('📝', 'Description', t.description || '--')}
        ${row('🏷️', 'Category', [t.category1, t.category2].filter(Boolean).join(' › ') || '--')}
        ${row('🏦', 'Account', t.account || '--')}
        ${t.notes1 ? row('💬', 'Notes', t.notes1) : ''}
        ${row('🕐', 'Recorded', t.timestamp ? new Date(t.timestamp).toLocaleString() : '--')}
      </div>

      <!-- Photos -->
      ${t.photos?.filter(Boolean).length ? `
        <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:14px 16px;">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Photos</div>
          <div id="txn-view-photos"></div>
        </div>
      ` : ''}

      <!-- Action buttons -->
      <div style="display:flex;gap:10px;">
        <button id="copy-btn" style="flex:1;padding:14px;border-radius:var(--radius-lg);border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">
          📋 Copy for WhatsApp
        </button>
        <button id="delete-btn" style="padding:14px 18px;border-radius:var(--radius-lg);border:1.5px solid var(--danger-bg);background:var(--danger-bg);color:var(--danger);font-size:20px;cursor:pointer;">
          🗑️
        </button>
      </div>

    </div>
  `;

  // Render photo thumbnails
  if (t.photos?.filter(Boolean).length) {
    const photoContainer = document.getElementById('txn-view-photos');
    if (photoContainer) {
      const { renderPhotoThumbnails } = await import('../../../shared/photo-picker.js');
      renderPhotoThumbnails(photoContainer, t.photos);
    }
  }

  document.getElementById('back-btn').addEventListener('click', () => navigate('transactions'));

  document.getElementById('edit-btn').addEventListener('click', () => {
    navigate('add-transaction', { txnId: t.id, mode: 'edit' });
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    const lines = [
      `💰 ${t.description || 'Transaction'}`,
      `─────────────────`,
      `📅 Date: ${formatDisplayDate(t.date)}`,
      isSpend  ? `💸 Spend:  ${t.currency} ${formatAmount(Number(t.amountSpend))}` : '',
      isIncome ? `💵 Income: ${t.currency} ${formatAmount(Number(t.income))}` : '',
      `🏦 Account: ${t.account || '--'}`,
      `🏷️ Category: ${[t.category1, t.category2].filter(Boolean).join(' › ') || '--'}`,
      t.notes1 ? `💬 Notes: ${t.notes1}` : '',
      `─────────────────`,
      `Shared via Private Vault`,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      showToast('Copied to clipboard! Paste in WhatsApp.', 'success');
    } catch {
      showToast('Copy failed -- try long-pressing the text', 'warning');
    }
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${t.description || 'this transaction'}"? This cannot be undone.`)) return;
    try {
      const newData = await localSave('finance', remote => ({
        ...remote,
        transactions: (remote.transactions || []).filter(x => x.id !== txnId)
      }));
      await setCachedFinanceData(newData);
      showToast('Transaction deleted', 'success');
      navigate('transactions');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  });
}

function row(icon, label, value) {
  return `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border-light);">
      <span style="font-size:18px;flex-shrink:0;margin-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">${label}</div>
        <div style="font-size:14px;color:var(--text);word-break:break-word;">${value}</div>
      </div>
    </div>
  `;
}
