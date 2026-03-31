import { fetchBootstrap } from './api.js';
import { renderRoute } from './router.js';
import { state, setApiBaseUrl, setBootstrapData, setRoute } from './state.js';
import { loadApiBaseUrl, loadBootstrapCache, saveApiBaseUrl, saveBootstrapCache } from './storage.js';
import { createSyncController } from './sync.js';

const screen = document.getElementById('screen');
const tabbar = document.getElementById('tabbar');
const onlinePill = document.getElementById('online-pill');
const syncPill = document.getElementById('sync-pill');
const refreshBtn = document.getElementById('refresh-btn');

const sync = createSyncController((text) => {
  syncPill.textContent = text;
});

function updateOnlinePill() {
  onlinePill.textContent = navigator.onLine ? 'Online' : 'Offline';
}

function mountRoute(route = state.route) {
  setRoute(route);
  screen.innerHTML = renderRoute(route, { state });
  updateTabState();
  bindScreenEvents();
}

function updateTabState() {
  tabbar.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.route === state.route);
  });
}

function bindScreenEvents() {
  const saveButton = document.getElementById('save-api-url');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const input = document.getElementById('api-url');
      const value = input.value.trim();
      setApiBaseUrl(value);
      saveApiBaseUrl(value);
      sync.setIdle();
      mountRoute('settings');
    });
  }
}

async function refreshData() {
  if (!state.apiBaseUrl) {
    setRoute('settings');
    mountRoute('settings');
    sync.setError();
    return;
  }

  try {
    sync.setSyncing();
    const data = await fetchBootstrap();
    setBootstrapData(data);
    saveBootstrapCache(data);
    sync.setIdle();
    mountRoute(state.route);
  } catch (error) {
    console.error(error);
    sync.setError();
  }
}

function hydrateFromCache() {
  const cachedUrl = loadApiBaseUrl();
  if (cachedUrl) {
    setApiBaseUrl(cachedUrl);
  }

  const cachedData = loadBootstrapCache();
  if (cachedData) {
    setBootstrapData(cachedData);
    sync.setOffline();
  } else {
    sync.setIdle();
  }
}

function bindGlobalEvents() {
  tabbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (!button) return;
    mountRoute(button.dataset.route);
  });

  refreshBtn.addEventListener('click', () => {
    refreshData();
  });

  window.addEventListener('online', () => {
    updateOnlinePill();
    refreshData();
  });

  window.addEventListener('offline', () => {
    updateOnlinePill();
    sync.setOffline();
  });
}

async function boot() {
  updateOnlinePill();
  hydrateFromCache();
  bindGlobalEvents();
  mountRoute('dashboard');

  if (state.apiBaseUrl && navigator.onLine) {
    await refreshData();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('SW registration failed', error);
    });
  }
}

boot();