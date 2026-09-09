'use strict';

(function () {
  /* Only runs for admin/management users */
  function _session() {
    try { return JSON.parse(localStorage.getItem('rgmc_gateway_session')); } catch { return null; }
  }

  function _authHeaders() {
    const s = _session();
    return { 'X-Gateway-Username': s?.username || '' };
  }

  function _isPrivileged() {
    const s = _session();
    return s && (s.isAdmin || s.isManagement);
  }

  /* localStorage key: have we already shown this notification? */
  function _seenKey(id, count) {
    return `rgmc_outage_seen_${id}_${count}`;
  }

  /* Inject modal HTML once */
  function _ensureModal() {
    if (document.getElementById('outageAlertModal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
<div id="outageAlertOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9000;display:none;align-items:center;justify-content:center;padding:20px;">
  <div id="outageAlertModal" style="background:#1a0a0a;border:1px solid rgba(239,68,68,.4);border-radius:16px;max-width:480px;width:100%;box-shadow:0 40px 100px rgba(0,0,0,.8),0 0 0 1px rgba(239,68,68,.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#7f1d1d,#450a0a);padding:20px 24px;border-bottom:2px solid rgba(239,68,68,.5);">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">🚨</span>
        <div>
          <div style="font-size:16px;font-weight:700;color:#fca5a5;letter-spacing:-.01em;">OUTAGE DETECTED</div>
          <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:2px;">Multiple users reporting the same error</div>
        </div>
      </div>
    </div>
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:7px 0;color:rgba(255,255,255,.5);font-size:11px;text-transform:uppercase;letter-spacing:.08em;width:110px;font-weight:700;">System</td>
          <td id="oamSiteName" style="padding:7px 0;color:#f1f5f9;font-weight:600;"></td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:rgba(255,255,255,.5);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Error Code</td>
          <td id="oamErrorCode" style="padding:7px 0;color:#fca5a5;font-family:monospace;font-weight:700;"></td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:rgba(255,255,255,.5);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Reports</td>
          <td id="oamIssueCount" style="padding:7px 0;color:#f1f5f9;"></td>
        </tr>
        <tr>
          <td style="padding:7px 0;color:rgba(255,255,255,.5);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Detected</td>
          <td id="oamTriggered" style="padding:7px 0;color:#f1f5f9;"></td>
        </tr>
      </table>
      <div id="oamNotifNum" style="margin-top:12px;font-size:11px;color:rgba(255,255,255,.35);"></div>
    </div>
    <div style="padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,.07);">
      <button id="oamDismissBtn" onclick="outageNotifierDismiss()" style="padding:9px 18px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:30px;color:rgba(255,255,255,.6);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Dismiss</button>
      <a id="oamAdminLink" href="/admin" onclick="outageNotifierDismiss()" style="padding:9px 18px;background:#dc2626;border:none;border-radius:30px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">View in Admin</a>
    </div>
  </div>
</div>`;
    document.body.appendChild(el.firstElementChild);
  }

  let _currentOutageId   = null;
  let _currentOutageCount = 0;

  window.outageNotifierDismiss = function () {
    if (_currentOutageId !== null) {
      localStorage.setItem(_seenKey(_currentOutageId, _currentOutageCount), '1');
    }
    const overlay = document.getElementById('outageAlertOverlay');
    if (overlay) overlay.style.display = 'none';
    _currentOutageId    = null;
    _currentOutageCount = 0;
  };

  function _showOutage(outage) {
    _ensureModal();
    _currentOutageId    = outage.id;
    _currentOutageCount = outage.notification_count;

    const fmt = (iso) => {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleString('en-PH', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      } catch { return iso; }
    };

    document.getElementById('oamSiteName').textContent    = outage.site_name  || '—';
    document.getElementById('oamErrorCode').textContent   = outage.error_code || '—';
    document.getElementById('oamIssueCount').textContent  = `${(outage.issue_ids || []).length} issue(s) with matching error code`;
    document.getElementById('oamTriggered').textContent   = fmt(outage.triggered_at);
    document.getElementById('oamNotifNum').textContent    = `Notification ${outage.notification_count} of 2`;

    const overlay = document.getElementById('outageAlertOverlay');
    overlay.style.display = 'flex';
  }

  async function _poll() {
    if (!_isPrivileged()) return;
    try {
      const res = await fetch('/api/outage-check', { headers: _authHeaders() });
      if (!res.ok) return;
      const outages = await res.json();
      if (!Array.isArray(outages)) return;
      for (const o of outages) {
        if (!localStorage.getItem(_seenKey(o.id, o.notification_count))) {
          _showOutage(o);
          break; // Show one at a time
        }
      }
    } catch { /* silently ignore */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!_isPrivileged()) return;
    _poll();
    setInterval(_poll, 60000);
  });
})();
