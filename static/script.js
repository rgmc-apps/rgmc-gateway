'use strict';

/* ── Report Modal ── */

function openReport(siteName) {
  document.getElementById('siteNameField').value = siteName;
  document.getElementById('modalSiteName').textContent = siteName;
  resetFormState();
  document.getElementById('reportModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('reportForm').reset();
  document.getElementById('fileLabel').textContent = 'Click to attach screenshots or drag & drop';
  resetFormState();
}

function overlayClose(e) {
  if (e.target === document.getElementById('reportModal')) closeReport();
}

function resetFormState() {
  show('formActions');
  hide('formLoading');
  hide('formSuccess');
  hide('formError');
  const btn = document.getElementById('submitBtn');
  if (btn) btn.disabled = false;
}

async function submitReport(e) {
  e.preventDefault();
  const form = document.getElementById('reportForm');

  hide('formActions');
  hide('formSuccess');
  hide('formError');
  show('formLoading');

  const formData = new FormData(form);

  // Limit to 5 screenshots
  const fileInput = document.getElementById('screenshots');
  const files = Array.from(fileInput.files).slice(0, 5);
  formData.delete('screenshots');
  files.forEach(f => formData.append('screenshots', f));

  try {
    const res = await fetch('/report', { method: 'POST', body: formData });
    const data = await res.json();

    hide('formLoading');

    if (data.success) {
      show('formSuccess');
      document.getElementById('successMsg').textContent = data.message;
      // Close modal after 3s
      setTimeout(() => { closeReport(); showToast('Report submitted successfully.'); }, 3000);
    } else {
      show('formActions');
      show('formError');
      document.getElementById('errorMsg').textContent = data.error || 'An unexpected error occurred.';
    }
  } catch {
    hide('formLoading');
    show('formActions');
    show('formError');
    document.getElementById('errorMsg').textContent = 'Network error — please try again.';
  }
}

function updateFileList(input) {
  const files = Array.from(input.files);
  const label = document.getElementById('fileLabel');
  if (files.length === 0) {
    label.textContent = 'Click to attach screenshots or drag & drop';
  } else {
    label.textContent = files.slice(0, 5).map(f => f.name).join(', ');
    if (files.length > 5) label.textContent += ` (+${files.length - 5} ignored — max 5)`;
  }
}

// Drag & drop visual feedback
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('fileDropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', () => zone.classList.remove('dragover'));
});

/* ── Health Check ── */

let healthRefreshTimer = null;
let healthLoadTime = null;

async function refreshHealth() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  btn.disabled = true;

  const grid = document.getElementById('healthGrid');
  grid.innerHTML = '<div class="health-loading"><div class="spinner"></div><span>Checking API status…</span></div>';

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    renderHealth(data);
    healthLoadTime = new Date();
    updateLastUpdated();
  } catch {
    grid.innerHTML = '<div class="health-loading" style="color:#dc2626;">Failed to fetch health status. Please refresh.</div>';
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

function renderHealth(apis) {
  const grid = document.getElementById('healthGrid');
  grid.innerHTML = '';

  apis.forEach(api => {
    const card = document.createElement('div');
    card.className = 'health-card';

    const overallOk = api.endpoints.every(ep => ep.status === 'ok');
    const overallStatus = api.endpoints.some(ep => ep.status === 'error') ? 'error'
                        : api.endpoints.some(ep => ep.status === 'timeout') ? 'timeout'
                        : 'ok';

    card.innerHTML = `
      <div class="health-card-header">
        <div class="health-card-title">${api.name}</div>
        <div class="health-overall">
          <div class="status-dot ${overallStatus}"></div>
          <span class="status-badge ${overallStatus}">${statusText(overallStatus)}</span>
        </div>
      </div>
      <div class="health-card-body">
        ${api.endpoints.map(ep => renderEndpoint(ep)).join('')}
      </div>`;

    grid.appendChild(card);
  });
}

function renderEndpoint(ep) {
  if (ep.connections) {
    return renderConnections(ep);
  }

  let detail = '';
  if (ep.error) {
    detail = `<span style="font-size:12px;color:#94a3b8;">${ep.error}</span>`;
  } else if (ep.response !== undefined) {
    const raw = typeof ep.response === 'object' ? JSON.stringify(ep.response) : String(ep.response);
    const truncated = raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
    detail = `<span style="font-size:11px;color:#94a3b8;font-family:monospace;" title="${escapeAttr(raw)}">${escapeHtml(truncated)}</span>`;
  }

  return `
    <div class="status-row">
      <div class="status-dot ${ep.status}"></div>
      <span class="status-label">${ep.label}</span>
      <span class="status-badge ${ep.status}">${statusText(ep.status)}</span>
    </div>
    ${detail ? `<div style="padding-left:20px;margin-top:-4px;">${detail}</div>` : ''}`;
}

function renderConnections(ep) {
  const conns = ep.connections || [];
  if (conns.length === 0) {
    return `<div class="status-row">
      <div class="status-dot ${ep.status}"></div>
      <span class="status-label">${ep.label}</span>
      <span class="status-badge ${ep.status}">${statusText(ep.status)}</span>
    </div>`;
  }

  const rows = conns.map(c => {
    const connected = c.connected === true || c.connected === 'true';
    const errorText = c.error && c.error !== null && c.error !== '' ? c.error : '—';
    return `<tr>
      <td class="conn-name">${escapeHtml(String(c.name || ''))}</td>
      <td class="${connected ? 'conn-status-ok' : 'conn-status-err'}">${connected ? '&#10003; Connected' : '&#10007; Disconnected'}</td>
      <td class="conn-error-text">${escapeHtml(String(errorText))}</td>
    </tr>`;
  }).join('');

  return `
    <div class="status-row" style="margin-bottom:4px;">
      <div class="status-dot ${ep.status}"></div>
      <span class="status-label">${ep.label}</span>
      <span class="status-badge ${ep.status}">${statusText(ep.status)}</span>
    </div>
    <table class="connections-table">
      <thead><tr><th>Database</th><th>Status</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function statusText(s) {
  return { ok: 'OK', error: 'Error', timeout: 'Timeout', loading: 'Checking…' }[s] || s;
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (!healthLoadTime || !el) return;
  const secs = Math.round((Date.now() - healthLoadTime) / 1000);
  el.textContent = secs < 5 ? 'Updated just now' : `Updated ${secs}s ago`;
}

/* ── Toast ── */
function showToast(msg, duration = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Helpers ── */
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(s) { return s.replace(/"/g, '&quot;'); }

/* ── Access Request Modal ── */

function openAccessRequest() {
  resetAccessFormState();
  document.getElementById('accessModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAccessRequest() {
  document.getElementById('accessModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('accessRequestForm').reset();
  resetAccessFormState();
}

function overlayCloseAccess(e) {
  if (e.target === document.getElementById('accessModal')) closeAccessRequest();
}

function resetAccessFormState() {
  show('arFormActions');
  hide('arFormLoading');
  hide('arFormSuccess');
  hide('arFormError');
  hide('arSystemsError');
  const btn = document.getElementById('arSubmitBtn');
  if (btn) btn.disabled = false;
}

async function submitAccessRequest(e) {
  e.preventDefault();

  const checked = document.querySelectorAll('#accessRequestForm input[name="systems"]:checked');
  if (checked.length === 0) {
    document.getElementById('arSystemsError').style.display = '';
    return;
  }
  hide('arSystemsError');

  hide('arFormActions');
  hide('arFormSuccess');
  hide('arFormError');
  show('arFormLoading');

  const formData = new FormData(document.getElementById('accessRequestForm'));

  try {
    const res = await fetch('/access-request', { method: 'POST', body: formData });
    const data = await res.json();

    hide('arFormLoading');

    if (data.success) {
      show('arFormSuccess');
      document.getElementById('arSuccessMsg').textContent = data.message;
      setTimeout(() => { closeAccessRequest(); showToast('Access request submitted successfully.'); }, 3500);
    } else {
      show('arFormActions');
      show('arFormError');
      document.getElementById('arErrorMsg').textContent = data.error || 'An unexpected error occurred.';
    }
  } catch {
    hide('arFormLoading');
    show('arFormActions');
    show('arFormError');
    document.getElementById('arErrorMsg').textContent = 'Network error — please try again.';
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  refreshHealth();
  // Auto-refresh every 60 seconds
  setInterval(refreshHealth, 60000);
  // Update "last updated" text every 10 seconds
  setInterval(updateLastUpdated, 10000);

  // Keyboard: Esc closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeReport();
      closeAccessRequest();
    }
  });
});
