// v4.1.0 — 2026-05-15 — Modal filter pickers for export; Bank/Card column; multi-select year+month

// ─── app-b-private-vault/js/screens/settings.js ─────────────────────────────
// Settings: data management, XLSX export, PIN/security, about
// Tabs: Data | Export | Security | About

'use strict';

import { getCachedFinanceData, setCachedFinanceData, clearAllCachedData } from '../../../shared/db.js';
import {
  currentMonth, currentYear, formatDisplayDate, showToast, isOnline,
  copyToClipboard, showConfirmModal, getAppState, setAppState
} from '../../../shared/utils.js';
import { downloadLocalBackup, restoreFromLocalFile, timestampSuffix } from '../../../shared/drive.js';
import { showRestoreDialog } from '../../../shared/restore-dialog.js';
import { localSave } from '../../../shared/sync-manager.js';
import { changePin, isPinSet } from '../pin.js';
import { navigate } from '../router.js';
import { renderImportTool } from '../../../shared/import-tool.js';
import { openCategoryManager } from '../modals/category-manager.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function renderSettings(container, params = {}) {
  const data = await getCachedFinanceData();
  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data || {};

  // Auto-open specific tab if navigated with param
  const activeTab = params.tab || 'data';

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>

    <!-- Tab bar -->
    <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;">
      ${[
        { id: 'data',     label: '💾 Data'     },
        { id: 'export',   label: '📤 Export'   },
        { id: 'security', label: '🔐 Security' },
        { id: 'about',    label: 'ℹ️ About'    },
      ].map(tab => `
        <button class="settings-tab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}" style="
          flex:1; padding:12px 4px; border:none; background:none; cursor:pointer;
          font-size:11px; font-weight:600;
          color:${activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)'};
          border-bottom:2px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'};
          transition:all 0.15s; font-family:inherit;
        ">${tab.label}</button>
      `).join('')}
    </div>

    <div id="tab-content" style="padding-bottom:32px;"></div>
    <div class="modal-overlay hidden" id="modal"></div>
  `;

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  switch (activeTab) {
    case 'data':     renderDataTab(transactions, data);   break;
    case 'export':   renderExportTab(transactions, data); break;
    case 'security': renderSecurityTab();                 break;
    case 'about':    renderAboutTab(data);                break;
  }

  // ── DATA TAB ──────────────────────────────────────────────────────────────
  function renderDataTab(transactions, data) {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Backup & Restore</div>
      <div class="card" style="margin:0 16px;">
        <div class="list-row" id="backup-now">
          <span style="font-size:20px;">💾</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Backup Now</div>
            <div style="font-size:12px;color:var(--text-muted);">Download .vaultbox to device (${transactions.length} records)</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="restore-local">
          <span style="font-size:20px;">📂</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Restore from Backup</div>
            <div style="font-size:12px;color:var(--text-muted);">Pick a .vaultbox or .json backup file</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Data Import</div>
      <div class="card" style="margin:0 16px;">
        <div class="list-row" id="import-data">
          <span style="font-size:20px;">📥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Import from Excel / CSV</div>
            <div style="font-size:12px;color:var(--text-muted);">Migrate existing finance records</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="photo-zip-btn">
          <span style="font-size:20px;">📦</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Export Transaction Photos as ZIP</div>
            <div style="font-size:12px;color:var(--text-muted);">Receipts, cheques, screenshots</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Categories</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;">
        <div class="list-row" id="manage-cats-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🏷</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Manage Categories</div>
            <div style="font-size:12px;color:var(--text-muted);">Rename · Merge · Reassign · Delete</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
      <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
        <div class="list-row" id="reset-db-btn" style="border:none;border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🔥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
            <div style="font-size:11px;color:var(--text-muted);">Permanently delete all finance records from this device.</div>
          </div>
          <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
        </div>
      </div>
      <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
        ⚠️ This wipes all local data. Please <b>Backup Now</b> before resetting.
      </div>
    `;

    // Category manager
    document.getElementById('manage-cats-btn').addEventListener('click', () => {
      openCategoryManager(container);
    });

    // Backup Now
    document.getElementById('backup-now').addEventListener('click', () => {
      downloadLocalBackup('finance', data);
      showToast('Backup downloaded!', 'success');
    });

    // Restore from backup
    document.getElementById('restore-local').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.vaultbox';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        input.value = '';
        const strategy = await showRestoreDialog({
          title: 'How should the backup be loaded?',
          source: file.name,
        });
        if (!strategy) return;
        try {
          showToast('Restoring…', 'info', 2000);
          await restoreFromLocalFile(file, 'finance', strategy);
          const label = strategy === 'wipe' ? 'Wiped & replaced' : strategy === 'append' ? 'Appended' : 'Merged';
          showToast('✅ ' + label + ' successfully!', 'success');
          setTimeout(() => window.location.reload(), 800);
        } catch (err) {
          showToast('❌ Restore failed: ' + err.message, 'error', 5000);
        }
      };
      input.click();
    });

    // Import from Excel/CSV
    document.getElementById('import-data').addEventListener('click', () => {
      openFinanceImportModal(transactions);
    });

    // Export photos as ZIP
    document.getElementById('photo-zip-btn').addEventListener('click', async () => {
      try {
        showToast('Preparing photos…', 'info', 2000);
        const cached = await getCachedFinanceData();
        if (!cached) { showToast('No data found', 'warning'); return; }

        if (!window.JSZip) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }

        const zip = new JSZip();
        let count = 0;

        (cached.transactions || []).forEach(t => {
          (t.photos || []).forEach((p, i) => {
            if (p?.startsWith('data:')) {
              const b64 = p.split(',')[1];
              const date = t.date || 'unknown';
              const desc = (t.description || 'txn').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
              zip.folder('transactions').file(`${date}_${desc}_${i + 1}.jpg`, b64, { base64: true });
              count++;
            }
          });
        });

        if (count === 0) { showToast('No photos found to export', 'warning'); return; }

        const ts = new Date().toISOString().replace('T', '_').slice(0, 16).replace(':', '-');
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Finance_Photos_${ts}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(`✅ ${count} photos exported`, 'success');
      } catch (err) {
        showToast('ZIP export failed: ' + err.message, 'error');
      }
    });

    // Reset all data (local only — no Drive)
    document.getElementById('reset-db-btn').addEventListener('click', async () => {
      if (!confirm('⚠️ RESET ALL DATA?\n\nThis permanently deletes all transactions, categories and settings from this device.\n\nHave you taken a backup first?')) return;
      if (!confirm('SECOND CONFIRMATION:\n\nThis cannot be undone. Are you absolutely sure?')) return;

      try {
        showToast('Resetting…', 'info', 3000);
        await localSave('finance', () => ({ schemaVersion: 1, transactions: [], categories: [], accounts: [] }));
        await clearAllCachedData();
        showToast('Reset complete', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        showToast('Reset failed: ' + err.message, 'error');
      }
    });
  }

  // ── EXPORT TAB ────────────────────────────────────────────────────────────
  function renderExportTab(transactions, data) {
    const tab = document.getElementById('tab-content');

    // ── Build filter data ─────────────────────────────────────────────────
    const allYears = [...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
    const allCat1  = [...new Set([...savedCats, ...transactions.map(t => t.category1).filter(Boolean)])].sort();
    const allCat2  = [...new Set(transactions.map(t => t.category2).filter(Boolean))].sort();

    let selectedYears  = [];
    let selectedMonths = [];
    let selectedCur    = '';
    let selectedCat1   = [];
    let selectedCat2   = [];

    function updateCount() {
      const filtered = transactions.filter(t => {
        if (selectedYears.length  && !selectedYears.includes(t.date?.slice(0, 4))) return false;
        if (selectedMonths.length && !selectedMonths.includes(Number(t.date?.slice(5, 7)))) return false;
        if (selectedCur && t.currency !== selectedCur) return false;
        if (selectedCat1.length > 0 && !selectedCat1.includes(t.category1)) return false;
        if (selectedCat2.length > 0 && !selectedCat2.includes(t.category2)) return false;
        return true;
      });
      const countEl = document.getElementById('export-count');
      if (countEl) countEl.textContent = filtered.length + ' transaction' + (filtered.length !== 1 ? 's' : '') + ' will be exported';
      const sumEl = document.getElementById('export-filter-summary');
      if (sumEl) {
        const parts = [];
        if (selectedYears.length)  parts.push(selectedYears.join(', '));
        if (selectedMonths.length) parts.push(selectedMonths.map(m => MONTHS[m-1]).join(', '));
        if (selectedCur)           parts.push(selectedCur);
        if (selectedCat1.length)   parts.push('Cat: ' + selectedCat1.join(', '));
        if (selectedCat2.length)   parts.push('Sub: ' + selectedCat2.join(', '));
        sumEl.textContent = parts.length ? parts.join(' · ') : 'All records';
      }
      return filtered;
    }

    function refreshFilterRows() {
      const R = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
      R('frow-year',  selectedYears.length  ? selectedYears.join(', ')               : 'All years');
      R('frow-month', selectedMonths.length ? selectedMonths.map(m => MONTHS[m-1]).join(', ') : 'All months');
      R('frow-cur',   selectedCur || 'All');
      R('frow-cat1',  selectedCat1.length   ? selectedCat1.join(', ')                : 'All');
      R('frow-cat2',  selectedCat2.length   ? selectedCat2.join(', ')                : 'All');
      updateCount();
    }

    function openPickerModal(title, options, selected, multi, onDone) {
      document.getElementById('exp-picker-modal')?.remove();
      document.getElementById('exp-picker-backdrop')?.remove();
      const backdrop = document.createElement('div');
      backdrop.id = 'exp-picker-backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1100;';
      const modal = document.createElement('div');
      modal.id = 'exp-picker-modal';
      modal.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1101;background:var(--surface);border-radius:20px 20px 0 0;border-top:1px solid var(--border);max-height:50vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);';
      let cur = multi ? [...selected] : (selected.length ? selected[0] : '');
      const render = () => {
        modal.innerHTML = `
          <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:12px auto 0;flex-shrink:0;"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px 8px;flex-shrink:0;">
            <span style="font-size:15px;font-weight:700;">${title}</span>
            <div style="display:flex;gap:8px;">
              ${multi && cur.length > 0 ? `<button id="pm-clear" style="font-size:12px;color:var(--danger);background:none;border:none;cursor:pointer;padding:4px 8px;">Clear all</button>` : ''}
              <button id="pm-done" class="btn btn-primary" style="padding:6px 16px;font-size:13px;">Done</button>
            </div>
          </div>
          <div style="overflow-y:auto;flex:1;padding:8px 16px 16px;">
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${options.map(opt => {
                const val = typeof opt === 'object' ? opt.value : opt;
                const label = typeof opt === 'object' ? opt.label : opt;
                const active = multi ? cur.includes(val) : cur === val;
                return `<button type="button" data-val="${val}" style="padding:8px 14px;border-radius:99px;cursor:pointer;font-size:13px;font-weight:${active?'700':'500'};white-space:nowrap;border:1.5px solid ${active?'#4F46E5':'#D1D5DB'};background:${active?'#4F46E5':'#F8FAFC'};color:${active?'#fff':'#374151'};">${label}</button>`;
              }).join('')}
            </div>
          </div>
        `;
        modal.querySelectorAll('button[data-val]').forEach(btn => {
          btn.addEventListener('click', () => {
            const v = btn.dataset.val;
            if (multi) { const idx = cur.indexOf(v); if (idx > -1) cur.splice(idx, 1); else cur.push(v); }
            else { cur = cur === v ? '' : v; }
            render();
          });
        });
        modal.querySelector('#pm-done')?.addEventListener('click', () => { onDone(cur); backdrop.remove(); modal.remove(); });
        modal.querySelector('#pm-clear')?.addEventListener('click', () => { cur = multi ? [] : ''; render(); });
      };
      render();
      backdrop.addEventListener('click', () => { backdrop.remove(); modal.remove(); });
      document.body.appendChild(backdrop);
      document.body.appendChild(modal);
    }

    function filterRowHtml(id, label, valueId) {
      return `<div id="${id}" style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border-light);cursor:pointer;"><span style="font-size:13px;color:var(--text-muted);font-weight:600;min-width:90px;">${label}</span><span id="${valueId}" style="font-size:13px;color:var(--text);flex:1;text-align:right;padding-right:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span><span style="color:var(--text-muted);">›</span></div>`;
    }

    tab.innerHTML = `
      <div class="section-title">Filter to Export</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:4px 16px 0;">
        ${filterRowHtml('open-year-picker', '📅 Year', 'frow-year')}
        ${filterRowHtml('open-month-picker', '📆 Month', 'frow-month')}
        ${filterRowHtml('open-cur-picker', '💱 Currency', 'frow-cur')}
        ${filterRowHtml('open-cat1-picker', '🏷️ Category 1', 'frow-cat1')}
        ${filterRowHtml('open-cat2-picker', '🏷️ Category 2', 'frow-cat2')}
        <div id="export-count" style="font-size:13px;color:var(--primary);font-weight:600;padding:10px 0;text-align:center;"></div>
      </div>
      <div id="export-filter-summary" style="margin:6px 16px;font-size:11px;color:var(--text-muted);text-align:center;"></div>

      <div class="section-title">Export Options</div>
      <div class="card" style="margin:0 16px;">
        <div class="export-option" id="download-xlsx">
          <div class="export-icon" style="background:var(--success-bg);">📊</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;">Download .xlsx</div>
            <div style="font-size:12px;color:var(--text-muted);">Save Excel file to device</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="divider"></div>
        <div class="export-option" id="email-xlsx">
          <div class="export-icon" style="background:var(--primary-bg);">✉️</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;">Send via Email / Share</div>
            <div style="font-size:12px;color:var(--text-muted);">Opens share sheet with .xlsx attached</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div id="export-status" style="margin:12px 16px;font-size:13px;color:var(--text-muted);text-align:center;word-break:break-all;overflow-wrap:break-word;"></div>

      <div class="section-title">Column Order (fixed)</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:12px 16px;">
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;font-family:'DM Mono',monospace;">
          Timestamp · Date · Description · Amount Spend · Income · Category 1 · Category 2 · Notes 1 · Account · Bank/Card · Currency
        </div>
      </div>
    `;

    document.getElementById('open-year-picker').addEventListener('click', () => {
      openPickerModal('📅 Select Year(s)', allYears, selectedYears, true, val => { selectedYears = val; refreshFilterRows(); });
    });
    document.getElementById('open-month-picker').addEventListener('click', () => {
      openPickerModal('📆 Select Month(s)', MONTHS.map((m, i) => ({ value: i + 1, label: m })), selectedMonths, true, val => { selectedMonths = val.map(Number); refreshFilterRows(); });
    });
    document.getElementById('open-cur-picker').addEventListener('click', () => {
      openPickerModal('💱 Currency', ['QAR', 'INR', 'USD'], [selectedCur].filter(Boolean), false, val => { selectedCur = val; refreshFilterRows(); });
    });
    document.getElementById('open-cat1-picker').addEventListener('click', () => {
      openPickerModal('🏷️ Category 1', allCat1, selectedCat1, true, val => { selectedCat1 = val; refreshFilterRows(); });
    });
    document.getElementById('open-cat2-picker').addEventListener('click', () => {
      openPickerModal('🏷️ Category 2 / Sub', allCat2, selectedCat2, true, val => { selectedCat2 = val; refreshFilterRows(); });
    });

    refreshFilterRows();

    document.getElementById('download-xlsx').addEventListener('click', () => {
      const filtered = updateCount();
      exportToXlsx(filtered, false);
    });
    document.getElementById('email-xlsx').addEventListener('click', () => {
      const filtered = updateCount();
      exportToXlsx(filtered, true);
    });
  }

  // ── XLSX Export ───────────────────────────────────────────────────────────
  async function exportToXlsx(transactions, sendEmail) {
    const statusEl = document.getElementById('export-status');
    if (!transactions.length) { showToast('No records to export', 'warning'); return; }

    statusEl.textContent = 'Generating spreadsheet…';

    // Load SheetJS from CDN
    if (!window.XLSX) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const XLSX = window.XLSX;
    const headers = [
      'Timestamp', 'Date', 'Description', 'Amount Spend', 'Income',
      'Category 1', 'Category 2', 'Notes 1', 'Account', 'Bank/Card', 'Currency'
    ];

    const rows = transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => [
        t.timestamp    || '',
        t.date         || '',
        t.description  || '',
        t.amountSpend  != null ? Number(t.amountSpend) : '',
        t.income       != null ? Number(t.income)      : '',
        t.category1    || '',
        t.category2    || '',
        t.notes1       || '',
        t.account      || '',
        t.bankName     || '',
        t.currency     || '',
      ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    ws['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 8 }
    ];

    headers.forEach((_, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '065F46' } } };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const expYr  = document.getElementById('frow-year')?.textContent  || 'All';
    const expCur = document.getElementById('frow-cur')?.textContent   || 'All';
    const moLabel = document.getElementById('frow-month')?.textContent || 'All';
    const ts = timestampSuffix();
    const filename = `Finance_Export_${expCur}_${expYr}${moLabel ? '_' + moLabel : ''}_${ts}.xlsx`;

    if (!sendEmail) {
      XLSX.writeFile(wb, filename);
      statusEl.textContent = `✅ Downloaded: ${filename}`;
      showToast('Excel file downloaded!', 'success');
    } else {
      try {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const subject = encodeURIComponent(`Finance Export — ${moLabel} ${expYr}`);
        const body = encodeURIComponent(
          `Finance export attached.\n\nPeriod: ${moLabel} ${expYr}\nCurrency: ${expCur}\nRecords: ${transactions.length}\n\nGenerated by Private Vault`
        );
        const blob = new Blob(
          [Uint8Array.from(atob(wbout), c => c.charCodeAt(0))],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        const file = new File([blob], filename, { type: blob.type });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Finance Export' });
          statusEl.textContent = '✅ Shared via system share sheet';
        } else {
          window.location.href = `mailto:?subject=${subject}&body=${body}`;
          setTimeout(() => {
            XLSX.writeFile(wb, filename);
            statusEl.innerHTML = `✅ Email app opened. File also downloaded as backup.<br>
              <span style="font-size:11px;color:var(--text-muted);">Attach the downloaded file manually if needed.</span>`;
          }, 500);
        }
      } catch (err) {
        XLSX.writeFile(wb, filename);
        statusEl.textContent = '⚠️ Share failed — file downloaded instead.';
      }
    }
  }

  // ── SECURITY TAB ──────────────────────────────────────────────────────────
  function renderSecurityTab() {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Auto-lock</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Lock app after inactivity</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;" id="lock-timeout-pills">
          ${[
            { label: '1 min',  ms: 60000   },
            { label: '5 min',  ms: 300000  },
            { label: '15 min', ms: 900000  },
            { label: '30 min', ms: 1800000 },
            { label: 'Never',  ms: 0       }
          ].map(opt => {
            const current = Number(localStorage.getItem('vault_lock_timeout_ms') || 300000);
            const active = opt.ms === current || (opt.ms === 300000 && !localStorage.getItem('vault_lock_timeout_ms'));
            return `<button class="pill-btn ${active ? 'active' : ''}" data-ms="${opt.ms}" style="
              padding:8px 16px;border-radius:20px;
              border:1.5px solid ${active ? 'var(--primary)' : 'var(--border)'};
              background:${active ? 'var(--primary-bg)' : 'transparent'};
              color:${active ? 'var(--primary)' : 'var(--text)'};
              font-size:14px;cursor:pointer;
            ">${opt.label}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Change PIN</div>
      <div class="card" style="margin:0 16px;padding:20px;">
        <div class="form-group" style="margin:0 0 16px;">
          <label class="form-label">Current PIN</label>
          <input type="password" class="form-input" id="current-pin"
            inputmode="numeric" maxlength="4" placeholder="····"
            style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div class="form-group" style="margin:0 0 16px;">
          <label class="form-label">New PIN</label>
          <input type="password" class="form-input" id="new-pin"
            inputmode="numeric" maxlength="4" placeholder="····"
            style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div class="form-group" style="margin:0 0 20px;">
          <label class="form-label">Confirm New PIN</label>
          <input type="password" class="form-input" id="confirm-pin"
            inputmode="numeric" maxlength="4" placeholder="····"
            style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div id="pin-error" style="color:var(--danger);font-size:13px;text-align:center;min-height:18px;margin-bottom:12px;"></div>
        <button class="btn btn-primary btn-full" id="change-pin-btn">🔑 Change PIN</button>
      </div>
    `;

    // Auto-lock pills
    document.querySelectorAll('#lock-timeout-pills .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ms = Number(btn.dataset.ms);
        localStorage.setItem('vault_lock_timeout_ms', String(ms));
        document.querySelectorAll('#lock-timeout-pills .pill-btn').forEach(b => {
          const active = b === btn;
          b.style.border     = `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`;
          b.style.background = active ? 'var(--primary-bg)' : 'transparent';
          b.style.color      = active ? 'var(--primary)' : 'var(--text)';
        });
        showToast('Auto-lock set to ' + btn.textContent, 'success');
      });
    });

    // Change PIN
    document.getElementById('change-pin-btn').addEventListener('click', async () => {
      const cur  = document.getElementById('current-pin').value;
      const nw   = document.getElementById('new-pin').value;
      const conf = document.getElementById('confirm-pin').value;
      const err  = document.getElementById('pin-error');

      if (!cur || cur.length !== 4)  { err.textContent = 'Enter your current 4-digit PIN'; return; }
      if (!nw  || nw.length  !== 4)  { err.textContent = 'New PIN must be 4 digits';       return; }
      if (nw !== conf)                { err.textContent = 'New PINs do not match';          return; }
      if (nw === cur)                 { err.textContent = 'New PIN must differ from current';return; }

      try {
        await changePin(cur, nw);
        showToast('PIN changed successfully!', 'success');
        err.textContent = '';
        ['current-pin', 'new-pin', 'confirm-pin'].forEach(id => {
          document.getElementById(id).value = '';
        });
      } catch (e) {
        err.textContent = e.message.startsWith('WRONG') ? 'Current PIN is incorrect' : e.message;
      }
    });
  }

  // ── ABOUT TAB ─────────────────────────────────────────────────────────────
  function renderAboutTab(data) {
    const tab = document.getElementById('tab-content');
    const htmlVer   = window.HTML_VERSION || '4.0.0';
    const buildTime = window.BUILD_TIME   || '2026-05-01';
    tab.innerHTML = `
      <div class="section-title">App Info</div>
      <div style="margin:0 16px;padding:16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">🔐 Private Vault</div>
        <div style="font-size:13px;color:var(--text-muted);">HTML Version: <b>${htmlVer}</b></div>
        <div style="font-size:13px;color:var(--text-muted);">Build date: ${buildTime}</div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);font-size:13px;color:var(--text-secondary);line-height:1.8;">
          ${data?.transactions?.length || 0} transactions &nbsp;·&nbsp;
          ${data?.categories?.length   || 0} categories &nbsp;·&nbsp;
          ${data?.accounts?.length     || 0} accounts
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
          Local-first · PIN-protected · No cloud required
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Cache</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;">
        <div class="list-row" id="clear-cache-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🧹</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Clear App Cache</div>
            <div style="font-size:12px;color:var(--text-muted);">Removes cached data and reloads</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Troubleshooting</div>
      <div style="margin:0 16px;">
        <button id="force-update-btn" style="
          width:100%;padding:12px;font-size:13px;font-weight:700;
          background:rgba(220,38,38,0.1);color:var(--danger);
          border:1px solid var(--danger);border-radius:var(--radius-md);cursor:pointer;
        ">⚠️ Force Reload App</button>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:center;">
          Use if app is stuck or not showing updates.
        </div>
      </div>
    `;

    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
      if (!confirm('Clear app cache? The page will reload.')) return;
      await clearAllCachedData();
      showToast('Cache cleared', 'success');
      setTimeout(() => window.location.reload(), 800);
    });

    document.getElementById('force-update-btn').addEventListener('click', async () => {
      if (!confirm('Force reload? This will clear cache and reload.')) return;
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      window.location.reload(true);
    });
  }

  // ── Finance Import Modal ──────────────────────────────────────────────────
  function openFinanceImportModal(existingTransactions) {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="modal-sheet" style="max-height:92vh;">
        <div class="modal-handle"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 8px;">
          <span style="font-size:16px;font-weight:700;">Import Finance Data</span>
          <button id="close-import" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);">×</button>
        </div>
        <div id="import-tool-container" style="overflow-y:auto;max-height:72vh;"></div>
      </div>
    `;
    document.getElementById('close-import').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    const toolContainer = document.getElementById('import-tool-container');

    renderImportTool(toolContainer, {
      appType: 'finance',
      existingData: { transactions: existingTransactions },
      onImportComplete: async (records, progressCb, strategy = 'merge') => {
        let imported = 0, skipped = 0;

        const newData = await localSave('finance', (remote) => {
          const txns = strategy === 'wipe' ? [] : [...(remote.transactions || [])];

          const existingKeys = (strategy === 'merge')
            ? new Set(txns.map(t => `${t.date}|${(t.description||'').toLowerCase().trim()}|${t.amountSpend||''}|${t.income||''}`))
            : new Set();

          records.forEach(rec => {
            const key = `${rec.date}|${(rec.description||'').toLowerCase().trim()}|${rec.amountSpend||''}|${rec.income||''}`;
            if (strategy === 'merge' && existingKeys.has(key)) { skipped++; return; }
            txns.push(rec);
            existingKeys.add(key);
            imported++;
          });
          return { ...remote, transactions: txns };
        });

        await setCachedFinanceData(newData);
        progressCb(imported, skipped);
        return { imported, skipped };
      }
    });

    toolContainer.addEventListener('import:complete', () => {
      modal.classList.add('hidden');
      navigate('transactions');
    });
  }
}
