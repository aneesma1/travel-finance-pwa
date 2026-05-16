// v3.5.47 — 2026-05-16 — Fix PDF/WhatsApp field names & bridging days; Word Android share intent; accounts dedup

// ─── app-a-family-hub/js/screens/travel-export.js ───────────────────────────
// Travel history export: per-person or multi-person, date range
// Formats: PDF report, Excel/CSV, WhatsApp text copy

'use strict';

import { timestampSuffix, saveXLSXToExports, saveFileToExports } from '../../shared/drive.js';
import { copyToClipboard, showToast, formatDisplayDate, daysBetween, today } from '../../shared/utils.js';

// ── Module-level helper — compute days a passenger stayed (single-trip estimate) ──
function getStayDays(t) {
  let d = t.daysInQatar != null ? Number(t.daysInQatar) : null;
  if (d === null || isNaN(d)) {
    const arrDate = t.dateArrivedDest || t.dateInQatar;
    const depDate = t.dateOutQatar;
    if (arrDate && depDate) d = daysBetween(arrDate, depDate);
    else if (arrDate && !depDate) d = daysBetween(arrDate, today());
  }
  return (d != null && !isNaN(d) && d >= 0) ? d : 0;
}

// Compute per-trip stay days with bridging: end of stay = next trip's arrival date.
// Returns { stayMap: Map<trip,days>, endDateMap: Map<trip,dateStr|null> }
function computeStayContext(pTrips) {
  const sorted = [...pTrips].sort((a, b) => {
    const da = a.dateArrivedDest || a.dateInQatar || '';
    const db = b.dateArrivedDest || b.dateInQatar || '';
    return da.localeCompare(db);
  });
  const stayMap    = new Map();
  const endDateMap = new Map(); // null = person is still at destination (ongoing)
  sorted.forEach((trip, idx) => {
    const arrDate     = trip.dateArrivedDest || trip.dateInQatar;
    const nextTrip    = sorted[idx + 1];
    const nextArrDate = nextTrip ? (nextTrip.dateArrivedDest || nextTrip.dateInQatar) : null;
    const endDate     = nextArrDate || today();
    const days        = arrDate ? Math.max(0, daysBetween(arrDate, endDate)) : 0;
    stayMap.set(trip, days);
    endDateMap.set(trip, nextArrDate || null);
  });
  return { stayMap, endDateMap };
}

// ── Module-level helper — resolve passenger name (handles both field naming conventions)
// Trips stored via add-trip use passengerName; legacy/imported may use personName
function getTripPersonName(t) {
  return t.personName || t.passengerName || '';
}

// ── Entry point -- opens the export bottom sheet ───────────────────────────────
export function openTravelExportSheet(persons, trips, documents) {
  document.getElementById('travel-export-sheet')?.remove();
  document.getElementById('travel-export-backdrop')?.remove();
  // Restore any fixed elements hidden on open
  ['add-trip-fab', 'share-popup-anchor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  const years = [...new Set(
    trips.flatMap(t => [t.dateOutIndia, t.dateLeftOrigin, t.dateArrivedDest].filter(Boolean).map(d => d.slice(0, 4)))
  )].sort((a, b) => b - a);
  if (!years.length) years.push(String(new Date().getFullYear()));

  // Only destination countries (origin countries are not useful as a destination filter)
  const allCountries = [...new Set(
    trips.map(t => t.destinationCountry).filter(Boolean)
  )].sort();

  const sheet = document.createElement('div');
  sheet.id = 'travel-export-sheet';
  sheet.style.cssText = [
    'position:fixed;bottom:0;left:0;right:0;z-index:1000;',
    'background:var(--surface);border-radius:20px 20px 0 0;',
    'border-top:1px solid var(--border);max-height:88vh;',
    'display:flex;flex-direction:column;',
    'box-shadow:0 -4px 32px rgba(0,0,0,0.18);',
  ].join('');

  sheet.innerHTML = [
    '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;',
      'margin:12px auto 0;flex-shrink:0;"></div>',

    '<div style="display:flex;align-items:center;justify-content:space-between;',
      'padding:14px 20px 10px;flex-shrink:0;border-bottom:1px solid var(--border-light);">',
      '<span style="font-size:16px;font-weight:700;">📤 Export Travel History</span>',
      '<button id="tex-close" style="background:none;border:none;font-size:22px;',
        'cursor:pointer;color:var(--text-muted);">×</button>',
    '</div>',

    '<div style="overflow-y:auto;flex:1;padding:16px 20px 8px;">',

      // ── Passengers ──
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);',
        'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">',
        'Passengers',
      '</div>',
      '<div id="tex-people" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">',
        '<button class="tex-pill active" data-person="all" style="',
          'padding:8px 14px;border-radius:20px;border:1.5px solid var(--primary);',
          'background:var(--primary-bg);color:var(--primary);font-size:13px;',
          'font-weight:600;cursor:pointer;">👥 All</button>',
        persons.map(m =>
          '<button class="tex-pill" data-person="' + m.name + '" style="' +
          'padding:8px 14px;border-radius:20px;border:1.5px solid var(--border);' +
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">' +
          (m.emoji || '👤') + ' ' + m.name + '</button>'
        ).join(''),
      '</div>',

      // ── Date Range ──
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);',
        'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">',
        'Date Range',
      '</div>',
      '<div id="tex-years" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">',
        '<button class="tex-year active" data-year="all" style="',
          'padding:7px 14px;border-radius:20px;border:1.5px solid var(--primary);',
          'background:var(--primary-bg);color:var(--primary);font-size:13px;',
          'font-weight:600;cursor:pointer;">All time</button>',
        years.map(y =>
          '<button class="tex-year" data-year="' + y + '" style="' +
          'padding:7px 14px;border-radius:20px;border:1.5px solid var(--border);' +
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">' +
          y + '</button>'
        ).join(''),
      '</div>',
      '<div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">',
        '<div style="flex:1;">',
          '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">From</div>',
          '<input type="date" id="tex-from" class="form-input" style="font-size:13px;" />',
        '</div>',
        '<div style="flex:1;">',
          '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">To</div>',
          '<input type="date" id="tex-to" class="form-input" style="font-size:13px;" />',
        '</div>',
      '</div>',

      // ── Destination Country ──
      allCountries.length > 0 ? [
        '<div style="font-size:12px;font-weight:700;color:var(--text-muted);',
          'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">',
          'Destination Country',
        '</div>',
        '<div id="tex-countries" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">',
          '<button class="tex-country active" data-country="all" style="',
            'padding:7px 14px;border-radius:20px;border:1.5px solid var(--primary);',
            'background:var(--primary-bg);color:var(--primary);font-size:13px;',
            'font-weight:600;cursor:pointer;">🌍 All</button>',
          allCountries.map(c =>
            '<button class="tex-country" data-country="' + c + '" style="' +
            'padding:7px 14px;border-radius:20px;border:1.5px solid var(--border);' +
            'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">' +
            (c === 'India' ? '🇮🇳 ' : c === 'Qatar' ? '🇶🇦 ' : '📍 ') + c + '</button>'
          ).join(''),
        '</div>',
      ].join('') : '',

      // ── Format ──
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);',
        'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">',
        'Export Format',
      '</div>',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;" id="tex-formats">',
        '<button class="tex-fmt active" data-fmt="pdf" style="',
          'padding:9px 16px;border-radius:20px;border:1.5px solid var(--primary);',
          'background:var(--primary-bg);color:var(--primary);font-size:13px;',
          'font-weight:600;cursor:pointer;">📄 PDF Report</button>',
        '<button class="tex-fmt" data-fmt="word" style="',
          'padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);',
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">📝 Word</button>',
        '<button class="tex-fmt" data-fmt="xlsx" style="',
          'padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);',
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">📊 Excel</button>',
        '<button class="tex-fmt" data-fmt="csv" style="',
          'padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);',
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">📄 CSV</button>',
        '<button class="tex-fmt" data-fmt="whatsapp" style="',
          'padding:9px 16px;border-radius:20px;border:1.5px solid var(--border);',
          'background:transparent;color:var(--text);font-size:13px;cursor:pointer;">💬 WhatsApp</button>',
      '</div>',

      '<div id="tex-status" style="font-size:13px;color:var(--text-muted);min-height:18px;',
        'text-align:center;margin-bottom:8px;"></div>',
    '</div>',

    // ── Actions — padding accounts for Android nav bar ──
    '<div style="padding:12px 20px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));',
      'border-top:1px solid var(--border-light);flex-shrink:0;display:flex;gap:10px;">',
      '<button id="tex-export" class="btn btn-primary" style="flex:1;font-size:15px;',
        'padding:14px;">Export</button>',
      '<button id="tex-share" class="btn btn-secondary" style="padding:14px 18px;" title="Share (mobile) or Download (PC)">📤</button>',
    '</div>',
  ].join('');

  const backdrop = document.createElement('div');
  backdrop.id = 'travel-export-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999;';
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  // Hide fixed elements that can bleed through the modal on some Android WebView versions
  const _hiddenEls = ['add-trip-fab', 'share-popup-anchor'].map(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; return el; }
    return null;
  }).filter(Boolean);

  // ── State ─────────────────────────────────────────────────────────────────
  let selPeople  = new Set(['all']);  // 'all' or member IDs
  let selYear    = 'all';
  let selCountry = 'all';            // 'all' or country name
  let selFmt     = 'pdf';

  const close = () => {
    sheet.remove(); backdrop.remove();
    _hiddenEls.forEach(el => { el.style.display = ''; });
  };
  backdrop.addEventListener('click', close);
  document.getElementById('tex-close').addEventListener('click', close);

  // ── People pills (multi-select) ───────────────────────────────────────────
  sheet.querySelectorAll('.tex-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.person;
      if (val === 'all') {
        selPeople = new Set(['all']);
      } else {
        selPeople.delete('all');
        if (selPeople.has(val)) selPeople.delete(val);
        else selPeople.add(val);
        if (selPeople.size === 0) selPeople = new Set(['all']);
      }
      sheet.querySelectorAll('.tex-pill').forEach(b => {
        const active = selPeople.has(b.dataset.person);
        b.style.border = '1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)');
        b.style.background = active ? 'var(--primary-bg)' : 'transparent';
        b.style.color = active ? 'var(--primary)' : 'var(--text)';
        b.style.fontWeight = active ? '600' : '400';
      });
    });
  });

  // ── Year pills ────────────────────────────────────────────────────────────
  sheet.querySelectorAll('.tex-year').forEach(btn => {
    btn.addEventListener('click', () => {
      selYear = btn.dataset.year;
      // Set date inputs from year
      if (selYear !== 'all') {
        document.getElementById('tex-from').value = selYear + '-01-01';
        document.getElementById('tex-to').value   = selYear + '-12-31';
      } else {
        document.getElementById('tex-from').value = '';
        document.getElementById('tex-to').value   = '';
      }
      sheet.querySelectorAll('.tex-year').forEach(b => {
        const active = b.dataset.year === selYear;
        b.style.border = '1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)');
        b.style.background = active ? 'var(--primary-bg)' : 'transparent';
        b.style.color = active ? 'var(--primary)' : 'var(--text)';
        b.style.fontWeight = active ? '600' : '400';
      });
    });
  });

  // Typing in date inputs clears year selection
  ['tex-from','tex-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      selYear = 'custom';
      sheet.querySelectorAll('.tex-year').forEach(b => {
        b.style.border = '1.5px solid var(--border)';
        b.style.background = 'transparent';
        b.style.color = 'var(--text)';
        b.style.fontWeight = '400';
      });
    });
  });

  // ── Country pills ─────────────────────────────────────────────────────────
  sheet.querySelectorAll('.tex-country').forEach(btn => {
    btn.addEventListener('click', () => {
      selCountry = btn.dataset.country;
      sheet.querySelectorAll('.tex-country').forEach(b => {
        const active = b.dataset.country === selCountry;
        b.style.border = '1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)');
        b.style.background = active ? 'var(--primary-bg)' : 'transparent';
        b.style.color = active ? 'var(--primary)' : 'var(--text)';
        b.style.fontWeight = active ? '600' : '400';
      });
    });
  });

  // ── Format pills ──────────────────────────────────────────────────────────
  sheet.querySelectorAll('.tex-fmt').forEach(btn => {
    btn.addEventListener('click', () => {
      selFmt = btn.dataset.fmt;
      sheet.querySelectorAll('.tex-fmt').forEach(b => {
        const active = b.dataset.fmt === selFmt;
        b.style.border = '1.5px solid ' + (active ? 'var(--primary)' : 'var(--border)');
        b.style.background = active ? 'var(--primary-bg)' : 'transparent';
        b.style.color = active ? 'var(--primary)' : 'var(--text)';
        b.style.fontWeight = active ? '600' : '400';
      });
    });
  });

  // ── Build filtered trips ──────────────────────────────────────────────────
  function getFilteredTrips() {
    const fromVal = document.getElementById('tex-from').value;
    const toVal   = document.getElementById('tex-to').value;
    const personMap = Object.fromEntries(persons.map(m => [m.id || m.name, m]));

    return trips
      .filter(t => {
        // People filter — pills now store name; match passengerName, companions, or legacy fields
        if (!selPeople.has('all')) {
          const matchByPassenger = t.passengerName && selPeople.has(t.passengerName.trim());
          const matchByName      = t.personName   && selPeople.has(t.personName.trim());
          const companions = Array.isArray(t.travelWith)
            ? t.travelWith
            : String(t.travelWith || '').split(/[,;]+/).map(n => n.trim()).filter(Boolean);
          const matchByCompanion = companions.some(c => selPeople.has(c));
          if (!matchByPassenger && !matchByName && !matchByCompanion) return false;
        }
        // Date range filter (check multiple date fields)
        const tripDate = t.dateLeftOrigin || t.dateOutIndia || t.dateArrivedDest || '';
        if (fromVal && tripDate && tripDate < fromVal) return false;
        if (toVal   && tripDate && tripDate > toVal)   return false;
        // Country filter
        if (selCountry !== 'all' && t.destinationCountry !== selCountry) return false;
        return true;
      })
      .sort((a, b) => new Date(a.dateOutIndia) - new Date(b.dateOutIndia))
      .map(t => ({
        ...t,
        _person: personMap[t.personId] || personMap[getTripPersonName(t)] || { name: getTripPersonName(t) || 'Unknown', emoji: '👤' }
      }));
  }

  // ── Export actions ────────────────────────────────────────────────────────
  async function doExport(deliver) {
    const status = document.getElementById('tex-status');
    const filtered = getFilteredTrips();

    if (!filtered.length) {
      showToast('No trips match the selected filters', 'warning');
      return;
    }

    status.textContent = 'Preparing ' + filtered.length + ' trips…';

    try {
      if (selFmt === 'pdf')           await exportPDF(filtered, persons, documents, deliver);
      else if (selFmt === 'word')     await exportWord(filtered, deliver);
      else if (selFmt === 'xlsx')     await exportExcel(filtered, deliver);
      else if (selFmt === 'csv')      await exportCSV(filtered, deliver);
      else if (selFmt === 'whatsapp') await exportWhatsApp(filtered, persons);
      status.textContent = '✅ Done!';
      setTimeout(() => { if (selFmt !== 'whatsapp') close(); }, 1200);
    } catch (err) {
      status.textContent = 'Export failed: ' + err.message;
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  document.getElementById('tex-export').addEventListener('click', () => doExport('download'));
  document.getElementById('tex-share').addEventListener('click',  () => doExport('share'));
}

// ── Word Export (two-column table, one row per trip, grouped by person) ──────
async function exportWord(trips, deliver) {
  // Group by passenger name
  const byPerson = {};
  trips.forEach(t => {
    const name = getTripPersonName(t) || 'Unknown';
    if (!byPerson[name]) byPerson[name] = { person: t._person, trips: [] };
    byPerson[name].trips.push(t);
  });

  let sections = '';
  Object.entries(byPerson).forEach(([name, { person, trips: pTrips }]) => {
    const { stayMap } = computeStayContext(pTrips);
    const sorted = [...pTrips].sort((a, b) =>
      new Date(a.dateLeftOrigin || a.dateOutIndia || 0) - new Date(b.dateLeftOrigin || b.dateOutIndia || 0)
    );
    const rows = sorted.map((t, i) => {
      const dep = t.dateLeftOrigin || t.dateOutIndia || '';
      const arr = t.dateArrivedDest || t.dateInQatar || '';
      const days = stayMap.get(t) ?? 0;
      const companions = Array.isArray(t.travelWith)
        ? t.travelWith.join(', ')
        : (t.travelWith || '');
      return `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#eef2ff'};">
        <td style="text-align:center;color:#6B7280;">${i + 1}</td>
        <td style="white-space:nowrap;">${dep}</td>
        <td>${t.originCountry || 'India'}</td>
        <td style="color:#1a56db;font-weight:600;">${t.destinationCountry || 'Qatar'}</td>
        <td style="white-space:nowrap;">${arr}</td>
        <td style="text-align:center;font-weight:700;color:#1a56db;">${days}</td>
        <td>${t.flightNumber || t.flightInward || '--'}</td>
        <td>${t.reason || ''}</td>
        <td>${companions}</td>
      </tr>`;
    }).join('');

    sections += `
      <h2 style="color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:4px;margin-top:24px;">
        ${person?.emoji || '👤'} ${name}
      </h2>
      <p style="color:#6B7280;font-size:10pt;margin:2px 0 10px;">${sorted.length} trips</p>
      <table>
        <thead><tr>
          <th style="width:4%;">#</th>
          <th style="width:10%;">Departed</th>
          <th style="width:8%;">From</th>
          <th style="width:8%;">To</th>
          <th style="width:10%;">Arrived</th>
          <th style="width:6%;">Days</th>
          <th style="width:12%;">Flight</th>
          <th style="width:26%;">Reason</th>
          <th style="width:16%;">Companions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  });

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><style>
  body{font-family:Calibri,Arial,sans-serif;margin:20px;font-size:11pt;}
  h1{color:#1e3a5f;font-size:18pt;margin:0 0 4px;}
  h2{font-size:14pt;margin:0;}
  p{color:#6B7280;font-size:10pt;}
  table{border-collapse:collapse;width:100%;font-size:9pt;margin-bottom:20px;}
  th{background:#1e3a5f;color:#ffffff;padding:5px 7px;text-align:left;border:1px solid #1e3a5f;}
  td{padding:4px 7px;border:1px solid #D1D5DB;vertical-align:top;}
</style></head>
<body>
  <h1>✈️ Travel History Report</h1>
  <p>${trips.length} trips &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</p>
  ${sections}
</body></html>`;

  const fname = 'TravelHistory_' + timestampSuffix() + '.doc';
  // On Android always use share intent so the user can open in Word / WPS Office directly
  const _wordBlob = new Blob([html], { type: 'application/msword' });
  if (window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const reader2 = new FileReader();
    const b64 = await new Promise((res, rej) => {
      reader2.onload = e => res(e.target.result.split(',')[1]);
      reader2.onerror = rej;
      reader2.readAsDataURL(_wordBlob);
    });
    await Filesystem.writeFile({ path: fname, data: b64, directory: 'CACHE' });
    const { uri } = await Filesystem.getUri({ path: fname, directory: 'CACHE' });
    await Share.share({ title: 'Travel History', files: [uri], dialogTitle: 'Open in Word / WPS Office' });
    await Filesystem.deleteFile({ path: fname, directory: 'CACHE' }).catch(() => {});
    return; // done
  }
  if (deliver === 'download') {
    await saveFileToExports('travel', fname, html, 'utf8');
    showToast('✅ Saved to exports folder', 'success', 3000);
  } else {
    // Web share fallback
    const a = document.createElement('a');
    a.href = URL.createObjectURL(_wordBlob); a.download = fname; a.click();
  }
}

// ── PDF Export ────────────────────────────────────────────────────────────────
async function exportPDF(trips, members, documents, deliver) {
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load PDF library'));
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, margin = 14, contentW = W - margin * 2;

  // Group trips by person — use stable key that handles both personId and passengerName conventions
  const byPerson = {};
  trips.forEach(t => {
    const pid = t.personId || t._person?.name || getTripPersonName(t) || 'unknown';
    if (!byPerson[pid]) byPerson[pid] = { person: t._person, trips: [] };
    byPerson[pid].trips.push(t);
  });

  let pageNum = 0;

  Object.values(byPerson).forEach(({ person, trips: pTrips }) => {
    if (pageNum > 0) doc.addPage('a4', 'portrait');
    pageNum++;

    let y = margin;
    const { stayMap, endDateMap } = computeStayContext(pTrips);

    // ── Header band ──────────────────────────────────────────────────────────
    const rgb = hexToRgbPdf(person?.color || '#3730A3');
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text((person?.emoji || '') + ' ' + (person?.name || 'Unknown'), margin + 5, y + 9);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Travel History Report · Generated ' + new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), margin + 5, y + 16);
    y += 28;

    // ── Summary stats ─────────────────────────────────────────────────────────
    const totalTrips   = pTrips.length;
    const totalDays    = pTrips.reduce((s, t) => s + (stayMap.get(t) ?? 0), 0);
    const yearlyTotals = {};
    pTrips.forEach(t => {
      const yr = (t.dateLeftOrigin || t.dateOutIndia)?.slice(0,4) || 'Unknown';
      yearlyTotals[yr] = (yearlyTotals[yr] || 0) + (stayMap.get(t) ?? 0);
    });

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F');
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'S');

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(String(totalTrips), margin + 20, y + 9);
    doc.text(totalDays + 'd', margin + 65, y + 9);
    doc.text(Object.keys(yearlyTotals).length + ' yrs', margin + 120, y + 9);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Total Trips', margin + 20, y + 15);
    doc.text('Dest. Days', margin + 65, y + 15);
    doc.text('Years Travelled', margin + 120, y + 15);
    y += 26;

    // ── Yearly breakdown ──────────────────────────────────────────────────────
    const sortedYears = Object.keys(yearlyTotals).sort((a,b) => b-a);
    if (sortedYears.length > 1) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30,30,30);
      doc.text('Days per Year:', margin, y + 4);
      let xOff = margin + 30;
      sortedYears.forEach(yr => {
        doc.setFont('helvetica', 'normal');
        const label = yr + ': ' + yearlyTotals[yr] + 'd';
        doc.text(label, xOff, y + 4);
        xOff += 28;
        if (xOff > W - margin - 28) { xOff = margin + 30; y += 6; }
      });
      y += 10;
    }

    // ── Trips table ───────────────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255,255,255);
    doc.setFillColor(55, 48, 163);  // indigo header
    doc.rect(margin, y, contentW, 7, 'F');

    const cols = [
      { label: '#',           x: margin + 1,   w: 6  },
      { label: 'Departed',    x: margin + 7,   w: 26 },
      { label: 'Destination', x: margin + 33,  w: 22 },
      { label: 'Arrived',     x: margin + 55,  w: 22 },
      { label: 'Returned',    x: margin + 77,  w: 22 },
      { label: 'Days',        x: margin + 99,  w: 12 },
      { label: 'Flight In',   x: margin + 111, w: 20 },
      { label: 'Reason',      x: margin + 131, w: 51 },
    ];

    cols.forEach(c => doc.text(c.label, c.x, y + 5));
    y += 9;

    pTrips.sort((a,b) => new Date(b.dateLeftOrigin || b.dateOutIndia || 0) - new Date(a.dateLeftOrigin || a.dateOutIndia || 0))
      .forEach((trip, idx) => {
        if (y > 270) { doc.addPage('a4','portrait'); y = margin; }

        const bg = idx % 2 === 0 ? [255,255,255] : [248,249,252];
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(margin, y - 1, contentW, 7, 'F');

        doc.setTextColor(30,30,30);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        const row = [
          String(idx + 1),
          fmtDate(trip.dateLeftOrigin || trip.dateOutIndia),
          (trip.destinationCountry || trip.destination || 'Qatar'),
          fmtDate(trip.dateArrivedDest || trip.dateInQatar),
          endDateMap.get(trip) ? fmtDate(endDateMap.get(trip)) : 'Ongoing',
          String(stayMap.get(trip) ?? 0),
          (trip.flightInward || '--').slice(0, 10),
          (trip.reason || '--').slice(0, 38),
        ];

        cols.forEach((c, ci) => {
          const txt = String(row[ci] || '').slice(0, Math.floor(c.w / 1.8));
          doc.text(txt, c.x, y + 4);
        });

        // Thin divider
        doc.setDrawColor(230,230,235);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 6, margin + contentW, y + 6);
        y += 7;
      });

    // ── Document expiry summary ───────────────────────────────────────────────
    const memberDocs = documents.filter(d => d.personId === (person?.id || person?.name));
    if (memberDocs.length) {
      y += 6;
      if (y > 260) { doc.addPage('a4','portrait'); y = margin; }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(55,48,163);
      doc.text('Document Expiry Summary', margin, y);
      y += 5;

      memberDocs.forEach(d => {
        const days = d.expiryDate
          ? Math.floor((new Date(d.expiryDate) - new Date()) / 86400000)
          : null;
        const status = days == null ? '--' :
          days < 0 ? 'EXPIRED' : days < 30 ? 'URGENT' : days < 90 ? 'WARNING' : 'Valid';
        const color = days == null ? [120,120,120] :
          days < 0 ? [220,38,38] : days < 30 ? [220,38,38] : days < 90 ? [180,100,0] : [21,128,61];

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30,30,30);
        doc.setFontSize(8);
        doc.text((d.docName || 'Doc') + ': ' + (d.docNumber ? d.docNumber.slice(-4).padStart(d.docNumber.length,'*') : '--'), margin + 2, y + 4);
        doc.text('Expires: ' + fmtDate(d.expiryDate), margin + 55, y + 4);

        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(status + (days != null && days >= 0 ? ' (' + days + 'd)' : ''), margin + 110, y + 4);
        y += 7;
      });
    }

    // ── Page number ───────────────────────────────────────────────────────────
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150,150,150);
    doc.text('Travel History · Family Hub PWA · Page ' + pageNum, margin, 292);
  });

  const ts = timestampSuffix();
  const peopleNames = [...new Set(trips.map(t => t._person?.name))].join('-');
  const filename = 'Travel_History_' + peopleNames.replace(/\s+/g,'-').slice(0,30) + '_' + ts + '.pdf';

  // Share mode: share the blob via share sheet
  if (deliver === 'share' && navigator.canShare) {
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      showToast('PDF shared!', 'success', 3000);
      return;
    }
  }

  // Save to Documents/TravelHub/exports/ via Capacitor Filesystem, fallback to browser download
  try {
    const pdfBuf = doc.output('arraybuffer');
    const bytes  = new Uint8Array(pdfBuf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    const savedPath = await saveFileToExports('travel', filename, b64);
    showToast('✅ PDF saved: ' + savedPath, 'success', 4000);
  } catch {
    doc.save(filename); // Web fallback
    showToast('PDF saved: ' + filename, 'success', 3000);
  }
}

// ── Excel Export ──────────────────────────────────────────────────────────────
async function exportExcel(trips, deliver) {
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Failed to load Excel library'));
      document.head.appendChild(s);
    });
  }

  const headers = [
    'Person', 'Destination', 'Departed India', 'Arrived',
    'Left', 'Returned India', 'Days Stayed',
    'Flight Inward', 'Flight Outward', 'Reason', 'Travelled With'
  ];

  const rows = trips.map(t => [
    t._person?.name || getTripPersonName(t) || 'Unknown',
    t.destination   || 'Qatar',
    t.dateOutIndia  || '',
    t.dateInQatar   || '',
    t.dateOutQatar  || '',
    t.dateInIndia   || '',
    getStayDays(t),
    t.flightInward  || '',
    t.flightOutward || '',
    t.reason        || '',
    t.travelWithNames || (t.travelWith || []).join(', '),
  ]);

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [14,16,16,14,14,12,14,14,24,20].map(w => ({ wch: w }));
  window.XLSX.utils.book_append_sheet(wb, ws, 'Travel History');

  const ts = timestampSuffix();
  const filename = 'Travel_History_' + ts + '.xlsx';

  // Share mode
  if (deliver === 'share' && navigator.canShare) {
    const wbout = window.XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type:'application/octet-stream' });
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      showToast('Excel shared!', 'success', 3000);
      return;
    }
  }

  // Save to Documents/TravelHub/exports/
  try {
    const savedPath = await saveXLSXToExports('travel', wb, 'Travel_History');
    showToast('✅ Saved: ' + savedPath, 'success', 4000);
  } catch {
    window.XLSX.writeFile(wb, filename); // Web fallback
    showToast('Excel saved: ' + filename, 'success', 3000);
  }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportCSV(trips, deliver) {
  const headers = [
    'Person', 'Destination', 'Departed India', 'Arrived',
    'Left', 'Returned India', 'Days Stayed',
    'Flight Inward', 'Flight Outward', 'Reason', 'Travelled With'
  ];

  const rows = trips.map(t => [
    t._person?.name || 'Unknown',
    t.destination   || 'Qatar',
    t.dateOutIndia  || '',
    t.dateInQatar   || '',
    t.dateOutQatar  || '',
    t.dateInIndia   || '',
    getStayDays(t),
    t.flightInward  || '',
    t.flightOutward || '',
    t.reason        || '',
    (t.travelWith   || []).join('; '),
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    .join('\n');

  const ts = timestampSuffix();
  const filename = 'Travel_History_' + ts + '.csv';

  // Share mode
  if (deliver === 'share' && navigator.canShare) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], filename, { type: 'text/csv' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      showToast('CSV shared!', 'success', 3000);
      return;
    }
  }

  // Save to Documents/TravelHub/exports/
  try {
    const savedPath = await saveFileToExports('travel', filename, csv, 'utf8');
    showToast('✅ Saved: ' + savedPath, 'success', 4000);
  } catch {
    // Web fallback — blob download
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    showToast('CSV saved: ' + filename, 'success', 3000);
  }
}

// ── WhatsApp Text Copy ────────────────────────────────────────────────────────
async function exportWhatsApp(trips, persons) {
  const lines = [];  // ← was missing in previous version, causing crash

  // Flatten and group by individual name
  const byPersonName = {};
  trips.forEach(t => {
    const rawName = getTripPersonName(t) || t._person?.name || 'Unknown';
    const splitNames = rawName.split(/[&,]+/).map(n => n.trim()).filter(Boolean);

    splitNames.forEach(name => {
      if (!byPersonName[name]) byPersonName[name] = { name, trips: [] };
      // Avoid duplicate trips for the same person (deduplicate by departure + arrival)
      const dKey = `${t.dateLeftOrigin || t.dateOutIndia}|${t.dateArrivedDest || t.dateInQatar}`;
      if (!byPersonName[name].trips.some(ex => `${ex.dateLeftOrigin || ex.dateOutIndia}|${ex.dateArrivedDest || ex.dateInQatar}` === dKey)) {
        byPersonName[name].trips.push(t);
      }
    });
  });

  Object.values(byPersonName).sort((a,b) => a.name.localeCompare(b.name)).forEach(({ name, trips: pTrips }) => {
    const { stayMap, endDateMap } = computeStayContext(pTrips);
    const totalDays = pTrips.reduce((s, t) => s + (stayMap.get(t) ?? 0), 0);

    // Yearly totals breakdown (group by departure year)
    const yearly = {};
    pTrips.forEach(t => {
      const yr = (t.dateLeftOrigin || t.dateOutIndia)?.match(/\b(20\d{2})\b/)?.[1] || '?';
      yearly[yr] = (yearly[yr] || 0) + (stayMap.get(t) ?? 0);
    });
    const yrLine = Object.keys(yearly).sort((a,b)=>b-a)
      .map(yr => yr + ': ' + yearly[yr] + 'd').join(' · ');

    lines.push('👤 *' + name + '*  (' + pTrips.length + ' trips · ' + totalDays + 'd total)');
    lines.push('─────────────────────');

    pTrips.sort((a,b) => {
      const d1 = a.dateLeftOrigin || a.dateOutIndia || '';
      const d2 = b.dateLeftOrigin || b.dateOutIndia || '';
      return d2.localeCompare(d1);
    }).forEach((t, i) => {
      const dest    = t.destinationCountry || t.destination || 'Qatar';
      const origin  = t.originCountry || 'India';
      const stay    = stayMap.get(t) ?? 0;
      const depDate = fmtDate(t.dateLeftOrigin || t.dateOutIndia);
      const arrDate = fmtDate(t.dateArrivedDest || t.dateInQatar);
      const retDate = endDateMap.get(t) ? fmtDate(endDateMap.get(t)) : 'Ongoing';
      lines.push(`${i+1}. ${origin} → ${dest}: Left ${depDate}, Arrived ${arrDate}`);
      lines.push(`   ↩️ Return: ${retDate}  🕐 ${stay} days`);
      if (t.flightInward)  lines.push('   ✈️ In: ' + t.flightInward);
      if (t.flightOutward) lines.push('   ✈️ Out: ' + t.flightOutward);
      if (t.reason)        lines.push('   📝 ' + t.reason);
    });
    if (yrLine) lines.push('📊 ' + yrLine);
    lines.push('');
  });

  lines.push('_Exported from Family Hub App_');

  const text = lines.join('\n');
  const ok = await copyToClipboard(text);
  showToast(ok ? '✅ Copied! Paste in WhatsApp' : 'Could not copy -- try again', ok ? 'success' : 'error', 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '--';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  } catch { return d; }
}

function hexToRgbPdf(hex) {
  hex = hex.replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  return {
    r: parseInt(hex.slice(0,2),16),
    g: parseInt(hex.slice(2,4),16),
    b: parseInt(hex.slice(4,6),16),
  };
}
