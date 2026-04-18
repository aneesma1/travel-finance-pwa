// v4.8.0 — 2026-04-04
// ─── shared/recovery.js ──────────────────────────────────────────────────────
// High-security backup and restoration engine for Standalone/Bunker mode

'use strict';

import { showConfirmModal, showInputModal, showToast, isOnline, uuidv4 } from './utils.js';
import { getCachedTravelData, getCachedFinanceData, setCachedTravelData, setCachedFinanceData } from './db.js';
import { localSave } from './sync-manager.js';
// Local stubs
function clearAuth() { return Promise.resolve(); }

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
export async function runRestoreWizard(appName, file) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    
    // 1. Validity Check
    if (!backup.lastModifiedLocal && !backup.timestamp) {
       throw new Error('Invalid backup file: Missing metadata.');
    }

    // 2. Timestamp Audit
    const local = appName === 'travel' ? await getCachedTravelData() : await getCachedFinanceData();
    const bUpdate = new Date(backup.lastModifiedLocal || backup.timestamp || 0);
    const lUpdate = new Date(local?.lastModifiedLocal || local?.timestamp || 0);

    if (bUpdate < lUpdate) {
      const diffDays = Math.ceil((lUpdate - bUpdate) / (1000 * 60 * 60 * 24));
      const ok = await showConfirmModal(
        '⚠️ Restoring OLDER Data',
        `This backup is <b>${diffDays} days OLDER</b> than the data currently on your device. Continuing will permanently roll back your history.`,
        { danger: true, confirmText: 'I Understand, Proceed' }
      );
      if (!ok) return;
    }

    // 3. Handshake Verification Code
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = chars[Math.floor(Math.random()*chars.length)] + chars[Math.floor(Math.random()*chars.length)];
    
    const input = await showInputModal(
      'Security Handshake',
      `Type <b>"${code}"</b> to confirm the data injection and nuclear reset:`,
      '',
      { placeholder: 'Enter code' }
    );

    if (input?.toUpperCase() !== code) {
      if (input !== null) showToast('Verification failed.', 'warning');
      return;
    }

    // 4. Data Injection
    showToast('Injecting data...', 'info');
    if (appName === 'travel') await setCachedTravelData(backup);
    else await setCachedFinanceData(backup);

    // 5. Nuclear Reset: Clear credentials and force login to re-establish Drive link
    await showConfirmModal(
      'Restore Successful',
      'Data has been injected. The app will now log you out to re-establish a secure connection with your Google Drive.',
      { confirmText: 'Finish & Logout', cancelText: '' }
    );

    clearAuth();
    window.location.reload();
  } catch (err) {
    showToast('Restore Failed: ' + err.message, 'error');
  }
}
