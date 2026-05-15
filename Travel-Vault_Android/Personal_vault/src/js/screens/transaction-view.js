// v3.5.26 — 2026-05-09 — Save image to Documents/share_images/; share via Capacitor Share; fix share-text fallback

// ─── app-b-private-vault/js/screens/transaction-view.js ─────────────────────
// Transaction View -- read-only display with edit button and WhatsApp copy

'use strict';

import { getCachedFinanceData, setCachedFinanceData } from '../../shared/db.js';
import { localSave } from '../../shared/sync-manager.js';
import { navigate } from '../router.js';
import { formatDisplayDate, formatAmount, showToast, showConfirmModal, showInputModal } from '../../shared/utils.js';
import { renderPhotoThumbnails } from '../../shared/photo-picker.js';

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
    : isSpend ? formatAmount(Number(t.amountSpend)) : '0.00';

  container.innerHTML = `
    <div class="app-header">
      <button class="app-header-action" id="back-btn">←</button>
      <span class="app-header-title">Transaction</span>
      <button class="app-header-action" id="edit-btn" style="font-size:13px; font-weight:700; background:var(--primary-bg); color:var(--primary); padding:6px 14px; border-radius:99px; border:none; box-shadow:var(--shadow-sm);">
        ✏️ EDIT
      </button>
    </div>

    <div id="txn-snapshot-target" style="padding:20px 16px;display:flex;flex-direction:column;gap:12px;padding-bottom:100px;background:var(--bg);">

      <!-- Amount hero card -->
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);padding:24px 20px;text-align:center;box-shadow:var(--shadow-sm);">
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
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;box-shadow:var(--shadow-sm);">
        ${row('📅', 'Date', formatDisplayDate(t.date))}
        ${row('📝', 'Description', t.description || '--')}
        ${row('🏷️', 'Primary Category', t.category1 || '--')}
        ${t.category2 ? row('🏷️', 'Sub-Category', t.category2) : ''}
        ${row('🏦', 'Account', t.account || '--')}
        ${t.bankName ? row('🏛️', 'Bank / Card', t.bankName) : ''}
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

      <!-- Share Options UI (not part of the snapshot) -->
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:10px;" id="share-controls">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-left:4px;">Share & Export</div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button id="copy-btn" class="btn btn-secondary" style="font-size:13px;padding:12px 8px;">
            📋 Copy Text
          </button>
          <button id="share-text-btn" class="btn btn-secondary" style="font-size:13px;padding:12px 8px;">
            🔗 Share Text
          </button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button id="save-image-btn" class="btn btn-secondary" style="font-size:13px;padding:12px 8px;">
            🖼️ Save Image
          </button>
          <button id="share-image-btn" class="btn btn-secondary" style="font-size:13px;padding:12px 8px;">
            📤 Share Image
          </button>
        </div>

        <button id="clone-btn" style="padding:14px;border-radius:var(--radius-lg);border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;width:100%;">
          🔁 Clone as New Entry
        </button>

        <button id="delete-btn" style="margin-top:4px;padding:14px;border-radius:var(--radius-lg);border:1.5px solid #FEE2E2;background:#FEF2F2;color:var(--danger);font-size:14px;font-weight:600;cursor:pointer;">
          🗑️ Delete Transaction
        </button>
      </div>

    </div>
  `;

  // Render photo thumbnails
  if (t.photos?.filter(Boolean).length) {
    const photoContainer = document.getElementById('txn-view-photos');
    if (photoContainer) {
      const { renderPhotoThumbnails } = await import('../../shared/photo-picker.js');
      renderPhotoThumbnails(photoContainer, t.photos);
    }
  }

  document.getElementById('back-btn').addEventListener('click', () => navigate('transactions'));
  document.getElementById('edit-btn').addEventListener('click', () => {
    navigate('add-transaction', { txnId: t.id, mode: 'edit' });
  });
  document.getElementById('clone-btn').addEventListener('click', () => {
    navigate('add-transaction', { txnId: t.id, mode: 'clone' });
  });

  const getShareText = () => {
    return [
      `💰 *Transaction Details*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📝 Description: ${t.description || 'Transaction'}`,
      `📅 Date: ${formatDisplayDate(t.date)}`,
      isSpend  ? `💸 Spend:  ${t.currency} ${formatAmount(Number(t.amountSpend))}` : '',
      isIncome ? `💵 Income: ${t.currency} ${formatAmount(Number(t.income))}` : '',
      `🏦 Account: ${t.account || '--'}`,
      `🏷️ Category: ${t.category1 || '--'}`,
      t.category2 ? `🏷️ Sub-Cat:  ${t.category2}` : '',
      t.notes1 ? `💬 Notes: ${t.notes1}` : '',
      `━━━━━━━━━━━━━━━━━━━━`,
      `_Shared via Private Vault_`
    ].filter(Boolean).join('\n');
  };

  document.getElementById('copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      showToast('Copied to clipboard!', 'success');
    } catch { showToast('Copy failed', 'warning'); }
  });

  document.getElementById('share-text-btn').addEventListener('click', async () => {
    // navigator.share is unreliable in Capacitor WebView — use clipboard + share sheet if available
    const SharePlugin = window.Capacitor?.Plugins?.Share;
    if (SharePlugin) {
      try {
        await SharePlugin.share({ title: 'Transaction Details', text: getShareText(), dialogTitle: 'Share Transaction' });
        return;
      } catch (e) {
        if (e?.name === 'AbortError' || String(e?.message).toLowerCase().includes('cancel')) return;
      }
    }
    // Fallback — copy to clipboard
    try {
      await navigator.clipboard.writeText(getShareText());
      showToast('Copied to clipboard (share not available)', 'info', 3000);
    } catch { showToast('Copy failed', 'warning'); }
  });

  const generateImage = async () => {
    showToast('Generating image…', 'info', 2000);
    // Dynamic import html2canvas if possible, or use a simple canvas approach.
    // For now, let's use a robust native approach: capturing the element to canvas.
    try {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const target = document.getElementById('txn-snapshot-target');
      if (!target) throw new Error('Snapshot target not found');

      // Hide share controls during snapshot
      const controls = document.getElementById('share-controls');
      if (controls) controls.style.display = 'none';
      
      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg')?.trim() || '#F8FAFC';

      const canvas = await window.html2canvas(target, {
        backgroundColor: bgColor,
        scale: 2,
        useCORS: true,
        logging: false
      });
      return canvas.toDataURL('image/png');
    } catch (err) {
      showToast('Image generation failed', 'error');
      console.error('[vault-view] Image generation error:', err);
      return null;
    } finally {
      const controls = document.getElementById('share-controls');
      if (controls) controls.style.display = 'flex';
    }
  };

  document.getElementById('save-image-btn').addEventListener('click', async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const fname = `Txn_${t.date}_${t.description.replace(/\s+/g,'_').slice(0,20)}.png`;
    const FS = window.Capacitor?.Plugins?.Filesystem;
    if (FS) {
      try {
        const base64 = dataUrl.split(',')[1];
        let saved = false;
        for (const dir of ['EXTERNAL_STORAGE', 'DOCUMENTS']) {
          try {
            await FS.mkdir({ path: 'Documents/share_images', directory: dir, recursive: true }).catch(() => {});
            await FS.writeFile({ path: `Documents/share_images/${fname}`, data: base64, directory: dir });
            const displayPath = dir === 'EXTERNAL_STORAGE'
              ? `/storage/emulated/0/Documents/share_images/${fname}`
              : `Documents/share_images/${fname}`;
            showToast('💾 Saved → ' + displayPath, 'success', 5000);
            saved = true; break;
          } catch (_) { /* try next */ }
        }
        if (saved) return;
      } catch (_) { /* fall through */ }
    }
    // Web / PWA fallback
    const a = document.createElement('a');
    a.href = dataUrl; a.download = fname; a.click();
    showToast('Image saved!', 'success');
  });

  document.getElementById('share-image-btn').addEventListener('click', async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const fname = `Txn_${t.date}_${t.description.replace(/\s+/g,'_').slice(0,20)}.png`;
    const FS    = window.Capacitor?.Plugins?.Filesystem;
    const SharePlugin = window.Capacitor?.Plugins?.Share;
    if (FS && SharePlugin) {
      try {
        const base64 = dataUrl.split(',')[1];
        await FS.writeFile({ path: fname, data: base64, directory: 'CACHE' });
        const { uri } = await FS.getUri({ path: fname, directory: 'CACHE' });
        await SharePlugin.share({ title: 'Transaction', files: [uri], dialogTitle: 'Share Transaction' });
        await FS.deleteFile({ path: fname, directory: 'CACHE' }).catch(() => {});
        return;
      } catch (e) {
        if (e?.name === 'AbortError' || String(e?.message).toLowerCase().includes('cancel')) return;
      }
    }
    // Web fallback — trigger save instead
    document.getElementById('save-image-btn').click();
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    const ok = await showConfirmModal('🗑️ Delete Transaction?', 'This action is permanent and cannot be undone.', {
      confirmText: 'Delete',
      danger: true
    });
    if (!ok) return;

    // Second factor security check
    const code = Math.random().toString(36).slice(-2).toUpperCase();
    const input = await showInputModal('Final Confirmation', `To permanently delete, type the code: <b style="font-size:20px; color:var(--danger);">${code}</b>`, '');
    
    if (!input || input.toUpperCase() !== code) {
      if (input !== null) showToast('Incorrect code. Deletion cancelled.', 'warning');
      return;
    }

    try {
      const newData = await localSave('finance', remote => ({
        ...remote,
        transactions: (remote.transactions || []).filter(x => x.id !== txnId)
      }));
      await setCachedFinanceData(newData);
      showToast('Transaction deleted', 'success');
      navigate('transactions');
    } catch (err) { showToast('Delete failed', 'error'); }
  });
}

function row(icon, label, value) {
  return `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border-light);">
      <span style="font-size:18px;flex-shrink:0;margin-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">${label}</div>
        <div style="font-size:14px;color:var(--text);word-break:break-word;font-weight:500;">${value}</div>
      </div>
    </div>
  `;
}
