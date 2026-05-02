// v4.8.1 — 2026-05-02 — runRestoreWizard: replaced nuclear-reset with 3-option dialog; removed Drive/auth remnants
// ─── shared/recovery.js ──────────────────────────────────────────────────────
// Backup and restoration engine for Personal Vault APK

'use strict';

import { showToast } from './utils.js';
import { getCachedTravelData, getCachedFinanceData, setCachedTravelData, setCachedFinanceData } from './db.js';
import { showRestoreDialog, applyMergeStrategy } from './restore-dialog.js';

const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

/**
 * Loads JSZip dynamically if not present
 */
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSZIP_CDN;
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Generates a full app bundle ZIP containing code + current data snapshot
 */
export async function downloadRecoveryBundle(appName) {
  try {
    showToast('Preparing recovery bundle...', 'info');
    const zip = new (await loadJSZip())();
    const assets = await fetchAppManifest(appName);
    
    // 1. Pack App Code
    for (const url of assets) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const blob = await resp.blob();
          const path = url.startsWith('./') ? url.slice(2) : url.replace('../', '');
          zip.file(path, blob);
        }
      } catch (err) { console.warn(`Skipped ${url}:`, err); }
    }

    // 2. Pack Current Data Snapshot
    const dbData = appName === 'travel' ? await getCachedTravelData() : await getCachedFinanceData();
    zip.file('data_snapshot.json', JSON.stringify(dbData, null, 2));

    // 3. Pack Recovery Guide
    zip.file('RECOVERY_GUIDE.txt', `
TRAVEL & FINANCE PWA - RECOVERY GUIDE (v4.8.0)
==============================================

You have successfully downloaded a Standalone Recovery Bundle for your app.
This folder contains the complete engine (HTML/JS/CSS) and a snapshot of your data.

HOW TO RESTORE:
---------------
1. Unzip this folder on your computer.
2. PC: Use a local web server (e.g. VS Code Live Server, or 'Web Server for Chrome') to open 'index.html'.
3. ANDROID: Re-upload these files to a NEW private GitHub repository and enable GitHub Pages.
4. Once opened, Sign in with Google to re-establish your cloud bridge.

SAFETY FEATURES:
----------------
- If you restore this on a new device, the "Zero-Data Interlock" will protect your cloud data.
- It will force a "Cloud Pull" before allowing any new saves.

Date Generated: ${new Date().toLocaleString()}
App: ${appName === 'travel' ? 'Family Hub' : 'Private Vault'}
Version: v4.8.0 Standalone
    `.trim());

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${appName}_Recovery_${new Date().toISOString().split('T')[0]}.zip`;
    link.click();
    showToast('Recovery bundle ready!', 'success');
  } catch (err) {
    showToast('Failed to create bundle: ' + err.message, 'error');
  }
}

/**
 * Fetches the list of static assets from the Service Worker or Manifest
 */
async function fetchAppManifest(appName) {
  // We can't easily read the sw.js variable constant from the outside,
  // so we maintain a hard-coded list here matching the SW manifest.
  const shared = [
    '../shared/utils.js', '../shared/drive.js', '../shared/db.js',
    '../shared/smart-input.js', '../shared/multi-smart-input.js', '../shared/pill-select.js',
    '../shared/import-tool.js', '../shared/photo-picker.js', '../shared/sync-manager.js',
    '../shared/pwa-install.js', '../shared/sync-queue.js'
  ];
  const hub = [
    './', './index.html', './css/app.css', './js/auth-config.js', './js/router.js',
    './js/calendar.js', './js/expiry-checker.js', './js/relation-engine.js',
    './js/screens/dashboard.js', './js/screens/travel-log.js', './js/screens/add-trip.js',
    './js/screens/documents.js', './js/screens/add-document.js', './js/screens/people.js',
    './js/screens/person-profile.js', './js/screens/family-defaults.js', './js/screens/settings.js',
    './js/screens/travel-export.js'
  ];
  const vault = [
    './', './index.html', './css/app.css', './js/auth-config.js', './js/router.js',
    './js/pin.js', './js/screens/pin-lock.js', './js/screens/dashboard.js',
    './js/screens/add-transaction.js', './js/screens/transactions.js',
    './js/screens/analytics.js', './js/screens/settings.js', './js/modals/category-manager.js'
  ];
  return [...shared, ...(appName === 'travel' ? hub : vault)];
}

/**
 * High-Security Restoration Wizard
 */
/**
 * Run restore wizard with 3-option dialog (merge / append / wipe).
 * @param {'travel'|'vault'|'finance'} appName
 * @param {File} file
 */
export async function runRestoreWizard(appName, file) {
  if (!file) return;
  // Normalise appName — settings.js calls with 'vault', db uses 'finance'
  const dbApp = (appName === 'vault') ? 'finance' : appName;
  try {
    const text         = await file.text();
    const incomingData = JSON.parse(text);

    if (!incomingData.schemaVersion && !incomingData.lastModifiedLocal && !incomingData.timestamp) {
      throw new Error('Invalid backup file — missing schemaVersion or metadata');
    }

    // Show 3-option dialog
    const strategy = await showRestoreDialog({
      title: 'How should the backup be loaded?',
      source: file.name,
    });
    if (!strategy) return; // user cancelled

    showToast('Restoring…', 'info', 2000);

    let finalData;
    if (strategy === 'wipe') {
      finalData = incomingData;
    } else {
      const currentData = dbApp === 'travel'
        ? (await getCachedTravelData()  || {})
        : (await getCachedFinanceData() || {});
      finalData = applyMergeStrategy(strategy, currentData, incomingData, dbApp);
    }

    if (dbApp === 'travel') await setCachedTravelData(finalData);
    else                    await setCachedFinanceData(finalData);

    const label = strategy === 'wipe' ? 'Wiped & replaced' : strategy === 'append' ? 'Appended' : 'Merged';
    showToast('✅ ' + label + ' successfully! Reloading…', 'success', 3000);
    setTimeout(() => window.location.reload(), 1200);
  } catch (err) {
    showToast('Restore failed: ' + err.message, 'error', 5000);
  }
}
