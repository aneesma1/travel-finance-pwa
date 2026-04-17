// v5.5.0 — Local-First Edition
// AES-GCM Encrypted Backup Engine for Capacitor Native Apps

'use strict';

import { encryptData, decryptData } from './crypto-engine.js';
import { getCachedTravelData, setCachedTravelData } from './db.js';
import { showToast, showInputModal } from './utils.js';

/**
 * Creates an encrypted AES-GCM payload and triggers native Android share.
 * @param {string} databaseName - 'finance' or 'travel' (used for filename)
 * @param {object|null} preloadedData - Pre-fetched data object (optional, fetches from IndexedDB if null)
 */
export async function exportEncryptedBackup(databaseName, preloadedData = null) {
  // 1. Fetch current data
  const data = preloadedData || await getCachedTravelData();
  if (!data || (Object.keys(data).length === 0)) {
    showToast('No data available to export.', 'warning');
    return;
  }

  // 2. Prompt for password
  const password = await showInputModal(
    '🔒 Secure Vault Export',
    'Create an encryption password for this backup:',
    ''
  );
  if (!password) {
    showToast('Export cancelled.', 'info');
    return; // Cancelled
  }

  try {
    showToast('Encrypting database...', 'info', 1000);
    
    // 3. Encrypt payload
    const base64Payload = await encryptData(data, password);
    
    if (!window.Capacitor || !window.Capacitor.Plugins.Filesystem) {
      // Fallback for Web/PWA: Download as file
      const blob = new Blob([base64Payload], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Vault_Backup_${new Date().toISOString().split('T')[0]}.vaultbox`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Encrypted backup downloaded to device.', 'success');
      return;
    }

    // 4. Capacitor Native Filesystem Write
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const ext = databaseName === 'travel' ? '.travelbox' : '.vaultbox';
    const fileName = `${databaseName === 'travel' ? 'TravelHub' : 'Vault'}_Encrypted_${new Date().getTime()}${ext}`;
    
    // Write directly to Cache directory as a temporary shareable file
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64Payload,
      directory: 'CACHE', // 'CACHE' or 'DOCUMENTS' based on Capacitor enum
      encoding: 'utf8'
    });

    // 5. Native Share Intent
    await Share.share({
      title: 'Encrypted Vault Backup',
      text: 'Vault Database Backup File (Encrypted)',
      url: writeResult.uri,
      dialogTitle: 'Share Secure Backup'
    });

    showToast('Vaultbox generated successfully.', 'success');
  } catch (err) {
    console.error('Export Error:', err);
    showToast('Encryption failed. See console.', 'error');
  }
}

/**
 * Opens file picker, reads .vaultbox file, asks for password, decrypts, and applies data.
 */
export async function importEncryptedBackup(databaseName) {
  if (!window.Capacitor || !window.Capacitor.Plugins.Filesystem) {
    importWebFallback();
    return;
  }

  try {
    // 1. Android Native File Picker (using standard input type=file, or Capacitor FilePicker)
    // Capacitor doesn't have a native file picker built into core. We use standard HTML input.
    importWebFallback();
  } catch (err) {
    console.error(err);
    showToast('Import sequence failed.', 'error');
  }
}

// Reusable web file picker fallback handles both Web and Native Android WebView perfectly
function importWebFallback() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.vaultbox,.travelbox,text/plain';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Read the file as text
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Payload = ev.target.result;

      // Ask for password
      const password = await showInputModal(
        '🔓 Decrypt Vault',
        'Enter the encryption password for this backup:',
        ''
      );
      
      if (!password) {
        showToast('Import cancelled.', 'info');
        return;
      }

      try {
        showToast('Decrypting data...', 'info', 1000);
        const parsedData = await decryptData(base64Payload, password);
        
        if (parsedData && (parsedData.trips || parsedData.passengers || parsedData.members)) {
          await setCachedTravelData(parsedData);
          showToast('Backup restored successfully!', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showToast('Invalid data structure in backup.', 'error');
        }
      } catch (err) {
        if (err.message === 'WRONG_PASSWORD') {
          showToast('Incorrect password. Decryption failed.', 'error', 4000);
        } else {
          showToast('Decryption error: File may be corrupted.', 'error');
        }
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}
