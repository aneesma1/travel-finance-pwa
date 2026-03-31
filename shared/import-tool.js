// v3.5.39 — 2026-03-31

// ─── shared/import-tool.js ───────────────────────────────────────────────────
// CSV / Excel import tool -- used by both App A (travel) and App B (finance)
// PHILOSOPHY: Never fail. Import everything as raw as possible.

'use strict';

import { uuidv4 } from './utils.js';

export const TRAVEL_COLUMNS = [
  { key: 'timestamp',     label: 'Timestamp',                 required: false },
  { key: 'personName',    label: 'Name of Person',            required: false },
  { key: 'dateOutIndia',  label: 'Date Out India',            required: false },
  { key: 'dateInQatar',   label: 'Date In Qatar',             required: false },
  { key: 'dateOutQatar',  label: 'Date Out Qatar',            required: false },
  { key: 'dateInIndia',   label: 'Date In India',             required: false },
  { key: 'flightInward',  label: 'Inward Flight to Qatar',    required: false },
  { key: 'flightOutward', label: 'Outward Flight From Qatar', required: false },
  { key: 'reason',        label: 'Reason for Travel',         required: false },
  { key: 'travelWith',    label: 'Travel With',               required: false },
  { key: 'daysInQatar',   label: 'Days outside Qatar',        required: false },
  { key: 'daysInIndia',   label: 'Days in India',             required: false },
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
  const COLUMNS = appType === 'travel' ? TRAVEL_COLUMNS : FINANCE_COLUMNS;
  let step = 'pick';
  let rawRows    = [];
  let headers    = [];
  let columnMap  = {};
  let parsedRows = [];

  function render() {
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
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
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
    container.innerHTML = `
      <div style="padding:20px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:10px;">Preview (${parsedRows.length} rows)</div>
        <div style="max-height:300px;overflow:auto;border:1px solid var(--border);font-size:11px;">
          <table style="width:100%;border-collapse:collapse;">
            ${parsedRows.slice(0,10).map(r => `<tr>${COLUMNS.map(c=>`<td style="border:1px solid var(--border);padding:4px;">${r[c.key]}</td>`).join('')}</tr>`).join('')}
          </table>
        </div>
        <button class="btn btn-primary btn-full" id="import-all-btn" style="margin-top:20px;">Import All Records</button>
      </div>
    `;
    container.querySelector('#import-all-btn').onclick = async () => {
      container.querySelector('#import-all-btn').disabled = true;
      container.querySelector('#import-all-btn').textContent = 'Processing…';
      await onImportComplete(parsedRows, () => {});
      step = 'done'; render();
    };
  }

  function renderDone() {
    container.innerHTML = `<div style="padding:40px;text-align:center;"><h2>✅ Done!</h2><button class="btn btn-primary" onclick="location.reload()">Reload App</button></div>`;
  }

  render();
}
