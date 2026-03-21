// v2.6 — 2026-03-18
// ─── app-b-private-vault/js/screens/add-transaction.js ──────────────────────
// Add / Edit Transaction form

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { navigate } from '../router.js';
import { PillSelect }  from '../../../shared/pill-select.js';
import { SmartInput }  from '../../../shared/smart-input.js';
import { uuidv4, today, showToast, formatAmount } from '../../../shared/utils.js';

const DEFAULT_CATEGORIES = ['Food','Groceries','Rent','Salary','Transport','Medical','Education','Shopping','Utilities','Travel','Entertainment','Transfer','Investment','Insurance','Freelance','Other'];
const DEFAULT_ACCOUNTS   = ['Cash','Card','Bank','Other'];

export async function renderAddTransaction(container, params = {}) {
  const { txnId, mode } = params;
  const isEdit = mode === 'edit' && txnId;

  const data = await getCachedFinanceData();
  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data || {};

  const existing = isEdit ? transactions.find(t => t.id === txnId) : null;

  // Merge saved categories with defaults
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...savedCats])];
  const allAccounts   = [...new Set([...DEFAULT_ACCOUNTS,   ...savedAccounts])];

  // Smart-search suggestions from history
  const descSuggestions = [...new Set(transactions.map(t => t.description).filter(Boolean))];
  const notesSuggestions = [...new Set(transactions.map(t => t.notes1).filter(Boolean))];

  const state = {
    date:        existing?.date        || today(),
    description: existing?.description || '',
    amountSpend: existing?.amountSpend != null ? String(existing.amountSpend) : '',
    income:      existing?.income      != null ? String(existing.income)      : '',
    currency:    existing?.currency    || 'QAR',
    category1:   existing?.category1   || '',
    category2:   existing?.category2   || '',
    notes1:      existing?.notes1      || '',
    account:     existing?.account     || 'Card',
  };

  function render() {
    container.innerHTML = `
      <div class="app-header">
        <button class="app-header-action" id="back-btn">←</button>
        <span class="app-header-title">${isEdit ? 'Edit Transaction' : 'Add Transaction'}</span>
        ${isEdit ? `<button class="app-header-action" id="delete-btn" style="color:#FCA5A5;">🗑️</button>` : '<span style="width:32px;"></span>'}
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:20px;padding-bottom:40px;">

        <!-- Date -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" id="txn-date" value="${state.date}" max="${today()}" />
        </div>

        <!-- Description -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Description</label>
          <div id="desc-input"></div>
        </div>

        <!-- Amount row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">💸 Amount Spend</label>
            <input type="number" class="form-input" id="amount-spend"
              value="${state.amountSpend}" placeholder="0.00" min="0" step="0.01"
              inputmode="decimal" style="font-family:'DM Mono',monospace;" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">💰 Income</label>
            <input type="number" class="form-input" id="amount-income"
              value="${state.income}" placeholder="0.00" min="0" step="0.01"
              inputmode="decimal" style="font-family:'DM Mono',monospace;" />
          </div>
        </div>

        <!-- Currency -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Currency</label>
          <div id="currency-pills"></div>
        </div>

        <!-- Category 1 -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Category</label>
          <div id="cat1-pills"></div>
        </div>

        <!-- Category 2 (optional) -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Sub-category <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <div id="cat2-pills"></div>
        </div>

        <!-- Notes -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Notes <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <div id="notes-input"></div>
        </div>

        <!-- Account -->
        <div class="form-group" style="margin:0;">
          <label class="form-label">Account / Method</label>
          <div id="account-pills"></div>
        </div>

        <!-- Preview -->
        <div id="txn-preview" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;">
        </div>

        <div id="save-error" style="color:var(--danger);font-size:13px;text-align:center;min-height:18px;"></div>

        <button class="btn btn-primary btn-full" id="save-btn">
          ${isEdit ? '💾 Save Changes' : '✅ Save Transaction'}
        </button>

      </div>
    `;

    // Back
    document.getElementById('back-btn').addEventListener('click', () => navigate('transactions'));
    document.getElementById('delete-btn')?.addEventListener('click', deleteTxn);

    // Date
    document.getElementById('txn-date').addEventListener('change', e => { state.date = e.target.value; updatePreview(); });

    // Description
    new SmartInput(document.getElementById('desc-input'), {
      suggestions: descSuggestions,
      value: state.description,
      placeholder: 'What was this for?',
      onInput: v => { state.description = v; updatePreview(); },
      onSelect: v => { state.description = v; updatePreview(); }
    });

    // Amounts
    document.getElementById('amount-spend').addEventListener('input', e => { state.amountSpend = e.target.value; updatePreview(); });
    document.getElementById('amount-income').addEventListener('input', e => { state.income = e.target.value; updatePreview(); });

    // Currency pills
    new PillSelect(document.getElementById('currency-pills'), {
      options: ['QAR','INR','USD'].map(c => ({ value: c, label: c })),
      selected: state.currency,
      color: 'emerald',
      onSelect: v => { state.currency = v || 'QAR'; updatePreview(); }
    });

    // Category 1
    new PillSelect(document.getElementById('cat1-pills'), {
      options: allCategories.map(c => ({ value: c, label: c })),
      selected: state.category1,
      color: 'emerald',
      allowAdd: true,
      onSelect: v => { state.category1 = v || ''; updatePreview(); },
      onAdd: () => promptAddOption('category', 'cat1-pills', allCategories, 1)
    });

    // Category 2
    new PillSelect(document.getElementById('cat2-pills'), {
      options: allCategories.map(c => ({ value: c, label: c })),
      selected: state.category2,
      color: 'emerald',
      allowAdd: true,
      onSelect: v => { state.category2 = v || ''; },
      onAdd: () => promptAddOption('category', 'cat2-pills', allCategories, 2)
    });

    // Notes
    new SmartInput(document.getElementById('notes-input'), {
      suggestions: notesSuggestions,
      value: state.notes1,
      placeholder: 'Any notes…',
      onInput: v => { state.notes1 = v; },
      onSelect: v => { state.notes1 = v; }
    });

    // Account pills
    new PillSelect(document.getElementById('account-pills'), {
      options: allAccounts.map(a => ({ value: a, label: a })),
      selected: state.account,
      color: 'emerald',
      allowAdd: true,
      onSelect: v => { state.account = v || 'Cash'; },
      onAdd: () => promptAddOption('account', 'account-pills', allAccounts, null)
    });

    document.getElementById('save-btn').addEventListener('click', saveTxn);
    updatePreview();
  }

  function updatePreview() {
    const el = document.getElementById('txn-preview');
    if (!el) return;
    const hasSpend  = state.amountSpend && Number(state.amountSpend) > 0;
    const hasIncome = state.income && Number(state.income) > 0;
    const { categoryEmoji } = getModule();
    el.innerHTML = `
      <div style="width:44px;height:44px;border-radius:var(--radius-md);background:var(--primary-bg);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
        ${categoryEmoji(state.category1)}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;color:var(--text);">${state.description || 'Description…'}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${state.category1 || 'Category'} · ${state.account || 'Account'} · ${state.date}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        ${hasSpend  ? `<div style="font-size:15px;font-weight:700;color:var(--danger);font-family:'DM Mono',monospace;">-${formatAmount(state.amountSpend)}</div>` : ''}
        ${hasIncome ? `<div style="font-size:15px;font-weight:700;color:var(--success);font-family:'DM Mono',monospace;">+${formatAmount(state.income)}</div>` : ''}
        ${!hasSpend && !hasIncome ? `<div style="font-size:14px;color:var(--text-muted);">Amount…</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${state.currency}</div>
      </div>
    `;
  }

  // Lazy import helper for categoryEmoji
  function getModule() {
    return { categoryEmoji: (cat) => {
      const map = { 'Food':'🍽️','Groceries':'🛒','Rent':'🏠','Salary':'💵','Transport':'🚗','Medical':'🏥','Education':'📚','Shopping':'🛍️','Utilities':'⚡','Travel':'✈️','Entertainment':'🎬','Transfer':'🔄','Investment':'📈','Insurance':'🛡️','Freelance':'💻','Other':'📌' };
      return map[cat] || '📌';
    }};
  }

  function promptAddOption(type, pillsId, list, catNum) {
    const name = prompt(`New ${type} name:`);
    if (!name || !name.trim()) return;
    const val = name.trim();
    if (!list.includes(val)) list.push(val);
    if (catNum === 1) state.category1 = val;
    else if (catNum === 2) state.category2 = val;
    else state.account = val;
    // Re-render that specific pill group
    render();
  }

  async function saveTxn() {
    if (!state.description.trim()) { showToast('Please enter a description', 'warning'); return; }
    if (!state.amountSpend && !state.income) { showToast('Enter either a spend amount or income', 'warning'); return; }
    if (!state.category1) { showToast('Please select a category', 'warning'); return; }

    const txnData = {
      id:          isEdit ? existing.id : uuidv4(),
      timestamp:   isEdit ? existing.timestamp : new Date().toISOString(),
      date:        state.date,
      description: state.description.trim(),
      amountSpend: state.amountSpend ? Number(state.amountSpend) : null,
      income:      state.income      ? Number(state.income)      : null,
      currency:    state.currency,
      category1:   state.category1,
      category2:   state.category2 || null,
      notes1:      state.notes1    || null,
      account:     state.account,
    };

    try {
      document.getElementById('save-btn').disabled = true;
      document.getElementById('save-btn').textContent = 'Saving…';

      const newData = await writeData('finance', (remote) => {
        const txns = remote.transactions || [];
        // Persist any new custom categories/accounts
        const cats = [...new Set([...(remote.categories || []), ...allCategories.filter(c => !DEFAULT_CATEGORIES.includes(c))])];
        const accs = [...new Set([...(remote.accounts   || []), ...allAccounts.filter(a   => !DEFAULT_ACCOUNTS.includes(a))])];

        if (isEdit) {
          const idx = txns.findIndex(t => t.id === txnData.id);
          if (idx > -1) txns[idx] = txnData; else txns.push(txnData);
        } else {
          txns.push(txnData);
        }
        return { ...remote, transactions: txns, categories: cats, accounts: accs };
      });

      await setCachedFinanceData(newData);
      showToast(isEdit ? 'Transaction updated!' : 'Transaction saved!', 'success');
      navigate('transactions');
    } catch (err) {
      document.getElementById('save-error').textContent = 'Save failed: ' + err.message;
      document.getElementById('save-btn').disabled = false;
      document.getElementById('save-btn').textContent = isEdit ? '💾 Save Changes' : '✅ Save Transaction';
    }
  }

  async function deleteTxn() {
    if (!confirm('Delete this transaction?')) return;
    try {
      const newData = await writeData('finance', (remote) => ({
        ...remote,
        transactions: (remote.transactions || []).filter(t => t.id !== txnId)
      }));
      await setCachedFinanceData(newData);
      showToast('Deleted', 'success');
      navigate('transactions');
    } catch { showToast('Delete failed', 'error'); }
  }

  render();
}
