// v3.2.2 — 2026-03-21 — 2026-03-21 — 2026-03-21
// ─── shared/photo-picker.js ──────────────────────────────────────────────────
// Shared photo capture component used by:
//   App A: document scans (front/back), address photos
//   App B: transaction receipts/photos
// Compresses to 800px max / JPEG 75% via Canvas API

'use strict';

const MAX_DIM  = 800;
const QUALITY  = 0.75;

// ── Compress image to base64 JPEG ─────────────────────────────────────────────
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

// ── Render photo slots ────────────────────────────────────────────────────────
// photos: array of base64 strings (or null)
// maxPhotos: 2 or 3
// onChange: callback(newPhotosArray)
export function renderPhotoSlots(container, photos = [], maxPhotos = 2, onChange) {
  const slots = Array.from({ length: maxPhotos }, (_, i) => photos[i] || null);

  function render() {
    container.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${slots.map((photo, i) => `
          <div class="photo-slot" data-slot="${i}" style="
            position:relative;width:100px;height:80px;border-radius:var(--radius-md);
            border:1.5px dashed ${photo ? 'var(--primary)' : 'var(--border)'};
            background:${photo ? 'transparent' : 'var(--surface-3)'};
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;cursor:pointer;
          ">
            ${photo
              ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;" />
                 <button class="photo-remove" data-slot="${i}" style="
                   position:absolute;top:3px;right:3px;
                   background:rgba(0,0,0,0.55);border:none;border-radius:50%;
                   width:20px;height:20px;color:#fff;font-size:12px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;
                 ">×</button>`
              : `<div style="text-align:center;pointer-events:none;">
                   <div style="font-size:22px;">📷</div>
                   <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Add photo</div>
                 </div>`
            }
            <input type="file" class="photo-input" data-slot="${i}"
              accept="image/*" capture="environment"
              style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;" />
          </div>
        `).join('')}
      </div>
    `;

    // File input handlers
    container.querySelectorAll('.photo-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const compressed = await compressImage(file);
          slots[Number(input.dataset.slot)] = compressed;
          onChange([...slots]);
          render();
        } catch { /* ignore compress errors */ }
      });
    });

    // Remove handlers
    container.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        slots[Number(btn.dataset.slot)] = null;
        onChange([...slots]);
        render();
      });
    });

    // Clipboard paste support on PC
    container.addEventListener('paste', async (e) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image'));
      if (!item) return;
      const emptySlot = slots.findIndex(s => s === null);
      if (emptySlot === -1) return;
      try {
        const file = item.getAsFile();
        const compressed = await compressImage(file);
        slots[emptySlot] = compressed;
        onChange([...slots]);
        render();
      } catch { /* ignore */ }
    });
  }

  render();
}

// ── Render photo thumbnails (read-only) ───────────────────────────────────────
export function renderPhotoThumbnails(container, photos = []) {
  const valid = photos.filter(Boolean);
  if (!valid.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
      ${valid.map(p => `
        <img src="${p}" style="width:72px;height:60px;object-fit:cover;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--border);" class="photo-thumb" />
      `).join('')}
    </div>
  `;
  // Full-screen viewer on tap
  container.querySelectorAll('.photo-thumb').forEach(img => {
    img.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      overlay.innerHTML = `<img src="${img.src}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px;" />`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  });
}
