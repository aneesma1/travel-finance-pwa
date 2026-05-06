// v4.1.0 — 2026-05-02
// ─── shared/restore-dialog.js ────────────────────────────────────────────────
// 3-option restore dialog shown before ANY restore or import operation
//
// Exports:
//   showRestoreDialog(opts?)   → Promise<'merge'|'append'|'wipe'|null>
//   applyMergeStrategy(strategy, currentData, incomingData, appName) → merged data object

'use strict';

/**
 * Show bottom-sheet dialog with 3 restore options.
 * Returns a Promise that resolves to:
 *   'merge'  — add incoming records, skip duplicates
 *   'append' — add all incoming records regardless of duplicates
 *   'wipe'   — delete all existing data, load incoming fresh
 *   null     — user cancelled
 *
 * @param {Object} [opts]
 * @param {string} [opts.title]   — override dialog title
 * @param {string} [opts.source]  — label for the incoming data, e.g. ".travelbox file"
 */
export function showRestoreDialog({ title = 'How should data be loaded?', source = 'backup file' } = {}) {
  return new Promise((resolve) => {
    // Remove any stray prior dialog
    document.getElementById('_restore-dialog-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_restore-dialog-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:rgba(0,0,0,0.55)',
      'display:flex', 'align-items:flex-end', 'justify-content:center',
      'animation:_rd-fadein 0.18s ease',
    ].join(';');

    overlay.innerHTML = `
      <style>
        @keyframes _rd-fadein { from { opacity:0 } to { opacity:1 } }
        @keyframes _rd-slidein { from { transform:translateY(100%) } to { transform:translateY(0) } }
        #_restore-dialog-sheet { animation: _rd-slidein 0.22s cubic-bezier(.22,1,.36,1); }
        ._rd-opt:hover { opacity:0.88; }
        ._rd-opt:active { transform:scale(0.98); }
      </style>
      <div id="_restore-dialog-sheet" style="
        width:100%; max-width:540px;
        background:var(--surface, #fff);
        border-radius:20px 20px 0 0;
        padding:0 0 max(env(safe-area-inset-bottom,0px),16px);
        box-shadow:0 -4px 32px rgba(0,0,0,0.18);
      ">
        <!-- Handle -->
        <div style="text-align:center;padding:12px 0 4px;">
          <div style="width:40px;height:4px;border-radius:2px;background:var(--border,#e5e7eb);display:inline-block;"></div>
        </div>

        <!-- Header -->
        <div style="padding:8px 20px 16px;">
          <div style="font-size:17px;font-weight:700;color:var(--text,#111);margin-bottom:4px;">${_esc(title)}</div>
          <div style="font-size:13px;color:var(--text-muted,#6b7280);">
            Applies to data in <b>${_esc(source)}</b>
          </div>
        </div>

        <!-- Options -->
        <div style="padding:0 16px;display:flex;flex-direction:column;gap:10px;">

          <!-- Merge -->
          <button class="_rd-opt" data-choice="merge" style="
            display:flex;align-items:flex-start;gap:14px;
            background:var(--primary-bg,#eff6ff);
            border:1.5px solid var(--primary,#3b82f6);
            border-radius:14px;padding:14px 16px;
            cursor:pointer;text-align:left;width:100%;
            transition:opacity 0.12s,transform 0.1s;
          ">
            <span style="font-size:26px;line-height:1;margin-top:1px;">🔀</span>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--primary,#3b82f6);">Merge <span style="font-size:11px;font-weight:500;background:var(--primary,#3b82f6);color:#fff;border-radius:8px;padding:1px 7px;margin-left:4px;">Recommended</span></div>
              <div style="font-size:12px;color:var(--text-secondary,#374151);margin-top:3px;line-height:1.5;">
                Add records from file. Skip any that already exist.<br>
                <span style="color:var(--text-muted,#6b7280);">Your existing data stays untouched.</span>
              </div>
            </div>
          </button>

          <!-- Append -->
          <button class="_rd-opt" data-choice="append" style="
            display:flex;align-items:flex-start;gap:14px;
            background:var(--surface,#fff);
            border:1.5px solid var(--border,#e5e7eb);
            border-radius:14px;padding:14px 16px;
            cursor:pointer;text-align:left;width:100%;
            transition:opacity 0.12s,transform 0.1s;
          ">
            <span style="font-size:26px;line-height:1;margin-top:1px;">➕</span>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--text,#111);">Append All</div>
              <div style="font-size:12px;color:var(--text-secondary,#374151);margin-top:3px;line-height:1.5;">
                Add all records from file, even if duplicates exist.<br>
                <span style="color:var(--text-muted,#6b7280);">Use when merging two separate databases.</span>
              </div>
            </div>
          </button>

          <!-- Wipe & Replace -->
          <button class="_rd-opt" data-choice="wipe" style="
            display:flex;align-items:flex-start;gap:14px;
            background:rgba(220,38,38,0.05);
            border:1.5px solid var(--danger,#dc2626);
            border-radius:14px;padding:14px 16px;
            cursor:pointer;text-align:left;width:100%;
            transition:opacity 0.12s,transform 0.1s;
          ">
            <span style="font-size:26px;line-height:1;margin-top:1px;">🗑️</span>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--danger,#dc2626);">Wipe &amp; Replace</div>
              <div style="font-size:12px;color:var(--text-secondary,#374151);margin-top:3px;line-height:1.5;">
                Delete ALL existing data, then load file fresh.<br>
                <span style="color:var(--danger,#dc2626);font-weight:600;">⚠️ This cannot be undone.</span>
              </div>
            </div>
          </button>
        </div>

        <!-- Cancel -->
        <div style="padding:16px 16px 0;">
          <button id="_rd-cancel" style="
            width:100%;padding:13px;
            border:none;background:var(--bg,#f9fafb);
            border-radius:12px;font-size:15px;font-weight:600;
            color:var(--text-muted,#6b7280);cursor:pointer;
            transition:opacity 0.12s;
          ">Cancel</button>
        </div>
      </div>
    `;

    const cleanup = (choice) => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.15s';
      setTimeout(() => overlay.remove(), 150);
      resolve(choice);
    };

    // Option buttons
    overlay.querySelectorAll('._rd-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        // Wipe needs extra confirm
        if (choice === 'wipe') {
          if (!confirm('⚠️ Wipe & Replace will permanently delete ALL current data.\n\nAre you sure?')) return;
        }
        cleanup(choice);
      });
    });

    // Cancel
    overlay.querySelector('#_rd-cancel').addEventListener('click', () => cleanup(null));

    // Tap backdrop to cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    document.body.appendChild(overlay);
  });
}

// ── Merge strategy engine ─────────────────────────────────────────────────────
/**
 * Merge incoming backup data into currentData according to strategy.
 *
 * @param {'merge'|'append'|'wipe'} strategy
 * @param {Object} currentData   — current IndexedDB snapshot
 * @param {Object} incomingData  — parsed backup file data
 * @param {'travel'|'finance'} appName
 * @returns {Object} merged data object ready to save
 */
export function applyMergeStrategy(strategy, currentData, incomingData, appName) {
  // Wipe: just load incoming, keep schemaVersion sane
  if (strategy === 'wipe') {
    return {
      ...incomingData,
      schemaVersion: incomingData.schemaVersion || currentData?.schemaVersion || 1,
    };
  }

  // Start from a deep-ish copy of current
  const result = { ...(currentData || {}) };
  // Ensure schemaVersion is preserved (use whichever is higher)
  result.schemaVersion = Math.max(
    Number(result.schemaVersion || 0),
    Number(incomingData.schemaVersion || 0)
  ) || 1;

  if (appName === 'finance') {
    _mergeArrays(result, incomingData, 'transactions', strategy,
      t => `${t.date||''}|${(t.description||'').toLowerCase().trim()}|${t.amountSpend||''}|${t.income||''}`
    );
    _mergeStringArrays(result, incomingData, 'categories', strategy);
    _mergeStringArrays(result, incomingData, 'accounts',   strategy);

  } else if (appName === 'travel') {
    // members — dedup by id
    _mergeArrays(result, incomingData, 'members',    strategy, m => m.id || m.name);
    // passengers — dedup by id
    _mergeArrays(result, incomingData, 'passengers', strategy, p => p.id || (p.name||'').toLowerCase().trim());
    // trips — dedup by passengerName + dateLeftOrigin (handles both field naming conventions)
    _mergeArrays(result, incomingData, 'trips', strategy,
      t => `${(t.passengerName || t.personName || '').toLowerCase().trim()}|${t.dateLeftOrigin || t.dateOut || ''}`
    );
    // documents — dedup by id
    _mergeArrays(result, incomingData, 'documents',  strategy, d => d.id);
  }

  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────
function _mergeArrays(result, incoming, key, strategy, dedupKeyFn) {
  const existing = result[key] || [];
  const newItems = (incoming[key] || []);
  if (!newItems.length) return;

  if (strategy === 'append') {
    result[key] = [...existing, ...newItems];
  } else {
    // merge — skip dupes
    const existingKeys = new Set(existing.map(dedupKeyFn));
    const toAdd = newItems.filter(item => {
      const k = dedupKeyFn(item);
      return k && !existingKeys.has(k);
    });
    result[key] = [...existing, ...toAdd];
  }
}

function _mergeStringArrays(result, incoming, key, strategy) {
  const existing = result[key] || [];
  const newItems = (incoming[key] || []);
  if (!newItems.length) return;

  if (strategy === 'append') {
    result[key] = [...existing, ...newItems];
  } else {
    const existingSet = new Set(existing.map(s => String(s).toLowerCase().trim()));
    const toAdd = newItems.filter(s => !existingSet.has(String(s).toLowerCase().trim()));
    result[key] = [...existing, ...toAdd];
  }
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
