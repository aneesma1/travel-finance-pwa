// v3.4.9 — 2026-03-22

// ─── shared/photo-picker.js ──────────────────────────────────────────────────
// Shared photo capture component
//   Mobile: tap slot → camera / gallery (capture="environment")
//   PC:     two explicit buttons — "Select File" + "Paste Clipboard"
// Compresses to 800px max / JPEG 75%

'use strict';

const MAX_DIM = 800;
const QUALITY = 0.75;

// ── Detect PC (non-touch) ─────────────────────────────────────────────────────
function isPC() {
  return !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
}

// ── Compress image file to base64 JPEG ───────────────────────────────────────
export async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Paste from clipboard (Ctrl+V or snipping tool) ───────────────────────────
function pasteFromClipboard(slotIndex, slots, onChange, rerender) {
  // Primary: try clipboard API (requires permission, may fail)
  // Fallback: show a temporary focused paste area for Ctrl+V
  if (navigator.clipboard?.read) {
    navigator.clipboard.read().then(items => {
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'));
        if (imgType) {
          item.getType(imgType).then(blob => {
            const file = new File([blob], 'pasted.png', { type: imgType });
            compressImage(file).then(compressed => {
              slots[slotIndex] = compressed;
              onChange([...slots]);
              rerender();
            });
          });
          return;
        }
      }
      // No image in clipboard API — try paste area fallback
      showPasteArea(slotIndex, slots, onChange, rerender);
    }).catch(() => {
      showPasteArea(slotIndex, slots, onChange, rerender);
    });
  } else {
    showPasteArea(slotIndex, slots, onChange, rerender);
  }
}

function showPasteArea(slotIndex, slots, onChange, rerender) {
  // Create a temporary contenteditable div that captures paste events
  const existing = document.getElementById('paste-capture-area');
  if (existing) { existing.focus(); return; }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="background:var(--surface,#fff);border-radius:16px;padding:24px 28px;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
    '<div style="font-size:32px;margin-bottom:12px;">📋</div>' +
    '<div style="font-size:16px;font-weight:700;margin-bottom:8px;">Paste Image</div>' +
    '<div style="font-size:13px;color:#666;margin-bottom:16px;">Press <strong>Ctrl+V</strong> (PC) or long-press and Paste (Android) to paste your copied image</div>' +
    '<div id="paste-capture-area" contenteditable="true" tabindex="0" style="position:absolute;opacity:0;width:1px;height:1px;"></div>' +
    '<button id="paste-cancel-btn" style="padding:10px 24px;border-radius:20px;border:1px solid #ddd;background:transparent;cursor:pointer;font-size:14px;">Cancel</button>' +
  '</div>';

  document.body.appendChild(overlay);

  const captureEl = document.getElementById('paste-capture-area');
  captureEl.focus();

  const handlePaste = async (e) => {
    e.preventDefault();
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (imgItem) {
      const file = imgItem.getAsFile();
      if (file) {
        try {
          const compressed = await compressImage(file);
          slots[slotIndex] = compressed;
          onChange([...slots]);
          rerender();
          overlay.remove();
        } catch { overlay.remove(); }
        return;
      }
    }
    showToast('No image found — copy an image first, then paste', 'warning', 3000);
  };

  document.addEventListener('paste', handlePaste, { once: true });
  document.getElementById('paste-cancel-btn').addEventListener('click', () => {
    document.removeEventListener('paste', handlePaste);
    overlay.remove();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.removeEventListener('paste', handlePaste);
      overlay.remove();
    }
  });
}

function showToast(msg, type, dur) {
  // Use global showToast if available, else silent
  if (typeof window !== 'undefined' && window._showToast) window._showToast(msg, type, dur);
}

// ── Render photo slots ────────────────────────────────────────────────────────
export function renderPhotoSlots(container, photos = [], maxPhotos = 2, onChange) {
  const slots = Array.from({ length: maxPhotos }, (_, i) => photos[i] || null);
  const pc = isPC();

  function render() {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';

    slots.forEach((photo, i) => {
      const slot = document.createElement('div');
      slot.dataset.slot = i;
      slot.style.cssText = [
        'position:relative;border-radius:var(--radius-md);',
        'border:1.5px dashed ' + (photo ? 'var(--primary)' : 'var(--border)') + ';',
        'background:' + (photo ? 'transparent' : 'var(--surface-3)') + ';',
        'overflow:hidden;',
        photo ? 'width:100px;height:80px;' : 'min-width:120px;',
      ].join('');

      if (photo) {
        // ── Filled slot: image + remove button ──────────────────────────────
        slot.style.width = '100px';
        slot.style.height = '80px';
        slot.style.cursor = 'pointer';

        const img = document.createElement('img');
        img.src = photo;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        img.addEventListener('click', () => {
          const ov = document.createElement('div');
          ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
          ov.innerHTML = '<img src="' + photo + '" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px;" />';
          ov.addEventListener('click', () => ov.remove());
          document.body.appendChild(ov);
        });

        const rmBtn = document.createElement('button');
        rmBtn.innerHTML = '×';
        rmBtn.style.cssText = 'position:absolute;top:3px;right:3px;background:rgba(0,0,0,0.6);border:none;border-radius:50%;width:20px;height:20px;color:#fff;font-size:13px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          slots[i] = null;
          onChange([...slots]);
          render();
        });

        slot.appendChild(img);
        slot.appendChild(rmBtn);

      } else if (pc) {
        // ── PC empty slot: two explicit buttons ──────────────────────────────
        slot.style.padding = '10px 12px';
        slot.style.display = 'flex';
        slot.style.flexDirection = 'column';
        slot.style.gap = '8px';
        slot.style.alignItems = 'stretch';
        slot.style.minWidth = '140px';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;color:var(--text-muted);font-weight:600;text-align:center;margin-bottom:2px;';
        label.textContent = 'Slot ' + (i + 1);
        slot.appendChild(label);

        // Select file button
        const fileBtn = document.createElement('button');
        fileBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;';
        fileBtn.innerHTML = '📁 Select file';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const compressed = await compressImage(file);
            slots[i] = compressed;
            onChange([...slots]);
            render();
          } catch { /* ignore */ }
        });
        fileBtn.addEventListener('click', () => fileInput.click());
        slot.appendChild(fileInput);
        slot.appendChild(fileBtn);

        // Paste clipboard button
        const pasteBtn = document.createElement('button');
        pasteBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:var(--radius-md);border:1px solid var(--primary-border);background:var(--primary-bg);color:var(--primary);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;';
        pasteBtn.innerHTML = '📋 Paste clipboard';
        pasteBtn.addEventListener('click', () => pasteFromClipboard(i, slots, onChange, render));
        slot.appendChild(pasteBtn);

      } else {
        // ── Mobile empty slot: camera button + paste button ──────────────────
        slot.style.padding = '8px 10px';
        slot.style.display = 'flex';
        slot.style.flexDirection = 'column';
        slot.style.gap = '6px';
        slot.style.alignItems = 'stretch';
        slot.style.minWidth = '100px';

        const label = document.createElement('div');
        label.style.cssText = 'font-size:10px;color:var(--text-muted);font-weight:600;text-align:center;margin-bottom:2px;';
        label.textContent = 'Photo ' + (i + 1);
        slot.appendChild(label);

        // Camera/gallery button
        const cameraBtn = document.createElement('button');
        cameraBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 8px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;';
        cameraBtn.innerHTML = '📷 Camera';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const compressed = await compressImage(file);
            slots[i] = compressed;
            onChange([...slots]);
            render();
          } catch { /* ignore */ }
        });
        cameraBtn.addEventListener('click', () => fileInput.click());
        slot.appendChild(fileInput);
        slot.appendChild(cameraBtn);

        // Paste clipboard button (works on Android Chrome with clipboard permission)
        const pasteBtn = document.createElement('button');
        pasteBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 8px;border-radius:var(--radius-md);border:1px solid var(--primary-border);background:var(--primary-bg);color:var(--primary);font-size:12px;cursor:pointer;font-family:inherit;';
        pasteBtn.innerHTML = '📋 Paste';
        pasteBtn.addEventListener('click', () => pasteFromClipboard(i, slots, onChange, render));
        slot.appendChild(pasteBtn);
      }

      wrap.appendChild(slot);
    });

    container.appendChild(wrap);

    // ── Global Ctrl+V paste handler (PC) ─────────────────────────────────────
    if (pc) {
      container._pasteHandler = async (e) => {
        if (!e.clipboardData) return;
        const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
        if (!item) return;
        const emptySlot = slots.findIndex(s => s === null);
        if (emptySlot === -1) return;
        e.preventDefault();
        try {
          const file = item.getAsFile();
          const compressed = await compressImage(file);
          slots[emptySlot] = compressed;
          onChange([...slots]);
          render();
        } catch { /* ignore */ }
      };
      document.addEventListener('paste', container._pasteHandler);
    }
  }

  // Cleanup on container removal
  const observer = new MutationObserver(() => {
    if (!document.contains(container) && container._pasteHandler) {
      document.removeEventListener('paste', container._pasteHandler);
      observer.disconnect();
    }
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  render();
}

// ── Render photo thumbnails (read-only) ───────────────────────────────────────
export function renderPhotoThumbnails(container, photos = []) {
  const valid = photos.filter(Boolean);
  if (!valid.length) { container.innerHTML = ''; return; }
  container.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
    valid.map(p =>
      '<img src="' + p + '" style="width:72px;height:60px;object-fit:cover;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--border);" class="photo-thumb" />'
    ).join('') + '</div>';

  container.querySelectorAll('.photo-thumb').forEach(img => {
    img.addEventListener('click', () => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      ov.innerHTML = '<img src="' + img.src + '" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px;" />';
      ov.addEventListener('click', () => ov.remove());
      document.body.appendChild(ov);
    });
  });
}
