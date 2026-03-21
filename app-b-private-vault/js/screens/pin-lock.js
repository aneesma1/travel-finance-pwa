// v3.3.1 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── app-b-private-vault/js/screens/pin-lock.js ─────────────────────────────
// PIN lock and PIN setup screens

'use strict';

import { verifyPin, setPin, getLockoutSecondsRemaining } from '../pin.js';
import { syncPinToDrive } from '../app-config.js';

// ── PIN Lock Screen ───────────────────────────────────────────────────────────
export function renderPinLock(container, { onSuccess, onForgot }) {
  let digits = '';
  let lockoutInterval = null;

  function render() {
    const remaining = getLockoutSecondsRemaining();
    const locked    = remaining > 0;

    container.innerHTML = `
      <div class="pin-screen">
        <div style="font-size:40px;margin-bottom:8px;">🔐</div>
        <h2 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:4px;">Private Vault</h2>
        <p style="color:rgba(255,255,255,0.65);font-size:14px;">Enter your PIN to unlock</p>

        <div class="pin-dots" id="pin-dots">
          ${[0,1,2,3].map(i => `<div class="pin-dot" id="dot-${i}"></div>`).join('')}
        </div>

        ${locked
          ? `<p id="lockout-msg" style="color:#FCA5A5;font-size:14px;font-weight:600;margin-bottom:20px;">
               Too many attempts -- wait <span id="countdown">${remaining}</span>s
             </p>`
          : `<p id="error-msg" style="color:#FCA5A5;font-size:13px;min-height:20px;margin-bottom:12px;"></p>`
        }

        <div class="pin-pad" id="pin-pad" ${locked ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
          ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(k => `
            <button class="pin-key ${k === '' ? 'empty' : ''} ${k === '⌫' ? 'backspace' : ''}"
              data-key="${k}" type="button">${k}</button>
          `).join('')}
        </div>

        <button id="forgot-btn" style="
          margin-top:32px;background:none;border:none;color:rgba(255,255,255,0.5);
          font-size:13px;cursor:pointer;text-decoration:underline;font-family:inherit;
        ">Forgot PIN?</button>
      </div>
    `;

    // Start countdown if locked
    if (locked) {
      startCountdown();
    }

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('forgot-btn')?.addEventListener('click', () => {
      clearInterval(lockoutInterval);
      onForgot();
    });

    document.querySelectorAll('.pin-key:not(.empty)').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === '⌫') {
          digits = digits.slice(0, -1);
        } else if (digits.length < 4) {
          digits += key;
        }
        updateDots();
        if (digits.length === 4) {
          setTimeout(() => attemptUnlock(), 100);
        }
      });
    });
  }

  function updateDots() {
    [0,1,2,3].forEach(i => {
      const dot = document.getElementById(`dot-${i}`);
      if (dot) {
        dot.classList.toggle('filled', i < digits.length);
        dot.classList.remove('error');
      }
    });
  }

  async function attemptUnlock() {
    document.querySelectorAll('.pin-key').forEach(k => k.disabled = true);
    try {
      await verifyPin(digits);
      // Success!
      [0,1,2,3].forEach(i => {
        const dot = document.getElementById(`dot-${i}`);
        if (dot) { dot.classList.add('filled'); dot.style.background = '#6EE7B7'; }
      });
      setTimeout(() => onSuccess(), 200);
    } catch (err) {
      digits = '';
      const msg = err.message;

      if (msg.startsWith('LOCKED:')) {
        render(); // Re-render with lockout UI
        return;
      }

      if (msg.startsWith('WRONG:')) {
        const remaining = msg.split(':')[1];
        const errorEl = document.getElementById('error-msg');
        if (errorEl) errorEl.textContent = `Incorrect PIN -- ${remaining} attempt${remaining === '1' ? '' : 's'} remaining`;
        [0,1,2,3].forEach(i => {
          const dot = document.getElementById(`dot-${i}`);
          if (dot) dot.classList.add('error');
        });
        setTimeout(() => {
          [0,1,2,3].forEach(i => {
            const dot = document.getElementById(`dot-${i}`);
            if (dot) { dot.classList.remove('error', 'filled'); }
          });
          document.querySelectorAll('.pin-key').forEach(k => k.disabled = false);
        }, 600);
      }
    }
  }

  function startCountdown() {
    clearInterval(lockoutInterval);
    lockoutInterval = setInterval(() => {
      const rem = getLockoutSecondsRemaining();
      const el  = document.getElementById('countdown');
      if (el) el.textContent = rem;
      if (rem <= 0) {
        clearInterval(lockoutInterval);
        render(); // Re-render without lockout
      }
    }, 1000);
  }

  render();
}

// ── PIN Setup Screen ──────────────────────────────────────────────────────────
export function renderPinSetup(container, { onComplete }) {
  let step      = 'create'; // 'create' | 'confirm'
  let firstPin  = '';

  function render() {
    const isConfirm = step === 'confirm';
    container.innerHTML = `
      <div class="pin-screen">
        <div style="font-size:40px;margin-bottom:8px;">🔐</div>
        <h2 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:4px;">
          ${isConfirm ? 'Confirm PIN' : 'Create PIN'}
        </h2>
        <p style="color:rgba(255,255,255,0.65);font-size:14px;text-align:center;line-height:1.5;">
          ${isConfirm
            ? 'Enter your PIN again to confirm'
            : 'Choose a 4-digit PIN\nto protect your vault'
          }
        </p>

        <div class="pin-dots" id="pin-dots">
          ${[0,1,2,3].map(i => `<div class="pin-dot" id="dot-${i}"></div>`).join('')}
        </div>

        <p id="error-msg" style="color:#FCA5A5;font-size:13px;min-height:20px;margin-bottom:12px;"></p>

        <div class="pin-pad" id="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(k => `
            <button class="pin-key ${k === '' ? 'empty' : ''} ${k === '⌫' ? 'backspace' : ''}"
              data-key="${k}" type="button">${k}</button>
          `).join('')}
        </div>
      </div>
    `;

    let digits = '';

    document.querySelectorAll('.pin-key:not(.empty)').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === '⌫') {
          digits = digits.slice(0, -1);
        } else if (digits.length < 4) {
          digits += key;
        }
        [0,1,2,3].forEach(i => {
          const dot = document.getElementById(`dot-${i}`);
          if (dot) dot.classList.toggle('filled', i < digits.length);
        });

        if (digits.length === 4) {
          setTimeout(async () => {
            if (!isConfirm) {
              firstPin = digits;
              step = 'confirm';
              render();
            } else {
              if (digits !== firstPin) {
                const errorEl = document.getElementById('error-msg');
                if (errorEl) errorEl.textContent = 'PINs do not match -- try again';
                [0,1,2,3].forEach(i => {
                  const dot = document.getElementById(`dot-${i}`);
                  if (dot) dot.classList.add('error');
                });
                setTimeout(() => {
                  step = 'create';
                  firstPin = '';
                  render();
                }, 1000);
              } else {
                await setPin(digits);
                syncPinToDrive().catch(() => {}); // backup to Drive
                onComplete();
              }
            }
          }, 100);
        }
      });
    });
  }

  render();
}
