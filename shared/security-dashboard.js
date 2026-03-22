// v3.3.6 — 2026-03-22 — 2026-03-22 — 2026-03-22 — 2026-03-21 — 2026-03-21 — 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21 -- 2026-03-21
// ─── shared/security-dashboard.js ───────────────────────────────────────────
// Security dashboard modal -- shared between App A and App B

'use strict';

import { getActiveSessions, getActivityLog, revokeSession, revokeAllSessions } from './security-log.js';

export async function openSecurityDashboard(container) {
  const modal = document.getElementById('member-modal') || document.getElementById('settings-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 20px 12px;flex-shrink:0;">
        <span style="font-size:16px;font-weight:700;">🛡️ Security & Access</span>
        <button id="close-security" style="background:none;border:none;font-size:22px;cursor:pointer;">×</button>
      </div>
      <div id="security-body" style="overflow-y:auto;flex:1;padding:0 20px 24px;">
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Loading…</div>
      </div>
    </div>
  `;

  document.getElementById('close-security').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  const body = document.getElementById('security-body');

  try {
    const [sessions, log] = await Promise.all([getActiveSessions(), getActivityLog(30)]);
    const currentSessionId = localStorage.getItem('current_session_id');
    const activeSessions = sessions.filter(s => s.status === 'active');
    const riskColors = { none:'#15803D', low:'#854D0E', medium:'#C2410C', high:'#BE123C' };
    const riskBg    = { none:'#F0FDF4', low:'#FEF9C3', medium:'#FFF7ED', high:'#FFF1F2' };

    body.innerHTML = `
      <!-- Active Sessions -->
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
        Active Sessions (${activeSessions.length})
      </div>
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;margin-bottom:16px;">
        ${activeSessions.length ? activeSessions.map((s, idx) => `
          <div style="padding:12px 16px;${idx < activeSessions.length-1 ? 'border-bottom:1px solid var(--border-light);' : ''}">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:8px;height:8px;border-radius:50%;background:var(--success);flex-shrink:0;"></div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;">${s.device}</div>
                <div style="font-size:11px;color:var(--text-muted);">${s.app} · ${new Date(s.signInTime).toLocaleString()}</div>
                <div style="font-size:11px;color:var(--text-muted);">Last active: ${new Date(s.lastActiveTime).toLocaleString()}</div>
              </div>
              ${s.sessionId === currentSessionId
                ? `<span style="font-size:11px;color:var(--primary);font-weight:600;">This device</span>`
                : `<button data-revoke="${s.sessionId}" style="font-size:12px;color:var(--danger);background:none;border:1px solid var(--danger-bg);border-radius:8px;padding:4px 10px;cursor:pointer;">Revoke</button>`
              }
            </div>
          </div>
        `).join('') : `<div style="padding:16px;font-size:13px;color:var(--text-muted);">No active sessions found</div>`}
      </div>

      ${activeSessions.length > 1 ? `
        <button id="revoke-all-btn" style="width:100%;padding:12px;margin-bottom:16px;border-radius:var(--radius-lg);border:1.5px solid var(--danger);background:transparent;color:var(--danger);font-size:14px;font-weight:600;cursor:pointer;">
          🔒 Revoke All Other Sessions
        </button>
      ` : ''}

      <!-- Activity Log -->
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
        Recent Activity (${log.length})
      </div>
      <div style="background:var(--surface);border-radius:var(--radius-lg);border:1px solid var(--border);overflow:hidden;margin-bottom:16px;">
        ${log.length ? log.map((entry, idx) => `
          <div style="padding:10px 16px;${idx < log.length-1 ? 'border-bottom:1px solid var(--border-light);' : ''}display:flex;gap:10px;align-items:flex-start;">
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;margin-top:2px;background:${riskBg[entry.risk]};color:${riskColors[entry.risk]};">${entry.risk}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:500;">${entry.action}</div>
              <div style="font-size:11px;color:var(--text-muted);">${entry.device} · ${new Date(entry.time).toLocaleString()}</div>
              ${entry.detail ? `<div style="font-size:11px;color:var(--text-secondary);">${entry.detail}</div>` : ''}
            </div>
          </div>
        `).join('') : `<div style="padding:16px;font-size:13px;color:var(--text-muted);">No activity logged yet</div>`}
      </div>

      <button id="export-log-btn" style="width:100%;padding:12px;border-radius:var(--radius-lg);border:1px solid var(--border);background:transparent;color:var(--text);font-size:14px;cursor:pointer;">
        📥 Export Activity Log as CSV
      </button>
    `;

    // Revoke single session
    body.querySelectorAll('[data-revoke]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Revoke this session? That device will be signed out on next sync.')) return;
        await revokeSession(btn.dataset.revoke);
        openSecurityDashboard(container);
      });
    });

    // Revoke all
    document.getElementById('revoke-all-btn')?.addEventListener('click', async () => {
      if (!confirm('Revoke all other sessions? Those devices will be signed out on next sync.')) return;
      await revokeAllSessions(currentSessionId);
      openSecurityDashboard(container);
    });

    // Export log
    document.getElementById('export-log-btn')?.addEventListener('click', () => {
      const headers = ['Time','Action','Risk','Device','App','Detail'];
      const rows = log.map(e => [
        new Date(e.time).toLocaleString(), e.action, e.risk, e.device, e.app, e.detail||''
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Security_Log_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  } catch (err) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);font-size:13px;">Failed to load security data: ${err.message}</div>`;
  }
}
