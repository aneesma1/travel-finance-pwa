// v1.1.0 — 2026-04-18
// ─── shared/app-utils.js ──────────────────────────────────────────────────────
// Shared app utilities: Exit with confirmation dialog.

'use strict';

/**
 * Shows a confirm dialog then cleanly exits the application.
 * Handles Capacitor (Native Android/iOS) and PWA/Web.
 */
export async function exitApp() {
  // Show in-app styled confirm overlay
  const confirmed = await new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      padding:24px;
    `;
    overlay.innerHTML = `
      <div style="
        background:#1e293b;color:#f8fafc;
        border-radius:20px;max-width:320px;width:100%;
        padding:28px 24px;text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,0.5);
      ">
        <div style="font-size:48px;margin-bottom:16px;">👋</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Exit App?</div>
        <div style="font-size:14px;color:#94a3b8;line-height:1.5;margin-bottom:24px;">
          Your data is saved locally on this device. Any unsynced changes are preserved.
        </div>
        <div style="display:flex;gap:12px;">
          <button id="_exit-cancel" style="
            flex:1;padding:12px;border-radius:12px;
            border:1px solid #334155;background:transparent;
            color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;
          ">Stay</button>
          <button id="_exit-confirm" style="
            flex:1;padding:12px;border-radius:12px;
            border:none;background:#ef4444;
            color:#fff;font-size:14px;font-weight:600;cursor:pointer;
          ">Exit</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#_exit-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#_exit-confirm').onclick = () => { overlay.remove(); resolve(true); };
  });

  if (!confirmed) return;

  // 1. Try Capacitor (Native Mobile)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    await window.Capacitor.Plugins.App.exitApp();
    return;
  }

  // 2. Try Cordova (Legacy Mobile)
  if (window.navigator && window.navigator.app && window.navigator.app.exitApp) {
    window.navigator.app.exitApp();
    return;
  }

  // 3. Fallback: PWA / Web Browser
  try { window.close(); } catch (e) {}
}
