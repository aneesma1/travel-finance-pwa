// v4.9.7 — 2026-04-04

// ─── shared/utils.js ────────────────────────────────────────────────────────
// Shared utility functions used by both App A and App B

'use strict';

// ── UUID v4 ──────────────────────────────────────────────────────────────────
export function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

// ── Date helpers ─────────────────────────────────────────────────────────────
export function toISODate(date) {
  if (!date) return '';
  if (date instanceof Date) return date.toISOString().split('T')[0];
  const s = String(date).trim();
  // Handle DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const parts = s.split(/[.\-/]/);
  if (parts.length === 3) {
    let day = parts[0], month = parts[1], year = parts[2];
    // If year is the first part (YYYY-MM-DD), reorder
    if (day.length === 4) return `${day}-${month.padStart(2,'0')}-${year.padStart(2,'0')}`;
    // Assume DD-MM-YYYY
    return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().split('T')[0];
}

export function today() {
  return toISODate(new Date());
}

export function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const isoA = toISODate(dateA);
  const isoB = toISODate(dateB);
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round(Math.abs((b - a) / 86400000));
}

export function daysFromToday(dateStr) {
  // Positive = future, negative = past
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '--';
  const iso = toISODate(dateStr);
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMonthYear(dateStr) {
  // YYYY-MM-DD → "Mar 2026"
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function currentYear() {
  return new Date().getFullYear();
}

export function currentMonth() {
  return new Date().getMonth() + 1; // 1-12
}

// ── Number formatting ─────────────────────────────────────────────────────────
export function formatAmount(num, currency = '') {
  if (num === null || num === undefined || num === '') return '--';
  const formatted = Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

// ── Expiry status ─────────────────────────────────────────────────────────────
export function expiryStatus(expiryDateStr) {
  // Returns: 'expired' | 'danger' (≤30d) | 'warning' (≤90d) | 'valid'
  const days = daysFromToday(expiryDateStr);
  if (days === null) return 'unknown';
  if (days < 0)  return 'expired';
  if (days <= 30) return 'danger';
  if (days <= 90) return 'warning';
  return 'valid';
}

export function expiryStatusColor(status) {
  const map = {
    expired: '#EF4444',
    danger:  '#EF4444',
    warning: '#F59E0B',
    valid:   '#10B981',
    unknown: '#94A3B8'
  };
  return map[status] || '#94A3B8';
}

export function expiryLifePercent(issueDateStr, expiryDateStr) {
  // Returns 0–100 percent of validity remaining
  if (!issueDateStr || !expiryDateStr) return 100;
  const total = daysBetween(issueDateStr, expiryDateStr);
  const remaining = daysFromToday(expiryDateStr);
  if (!total || total === 0) return 0;
  const pct = Math.round((remaining / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

// ── Debounce ──────────────────────────────────────────────────────────────────
export function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Clipboard ─────────────────────────────────────────────────────────────────
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

// ── Toast notification ────────────────────────────────────────────────────────
export function showToast(message, type = 'info', duration = 3000) {
  // type: 'info' | 'success' | 'error' | 'warning'
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();

  const colors = {
    info:    { bg: '#3730A3', icon: 'ℹ️' },
    success: { bg: '#065F46', icon: '✅' },
    error:   { bg: '#B91C1C', icon: '❌' },
    warning: { bg: '#92400E', icon: '⚠️' }
  };
  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: ${bg}; color: #fff; padding: 12px 20px; border-radius: 12px;
    font-size: 14px; font-weight: 500; z-index: 9999; max-width: 320px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25); display: flex; align-items: center;
    gap: 8px; animation: toastIn 0.2s ease; pointer-events: none;
  `;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes toastIn  { from { opacity:0; transform: translateX(-50%) translateY(12px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
      @keyframes toastOut { from { opacity:1; } to { opacity:0; } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.2s ease forwards';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ── URL hash state ────────────────────────────────────────────────────────────
export function getHashParams() {
  const hash = window.location.hash.slice(1);
  if (!hash) return {};
  return Object.fromEntries(new URLSearchParams(hash));
}

export function setHashParams(params) {
  const current = getHashParams();
  const merged = { ...current, ...params };
  // Remove null/undefined values
  Object.keys(merged).forEach(k => {
    if (merged[k] === null || merged[k] === undefined || merged[k] === '') {
      delete merged[k];
    }
  });
  window.location.hash = new URLSearchParams(merged).toString();
}

export function clearHashParams() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

// ── Network status ────────────────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine;
}

export function onNetworkChange(callback) {
  window.addEventListener('online',  () => callback(true));
  window.addEventListener('offline', () => callback(false));
}
// ── Custom Modals (Attractive alternatives to prompt/confirm) ────────────────
export function showConfirmModal(title, message, options = {}) {
  const { onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = options;
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10001';
    overlay.innerHTML = `
      <div class="modal-sheet" style="max-width:340px; margin:auto; position:relative; top:50%; transform:translateY(-50%); border-radius:var(--radius-lg);">
        <div style="padding:20px 24px;">
          <div style="font-size:17px; font-weight:700; margin-bottom:8px;">${title}</div>
          <div style="font-size:13px;color:var(--text-muted);">v4.9.7 · 2026-04-04</div>
          <div style="margin-top:24px; display:flex; gap:12px;">
            ${cancelText ? `<button id="modal-cancel" class="btn btn-secondary" style="flex:1;">${cancelText}</button>` : ''}
            <button id="modal-confirm" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" style="flex:1;">${confirmText}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (val) => {
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); resolve(val); }, 150);
    };

    const btnCancel = overlay.querySelector('#modal-cancel');
    if (btnCancel) btnCancel.onclick = () => { if (onCancel) onCancel(); close(false); };
    overlay.querySelector('#modal-confirm').onclick = () => { if (onConfirm) onConfirm(); close(true); };
  });
}

export function showInputModal(title, label, defaultValue = '', options = {}) {
  const { suggestions = [] } = options;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10001';
    
    // Build datalist if suggestions provided
    const datalistId = suggestions.length ? 'modal-datalist-' + uuidv4().slice(0,8) : null;
    const datalistHtml = datalistId ? `
      <datalist id="${datalistId}">
        ${suggestions.map(s => `<option value="${s.replace(/"/g, '&quot;')}">`).join('')}
      </datalist>
    ` : '';

    overlay.innerHTML = `
      <div class="modal-sheet" style="max-width:340px; margin:auto; position:relative; top:50%; transform:translateY(-50%); border-radius:var(--radius-lg);">
        <div style="padding:20px 24px;">
          <div style="font-size:17px; font-weight:700; margin-bottom:16px;">${title}</div>
          <label class="form-label">${label}</label>
          <input type="text" id="modal-input" class="form-input" 
            value="${defaultValue}" autocomplete="off" 
            ${datalistId ? `list="${datalistId}"` : ''}
            style="margin-top:4px;" />
          ${datalistHtml}
          <div style="margin-top:24px; display:flex; gap:12px;">
            <button id="modal-cancel" class="btn btn-secondary" style="flex:1;">Cancel</button>
            <button id="modal-confirm" class="btn btn-primary" style="flex:1;">Save</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#modal-input');
    input.focus();
    input.setSelectionRange(0, input.value.length);

    const close = (val) => {
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.remove(); resolve(val); }, 150);
    };

    overlay.querySelector('#modal-cancel').onclick = () => close(null);
    overlay.querySelector('#modal-confirm').onclick = () => close(input.value.trim());
    input.onkeydown = (e) => { if (e.key === 'Enter') overlay.querySelector('#modal-confirm').click(); };
  });
}

// ── App State Manager (Simplified) ───────────────────────────────────────────
// These functions are used for persisting UI settings (like Lock Updates).
export function getAppState(key, defaultVal = false) {
  const v = localStorage.getItem(`app_state_${key}`);
  if (v === null) return defaultVal;
  try { return JSON.parse(v); } catch { return v; }
}

export async function setAppState(key, val) {
  localStorage.setItem(`app_state_${key}`, JSON.stringify(val));
}
