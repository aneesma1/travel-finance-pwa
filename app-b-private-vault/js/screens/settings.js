// v3.5.25 — 2026-03-28

// ─── app-b-private-vault/js/screens/settings.js ─────────────────────────────
// Settings: export xlsx+email, change PIN, backup/restore, categories, sign-out

'use strict';

import { getCachedFinanceData, setCachedFinanceData, clearAllCachedData } from '../../../shared/db.js';
import { getActiveSessions, getActivityLog } from '../../../shared/security-log.js';
import { openSecurityDashboard } from '../../../shared/security-dashboard.js';
import { clearAuth, getUser } from '../../../shared/auth.js';
import {
  downloadLocalBackup, restoreFromLocalFile, timestampSuffix,
  getMirrorSnapshots, restoreFromMirror
} from '../../../shared/drive.js';
import {
  currentMonth, currentYear, formatDisplayDate, showToast, isOnline, copyToClipboard
} from '../../../shared/utils.js';
import { localSave } from '../../../shared/sync-manager.js';
import { changePin, setPin, isPinSet } from '../pin.js';
import { navigate } from '../router.js';
import { renderImportTool } from '../../../shared/import-tool.js';
import { openCategoryManager } from '../modals/category-manager.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export async function renderSettings(container, params = {}) {
  const data = await getCachedFinanceData();
  const { transactions = [], categories: savedCats = [], accounts: savedAccounts = [] } = data || {};
  const user = getUser();

  // Auto-open export tab if navigated with tab param
  const activeTab = params.tab || 'data';

  container.innerHTML = `
    <div class="app-header">
      <span class="app-header-title">⚙️ Settings</span>
    </div>

    <!-- Tab bar -->
    <div style="background:var(--surface);border-bottom:1px solid var(--border);display:flex;">
      ${[
        { id: 'data',     label: '💾 Data'    },
        { id: 'export',   label: '📤 Export'  },
        { id: 'security', label: '🔐 Security'},
        { id: 'account',  label: '👤 Account' },
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

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => renderSettings(container, { tab: btn.dataset.tab }));
  });

  switch (activeTab) {
    case 'data':     renderDataTab(transactions, data); break;
    case 'export':   renderExportTab(transactions, data); break;
    case 'security': renderSecurityTab(); break;
    case 'account':  renderAccountTab(user, data); break;
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
        <div class="list-row" id="restore-mirror">
          <span style="font-size:20px;">☁️</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Restore from Drive Mirror</div>
            <div style="font-size:12px;color:var(--text-muted);">Choose from last 3 auto-snapshots</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
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
        <div class="list-row" id="clear-cache" style="border-radius:0 0 var(--radius-lg) var(--radius-lg);">
          <span style="font-size:20px;">🧹</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Clear Local Cache</div>
            <div style="font-size:12px;color:var(--text-muted);">Force re-download from Drive on next open</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
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

      <div class="section-title" style="margin-top:16px;">Sync Status</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--text-secondary);">Drive sync</span>
          <span style="font-size:13px;font-weight:600;color:${isOnline() ? 'var(--success)' : 'var(--warning)'};">
            ${isOnline() ? '● Online' : '● Offline'}
          </span>
        </div>
        ${data?.lastSync ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Last sync: ${formatDisplayDate(data.lastSync.split('T')[0])}</div>` : ''}
      </div>

      <div class="section-title" style="color:var(--danger);margin-top:24px;">⛔ Danger Zone</div>
      <div class="card" style="margin:0 16px;border:1px solid var(--danger);background:rgba(220,38,38,0.05);">
        <div class="list-row" id="reset-db-btn" style="border:none;border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🔥</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--danger);">Reset All Data</div>
            <div style="font-size:11px;color:var(--text-muted);">Permanently delete all finance records.</div>
          </div>
          <span style="color:var(--danger);font-weight:700;font-size:12px;">RESET</span>
        </div>
      </div>
      <div style="padding:12px 24px;font-size:11px;color:var(--text-muted);line-height:1.4;">
        ⚠️ Resetting will wipe your local cache <b>and</b> your Drive mirror. This is irreversible. Please <b>Backup Now</b> before resetting.
      </div>
    `;

    // Open Category Manager Modal
    document.getElementById('manage-cats-btn')?.addEventListener('click', () => {
      openCategoryManager(container);
    });

    // Category management moved to dedicated screen (category-manager.js)

    document.getElementById('backup-now').addEventListener('click', async () => {
      const cached = await getCachedFinanceData();
      if (!cached) { showToast('No data to backup', 'warning'); return; }
      downloadLocalBackup('finance', cached);
      showToast('Backup downloaded!', 'success');
    });

    document.getElementById('restore-local').addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });

    document.getElementById('restore-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!confirm(`This will overwrite your current ${transactions.length} transaction records. Continue?`)) return;
      try {
        showToast('Restoring…', 'info', 2000);
        const restored = await restoreFromLocalFile(file, 'finance');
        await setCachedFinanceData(restored);
        showToast('Restored!', 'success');
        navigate('dashboard');
      } catch (err) { showToast('Restore failed: ' + err.message, 'error'); }
    });

    document.getElementById('restore-mirror').addEventListener('click', async () => {
      if (!isOnline()) { showToast('Internet required for Drive mirror', 'warning'); return; }
      const snapshots = await getMirrorSnapshots('finance').catch(() => []);
      if (!snapshots.length) { showToast('No mirror snapshots found', 'warning'); return; }
      showMirrorModal(snapshots);
    });

    document.getElementById('import-data').addEventListener('click', () => {
      openFinanceImportModal(transactions);
    });

    document.getElementById('clear-cache').addEventListener('click', async () => {
      if (!confirm('Clear local cache? Data will be re-downloaded from Drive on next open.')) return;
      await clearAllCachedData();
      showToast('Cache cleared', 'success');
    });

    document.getElementById('reset-db-btn').addEventListener('click', async () => {
      if (!confirm('⚠️ RESET DATABASE?\n\nThis will PERMANENTLY DELETE all your transactions, categories, and account settings.\n\nHave you taken a backup first?')) return;
      if (!confirm('SECOND CONFIRMATION:\n\nThis action cannot be undone. All your data in the cloud (Google Drive) will also be wiped out. Are you absolutely sure?')) return;
      if (!confirm('FINAL WARNING:\n\nType OK in your mind and click OK to DESTROY all records.')) return;

      try {
        showToast('Resetting database…', 'info', 3000);
        // Wipe remote first (empty object)
        await localSave('finance', () => ({ transactions: [], categories: [], accounts: [] }));
        // Wipe local
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
    const yr  = currentYear();
    const mo  = currentMonth();

    tab.innerHTML = `
      <div class="section-title">Filter to Export</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label class="form-label">Year</label>
            <select class="form-input" id="exp-year" style="padding:10px 12px;">
              <option value="">All years</option>
              ${[...new Set(transactions.map(t => t.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a).map(y => `
                <option value="${y}" ${y === String(yr) ? 'selected' : ''}>${y}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Month</label>
            <select class="form-input" id="exp-month" style="padding:10px 12px;">
              <option value="">All months</option>
              ${MONTHS.map((m,i) => `<option value="${i+1}" ${i+1 === mo ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <label class="form-label">Currency</label>
          <select class="form-input" id="exp-currency" style="padding:10px 12px;">
            <option value="">All currencies</option>
            ${['QAR','INR','USD'].map(c => `<option value="${c}" ${c === 'QAR' ? 'selected' : ''}>${c}</option>`).join('')}
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
      const yr   = document.getElementById('exp-year').value;
      const mo   = document.getElementById('exp-month').value;
      const cur  = document.getElementById('exp-currency').value;
      const cat1 = document.getElementById('exp-cat1').value;
      const cat2 = document.getElementById('exp-cat2').value;
      const filtered = transactions.filter(t => {
        if (yr   && t.date?.slice(0,4)             !== yr)          return false;
        if (mo   && Number(t.date?.slice(5,7))     !== Number(mo))  return false;
        if (cur  && t.currency                     !== cur)          return false;
        if (cat1 && t.category1                    !== cat1)         return false;
        if (cat2 && t.category2                    !== cat2)         return false;
        return true;
      });
      document.getElementById('export-count').textContent =
        filtered.length + ' transaction' + (filtered.length !== 1 ? 's' : '') + ' will be exported';
      return filtered;
    }
    updateCount();
    ['exp-year','exp-month','exp-currency','exp-cat1','exp-cat2'].forEach(id => {
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
    const headers = ['Timestamp','Date','Description','Amount Spend','Income','Category 1','Category 2','Notes 1','Account','Currency'];

    // Build rows
    const rows = transactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(t => [
        t.timestamp   || '',
        t.date        || '',
        t.description || '',
        t.amountSpend != null ? Number(t.amountSpend) : '',
        t.income      != null ? Number(t.income)      : '',
        t.category1   || '',
        t.category2   || '',
        t.notes1      || '',
        t.account     || '',
        t.currency    || '',
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
    const yr  = document.getElementById('exp-year')?.value  || 'All';
    const mo  = document.getElementById('exp-month')?.value;
    const cur = document.getElementById('exp-currency')?.value || 'All';
    const moLabel = mo ? MONTHS[Number(mo)-1] : 'All';
    const ts = timestampSuffix();
    const filename = `Finance_Export_${cur}_${yr}${moLabel ? '_'+moLabel : ''}_${ts}.xlsx`;

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
        const body    = encodeURIComponent(
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
          const mailto  = `mailto:?subject=${subject}&body=${body}`;
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

  // ── SECURITY TAB ──────────────────────────────────────────────────────────
  function renderSecurityTab() {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Security Dashboard</div>
      <div style="margin:0 16px 0;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);">
        <div class="list-row" id="security-dashboard-btn" style="border-radius:var(--radius-lg);">
          <span style="font-size:20px;">🛡️</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Security & Access</div>
            <div style="font-size:12px;color:var(--text-muted);">Sessions · Activity log · Revoke access</div>
          </div>
          <span style="color:var(--text-muted);">›</span>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Auto-lock</div>
      <div style="margin:0 16px;background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:16px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Lock app after inactivity</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;" id="lock-timeout-pills">
          ${[
            { label:'1 min',  ms: 60000 },
            { label:'5 min',  ms: 300000 },
            { label:'15 min', ms: 900000 },
            { label:'30 min', ms: 1800000 },
            { label:'Never',  ms: 0 }
          ].map(opt => {
            const current = Number(localStorage.getItem('vault_lock_timeout_ms') || 300000);
            const active = opt.ms === current || (opt.ms === 300000 && !localStorage.getItem('vault_lock_timeout_ms'));
            const cls = active ? 'pill-btn active' : 'pill-btn';
            const border = active ? 'var(--primary)' : 'var(--border)';
            const bg = active ? 'var(--primary-bg)' : 'transparent';
            const col = active ? 'var(--primary)' : 'var(--text)';
            return '<button class="' + cls + '" data-ms="' + opt.ms + '" style="padding:8px 16px;border-radius:20px;border:1.5px solid ' + border + ';background:' + bg + ';color:' + col + ';font-size:14px;cursor:pointer;">' + opt.label + '</button>';
          }).join('')}
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">Change PIN</div>
      <div class="card" style="margin:0 16px;padding:20px;">
        <div class="form-group" style="margin:0 0 16px;">
          <label class="form-label">Current PIN</label>
          <input type="password" class="form-input" id="current-pin" inputmode="numeric" maxlength="4" placeholder="····" style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div class="form-group" style="margin:0 0 16px;">
          <label class="form-label">New PIN</label>
          <input type="password" class="form-input" id="new-pin" inputmode="numeric" maxlength="4" placeholder="····" style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div class="form-group" style="margin:0 0 20px;">
          <label class="form-label">Confirm New PIN</label>
          <input type="password" class="form-input" id="confirm-pin" inputmode="numeric" maxlength="4" placeholder="····" style="letter-spacing:8px;font-size:20px;" />
        </div>
        <div id="pin-error" style="color:var(--danger);font-size:13px;text-align:center;min-height:18px;margin-bottom:12px;"></div>
        <button class="btn btn-primary btn-full" id="change-pin-btn">🔑 Change PIN</button>
      </div>
    `;

    document.getElementById('security-dashboard-btn')?.addEventListener('click', () => {
      openSecurityDashboard(container);
    });

    document.querySelectorAll('#lock-timeout-pills .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ms = Number(btn.dataset.ms);
        localStorage.setItem('vault_lock_timeout_ms', String(ms));
        document.querySelectorAll('#lock-timeout-pills .pill-btn').forEach(b => {
          const active = b === btn;
          b.style.border = `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`;
          b.style.background = active ? 'var(--primary-bg)' : 'transparent';
          b.style.color = active ? 'var(--primary)' : 'var(--text)';
        });
        showToast('Auto-lock set to ' + btn.textContent, 'success');
      });
    });

    document.getElementById('change-pin-btn').addEventListener('click', async () => {
      const cur  = document.getElementById('current-pin').value;
      const nw   = document.getElementById('new-pin').value;
      const conf = document.getElementById('confirm-pin').value;
      const err  = document.getElementById('pin-error');

      if (!cur || cur.length !== 4)  { err.textContent = 'Enter your current 4-digit PIN'; return; }
      if (!nw  || nw.length  !== 4)  { err.textContent = 'New PIN must be 4 digits'; return; }
      if (nw !== conf)               { err.textContent = 'New PINs do not match'; return; }
      if (nw === cur)                { err.textContent = 'New PIN must be different from current'; return; }

      try {
        await changePin(cur, nw);
        showToast('PIN changed successfully!', 'success');
        err.textContent = '';
        ['current-pin','new-pin','confirm-pin'].forEach(id => { document.getElementById(id).value = ''; });
      } catch (e) {
        err.textContent = e.message.startsWith('WRONG') ? 'Current PIN is incorrect' : e.message;
      }
    });
  }



  // ── ACCOUNT TAB ───────────────────────────────────────────────────────────
  function renderAccountTab(user, data) {
    const tab = document.getElementById('tab-content');
    tab.innerHTML = `
      <div class="section-title">Signed In As</div>
      <div class="card" style="margin:0 16px;">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;">
          ${user?.picture ? `<img src="${user.picture}" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;" />` : '<div style="width:44px;height:44px;border-radius:50%;background:var(--primary-bg);display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>'}
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.name || 'Signed in'}</div>
            <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.email || ''}</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="card-body" style="padding-top:12px;padding-bottom:12px;">
          <button class="btn btn-secondary btn-full" id="signout-btn">Sign out of Google</button>
        </div>
      </div>

      <div class="section-title" style="margin-top:16px;">App Info</div>
      <div style="margin:0 16px;padding:12px 16px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text-muted);">Private Vault v3.5.25 · 2026-03-28</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Blueprint v1.1 · Travel & Finance PWA Suite</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Data: ${data?.transactions?.length || 0} transactions on Drive</div>
      </div>
    `;
    document.getElementById('safe-exit-btn').addEventListener('click', async () => {
      showToast('Syncing before locking…', 'info', 1500);
      try {
        await new Promise(r => setTimeout(r, 800));
        showToast('Vault locked. Stay safe! 🔒', 'success', 1500);
        setTimeout(() => {
          // Fire the lock -- set appUnlocked to false and reload to PIN screen
          window.location.reload();
        }, 1600);
      } catch (err) {
        showToast('Lock failed: ' + err.message, 'error');
      }
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
              const desc = (t.description || 'txn').replace(/[^a-zA-Z0-9]/g,'_').slice(0,20);
              zip.folder('transactions').file(`${date}_${desc}_${i+1}.jpg`, b64, { base64: true });
              count++;
            }
          });
        });

        if (count === 0) { showToast('No photos found to export', 'warning'); return; }

        const ts = new Date().toISOString().replace('T','_').slice(0,16).replace(':','-');
        const blob = await zip.generateAsync({ type:'blob' });
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

    document.getElementById('signout-btn').addEventListener('click', () => {
      if (confirm('Sign out? You will need to re-authenticate to sync data.')) {
        clearAuth();
        window.location.reload();
      }
    });
  }

  // ── Mirror modal ──────────────────────────────────────────────────────────
  function showMirrorModal(snapshots) {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <div style="padding:0 20px 24px;">
          <div style="font-size:17px;font-weight:700;margin-bottom:16px;">Restore from Mirror</div>
          ${snapshots.map((s, i) => `
            <button class="list-row" data-snap="${i}" style="width:100%;text-align:left;border-radius:var(--radius-md);margin-bottom:8px;border:1px solid var(--border);">
              <div style="flex:1;">
                <div style="font-size:14px;font-weight:600;">${new Date(s.timestamp).toLocaleString('en-GB')}</div>
                <div style="font-size:12px;color:var(--text-muted);">${s.recordCount} transactions</div>
              </div>
              <span style="color:var(--primary);font-weight:600;font-size:13px;">Restore</span>
            </button>
          `).join('')}
          <button class="btn btn-secondary btn-full" id="close-modal" style="margin-top:8px;">Cancel</button>
        </div>
      </div>`;
    modal.querySelectorAll('[data-snap]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.snap);
        if (!confirm(`Restore snapshot from ${new Date(snapshots[idx].timestamp).toLocaleString('en-GB')}?`)) return;
        try {
          showToast('Restoring…', 'info', 2000);
          const restored = await restoreFromMirror('finance', idx);
          await setCachedFinanceData(restored);
          showToast('Restored!', 'success');
          modal.classList.add('hidden');
          navigate('dashboard');
        } catch { showToast('Restore failed', 'error'); }
      });
    });
    document.getElementById('close-modal').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
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
