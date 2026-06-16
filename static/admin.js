'use strict';

/* ── Session helpers (mirrors script.js) ── */
const SESSION_KEY = 'rgmc_gateway_session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function adminSignOut() {
  clearSession();
  location.href = '/';
}

function authHeaders() {
  const s = loadSession();
  return { 'X-Gateway-Username': s?.username || '' };
}

/* ── Toast ── */
function showToast(msg, duration = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Helpers ── */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── State ── */
let currentTab          = 'requests';
let currentStatus       = 'pending';
let _requestsCache      = [];
let _rejectingId        = null;
let _usersCache         = [];
let _systemsCache       = [];
let _editingUserSystems = null;
let _issuesCache        = [];
let _currentIssueStatus = 'open';
let _editingIssueId     = null;
let _developersCache    = [];
let _devPerfCache       = [];
let _devPerfSelected    = null;

/* ── Profile dropdown ── */
function toggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const trigger = document.getElementById('profileTrigger');
  const menu    = document.getElementById('profileMenu');
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

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || !session.isAdmin) {
    location.href = '/';
    return;
  }

  // Build profile dropdown
  const container = document.getElementById('adminHeaderUser');
  if (container) {
    const initial     = escHtml((session.firstName || session.username).charAt(0).toUpperCase());
    const displayName = escHtml(session.displayName || session.firstName || session.username);
    const fullName    = escHtml(session.fullName  || session.username);
    const username    = escHtml(session.username);
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
      `<a href="/" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Portal
      </a>`,
      `<a href="/developer" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Dev Board
      </a>`,
    ];

    container.innerHTML = `
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
          <button class="profile-menu-item profile-menu-item--danger" onclick="adminSignOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  loadRequests('pending');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSystemModal(); closeRejectModal(); closeEditSystemsModal(); closeIssueModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', () => closeProfileMenu());

  // Show/hide resolution fields when status changes
  document.getElementById('issueStatusSelect').addEventListener('change', function () {
    _toggleIssueResolution(this.value);
    // Auto-fill resolved_by from the selected assignee when switching to a terminal status
    if (this.value === 'resolved' || this.value === 'closed') {
      const resolvedByInput = document.getElementById('issueResolvedBy');
      if (!resolvedByInput.value.trim()) {
        const sel = document.getElementById('issueAssignedTo');
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.value) {
          const label = opt.textContent.trim().replace(/\s*\(@[^)]+\)\s*$/, '').trim();
          resolvedByInput.value = label;
        }
      }
    }
  });
});

/* ── Tab switching ── */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));

  if (tab === 'requests') loadRequests(currentStatus);
  if (tab === 'users')    loadUsers();
  if (tab === 'systems')  loadSystems();
  if (tab === 'issues')   loadIssues(_currentIssueStatus);
  if (tab === 'devperf')  loadDevPerf();
}

function switchStatus(status) {
  currentStatus = status;
  document.querySelectorAll('.status-tab').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  loadRequests(status);
}

/* ── Requests ── */
async function loadRequests(status) {
  const wrap = document.getElementById('requests-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';

  try {
    const res = await fetch(`/api/admin/requests?status=${status}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    _requestsCache = rows;

    // Update pending badge
    if (status === 'pending') {
      const badge = document.getElementById('pendingCount');
      badge.textContent = rows.length || '';
      badge.style.display = rows.length ? '' : 'none';
    }

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="admin-empty">No ${status} requests.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Department</th>
            <th>Position</th>
            <th>Email</th>
            <th>Systems</th>
            ${status === 'approved' ? '<th>Username</th>' : ''}
            <th>${status === 'pending' ? 'Requested' : status === 'approved' ? 'Approved' : 'Rejected'}</th>
            ${status === 'rejected' ? '<th>Reason</th>' : ''}
            ${status === 'pending'  ? '<th>Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => renderRequestRow(r, status)).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load requests: ${escHtml(err.message)}</div>`;
  }
}

function renderRequestRow(r, status) {
  const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
  const name = `${escHtml(r.first_name)}${escHtml(mi)} ${escHtml(r.last_name)}`;
  const systems = (r.systems || []).map(s => `<span class="sys-pill">${escHtml(s)}</span>`).join('');
  const date = status === 'pending' ? fmtDateTime(r.created_at) : fmtDateTime(r.processed_at);
  const usernameCol  = status === 'approved' ? `<td><code class="mono-val">${escHtml(r.username || '—')}</code></td>` : '';
  const remarkCol    = status === 'rejected'
    ? `<td class="date-cell">${r.rejection_remarks ? escHtml(r.rejection_remarks) : '<span class="text-muted">—</span>'}</td>` : '';
  const actionCol    = status === 'pending'
    ? `<td class="action-cell">
        <button class="btn-tbl-approve" onclick="approveRequest('${r.id}')">Approve</button>
        <button class="btn-tbl-danger"  onclick="openRejectModal('${r.id}')">Reject</button>
       </td>` : '';
  return `<tr>
    <td><span class="user-name">${name}</span></td>
    <td>${escHtml(r.company)}</td>
    <td>${escHtml(r.department)}</td>
    <td>${escHtml(r.position)}</td>
    <td><a href="mailto:${escHtml(r.email)}" class="tbl-link">${escHtml(r.email)}</a></td>
    <td><div class="sys-pills">${systems || '—'}</div></td>
    ${usernameCol}
    <td class="date-cell">${date}</td>
    ${remarkCol}
    ${actionCol}
  </tr>`;
}

/* ── Request actions (approve / reject) ── */

async function approveRequest(id) {
  const r = _requestsCache.find(x => x.id === id);
  const name = r ? `${r.first_name} ${r.last_name}`.trim() : id;
  if (!confirm(`Approve the access request from ${name}?\n\nThis will generate a username and send a notification email.`)) return;

  try {
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST', headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Approval failed');
    showToast(`Request approved. Username: ${data.username || '—'}`);
    loadRequests(currentStatus);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function openRejectModal(id) {
  const r = _requestsCache.find(x => x.id === id);
  if (!r) return;
  _rejectingId = id;
  const name = `${r.first_name} ${r.last_name}`.trim();
  document.getElementById('rejectModalName').textContent = name;
  document.getElementById('rejectSystems').textContent = (r.systems || []).join(', ') || '—';
  document.getElementById('rejectRemarks').value = '';
  resetRejectModal();
  document.getElementById('rejectModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('rejectRemarks').focus(), 60);
}

function closeRejectModal() {
  document.getElementById('rejectModal').classList.remove('open');
  document.body.style.overflow = '';
  _rejectingId = null;
}

function overlayCloseReject(e) {
  if (e.target === document.getElementById('rejectModal')) closeRejectModal();
}

function resetRejectModal() {
  document.getElementById('rejectFormActions').style.display = '';
  document.getElementById('rejectFormLoading').style.display = 'none';
  document.getElementById('rejectFormError').style.display   = 'none';
}

async function confirmReject() {
  if (!_rejectingId) return;
  const remarks = document.getElementById('rejectRemarks').value.trim() || null;

  document.getElementById('rejectFormActions').style.display = 'none';
  document.getElementById('rejectFormLoading').style.display = '';
  document.getElementById('rejectFormError').style.display   = 'none';

  try {
    const res = await fetch(`/api/admin/requests/${encodeURIComponent(_rejectingId)}/reject`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ remarks }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rejection failed');
    closeRejectModal();
    showToast('Request rejected. Notification sent to user.');
    loadRequests(currentStatus);
  } catch (err) {
    document.getElementById('rejectFormLoading').style.display = 'none';
    document.getElementById('rejectFormActions').style.display = '';
    document.getElementById('rejectFormError').style.display   = '';
    document.getElementById('rejectErrorMsg').textContent = err.message;
  }
}

/* ── Users ── */
async function loadUsers() {
  const wrap = document.getElementById('users-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';

  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    _usersCache = rows;

    if (rows.length === 0) {
      wrap.innerHTML = '<div class="admin-empty">No users found. Run the migration SQL to seed users from existing approved requests.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Name</th>
            <th>Company</th>
            <th>Department</th>
            <th>Email</th>
            <th>Systems</th>
            <th>Admin</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(u => renderUserRow(u)).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load users: ${escHtml(err.message)}</div>`;
  }
}

function renderUserRow(u) {
  const name    = `${escHtml(u.first_name)} ${escHtml(u.last_name)}`.trim();
  const systems = (u.systems || []).length;
  const adminBadge = u.is_admin
    ? '<span class="badge-admin">Admin</span>'
    : '<span class="badge-user">User</span>';
  const devBadge = u.is_developer
    ? '<span class="badge-dev">Dev</span>'
    : '';
  const toggleAdminLabel = u.is_admin ? 'Revoke Admin' : 'Make Admin';
  const toggleDevLabel   = u.is_developer ? 'Revoke Dev' : 'Make Dev';

  return `<tr id="user-row-${escHtml(u.username)}">
    <td><code class="mono-val">${escHtml(u.username)}</code></td>
    <td><span class="user-name">${name || '—'}</span></td>
    <td>${escHtml(u.company)}</td>
    <td>${escHtml(u.department)}</td>
    <td><a href="mailto:${escHtml(u.email)}" class="tbl-link">${escHtml(u.email)}</a></td>
    <td><span class="systems-count">${systems} system${systems !== 1 ? 's' : ''}</span></td>
    <td>${adminBadge} ${devBadge}</td>
    <td class="date-cell">${fmtDate(u.created_at)}</td>
    <td class="action-cell">
      <button class="btn-tbl-secondary" onclick="openEditSystemsModal('${escHtml(u.username)}')">Edit Systems</button>
      <button class="btn-tbl-secondary" onclick="toggleAdmin('${escHtml(u.username)}', ${u.is_admin})">${toggleAdminLabel}</button>
      <button class="btn-tbl-secondary" onclick="toggleDeveloper('${escHtml(u.username)}', ${u.is_developer})">${toggleDevLabel}</button>
      <button class="btn-tbl-danger" onclick="deleteUser('${escHtml(u.username)}')">Delete</button>
    </td>
  </tr>`;
}

async function toggleAdmin(username, currentIsAdmin) {
  const newVal = !currentIsAdmin;
  const label  = newVal ? 'grant admin to' : 'revoke admin from';
  if (!confirm(`Are you sure you want to ${label} "${username}"?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_admin: newVal }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`Admin ${newVal ? 'granted to' : 'revoked from'} ${username}`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function toggleDeveloper(username, currentIsDev) {
  const newVal = !currentIsDev;
  const label  = newVal ? 'grant developer access to' : 'revoke developer access from';
  if (!confirm(`Are you sure you want to ${label} "${username}"?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_developer: newVal }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`Developer access ${newVal ? 'granted to' : 'revoked from'} ${username}`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone. They will lose portal access.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`User ${username} deleted`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Systems ── */
let _editingSystemId = null;

async function loadSystems() {
  const wrap = document.getElementById('systems-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';

  try {
    const res = await fetch('/api/admin/systems', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    _systemsCache = rows;

    if (rows.length === 0) {
      wrap.innerHTML = '<div class="admin-empty">No systems found. Add one above.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Visible</th>
            <th>Primary URL</th>
            <th>Label</th>
            <th>Backup URL</th>
            <th>Backup Label</th>
            <th>Order</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(s => renderSystemRow(s)).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load systems: ${escHtml(err.message)}</div>`;
  }
}

function renderSystemRow(s) {
  const catClass = { RGMC: 'label-rgmc', SBIC: 'label-sbic', 'NAV Sites': 'label-nav' }[s.category] || 'label-rgmc';
  const visibleBadge = s.is_visible !== false
    ? '<span class="badge-visible">Visible</span>'
    : '<span class="badge-hidden">Hidden</span>';
  return `<tr>
    <td><span class="user-name">${escHtml(s.name)}</span></td>
    <td><span class="label-badge ${catClass}">${escHtml(s.category)}</span></td>
    <td>${visibleBadge}</td>
    <td><a href="${escHtml(s.primary_url)}" target="_blank" rel="noopener" class="tbl-link url-cell" title="${escHtml(s.primary_url)}">${escHtml(truncUrl(s.primary_url))}</a></td>
    <td>${escHtml(s.primary_label)}</td>
    <td>${s.backup_url ? `<a href="${escHtml(s.backup_url)}" target="_blank" rel="noopener" class="tbl-link url-cell" title="${escHtml(s.backup_url)}">${escHtml(truncUrl(s.backup_url))}</a>` : '<span class="text-muted">—</span>'}</td>
    <td>${escHtml(s.backup_label || '—')}</td>
    <td class="date-cell">${s.sort_order}</td>
    <td class="action-cell">
      <button class="btn-tbl-secondary" onclick='openSystemModal(${JSON.stringify(s)})'>Edit</button>
      <button class="btn-tbl-danger" onclick="deleteSystem('${escHtml(s.id)}')">Delete</button>
    </td>
  </tr>`;
}

function truncUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 18) + '…' : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 40 ? url.slice(0, 38) + '…' : url;
  }
}

function openSystemModal(system) {
  _editingSystemId = system ? system.id : null;
  document.getElementById('systemModalTitle').textContent = system ? 'Edit System' : 'Add System';

  const idField = document.getElementById('sysId');
  idField.value    = system?.id            ?? '';
  idField.disabled = !!system;             // ID is immutable after creation

  document.getElementById('sysName').value         = system?.name          ?? '';
  document.getElementById('sysCategory').value     = system?.category      ?? 'RGMC';
  document.getElementById('sysPrimaryUrl').value   = system?.primary_url   ?? '';
  document.getElementById('sysPrimaryLabel').value = system?.primary_label ?? 'Open';
  document.getElementById('sysBackupUrl').value    = system?.backup_url    ?? '';
  document.getElementById('sysBackupLabel').value  = system?.backup_label  ?? '';
  document.getElementById('sysSortOrder').value    = system?.sort_order    ?? 0;
  document.getElementById('sysIsVisible').checked  = system ? (system.is_visible !== false) : true;

  resetSysForm();
  document.getElementById('systemModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSystemModal() {
  document.getElementById('systemModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingSystemId = null;
}

function overlayCloseSystem(e) {
  if (e.target === document.getElementById('systemModal')) closeSystemModal();
}

function resetSysForm() {
  document.getElementById('sysFormActions').style.display = '';
  document.getElementById('sysFormLoading').style.display = 'none';
  document.getElementById('sysFormError').style.display   = 'none';
  document.getElementById('sysSubmitBtn').disabled = false;
}

async function saveSystem(e) {
  e.preventDefault();

  const id          = document.getElementById('sysId').value.trim();
  const name        = document.getElementById('sysName').value.trim();
  const category    = document.getElementById('sysCategory').value;
  const primaryUrl  = document.getElementById('sysPrimaryUrl').value.trim();
  const primaryLabel= document.getElementById('sysPrimaryLabel').value.trim();
  const backupUrl   = document.getElementById('sysBackupUrl').value.trim() || null;
  const backupLabel = document.getElementById('sysBackupLabel').value.trim() || null;
  const sortOrder   = parseInt(document.getElementById('sysSortOrder').value, 10) || 0;
  const isVisible   = document.getElementById('sysIsVisible').checked;

  if (!_editingSystemId && !id) {
    showSysError('System ID is required.');
    return;
  }
  if (!name || !primaryUrl || !primaryLabel) {
    showSysError('Name, Primary URL, and Primary Label are required.');
    return;
  }

  document.getElementById('sysFormActions').style.display = 'none';
  document.getElementById('sysFormLoading').style.display = '';

  try {
    let res;
    if (_editingSystemId) {
      res = await fetch(`/api/admin/systems/${encodeURIComponent(_editingSystemId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, category, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder, is_visible: isVisible }),
      });
    } else {
      res = await fetch('/api/admin/systems', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, name, category, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder, is_visible: isVisible }),
      });
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    closeSystemModal();
    showToast(`System ${_editingSystemId ? 'updated' : 'added'} successfully.`);
    loadSystems();
  } catch (err) {
    document.getElementById('sysFormLoading').style.display = 'none';
    document.getElementById('sysFormActions').style.display = '';
    showSysError(err.message);
  }
}

function showSysError(msg) {
  document.getElementById('sysFormError').style.display = '';
  document.getElementById('sysErrorMsg').textContent = msg;
}

async function deleteSystem(id) {
  if (!confirm(`Delete system "${id}"? Users will lose access to it on next sign-in.`)) return;
  try {
    const res = await fetch(`/api/admin/systems/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`System "${id}" deleted.`);
    loadSystems();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Edit User Systems modal ── */

async function openEditSystemsModal(username) {
  const user = _usersCache.find(u => u.username === username);
  if (!user) return;
  _editingUserSystems = username;

  document.getElementById('editSystemsUser').textContent = `${user.first_name} ${user.last_name}`.trim() || username;

  // Ensure systems cache is populated
  if (_systemsCache.length === 0) {
    try {
      const res = await fetch('/api/admin/systems', { headers: authHeaders() });
      if (res.ok) _systemsCache = await res.json();
    } catch { /* non-fatal — grid will be empty */ }
  }

  renderEditSystemsGrid(user.systems || []);
  resetEditSystemsModal();
  document.getElementById('editSystemsModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEditSystemsModal() {
  document.getElementById('editSystemsModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingUserSystems = null;
}

function overlayCloseEditSystems(e) {
  if (e.target === document.getElementById('editSystemsModal')) closeEditSystemsModal();
}

function resetEditSystemsModal() {
  document.getElementById('editSystemsActions').style.display = '';
  document.getElementById('editSystemsLoading').style.display = 'none';
  document.getElementById('editSystemsError').style.display   = 'none';
}

function renderEditSystemsGrid(currentSystems) {
  const grid = document.getElementById('editSystemsGrid');
  const checked = new Set(currentSystems);

  const categories = ['RGMC', 'SBIC', 'NAV Sites'];
  const grouped = {};
  categories.forEach(c => { grouped[c] = []; });
  _systemsCache.forEach(s => {
    if (grouped[s.category]) grouped[s.category].push(s);
    else grouped['RGMC'].push(s);
  });

  let html = '';
  categories.forEach(cat => {
    const systems = grouped[cat];
    if (!systems.length) return;
    html += `<div class="edit-systems-group">
      <div class="edit-systems-cat-label">${escHtml(cat)}</div>
      <div class="edit-systems-checks">
        ${systems.map(s => `
          <label class="edit-systems-item">
            <input type="checkbox" name="sys" value="${escHtml(s.name)}" ${checked.has(s.name) ? 'checked' : ''}>
            <span>${escHtml(s.name)}</span>
          </label>`).join('')}
      </div>
    </div>`;
  });

  grid.innerHTML = html || '<p class="text-muted">No systems defined yet.</p>';
}

async function saveUserSystems() {
  if (!_editingUserSystems) return;

  const checkboxes = document.querySelectorAll('#editSystemsGrid input[name="sys"]');
  const systems = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

  document.getElementById('editSystemsActions').style.display = 'none';
  document.getElementById('editSystemsLoading').style.display = '';
  document.getElementById('editSystemsError').style.display   = 'none';

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(_editingUserSystems)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ systems }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    closeEditSystemsModal();
    showToast(`Systems updated for ${_editingUserSystems}.`);
    loadUsers();
  } catch (err) {
    document.getElementById('editSystemsLoading').style.display = 'none';
    document.getElementById('editSystemsActions').style.display = '';
    document.getElementById('editSystemsError').style.display   = '';
    document.getElementById('editSystemsErrorMsg').textContent  = err.message;
  }
}

/* ── Issues ── */

function switchIssueStatus(status) {
  _currentIssueStatus = status;
  document.querySelectorAll('#issueStatusTabs .status-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.istatus === status)
  );
  loadIssues(status);
}

const ISSUE_STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const ISSUE_STATUS_CLASS  = { open: 'badge-issue-open', in_progress: 'badge-issue-progress', resolved: 'badge-issue-resolved', closed: 'badge-issue-closed' };

async function loadIssues(filterStatus) {
  const wrap = document.getElementById('issues-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading issues…</span></div>';

  try {
    const res = await fetch('/api/admin/issues', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const all = await res.json();
    _issuesCache = all;

    // Update open badge
    const openCount = all.filter(i => i.status === 'open').length;
    const badge = document.getElementById('openIssuesCount');
    badge.textContent = openCount || '';
    badge.style.display = openCount ? '' : 'none';

    const rows = filterStatus === 'all' ? all : all.filter(i => i.status === filterStatus);
    if (rows.length === 0) {
      wrap.innerHTML = `<div class="admin-empty">No ${filterStatus === 'all' ? '' : filterStatus.replace('_',' ')+' '}issues.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>System</th>
            <th>Reporter</th>
            <th>Description</th>
            <th>Attachments</th>
            <th>Status</th>
            <th>Assigned To</th>
            <th>Reported</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows.map(renderIssueRow).join('')}</tbody>
      </table>`;
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load issues: ${escHtml(err.message)}</div>`;
  }
}

function renderIssueRow(issue) {
  const statusBadge = `<span class="label-badge ${ISSUE_STATUS_CLASS[issue.status] || 'label-rgmc'}">${ISSUE_STATUS_LABELS[issue.status] || issue.status}</span>`;
  const titleText   = issue.title ? issue.title : (issue.description.length > 60 ? issue.description.slice(0, 58) + '…' : issue.description);
  const attachCount = (issue.attachment_urls || []).length;
  const devBadge    = issue.dev_item_id ? '<span class="badge-dev" title="Promoted to dev item">Dev</span> ' : '';
  return `<tr>
    <td><span class="user-name">${escHtml(issue.site_name)}</span></td>
    <td>${escHtml(issue.employee_name)}<br><small class="text-muted">${escHtml(issue.company_name)}</small></td>
    <td class="issue-desc-cell">${devBadge}${escHtml(titleText)}</td>
    <td class="date-cell">${attachCount > 0 ? `<span class="attach-count">${attachCount} file${attachCount > 1 ? 's' : ''}</span>` : '<span class="text-muted">—</span>'}</td>
    <td>${statusBadge}</td>
    <td>${issue.assigned_to ? `<code class="mono-val">${escHtml(issue.assigned_to)}</code>` : '<span class="text-muted">—</span>'}</td>
    <td class="date-cell">${fmtDateTime(issue.created_at)}</td>
    <td class="action-cell">
      <button class="btn-tbl-secondary" onclick="openIssueModal('${escHtml(issue.id)}')">View</button>
    </td>
  </tr>`;
}

async function _ensureDevelopers() {
  if (_developersCache.length > 0) return;
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    if (res.ok) {
      const all = await res.json();
      _developersCache = all.filter(u => u.is_developer || u.is_admin);
    }
  } catch { /* non-fatal */ }
}

async function openIssueModal(id) {
  const issue = _issuesCache.find(i => i.id === id);
  if (!issue) return;
  _editingIssueId = id;

  document.getElementById('issueModalTitle').textContent  = `Issue: ${issue.site_name}`;
  document.getElementById('issueModalMeta').textContent   = `Submitted ${fmtDateTime(issue.created_at)}`;
  document.getElementById('issueTitleInput').value        = issue.title || '';
  document.getElementById('issueReporter').textContent    = issue.employee_name;
  document.getElementById('issueEmail').innerHTML        = `<a href="mailto:${escHtml(issue.email)}" class="tbl-link">${escHtml(issue.email)}</a>`;
  document.getElementById('issueCompany').textContent    = issue.company_name;
  document.getElementById('issueDepartment').textContent = issue.department;
  document.getElementById('issueDescription').textContent = issue.description;
  document.getElementById('issueStatusSelect').value     = issue.status;
  _toggleIssueResolution(issue.status);

  // Attachments
  const urls = issue.attachment_urls || [];
  const attGroup = document.getElementById('issueAttachmentsGroup');
  const attList  = document.getElementById('issueAttachmentsList');
  if (urls.length > 0) {
    attGroup.style.display = '';
    attList.innerHTML = urls.map(u => {
      const name = decodeURIComponent(u.split('/').pop().replace(/^\d+_/, ''));
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
      return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-link">
        ${isImg
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`}
        ${escHtml(name)}
      </a>`;
    }).join('');
  } else {
    attGroup.style.display = 'none';
  }

  // Dev item link
  const devGroup = document.getElementById('issueDevItemGroup');
  const promoteBtn = document.getElementById('issuePromoteBtn');
  if (issue.dev_item_id) {
    devGroup.style.display = '';
    document.getElementById('issueDevItemId').textContent = issue.dev_item_id;
    promoteBtn.style.display = 'none';
  } else {
    devGroup.style.display = 'none';
    promoteBtn.style.display = '';
  }

  // Populate assigned-to dropdown
  await _ensureDevelopers();
  const sel = document.getElementById('issueAssignedTo');
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    _developersCache.map(u => {
      const label = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      const selected = u.username === issue.assigned_to ? ' selected' : '';
      return `<option value="${escHtml(u.username)}"${selected}>${escHtml(label)} (@${escHtml(u.username)})</option>`;
    }).join('');

  // Resolution fields
  document.getElementById('issueResolutionNotes').value = issue.resolution_notes || '';
  document.getElementById('issueResolvedBy').value      = issue.resolved_by      || '';

  resetIssueModal();
  document.getElementById('issueModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeIssueModal() {
  document.getElementById('issueModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingIssueId = null;
}

function overlayCloseIssue(e) {
  if (e.target === document.getElementById('issueModal')) closeIssueModal();
}

function _toggleIssueResolution(status) {
  const isTerminal = status === 'resolved' || status === 'closed';
  document.getElementById('issueResolutionGroup').style.display = isTerminal ? '' : 'none';
  document.getElementById('issueResolvedByGroup').style.display = isTerminal ? '' : 'none';
}

function resetIssueModal() {
  document.getElementById('issueModalActions').style.display = '';
  document.getElementById('issueModalLoading').style.display = 'none';
  document.getElementById('issueModalError').style.display   = 'none';
}

async function saveIssuePatch() {
  if (!_editingIssueId) return;
  const status     = document.getElementById('issueStatusSelect').value;
  const assignedTo = document.getElementById('issueAssignedTo').value || null;

  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';

  try {
    const isTerminal = status === 'resolved' || status === 'closed';
    const body = {
      status,
      assigned_to:      assignedTo,
      title:            document.getElementById('issueTitleInput').value.trim() || null,
      resolution_notes: isTerminal ? (document.getElementById('issueResolutionNotes').value.trim() || null) : undefined,
      resolved_by:      isTerminal ? (document.getElementById('issueResolvedBy').value.trim() || null)      : undefined,
    };
    // Strip undefined keys so they don't get sent as "undefined"
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    closeIssueModal();
    showToast('Issue updated.');
    loadIssues(_currentIssueStatus);
  } catch (err) {
    document.getElementById('issueModalLoading').style.display = 'none';
    document.getElementById('issueModalActions').style.display = '';
    document.getElementById('issueModalError').style.display   = '';
    document.getElementById('issueModalErrorMsg').textContent  = err.message;
  }
}

async function promoteIssueToDevItem() {
  if (!_editingIssueId) return;
  if (!confirm('Create a dev board item from this issue?')) return;

  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';

  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}/promote`, {
      method:  'POST',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    closeIssueModal();
    showToast('Issue promoted to dev board item.');
    loadIssues(_currentIssueStatus);
  } catch (err) {
    document.getElementById('issueModalLoading').style.display = 'none';
    document.getElementById('issueModalActions').style.display = '';
    document.getElementById('issueModalError').style.display   = '';
    document.getElementById('issueModalErrorMsg').textContent  = err.message;
  }
}

/* ── Developer Performance Tab ──────────────────────────────────────── */

const DP_STATUSES = ['pending', 'ongoing', 'coding', 'testing', 'done'];
const DP_STAT_LABEL = { pending: 'Pending', ongoing: 'Ongoing', coding: 'Coding', testing: 'Testing', done: 'Done' };
const DP_STAT_COLOR = { pending: '#6b7280', ongoing: '#a855f7', coding: '#3b82f6', testing: '#f59e0b', done: '#22c55e' };
const DP_STAT_BG    = { pending: '#f3f4f6', ongoing: '#f3e8ff', coding: '#eff6ff', testing: '#fffbeb', done: '#f0fdf4' };
const DP_ITEM_STATUS_CLS = { pending: 'dp-s-pending', ongoing: 'dp-s-ongoing', coding: 'dp-s-coding', testing: 'dp-s-testing', done: 'dp-s-done' };

async function loadDevPerf() {
  const body = document.getElementById('devperf-body');
  if (!body) return;
  body.innerHTML = '<p class="loading-text">Loading developer data…</p>';
  try {
    const res  = await fetch('/api/admin/dev-performance', { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _devPerfCache = data;
    _renderDevPerfTable(data);
  } catch (err) {
    body.innerHTML = `<p class="error-text">Error: ${escHtml(err.message)}</p>`;
  }
}

function _renderDevPerfTable(devs) {
  const body = document.getElementById('devperf-body');
  if (!devs.length) {
    body.innerHTML = '<p class="empty-text">No developer data found.</p>';
    return;
  }
  const rows = devs.map(d => _renderDevPerfRow(d)).join('');
  body.innerHTML = `
    <table class="dp-table">
      <thead>
        <tr>
          <th>Developer</th>
          <th class="dp-th-stat">Pending</th>
          <th class="dp-th-stat">Ongoing</th>
          <th class="dp-th-stat">Coding</th>
          <th class="dp-th-stat">Testing</th>
          <th class="dp-th-stat">Done</th>
          <th class="dp-th-stat dp-total-th">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _renderDevPerfRow(dev) {
  const fullName = [dev.first_name, dev.last_name].filter(Boolean).join(' ') || dev.username;
  const displayName = dev.display_name || fullName;
  const av = dev.avatar_url;
  const initial = (dev.first_name || dev.username || '?')[0].toUpperCase();

  const avatarHtml = av
    ? `<img class="dp-avatar-img" src="${escHtml(av)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    + `<span class="dp-avatar-initials" style="display:none">${escHtml(initial)}</span>`
    : `<span class="dp-avatar-initials">${escHtml(initial)}</span>`;

  const badges = [
    dev.is_admin     ? '<span class="dp-badge dp-badge-admin">Admin</span>'  : '',
    dev.is_developer ? '<span class="dp-badge dp-badge-dev">Developer</span>' : '',
  ].join('');

  const orgParts = [dev.company, dev.department, dev.position].filter(Boolean);
  const orgHtml  = orgParts.length ? `<span class="dp-org">${escHtml(orgParts.join(' · '))}</span>` : '';

  const statCells = DP_STATUSES.map(s => {
    const n = dev.counts[s] || 0;
    return `<td class="dp-stat-td"><span class="dp-stat-pill ${n ? '' : 'dp-stat-zero'}" style="color:${DP_STAT_COLOR[s]};background:${DP_STAT_BG[s]}">${n}</span></td>`;
  }).join('');

  return `<tr class="dp-row" onclick="openDevPerfModal('${escHtml(dev.username)}')" title="View details">
    <td class="dp-avatar-td">
      <div class="dp-avatar">${avatarHtml}</div>
      <div class="dp-dev-info">
        <span class="dp-dev-name">${escHtml(displayName)}</span>
        <span class="dp-badge-row">${badges}</span>
        ${orgHtml}
      </div>
    </td>
    ${statCells}
    <td class="dp-stat-td"><span class="dp-total">${dev.counts.total}</span></td>
  </tr>`;
}

function openDevPerfModal(username) {
  const dev = _devPerfCache.find(d => d.username === username);
  if (!dev) return;
  _devPerfSelected = dev;

  const fullName    = [dev.first_name, dev.last_name].filter(Boolean).join(' ') || dev.username;
  const displayName = dev.display_name || fullName;
  const av          = dev.avatar_url;
  const initial     = (dev.first_name || dev.username || '?')[0].toUpperCase();

  document.getElementById('devPerfModalContent').innerHTML =
    _buildDevPerfModalHtml(dev, av, initial, displayName);

  const overlay = document.getElementById('devPerfModal');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
}

function closeDevPerfModal() {
  const overlay = document.getElementById('devPerfModal');
  overlay.classList.remove('modal-open');
  setTimeout(() => { overlay.style.display = 'none'; }, 220);
}

function overlayCloseDevPerf(e) {
  if (e.target === document.getElementById('devPerfModal')) closeDevPerfModal();
}

function _buildDevPerfModalHtml(dev, av, initial, displayName) {
  const avatarHtml = av
    ? `<img class="dp-modal-avatar-img" src="${escHtml(av)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    + `<span class="dp-modal-avatar-initials" style="display:none">${escHtml(initial)}</span>`
    : `<span class="dp-modal-avatar-initials">${escHtml(initial)}</span>`;

  const badges = [
    dev.is_admin     ? '<span class="dp-badge dp-badge-admin">Admin</span>'  : '',
    dev.is_developer ? '<span class="dp-badge dp-badge-dev">Developer</span>' : '',
  ].join('');

  const infoFields = [
    { label: 'Email',      value: dev.email      },
    { label: 'Company',    value: dev.company     },
    { label: 'Department', value: dev.department  },
    { label: 'Position',   value: dev.position    },
  ].filter(f => f.value).map(f =>
    `<div class="dp-info-field"><span class="dp-info-label">${escHtml(f.label)}</span><span>${escHtml(f.value)}</span></div>`
  ).join('');

  const metricsHtml = DP_STATUSES.map(s => {
    const n = dev.counts[s] || 0;
    return `<div class="dp-metric-card" style="border-color:${DP_STAT_COLOR[s]}20">
      <span class="dp-metric-n" style="color:${DP_STAT_COLOR[s]}">${n}</span>
      <span class="dp-metric-lbl">${DP_STAT_LABEL[s]}</span>
    </div>`;
  }).join('');

  const systemsHtml = dev.systems.length
    ? dev.systems.map(s => `<span class="dp-sys-tag">${escHtml(s)}</span>`).join('')
    : '<span class="dp-no-data">None recorded</span>';

  const itemsHtml = dev.items.length ? `
    <div class="dp-items-wrap">
      <table class="dp-items-table">
        <thead><tr>
          <th>#</th><th>Title</th><th>Type</th><th>System</th>
          <th>Status</th><th>Started</th><th>Est. End</th><th>Actual End</th>
        </tr></thead>
        <tbody>${dev.items.map((it, i) => {
          const cls = DP_ITEM_STATUS_CLS[it.status] || '';
          const fmtDate = d => d ? d.slice(0, 10) : '—';
          const typeLabel = it.dev_item_type
            ? (it.dev_item_type.startsWith('Others: ') ? it.dev_item_type : it.dev_item_type)
            : '—';
          return `<tr>
            <td class="dp-item-num">${i + 1}</td>
            <td class="dp-item-title">${escHtml(it.title || '—')}</td>
            <td>${escHtml(typeLabel)}</td>
            <td>${escHtml(it.system_name || '—')}</td>
            <td><span class="dp-item-status ${cls}">${escHtml(it.status || '—')}</span></td>
            <td>${fmtDate(it.start_date)}</td>
            <td>${fmtDate(it.estimated_end_date)}</td>
            <td>${fmtDate(it.actual_end_date)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : '<span class="dp-no-data">No items assigned.</span>';

  return `
    <div class="dp-profile-section">
        <div class="dp-modal-avatar">${avatarHtml}</div>
        <div class="dp-profile-info">
          <div class="dp-modal-name">${escHtml(displayName)}</div>
          <div class="dp-badge-row">${badges}</div>
          <div class="dp-info-grid">${infoFields}</div>
        </div>
      </div>

      <div class="dp-metrics-strip">
        <div class="dp-metrics-label">Performance Metrics</div>
        <div class="dp-metrics-grid">${metricsHtml}
          <div class="dp-metric-card dp-metric-total">
            <span class="dp-metric-n">${dev.counts.total}</span>
            <span class="dp-metric-lbl">Total</span>
          </div>
        </div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Systems Handled <span class="dp-section-count">${dev.systems.length}</span></div>
        <div class="dp-systems">${systemsHtml}</div>
      </div>

      <div class="dp-section dp-section-last">
        <div class="dp-section-title">Dev Items <span class="dp-section-count">${dev.items.length}</span></div>
        ${itemsHtml}
      </div>`;
}

function downloadDevPerfPdf() {
  if (!_devPerfSelected) return;
  const printArea = document.getElementById('devPerfPrintArea');
  printArea.innerHTML = _buildPrintHtml(_devPerfSelected);
  window.print();
  setTimeout(() => { printArea.innerHTML = ''; }, 1000);
}

function _buildPrintHtml(dev) {
  const fullName    = [dev.first_name, dev.last_name].filter(Boolean).join(' ') || dev.username;
  const displayName = dev.display_name || fullName;
  const today       = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const infoRows = [
    ['Email',      dev.email],
    ['Company',    dev.company],
    ['Department', dev.department],
    ['Position',   dev.position],
  ].filter(([, v]) => v).map(([l, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600;white-space:nowrap">${escHtml(l)}</td><td style="padding:4px 0">${escHtml(v)}</td></tr>`
  ).join('');

  const metricCells = [...DP_STATUSES.map(s => {
    const n = dev.counts[s] || 0;
    return `<td style="text-align:center;padding:8px 12px;border:1px solid #e2e8f0">
      <div style="font-size:22px;font-weight:700;color:${DP_STAT_COLOR[s]}">${n}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px">${DP_STAT_LABEL[s]}</div>
    </td>`;
  }), `<td style="text-align:center;padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc">
    <div style="font-size:22px;font-weight:700;color:#1e293b">${dev.counts.total}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">Total</div>
  </td>`].join('');

  const systemsHtml = dev.systems.length
    ? dev.systems.map(s => `<span style="display:inline-block;background:#eff6ff;color:#2563eb;border-radius:4px;padding:2px 8px;margin:2px;font-size:12px">${escHtml(s)}</span>`).join('')
    : '<span style="color:#94a3b8">None recorded</span>';

  const itemRows = dev.items.map((it, i) => {
    const fmtDate = d => d ? d.slice(0, 10) : '—';
    const typeLabel = it.dev_item_type || '—';
    const clr = DP_STAT_COLOR[it.status] || '#6b7280';
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:5px 8px;color:#94a3b8;font-size:12px">${i + 1}</td>
      <td style="padding:5px 8px;font-weight:500">${escHtml(it.title || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(typeLabel)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(it.system_name || '—')}</td>
      <td style="padding:5px 8px"><span style="background:${DP_STAT_BG[it.status]||'#f3f4f6'};color:${clr};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap">${escHtml(it.status || '—')}</span></td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.start_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.estimated_end_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.actual_end_date)}</td>
    </tr>`;
  }).join('');

  const badges = [
    dev.is_admin     ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin-right:4px">Admin</span>'  : '',
    dev.is_developer ? '<span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Developer</span>' : '',
  ].join('');

  return `<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px 24px;color:#1e293b">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e2e8f0">
      <div>
        <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escHtml(displayName)}</div>
        <div style="margin-bottom:6px">${badges}</div>
        ${infoRows ? `<table style="margin-top:8px">${infoRows}</table>` : ''}
      </div>
      <div style="text-align:right;color:#94a3b8;font-size:12px">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">Performance Report</div>
        <div>Generated: ${today}</div>
        <div>RGMC Gateway</div>
      </div>
    </div>

    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Performance Metrics</div>
      <table style="border-collapse:collapse;width:auto"><tr>${metricCells}</tr></table>
    </div>

    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Systems Handled (${dev.systems.length})</div>
      <div>${systemsHtml}</div>
    </div>

    <div>
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Dev Items (${dev.items.length})</div>
      ${dev.items.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #e2e8f0">
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">#</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Title</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Type</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">System</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Status</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Started</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Est. End</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Actual End</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>` : '<span style="color:#94a3b8">No items assigned.</span>'}
    </div>
  </div>`;
}
