// v3.5.10 — 2026-03-23
// ─── app-b-private-vault/js/modals/category-manager.js ───────────────────────
// Category Manager Modal: Multi-select, Rename, Merge, Delete

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { localSave } from '../../../shared/sync-manager.js';
import { showToast, uuidv4 } from '../../../shared/utils.js';
import { SmartInput } from '../../../shared/smart-input.js';

export async function openCategoryManager(containerEl) {
  const data = await getCachedFinanceData();
  let { transactions = [], categories = [] } = data || {};
  
  // Ensure categories is a sorted unique array
  let cats = [...new Set(categories)].sort();

  let selected = new Set();
  let modalEl = document.getElementById('modal');
  if (!modalEl) return;

  modalEl.classList.remove('hidden');
  renderModal();

  function renderModal() {
    modalEl.innerHTML = `
      <div class="modal-sheet" style="max-height:92vh; display:flex; flex-direction:column;">
        <div class="modal-handle"></div>
        
        <div style="padding:0 20px 12px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border-light);">
          <span style="font-size:18px; font-weight:700;">🏷️ Manage Categories</span>
          <button id="close-cat-mgr" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted);">&times;</button>
        </div>

        <div style="padding:16px 20px; border-bottom:1px solid var(--border-light);">
          <label class="form-label" style="margin-bottom:8px;">Add New Category</label>
          <div style="display:flex; gap:8px;">
            <div id="new-cat-input-wrap" style="flex:1;"></div>
            <button id="add-cat-btn" class="btn btn-primary" style="padding:0 16px; height:44px;">Add</button>
          </div>
        </div>

        <div id="cat-list-container" style="flex:1; overflow-y:auto; padding:12px 0;">
          ${renderList()}
        </div>

        <div id="multi-action-bar" style="display:${selected.size > 0 ? 'flex' : 'none'}; padding:16px 20px 32px; gap:10px; background:var(--surface); border-top:1px solid var(--border); box-shadow:0 -4px 12px rgba(0,0,0,0.05);">
          <button id="bulk-delete-btn" class="btn btn-secondary" style="flex:1; color:var(--danger); border-color:var(--danger-light);">
            🗑️ Delete (${selected.size})
          </button>
          <button id="bulk-merge-btn" class="btn btn-primary" style="flex:1;">
            🔄 Merge (${selected.size})
          </button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderList() {
    if (cats.length === 0) {
      return `<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px;">No categories yet. Create one above!</div>`;
    }

    return cats.map(cat => {
      const isSelected = selected.has(cat);
      const usageCount = transactions.filter(t => t.category1 === cat || t.category2 === cat).length;
      
      return `
        <div class="cat-row" data-cat="${cat}" style="display:flex; align-items:center; padding:10px 20px; border-bottom:1px solid var(--border-light); transition:background 0.1s;">
          <input type="checkbox" class="cat-check" ${isSelected ? 'checked' : ''} style="width:20px; height:20px; margin-right:16px; cursor:pointer;" />
          <div style="flex:1; min-width:0;">
            <div style="font-size:15px; font-weight:600; color:var(--text);">${cat}</div>
            <div style="font-size:11px; color:var(--text-muted);">${usageCount} transaction${usageCount !== 1 ? 's' : ''}</div>
          </div>
          <button class="rename-cat-btn" style="background:none; border:none; padding:8px; cursor:pointer; font-size:16px; opacity:0.6;">✏️</button>
        </div>
      `;
    }).join('');
  }

  function bindEvents() {
    document.getElementById('close-cat-mgr').addEventListener('click', () => modalEl.classList.add('hidden'));

    // New Cat Input
    const smartInput = new SmartInput(document.getElementById('new-cat-input-wrap'), {
      placeholder: 'e.g. Shopping, Rent...',
      suggestions: cats,
      maxSuggestions: 5
    });

    document.getElementById('add-cat-btn').addEventListener('click', async () => {
      const val = smartInput.value.trim();
      if (!val) return;
      if (val.length > 25) { showToast('Name too long (max 25)', 'warning'); return; }
      if (cats.includes(val)) { showToast('Already exists', 'warning'); return; }

      try {
        const newData = await localSave('finance', r => ({
          ...r, categories: [...new Set([...(r.categories || []), val])].sort()
        }));
        await setCachedFinanceData(newData);
        cats = newData.categories;
        smartInput.setValue('');
        refreshList();
        showToast('Category added', 'success');
      } catch (err) { showToast('Save failed', 'error'); }
    });

    // Bulk actions
    document.getElementById('bulk-delete-btn')?.addEventListener('click', handleBulkDelete);
    document.getElementById('bulk-merge-btn')?.addEventListener('click', handleBulkMerge);

    // List events
    modalEl.querySelectorAll('.cat-row').forEach(row => {
      const cat = row.dataset.cat;
      row.querySelector('.cat-check').addEventListener('change', (e) => {
        if (e.target.checked) selected.add(cat);
        else selected.delete(cat);
        updateActionBar();
      });

      row.querySelector('.rename-cat-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        promptRename(cat);
      });
    });
  }

  function refreshList() {
    document.getElementById('cat-list-container').innerHTML = renderList();
    bindEvents();
    updateActionBar();
  }

  function updateActionBar() {
    const bar = document.getElementById('multi-action-bar');
    if (!bar) return;
    bar.style.display = selected.size > 0 ? 'flex' : 'none';
    const delBtn = document.getElementById('bulk-delete-btn');
    const mrgBtn = document.getElementById('bulk-merge-btn');
    if (delBtn) delBtn.innerHTML = `🗑️ Delete (${selected.size})`;
    if (mrgBtn) mrgBtn.innerHTML = `🔄 Merge (${selected.size})`;
  }

  async function handleBulkDelete() {
    const items = [...selected];
    const totalUsage = transactions.filter(t => items.includes(t.category1) || items.includes(t.category2)).length;
    
    let msg = `Delete ${items.length} categories?`;
    if (totalUsage > 0) {
      msg += `\nWarning: ${totalUsage} transactions will be left without these categories.`;
    }

    if (!confirm(msg)) return;

    try {
      const newData = await localSave('finance', r => {
        const remainingCats = (r.categories || []).filter(c => !items.includes(c));
        const updatedTxns = (r.transactions || []).map(t => {
          let modified = false;
          if (items.includes(t.category1)) { t.category1 = ''; modified = true; }
          if (items.includes(t.category2)) { t.category2 = ''; modified = true; }
          return t;
        });
        return { ...r, categories: remainingCats, transactions: updatedTxns };
      });
      await setCachedFinanceData(newData);
      cats = newData.categories;
      transactions = newData.transactions;
      selected.clear();
      refreshList();
      showToast('Deleted!', 'success');
    } catch (err) { showToast('Delete failed', 'error'); }
  }

  async function handleBulkMerge() {
    const items = [...selected];
    const others = cats.filter(c => !items.includes(c));
    
    if (others.length === 0) {
      showToast('No other category to merge into', 'warning');
      return;
    }

    // Modal within modal for selection? Or simple prompt?
    // Let's use a simple picker
    const target = prompt(`Merge ${items.length} categories into which existing one?\nOptions: ${others.join(', ')}`);
    if (!target || !others.includes(target)) {
      if (target) showToast('Invalid target category', 'warning');
      return;
    }

    try {
      const newData = await localSave('finance', r => {
        const remainingCats = (r.categories || []).filter(c => !items.includes(c));
        const updatedTxns = (r.transactions || []).map(t => {
          if (items.includes(t.category1)) t.category1 = target;
          if (items.includes(t.category2)) t.category2 = target;
          return t;
        });
        return { ...r, categories: remainingCats, transactions: updatedTxns };
      });
      await setCachedFinanceData(newData);
      cats = newData.categories;
      transactions = newData.transactions;
      selected.clear();
      refreshList();
      showToast('Merged successfully', 'success');
    } catch (err) { showToast('Merge failed', 'error'); }
  }

  async function promptRename(oldName) {
    const newName = prompt('Rename "' + oldName + '" to:', oldName);
    if (!newName || newName.trim() === oldName) return;
    const val = newName.trim();
    if (val.length > 25) { showToast('Name too long', 'warning'); return; }
    if (cats.includes(val)) { showToast('Name already exists', 'warning'); return; }

    try {
      const newData = await localSave('finance', r => {
        const idx = (r.categories || []).indexOf(oldName);
        const newCats = [...(r.categories || [])];
        if (idx > -1) newCats[idx] = val;
        
        const updatedTxns = (r.transactions || []).map(t => {
          if (t.category1 === oldName) t.category1 = val;
          if (t.category2 === oldName) t.category2 = val;
          return t;
        });
        return { ...r, categories: newCats.sort(), transactions: updatedTxns };
      });
      await setCachedFinanceData(newData);
      cats = newData.categories;
      transactions = newData.transactions;
      refreshList();
      showToast('Renamed!', 'success');
    } catch (err) { showToast('Rename failed', 'error'); }
  }
}
