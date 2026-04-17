// v1.0.0 — 2026-04-01
// ─── shared/app-utils.js ──────────────────────────────────────────────────────
// Shared app utilities: Exit, etc.

'use strict';

/**
 * Cleanly exits the application.
 * Handles Capacitor (Native Android/iOS) and PWA/Web.
 */
export async function exitApp() {
  console.log('[app-utils] Requesting app exit...');
  
  // 1. Try Capacitor (Native Mobile)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    console.log('[app-utils] Capacitor detected, calling exitApp()');
    await window.Capacitor.Plugins.App.exitApp();
    return;
  }

  // 2. Try Cordova (Legacy Mobile)
  if (window.navigator && window.navigator.app && window.navigator.app.exitApp) {
    console.log('[app-utils] Cordova detected, calling exitApp()');
    window.navigator.app.exitApp();
    return;
  }

  // 3. Fallback: PWA / Web Browser
  console.log('[app-utils] PWA/Web detected, showing close confirmation');
  
  // Create a clean "Safe to Close" overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: var(--bg, #0f172a); color: var(--text, #f8fafc);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px; text-align: center; font-family: sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="font-size: 64px; margin-bottom: 24px;">👋</div>
    <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 12px;">All Synced!</h1>
    <p style="font-size: 16px; color: var(--text-muted, #94a3b8); line-height: 1.6; max-width: 300px; margin-bottom: 32px;">
      Your data is safe in Google Drive.<br>You can now close this tab.
    </p>
    <button id="exit-reload-btn" style="
      padding: 12px 24px; border-radius: 12px; border: 1px solid var(--border, #334155);
      background: var(--surface, #1e293b); color: var(--text, #f8fafc);
      font-size: 14px; font-weight: 600; cursor: pointer;
    ">Re-open App</button>
  `;
  
  document.body.appendChild(overlay);
  document.getElementById('exit-reload-btn').onclick = () => window.location.reload();
  
  // Attempt to close window (only works if opened via JS, usually fails for main tab)
  try { window.close(); } catch (e) {}
}
