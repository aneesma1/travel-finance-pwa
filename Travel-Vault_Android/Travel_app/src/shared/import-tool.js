// v3.5.45 — 2026-04-24

// ─── shared/import-tool.js ───────────────────────────────────────────────────
// CSV / Excel import tool -- used by both App A (travel) and App B (finance)
// PHILOSOPHY: Never fail. Import everything as raw as possible.

'use strict';

import { uuidv4 } from './utils.js';

export const TRAVEL_COLUMNS = [
  { key: 'personName',    label: 'Name of Person',            required: true  },
  { key: 'origin',        label: 'Origin',                    required: false },
  { key: 'destination',   label: 'Destination',               required: false },
  { key: 'dateOut',       label: 'Date Out Origin',           required: false },
  { key: 'dateIn',        label: 'Date In Destination',        required: false },
  { key: 'flightDetails', label: 'Flight details',            required: false },
  { key: 'reason',        label: 'Reason for Travel',         required: false },
  { key: 'accompanied1',  label: 'Accompanied by 1',          required: false },
  { key: 'accompanied2',  label: 'Accompanied by 2',          required: false },
  { key: 'accompanied3',  label: 'Accompanied by 3',          required: false },
  { key: 'accompanied4',  label: 'Accompanied by 4',          required: false },
];

export const FINANCE_COLUMNS = [
  { key: 'timestamp',   label: 'Timestamp',    required: false },
  { key: 'date',        label: 'Date',         required: true  },
  { key: 'description', label: 'Description',  required: true  },
  { key: 'amountSpend', label: 'Amount Spend', required: false },
  { key: 'income',      label: 'Income',       required: false },
  { key: 'category1',   label: 'Category 1',   required: false },
  { key: 'category2',   label: 'Category 2',   required: false },
  { key: 'notes1',      label: 'Notes 1',      required: false },
  { key: 'account',     label: 'Account',      required: false },
  { key: 'currency',    label: 'Currency',     required: false },
];

export function renderImportTool(container, { appType, existingData, onImportComplete }) {
  const CACHE_NAME = 'family-hub v3.5.44';
  const COLUMNS = appType === 'travel' ? TRAVEL_COLUMNS : FINANCE_COLUMNS;
  let step = 'pick';
  let rawRows    = [];
  let headers    = [];
  let parsedRows = [];
  let columnMap  = {};

  function render() {
    // Clear external action bar unless we're in preview step
    if (step !== 'preview') {
      const actionBar = document.getElementById('import-action-bar');
      if (actionBar) { actionBar.innerHTML = ''; actionBar.style.display = 'none'; }
    }
    switch (step) {
      case 'pick':    renderPick();    break;
      case 'map':     renderMap();     break;
      case 'preview': renderPreview(); break;
      case 'done':    renderDone();    break;
    }
  }

  function renderPick() {
    container.innerHTML = `
      <div style="padding:20px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Import ${appType === 'travel' ? 'Travel' : 'Finance'}</div>
        <div id="drop-zone" style="border:2px dashed var(--border);border-radius:12px;padding:30px;text-align:center;background:var(--surface);">
          <div style="font-size:32px;margin-bottom:10px;">📂</div>
          <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" style="font-size:13px;" />
        </div>
        <div id="file-error" style="color:var(--danger);font-size:12px;margin-top:10px;"></div>
      </div>
    `;
    container.querySelector('#import-file-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });
  }

  async function handleFile(file) {
    try {
      if (!window.XLSX) {
        // Try local bundled copy first (available in native APK build), fall back to CDN
        await new Promise((res, rej) => {
          const tryLoad = (src, fallbackSrc) => {
            const s = document.createElement('script');
            s.setAttribute('data-internal', 'xlsx-loader'); // mark so global handler ignores it
            s.src = src;
            s.onload = res;
            s.onerror = () => {
              if (fallbackSrc) {
                tryLoad(fallbackSrc, null);
              } else {
                rej(new Error('Could not load Excel parser. Check internet connection.'));
              }
            };
            document.head.appendChild(s);
          };
          tryLoad('./js/lib/xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        });
      }
      const buffer = await file.arrayBuffer();
      const wb = window.XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!allRows.length) throw new Error('File is empty');
      headers = allRows[0].map(h => String(h||'').trim());
      rawRows = allRows.slice(1).filter(r => r.some(c => c !== ''));
      columnMap = autoMapColumns(headers, COLUMNS);
      step = 'map'; render();
    } catch (err) { document.getElementById('file-error').textContent = err.message; }
  }

  function autoMapColumns(h, cols) {
    const map = {};
    cols.forEach(c => {
      const idx = h.findIndex(head => head.toLowerCase().includes(c.label.toLowerCase()) || c.label.toLowerCase().includes(head.toLowerCase()));
      if (idx !== -1) map[c.key] = idx;
    });
    return map;
  }

  function renderMap() {
    container.innerHTML = `
      <div style="padding:20px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:15px;">Map Columns</div>
        <div id="mapping-list" style="display:flex;flex-direction:column;gap:8px;"></div>
        <button class="btn btn-primary btn-full" id="preview-btn" style="margin-top:20px;">Preview →</button>
      </div>
    `;
    const list = container.querySelector('#mapping-list');
    COLUMNS.forEach(c => {
      const div = document.createElement('div');
      div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      div.innerHTML = `<span>${c.label}</span><select data-key="${c.key}"><option value="">-- Skip --</option>${headers.map((h,i)=>`<option value="${i}" ${columnMap[c.key]===i?'selected':''}>${h||`Col ${i+1}`}</option>`).join('')}</select>`;
      list.appendChild(div);
      div.querySelector('select').onchange = (e) => { columnMap[c.key] = e.target.value === '' ? undefined : Number(e.target.value); };
    });
    container.querySelector('#preview-btn').onclick = () => {
      parsedRows = rawRows.map(row => {
        const p = { id: uuidv4() };
        COLUMNS.forEach(c => {
          const idx = columnMap[c.key];
          let val = idx !== undefined ? row[idx] : null;
          if (val instanceof Date) val = val.toISOString().split('T')[0];
          p[c.key] = val === null || val === undefined ? '' : String(val).trim();
        });
        return p;
      });
      step = 'preview'; render();
    };
  }

  function renderPreview() {
    // Render scrollable preview content (NO button inside scroll area)
    container.innerHTML = `
      <div style="padding:16px 20px 8px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:10px;">Preview (${parsedRows.length} rows)</div>
        <div style="overflow:auto;border:1px solid var(--border);border-radius:8px;font-size:11px;max-height:260px;">
          <table style="width:100%;border-collapse:collapse;">
            ${parsedRows.slice(0,10).map(r => `<tr>${COLUMNS.map(c=>`<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;">${r[c.key]||''}</td>`).join('')}</tr>`).join('')}
          </table>
        </div>
        <div id="import-error" style="display:none;color:var(--danger);font-size:12px;margin-top:8px;padding:8px 12px;background:#FEF2F2;border-radius:8px;"></div>
      </div>
    `;

    const errEl = container.querySelector('#import-error');
    const btnHTML = `<button class="btn btn-primary btn-full" id="import-all-btn">✅ Import All ${parsedRows.length} Records</button>`;

    // ── Place button in external action bar if available (prevents nav bar overlap) ──
    // The modal in settings.js should provide <div id="import-action-bar"> outside the
    // scroll container so the button is always visible above Android navigation bar.
    const actionBar = document.getElementById('import-action-bar');
    if (actionBar) {
      actionBar.innerHTML = btnHTML;
      actionBar.style.display = 'block';
    } else {
      // Fallback: append sticky button at the bottom of container
      container.insertAdjacentHTML('beforeend', `
        <div style="padding:12px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));background:var(--surface);border-top:1px solid var(--border);position:sticky;bottom:0;z-index:10;">
          ${btnHTML}
        </div>
      `);
    }

    const btn = document.getElementById('import-all-btn');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Processing…';
      errEl.style.display = 'none';
      try {
        await onImportComplete(parsedRows, () => {});
        if (actionBar) actionBar.innerHTML = ''; // clear external bar
        step = 'done'; render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '✅ Retry Import';
        errEl.style.display = 'block';
        errEl.textContent = '❌ Import failed: ' + (err.message || 'Unknown error');
      }
    };
  }

  function renderDone() {
    container.innerHTML = `<div style="padding:40px;text-align:center;"><h2>✅ Done!</h2><p style="color:var(--text-muted);font-size:13px;">Imported successfully. Reload the app to see your records.</p><button class="btn btn-primary" id="done-reload-btn" style="margin-top:12px;">Reload App</button></div>`;
    container.querySelector('#done-reload-btn').addEventListener('click', () => location.reload());
  }

  render();
}
