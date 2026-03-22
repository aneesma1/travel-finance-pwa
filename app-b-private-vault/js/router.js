// v3.5.1 — 2026-03-22

// ─── app-b-private-vault/js/router.js ───────────────────────────────────────
'use strict';

import { renderDashboard }      from './screens/dashboard.js';
import { renderTransactions }   from './screens/transactions.js';
import { renderAddTransaction } from './screens/add-transaction.js';
import { renderTransactionView } from './screens/transaction-view.js';
import { renderAnalytics }      from './screens/analytics.js';
import { renderSettings }       from './screens/settings.js';
import { renderCategoryManager } from './screens/category-manager.js';

const SCREENS = {
  dashboard:       renderDashboard,
  transactions:    renderTransactions,
  'add-transaction': renderAddTransaction,
  'transaction-view': renderTransactionView,
  analytics:       renderAnalytics,
  settings:        renderSettings,
  'category-manager': renderCategoryManager,
};

let currentScreen = null;

export function navigate(screenName, params = {}) {
  const renderFn = SCREENS[screenName];
  if (!renderFn) { console.error(`Unknown screen: ${screenName}`); return; }
  const screenEl = document.getElementById('screen');
  if (!screenEl) return;
  currentScreen = screenName;
  renderFn(screenEl, params);
  updateNav(screenName);
  window.scrollTo(0, 0);
}

function updateNav(screenName) {
  const navMap = {
    'dashboard':       'dashboard',
    'add-transaction': 'transactions',
    'transaction-view': 'transactions',
    'transactions':    'transactions',
    'analytics':       'analytics',
    'settings':        'settings',
    'category-manager': 'settings',
  };
  const activeTab = navMap[screenName] || screenName;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === activeTab);
  });
}

export function getCurrentScreen() { return currentScreen; }

export function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.screen));
  });
}
