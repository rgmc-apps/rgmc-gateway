'use strict';

/* ── Report Modal ── */

function openReport(siteName) {
  document.getElementById('siteNameField').value = siteName;
  document.getElementById('modalSiteName').textContent = siteName;
  resetFormState();

  const session = loadSession();
  if (session) {
    document.getElementById('employeeName').value = session.fullName  || '';
    document.getElementById('companyName').value  = session.company   || '';
    document.getElementById('department').value   = session.department || '';
    document.getElementById('emailAddr').value    = session.email     || '';
  }

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

/* ── Gate (authentication) ── */

const SESSION_KEY = 'rgmc_gateway_session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function initGate() {
  const session = loadSession();
  if (session && session.username && Array.isArray(session.systems)) {
    applySession(session);
  }
  // else: gate stays visible (default)
}

function applySession(session) {
  // 1. Filter system cards while main is still invisible (prevents flash)
  filterSystems(session.systems);

  // 2. Reveal main content
  const main = document.getElementById('mainContent');
  if (main) main.style.visibility = 'visible';

  // 3. Populate header profile dropdown
  const headerUser = document.getElementById('headerUser');
  if (headerUser) {
    const initial = escapeHtml((session.firstName || session.username).charAt(0).toUpperCase());
    const displayName = escapeHtml(session.firstName || session.username);
    const fullName = escapeHtml(session.fullName || session.username);
    const username = escapeHtml(session.username);

    const navItems = [];
    if (session.isDeveloper || session.isAdmin) {
      navItems.push(`
        <a href="/developer" class="profile-menu-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Dev Board
        </a>`);
    }
    if (session.isAdmin) {
      navItems.push(`
        <a href="/admin" class="profile-menu-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Admin Panel
        </a>`);
    }
    const navSection = navItems.length > 0
      ? `<div class="profile-menu-section">${navItems.join('')}</div><div class="profile-menu-divider"></div>`
      : '';

    headerUser.innerHTML = `
      <div class="profile-trigger" id="profileTrigger" onclick="toggleProfileMenu(event)">
        <div class="profile-avatar-sm">${initial}</div>
        <span class="profile-trigger-name">${displayName}</span>
        <svg class="profile-chevron" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="profile-menu" id="profileMenu">
        <div class="profile-menu-head">
          <div class="profile-avatar-lg">${initial}</div>
          <div class="profile-menu-info">
            <div class="profile-menu-fullname">${fullName}</div>
            <div class="profile-menu-handle">@${username}</div>
          </div>
        </div>
        <div class="profile-menu-divider"></div>
        ${navSection}
        <div class="profile-menu-section">
          <button class="profile-menu-item" onclick="openAdditionalAccess(); closeProfileMenu()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Request Additional Access
          </button>
        </div>
        <div class="profile-menu-divider"></div>
        <div class="profile-menu-section">
          <button class="profile-menu-item profile-menu-item--danger" onclick="signOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  // 4. Dismiss gate with fade
  const gate = document.getElementById('gate');
  if (gate) {
    gate.classList.add('dismissing');
    setTimeout(() => { gate.style.display = 'none'; }, 260);
  }

  // 5. Staggered entrance — section labels then cards
  // Double rAF ensures the browser paints the initial (opacity:0) state first
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let labelDelay = 0;
    document.querySelectorAll('.section:not(.health-section)').forEach(section => {
      if (section.style.display !== 'none') {
        setTimeout(() => section.querySelector('.section-label')?.classList.add('label-entered'), labelDelay);
        labelDelay += 90;
      }
    });

    let cardDelay = 60;
    document.querySelectorAll('.site-card').forEach(card => {
      if (card.style.display !== 'none') {
        setTimeout(() => card.classList.add('card-entered'), cardDelay);
        cardDelay += 52;
      }
    });
  }));

  // 6. Start health refresh (deferred until after authentication)
  refreshHealth();
  setInterval(refreshHealth, 60000);
  setInterval(updateLastUpdated, 10000);
}

function filterSystems(approvedSystems) {
  const approved = new Set((approvedSystems || []).map(s => s.toLowerCase()));

  document.querySelectorAll('.site-card').forEach(card => {
    const name = (card.querySelector('.site-card-name')?.textContent || '').trim();
    card.style.display = approved.has(name.toLowerCase()) ? '' : 'none';
  });

  // Hide entire section if it has no visible cards
  document.querySelectorAll('.section:not(.health-section)').forEach(section => {
    const hasVisible = Array.from(section.querySelectorAll('.site-card'))
      .some(c => c.style.display !== 'none');
    section.style.display = hasVisible ? '' : 'none';
  });
}

function showGateLogin() {
  hide('gateOptions');
  show('gateLogin');
  show('gateLoginActions');
  hide('gateLoading');
  hide('gateError');
  const input = document.getElementById('gateUsername');
  if (input) { input.value = ''; input.focus(); }
}

function showGateOptions() {
  hide('gateLogin');
  show('gateOptions');
}

async function signIn() {
  const username = (document.getElementById('gateUsername')?.value || '').trim();
  if (!username) {
    document.getElementById('gateError').textContent = 'Please enter your username.';
    show('gateError');
    return;
  }

  hide('gateError');
  hide('gateLoginActions');
  show('gateLoading');

  try {
    const form = new FormData();
    form.append('username', username);
    const res = await fetch('/verify-username', { method: 'POST', body: form });
    const data = await res.json();

    if (data.success) {
      const session = {
        username:   data.username,
        firstName:  data.first_name,
        fullName:   data.full_name,
        company:    data.company,
        department: data.department,
        email:      data.email,
        systems:    data.systems,
        isAdmin:       data.is_admin     || false,
        isDeveloper:   data.is_developer || false,
      };
      saveSession(session);
      applySession(session);
    } else {
      hide('gateLoading');
      show('gateLoginActions');
      document.getElementById('gateError').textContent =
        data.error || 'Username not found. Please request access.';
      show('gateError');
    }
  } catch {
    hide('gateLoading');
    show('gateLoginActions');
    document.getElementById('gateError').textContent = 'Network error — please try again.';
    show('gateError');
  }
}

function signOut() {
  clearSession();
  location.reload();
}

function toggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const trigger = document.getElementById('profileTrigger');
  const menu = document.getElementById('profileMenu');
  if (!trigger || !menu) return;
  if (menu.classList.contains('open')) {
    closeProfileMenu();
  } else {
    trigger.classList.add('open');
    menu.classList.add('open');
  }
}

function closeProfileMenu() {
  document.getElementById('profileTrigger')?.classList.remove('open');
  document.getElementById('profileMenu')?.classList.remove('open');
}

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

/* ── Additional Access Modal ── */

function openAdditionalAccess() {
  const session = loadSession();
  if (!session) return;

  const approved = new Set((session.systems || []).map(s => s.toLowerCase()));
  const available = (typeof ALL_SITES !== 'undefined' ? ALL_SITES : [])
    .filter(s => !approved.has((s.name || s).toLowerCase()));

  if (available.length === 0) {
    showToast('You already have access to all available systems.');
    return;
  }

  const grid = document.getElementById('additionalGrid');
  grid.innerHTML = available.map(s => {
    const name = s.name || s;
    return `
    <label class="check-item">
      <input type="checkbox" name="systems" value="${escapeAttr(name)}">
      <span>${escapeHtml(name)}</span>
    </label>`;
  }).join('');

  resetAdditionalFormState();
  document.getElementById('additionalModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAdditionalAccess() {
  document.getElementById('additionalModal').classList.remove('open');
  document.body.style.overflow = '';
  resetAdditionalFormState();
}

function overlayCloseAdditional(e) {
  if (e.target === document.getElementById('additionalModal')) closeAdditionalAccess();
}

function resetAdditionalFormState() {
  show('addlFormActions');
  hide('addlFormLoading');
  hide('addlFormSuccess');
  hide('addlFormError');
  hide('additionalSystemsError');
}

async function submitAdditionalAccess(e) {
  e.preventDefault();

  const checked = document.querySelectorAll('#additionalForm input[name="systems"]:checked');
  if (checked.length === 0) {
    document.getElementById('additionalSystemsError').style.display = '';
    return;
  }
  hide('additionalSystemsError');

  hide('addlFormActions');
  hide('addlFormSuccess');
  hide('addlFormError');
  show('addlFormLoading');

  const session = loadSession();
  const formData = new FormData();
  formData.append('username', session?.username || '');
  checked.forEach(cb => formData.append('systems', cb.value));

  try {
    const res = await fetch('/access-request/additional', { method: 'POST', body: formData });
    const data = await res.json();

    hide('addlFormLoading');

    if (data.success) {
      show('addlFormSuccess');
      document.getElementById('addlSuccessMsg').textContent = data.message;
      setTimeout(() => { closeAdditionalAccess(); showToast('Additional access request submitted.'); }, 3500);
    } else {
      show('addlFormActions');
      show('addlFormError');
      document.getElementById('addlErrorMsg').textContent = data.error || 'An unexpected error occurred.';
    }
  } catch {
    hide('addlFormLoading');
    show('addlFormActions');
    show('addlFormError');
    document.getElementById('addlErrorMsg').textContent = 'Network error — please try again.';
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Check for existing session — shows gate or restores portal
  initGate();

  // Enter key in gate username field
  document.getElementById('gateUsername')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') signIn();
  });

  // Keyboard: Esc closes modals and profile menu
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeReport();
      closeAccessRequest();
      closeAdditionalAccess();
      closeProfileMenu();
    }
  });

  // Click outside closes profile menu
  document.addEventListener('click', () => closeProfileMenu());
});
