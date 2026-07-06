'use strict';

/* ── Report Modal ── */

const _MODAL_PRIORITY_INFO = {
  P1: { color: '#D85858', desc: 'Severe impact — system down or entire company affected. Immediate response required.' },
  P2: { color: '#E8873A', desc: 'Significant impact — department or team affected. Urgent attention needed.' },
  P3: { color: '#D49632', desc: 'Moderate impact — single user or minor workflow disruption. Prompt action needed.' },
  P4: { color: '#52A870', desc: 'Minimal impact — cosmetic issue or minor inconvenience. No immediate urgency.' },
};

function updateModalPriorityHint() {
  const sel  = document.getElementById('modalPriority');
  const hint = document.getElementById('modalPriorityHint');
  if (!hint) return;
  const info = _MODAL_PRIORITY_INFO[sel.value];
  hint.innerHTML = info
    ? `<span class="ri-prio-dot" style="background:${info.color}"></span><span>${info.desc}</span>`
    : '';
}

async function _loadModalCategories() {
  const sel = document.getElementById('modalCategory');
  if (!sel) return;
  try {
    const res  = await fetch('/api/helpdesk/categories');
    const cats = await res.json();
    sel.innerHTML = '';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.category_name;
      opt.textContent = c.category_name;
      sel.appendChild(opt);
    });
    const sw = [...sel.options].find(o => o.value === 'Software/Application');
    if (sw) sw.selected = true;
    else if (sel.options.length) sel.options[0].selected = true;
  } catch {
    sel.innerHTML = '<option value="Software/Application">Software/Application</option>';
  }
}

function openModalPayloadHelp() {
  document.getElementById('modalPayloadHelpOverlay').classList.add('open');
}

function closeModalPayloadHelp() {
  document.getElementById('modalPayloadHelpOverlay').classList.remove('open');
}

function openReport(siteName) {
  document.getElementById('siteNameField').value = siteName;
  document.getElementById('modalSiteName').textContent = siteName;
  resetFormState();

  const session = loadSession();
  if (session) {
    document.getElementById('employeeName').value = session.fullName   || '';
    document.getElementById('department').value   = session.department || '';
    document.getElementById('emailAddr').value    = session.email      || '';
    const cSel = document.getElementById('companyName');
    if (cSel && session.company) _selectCompanyOption(cSel, session.company);
  }

  document.getElementById('modalPriority').value = 'P4';
  updateModalPriorityHint();

  document.getElementById('reportModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('open');
  document.getElementById('modalPayloadHelpOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('reportForm').reset();
  document.getElementById('fileLabel').textContent = 'Click to attach screenshots or drag & drop';
  document.getElementById('modalPriorityHint').innerHTML = '';
  const otherWrap = document.getElementById('department-other-wrap');
  if (otherWrap) otherWrap.style.display = 'none';
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

  // Limit to 5 attachments
  const fileInput = document.getElementById('attachments');
  const files = Array.from(fileInput.files).slice(0, 5);
  formData.delete('attachments');
  files.forEach(f => formData.append('attachments', f));

  // Resolve "Others" department — saves new entry to DB if needed
  const resolvedDept = await deptOtherResolve('department', 'department-other-input');
  formData.set('department', resolvedDept);

  try {
    const res = await fetch('/api/issues', { method: 'POST', body: formData });
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
    label.textContent = 'Click to attach files or drag & drop';
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
  if (ep.connections) return renderConnections(ep);

  let detail = '';
  if (ep.error) {
    detail = `<div class="health-ep-error">${escapeHtml(ep.error)}</div>`;
  } else if (ep.response !== undefined) {
    const rendered    = renderJsonValue(ep.response);
    const lineCount   = (rendered.match(/\n/g) || []).length + 1;
    const needsToggle = lineCount > 7;
    const uid         = 'hj' + Math.random().toString(36).slice(2, 8);
    detail = `
      <div class="health-json-wrap">
        <pre class="health-json${needsToggle ? ' health-json--collapsed' : ''}" id="${uid}">${rendered}</pre>
        ${needsToggle ? `<button class="health-json-toggle" onclick="toggleHealthJson('${uid}',this)">Show more</button>` : ''}
      </div>`;
  }

  return `
    <div class="status-row">
      <div class="status-dot ${ep.status}"></div>
      <span class="status-label">${escapeHtml(ep.label)}</span>
      <span class="status-badge ${ep.status}">${statusText(ep.status)}</span>
    </div>
    ${detail}`;
}

function renderJsonValue(val, depth) {
  depth = depth || 0;
  if (val === null)             return '<span class="json-null">null</span>';
  if (typeof val === 'boolean') return `<span class="json-bool">${val}</span>`;
  if (typeof val === 'number')  return `<span class="json-num">${val}</span>`;
  if (typeof val === 'string')  return `<span class="json-str">&quot;${escapeHtml(val)}&quot;</span>`;
  if (Array.isArray(val)) {
    if (!val.length) return '[]';
    const pad   = '  '.repeat(depth + 1);
    const close = '  '.repeat(depth);
    return `[\n${val.map(v => pad + renderJsonValue(v, depth + 1)).join(',\n')}\n${close}]`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (!keys.length) return '{}';
    const pad   = '  '.repeat(depth + 1);
    const close = '  '.repeat(depth);
    return `{\n${keys.map(k =>
      `${pad}<span class="json-key">&quot;${escapeHtml(k)}&quot;</span>: ${renderJsonValue(val[k], depth + 1)}`
    ).join(',\n')}\n${close}}`;
  }
  return escapeHtml(String(val));
}

function toggleHealthJson(id, btn) {
  const pre = document.getElementById(id);
  if (!pre) return;
  const collapsed = pre.classList.toggle('health-json--collapsed');
  btn.textContent = collapsed ? 'Show more' : 'Show less';
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

  // 2. Reveal main content; restore saved view mode before paint
  const main = document.getElementById('mainContent');
  if (main) {
    const savedView = localStorage.getItem(VIEW_KEY) || 'compact';
    if (savedView === 'compact') {
      const approvedSet = new Set((session.systems || []).map(s => s.toLowerCase()));
      buildCompactTables(approvedSet);
      main.classList.add('is-compact');
      document.getElementById('vswCards')?.classList.remove('active');
      document.getElementById('vswCompact')?.classList.add('active');
    }
    main.style.visibility = 'visible';
  }

  // 3. Populate header profile dropdown
  const headerUser = document.getElementById('headerUser');
  if (headerUser) {
    const initial     = escapeHtml((session.firstName || session.username).charAt(0).toUpperCase());
    const displayName = escapeHtml(session.displayName || session.firstName || session.username);
    const fullName    = escapeHtml(session.fullName || session.username);
    const username    = escapeHtml(session.username);
    const av          = session.avatarUrl && (session.avatarUrl.startsWith('data:') || session.avatarUrl.startsWith('https://')) ? session.avatarUrl : '';

    const avatarSmHtml = av
      ? `<div class="profile-avatar-sm"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
      : `<div class="profile-avatar-sm">${initial}</div>`;
    const avatarLgHtml = av
      ? `<div class="profile-avatar-lg"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
      : `<div class="profile-avatar-lg">${initial}</div>`;

    const navItems = [
      `<a href="/profile" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        My Profile
      </a>`,
      `<a href="/helpdesk" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        IT Helpdesk
      </a>`,
      `<a href="/general-helpdesk" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        General Helpdesk
      </a>`,
      `<a href="/workspace" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        My Workspace
      </a>`,
    ];
    if (session.isDeveloper || session.isAdmin) {
      navItems.push(`
        <a href="/developer" class="profile-menu-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Dev Board
        </a>`);
    }
    if (session.isAdmin || session.isManagement) {
      navItems.push(`
        <a href="/tasks" class="profile-menu-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Tasks Board
        </a>`);
    }
    if (session.isAdmin || session.isManagement) {
      navItems.push(`
        <a href="/admin" class="profile-menu-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Admin Panel
        </a>`);
    }

    headerUser.innerHTML = `
      <div class="profile-trigger" id="profileTrigger" onclick="toggleProfileMenu(event)">
        ${avatarSmHtml}
        <span class="profile-trigger-name">${displayName}</span>
        <svg class="profile-chevron" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="profile-menu" id="profileMenu">
        <div class="profile-menu-head">
          ${avatarLgHtml}
          <div class="profile-menu-info">
            <div class="profile-menu-fullname">${fullName}</div>
            <div class="profile-menu-handle">@${username}</div>
          </div>
        </div>
        <div class="profile-menu-divider"></div>
        <div class="profile-menu-section">${navItems.join('')}</div>
        <div class="profile-menu-divider"></div>
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
        username:    data.username,
        firstName:   data.first_name,
        fullName:    data.full_name,
        displayName: data.display_name || '',
        avatarUrl:   data.avatar_url   || '',
        company:     data.company,
        department:  data.department,
        email:       data.email,
        systems:     data.systems,
        isAdmin:           data.is_admin           || false,
        isDeveloper:       data.is_developer       || false,
        isManagement:      data.is_management      || false,
        isDepartmentHead:  data.is_department_head || false,
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

/* ── Companies dropdown ── */

async function _loadCompanies() {
  try {
    const res = await fetch('/api/companies');
    return await res.json();
  } catch { return []; }
}

function _buildCompanyOptions(companies) {
  return companies.map(c =>
    `<option value="${c.name}">${c.company_code} — ${c.name}</option>`
  ).join('');
}

function _selectCompanyOption(sel, value) {
  for (const opt of sel.options) {
    if (opt.value === value) { sel.value = value; return; }
  }
}

/* ── Departments dropdown ── */

async function _loadDepartments() {
  try {
    const res = await fetch('/api/departments');
    const depts = await res.json();
    const opts = depts.map(d =>
      `<option value="${d.department_name}">${d.department_code} — ${d.department_name}</option>`
    ).join('');
    ['department', 'arDepartment'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.insertAdjacentHTML('beforeend', opts);
    });
    // Pre-fill from session
    const session = loadSession();
    if (session?.department) {
      ['department', 'arDepartment'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.value = session.department;
      });
    }
    // Wire "Others" option for the report modal department select
    deptOtherInit('department', 'department-other-input', 'department-other-wrap');
  } catch { /* non-fatal */ }
}

/* ── View Toggle (Cards / Compact) ── */
const VIEW_KEY = 'rgmc-view-mode';
let _compactBuilt = false;

function buildCompactTables(approvedSet) {
  const allSites = typeof ALL_SITES !== 'undefined' ? ALL_SITES : [];
  const svgExt  = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const svgWarn = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const svgWin  = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5L10.5 4v7H3z"/><path d="M21 3.5L10.5 5v6H21z"/><path d="M3 18.5L10.5 20V13H3z"/><path d="M21 20.5L10.5 19V13H21z"/></svg>`;
  const svgFile = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;

  document.querySelectorAll('.section:not(.health-section)').forEach(section => {
    if (section.querySelector('.systems-table-wrap')) return;

    const badge = (section.querySelector('.label-badge')?.textContent || '').trim().toUpperCase();

    let sites, isWindows = false, isTask = false, headers;

    if (badge === 'WIN') {
      sites = allSites.filter(s => s.is_windows_based && !s.is_task);
      isWindows = true;
      headers = '<th>App</th><th>Launcher</th><th>Manifest</th><th></th>';
    } else if (badge === 'TASK') {
      sites = allSites.filter(s => s.is_task);
      isTask = true;
      headers = '<th>Tool</th><th>Link</th><th></th><th></th>';
    } else {
      const catMap = { RGMC: 'RGMC', SBIC: 'SBIC', NAV: 'NAV Sites' };
      const catKey = catMap[badge] || badge;
      sites = allSites.filter(s => s.category === catKey && !s.is_windows_based && !s.is_task);
      headers = '<th>System</th><th>Primary Link</th><th>Backup</th><th></th>';
    }

    const rows = sites.map(site => {
      const visible  = !approvedSet || approvedSet.has((site.name || '').toLowerCase());
      const name     = escapeHtml(site.name || '');
      const safeCall = escapeAttr((site.name || '').replace(/'/g, "\\'"));

      let col2, col3;
      if (isWindows) {
        col2 = site.windows_launcher_url
          ? `<a href="${escapeAttr(site.windows_launcher_url)}" download class="st-link st-win-launch">${svgWin} Launcher</a>`
          : `<span class="st-none">—</span>`;
        col3 = site.windows_manifest_url
          ? `<a href="${escapeAttr(site.windows_manifest_url)}" download class="st-link st-win-manifest">${svgFile} Manifest</a>`
          : `<span class="st-none">—</span>`;
      } else {
        col2 = site.primary_url
          ? `<a href="${escapeAttr(site.primary_url)}" target="_blank" rel="noopener" class="st-link st-primary">${svgExt} ${escapeHtml(site.primary_label || 'Open')}</a>`
          : `<span class="st-none">—</span>`;
        col3 = site.backup_url
          ? `<a href="${escapeAttr(site.backup_url)}" target="_blank" rel="noopener" class="st-link st-backup">${svgExt} ${escapeHtml(site.backup_label || 'Backup')}</a>`
          : `<span class="st-none">—</span>`;
      }

      return `<tr class="st-row" data-approved="${visible}"${visible ? '' : ' style="display:none"'}>
        <td class="st-name">${name}</td>
        <td>${col2}</td>
        <td>${col3}</td>
        <td class="st-actions"><button class="btn btn-report" onclick="openReport('${safeCall}')">${svgWarn} Report</button></td>
      </tr>`;
    }).join('');

    const wrap = document.createElement('div');
    wrap.className = 'systems-table-wrap';
    wrap.innerHTML = `<table class="systems-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    section.querySelector('.systems-grid')?.after(wrap);
  });

  _compactBuilt = true;
}

function filterCompact(query) {
  const q = (query || '').trim().toLowerCase();
  document.querySelectorAll('.section:not(.health-section)').forEach(section => {
    const rows = section.querySelectorAll('.st-row');
    if (!rows.length) return;
    let visibleCount = 0;
    rows.forEach(row => {
      if (row.dataset.approved === 'false') return;
      const name  = (row.querySelector('.st-name')?.textContent || '').toLowerCase();
      const match = !q || name.includes(q);
      row.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });
    section.style.display = (visibleCount === 0 && q) ? 'none' : '';
  });
}

function setViewMode(mode) {
  const main = document.getElementById('mainContent');
  if (!main) return;

  if (mode === 'compact') {
    if (!_compactBuilt) {
      const session = loadSession();
      const approvedSet = session?.systems ? new Set(session.systems.map(s => s.toLowerCase())) : null;
      buildCompactTables(approvedSet);
    }
    main.classList.add('is-compact');
    document.getElementById('vswCards')?.classList.remove('active');
    document.getElementById('vswCompact')?.classList.add('active');
  } else {
    const searchInput = document.getElementById('compactSearchInput');
    if (searchInput) { searchInput.value = ''; filterCompact(''); }
    main.classList.remove('is-compact');
    document.getElementById('vswCards')?.classList.add('active');
    document.getElementById('vswCompact')?.classList.remove('active');
  }

  localStorage.setItem(VIEW_KEY, mode);
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Check for existing session — shows gate or restores portal
  initGate();

  // Populate all company dropdowns
  _loadCompanies().then(companies => {
    const opts = _buildCompanyOptions(companies);
    ['companyName', 'arCompany'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.insertAdjacentHTML('beforeend', opts);
    });
    // Auto-select for report modal if session already loaded
    const session = loadSession();
    if (session?.company) {
      const cSel = document.getElementById('companyName');
      if (cSel) _selectCompanyOption(cSel, session.company);
    }
  });

  // Populate department dropdowns
  _loadDepartments();

  // Populate category dropdown in report modal
  _loadModalCategories();

  // User search autocomplete on name field
  initUserSearch('employeeName', {
    email:      'emailAddr',
    viber:      'modalViberNumber',
    company:    'companyName',
    department: 'department',
  });

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
