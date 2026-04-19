// v4.11.0 — 2026-04-04 — 16:58

// ─── app-b-private-vault/js/screens/settings.js ─────────────────────────────
// Settings: export xlsx+email, change PIN, backup/restore, categories, sign-out

'use strict';

import { getCachedFinanceData, setCachedFinanceData, clearAllCachedData } from '../../shared/db.js';
import {
  currentMonth, currentYear, showToast, copyToClipboard
} from '../../shared/utils.js';
import {
  downloadLocalBackup, restoreFromLocalFile, timestampSuffix
} from '../../shared/drive.js';
import { localSave } from '../../shared/sync-manager.js';
import { changePin, setPin, isPinSet } from '../pin.js';
import { navigate } from '../router.js';
import { renderImportTool } from '../../shared/import-tool.js';
import { openCategoryManager } from '../modals/category-manager.js';
import { downloadRecoveryBundle, runRestoreWizard } from '../../shared/recovery.js';
import { exportEncryptedBackup, importEncryptedBackup } from '../../shared/backup-engine.js';
import { exitApp } from '../../shared/app-utils.js';

const CACHE_NAME = 'vault v4.11.0';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function renderSettings(container, params = {}) {
  const data = await getCachedFinanceData();
  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data || {};

  // Auto-open export tab if navigated with tab param
  const activeTab = params.tab || 'data';

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
      <button id="header-exit-btn" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">💾 Save &amp; Exit</button>
    </div>

    <!-- Tab bar -->
    <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;">
      ${[
      { id: 'data', label: '💾 Data' },
      { id: 'export', label: '📤 Export' },
      { id: 'account', label: '👤 Account' },
    ].map(tab => `
        <button class="settings-tab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}" style="
          flex:1; padding:12px 4px; border:none; background:none; cursor:pointer;
          font-size:11px; font-weight:600; color:${activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)'};
          border-bottom:2px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'};
          transition:all 0.15s; font-family:inherit;
        ">${tab.label}</button>
      `).join('')}
    </div>

    <div id="tab-content" style="padding-bottom:32px;"></div>
    <div class="modal-overlay hidden" id="modal"></div>
    <input type="file" id="restore-file" accept=".json" style="display:none;" />
  `;

  // Header Save & Exit
  document.getElementById('header-exit-btn')?.addEventListener('click', async () => {
    showToast('Saving & exiting…', 'info', 1500);
    await new Promise(r => setTimeout(r, 800));
    await exitApp();
  });

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  switch (activeTab) {
    case 'data': renderDataTab(transactions, data); break;
    case 'export': renderExportTab(transactions, data); break;
    case 'account': renderAccountTab(null, data); break;
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
            <div style="font-size:12px;color:var(--text-muted);">Download JSON to device (${transactions.length} records)</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="list-row" id="restore-local">
          <span style="font-size:20px;">📂</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Restore from Local Backup</div>
            <div style="font-size:12px;color:var(--text-muted);">Pick a backup .json file from device</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>
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
      </div>

      <div class="section-title">Categories</div>
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

      <div class="section-title" style="margin-top:16px;">App Storage</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--text-secondary);">Local Device Storage</span>
          <span style="font-size:13px;font-weight:600;color:var(--success);">
            ● Active
          </span>
        </div>
      </div>

      <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
      <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
        <div class="list-row" id="clear-cache-btn" style="border:none;border-radius:var(--radius-lg) var(--radius-lg) 0 0;border-bottom:1px solid var(--border);">
          <span style="font-size:20px;">🧹</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:var(--text);">Clear App Cache</div>
            <div style="font-size:11px;color:var(--text-muted);">Clears service-worker &amp; temp caches. Your data is kept.</div>
          </div>
          <span style="color:var(--text-muted);font-weight:700;font-size:12px;">CLEAR</span>
        </div>
        <div class="list-row" id="reset-db-btn" style="border:none;border-radius:0 0 var(--radius-lg) var(--radius-lg);">
          <span style="font-size:20px;">🔥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
            <div style="font-size:11px;color:var(--text-muted);">Permanently deletes ALL records &amp; cache. Irreversible.</div>
          </div>
          <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
        </div>
      </div>
      <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
        ⚠️ <b>Clear App Cache</b> = remove temp files only (data is safe). <b>Reset All Data</b> = wipe everything permanently. Always <b>Backup Now</b> first.
      </div>
    `;

    // Open Category Manager Modal
    document.getElementById('manage-cats-btn')?.addEventListener('click', () => {
      openCategoryManager(container);
    });



    document.getElementById('backup-now').onclick = () => downloadLocalBackup('vault');
    document.getElementById('restore-local').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => runRestoreWizard('vault', e.target.files[0]);
      input.click();
    };

    document.getElementById('import-data').addEventListener('click', () => {
      openFinanceImportModal(transactions);
    });

    document.getElementById('clear-cache-btn')?.addEventListener('click', async () => {
      if (!confirm('Clear app cache? Your finance data will NOT be deleted.')) return;
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) await reg.unregister();
        }
        sessionStorage.clear();
        showToast('Cache cleared. Reloading…', 'success');
        setTimeout(() => window.location.reload(true), 1200);
      } catch (err) {
        showToast('Clear failed: ' + err.message, 'error');
      }
    });

    document.getElementById('reset-db-btn').addEventListener('click', async () => {
      if (!confirm('⚠️ RESET DATABASE?\n\nThis will PERMANENTLY DELETE all your transactions, categories, and account settings.\n\nHave you taken a backup first?')) return;
      if (!confirm('SECOND CONFIRMATION:\n\nThis action cannot be undone. Are you absolutely sure?')) return;

      try {
        showToast('Resetting database…', 'info', 3000);
        await localSave('finance', () => ({ transactions: [], categories: [], accounts: [] }));
        await clearAllCachedData();
        showToast('Database reset successfully', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        showToast('Reset failed: ' + err.message, 'error');
      }
    });
  }

  // ── EXPORT TAB ────────────────────────────────────────────────────────────
  function renderExportTab(transactions, data) {
    const tab = document.getElementById('tab-content');
    const yr = currentYear();
    const mo = currentMonth();

    tab.innerHTML = `
      <div class="section-title">Filter to Export</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label class="form-label">Year</label>
            <select class="form-input" id="exp-year" style="padding:10px 12px;">
              <option value="">All years</option>
              ${[...new Set(transactions.map(t => t.date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a).map(y => `
                <option value="${y}" ${y === String(yr) ? 'selected' : ''}>${y}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Month</label>
            <select class="form-input" id="exp-month" style="padding:10px 12px;">
              <option value="">All months</option>
              ${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === mo ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <label class="form-label">Currency</label>
          <select class="form-input" id="exp-currency" style="padding:10px 12px;">
            <option value="">All currencies</option>
            ${['QAR', 'INR', 'USD'].map(c => `<option value="${c}" ${c === 'QAR' ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label class="form-label">Category 1</label>
            <select class="form-input" id="exp-cat1" style="padding:10px 12px;">
              <option value="">All</option>
              ${savedCats.sort().map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Category 2</label>
            <select class="form-input" id="exp-cat2" style="padding:10px 12px;">
              <option value="">All</option>
              ${savedCats.sort().map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="font-size:12px;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">
      <div>Version: ${window.APP_VERSION || 'v5.4.1'}</div>
      <div>Build: ${window.BUILD_TIME || 'Personal Build'}</div>
      <div>Platform: Native Android (Capacitor)</div>
    </div>
        <div id="export-count" style="font-size:13px;color:var(--text-muted);margin-bottom:12px;"></div>
      </div>

      <div class="section-title">Export Options</div>
      <div class="card" style="margin:0 16px;">
        <div class="export-option" id="download-xlsx">
          <div class="export-icon" style="background:var(--success-bg);">📊</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;">Download .xlsx</div>
            <div style="font-size:12px;color:var(--text-muted);">Save Excel file to device -- works offline</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
        <div class="divider"></div>
        <div class="export-option" id="email-xlsx">
          <div class="export-icon" style="background:var(--primary-bg);">✉️</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;">Send via Email</div>
            <div style="font-size:12px;color:var(--text-muted);">Opens your email app with .xlsx attached</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div id="export-status" style="margin:12px 16px;font-size:13px;color:var(--text-muted);text-align:center;"></div>

      <div class="section-title">Column Order (fixed)</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:12px 16px;">
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;font-family:'DM Mono',monospace;">
          Timestamp · Date · Description · Amount Spend · Income · Category 1 · Category 2 · Notes 1 · Account · Currency
        </div>
      </div>
    `;

    // Live count update
    function updateCount() {
      const yr = document.getElementById('exp-year').value;
      const mo = document.getElementById('exp-month').value;
      const cur = document.getElementById('exp-currency').value;
      const cat1 = document.getElementById('exp-cat1').value;
      const cat2 = document.getElementById('exp-cat2').value;
      const filtered = transactions.filter(t => {
        if (yr && t.date?.slice(0, 4) !== yr) return false;
        if (mo && Number(t.date?.slice(5, 7)) !== Number(mo)) return false;
        if (cur && t.currency !== cur) return false;
        if (cat1 && t.category1 !== cat1) return false;
        if (cat2 && t.category2 !== cat2) return false;
        return true;
      });
      document.getElementById('export-count').textContent =
        filtered.length + ' transaction' + (filtered.length !== 1 ? 's' : '') + ' will be exported';
      return filtered;
    }
    updateCount();
    ['exp-year', 'exp-month', 'exp-currency', 'exp-cat1', 'exp-cat2'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateCount);
    });

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

    // Column headers
    const headers = ['Timestamp', 'Date', 'Description', 'Amount Spend', 'Income', 'Category 1', 'Category 2', 'Notes 1', 'Account', 'Currency'];

    // Build rows
    const rows = transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => [
        t.timestamp || '',
        t.date || '',
        t.description || '',
        t.amountSpend != null ? Number(t.amountSpend) : '',
        t.income != null ? Number(t.income) : '',
        t.category1 || '',
        t.category2 || '',
        t.notes1 || '',
        t.account || '',
        t.currency || '',
      ]);

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    ws['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 8 }
    ];

    // Style header row bold (basic)
    headers.forEach((_, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '065F46' } } };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    // Filename
    const yr = document.getElementById('exp-year')?.value || 'All';
    const mo = document.getElementById('exp-month')?.value;
    const cur = document.getElementById('exp-currency')?.value || 'All';
    const moLabel = mo ? MONTHS[Number(mo) - 1] : 'All';
    const ts = timestampSuffix();
    const filename = `Finance_Export_${cur}_${yr}${moLabel ? '_' + moLabel : ''}_${ts}.xlsx`;

    if (!sendEmail) {
      // Direct download
      XLSX.writeFile(wb, filename);
      statusEl.textContent = `✅ Downloaded: ${filename}`;
      showToast('Excel file downloaded!', 'success');
    } else {
      // Email via mailto
      try {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const subject = encodeURIComponent(`Finance Export -- ${moLabel} ${yr}`);
        const body = encodeURIComponent(
          `Finance export attached.\n\nPeriod: ${moLabel} ${yr}\nCurrency: ${cur}\nRecords: ${transactions.length}\n\nGenerated by Private Vault App`
        );
        // Try Web Share API with file first (works on Android)
        const blob = new Blob(
          [Uint8Array.from(atob(wbout), c => c.charCodeAt(0))],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        const file = new File([blob], filename, { type: blob.type });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Finance Export' });
          statusEl.textContent = '✅ Shared via system share sheet';
        } else {
          // Fallback: mailto with data URI (works in Gmail/Outlook on Android)
          const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${wbout}`;
          const mailto = `mailto:?subject=${subject}&body=${body}`;
          window.location.href = mailto;
          // Also download as fallback since mailto attachment isn't always supported
          setTimeout(() => {
            XLSX.writeFile(wb, filename);
            statusEl.innerHTML = `✅ Email app opened. File also downloaded as backup.<br><span style="font-size:11px;color:var(--text-muted);">If attachment didn't work, attach the downloaded file manually.</span>`;
          }, 500);
        }
      } catch (err) {
        // Last resort: just download
        XLSX.writeFile(wb, filename);
        statusEl.textContent = '⚠️ Email failed -- file downloaded instead.';
      }
    }
  }


  // ── ACCOUNT TAB ───────────────────────────────────────────────────────────
  function renderAccountTab(user, data) {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Account</div>
      <div class="card" style="margin:0 16px;">
        <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
          <div style="font-size:14px; font-weight:700; text-align:center;">Local-First Edition</div>
          <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:8px;">
             Your data is securely stored directly on this device. Use the <b>Save &amp; Exit</b> button at the top to exit safely.
          </div>

          <div style="border-top:1px dashed var(--border); margin:8px 0;"></div>

          <div style="font-size:13px; font-weight:700; margin-bottom:8px; color:var(--primary);">🔒 Secure Vaultbox Backup</div>
          <button class="btn btn-secondary btn-full" id="export-vaultbox-btn">📤 Export Encrypted Vaultbox</button>
          <div style="font-size:10px; color:var(--text-muted); margin-top:6px; text-align:center;">
             Generate a secure, password-protected file to share via WhatsApp or Google Drive.
          </div>

          <button class="btn btn-secondary btn-full" id="import-vaultbox-btn" style="margin-top:12px; border-style: dashed;">📥 Import Vaultbox File</button>
          <div style="font-size:10px; color:var(--text-muted); margin-top:6px; text-align:center;">
             Pick a .vaultbox file from WhatsApp / Files, enter password to restore.
          </div>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">App Info</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-muted);">Private Vault ${window.APP_VERSION || 'v5.5.0'} · Native</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v2.0 · Offline-First</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Data: ${data?.transactions?.length || 0} transactions · ${data?.categories?.length || 0} categories</div>
      </div>
    `;





    document.getElementById('export-vaultbox-btn')?.addEventListener('click', () => {
      exportEncryptedBackup('finance');
    });

    document.getElementById('import-vaultbox-btn')?.addEventListener('click', () => {
      importEncryptedBackup('finance');
    });


    document.getElementById('photo-zip-btn')?.addEventListener('click', async () => {
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

    // Cloud-based sign-in / shared database features removed — Local-first edition
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
        <div id="import-tool-container" style="overflow-y:auto;max-height:72vh;padding-bottom:60px;"></div>
      </div>
    `;
    document.getElementById('close-import').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    const toolContainer = document.getElementById('import-tool-container');

    renderImportTool(toolContainer, {
      appType: 'finance',
      existingData: { transactions: existingTransactions },
      onImportComplete: async (records, progressCb) => {
        let imported = 0, skipped = 0;

        // Build a dedup key set from existing transactions
        const existingKeys = new Set(
          existingTransactions.map(t => `${t.date}|${t.description}|${t.amountSpend}|${t.income}`)
        );

        const newData = await localSave('finance', (remote) => {
          const txns = remote.transactions || [];

          records.forEach(rec => {
            const key = `${rec.date}|${rec.description}|${rec.amountSpend}|${rec.income}`;
            if (existingKeys.has(key)) { skipped++; return; }
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
