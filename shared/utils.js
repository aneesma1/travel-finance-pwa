
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
  // Returns YYYY-MM-DD from a Date object or string
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

export function today() {
  return toISODate(new Date());
}

export function daysBetween(dateA, dateB) {
  // Returns positive number of days between two YYYY-MM-DD strings
  if (!dateA || !dateB) return null;
  const a = new Date(dateA);
  const b = new Date(dateB);
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
  // YYYY-MM-DD → "15 Mar 2026"
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
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
