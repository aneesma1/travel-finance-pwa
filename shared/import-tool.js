// ─── shared/import-tool.js ───────────────────────────────────────────────────
// CSV / Excel import tool — used by both App A (travel) and App B (finance)
// Steps: (1) Pick file → (2) Map columns → (3) Preview + validate → (4) Import

'use strict';

import { uuidv4 } from './utils.js';

// ── Travel data column definitions ───────────────────────────────────────────
export const TRAVEL_COLUMNS = [
  { key: 'timestamp',    label: 'Timestamp',               required: false },
  { key: 'personName',   label: 'Name of Person',          required: true  },
  { key: 'dateOutIndia', label: 'Date Out India',          required: true  },
  { key: 'dateInQatar',  label: 'Date In Qatar',           required: true  },
  { key: 'dateOutQatar', label: 'Date Out Qatar',          required: false },
  { key: 'dateInIndia',  label: 'Date In India',           required: false },
  { key: 'flightInward', label: 'Inward Flight to Qatar',  required: false },
  { key: 'flightOutward',label: 'Outward Flight to India', required: false },
  { key: 'reason',       label: 'Reason for Travel',       required: false },
  { key: 'travelWith',   label: 'Travel With',             required: false },
];

// ── Finance data column definitions ──────────────────────────────────────────
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

// ── Main render function ──────────────────────────────────────────────────────
export function renderImportTool(container, { appType, existingData, onImportComplete }) {
  // appType: 'travel' | 'finance'
  const COLUMNS = appType === 'travel' ? TRAVEL_COLUMNS : FINANCE_COLUMNS;
  let step = 'pick'; // 'pick' | 'map' | 'preview' | 'done'
  let rawRows    = [];
  let headers    = [];
  let columnMap  = {}; // { targetKey: sourceColumnIndex }
  let parsedRows = [];

  function render() {
    switch (step) {
      case 'pick':    renderPick();    break;
      case 'map':     renderMap();     break;
      case 'preview': renderPreview(); break;
      case 'done':    renderDone();    break;
    }
  }

  // ── Step 1: Pick file ──────────────────────────────────────────────────────
  function renderPick() {
    container.innerHTML = `
      <div style="padding:24px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">
          Import ${appType === 'travel' ? 'Travel' : 'Finance'} Data
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px;line-height:1.6;">
          Accepts <strong>.xlsx</strong>, <strong>.xls</strong>, or <strong>.csv</strong> files.<br>
          Your existing ${appType === 'travel' ? 'trips' : 'transactions'} will be preserved — duplicates are skipped.
        </div>

        <!-- Drop zone -->
        <div id="drop-zone" style="
          border:2px dashed var(--border); border-radius:var(--radius-lg);
          padding:40px 24px; text-align:center; cursor:pointer;
          transition:all 0.15s; background:var(--surface);
        ">
          <div style="font-size:40px;margin-bottom:12px;">📂</div>
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px;">
            Tap to pick a file
          </div>
          <div style="font-size:13px;color:var(--text-muted);">.xlsx · .xls · .csv</div>
        </div>

        <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" style="display:none;" />

        <div id="file-error" style="color:var(--danger);font-size:13px;margin-top:12px;text-align:center;min-height:18px;"></div>

        <!-- Expected columns reference -->
        <div style="margin-top:24px;padding:14px 16px;background:var(--surface-3);border-radius:var(--radius-md);">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
            Expected columns (you'll map these next)
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${COLUMNS.map(c => `
              <span style="
                background:var(--surface);border:1px solid var(--border);
                padding:3px 10px;border-radius:999px;font-size:11px;color:var(--text-secondary);
                ${c.required ? 'font-weight:700;color:var(--primary);' : ''}
              ">${c.label}${c.required ? ' *' : ''}</span>
            `).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">* Required fields</div>
        </div>
      </div>
    `;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('import-file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'var(--primary-bg)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--surface)';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.background = 'var(--surface)';
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });
  }

  // ── Parse file ─────────────────────────────────────────────────────────────
  async function handleFile(file) {
    const errEl = document.getElementById('file-error');
    const dropZone = document.getElementById('drop-zone');

    dropZone.innerHTML = `<div class="spinner" style="margin:0 auto;"></div><div style="margin-top:12px;color:var(--text-muted);font-size:13px;">Reading file…</div>`;

    try {
      if (!window.XLSX) {
        await loadSheetJS();
      }

      const XLSX = window.XLSX;
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!allRows.length) throw new Error('File appears to be empty');

      // First non-empty row = headers
      headers = allRows[0].map(h => String(h).trim());
      rawRows = allRows.slice(1).filter(row => row.some(cell => cell !== '' && cell != null));

      if (!rawRows.length) throw new Error('No data rows found after the header row');

      // Auto-map columns by fuzzy matching header names
      columnMap = autoMapColumns(headers, COLUMNS);

      step = 'map';
      render();
    } catch (err) {
      if (errEl) errEl.textContent = `Error: ${err.message}`;
      dropZone.innerHTML = `<div style="font-size:40px;margin-bottom:12px;">📂</div><div style="font-size:15px;font-weight:600;">Tap to pick a file</div><div style="font-size:13px;color:var(--text-muted);">.xlsx · .xls · .csv</div>`;
    }
  }

  async function loadSheetJS() {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load SheetJS'));
      document.head.appendChild(s);
    });
  }

  function autoMapColumns(sourceHeaders, targetCols) {
    const map = {};
    targetCols.forEach(col => {
      // Try exact match first, then fuzzy
      const exact = sourceHeaders.findIndex(h =>
        h.toLowerCase() === col.label.toLowerCase()
      );
      if (exact !== -1) { map[col.key] = exact; return; }

      // Fuzzy: check if source header contains key words
      const keywords = col.label.toLowerCase().split(/[\s\/]+/);
      const fuzzy = sourceHeaders.findIndex(h => {
        const hl = h.toLowerCase();
        return keywords.some(kw => kw.length > 3 && hl.includes(kw));
      });
      if (fuzzy !== -1) map[col.key] = fuzzy;
    });
    return map;
  }

  // ── Step 2: Map columns ────────────────────────────────────────────────────
  function renderMap() {
    container.innerHTML = `
      <div style="padding:20px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Map Columns</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">
          ${rawRows.length} data rows found in file. Map your columns to the app fields below.
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;" id="mapping-rows"></div>

        <div id="map-error" style="color:var(--danger);font-size:13px;margin-top:12px;min-height:18px;"></div>

        <div style="display:flex;gap:10px;margin-top:20px;">
          <button class="btn btn-secondary" style="flex:1;" id="back-to-pick">← Back</button>
          <button class="btn btn-primary" style="flex:2;" id="preview-btn">Preview →</button>
        </div>
      </div>
    `;

    const mappingRows = document.getElementById('mapping-rows');

    COLUMNS.forEach(col => {
      const currentIdx = columnMap[col.key] ?? '';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);';
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:${col.required ? '700' : '500'};color:${col.required ? 'var(--primary)' : 'var(--text)'};">
            ${col.label}${col.required ? ' *' : ''}
          </div>
        </div>
        <select data-col="${col.key}" style="
          padding:8px 10px;border-radius:var(--radius-md);border:1px solid var(--border);
          background:var(--surface);color:var(--text);font-size:13px;
          min-width:160px;max-width:200px;font-family:inherit;
        ">
          <option value="">— Skip —</option>
          ${headers.map((h, i) => `
            <option value="${i}" ${Number(currentIdx) === i && currentIdx !== '' ? 'selected' : ''}>${h || `Column ${i+1}`}</option>
          `).join('')}
        </select>
      `;
      mappingRows.appendChild(row);
    });

    // Update map on select change
    mappingRows.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        const key = sel.dataset.col;
        if (sel.value === '') delete columnMap[key];
        else columnMap[key] = Number(sel.value);
      });
    });

    document.getElementById('back-to-pick').addEventListener('click', () => { step = 'pick'; render(); });
    document.getElementById('preview-btn').addEventListener('click', () => {
      // Validate required fields mapped
      const missing = COLUMNS.filter(c => c.required && columnMap[c.key] === undefined).map(c => c.label);
      if (missing.length) {
        document.getElementById('map-error').textContent = `Required fields not mapped: ${missing.join(', ')}`;
        return;
      }
      parsedRows = parseRows();
      step = 'preview';
      render();
    });
  }

  // ── Parse raw rows using column map ───────────────────────────────────────
  function parseRows() {
    return rawRows.map((row, rowIdx) => {
      const parsed = { _rowIndex: rowIdx + 2, _errors: [] };

      COLUMNS.forEach(col => {
        const srcIdx = columnMap[col.key];
        if (srcIdx === undefined) { parsed[col.key] = null; return; }

        let val = row[srcIdx];

        // Handle Excel date serial numbers
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0];
        } else if (typeof val === 'number' && col.key.toLowerCase().includes('date')) {
          // Excel serial date
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          val = d.toISOString().split('T')[0];
        } else {
          val = String(val ?? '').trim();
        }

        // Validate required
        if (col.required && (!val || val === '')) {
          parsed._errors.push(`${col.label} is required`);
        }

        // Normalise dates: accept DD/MM/YYYY, DD-MM-YYYY, etc.
        if (col.key.toLowerCase().includes('date') && val) {
          val = normaliseDate(val);
          if (!val) parsed._errors.push(`${col.label}: invalid date format`);
        }

        // Normalise currency
        if (col.key === 'currency' && val) {
          val = val.toUpperCase();
          if (!['QAR','INR','USD','EUR','GBP'].includes(val)) val = 'QAR';
        }

        parsed[col.key] = val || null;
      });

      return parsed;
    });
  }

  function normaliseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;

    // MM/DD/YYYY
    const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;

    // Try native Date parse as last resort
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().split('T')[0];

    return null;
  }

  // ── Step 3: Preview ────────────────────────────────────────────────────────
  function renderPreview() {
    const valid   = parsedRows.filter(r => r._errors.length === 0);
    const invalid = parsedRows.filter(r => r._errors.length > 0);
    const preview = parsedRows.slice(0, 5);

    container.innerHTML = `
      <div style="padding:20px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Preview & Import</div>

        <!-- Summary bar -->
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <div style="flex:1;background:var(--success-bg);border-radius:var(--radius-md);padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:var(--success);">${valid.length}</div>
            <div style="font-size:11px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.3px;">Ready</div>
          </div>
          <div style="flex:1;background:${invalid.length > 0 ? 'var(--danger-bg)' : 'var(--surface-3)'};border-radius:var(--radius-md);padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:${invalid.length > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${invalid.length}</div>
            <div style="font-size:11px;font-weight:700;color:${invalid.length > 0 ? 'var(--danger)' : 'var(--text-muted)'};text-transform:uppercase;letter-spacing:0.3px;">Errors</div>
          </div>
          <div style="flex:1;background:var(--surface-3);border-radius:var(--radius-md);padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:var(--text-muted);">${parsedRows.length}</div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;">Total</div>
          </div>
        </div>

        <!-- Preview rows (first 5) -->
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Preview (first ${Math.min(5, parsedRows.length)} rows)
        </div>
        <div style="overflow-x:auto;border-radius:var(--radius-md);border:1px solid var(--border);margin-bottom:16px;">
          <table style="width:100%;border-collapse:collapse;min-width:400px;font-size:12px;">
            <thead>
              <tr style="background:var(--surface-3);">
                <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">Row</th>
                ${COLUMNS.filter(c => columnMap[c.key] !== undefined).map(c =>
                  `<th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;">${c.label}</th>`
                ).join('')}
                <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--text-muted);border-bottom:1px solid var(--border);">Status</th>
              </tr>
            </thead>
            <tbody>
              ${preview.map(row => `
                <tr style="border-bottom:1px solid var(--border-light);background:${row._errors.length > 0 ? '#FFF5F5' : 'transparent'};">
                  <td style="padding:6px 10px;color:var(--text-muted);">${row._rowIndex}</td>
                  ${COLUMNS.filter(c => columnMap[c.key] !== undefined).map(c =>
                    `<td style="padding:6px 10px;color:var(--text);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row[c.key] || '—'}</td>`
                  ).join('')}
                  <td style="padding:6px 10px;">
                    ${row._errors.length === 0
                      ? `<span style="color:var(--success);font-size:11px;font-weight:700;">✓ OK</span>`
                      : `<span style="color:var(--danger);font-size:11px;" title="${row._errors.join(', ')}">✗ ${row._errors[0]}</span>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${invalid.length > 0 ? `
          <div style="background:var(--warning-bg);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400E;">
            ⚠️ ${invalid.length} row${invalid.length > 1 ? 's' : ''} with errors will be <strong>skipped</strong>. Only valid rows will be imported.
          </div>
        ` : ''}

        ${valid.length === 0 ? `
          <div style="background:var(--danger-bg);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;font-size:13px;color:#991B1B;">
            ❌ No valid rows to import. Please go back and fix the column mapping.
          </div>
        ` : ''}

        <div id="import-progress" style="min-height:18px;font-size:13px;text-align:center;color:var(--text-muted);margin-bottom:12px;"></div>

        <div style="display:flex;gap:10px;">
          <button class="btn btn-secondary" style="flex:1;" id="back-to-map">← Back</button>
          <button class="btn btn-primary" style="flex:2;" id="import-btn" ${valid.length === 0 ? 'disabled' : ''}>
            Import ${valid.length} Record${valid.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    `;

    document.getElementById('back-to-map').addEventListener('click', () => { step = 'map'; render(); });
    document.getElementById('import-btn').addEventListener('click', () => doImport(valid));
  }

  // ── Step 4: Import ─────────────────────────────────────────────────────────
  async function doImport(validRows) {
    const btn = document.getElementById('import-btn');
    const progress = document.getElementById('import-progress');
    btn.disabled = true;
    btn.textContent = 'Importing…';
    progress.textContent = 'Preparing records…';

    try {
      const records = validRows.map(row => buildRecord(row));

      progress.textContent = `Saving ${records.length} records to Drive…`;

      let importedCount = 0;
      let skippedCount  = 0;

      const result = await onImportComplete(records, (imp, skp) => {
        importedCount = imp;
        skippedCount  = skp;
        progress.textContent = `Saved ${imp} records…`;
      });

      step = 'done';
      container.dataset.importedCount = importedCount;
      container.dataset.skippedCount  = skippedCount;
      render();
    } catch (err) {
      progress.textContent = '';
      btn.disabled = false;
      btn.textContent = 'Retry Import';
      document.getElementById('back-to-map').insertAdjacentHTML('afterend',
        `<div style="color:var(--danger);font-size:13px;margin-bottom:8px;">Import failed: ${err.message}</div>`
      );
    }
  }

  // ── Build typed record from parsed row ────────────────────────────────────
  function buildRecord(row) {
    if (appType === 'travel') {
      return {
        id:           uuidv4(),
        timestamp:    row.timestamp || new Date().toISOString(),
        personName:   row.personName,   // Resolved to personId by the caller
        dateOutIndia: row.dateOutIndia,
        dateInQatar:  row.dateInQatar,
        dateOutQatar: row.dateOutQatar  || null,
        dateInIndia:  row.dateInIndia   || null,
        daysInQatar:  row.dateInQatar && row.dateOutQatar
          ? Math.round(Math.abs((new Date(row.dateOutQatar) - new Date(row.dateInQatar)) / 86400000))
          : null,
        flightInward: row.flightInward  || '',
        flightOutward:row.flightOutward || '',
        reason:       row.reason        || '',
        travelWith:   [],
      };
    } else {
      return {
        id:          uuidv4(),
        timestamp:   row.timestamp  || new Date().toISOString(),
        date:        row.date,
        description: row.description,
        amountSpend: row.amountSpend  ? Number(row.amountSpend)  : null,
        income:      row.income       ? Number(row.income)       : null,
        currency:    row.currency     || 'QAR',
        category1:   row.category1    || 'Other',
        category2:   row.category2    || null,
        notes1:      row.notes1       || null,
        account:     row.account      || 'Cash',
      };
    }
  }

  // ── Step 4: Done ───────────────────────────────────────────────────────────
  function renderDone() {
    const imported = container.dataset.importedCount || 0;
    const skipped  = container.dataset.skippedCount  || 0;
    container.innerHTML = `
      <div style="padding:40px 24px;text-align:center;">
        <div style="font-size:56px;margin-bottom:16px;">✅</div>
        <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:8px;">Import Complete!</div>
        <div style="font-size:15px;color:var(--text-secondary);margin-bottom:4px;">
          <strong style="color:var(--success);">${imported}</strong> records imported
        </div>
        ${Number(skipped) > 0 ? `<div style="font-size:13px;color:var(--text-muted);">${skipped} duplicates skipped</div>` : ''}
        <div style="margin-top:32px;display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-primary btn-full" id="view-data-btn">View ${appType === 'travel' ? 'Travel Log' : 'Transactions'}</button>
          <button class="btn btn-secondary btn-full" id="import-more-btn">Import Another File</button>
        </div>
      </div>
    `;
    document.getElementById('import-more-btn').addEventListener('click', () => {
      step = 'pick';
      render();
    });
    document.getElementById('view-data-btn').addEventListener('click', () => {
      import('./utils.js'); // trigger navigation via parent
      const event = new CustomEvent('import:complete', { detail: { appType } });
      container.dispatchEvent(event);
    });
  }

  render();
}
