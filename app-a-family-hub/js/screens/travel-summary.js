// v3.5.0 — 2026-04-03

// ─── app-a-family-hub/js/screens/travel-summary.js ────────────────────────
// Generates accurate, filterable summaries of travel days with smart date slicing.

'use strict';

import { 
  formatDisplayDate, daysBetween, copyToClipboard, showToast,
  today
} from '../../../shared/utils.js';

export function renderTravelSummarySheet(uniquePassengers, trips, defaultYear, defaultPassenger) {
  let sheet = document.getElementById('travel-summary-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'travel-summary-sheet';
    sheet.className = 'export-sheet';
    document.body.appendChild(sheet);
  }

  // State
  const state = {
    selectedPassengers: defaultPassenger && defaultPassenger !== 'all' ? [defaultPassenger] : [],
    dateMode: 'year', // 'year' or 'custom'
    selectedYear: defaultYear && defaultYear !== 'all' ? defaultYear : String(new Date().getFullYear()),
    customFrom: '',
    customTo: ''
  };

  const yearsSet = new Set();
  trips.forEach(t => {
    if (t.dateLeftOrigin) yearsSet.add(t.dateLeftOrigin.substring(0,4));
    if (t.dateArrivedDest) yearsSet.add(t.dateArrivedDest.substring(0,4));
  });
  const availableYears = [...yearsSet].sort((a,b) => b-a);
  if (!availableYears.includes(String(new Date().getFullYear()))) availableYears.unshift(String(new Date().getFullYear()));

  function togglePassenger(pName) {
    if (state.selectedPassengers.includes(pName)) {
      state.selectedPassengers = state.selectedPassengers.filter(n => n !== pName);
    } else {
      state.selectedPassengers.push(pName);
    }
    renderUI();
  }

  function renderUI() {
    // Generate Summary Data
    const summaryData = computeSummaryData();

    sheet.innerHTML = `
      <div class="app-header" style="background:var(--surface);">
        <button class="app-header-action" id="close-summary-btn">✕</button>
        <span class="app-header-title">📊 Travel Summary</span>
        <span style="width:32px;"></span>
      </div>

      <div style="padding:16px;overflow-y:auto;flex:1;background:var(--page-bg);padding-bottom:100px;">
        
        <!-- Filters -->
        <div style="background:var(--surface);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px;border:1px solid var(--border);">
          
          <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Select Passengers</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
            <button class="filter-chip ${state.selectedPassengers.length === 0 ? 'active' : ''}" id="sum-pass-all">👥 All</button>
            ${uniquePassengers.map(p => `
              <button class="filter-chip sum-pass-btn ${state.selectedPassengers.includes(p.name) ? 'active' : ''}" data-name="${p.name}">
                ${p.emoji} ${p.name}
              </button>
            `).join('')}
          </div>

          <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;">Date Range</div>
          <div style="display:flex;background:var(--surface-3);border-radius:var(--radius-md);padding:4px;margin-bottom:12px;">
            <button class="btn ${state.dateMode === 'year' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;padding:6px;font-size:13px;" id="mode-year-btn">By Year</button>
            <button class="btn ${state.dateMode === 'custom' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;padding:6px;font-size:13px;" id="mode-custom-btn">Custom Range</button>
          </div>

          ${state.dateMode === 'year' ? `
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${availableYears.map(y => `
                <button class="filter-chip sum-year-btn ${state.selectedYear === y ? 'active' : ''}" data-year="${y}">${y}</button>
              `).join('')}
            </div>
          ` : `
            <div style="display:flex;gap:12px;">
              <div style="flex:1;">
                <label style="font-size:11px;color:var(--text-muted);">From Date</label>
                <input type="date" class="form-input" id="sum-custom-from" value="${state.customFrom}">
              </div>
              <div style="flex:1;">
                <label style="font-size:11px;color:var(--text-muted);">To Date</label>
                <input type="date" class="form-input" id="sum-custom-to" value="${state.customTo}">
              </div>
            </div>
          `}
        </div>

        <!-- Rendered Summary -->
        <div id="summary-render-target">
          <div style="background:var(--surface);border-radius:var(--radius-lg);padding:16px;border:1px solid var(--border);">
            <div style="text-align:center;margin-bottom:16px;">
              <h2 style="margin:0;font-size:18px;">Travel Day Summary</h2>
              <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">
                ${state.dateMode === 'year' ? 'Year: ' + state.selectedYear : (state.customFrom && state.customTo ? formatDisplayDate(state.customFrom) + ' to ' + formatDisplayDate(state.customTo) : 'Custom Range')}
              </p>
            </div>

            ${summaryData.length === 0 ? `
              <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:14px;">No travel recorded in this period.</div>
            ` : summaryData.map(stat => `
              <div style="border-bottom:1px solid var(--border-light);padding:12px 0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span style="font-size:20px;">${stat.emoji}</span>
                  <span style="font-size:15px;font-weight:700;">${stat.name}</span>
                </div>
                ${stat.destinations.length === 0 ? '<div style="font-size:13px;color:var(--text-muted);margin-left:28px;">No stays</div>' : ''}
                ${stat.destinations.map(d => `
                  <div style="display:flex;justify-content:space-between;margin-left:28px;padding:4px 0;">
                    <span style="font-size:14px;color:var(--text-secondary);">${d.country}</span>
                    <span style="font-size:14px;font-weight:700;color:var(--primary);">${d.days} days</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
            <div style="text-align:center;margin-top:16px;font-size:10px;color:var(--text-muted);">Generated by Hub</div>
          </div>
        </div>

      </div>

      <!-- Action Bar -->
      <div style="position:absolute;bottom:0;left:0;right:0;padding:16px;background:var(--surface);border-top:1px solid var(--border);display:flex;gap:12px;">
         <button class="btn btn-secondary" style="flex:1;display:flex;flex-direction:column;align-items:center;padding:8px 0;" id="sum-export-csv">
           <span style="font-size:18px;margin-bottom:2px;">📥</span><span style="font-size:11px;">CSV</span>
         </button>
         <button class="btn btn-secondary" style="flex:1;display:flex;flex-direction:column;align-items:center;padding:8px 0;" id="sum-export-image">
           <span style="font-size:18px;margin-bottom:2px;">📸</span><span style="font-size:11px;">Image</span>
         </button>
         <button class="btn btn-primary" style="flex:2;display:flex;flex-direction:column;align-items:center;padding:8px 0;" id="sum-share-wa">
           <span style="font-size:18px;margin-bottom:2px;">💬</span><span style="font-size:11px;">WhatsApp</span>
         </button>
      </div>
    `;

    // Listeners
    sheet.querySelector('#close-summary-btn').addEventListener('click', () => {
      sheet.classList.remove('open');
      setTimeout(() => sheet.remove(), 300);
    });

    sheet.querySelector('#sum-pass-all').addEventListener('click', () => { state.selectedPassengers = []; renderUI(); });
    sheet.querySelectorAll('.sum-pass-btn').forEach(btn => btn.addEventListener('click', () => togglePassenger(btn.dataset.name)));
    
    sheet.querySelector('#mode-year-btn').addEventListener('click', () => { state.dateMode = 'year'; renderUI(); });
    sheet.querySelector('#mode-custom-btn').addEventListener('click', () => { state.dateMode = 'custom'; renderUI(); });

    if (state.dateMode === 'year') {
      sheet.querySelectorAll('.sum-year-btn').forEach(btn => btn.addEventListener('click', () => {
        state.selectedYear = btn.dataset.year; renderUI();
      }));
    } else {
      const fromI = sheet.querySelector('#sum-custom-from');
      const toI = sheet.querySelector('#sum-custom-to');
      fromI.addEventListener('change', () => { state.customFrom = fromI.value; renderUI(); });
      toI.addEventListener('change', () => { state.customTo = toI.value; renderUI(); });
    }

    sheet.querySelector('#sum-export-csv').addEventListener('click', () => exportCSV(summaryData));
    sheet.querySelector('#sum-export-image').addEventListener('click', () => exportImage());
    sheet.querySelector('#sum-share-wa').addEventListener('click', () => shareWhatsApp(summaryData));
  }

  // ─── Slicing Logic ────────────────────────────────────────────────────────
  function computeSummaryData() {
    let focusStart, focusEnd;
    if (state.dateMode === 'year') {
      if (!state.selectedYear) return [];
      focusStart = new Date(\`\${state.selectedYear}-01-01T00:00:00\`);
      focusEnd = new Date(\`\${state.selectedYear}-12-31T23:59:59\`);
    } else {
      if (!state.customFrom || !state.customTo) return [];
      focusStart = new Date(\`\${state.customFrom}T00:00:00\`);
      focusEnd = new Date(\`\${state.customTo}T23:59:59\`);
    }

    const tStart = focusStart.getTime();
    const tEnd = focusEnd.getTime();

    // Filter trips
    let targets = uniquePassengers;
    if (state.selectedPassengers.length > 0) {
      targets = uniquePassengers.filter(p => state.selectedPassengers.includes(p.name));
    }

    const results = [];

    targets.forEach(p => {
      // Find trips involving this passenger
      const pTrips = trips.filter(t => {
        const prim = String(t.passengerName || '').toLowerCase() === p.name.toLowerCase();
        const travelWithNames = (Array.isArray(t.travelWith) ? t.travelWith : String(t.travelWith || '').split(/[,;]+/))
          .map(n => String(n || '').trim().toLowerCase());
        return prim || travelWithNames.includes(p.name.toLowerCase());
      });

      const destMap = {};

      pTrips.forEach(t => {
        if (!t.dateArrivedDest) return; // Need an arrival to count days

        const arrMs = new Date(t.dateArrivedDest).getTime();
        if (isNaN(arrMs)) return;
        
        let leftMs = null;
        if (t.dateLeftDest) {
          leftMs = new Date(t.dateLeftDest).getTime();
        } else {
          leftMs = new Date(today()).getTime(); // still there
        }
        
        if (isNaN(leftMs)) return;

        // Check intersection with [tStart, tEnd]
        const overlapStart = Math.max(arrMs, tStart);
        const overlapEnd = Math.min(leftMs, tEnd);

        if (overlapStart <= overlapEnd) {
          // Add 1 to overlapEnd because Date diffing normally drops the concluding day,
          // but travel days usually count either both or just boundaries. We'll do strict MS math.
          const msInDay = 1000 * 60 * 60 * 24;
          const daysOverlapping = Math.floor((overlapEnd - overlapStart) / msInDay) + 1;
          
          if (daysOverlapping > 0) {
            const country = t.destinationCountry || 'Qatar';
            destMap[country] = (destMap[country] || 0) + daysOverlapping;
          }
        }
      });

      if (Object.keys(destMap).length > 0) {
        const dList = Object.keys(destMap).map(k => ({ country: k, days: destMap[k] })).sort((a,b)=>b.days-a.days);
        results.push({ name: p.name, emoji: p.emoji, destinations: dList });
      }
    });

    return results;
  }

  // ─── Exports ────────────────────────────────────────────────────────────────
  function exportCSV(summaryData) {
    if (!summaryData.length) return showToast('No data to export', 'warning');
    let csv = 'Passenger,Country,Total Days\n';
    summaryData.forEach(p => {
      p.destinations.forEach(d => {
        csv += \`"\${p.name}","\${d.country}",\${d.days}\n\`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');a.href = url;a.download = \`Travel_Summary_\${Date.now()}.csv\`;
    a.click(); URL.revokeObjectURL(url);
  }

  function shareWhatsApp(summaryData) {
     if (!summaryData.length) return showToast('No data to share', 'warning');
     const title = state.dateMode === 'year' ? \`Travel Summary (\${state.selectedYear})\` : \`Travel Summary\`;
     let text = \`✈️ *\${title}*\n━━━━━━━━━━━━━━\n\`;
     summaryData.forEach(p => {
       text += \`\n\${p.emoji} *\${p.name}*\n\`;
       p.destinations.forEach(d => {
         text += \`  📍 \${d.country}: \${d.days} days\n\`;
       });
     });
     text += \`\n_Shared from Travel Hub_\`;

     copyToClipboard(text);
     showToast('Copied specifically for WhatsApp!', 'success');
  }

  async function exportImage() {
    const target = sheet.querySelector('#summary-render-target');
    if (!target) return;
    
    showToast('Generating image…', 'info');
    
    // Dynamically load html2canvas
    if (!window.html2canvas) {
      await new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    try {
      const canvas = await window.html2canvas(target, { 
        scale: 2, 
        backgroundColor: '#f8fafc' 
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = \`Travel_Summary_\${Date.now()}.jpg\`;
      a.click();
      showToast('Image downloaded!', 'success');
    } catch(err) {
      console.error(err);
      showToast('Failed to create image', 'error');
    }
  }

  renderUI();
  // Animate in
  setTimeout(() => sheet.classList.add('open'), 10);
}
