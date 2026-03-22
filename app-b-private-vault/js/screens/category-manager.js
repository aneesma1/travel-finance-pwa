// v3.5.5 — 2026-03-22
// ─── app-b-private-vault/js/screens/category-manager.js ─────────────────────
// Full-screen category manager: rename, merge, delete, add, search

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../../shared/db.js';
import { writeData } from '../../../shared/drive.js';
import { localSave } from '../../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { showToast } from '../../../shared/utils.js';

const DEFAULT_CATS = [
  'Food','Groceries','Rent','Salary','Transport','Medical',
  'Education','Shopping','Utilities','Travel','Entertainment',
  'Transfer','Investment','Insurance','Freelance','Other'
];

export async function renderCategoryManager(container) {
  const data = await getCachedFinanceData();
  const { transactions = [], categories: savedCats = [] } = data || {};

  // Merge defaults + saved, deduplicated
  let allCats = [...new Set([...DEFAULT_CATS, ...savedCats])];

  let searchQuery = '';

  function txnCount(cat) {
    return transactions.filter(t => t.category1 === cat || t.category2 === cat).length;
  }

  function render() {
    const filtered = allCats.filter(c =>
      c.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const withCounts = filtered.map(c => ({ name: c, count: txnCount(c) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    container.innerHTML = `
      <div class="app-header" style="background:var(--primary-vault,#065F46);">
        <button class="app-header-action" id="back-btn" style="color:#fff;">←</button>
        <span class="app-header-title">🏷 Categories</span>
        <button class="app-header-action" id="add-btn" style="color:#fff;font-size:20px;font-weight:700;">＋</button>
      </div>

      <div style="padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10;">
        <input type="text" id="cat-search" class="form-input"
          placeholder="🔍 Search categories…"
          value="${searchQuery}"
          style="margin:0;background:var(--surface-3);" />
      </div>

      <div style="padding:12px 16px 4px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
          ${withCounts.length} categor${withCounts.length !== 1 ? 'ies' : 'y'}
        </span>
        <span style="font-size:12px;color:var(--text-muted);">
          ${allCats.reduce((s,c) => s + txnCount(c), 0)} total transactions
        </span>
      </div>

      <div style="padding:0 16px 80px;" id="cat-list">
        ${withCounts.length === 0
          ? `<div style="text-align:center;padding:48px 24px;">
               <div style="font-size:40px;margin-bottom:12px;">🏷</div>
               <div style="font-size:15px;font-weight:600;">No categories found</div>
             </div>`
          : withCounts.map(({ name, count }) => `
            <div class="cat-row" data-cat="${name.replace(/"/g,'&quot;')}"
              style="background:var(--surface);border:1px solid var(--border);border-radius:12px;
                margin-bottom:10px;overflow:hidden;">
              <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:15px;font-weight:600;color:var(--text);">${name}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    ${count} transaction${count !== 1 ? 's' : ''}
                  </div>
                </div>
                <button class="cat-expand" data-cat="${name.replace(/"/g,'&quot;')}"
                  style="background:none;border:1px solid var(--border);border-radius:8px;
                    padding:6px 12px;font-size:13px;cursor:pointer;color:var(--text-secondary);">
                  Actions ›
                </button>
              </div>
              <div class="cat-actions" data-for="${name.replace(/"/g,'&quot;')}"
                style="display:none;padding:0 16px 14px;display:none;gap:8px;flex-wrap:wrap;">
                <button class="cat-rename" data-cat="${name.replace(/"/g,'&quot;')}"
                  style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);
                    background:var(--surface-3);font-size:13px;cursor:pointer;font-family:inherit;">
                  ✏️ Rename
                </button>
                <button class="cat-merge" data-cat="${name.replace(/"/g,'&quot;')}"
                  style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);
                    background:var(--surface-3);font-size:13px;cursor:pointer;font-family:inherit;">
                  🔀 Merge into…
                </button>
                ${count === 0
                  ? `<button class="cat-delete" data-cat="${name.replace(/"/g,'&quot;')}"
                      style="padding:8px 14px;border-radius:8px;border:1px solid var(--danger-bg);
                        background:transparent;color:var(--danger);font-size:13px;cursor:pointer;font-family:inherit;">
                      🗑 Delete
                    </button>`
                  : `<button class="cat-reassign" data-cat="${name.replace(/"/g,'&quot;')}"
                      style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);
                        background:var(--surface-3);font-size:13px;cursor:pointer;font-family:inherit;">
                      ↩ Reassign all
                    </button>`
                }
              </div>
            </div>
          `).join('')}
      </div>
    `;

    // Back
    document.getElementById('back-btn').addEventListener('click', () => navigate('settings'));

    // Search
    document.getElementById('cat-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      render();
    });

    // Add
    document.getElementById('add-btn').addEventListener('click', () => openAddSheet());

    // Expand/collapse actions
    container.querySelectorAll('.cat-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionsEl = container.querySelector(`.cat-actions[data-for="${btn.dataset.cat}"]`);
        if (!actionsEl) return;
        const isOpen = actionsEl.style.display === 'flex';
        // Close all first
        container.querySelectorAll('.cat-actions').forEach(el => el.style.display = 'none');
        container.querySelectorAll('.cat-expand').forEach(el => { el.textContent = 'Actions ›'; });
        if (!isOpen) {
          actionsEl.style.display = 'flex';
          btn.textContent = 'Close ✕';
        }
      });
    });

    // Rename
    container.querySelectorAll('.cat-rename').forEach(btn => {
      btn.addEventListener('click', () => openRenameSheet(btn.dataset.cat));
    });

    // Merge
    container.querySelectorAll('.cat-merge').forEach(btn => {
      btn.addEventListener('click', () => openMergeSheet(btn.dataset.cat));
    });

    // Delete (0 transactions only)
    container.querySelectorAll('.cat-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteCat(btn.dataset.cat));
    });

    // Reassign all (has transactions)
    container.querySelectorAll('.cat-reassign').forEach(btn => {
      btn.addEventListener('click', () => openReassignSheet(btn.dataset.cat));
    });
  }

  // ── Add new category ──────────────────────────────────────────────────────
  function openAddSheet() {
    const sheet = makeSheet(
      '+ Add Category',
      `<input id="add-cat-input" type="text" class="form-input" placeholder="Category name…" style="margin-bottom:12px;" />
       <button id="add-cat-confirm" class="btn btn-primary btn-full">Add Category</button>`
    );
    setTimeout(() => sheet.querySelector('#add-cat-input')?.focus(), 100);
    sheet.querySelector('#add-cat-confirm').addEventListener('click', async () => {
      const val = sheet.querySelector('#add-cat-input').value.trim();
      if (!val) { showToast('Enter a name', 'warning'); return; }
      if (allCats.includes(val)) { showToast('Already exists', 'warning'); return; }
      allCats.push(val);
      const saved = await localSave('finance', r => ({
        ...r, categories: [...new Set([...(r.categories||[]), val])]
      }));
      await setCachedFinanceData(saved);
      closeSheet(sheet);
      showToast('"' + val + '" added', 'success');
      render();
    });
    sheet.querySelector('#add-cat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sheet.querySelector('#add-cat-confirm').click();
    });
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  function openRenameSheet(cat) {
    const count = txnCount(cat);
    const sheet = makeSheet(
      '✏️ Rename "' + cat + '"',
      `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
        Updates all ${count} transaction${count !== 1 ? 's' : ''} using this category.
       </div>
       <input id="rename-input" type="text" class="form-input" value="${cat.replace(/"/g,'&quot;')}" style="margin-bottom:12px;" />
       <div style="display:flex;gap:8px;">
         <button id="rename-cancel" class="btn btn-secondary" style="flex:1;">Cancel</button>
         <button id="rename-confirm" class="btn btn-primary" style="flex:2;">Save</button>
       </div>`
    );
    const input = sheet.querySelector('#rename-input');
    setTimeout(() => { input.focus(); input.select(); }, 100);
    sheet.querySelector('#rename-cancel').addEventListener('click', () => closeSheet(sheet));
    sheet.querySelector('#rename-confirm').addEventListener('click', async () => {
      const newName = input.value.trim();
      if (!newName || newName === cat) { closeSheet(sheet); return; }
      await applyCatRename(cat, newName);
      closeSheet(sheet);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sheet.querySelector('#rename-confirm').click(); });
  }

  async function applyCatRename(oldName, newName) {
    const idx = allCats.indexOf(oldName);
    if (idx > -1) allCats[idx] = newName;
    else allCats.push(newName);

    const saved = await localSave('finance', r => ({
      ...r,
      categories: (r.categories||[]).map(c => c === oldName ? newName : c),
      transactions: (r.transactions||[]).map(t => ({
        ...t,
        category1: t.category1 === oldName ? newName : t.category1,
        category2: t.category2 === oldName ? newName : t.category2,
      }))
    }));
    await setCachedFinanceData(saved);
    showToast('"' + oldName + '" renamed to "' + newName + '"', 'success', 3000);
    render();
  }

  // ── Merge into another ────────────────────────────────────────────────────
  function openMergeSheet(fromCat) {
    const others = allCats.filter(c => c !== fromCat);
    const fromCount = txnCount(fromCat);
    const sheet = makeSheet(
      '🔀 Merge "' + fromCat + '"',
      `<div style="background:var(--surface-3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;">
        <strong>${fromCount} transaction${fromCount !== 1 ? 's' : ''}</strong> will move to the selected category.
        "${fromCat}" will then be deleted.
       </div>
       <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
         Select target category
       </div>
       <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow-y:auto;margin-bottom:14px;" id="merge-targets">
         ${others.map(c => `
           <button class="merge-pill" data-cat="${c.replace(/"/g,'&quot;')}"
             style="padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);
               background:transparent;color:var(--text);font-size:13px;cursor:pointer;font-family:inherit;">
             ${c} <span style="color:var(--text-muted);font-size:11px;">(${txnCount(c)})</span>
           </button>`).join('')}
       </div>
       <button id="merge-cancel" class="btn btn-secondary btn-full">Cancel</button>`
    );

    sheet.querySelector('#merge-cancel').addEventListener('click', () => closeSheet(sheet));
    let selected = null;
    sheet.querySelectorAll('.merge-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = btn.dataset.cat;
        sheet.querySelectorAll('.merge-pill').forEach(b => {
          const active = b === btn;
          b.style.border = '1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)');
          b.style.background = active ? 'var(--primary-bg)' : 'transparent';
          b.style.color = active ? 'var(--primary)' : 'var(--text)';
          b.style.fontWeight = active ? '700' : '400';
        });
        // Replace cancel with confirm
        const cancelBtn = sheet.querySelector('#merge-cancel');
        cancelBtn.textContent = 'Merge into "' + selected + '"';
        cancelBtn.className = 'btn btn-primary btn-full';
        cancelBtn.id = 'merge-confirm';
        cancelBtn.addEventListener('click', async () => {
          await applyMerge(fromCat, selected);
          closeSheet(sheet);
        });
      });
    });
  }

  async function applyMerge(fromCat, toCat) {
    allCats = allCats.filter(c => c !== fromCat);
    const saved = await localSave('finance', r => ({
      ...r,
      categories: (r.categories||[]).filter(c => c !== fromCat),
      transactions: (r.transactions||[]).map(t => ({
        ...t,
        category1: t.category1 === fromCat ? toCat : t.category1,
        category2: t.category2 === fromCat ? toCat : t.category2,
      }))
    }));
    await setCachedFinanceData(saved);
    showToast('Merged "' + fromCat + '" into "' + toCat + '"', 'success', 3000);
    render();
  }

  // ── Reassign all (when deleting cat with transactions) ────────────────────
  function openReassignSheet(fromCat) {
    const others = allCats.filter(c => c !== fromCat);
    const fromCount = txnCount(fromCat);
    const sheet = makeSheet(
      '↩ Reassign "' + fromCat + '"',
      `<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
        Move all <strong>${fromCount} transaction${fromCount !== 1 ? 's' : ''}</strong> to another category.
        "${fromCat}" will be kept.
       </div>
       <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow-y:auto;margin-bottom:14px;">
         ${others.map(c => `
           <button class="reassign-pill" data-cat="${c.replace(/"/g,'&quot;')}"
             style="padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);
               background:transparent;color:var(--text);font-size:13px;cursor:pointer;font-family:inherit;">
             ${c}
           </button>`).join('')}
       </div>
       <button id="reassign-cancel" class="btn btn-secondary btn-full">Cancel</button>`
    );
    sheet.querySelector('#reassign-cancel').addEventListener('click', () => closeSheet(sheet));
    sheet.querySelectorAll('.reassign-pill').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toCat = btn.dataset.cat;
        closeSheet(sheet);
        const saved = await localSave('finance', r => ({
          ...r,
          transactions: (r.transactions||[]).map(t => ({
            ...t,
            category1: t.category1 === fromCat ? toCat : t.category1,
            category2: t.category2 === fromCat ? toCat : t.category2,
          }))
        }));
        await setCachedFinanceData(saved);
        showToast('Reassigned "' + fromCat + '" → "' + toCat + '"', 'success', 3000);
        render();
      });
    });
  }

  // ── Delete (0 transactions) ───────────────────────────────────────────────
  async function deleteCat(cat) {
    if (!confirm('Delete category "' + cat + '"?')) return;
    allCats = allCats.filter(c => c !== cat);
    const saved = await localSave('finance', r => ({
      ...r,
      categories: (r.categories||[]).filter(c => c !== cat)
    }));
    await setCachedFinanceData(saved);
    showToast('"' + cat + '" deleted', 'success');
    render();
  }

  // ── Sheet helpers ─────────────────────────────────────────────────────────
  function makeSheet(title, bodyHtml) {
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;' +
      'background:var(--surface);border-radius:20px 20px 0 0;' +
      'border-top:1px solid var(--border);padding:16px 20px 40px;' +
      'box-shadow:0 -4px 24px rgba(0,0,0,0.18);';
    sheet.innerHTML =
      '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px;"></div>' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:14px;">' + title + '</div>' +
      bodyHtml;

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
    backdrop.addEventListener('click', () => closeSheet(sheet));
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    sheet._backdrop = backdrop;
    return sheet;
  }

  function closeSheet(sheet) {
    sheet._backdrop?.remove();
    sheet.remove();
  }

  render();
}
