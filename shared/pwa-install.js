// v3.4.1 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── shared/pwa-install.js ───────────────────────────────────────────────────
// PWA install prompt management
// Handles the beforeinstallprompt event and shows a custom install banner

'use strict';

let _deferredPrompt = null;
const INSTALL_DISMISSED_KEY = 'pwa_install_dismissed';
const INSTALL_DONE_KEY      = 'pwa_installed';

// ── Capture the browser's install prompt ─────────────────────────────────────
export function initInstallPrompt(appName, primaryColor) {
  // Capture the beforeinstallprompt event before it fires
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;

    // Don't show banner if user dismissed it recently (7 days)
    const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // Don't show if already installed
    if (localStorage.getItem(INSTALL_DONE_KEY)) return;

    // Show after 3 seconds (let app load first)
    setTimeout(() => showInstallBanner(appName, primaryColor), 3000);
  });

  // Track successful install
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALL_DONE_KEY, '1');
    hideInstallBanner();
  });
}

// ── Show custom install banner ────────────────────────────────────────────────
function showInstallBanner(appName, primaryColor) {
  if (document.getElementById('pwa-install-banner')) return;
  if (!_deferredPrompt) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText = `
    position: fixed; bottom: 74px; left: 50%; transform: translateX(-50%);
    width: calc(100% - 32px); max-width: 448px;
    background: #fff; border: 1px solid #E2E8F0;
    border-radius: 16px; padding: 14px 16px;
    display: flex; align-items: center; gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.14);
    z-index: 200; animation: slideUpBanner 0.3s cubic-bezier(0.34,1.56,0.64,1);
  `;

  const icon = appName.includes('Hub') ? '✈️' : '🔐';
  banner.innerHTML = `
    <style>
      @keyframes slideUpBanner {
        from { transform: translateX(-50%) translateY(20px); opacity:0; }
        to   { transform: translateX(-50%) translateY(0);   opacity:1; }
      }
    </style>
    <div style="width:44px;height:44px;border-radius:12px;background:${primaryColor};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:14px;font-weight:700;color:#0F172A;">Install ${appName}</div>
      <div style="font-size:12px;color:#64748B;margin-top:1px;">Add to home screen for quick access</div>
    </div>
    <button id="pwa-install-yes" style="
      background:${primaryColor};color:#fff;border:none;
      padding:8px 16px;border-radius:10px;font-size:13px;font-weight:700;
      cursor:pointer;flex-shrink:0;font-family:inherit;
    ">Install</button>
    <button id="pwa-install-no" style="
      background:none;border:none;color:#94A3B8;font-size:20px;
      cursor:pointer;padding:0 2px;flex-shrink:0;line-height:1;
    ">×</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('pwa-install-yes').addEventListener('click', async () => {
    hideInstallBanner();
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    _deferredPrompt = null;
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALL_DONE_KEY, '1');
    }
  });

  document.getElementById('pwa-install-no').addEventListener('click', () => {
    hideInstallBanner();
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  });
}

function hideInstallBanner() {
  document.getElementById('pwa-install-banner')?.remove();
}

// ── Check if running as installed PWA ─────────────────────────────────────────
export function isInstalledPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// ── iOS install instructions (no beforeinstallprompt on Safari) ───────────────
export function showIOSInstallHint(appName) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);

  if (!isIOS || !isSafari) return;
  if (isInstalledPWA()) return;
  if (localStorage.getItem(INSTALL_DISMISSED_KEY)) return;

  setTimeout(() => {
    const hint = document.createElement('div');
    hint.id = 'ios-install-hint';
    hint.style.cssText = `
      position:fixed;bottom:74px;left:50%;transform:translateX(-50%);
      width:calc(100% - 32px);max-width:448px;
      background:#1E293B;color:#fff;border-radius:16px;
      padding:14px 16px;z-index:200;
      box-shadow:0 8px 32px rgba(0,0,0,0.3);
      animation:slideUpBanner 0.3s cubic-bezier(0.34,1.56,0.64,1);
    `;
    hint.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:22px;flex-shrink:0;">📲</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;">Install ${appName}</div>
          <div style="font-size:12px;color:#94A3B8;line-height:1.5;">
            Tap the <strong style="color:#fff;">Share</strong> button below, then
            <strong style="color:#fff;">Add to Home Screen</strong>
          </div>
        </div>
        <button id="ios-hint-close" style="background:none;border:none;color:#64748B;font-size:20px;cursor:pointer;padding:0;flex-shrink:0;">×</button>
      </div>
      <!-- Arrow pointing to Safari share button -->
      <div style="text-align:center;margin-top:10px;font-size:20px;">↓</div>
    `;
    document.body.appendChild(hint);

    document.getElementById('ios-hint-close').addEventListener('click', () => {
      hint.remove();
      localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    });

    setTimeout(() => hint?.remove(), 10000);
  }, 4000);
}
