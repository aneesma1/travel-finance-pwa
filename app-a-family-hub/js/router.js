// v3.5.2 — 2026-03-22

// ─── app-a-family-hub/js/router.js ──────────────────────────────────────────
// Client-side router for Family Hub
// Manages screen transitions and bottom nav state

'use strict';

import { renderDashboard }      from './screens/dashboard.js';
import { renderTravelLog }      from './screens/travel-log.js';
import { renderAddTrip }        from './screens/add-trip.js';
import { renderDocuments }      from './screens/documents.js';
import { renderAddDocument }    from './screens/add-document.js';
import { renderPeople }         from './screens/people.js';
import { renderPersonProfile }  from './screens/person-profile.js';
import { renderFamilyDefaults } from './screens/family-defaults.js';
import { renderSettings }       from './screens/settings.js';

const SCREENS = {
  dashboard:         renderDashboard,
  'travel-log':      renderTravelLog,
  'add-trip':        renderAddTrip,
  documents:         renderDocuments,
  'add-document':    renderAddDocument,
  people:            renderPeople,
  'person-profile':  renderPersonProfile,
  'family-defaults': renderFamilyDefaults,
  settings:          renderSettings,
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
  screenEl.scrollTop = 0;
  window.scrollTo(0, 0);
}

function updateNav(screenName) {
  const navMap = {
    'dashboard':       'dashboard',
    'travel-log':      'travel-log',
    'add-trip':        'travel-log',
    'documents':       'documents',
    'add-document':    'documents',
    'people':          'people',
    'person-profile':  'people',
    'family-defaults': 'people',
    'settings':        'settings',
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
