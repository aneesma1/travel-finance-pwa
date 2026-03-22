// v3.4.1 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── app-a-family-hub/js/screens/travel-export.js ───────────────────────────
// Travel history export: per-person or multi-person, date range
// Formats: PDF report, Excel/CSV, WhatsApp text copy

'use strict';

import { timestampSuffix } from '../../../shared/drive.js';
import { copyToClipboard, showToast, formatDisplayDate, daysBetween } from '../../../shared/utils.js';

// ── Entry point -- opens the export bottom sheet ───────────────────────────────
export function openTravelExportSheet(members, trips, documents) {
  document.getElementById('travel-export-sheet')?.remove();
  document.getElementById('travel-export-backdrop')?.remove();

  const years = [...new Set(
    trips.map(t => t.dateOutIndia?.slice(0, 4)).filter(Boolean)
  )].sort((a, b) => b - a);
  if (!years.length) years.push(String(new Date().getFullYear()));

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

      // ── People ──
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);',
        'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">',
        'People',
      '</div>',
      '<div id="tex-people" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">',
        '<button class="tex-pill active" data-person="all" style="',
          'padding:8px 14px;border-radius:20px;border:1.5px solid var(--primary);',
          'background:var(--primary-bg);color:var(--primary);font-size:13px;',
          'font-weight:600;cursor:pointer;">👥 All</button>',
        members.map(m =>
          '<button class="tex-pill" data-person="' + m.id + '" style="' +
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

    // ── Actions ──
    '<div style="padding:12px 20px 32px;border-top:1px solid var(--border-light);',
      'flex-shrink:0;display:flex;gap:10px;">',
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

  // ── State ─────────────────────────────────────────────────────────────────
  let selPeople = new Set(['all']);  // 'all' or member IDs
  let selYear   = 'all';
  let selFmt    = 'pdf';

  const close = () => { sheet.remove(); backdrop.remove(); };
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
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

    return trips
      .filter(t => {
        // People filter
        if (!selPeople.has('all') && !selPeople.has(t.personId)) return false;
        // Date range filter
        if (fromVal && t.dateOutIndia && t.dateOutIndia < fromVal) return false;
        if (toVal   && t.dateOutIndia && t.dateOutIndia > toVal)   return false;
        return true;
      })
      .sort((a, b) => new Date(a.dateOutIndia) - new Date(b.dateOutIndia))
      .map(t => ({ ...t, _member: memberMap[t.personId] || { name: 'Unknown', emoji: '👤' } }));
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
      if (selFmt === 'pdf')      await exportPDF(filtered, members, documents, deliver);
      else if (selFmt === 'xlsx') await exportExcel(filtered, deliver);
      else if (selFmt === 'csv')  await exportCSV(filtered, deliver);
      else if (selFmt === 'whatsapp') await exportWhatsApp(filtered, members);
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

  // Group trips by person
  const byPerson = {};
  trips.forEach(t => {
    const pid = t.personId;
    if (!byPerson[pid]) byPerson[pid] = { member: t._member, trips: [] };
    byPerson[pid].trips.push(t);
  });

  let pageNum = 0;

  Object.values(byPerson).forEach(({ member, trips: pTrips }) => {
    if (pageNum > 0) doc.addPage('a4', 'portrait');
    pageNum++;

    let y = margin;

    // ── Header band ──────────────────────────────────────────────────────────
    const rgb = hexToRgbPdf(member.color || '#3730A3');
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text((member.emoji || '') + ' ' + member.name, margin + 5, y + 9);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Travel History Report · Generated ' + new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), margin + 5, y + 16);
    y += 28;

    // ── Summary stats ─────────────────────────────────────────────────────────
    const totalTrips   = pTrips.length;
    const totalDays    = pTrips.reduce((s, t) => s + (t.daysInQatar || 0), 0);
    const yearlyTotals = {};
    pTrips.forEach(t => {
      const yr = t.dateOutIndia?.slice(0,4) || 'Unknown';
      yearlyTotals[yr] = (yearlyTotals[yr] || 0) + (t.daysInQatar || 0);
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
    doc.text('Days in Qatar', margin + 65, y + 15);
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
      { label: 'Departed India', x: margin + 7,   w: 26 },
      { label: 'Arrived Qatar', x: margin + 33,  w: 26 },
      { label: 'Left Qatar',   x: margin + 59,  w: 26 },
      { label: 'Days',         x: margin + 85,  w: 14 },
      { label: 'Flight In',    x: margin + 99,  w: 24 },
      { label: 'Reason',       x: margin + 123, w: 59 },
    ];

    cols.forEach(c => doc.text(c.label, c.x, y + 5));
    y += 9;

    pTrips.sort((a,b) => new Date(b.dateOutIndia) - new Date(a.dateOutIndia))
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
          fmtDate(trip.dateOutIndia),
          fmtDate(trip.dateInQatar),
          trip.dateOutQatar ? fmtDate(trip.dateOutQatar) : 'Still here',
          trip.daysInQatar != null ? String(trip.daysInQatar) : '--',
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
    const memberDocs = documents.filter(d => d.personId === member.id);
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
  const peopleNames = [...new Set(trips.map(t => t._member?.name))].join('-');
  const filename = 'Travel_History_' + peopleNames.replace(/\s+/g,'-').slice(0,30) + '_' + ts + '.pdf';

  if (deliver === 'share' && navigator.canShare && navigator.canShare({ files: [new File([''], filename)] })) {
    const pdfBlob = doc.output('blob');
    await navigator.share({ files: [new File([pdfBlob], filename, { type: 'application/pdf' })] })
      .catch(() => doc.save(filename)); // fallback to download if share fails/cancelled
  } else {
    doc.save(filename); // Always download on PC or unsupported
  }
  showToast('PDF saved: ' + filename, 'success', 4000);
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
    'Person', 'Departed India', 'Arrived Qatar',
    'Left Qatar', 'Returned India', 'Days in Qatar',
    'Flight Inward', 'Flight Outward', 'Reason', 'Travelled With'
  ];

  const rows = trips.map(t => [
    t._member?.name || 'Unknown',
    t.dateOutIndia  || '',
    t.dateInQatar   || '',
    t.dateOutQatar  || '',
    t.dateInIndia   || '',
    t.daysInQatar   != null ? t.daysInQatar : '',
    t.flightInward  || '',
    t.flightOutward || '',
    t.reason        || '',
    (t.travelWith   || []).join(', '),
  ]);

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Column widths
  ws['!cols'] = [14,16,16,14,14,12,14,14,24,20].map(w => ({ wch: w }));

  window.XLSX.utils.book_append_sheet(wb, ws, 'Travel History');

  const ts = timestampSuffix();
  const filename = 'Travel_History_' + ts + '.xlsx';

  if (deliver === 'share' && navigator.canShare) {
    const wbout = window.XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type:'application/octet-stream' });
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => window.XLSX.writeFile(wb, filename));
    } else {
      window.XLSX.writeFile(wb, filename);
    }
  } else {
    window.XLSX.writeFile(wb, filename);
  }
  showToast('Excel saved: ' + filename, 'success', 3000);
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportCSV(trips, deliver) {
  const headers = [
    'Person','Departed India','Arrived Qatar',
    'Left Qatar','Returned India','Days in Qatar',
    'Flight Inward','Flight Outward','Reason','Travelled With'
  ];

  const rows = trips.map(t => [
    t._member?.name || 'Unknown',
    t.dateOutIndia  || '',
    t.dateInQatar   || '',
    t.dateOutQatar  || '',
    t.dateInIndia   || '',
    t.daysInQatar   != null ? t.daysInQatar : '',
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
  const blob = new Blob([csv], { type: 'text/csv' });

  const shareFile = new File([blob], filename, { type: 'text/csv' });
  if (deliver === 'share' && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
    await navigator.share({ files: [shareFile] }).catch(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }
  showToast('CSV saved: ' + filename, 'success', 3000);
}

// ── WhatsApp Text Copy ────────────────────────────────────────────────────────
async function exportWhatsApp(trips, members) {
  // Group by person
  const byPerson = {};
  trips.forEach(t => {
    const pid = t.personId;
    if (!byPerson[pid]) byPerson[pid] = { member: t._member, trips: [] };
    byPerson[pid].trips.push(t);
  });

  const lines = ['✈️ *Travel History Report*', '📅 ' + new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }), ''];

  Object.values(byPerson).forEach(({ member, trips: pTrips }) => {
    const totalDays = pTrips.reduce((s, t) => s + (t.daysInQatar || 0), 0);
    lines.push('👤 *' + member.name + '*  (' + pTrips.length + ' trips · ' + totalDays + 'd total in Qatar)');
    lines.push('─────────────────────');

    pTrips.sort((a,b) => new Date(b.dateOutIndia) - new Date(a.dateOutIndia))
      .forEach((t, i) => {
        lines.push(
          (i+1) + '. ' + fmtDate(t.dateOutIndia) +
          ' → ' + (t.dateInIndia ? fmtDate(t.dateInIndia) : 'Present')
        );
        if (t.daysInQatar != null) lines.push('   🕐 ' + t.daysInQatar + ' days in Qatar');
        if (t.flightInward)  lines.push('   ✈️ In: ' + t.flightInward);
        if (t.flightOutward) lines.push('   ✈️ Out: ' + t.flightOutward);
        if (t.reason)        lines.push('   📝 ' + t.reason);
      });

    // Yearly totals
    const yearly = {};
    pTrips.forEach(t => {
      const yr = t.dateOutIndia?.slice(0,4) || '?';
      yearly[yr] = (yearly[yr] || 0) + (t.daysInQatar || 0);
    });
    const yrLine = Object.keys(yearly).sort((a,b)=>b-a)
      .map(yr => yr + ': ' + yearly[yr] + 'd').join(' · ');
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
