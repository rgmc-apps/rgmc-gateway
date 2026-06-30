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
let currentTab          = 'issues';
let currentStatus       = 'pending';
let _requestsCache      = [];
let _rejectingId        = null;
let _usersCache         = [];
let _systemsCache       = [];
let _editingUserSystems = null;
let _editingUsername    = null;
let _adminCompanies     = [];
let _issuesCache        = [];
let _currentIssueStatus = 'all';
let _issPage            = 1;
let _issPerPage         = 25;
let _editingIssueId     = null;
let _developersCache    = [];
let _devPerfCache       = [];
let _devPerfSelected    = null;

let _currentConfigTab   = 'companies';
let _cfgCompaniesCache  = [];
let _cfgCategoriesCache = [];
let _cfgTypesCache      = [];
let _cfgNsiCache        = [];
let _cfgBrandsCache     = [];
let _cfgDeptsCache      = [];
let _cfgCompanyEditCode = null;
let _cfgCategoryEditId  = null;
let _cfgTypeEditId      = null;
let _cfgNsiEditId       = null;
let _cfgBrandEditCode   = null;
let _cfgDeptEditId      = null;
let _cfgActionsCache    = [];
let _cfgActionEditId    = null;

let _adminDepartments   = [];

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
  if (!session || !session.username || (!session.isAdmin && !session.isManagement)) {
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
      navItems.push(`<a href="/developer" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Dev Board
      </a>`);
    }
    if (session.isAdmin || session.isManagement) {
      navItems.push(`<a href="/tasks" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Tasks Board
      </a>`);
    }

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

  const _urlIssue = new URLSearchParams(window.location.search).get('issue');
  if (_urlIssue && !window._OPEN_ISSUE_ID) window._OPEN_ISSUE_ID = _urlIssue;

  loadIssues();
  _loadAdminCompanies();
  _loadAdminDepartments();
  setTimeout(hidePageLoader, 600);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape')      { closeLinkedItemModal(); closeLightbox(); closeSystemModal(); closeRejectModal(); closeEditSystemsModal(); closeEditUserModal(); closeIssueModal(); closeProfileMenu(); closeCfgCompanyModal(); closeCfgCategoryModal(); closeCfgTypeModal(); closeCfgNsiModal(); closeCfgBrandModal(); closeCfgDeptModal(); closeAddUserModal(); closeAllUserDropdowns(); _closeIssActionsMenu(); }
    if (e.key === 'ArrowLeft')   lightboxNav(-1);
    if (e.key === 'ArrowRight')  lightboxNav(1);
  });
  document.addEventListener('click', e => {
    closeProfileMenu();
    closeAllUserDropdowns();
    if (_issActionsOpen && !document.getElementById('issActionsWrap')?.contains(e.target)) _closeIssActionsMenu();
  });

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
  if (tab === 'commonissues') loadCommonIssues();
  if (tab === 'devperf')  loadDevPerf();
  if (tab === 'config')   _loadCurrentConfigSub();
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
  if (!await showConfirm({ title: 'Approve Request', message: `Approve the access request from ${name}?`, detail: 'This will generate a username and send a notification email.', confirmText: 'Approve' })) return;

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
            <th style="width:44px;"></th>
            <th>Username</th>
            <th>Name</th>
            <th>Company</th>
            <th>Department</th>
            <th>Email</th>
            <th>Systems</th>
            <th>Role</th>
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
  const initial = escHtml((u.first_name || u.username || '?').charAt(0).toUpperCase());
  const av      = u.avatar_url && u.avatar_url.startsWith('https://') ? u.avatar_url : '';
  const avatarHtml = av
    ? `<div class="tbl-avatar"><img src="${escHtml(av)}" class="tbl-avatar-img" alt="${initial}"></div>`
    : `<div class="tbl-avatar tbl-avatar-initial">${initial}</div>`;

  const adminBadge    = u.is_admin
    ? '<span class="badge-admin">Admin</span>'
    : '<span class="badge-user">User</span>';
  const devBadge      = u.is_developer      ? '<span class="badge-dev">Dev</span>'  : '';
  const mgmtBadge     = u.is_management     ? '<span class="badge-admin" style="background:var(--accent-muted,#78350f);color:#fef9c3;">Mgmt</span>' : '';
  const deptHeadBadge = u.is_department_head ? '<span class="badge-admin" style="background:rgba(14,165,233,0.18);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);">Dept Head</span>' : '';
  const toggleAdminLabel    = u.is_admin           ? 'Revoke Admin'    : 'Make Admin';
  const toggleDevLabel      = u.is_developer       ? 'Revoke Dev'      : 'Make Dev';
  const toggleMgmtLabel     = u.is_management      ? 'Revoke Mgmt'     : 'Make Mgmt';
  const toggleDeptHeadLabel = u.is_department_head ? 'Revoke Dept Head' : 'Make Dept Head';
  const uname = escHtml(u.username);

  const dropId = `udrop-${uname}`;
  return `<tr id="user-row-${uname}">
    <td style="padding:8px 8px 8px 16px;">${avatarHtml}</td>
    <td><code class="mono-val">${uname}</code></td>
    <td><span class="user-name">${name || '—'}</span></td>
    <td>${escHtml(u.company || '')}</td>
    <td>${escHtml(u.department || '')}</td>
    <td><a href="mailto:${escHtml(u.email)}" class="tbl-link">${escHtml(u.email)}</a></td>
    <td><span class="systems-count">${systems} system${systems !== 1 ? 's' : ''}</span></td>
    <td>${adminBadge} ${devBadge} ${mgmtBadge} ${deptHeadBadge}</td>
    <td class="date-cell">${fmtDate(u.created_at)}</td>
    <td class="action-cell">
      <div class="user-action-dropdown">
        <button class="user-action-trigger" onclick="toggleUserDropdown('${dropId}',event)" title="Actions">···</button>
        <div class="user-action-menu" id="${dropId}">
          <div class="user-action-menu-section">
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();openEditUserModal('${uname}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit User
            </button>
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();openEditSystemsModal('${uname}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Manage Systems
            </button>
          </div>
          <div class="user-action-menu-section">
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();toggleAdmin('${uname}',${u.is_admin})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              ${toggleAdminLabel}
            </button>
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();toggleDeveloper('${uname}',${u.is_developer})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              ${toggleDevLabel}
            </button>
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();toggleManagement('${uname}',${u.is_management})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ${toggleMgmtLabel}
            </button>
            <button class="user-action-menu-item" onclick="closeAllUserDropdowns();toggleDeptHead('${uname}',${u.is_department_head})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><polyline points="9 11 12 14 15 11"/></svg>
              ${toggleDeptHeadLabel}
            </button>
          </div>
          <div class="user-action-menu-section">
            <button class="user-action-menu-item is-danger" onclick="closeAllUserDropdowns();deleteUser('${uname}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Delete User
            </button>
          </div>
        </div>
      </div>
    </td>
  </tr>`;
}

function toggleUserDropdown(id, e) {
  e.stopPropagation();
  const menu   = document.getElementById(id);
  const isOpen = menu.classList.contains('open');
  closeAllUserDropdowns();
  if (!isOpen) menu.classList.add('open');
}

function closeAllUserDropdowns() {
  document.querySelectorAll('.user-action-menu.open').forEach(m => m.classList.remove('open'));
}

async function toggleAdmin(username, currentIsAdmin) {
  const newVal = !currentIsAdmin;
  const label  = newVal ? 'grant admin to' : 'revoke admin from';
  if (!await showConfirm({ title: 'Change Role', message: `Are you sure you want to ${label} "${username}"?`, confirmText: 'Confirm', danger: !newVal })) return;

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
  if (!await showConfirm({ title: 'Change Role', message: `Are you sure you want to ${label} "${username}"?`, confirmText: 'Confirm', danger: !newVal })) return;

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

async function toggleManagement(username, currentIsMgmt) {
  const newVal = !currentIsMgmt;
  const label  = newVal ? 'grant management access to' : 'revoke management access from';
  if (!await showConfirm({ title: 'Change Role', message: `Are you sure you want to ${label} "${username}"?`, confirmText: 'Confirm', danger: !newVal })) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_management: newVal }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`Management access ${newVal ? 'granted to' : 'revoked from'} ${username}`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function toggleDeptHead(username, currentIsDeptHead) {
  const newVal = !currentIsDeptHead;
  const label  = newVal ? 'grant department head access to' : 'revoke department head access from';
  if (!await showConfirm({ title: 'Change Role', message: `Are you sure you want to ${label} "${username}"?`, confirmText: 'Confirm', danger: !newVal })) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_department_head: newVal }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    showToast(`Department head ${newVal ? 'granted to' : 'revoked from'} ${username}`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function deleteUser(username) {
  if (!await showConfirm({ title: 'Delete User', message: `Delete user "${username}"?`, detail: 'This cannot be undone. They will lose portal access.', confirmText: 'Delete', danger: true })) return;
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

/* ── Add User ── */
let _auSearchTimer = null;

function openAddUserModal() {
  document.getElementById('addUserForm').reset();
  document.getElementById('auSuggestions').style.display = 'none';
  document.getElementById('auFormActions').style.display = '';
  document.getElementById('auFormLoading').style.display = 'none';
  document.getElementById('auFormError').style.display   = 'none';
  _fillCompanySelect('auCompany', '');
  _fillDeptSelect('auDepartment', '');
  document.getElementById('addUserModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('auFirstName').focus(), 60);
}

function closeAddUserModal() {
  document.getElementById('addUserModal').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('auSuggestions').style.display = 'none';
}

function overlayCloseAddUser(e) {
  if (e.target === document.getElementById('addUserModal')) closeAddUserModal();
}

function onAuNameSearch(val) {
  const box = document.getElementById('auSuggestions');
  clearTimeout(_auSearchTimer);
  if (val.trim().length < 2) { box.style.display = 'none'; return; }
  _auSearchTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/admin/users/search?q=${encodeURIComponent(val.trim())}`, { headers: authHeaders() });
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        box.innerHTML = '<div class="au-sug-no-results">No matching names found in access requests</div>';
        box.style.display = '';
        return;
      }
      box.innerHTML = data.map((r, i) => {
        const name = [r.first_name, r.middle_initial ? r.middle_initial + '.' : '', r.last_name].filter(Boolean).join(' ');
        const meta = [r.company, r.department, r.email].filter(Boolean).join(' · ');
        return `<div class="au-suggestion-item" onclick="auSelectSuggestion(${i})" data-idx="${i}">${
          `<span class="au-sug-name">${escHtml(name)}</span>` +
          (meta ? `<span class="au-sug-meta">${escHtml(meta)}</span>` : '')
        }</div>`;
      }).join('');
      box.dataset.results = JSON.stringify(data);
      box.style.display = '';
    } catch { box.style.display = 'none'; }
  }, 300);
}

function auSelectSuggestion(idx) {
  const box  = document.getElementById('auSuggestions');
  const data = JSON.parse(box.dataset.results || '[]');
  const r    = data[idx];
  if (!r) return;
  document.getElementById('auFirstName').value      = r.first_name      || '';
  document.getElementById('auMiddleInitial').value  = r.middle_initial  || '';
  document.getElementById('auLastName').value       = r.last_name       || '';
  document.getElementById('auEmail').value          = r.email           || '';
  _fillCompanySelect('auCompany', r.company || '');
  _fillDeptSelect('auDepartment', r.department || '');
  document.getElementById('auPosition').value       = r.position        || '';
  // Auto-suggest username: first initial + last name, lowercase, no spaces
  const suggested = ((r.first_name || '').charAt(0) + (r.last_name || '')).toLowerCase().replace(/\s+/g, '');
  if (suggested) document.getElementById('auUsername').value = suggested;
  const fullName = [r.first_name, r.middle_initial, r.last_name].filter(Boolean).join(' ');
  document.getElementById('auNameSearch').value = fullName;
  box.style.display = 'none';
  document.getElementById('auUsername').focus();
}

async function submitAddUser(e) {
  e.preventDefault();
  document.getElementById('auFormActions').style.display = 'none';
  document.getElementById('auFormError').style.display   = 'none';
  document.getElementById('auFormLoading').style.display = '';

  const payload = {
    username:       document.getElementById('auUsername').value.trim().toLowerCase(),
    first_name:     document.getElementById('auFirstName').value.trim(),
    middle_initial: document.getElementById('auMiddleInitial').value.trim(),
    last_name:      document.getElementById('auLastName').value.trim(),
    display_name:   document.getElementById('auDisplayName').value.trim(),
    email:          document.getElementById('auEmail').value.trim(),
    company:        document.getElementById('auCompany').value.trim(),
    department:     document.getElementById('auDepartment').value.trim(),
    position:       document.getElementById('auPosition').value.trim(),
    is_admin:            document.getElementById('auIsAdmin').checked,
    is_developer:        document.getElementById('auIsDeveloper').checked,
    is_management:       document.getElementById('auIsManagement').checked,
    is_department_head:  document.getElementById('auIsDepartmentHead').checked,
    systems:             [],
  };

  try {
    const res = await fetch('/api/admin/users', {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user');
    closeAddUserModal();
    showToast(`User "${payload.username}" created`);
    loadUsers();
  } catch (err) {
    document.getElementById('auFormLoading').style.display = 'none';
    document.getElementById('auFormActions').style.display = '';
    document.getElementById('auFormError').style.display   = '';
    document.getElementById('auErrorMsg').textContent = err.message;
  }
}

// Close suggestions when clicking outside
document.addEventListener('click', e => {
  const box = document.getElementById('auSuggestions');
  if (box && !box.contains(e.target) && e.target.id !== 'auNameSearch') {
    box.style.display = 'none';
  }
});

/* ── Systems ── */
let _editingSystemId  = null;
let _sysTagsList      = [];
let _pingResults      = {};
let _sysSearchQuery   = '';
let _winPendingFiles  = { launcher: null, manifest: null };

async function loadSystems() {
  const wrap = document.getElementById('systems-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/systems', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _systemsCache = await res.json();
    _renderSystemsTable();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load systems: ${escHtml(err.message)}</div>`;
  }
}

function _renderSystemsTable() {
  const wrap = document.getElementById('systems-body');
  if (!wrap) return;

  const q = _sysSearchQuery.toLowerCase().trim();
  const rows = q
    ? _systemsCache.filter(s =>
        (s.name            || '').toLowerCase().includes(q) ||
        (s.category        || '').toLowerCase().includes(q) ||
        (s.tags            || '').toLowerCase().includes(q) ||
        (s.primary_url     || '').toLowerCase().includes(q) ||
        (s.is_task ? 'task' : 'system').includes(q)
      )
    : _systemsCache;

  if (_systemsCache.length === 0) {
    wrap.innerHTML = '<div class="admin-empty">No systems found. Add one above.</div>';
    return;
  }
  if (rows.length === 0) {
    wrap.innerHTML = `<div class="admin-empty">No systems match <strong>"${escHtml(_sysSearchQuery)}"</strong>.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th><th>Type</th><th>Category</th><th>Visible</th>
          <th>Primary URL</th><th>Label</th><th>Backup URL</th>
          <th>Tags</th><th>Status</th><th>Order</th><th></th>
        </tr>
      </thead>
      <tbody>${rows.map(s => renderSystemRow(s)).join('')}</tbody>
    </table>`;
}

function sysSearch(val) {
  _sysSearchQuery = val;
  const clearBtn = document.getElementById('sysSearchClear');
  if (clearBtn) clearBtn.style.display = val ? '' : 'none';
  _renderSystemsTable();
}

function sysClearSearch() {
  _sysSearchQuery = '';
  const input = document.getElementById('sysSearchInput');
  const clearBtn = document.getElementById('sysSearchClear');
  if (input)    { input.value = ''; input.focus(); }
  if (clearBtn) clearBtn.style.display = 'none';
  _renderSystemsTable();
}

function renderSystemRow(s) {
  const catClass = { RGMC: 'label-rgmc', SBIC: 'label-sbic', 'NAV Sites': 'label-nav' }[s.category] || 'label-rgmc';
  const visibleBadge = s.is_visible !== false
    ? '<span class="badge-visible">Visible</span>'
    : '<span class="badge-hidden">Hidden</span>';
  const typeBadge = s.is_task
    ? '<span class="badge-item-task">Task</span>'
    : s.is_windows_based
      ? '<span class="badge-item-windows">Windows</span>'
      : '<span class="badge-item-system">System</span>';
  const primaryUrlCell = s.primary_url
    ? `<a href="${escHtml(s.primary_url)}" target="_blank" rel="noopener" class="tbl-link url-cell" title="${escHtml(s.primary_url)}">${escHtml(truncUrl(s.primary_url))}</a>`
    : '<span class="text-muted">—</span>';
  return `<tr>
    <td><span class="user-name">${escHtml(s.name)}</span></td>
    <td>${typeBadge}</td>
    <td><span class="label-badge ${catClass}">${escHtml(s.category)}</span></td>
    <td>${visibleBadge}</td>
    <td>${primaryUrlCell}</td>
    <td>${escHtml(s.primary_label || '—')}</td>
    <td>${s.backup_url ? `<a href="${escHtml(s.backup_url)}" target="_blank" rel="noopener" class="tbl-link url-cell" title="${escHtml(s.backup_url)}">${escHtml(truncUrl(s.backup_url))}</a>` : '<span class="text-muted">—</span>'}</td>
    <td>${s.tags ? s.tags.split(',').map(t => `<span class="sys-tag-chip" style="font-size:11px;">${escHtml(t.trim())}</span>`).join(' ') : '<span class="text-muted">—</span>'}</td>
    <td id="ping-cell-${escHtml(s.id)}">${_pingBadgeHtml(_pingResults[s.id])}</td>
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
  const isTask    = system ? !!system.is_task : false;
  const isWindows = system ? (!!system.is_windows_based && !isTask) : false;

  document.getElementById('systemModalTitle').textContent = system ? `Edit ${isTask ? 'Task' : 'System'}` : 'Add System / Task';

  const idField = document.getElementById('sysId');
  idField.value    = system?.id ?? '';
  idField.disabled = !!system;

  document.getElementById('sysTypeSystem').checked  = !isTask && !isWindows;
  document.getElementById('sysTypeWindows').checked = isWindows;
  document.getElementById('sysTypeTask').checked    = isTask;
  document.getElementById('sysName').value          = system?.name          ?? '';
  document.getElementById('sysCategory').value      = system?.category      ?? 'RGMC';
  document.getElementById('sysPrimaryUrl').value   = system?.primary_url   ?? '';
  document.getElementById('sysPrimaryLabel').value = system?.primary_label ?? 'Open';
  document.getElementById('sysBackupUrl').value    = system?.backup_url    ?? '';
  document.getElementById('sysBackupLabel').value  = system?.backup_label  ?? '';
  document.getElementById('sysSortOrder').value    = system?.sort_order    ?? 0;
  document.getElementById('sysIsVisible').checked  = system ? (system.is_visible !== false) : true;

  _sysTagsList = (system?.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  _renderSysTags();
  document.getElementById('sysTagsField').value = '';

  // Reset Windows file state
  _winPendingFiles = { launcher: null, manifest: null };
  document.getElementById('sysWinLauncherInput').value = '';
  document.getElementById('sysWinManifestInput').value = '';
  document.getElementById('sysWinLauncherLabel').textContent = 'Choose launcher file…';
  document.getElementById('sysWinManifestLabel').textContent = 'Choose manifest file…';
  document.getElementById('sysWinLauncherZone').classList.remove('has-file');
  document.getElementById('sysWinManifestZone').classList.remove('has-file');
  _renderWinCurrentFile('launcher', system?.windows_launcher_url);
  _renderWinCurrentFile('manifest', system?.windows_manifest_url);

  _applySysTypeUi(isTask, isWindows);
  resetSysForm();
  document.getElementById('systemModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function onSysTypeChange() {
  const isTask    = document.getElementById('sysTypeTask').checked;
  const isWindows = document.getElementById('sysTypeWindows').checked;
  _applySysTypeUi(isTask, isWindows);
}

function _applySysTypeUi(isTask, isWindows) {
  document.getElementById('sysUrlSection').style.display     = isTask ? 'none' : '';
  document.getElementById('sysWindowsSection').style.display = isWindows ? '' : 'none';
  document.getElementById('sysTypeSystemOpt').classList.toggle('active', !isTask && !isWindows);
  document.getElementById('sysTypeWindowsOpt').classList.toggle('active', !!isWindows);
  document.getElementById('sysTypeTaskOpt').classList.toggle('active', isTask);
  if (isTask) {
    document.getElementById('sysPrimaryUrl').value   = '';
    document.getElementById('sysPrimaryLabel').value = '';
    document.getElementById('sysBackupUrl').value    = '';
    document.getElementById('sysBackupLabel').value  = '';
  }
}

function _renderWinCurrentFile(type, url) {
  const cap = type.charAt(0).toUpperCase() + type.slice(1);
  const el  = document.getElementById(`sysWin${cap}Current`);
  if (!el) return;
  if (!url) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const filename = url.split('/').pop().replace(/^[a-f0-9]{8}_/, '');
  el.style.display = '';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    Current: <a href="${escHtml(url)}" target="_blank" rel="noopener" class="win-file-link" title="${escHtml(url)}">${escHtml(filename)}</a>`;
}

function onWinFileSelect(input, type) {
  const file = input.files[0];
  if (!file) return;
  _winPendingFiles[type] = file;
  const cap     = type.charAt(0).toUpperCase() + type.slice(1);
  const labelEl = document.getElementById(`sysWin${cap}Label`);
  const zoneEl  = document.getElementById(`sysWin${cap}Zone`);
  if (labelEl) labelEl.textContent = file.name;
  if (zoneEl)  zoneEl.classList.add('has-file');
}

async function _uploadWinFile(systemId, type, file) {
  const fd = new FormData();
  fd.append('file_type', type);
  fd.append('file', file);
  const res = await fetch(`/api/admin/systems/${encodeURIComponent(systemId)}/upload`, {
    method:  'POST',
    headers: authHeaders(),
    body:    fd,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `${type} upload failed`);
  }
  return res.json();
}

function closeSystemModal() {
  document.getElementById('systemModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingSystemId = null;
}

function overlayCloseSystem(e) {
  if (e.target === document.getElementById('systemModal')) closeSystemModal();
}

function _renderSysTags() {
  document.getElementById('sysTagsChips').innerHTML = _sysTagsList.map((t, i) =>
    `<span class="sys-tag-chip">${escHtml(t)}<button type="button" class="sys-tag-remove" onclick="removeSysTag(${i})" aria-label="Remove">&times;</button></span>`
  ).join('');
}

function _addSysTag(raw) {
  const tag = raw.trim();
  if (!tag || _sysTagsList.some(t => t.toLowerCase() === tag.toLowerCase())) return;
  _sysTagsList.push(tag);
  _renderSysTags();
}

function onSysTagKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.replace(/,/g, '').trim();
    if (val) { _addSysTag(val); e.target.value = ''; }
  } else if (e.key === 'Backspace' && !e.target.value && _sysTagsList.length) {
    _sysTagsList.pop();
    _renderSysTags();
  }
}

function onSysTagBlur() {
  const input = document.getElementById('sysTagsField');
  const val = input.value.replace(/,/g, '').trim();
  if (val) { _addSysTag(val); input.value = ''; }
}

function removeSysTag(i) {
  _sysTagsList.splice(i, 1);
  _renderSysTags();
}

function resetSysForm() {
  document.getElementById('sysFormActions').style.display = '';
  document.getElementById('sysFormLoading').style.display = 'none';
  document.getElementById('sysFormError').style.display   = 'none';
  document.getElementById('sysSubmitBtn').disabled = false;
}

async function saveSystem(e) {
  e.preventDefault();

  const isTask    = document.getElementById('sysTypeTask').checked;
  const isWindows = document.getElementById('sysTypeWindows').checked;
  const id          = document.getElementById('sysId').value.trim();
  const name        = document.getElementById('sysName').value.trim();
  const category    = document.getElementById('sysCategory').value;
  const primaryUrl  = document.getElementById('sysPrimaryUrl').value.trim() || null;
  const primaryLabel= document.getElementById('sysPrimaryLabel').value.trim() || null;
  const backupUrl   = document.getElementById('sysBackupUrl').value.trim() || null;
  const backupLabel = document.getElementById('sysBackupLabel').value.trim() || null;
  const sortOrder   = parseInt(document.getElementById('sysSortOrder').value, 10) || 0;
  const isVisible   = document.getElementById('sysIsVisible').checked;
  const tags        = _sysTagsList.join(',');

  if (!_editingSystemId && !id) {
    showSysError('ID is required.');
    return;
  }
  if (!name) {
    showSysError('Name is required.');
    return;
  }
  if (!isTask && !isWindows && (!primaryUrl || !primaryLabel)) {
    showSysError('Primary URL and Primary Label are required for systems.');
    return;
  }

  document.getElementById('sysFormActions').style.display = 'none';
  document.getElementById('sysFormLoading').style.display = '';

  const payload = { name, category, is_task: isTask, is_windows_based: isWindows, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder, is_visible: isVisible, tags };

  try {
    let res, savedId;
    if (_editingSystemId) {
      res = await fetch(`/api/admin/systems/${encodeURIComponent(_editingSystemId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      savedId = _editingSystemId;
    } else {
      res = await fetch('/api/admin/systems', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ...payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      const d = await res.json();
      savedId = d.id || id;
      res = { ok: true };
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    // Upload Windows files if selected
    if (isWindows && savedId) {
      const uploads = [];
      if (_winPendingFiles.launcher) uploads.push(_uploadWinFile(savedId, 'launcher', _winPendingFiles.launcher));
      if (_winPendingFiles.manifest) uploads.push(_uploadWinFile(savedId, 'manifest', _winPendingFiles.manifest));
      if (uploads.length) await Promise.all(uploads);
    }
    const kind = isTask ? 'Task' : isWindows ? 'Windows App' : 'System';
    closeSystemModal();
    showToast(`${kind} ${_editingSystemId ? 'updated' : 'added'} successfully.`);
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
  if (!await showConfirm({ title: 'Delete System', message: `Delete system "${id}"?`, detail: 'Users will lose access to it on next sign-in.', confirmText: 'Delete', danger: true })) return;
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

/* ── System ping / health check ── */

function _pingBadgeHtml(result) {
  if (!result) return '<span class="text-muted">—</span>';
  if (result.status === 'ok')      return `<span class="badge-ping-ok"><span class="ping-dot ping-dot-ok"></span>${result.http_status} · ${result.latency_ms}ms</span>`;
  if (result.status === 'timeout') return `<span class="badge-ping-timeout"><span class="ping-dot ping-dot-timeout"></span>Timeout</span>`;
  if (result.status === 'no_url')  return `<span class="text-muted">No URL</span>`;
  return `<span class="badge-ping-error"><span class="ping-dot ping-dot-error"></span>${result.http_status ? result.http_status + ' · ' : ''}Down</span>`;
}

async function pingSystem(id) {
  const cell = document.getElementById(`ping-cell-${id}`);
  if (cell) cell.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>';
  try {
    const res  = await fetch(`/api/admin/systems/${encodeURIComponent(id)}/ping`, { headers: authHeaders() });
    const data = await res.json();
    _pingResults[id] = data;
    if (cell) cell.innerHTML = _pingBadgeHtml(data);
  } catch {
    _pingResults[id] = { status: 'down' };
    if (cell) cell.innerHTML = _pingBadgeHtml(_pingResults[id]);
  }
}

async function pingAllSystems() {
  const btn = document.getElementById('checkAllBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  await Promise.allSettled(_systemsCache.filter(s => !s.is_task).map(s => pingSystem(s.id)));
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Check All`;
  }
}

/* ── Companies helpers ── */

async function _loadAdminCompanies() {
  try {
    const res = await fetch('/api/companies');
    _adminCompanies = await res.json();
  } catch { _adminCompanies = []; }
}

function _fillCompanySelect(selId, selectedName) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const placeholder = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(placeholder);
  _adminCompanies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.company_code} — ${c.name}`;
    if (c.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function _loadAdminDepartments() {
  try {
    const res = await fetch('/api/departments');
    _adminDepartments = await res.json();
  } catch { _adminDepartments = []; }
}

function _fillDeptSelect(selId, selectedVal, byId = false) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const placeholder = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(placeholder);
  _adminDepartments.forEach(d => {
    const opt = document.createElement('option');
    opt.value = byId ? d.department_id : d.department_name;
    opt.textContent = `${d.department_code} — ${d.department_name}`;
    if (byId ? String(d.department_id) === String(selectedVal) : d.department_name === selectedVal) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ── Edit User modal ── */

function openEditUserModal(username) {
  const user = _usersCache.find(u => u.username === username);
  if (!user) return;
  _editingUsername = username;

  document.getElementById('editUserSubtitle').textContent = `@${username}`;
  document.getElementById('euFirstName').value      = user.first_name      || '';
  document.getElementById('euMiddleInitial').value  = user.middle_initial  || '';
  document.getElementById('euLastName').value       = user.last_name       || '';
  document.getElementById('euDisplayName').value    = user.display_name    || '';
  document.getElementById('euPosition').value     = user.position      || '';
  document.getElementById('euEmail').value        = user.email         || '';
  document.getElementById('euViberNumber').value  = user.viber_number  || '';
  document.getElementById('euAnydeskId').value    = user.anydesk_id   || '';
  _fillCompanySelect('euCompany', user.company || '');
  _fillDeptSelect('euDepartment', user.department || '');

  document.getElementById('euFormActions').style.display = '';
  document.getElementById('euFormLoading').style.display = 'none';
  document.getElementById('euFormError').style.display   = 'none';

  document.getElementById('editUserModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEditUserModal() {
  document.getElementById('editUserModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingUsername = null;
}

function overlayCloseEditUser(e) {
  if (e.target === document.getElementById('editUserModal')) closeEditUserModal();
}

async function saveEditUser(e) {
  e.preventDefault();
  if (!_editingUsername) return;

  document.getElementById('euFormActions').style.display = 'none';
  document.getElementById('euFormLoading').style.display = 'flex';
  document.getElementById('euFormError').style.display   = 'none';

  const patch = {
    first_name:      document.getElementById('euFirstName').value.trim(),
    middle_initial:  document.getElementById('euMiddleInitial').value.trim() || null,
    last_name:       document.getElementById('euLastName').value.trim(),
    display_name: document.getElementById('euDisplayName').value.trim()   || null,
    company:      document.getElementById('euCompany').value              || null,
    department:   document.getElementById('euDepartment').value.trim()    || null,
    position:     document.getElementById('euPosition').value.trim()      || null,
    email:        document.getElementById('euEmail').value.trim(),
    viber_number: document.getElementById('euViberNumber').value.trim()   || null,
    anydesk_id:   document.getElementById('euAnydeskId').value.trim()     || null,
  };

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(_editingUsername)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    showToast(`User ${_editingUsername} updated`);
    closeEditUserModal();
    loadUsers();
  } catch (err) {
    document.getElementById('euFormActions').style.display = '';
    document.getElementById('euFormLoading').style.display = 'none';
    document.getElementById('euFormError').style.display   = 'flex';
    document.getElementById('euErrorMsg').textContent = err.message;
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
  if (_issuesCache.length > 0) {
    issApplyFilters();
  } else {
    loadIssues(status);
  }
}

const ISSUE_STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const ISSUE_STATUS_CLASS  = { open: 'badge-issue-open', in_progress: 'badge-issue-progress', resolved: 'badge-issue-resolved', closed: 'badge-issue-closed' };

async function loadIssues() {
  const wrap = document.getElementById('issues-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading issues…</span></div>';

  try {
    const res = await fetch('/api/admin/issues', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const all = await res.json();
    _issuesCache = all;

    if (window._OPEN_ISSUE_ID) {
      const targetId = window._OPEN_ISSUE_ID;
      window._OPEN_ISSUE_ID = null;
      // Show all statuses so the target issue is visible regardless of its status
      _currentIssueStatus = 'all';
      document.querySelectorAll('#issueStatusTabs .status-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.istatus === 'all')
      );
      setTimeout(() => openIssueModal(targetId), 0);
    }

    _renderIssueKpis(all);
    _populateIssueCompanyFilter(all);
    _renderIssueAnalytics(all);
    issApplyFilters();
  } catch (err) {
    document.getElementById('issues-body').innerHTML = `<div class="admin-error">Failed to load issues: ${escHtml(err.message)}</div>`;
  }
}

function _renderIssueKpis(all) {
  const total     = all.length;
  const open      = all.filter(i => i.status === 'open').length;
  const progress  = all.filter(i => i.status === 'in_progress').length;
  const resolved  = all.filter(i => ['resolved','closed'].includes(i.status)).length;
  const connected = all.filter(i => i.dev_item_id || i.task_id || i.user_task_id).length;
  _setText('issKpiTotal',     total);
  _setText('issKpiOpen',      open);
  _setText('issKpiProgress',  progress);
  _setText('issKpiResolved',  resolved);
  _setText('issKpiConnected', connected);

  // Sidebar badge
  const badge = document.getElementById('openIssuesCount');
  if (badge) { badge.textContent = open || ''; badge.style.display = open ? '' : 'none'; }
}
function _setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function _populateIssueCompanyFilter(all) {
  const sel = document.getElementById('issFilterCompany');
  if (!sel) return;
  const current = sel.value;
  const companies = [...new Set(all.map(i => i.company_name).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Companies</option>' +
    companies.map(c => `<option value="${escHtml(c)}"${c === current ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}


function _renderIssueAnalytics(all) {
  _renderIssRing(all);
  _renderIssBars('issCategoryBars', all, i => i.request_category || 'Uncategorized');
  _renderIssBars('issCompanyBars',  all, i => i.company_name     || 'Unknown');
}

function _renderIssRing(all) {
  const counts = {
    open:        all.filter(i => i.status === 'open').length,
    in_progress: all.filter(i => i.status === 'in_progress').length,
    resolved:    all.filter(i => i.status === 'resolved').length,
    closed:      all.filter(i => i.status === 'closed').length,
  };
  const total    = all.length || 1;
  const resolved = counts.resolved + counts.closed;
  const pct      = Math.round((resolved / total) * 100);
  const pctEl = document.getElementById('issRingPct');
  if (pctEl) pctEl.textContent = pct + '%';

  const svg    = document.getElementById('issRingChart');
  if (!svg) return;
  const cx = 70, cy = 70, r = 54, stroke = 10;
  const circ = 2 * Math.PI * r;
  const colors = { open: '#f87171', in_progress: '#facc15', resolved: '#4ade80', closed: '#94a3b8' };
  const labels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
  let offset = 0;
  const segs = Object.entries(counts).map(([key, val]) => {
    const dash = (val / total) * circ;
    const seg  = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[key]}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" opacity="0.88"/>`;
    offset += dash;
    return seg;
  }).join('');
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${stroke}"/>${segs}`;

  const legend = document.getElementById('issRingLegend');
  if (legend) legend.innerHTML = Object.entries(counts).map(([key, val]) =>
    `<div class="iss-legend-item"><span class="iss-legend-dot" style="background:${colors[key]}"></span><span class="iss-legend-label">${labels[key]}</span><span class="iss-legend-val">${val}</span></div>`
  ).join('');
}

function _renderIssBars(containerId, all, keyFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const counts = {};
  all.forEach(i => { const k = keyFn(i); counts[k] = (counts[k] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) { el.innerHTML = '<div class="iss-bars-empty">No data</div>'; return; }
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([label, val]) => {
    const pct = Math.max(4, Math.round((val / max) * 100));
    return `<div class="iss-bar-row">
      <div class="iss-bar-label" title="${escHtml(label)}">${escHtml(label)}</div>
      <div class="iss-bar-track"><div class="iss-bar-fill" style="width:${pct}%"></div></div>
      <div class="iss-bar-val">${val}</div>
    </div>`;
  }).join('');
}

function issApplyFilters() {
  const search   = (document.getElementById('issFilterSearch')?.value   || '').toLowerCase().trim();
  const from     = document.getElementById('issFilterFrom')?.value   || '';
  const to       = document.getElementById('issFilterTo')?.value     || '';
  const priority = document.getElementById('issFilterPriority')?.value || '';
  const company  = document.getElementById('issFilterCompany')?.value  || '';
  const clearBtn = document.getElementById('issFilterSearchClear');
  if (clearBtn) clearBtn.style.display = search ? '' : 'none';

  let rows = _currentIssueStatus === 'all'
    ? _issuesCache
    : _issuesCache.filter(i => i.status === _currentIssueStatus);

  if (search) rows = rows.filter(i =>
    (i.ticket_number || '').toLowerCase().includes(search) ||
    (i.title         || '').toLowerCase().includes(search) ||
    (i.description   || '').toLowerCase().includes(search) ||
    (i.employee_name || '').toLowerCase().includes(search) ||
    (i.company_name  || '').toLowerCase().includes(search)
  );
  if (from)     rows = rows.filter(i => i.created_at && i.created_at.slice(0,10) >= from);
  if (to)       rows = rows.filter(i => i.created_at && i.created_at.slice(0,10) <= to);
  if (priority) rows = rows.filter(i => (i.priority || '').toLowerCase() === priority);
  if (company)  rows = rows.filter(i => i.company_name === company);

  _issPage = 1;
  _renderIssueTable(rows);
  _renderIssueAnalytics(rows);
}

function issClearSearch() {
  const inp = document.getElementById('issFilterSearch');
  if (inp) inp.value = '';
  const clearBtn = document.getElementById('issFilterSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  issApplyFilters();
}

function issSetPage(page) {
  _issPage = page;
  issApplyFilters_noReset();
}

function issSetPerPage(n) {
  _issPerPage = Number(n);
  _issPage = 1;
  issApplyFilters_noReset();
}

function issApplyFilters_noReset() {
  const search   = (document.getElementById('issFilterSearch')?.value   || '').toLowerCase().trim();
  const from     = document.getElementById('issFilterFrom')?.value   || '';
  const to       = document.getElementById('issFilterTo')?.value     || '';
  const priority = document.getElementById('issFilterPriority')?.value || '';
  const company  = document.getElementById('issFilterCompany')?.value  || '';

  let rows = _currentIssueStatus === 'all'
    ? _issuesCache
    : _issuesCache.filter(i => i.status === _currentIssueStatus);

  if (search)   rows = rows.filter(i =>
    (i.ticket_number || '').toLowerCase().includes(search) ||
    (i.title         || '').toLowerCase().includes(search) ||
    (i.description   || '').toLowerCase().includes(search) ||
    (i.employee_name || '').toLowerCase().includes(search) ||
    (i.company_name  || '').toLowerCase().includes(search)
  );
  if (from)     rows = rows.filter(i => i.created_at && i.created_at.slice(0,10) >= from);
  if (to)       rows = rows.filter(i => i.created_at && i.created_at.slice(0,10) <= to);
  if (priority) rows = rows.filter(i => (i.priority || '').toLowerCase() === priority);
  if (company)  rows = rows.filter(i => i.company_name === company);

  _renderIssueTable(rows);
  _renderIssueAnalytics(rows);
}

function _renderIssueTable(rows) {
  const wrap = document.getElementById('issues-body');
  if (!wrap) return;

  const total   = rows.length;
  const perPage = _issPerPage === 0 ? total : _issPerPage;
  const pages   = perPage > 0 ? Math.ceil(total / perPage) : 1;
  if (_issPage > pages) _issPage = Math.max(1, pages);
  const start   = (_issPage - 1) * perPage;
  const end     = perPage > 0 ? Math.min(start + perPage, total) : total;
  const pageRows = rows.slice(start, end);

  if (!total) {
    wrap.innerHTML = '<div class="admin-empty">No issues match the current filters.</div>';
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ticket / System</th>
          <th>Reporter</th>
          <th>Description</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Connected</th>
          <th>Assigned To</th>
          <th>Reported</th>
        </tr>
      </thead>
      <tbody>${pageRows.map(renderIssueRow).join('')}</tbody>
    </table>
    ${_renderIssPagination(total, start, end, pages)}`;
}

function _renderIssPagination(total, start, end, pages) {
  const perPageOpts = [10, 25, 50, 100, 0];
  const perPageSel = perPageOpts.map(n =>
    `<option value="${n}"${_issPerPage === n ? ' selected' : ''}>${n === 0 ? 'All' : n}</option>`
  ).join('');

  let pageButtons = '';
  const maxVisible = 7;
  if (pages <= maxVisible) {
    for (let i = 1; i <= pages; i++) {
      pageButtons += `<button class="iss-page-btn${i === _issPage ? ' active' : ''}" onclick="issSetPage(${i})">${i}</button>`;
    }
  } else {
    const left  = Math.max(2, _issPage - 2);
    const right = Math.min(pages - 1, _issPage + 2);
    pageButtons += `<button class="iss-page-btn${_issPage === 1 ? ' active' : ''}" onclick="issSetPage(1)">1</button>`;
    if (left > 2) pageButtons += `<span class="iss-page-ellipsis">…</span>`;
    for (let i = left; i <= right; i++) {
      pageButtons += `<button class="iss-page-btn${i === _issPage ? ' active' : ''}" onclick="issSetPage(${i})">${i}</button>`;
    }
    if (right < pages - 1) pageButtons += `<span class="iss-page-ellipsis">…</span>`;
    pageButtons += `<button class="iss-page-btn${_issPage === pages ? ' active' : ''}" onclick="issSetPage(${pages})">${pages}</button>`;
  }

  return `<div class="iss-pagination">
    <span class="iss-page-info">Showing ${start + 1}–${end} of ${total}</span>
    <div class="iss-page-controls">
      <button class="iss-page-nav" onclick="issSetPage(${_issPage - 1})" ${_issPage === 1 ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${pageButtons}
      <button class="iss-page-nav" onclick="issSetPage(${_issPage + 1})" ${_issPage === pages ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="iss-page-size">
      <label class="iss-page-size-label">Per page:</label>
      <select class="iss-page-size-sel" onchange="issSetPerPage(this.value)">${perPageSel}</select>
    </div>
  </div>`;
}

/* ── Lightbox ── */
let _lbUrls = [];
let _lbIdx  = 0;

function openLightbox(issueId, idx) {
  const issue = _issuesCache.find(i => i.id === issueId);
  _lbUrls = issue ? (issue.attachment_urls || []) : [];
  _lbIdx  = idx;
  _renderLightbox();
  document.getElementById('lightboxOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _renderLightbox() {
  const url   = _lbUrls[_lbIdx];
  const name  = decodeURIComponent(url.split('/').pop().replace(/^\d+_/, ''));
  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = /\.pdf$/i.test(name);
  const multi = _lbUrls.length > 1;

  const content = document.getElementById('lightboxContent');
  if (isImg) {
    content.innerHTML = `<img src="${escHtml(url)}" class="lightbox-img" alt="${escHtml(name)}">`;
  } else if (isPdf) {
    content.innerHTML = `<iframe src="${escHtml(url)}" class="lightbox-pdf" title="${escHtml(name)}"></iframe>`;
  } else {
    content.innerHTML = `<div class="lightbox-other">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>${escHtml(name)}</p>
      <a href="${escHtml(url)}" target="_blank" rel="noopener" class="lightbox-download-btn">Download file</a>
    </div>`;
  }

  document.getElementById('lightboxPrev').style.display    = multi ? '' : 'none';
  document.getElementById('lightboxNext').style.display    = multi ? '' : 'none';
  document.getElementById('lightboxCounter').textContent   = multi ? `${_lbIdx + 1} / ${_lbUrls.length}` : '';
  document.getElementById('lightboxCounter').style.display = multi ? '' : 'none';
}

function closeLightbox() {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function lightboxOverlayClick(e) {
  if (e.target === document.getElementById('lightboxOverlay')) closeLightbox();
}

function lightboxNav(dir) {
  if (!_lbUrls.length) return;
  _lbIdx = (_lbIdx + dir + _lbUrls.length) % _lbUrls.length;
  _renderLightbox();
}

function _renderAttachPreviews(issueId, urls) {
  if (!urls || !urls.length) return '<span class="text-muted">—</span>';
  const shown = urls.slice(0, 3);
  const extra = urls.length - shown.length;
  const items = shown.map((u, i) => {
    const name  = decodeURIComponent(u.split('/').pop().replace(/^\d+_/, ''));
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
    const isPdf = /\.pdf$/i.test(name);
    if (isImg) {
      return `<button class="attach-thumb" title="${escHtml(name)}" onclick="openLightbox('${escHtml(issueId)}',${i})"><img src="${escHtml(u)}" alt="${escHtml(name)}" loading="lazy"></button>`;
    }
    if (isPdf) {
      return `<button class="attach-thumb attach-thumb-pdf" title="${escHtml(name)}" onclick="openLightbox('${escHtml(issueId)}',${i})"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>PDF</span></button>`;
    }
    return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-thumb attach-thumb-file" title="${escHtml(name)}"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></a>`;
  });
  if (extra > 0) items.push(`<span class="attach-thumb-more">+${extra}</span>`);
  return `<div class="attach-thumb-row">${items.join('')}</div>`;
}

const PRIORITY_BADGE = {
  high:   '<span class="iss-prio-badge iss-prio--high">High</span>',
  medium: '<span class="iss-prio-badge iss-prio--medium">Medium</span>',
  low:    '<span class="iss-prio-badge iss-prio--low">Low</span>',
};

function renderIssueRow(issue) {
  const statusBadge   = `<span class="label-badge ${ISSUE_STATUS_CLASS[issue.status] || 'label-rgmc'}">${ISSUE_STATUS_LABELS[issue.status] || issue.status}</span>`;
  const prioBadge     = PRIORITY_BADGE[(issue.priority || '').toLowerCase()] || '<span class="text-muted">—</span>';
  const titleText     = issue.title ? issue.title : ((issue.description || '').length > 60 ? issue.description.slice(0, 58) + '…' : (issue.description || ''));
  const ticketRef     = issue.ticket_number
    ? `<code class="mono-val" style="font-size:11px;">${escHtml(issue.ticket_number)}</code><br>`
    : '';
  const devBadge      = issue.dev_item_id  ? '<span class="badge-dev"   title="Linked to dev item">Dev Item</span>' : '';
  const taskBadge     = issue.task_id      ? '<span class="badge-task"  title="Linked to task">Task</span>'         : '';
  const userTaskBadge = issue.user_task_id ? '<span class="badge-user-task" title="Linked to user task">User Task</span>' : '';
  const linkedBadge   = issue.linked_issue_id ? (issue.is_duplicate ? '<span class="badge-duplicate">Duplicate</span>' : '<span class="badge-linked">Linked</span>') : '';
  const connectedHtml = [devBadge, taskBadge, userTaskBadge, linkedBadge].filter(Boolean).join(' ') || '<span class="text-muted">—</span>';

  const safeId = escHtml(issue.id);
  return `<tr class="iss-row-clickable" onclick="openIssueModal('${safeId}')">
    <td>${ticketRef}<span class="user-name">${escHtml(issue.site_name || '')}</span></td>
    <td>${escHtml(issue.employee_name || '')}<br><small class="text-muted">${escHtml(issue.company_name || '')}</small></td>
    <td class="issue-desc-cell">${escHtml(titleText)}</td>
    <td>${prioBadge}</td>
    <td>${statusBadge}</td>
    <td class="iss-connected-cell" onclick="event.stopPropagation()">${connectedHtml}</td>
    <td>${issue.assigned_to ? `<code class="mono-val">${escHtml(issue.assigned_to)}</code>` : '<span class="text-muted">—</span>'}</td>
    <td class="date-cell">${fmtDateTime(issue.created_at)}</td>
  </tr>`;
}

async function _ensureDevelopers() {
  if (_developersCache.length > 0) return;
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    if (res.ok) {
      const all = await res.json();
      _developersCache = all.filter(u => (u.is_developer || u.is_admin) && !u.is_management);
    }
  } catch { /* non-fatal */ }
}

async function openIssueModal(id) {
  const issue = _issuesCache.find(i => i.id === id);
  if (!issue) return;
  _editingIssueId = id;

  const titleRef = issue.ticket_number
    ? `[${issue.ticket_number}] ${issue.site_name}`
    : `Issue: ${issue.site_name}`;
  document.getElementById('issueModalTitle').textContent  = titleRef;
  document.getElementById('issueModalMeta').textContent   = `Submitted ${fmtDateTime(issue.created_at)}`;
  document.getElementById('issueTitleInput').value        = issue.title || '';
  document.getElementById('issueReporter').textContent     = issue.employee_name;
  document.getElementById('issueCompany').textContent     = issue.company_name;
  document.getElementById('issueViberNumber').textContent = issue.viber_number || '—';
  document.getElementById('issueEmail').innerHTML         = `<a href="mailto:${escHtml(issue.email)}" class="tbl-link">${escHtml(issue.email)}</a>`;
  const deptRow = document.getElementById('issueDepartmentRow');
  if (issue.department) {
    document.getElementById('issueDepartment').textContent = issue.department;
    deptRow.style.display = '';
  } else {
    deptRow.style.display = 'none';
  }
  document.getElementById('issueDescription').textContent = issue.description;

  const ecGroup = document.getElementById('issueErrorCodeGroup');
  const ecEl    = document.getElementById('issueErrorCode');
  if (issue.error_code) {
    ecEl.textContent        = issue.error_code;
    ecGroup.style.display   = '';
  } else {
    ecGroup.style.display   = 'none';
    ecEl.textContent        = '';
  }
  document.getElementById('issueStatusSelect').value     = issue.status;
  _toggleIssueResolution(issue.status);

  // Attachments
  const urls = issue.attachment_urls || [];
  const attGroup = document.getElementById('issueAttachmentsGroup');
  const attList  = document.getElementById('issueAttachmentsList');
  if (urls.length > 0) {
    attGroup.style.display = '';
    attList.innerHTML = urls.map((u, i) => {
      const name  = decodeURIComponent(u.split('/').pop().replace(/^\d+_/, ''));
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
      const isPdf = /\.pdf$/i.test(name);
      if (isImg) {
        return `<button class="attach-thumb attach-thumb-modal" title="${escHtml(name)}" onclick="openLightbox('${escHtml(issue.id)}',${i})"><img src="${escHtml(u)}" alt="${escHtml(name)}" loading="lazy"></button>`;
      }
      if (isPdf) {
        return `<button class="attach-thumb attach-thumb-pdf attach-thumb-modal" title="${escHtml(name)}" onclick="openLightbox('${escHtml(issue.id)}',${i})"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${escHtml(name)}</span></button>`;
      }
      return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-link"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escHtml(name)}</a>`;
    }).join('');
  } else {
    attGroup.style.display = 'none';
  }

  // Dev item link
  const devGroup = document.getElementById('issueDevItemGroup');
  if (issue.dev_item_id) {
    devGroup.style.display = '';
    document.getElementById('issueDevItemId').textContent = issue.dev_item_id.slice(0, 8) + '…';
    const devBtn = document.getElementById('issueDevItemBtn');
    devBtn.onclick = () => openLinkedItemModal('dev_item', issue.dev_item_id);
  } else {
    devGroup.style.display = 'none';
  }

  // Task link
  const taskGroup = document.getElementById('issueTaskGroup');
  if (issue.task_id) {
    taskGroup.style.display = '';
    document.getElementById('issueTaskId').textContent = issue.task_id.slice(0, 8) + '…';
    const taskBtn = document.getElementById('issueTaskBtn');
    taskBtn.onclick = () => openLinkedItemModal('task', issue.task_id);
  } else {
    taskGroup.style.display = 'none';
  }

  // User task link
  const userTaskGroup = document.getElementById('issueUserTaskGroup');
  if (issue.user_task_id) {
    userTaskGroup.style.display = '';
    document.getElementById('issueUserTaskId').textContent = issue.user_task_id.slice(0, 8) + '…';
    const userTaskBtn = document.getElementById('issueUserTaskBtn');
    userTaskBtn.onclick = () => openLinkedItemModal('user_task', issue.user_task_id);
  } else {
    userTaskGroup.style.display = 'none';
  }

  // Linked issue / duplicate display
  const linkGroup   = document.getElementById('issueLinkGroup');
  const linkLabel   = document.getElementById('issueLinkLabel');
  const linkDisplay = document.getElementById('issueLinkDisplay');
  if (issue.linked_issue_id) {
    linkGroup.style.display = '';
    linkLabel.textContent   = issue.is_duplicate ? 'Duplicate of' : 'Related Issue';
    // Find linked issue in cache for richer display
    const linked = _issuesCache.find(i => i.id === issue.linked_issue_id);
    const ticket = linked?.ticket_number || issue.linked_issue_id.slice(0, 8);
    const title  = linked?.title || linked?.description?.slice(0, 80) || '';
    const dupBadge = issue.is_duplicate ? '<span class="badge-duplicate">Duplicate</span>' : '<span class="badge-linked">Linked</span>';
    linkDisplay.innerHTML = `${dupBadge} <span class="iss-link-ref">#${escHtml(ticket)}</span>${title ? ` — <span class="iss-link-ref-title">${escHtml(title)}</span>` : ''}`;
  } else {
    linkGroup.style.display = 'none';
    linkDisplay.innerHTML   = '';
  }

  // Actions submenu state: hide all promote options once any promotion exists
  const anyPromoted = !!(issue.dev_item_id || issue.task_id || issue.user_task_id);
  ['issPromoteDevBtn', 'issPromoteTaskBtn', 'issPromoteUserTaskBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = anyPromoted ? 'none' : '';
  });
  const promotedNote = document.getElementById('issPromotedNote');
  if (promotedNote) promotedNote.style.display = anyPromoted ? '' : 'none';

  // Quick resolve hidden if already terminal
  const isTerminal  = issue.status === 'resolved' || issue.status === 'closed';
  const resolveItem = document.getElementById('issQuickResolveItem');
  if (resolveItem) resolveItem.style.display = isTerminal ? 'none' : '';

  _closeIssActionsMenu();

  // Populate assigned-to dropdown
  await _ensureDevelopers();
  const sel = document.getElementById('issueAssignedTo');
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    _developersCache.map(u => {
      const label = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      const selected = u.username === issue.assigned_to ? ' selected' : '';
      return `<option value="${escHtml(u.username)}"${selected}>${escHtml(label)} (@${escHtml(u.username)})</option>`;
    }).join('');

  // Populate assigned-department dropdown
  _fillDeptSelect('issueReqDept', issue.request_to_department_id || '', true);

  // Resolution fields
  document.getElementById('issueResolutionNotes').value = issue.resolution_notes || '';
  document.getElementById('issueResolvedBy').value      = issue.resolved_by      || '';

  // Resolution actions + attachments
  _issResExistingUrls = Array.isArray(issue.resolution_attachment_urls) ? issue.resolution_attachment_urls.filter(Boolean) : [];
  _issResPendingFiles = [];
  await _loadActionsCache();
  const selectedActionIds = Array.isArray(issue.resolution_action_ids) ? issue.resolution_action_ids : [];
  _renderActionsGrid('issueActionsGrid', selectedActionIds);
  _renderResAttachPreviews('issueResAttachPreviews', _issResExistingUrls, _issResPendingFiles);

  resetIssueModal();
  document.getElementById('issueCommentInput').value = '';
  document.getElementById('issueModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadIssueActivity(id);
}

function closeIssueModal() {
  document.getElementById('issueModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingIssueId = null;
}

function overlayCloseIssue(e) {
  if (e.target === document.getElementById('issueModal')) closeIssueModal();
}

/* ── Linked item preview modal ── */
const _linkedItemTypeLabels = {
  dev_item:  { title: 'Dev Board Item',  endpoint: id => `/api/admin/linked/dev-item/${id}`  },
  task:      { title: 'Task Board Item', endpoint: id => `/api/admin/linked/task/${id}`       },
  user_task: { title: 'User Task',       endpoint: id => `/api/admin/linked/user-task/${id}`  },
};

async function openLinkedItemModal(type, id) {
  const meta  = _linkedItemTypeLabels[type];
  document.getElementById('linkedItemModalTitle').textContent = meta?.title || 'Linked Item';
  document.getElementById('linkedItemModalMeta').textContent  = '';
  document.getElementById('linkedItemModalBody').innerHTML    =
    '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  document.getElementById('linkedItemModal').classList.add('open');

  try {
    const res = await fetch(meta.endpoint(id), { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
    const item = await res.json();
    document.getElementById('linkedItemModalBody').innerHTML = _renderLinkedItemBody(type, item);
    document.getElementById('linkedItemModalMeta').textContent = _linkedItemCode(type, item);
  } catch (err) {
    document.getElementById('linkedItemModalBody').innerHTML =
      `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function _linkedItemCode(type, item) {
  if (type === 'dev_item') return item.dev_item_code || '';
  if (type === 'task')     return item.task_code     || '';
  return '';
}

function _linkedItemStatusCls(status) {
  const map = {
    pending: 'status-pending', ongoing: 'status-ongoing', coding: 'status-coding',
    testing: 'status-testing', done: 'status-done',
    open: 'status-open', in_progress: 'status-in-progress',
    resolved: 'status-resolved', closed: 'status-closed',
  };
  return map[status] || '';
}

function _fmtLinkedDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function _renderLinkedItemBody(type, item) {
  const rows = [];

  const statusHtml = item.status
    ? `<span class="linked-status-badge linked-status-${escHtml(item.status.replace('_','-'))}">${escHtml(item.status.replace('_',' '))}</span>`
    : '—';

  if (type === 'dev_item') {
    const name = escHtml(item.title || '—');
    const desc = item.description ? escHtml(item.description) : '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Title</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        `<div class="form-group"><label class="form-label">Type</label><p class="modal-detail-val">${escHtml(item.dev_item_type || '—')}</p></div>` +
      `</div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Start Date</label><p class="modal-detail-val">${_fmtLinkedDate(item.start_date)}</p></div>` +
        `<div class="form-group"><label class="form-label">Est. End Date</label><p class="modal-detail-val">${_fmtLinkedDate(item.estimated_end_date)}</p></div>` +
      `</div>`,
    );
    if (item.actual_end_date) rows.push(
      `<div class="form-group"><label class="form-label">Completed</label><p class="modal-detail-val">${_fmtLinkedDate(item.actual_end_date)}</p></div>`
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${desc.replace(/\n/g,'<br>')}</p></div>`
    );

  } else if (type === 'task') {
    const name = escHtml(item.task_name || '—');
    const desc = item.description ? escHtml(item.description) : '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Task Name</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        `<div class="form-group"><label class="form-label">Type</label><p class="modal-detail-val">${escHtml(item.task_type || '—')}</p></div>` +
      `</div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Start Date</label><p class="modal-detail-val">${_fmtLinkedDate(item.start_date)}</p></div>` +
        `<div class="form-group"><label class="form-label">Est. End Date</label><p class="modal-detail-val">${_fmtLinkedDate(item.estimated_end_date)}</p></div>` +
      `</div>`,
    );
    if (item.assigned_to) rows.push(
      `<div class="form-group"><label class="form-label">Assigned To</label><p class="modal-detail-val">${escHtml(item.assigned_to)}</p></div>`
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${desc.replace(/\n/g,'<br>')}</p></div>`
    );

  } else { // user_task
    const name = escHtml(item.title || '—');
    const desc = item.description ? escHtml(item.description) : '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Title</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        (item.department_name ? `<div class="form-group"><label class="form-label">Department</label><p class="modal-detail-val">${escHtml(item.department_name)}</p></div>` : '') +
      `</div>`,
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${desc.replace(/\n/g,'<br>')}</p></div>`
    );
  }

  return rows.join('');
}

function closeLinkedItemModal() {
  document.getElementById('linkedItemModal').classList.remove('open');
}

function overlayCloseLinkedItem(e) {
  if (e.target === document.getElementById('linkedItemModal')) closeLinkedItemModal();
}

function _toggleIssueResolution(status) {
  const isTerminal = status === 'resolved' || status === 'closed';
  ['issueResolutionGroup', 'issueResolvedByGroup', 'issueActionsGroup', 'issueResAttachGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isTerminal ? '' : 'none';
  });
}

function resetIssueModal() {
  document.getElementById('issueModalActions').style.display = '';
  document.getElementById('issueModalLoading').style.display = 'none';
  document.getElementById('issueModalError').style.display   = 'none';
}

/* ── Issue Activity & Comments ── */

function _renderIssueActivityEntries(entries) {
  const list = document.getElementById('issueActivityList');
  if (!entries || entries.length === 0) {
    list.innerHTML = '<div class="iss-activity-empty">No activity yet. Be the first to comment.</div>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const time = fmtDateTime(e.created_at);
    const user = escHtml(e.username || '?');
    let tag = '', body = '';
    if (e.type === 'comment') {
      tag  = '<span class="iss-act-tag iss-act-tag--comment">Comment</span>';
      body = `<div class="iss-act-text">${escHtml(e.text || '')}</div>`;
    } else if (e.type === 'moved') {
      const src = e.source === 'dev' ? 'Dev' : 'Task';
      tag  = `<span class="iss-act-tag iss-act-tag--moved">Moved · ${src}</span>`;
      body = `<div class="iss-act-text">${escHtml(e.from || 'None')}<span class="iss-act-arrow">→</span>${escHtml(e.to || '')}</div>`;
    } else {
      const src = e.source === 'dev' ? 'Dev' : 'Task';
      tag  = `<span class="iss-act-tag iss-act-tag--note">Note · ${src}</span>`;
      body = `<div class="iss-act-text">${escHtml(e.text || '')}</div>`;
    }
    return `<div class="iss-act-entry">
      <div class="iss-act-meta">${tag}<span class="iss-act-user">${user}</span><span class="iss-act-time">${time}</span></div>
      ${body}
    </div>`;
  }).join('');
}

async function loadIssueActivity(issueId) {
  const list = document.getElementById('issueActivityList');
  if (!list || !issueId) return;
  list.innerHTML = '<div class="iss-activity-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/issues/${encodeURIComponent(issueId)}/activity`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : [];
    _renderIssueActivityEntries(data);
  } catch {
    list.innerHTML = '<div class="iss-activity-empty">Failed to load activity.</div>';
  }
}

function refreshIssueActivity() { loadIssueActivity(_editingIssueId); }

async function postIssueComment() {
  const input   = document.getElementById('issueCommentInput');
  const comment = (input?.value || '').trim();
  if (!comment || !_editingIssueId) return;

  const btn = document.querySelector('#issueModal .iss-comment-submit');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/issues/${encodeURIComponent(_editingIssueId)}/comments`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ comment }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to post comment');
    input.value = '';
    await loadIssueActivity(_editingIssueId);
  } catch (err) {
    showToast(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveIssuePatch() {
  if (!_editingIssueId) return;
  const status     = document.getElementById('issueStatusSelect').value;
  const assignedTo = document.getElementById('issueAssignedTo').value || null;

  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';

  try {
    const isTerminal  = status === 'resolved' || status === 'closed';
    const reqDeptRaw  = document.getElementById('issueReqDept').value;

    // Upload pending resolution attachments before patching
    let resAttachUrls = undefined;
    if (isTerminal) {
      resAttachUrls = await _uploadIssResFiles(_editingIssueId);
    }

    const body = {
      status,
      assigned_to:              assignedTo,
      title:                    document.getElementById('issueTitleInput').value.trim() || null,
      request_to_department_id: reqDeptRaw ? parseInt(reqDeptRaw, 10) : null,
      resolution_notes:           isTerminal ? (document.getElementById('issueResolutionNotes').value.trim() || null) : undefined,
      resolved_by:                isTerminal ? (document.getElementById('issueResolvedBy').value.trim() || null)      : undefined,
      resolution_action_ids:      isTerminal ? _getCheckedActionIds('issueActionsGrid')                               : undefined,
      resolution_attachment_urls: isTerminal ? resAttachUrls                                                          : undefined,
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
  _closeIssActionsMenu();
  if (!await showConfirm({ title: 'Promote to Dev Item', message: 'Create a dev board item from this issue?', confirmText: 'Promote' })) return;

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

async function promoteIssueToTask() {
  if (!_editingIssueId) return;
  _closeIssActionsMenu();
  if (!await showConfirm({ title: 'Promote to Task', message: 'Create a task from this issue?', confirmText: 'Promote' })) return;
  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}/promote-task`, {
      method:  'POST',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    closeIssueModal();
    showToast('Issue promoted to task board.');
    loadIssues(_currentIssueStatus);
  } catch (err) {
    document.getElementById('issueModalLoading').style.display = 'none';
    document.getElementById('issueModalActions').style.display = '';
    document.getElementById('issueModalError').style.display   = '';
    document.getElementById('issueModalErrorMsg').textContent  = err.message;
  }
}

async function promoteIssueToUserTask() {
  if (!_editingIssueId) return;
  _closeIssActionsMenu();
  if (!await showConfirm({ title: 'Promote to User Task', message: 'Create a user task from this issue?', confirmText: 'Promote' })) return;
  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}/promote-user-task`, {
      method:  'POST',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    closeIssueModal();
    showToast('Issue promoted to user task.');
    loadIssues(_currentIssueStatus);
  } catch (err) {
    document.getElementById('issueModalLoading').style.display = 'none';
    document.getElementById('issueModalActions').style.display = '';
    document.getElementById('issueModalError').style.display   = '';
    document.getElementById('issueModalErrorMsg').textContent  = err.message;
  }
}

/* ── Common Issues ── */
/* ── Issue Link / Duplicate Modal ── */
let _linkTab           = 'issue';
let _linkSelectedId    = null;
let _linkSelectedLabel = '';
let _linkIssuesCache   = null;  // all issues for searching
let _linkTasksCache    = null;
let _linkDevCache      = null;
let _linkSearchTimers  = {};

function openIssueLinkModal() {
  _closeIssActionsMenu();
  _linkTab           = 'issue';
  _linkSelectedId    = null;
  _linkSelectedLabel = '';
  // Reset UI
  document.querySelectorAll('.iss-link-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.ltab === 'issue')
  );
  document.querySelectorAll('.iss-link-tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById('issueLinkTabIssue').style.display = '';
  document.getElementById('issueLinkIsDuplicate').checked = false;
  document.getElementById('issueLinkIssueSearch').value   = '';
  document.getElementById('issueLinkTaskSearch').value    = '';
  document.getElementById('issueLinkDevSearch').value     = '';
  _issueLinkClearResults();
  _issueLinkUpdateSelected();
  _issueLinkUpdateConfirmBtn();
  document.getElementById('issueLinkLoading').style.display = 'none';
  document.getElementById('issueLinkError').style.display   = 'none';
  document.getElementById('issueLinkModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeIssueLinkModal() {
  document.getElementById('issueLinkModal').classList.remove('open');
  // don't restore overflow — issue modal is still open behind it
}

function overlayCloseIssueLink(e) {
  if (e.target === document.getElementById('issueLinkModal')) closeIssueLinkModal();
}

function setIssueLinkTab(tab) {
  _linkTab        = tab;
  _linkSelectedId = null;
  document.querySelectorAll('.iss-link-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.ltab === tab)
  );
  document.querySelectorAll('.iss-link-tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`issueLinkTab${tab === 'issue' ? 'Issue' : tab === 'task' ? 'Task' : 'Dev'}`).style.display = '';
  _issueLinkUpdateSelected();
  _issueLinkUpdateConfirmBtn();
}

function issueLinkDupChange() {
  _issueLinkUpdateConfirmBtn();
}

function _issueLinkClearResults() {
  ['issueLinkIssueResults', 'issueLinkTaskResults', 'issueLinkDevResults'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="iss-link-hint">Type to search…</div>';
  });
}

function _issueLinkUpdateSelected() {
  const el    = document.getElementById('issueLinkSelected');
  const label = document.getElementById('issueLinkSelectedLabel');
  if (_linkSelectedId) {
    el.style.display   = '';
    label.textContent  = _linkSelectedLabel;
  } else {
    el.style.display   = 'none';
  }
}

function _issueLinkUpdateConfirmBtn() {
  const btn      = document.getElementById('issueLinkConfirmBtn');
  const labelEl  = document.getElementById('issueLinkConfirmLabel');
  const isDup    = document.getElementById('issueLinkIsDuplicate')?.checked;
  const enabled  = !!_linkSelectedId;
  btn.disabled   = !enabled;
  if (_linkTab === 'issue' && isDup) {
    labelEl.textContent = 'Mark Duplicate & Resolve';
    btn.classList.add('btn-modal-danger');
  } else {
    labelEl.textContent = 'Link';
    btn.classList.remove('btn-modal-danger');
  }
}

function issueLinkDeselect() {
  _linkSelectedId    = null;
  _linkSelectedLabel = '';
  _issueLinkUpdateSelected();
  _issueLinkUpdateConfirmBtn();
}

function issueLinkSearch(tab, q) {
  clearTimeout(_linkSearchTimers[tab]);
  _linkSearchTimers[tab] = setTimeout(() => _doIssueLinkSearch(tab, q.trim()), 280);
}

async function _doIssueLinkSearch(tab, q) {
  const resultsId = tab === 'issue' ? 'issueLinkIssueResults'
    : tab === 'task' ? 'issueLinkTaskResults' : 'issueLinkDevResults';
  const wrap = document.getElementById(resultsId);
  if (!wrap) return;

  if (!q) {
    wrap.innerHTML = '<div class="iss-link-hint">Type to search…</div>';
    return;
  }

  wrap.innerHTML = '<div class="iss-link-hint"><div class="spinner" style="width:14px;height:14px;margin-right:6px;display:inline-block;vertical-align:middle"></div>Searching…</div>';

  try {
    let items = [];
    if (tab === 'issue') {
      // exclude the currently-editing issue
      const res = await fetch(`/api/admin/issues/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const all = res.ok ? await res.json() : [];
      items = all.filter(i => i.id !== _editingIssueId);
    } else if (tab === 'task') {
      if (!_linkTasksCache) {
        const res = await fetch('/api/tasks', { headers: authHeaders() });
        _linkTasksCache = res.ok ? await res.json() : [];
      }
      const ql = q.toLowerCase();
      items = _linkTasksCache.filter(t =>
        (t.task_name || '').toLowerCase().includes(ql) ||
        (t.description || '').toLowerCase().includes(ql)
      ).slice(0, 20);
    } else {
      if (!_linkDevCache) {
        const res = await fetch('/api/dev/items', { headers: authHeaders() });
        _linkDevCache = res.ok ? await res.json() : [];
      }
      const ql = q.toLowerCase();
      items = _linkDevCache.filter(d =>
        (d.title || '').toLowerCase().includes(ql) ||
        (d.description || '').toLowerCase().includes(ql)
      ).slice(0, 20);
    }

    if (!items.length) {
      wrap.innerHTML = '<div class="iss-link-hint">No results found.</div>';
      return;
    }

    wrap.innerHTML = items.map(item => {
      let id, primary, secondary, statusText;
      if (tab === 'issue') {
        id         = item.id;
        primary    = escHtml(item.ticket_number ? `#${item.ticket_number}` : item.id.slice(0, 8));
        secondary  = escHtml(item.title || (item.description || '').slice(0, 80));
        statusText = `<span class="iss-link-status iss-link-status--${(item.status||'').replace('_','-')}">${escHtml(item.status || '')}</span>`;
      } else if (tab === 'task') {
        id         = item.id;
        primary    = escHtml(item.task_name || 'Untitled');
        secondary  = escHtml(item.description ? item.description.slice(0, 80) : '');
        statusText = `<span class="iss-link-status">${escHtml(item.status || '')}</span>`;
      } else {
        id         = item.id;
        primary    = escHtml(item.title || 'Untitled');
        secondary  = escHtml(item.description ? item.description.slice(0, 80) : '');
        statusText = `<span class="iss-link-status">${escHtml(item.status || '')}</span>`;
      }
      const isSelected = id === _linkSelectedId;
      return `<div class="iss-link-item${isSelected ? ' selected' : ''}" onclick='_selectLinkItem(${JSON.stringify(id)}, ${JSON.stringify(primary + (secondary ? ' — ' + item.title || item.task_name || item.description?.slice(0,60) : ''))})'>
        <div class="iss-link-item-primary">${primary} ${statusText}</div>
        ${secondary ? `<div class="iss-link-item-secondary">${secondary}</div>` : ''}
      </div>`;
    }).join('');

  } catch (err) {
    wrap.innerHTML = `<div class="iss-link-hint">Search failed: ${escHtml(err.message)}</div>`;
  }
}

function _selectLinkItem(id, label) {
  _linkSelectedId    = id;
  _linkSelectedLabel = label;
  // Mark selected in results
  document.querySelectorAll('.iss-link-item').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('onclick').includes(JSON.stringify(id)));
  });
  _issueLinkUpdateSelected();
  _issueLinkUpdateConfirmBtn();
}

async function confirmIssueLink() {
  if (!_linkSelectedId || !_editingIssueId) return;
  const isDup   = _linkTab === 'issue' && document.getElementById('issueLinkIsDuplicate').checked;
  const loadEl  = document.getElementById('issueLinkLoading');
  const errEl   = document.getElementById('issueLinkError');
  const actEl   = document.getElementById('issueLinkConfirmBtn');
  loadEl.style.display = '';
  errEl.style.display  = 'none';
  actEl.disabled       = true;
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}/link`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ link_type: _linkTab, target_id: _linkSelectedId, is_duplicate: isDup }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Link failed');
    closeIssueLinkModal();
    showToast(isDup ? 'Marked as duplicate and resolved.' : 'Issue linked.');
    // Reload issues and re-open modal with fresh data
    await loadIssues(_currentIssueStatus);
    setTimeout(() => openIssueModal(_editingIssueId), 0);
  } catch (err) {
    loadEl.style.display = 'none';
    actEl.disabled       = false;
    errEl.style.display  = '';
    document.getElementById('issueLinkErrorMsg').textContent = err.message;
  }
}

let _ciData      = null;   // { by_system: [...], by_category: [...] }
let _ciGroupBy   = 'system';
let _ciSearch    = '';
let _ciExpanded  = new Set();
let _ciShowCharts = true;
let _ciMetric     = 'volume'; // 'volume' | 'open_age' | 'res_time'
let _ciFilter     = 'all';    // 'all' | 'dev_item' | 'task' | 'quick' | 'duplicate'

async function loadCommonIssues(force = false) {
  if (_ciData && !force) { _renderCommonIssues(); return; }
  document.getElementById('ci-body').innerHTML =
    '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/common-issues', { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _ciData = await res.json();
    _ciExpanded.clear();
    _renderCommonIssues();
  } catch (err) {
    document.getElementById('ci-body').innerHTML =
      `<div class="admin-empty">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

function ciSetGroupBy(mode) {
  _ciGroupBy = mode;
  _ciExpanded.clear();
  document.getElementById('ciToggleSystem').classList.toggle('active', mode === 'system');
  document.getElementById('ciToggleCategory').classList.toggle('active', mode === 'category');
  _renderCommonIssues();
}

function ciSetFilter(f) {
  _ciFilter = f;
  _ciExpanded.clear();
  document.querySelectorAll('.ci-filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === f)
  );
  _renderCommonIssues();
}

function ciToggleCharts() {
  _ciShowCharts = !_ciShowCharts;
  const el  = document.getElementById('ci-analytics');
  const btn = document.getElementById('ciAnalyticsBtn');
  if (el)  el.hidden = !_ciShowCharts;
  if (btn) btn.classList.toggle('active', _ciShowCharts);
  if (_ciShowCharts) _renderCiCharts();
}

function ciSetMetric(m) {
  _ciMetric = m;
  document.querySelectorAll('.ci-metric-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.metric === m)
  );
  _ciDrawBars((_ciGroupBy === 'system' ? _ciData?.by_system : _ciData?.by_category) || []);
}

function _renderCiCharts() {
  if (!_ciData || !_ciShowCharts) return;
  const groups   = (_ciGroupBy === 'system' ? _ciData.by_system : _ciData.by_category) || [];
  const gs       = _ciData.global_stats || {};
  const total    = gs.total    ?? groups.reduce((s, g) => s + g.total,    0);
  const resolved = gs.resolved ?? groups.reduce((s, g) => s + g.resolved, 0);
  const open     = gs.open     ?? groups.reduce((s, g) => s + g.open,     0);

  // Extended stat chips
  const devCount   = gs.via_dev_item   ?? 0;
  const taskCount  = gs.via_task       ?? 0;
  const quickCount = gs.quick_resolved ?? 0;
  const dupCount   = gs.duplicates     ?? 0;
  const avgAge = gs.avg_open_age_days != null
    ? `<span class="ci-stat ci-stat--age"><span class="ci-stat-num">${gs.avg_open_age_days}</span> avg open days</span>`
    : '';
  const avgRes = gs.avg_resolution_days != null
    ? `<span class="ci-stat ci-stat--res"><span class="ci-stat-num">${gs.avg_resolution_days}</span> avg res. days</span>`
    : '';
  const fastRes = gs.min_resolution_days != null
    ? `<span class="ci-stat ci-stat--fast"><span class="ci-stat-num">${gs.min_resolution_days}</span> fastest res.</span>`
    : '';
  document.getElementById('ciStats').innerHTML =
    `<span class="ci-stat"><span class="ci-stat-num">${total}</span> total</span>` +
    `<span class="ci-stat ci-stat--resolved"><span class="ci-stat-num">${resolved}</span> resolved</span>` +
    `<span class="ci-stat ci-stat--open"><span class="ci-stat-num">${open}</span> open</span>` +
    `<span class="ci-stat ci-stat-sep"></span>` +
    `<span class="ci-stat ci-stat--dev" title="Resolved by creating a dev item"><span class="ci-stat-num">${devCount}</span> via dev item</span>` +
    `<span class="ci-stat ci-stat--task" title="Resolved by creating a task"><span class="ci-stat-num">${taskCount}</span> via task</span>` +
    `<span class="ci-stat ci-stat--quick" title="Resolved immediately without a dev item or task"><span class="ci-stat-num">${quickCount}</span> quick fix</span>` +
    `<span class="ci-stat ci-stat--dup" title="Marked as duplicate"><span class="ci-stat-num">${dupCount}</span> duplicate</span>` +
    avgAge + avgRes + fastRes;

  _ciDrawRing(resolved, open, total);
  _ciDrawBars(groups);
}

function _ciDrawRing(resolved, open, total) {
  const svg      = document.getElementById('ciRingChart');
  const pctEl    = document.getElementById('ciRingPct');
  const legendEl = document.getElementById('ciRingLegend');
  if (!svg || !pctEl || !legendEl) return;

  const R    = 62, cx = 80, cy = 80, sw = 15;
  const circ = 2 * Math.PI * R;
  const resPct  = total > 0 ? resolved / total : 0;
  const openPct = total > 0 ? open / total : 0;
  const resArc  = circ * resPct;
  const openArc = circ * openPct;
  const startOff = circ * 0.25; // 12 o'clock

  svg.innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
      stroke="rgba(255,255,255,0.05)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
      stroke="rgba(212,150,50,0.28)" stroke-width="${sw}"
      stroke-dasharray="0 ${circ}"
      stroke-dashoffset="${startOff}"
      stroke-linecap="round"
      class="ci-ring-arc" id="ciOpenArc"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
      stroke="#C4972A" stroke-width="${sw}"
      stroke-dasharray="0 ${circ}"
      stroke-dashoffset="${startOff}"
      stroke-linecap="round"
      class="ci-ring-arc" id="ciResArc"/>`;

  pctEl.textContent = total > 0 ? Math.round(resPct * 100) + '%' : '—';

  legendEl.innerHTML = `
    <div class="ci-legend-row">
      <div class="ci-legend-dot" style="background:#C4972A"></div>
      <span>Resolved</span><span class="ci-legend-val">${resolved}</span>
    </div>
    <div class="ci-legend-row">
      <div class="ci-legend-dot" style="background:rgba(212,150,50,0.4)"></div>
      <span>Open</span><span class="ci-legend-val">${open}</span>
    </div>
    <div class="ci-legend-row">
      <div class="ci-legend-dot" style="background:rgba(255,255,255,0.07);outline:1px solid rgba(255,255,255,0.12)"></div>
      <span>Total</span><span class="ci-legend-val">${total}</span>
    </div>`;

  // Animate arcs after paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const resEl  = document.getElementById('ciResArc');
    const openEl = document.getElementById('ciOpenArc');
    if (resEl)  resEl.setAttribute('stroke-dasharray',  `${resArc} ${circ - resArc}`);
    if (openEl && open > 0) {
      openEl.setAttribute('stroke-dasharray',  `${openArc} ${circ - openArc}`);
      openEl.setAttribute('stroke-dashoffset', startOff - resArc);
    }
  }));
}

function _ciAvg(arr) {
  const vals = (arr || []).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function _ciDrawBars(groups) {
  const wrap     = document.getElementById('ciBarsChart');
  const subLabel = document.getElementById('ciBarsSubLabel');
  if (!wrap) return;

  // Sort by the active metric so highest-value groups appear first
  let sorted;
  if (_ciMetric === 'open_age') {
    sorted = [...groups]
      .map(g => ({ ...g, _val: _ciAvg(g.open_ages_days) }))
      .filter(g => g._val != null)
      .sort((a, b) => b._val - a._val)
      .slice(0, 10);
  } else if (_ciMetric === 'res_time') {
    sorted = [...groups]
      .map(g => ({ ...g, _val: _ciAvg(g.resolutions.map(r => r.resolution_days)) }))
      .filter(g => g._val != null)
      .sort((a, b) => b._val - a._val)
      .slice(0, 10);
  } else {
    sorted = groups.slice(0, 10).map(g => ({ ...g, _val: g.total }));
  }

  if (subLabel) {
    const total = groups.length;
    const shown = sorted.length;
    const metricLabel = _ciMetric === 'open_age' ? 'with open issues'
      : _ciMetric === 'res_time' ? 'with resolution data' : '';
    subLabel.textContent = shown < total
      ? `top ${shown} of ${total}${metricLabel ? ' · ' + metricLabel : ''}`
      : `${total} group${total !== 1 ? 's' : ''}${metricLabel ? ' · ' + metricLabel : ''}`;
  }

  if (!sorted.length) {
    const msg = _ciMetric === 'open_age' ? 'No open issues to show aging data.'
      : _ciMetric === 'res_time' ? 'No resolved issues with timing data.'
      : 'No data.';
    wrap.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px 0">${msg}</div>`;
    return;
  }

  const maxVal = Math.max(...sorted.map(g => g._val), 0.1);

  if (_ciMetric === 'volume') {
    wrap.innerHTML = sorted.map(g => {
      const totalW = (g.total / maxVal) * 100;
      const resW   = g.total > 0 ? (g.resolved / g.total) * totalW : 0;
      const resPct = g.total > 0 ? Math.round((g.resolved / g.total) * 100) : 0;
      const label  = escHtml(g.group.length > 22 ? g.group.slice(0, 20) + '…' : g.group);
      return `
        <div class="ci-bar-row">
          <div class="ci-bar-label" title="${escHtml(g.group)}">${label}</div>
          <div class="ci-bar-track">
            <div class="ci-bar-total" style="width:${totalW}%"></div>
            <div class="ci-bar-res" data-w="${resW}%" style="width:0%">
              ${resPct > 0 ? `<span class="ci-bar-pct">${resPct}%</span>` : ''}
            </div>
          </div>
          <div class="ci-bar-num">${g.total}</div>
        </div>`;
    }).join('');

  } else if (_ciMetric === 'open_age') {
    wrap.innerHTML = sorted.map(g => {
      const val    = g._val;
      const w      = (val / maxVal) * 100;
      const label  = escHtml(g.group.length > 22 ? g.group.slice(0, 20) + '…' : g.group);
      // Color: green <7d, amber 7–30d, red >30d
      const color  = val < 7 ? '#52A870' : val < 30 ? '#D49632' : '#D85858';
      const dispVal = val < 1 ? '<1' : Math.round(val);
      return `
        <div class="ci-bar-row">
          <div class="ci-bar-label" title="${escHtml(g.group)}">${label}</div>
          <div class="ci-bar-track">
            <div class="ci-bar-res ci-bar-age" data-w="${w}%" data-color="${color}" style="width:0%;background:${color}">
              <span class="ci-bar-pct">${dispVal}d</span>
            </div>
          </div>
          <div class="ci-bar-num ci-bar-num--days">${dispVal}<span class="ci-bar-unit">d</span></div>
        </div>`;
    }).join('');

  } else { // res_time
    wrap.innerHTML = sorted.map(g => {
      const val    = g._val;
      const w      = (val / maxVal) * 100;
      const label  = escHtml(g.group.length > 22 ? g.group.slice(0, 20) + '…' : g.group);
      const color  = val < 1 ? '#52A870' : val < 7 ? '#C4972A' : '#D85858';
      const dispVal = val < 1 ? '<1' : Math.round(val);
      const count  = g.resolutions.length;
      return `
        <div class="ci-bar-row">
          <div class="ci-bar-label" title="${escHtml(g.group)}">${label}</div>
          <div class="ci-bar-track">
            <div class="ci-bar-res ci-bar-restime" data-w="${w}%" data-color="${color}" style="width:0%;background:${color}">
              <span class="ci-bar-pct">${dispVal}d</span>
            </div>
          </div>
          <div class="ci-bar-num ci-bar-num--days">${dispVal}<span class="ci-bar-unit">d</span>
            <span class="ci-bar-count-sub">${count} res.</span>
          </div>
        </div>`;
    }).join('');
  }

  requestAnimationFrame(() => {
    wrap.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w; });
  });
}

function ciSearch(q) {
  _ciSearch = q.trim().toLowerCase();
  document.getElementById('ciSearchClear').style.display = q ? '' : 'none';
  _renderCommonIssues();
}

function ciClearSearch() {
  document.getElementById('ciSearchInput').value = '';
  ciSearch('');
}

function ciToggleGroup(groupKey) {
  if (_ciExpanded.has(groupKey)) _ciExpanded.delete(groupKey);
  else _ciExpanded.add(groupKey);
  _renderCommonIssues();
}

function _renderCommonIssues() {
  if (!_ciData) return;
  let groups = (_ciGroupBy === 'system' ? _ciData.by_system : _ciData.by_category) || [];

  // Apply search filter on group names
  if (_ciSearch) groups = groups.filter(g => g.group.toLowerCase().includes(_ciSearch));

  // Apply resolution type filter — narrows the resolutions shown per group
  let displayGroups = groups;
  if (_ciFilter !== 'all') {
    displayGroups = groups.map(g => {
      const filteredRes = (g.resolutions || []).filter(r => r.res_type === _ciFilter);
      if (!filteredRes.length) return null;
      return { ...g, resolutions: filteredRes };
    }).filter(Boolean);
  }

  // Always show global stats (not filtered so numbers stay consistent)
  _renderCiCharts();

  if (!displayGroups.length) {
    document.getElementById('ci-body').innerHTML =
      '<div class="admin-empty">No groups found.</div>';
    return;
  }

  document.getElementById('ci-body').innerHTML = displayGroups.map(g => _renderCiGroup(g)).join('');
}

function _renderCiGroup(g) {
  const key      = escHtml(g.group);
  const expanded = _ciExpanded.has(g.group);
  const hasRes   = g.resolutions && g.resolutions.length > 0;

  const resolvedPct = g.total > 0 ? Math.round((g.resolved / g.total) * 100) : 0;

  return `<div class="ci-group-card${expanded ? ' expanded' : ''}">
    <div class="ci-group-header" onclick='ciToggleGroup(${JSON.stringify(g.group)})'>
      <div class="ci-group-title-row">
        <svg class="ci-chevron" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="ci-group-name">${key}</span>
        <span class="ci-badge-total">${g.total}</span>
      </div>
      <div class="ci-group-meta">
        <span class="ci-meta-resolved">${g.resolved} resolved</span>
        <span class="ci-meta-open">${g.open} open</span>
        <div class="ci-pct-bar"><div class="ci-pct-fill" style="width:${resolvedPct}%"></div></div>
      </div>
    </div>
    <div class="ci-group-body">
      ${hasRes ? g.resolutions.map(_renderCiResolution).join('') : '<p class="ci-no-res">No resolutions recorded yet.</p>'}
    </div>
  </div>`;
}

const _ciResTypeLabels = {
  dev_item:  { label: 'Dev Item',  cls: 'ci-res-type--dev_item'  },
  task:      { label: 'Task',      cls: 'ci-res-type--task'      },
  quick:     { label: 'Quick Fix', cls: 'ci-res-type--quick'     },
  duplicate: { label: 'Duplicate', cls: 'ci-res-type--duplicate' },
};

function _renderCiResolution(r) {
  const title    = escHtml(r.title || (r.description || '').slice(0, 80) + ((r.description || '').length > 80 ? '…' : ''));
  const desc     = r.description ? escHtml(r.description.slice(0, 160)) + (r.description.length > 160 ? '…' : '') : '';
  const date     = r.resolved_at ? new Date(r.resolved_at).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '';
  const resolver = r.resolved_by ? `<span class="ci-res-by">by ${escHtml(r.resolved_by)}</span>` : '';
  const ticket   = r.ticket_number ? `<span class="ci-res-ticket">${escHtml(r.ticket_number)}</span>` : '';
  const reporter = r.employee_name ? `<span class="ci-res-reporter">${escHtml(r.employee_name)}${r.company_name ? ` · ${escHtml(r.company_name)}` : ''}</span>` : '';

  const rtMeta   = _ciResTypeLabels[r.res_type];
  const typeBadge = rtMeta
    ? `<span class="ci-res-type ${rtMeta.cls}">${rtMeta.label}</span>`
    : '';

  const noteHtml = r.resolution_notes
    ? `<div class="ci-res-notes">${escHtml(r.resolution_notes).replace(/\n/g, '<br>')}</div>`
    : '';

  const actionHtml = (r.resolution_action_names || []).length
    ? `<div class="ci-res-actions">${r.resolution_action_names.map(n =>
        `<span class="ci-action-pill">&#10003;&nbsp;${escHtml(n)}</span>`).join('')}</div>`
    : '';

  const thumbHtml = (r.resolution_attachment_urls || []).length
    ? `<div class="ci-res-thumbs">${r.resolution_attachment_urls.map(u =>
        `<a href="${escHtml(u)}" target="_blank" rel="noopener"><img src="${escHtml(u)}" class="ci-thumb" alt="attachment"></a>`
      ).join('')}</div>`
    : '';

  const statusCls = r.status === 'resolved' ? 'ci-status-resolved' : 'ci-status-closed';

  return `<div class="ci-resolution-item">
    <div class="ci-res-header">
      <div class="ci-res-title-row">
        ${ticket}
        <span class="ci-res-title">${title}</span>
        ${typeBadge}
        <span class="ci-res-status ${statusCls}">${r.status}</span>
      </div>
      <div class="ci-res-meta">${reporter}${date ? `<span class="ci-res-date">${date}</span>` : ''}${resolver}</div>
    </div>
    ${desc ? `<p class="ci-res-desc">${desc}</p>` : ''}
    ${noteHtml}
    ${actionHtml}
    ${thumbHtml}
  </div>`;
}

/* ── Resolution: actions checklist + image attachments ── */
let _actionsCache        = null;
let _issResExistingUrls  = [];
let _issResPendingFiles  = [];

async function _loadActionsCache() {
  if (_actionsCache) return _actionsCache;
  try {
    const r = await fetch('/api/actions');
    _actionsCache = r.ok ? await r.json() : [];
  } catch { _actionsCache = []; }
  return _actionsCache;
}

function _renderActionsGrid(gridId, selectedIds = []) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const actions = _actionsCache || [];
  if (!actions.length) {
    grid.innerHTML = '<span class="res-actions-empty">No actions configured.</span>';
    return;
  }
  grid.innerHTML = actions.map(a => {
    const checked = selectedIds.includes(a.action_id) ? ' checked' : '';
    const cls     = selectedIds.includes(a.action_id) ? ' checked' : '';
    return `<label class="res-action-item${cls}" title="${escHtml(a.action_desc || '')}">
      <input type="checkbox" value="${a.action_id}"${checked} onchange="this.closest('.res-action-item').classList.toggle('checked',this.checked)">
      ${escHtml(a.action_name)}
    </label>`;
  }).join('');
}

function _getCheckedActionIds(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => parseInt(cb.value, 10));
}

function _renderResAttachPreviews(previewsId, existingUrls, pendingFiles) {
  const wrap = document.getElementById(previewsId);
  if (!wrap) return;
  const totalCount = existingUrls.length + pendingFiles.length;
  const addBtn = document.getElementById(previewsId.replace('Previews', 'AddBtn'));
  if (addBtn) addBtn.style.display = totalCount >= 5 ? 'none' : '';

  let html = existingUrls.map((url, i) => `
    <div class="res-attach-thumb" data-index="${i}" data-type="existing">
      <img src="${escHtml(url)}" alt="attachment">
      <button type="button" class="res-attach-remove" onclick="issResRemoveExisting(${i})" title="Remove">&times;</button>
    </div>`).join('');
  html += pendingFiles.map((f, i) => `
    <div class="res-attach-thumb" data-index="${i}" data-type="pending">
      <img src="${escHtml(URL.createObjectURL(f))}" alt="${escHtml(f.name)}">
      <button type="button" class="res-attach-remove" onclick="issResRemovePending(${i})" title="Remove">&times;</button>
    </div>`).join('');
  wrap.innerHTML = html;
}

function issResAttachChange(input) {
  const remaining = 5 - _issResExistingUrls.length - _issResPendingFiles.length;
  const files = Array.from(input.files).slice(0, remaining);
  _issResPendingFiles.push(...files);
  input.value = '';
  _renderResAttachPreviews('issueResAttachPreviews', _issResExistingUrls, _issResPendingFiles);
}

function issResRemoveExisting(i) {
  _issResExistingUrls.splice(i, 1);
  _renderResAttachPreviews('issueResAttachPreviews', _issResExistingUrls, _issResPendingFiles);
}

function issResRemovePending(i) {
  _issResPendingFiles.splice(i, 1);
  _renderResAttachPreviews('issueResAttachPreviews', _issResExistingUrls, _issResPendingFiles);
}

async function _uploadIssResFiles(issueId) {
  const urls = [];
  for (const file of _issResPendingFiles) {
    const fd = new FormData();
    fd.append('entity_type', 'issue');
    fd.append('entity_id',   issueId);
    fd.append('file',        file);
    try {
      const r = await fetch('/api/upload/resolution', { method: 'POST', headers: authHeaders(), body: fd });
      const d = await r.json();
      if (d.url) urls.push(d.url);
    } catch {}
  }
  return [..._issResExistingUrls, ...urls];
}

/* ── Issue Actions submenu ── */
let _issActionsOpen = false;

function toggleIssActionsMenu(e) {
  if (e) e.stopPropagation();
  _issActionsOpen ? _closeIssActionsMenu() : _openIssActionsMenu();
}

function _openIssActionsMenu() {
  _issActionsOpen = true;
  document.getElementById('issActionsMenu')?.classList.add('open');
  document.getElementById('issActionsWrap')?.classList.add('open');
}

function _closeIssActionsMenu() {
  _issActionsOpen = false;
  document.getElementById('issActionsMenu')?.classList.remove('open');
  document.getElementById('issActionsWrap')?.classList.remove('open');
}

async function quickResolveIssue() {
  if (!_editingIssueId) return;
  _closeIssActionsMenu();
  if (!await showConfirm({ title: 'Resolve Issue', message: 'Mark this issue as resolved?', confirmText: 'Resolve' })) return;
  document.getElementById('issueModalActions').style.display = 'none';
  document.getElementById('issueModalLoading').style.display = '';
  document.getElementById('issueModalError').style.display   = 'none';
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_editingIssueId)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'resolved' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resolve issue');
    closeIssueModal();
    showToast('Issue marked as resolved.');
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

  const skelCell = () => `<td class="dp-stat-td"><span class="dp-skel dp-skel-stat"></span></td>`;
  const skelRow  = (delay) => `
    <tr class="dp-row" style="pointer-events:none;opacity:${0.4 + delay * 0.15};">
      <td class="dp-avatar-td">
        <div class="dp-avatar"><span class="dp-skel dp-skel-avatar" style="animation-delay:${delay * 0.12}s"></span></div>
        <div class="dp-dev-info">
          <span class="dp-skel dp-skel-name" style="animation-delay:${delay * 0.12}s"></span>
          <span class="dp-skel dp-skel-org"  style="animation-delay:${delay * 0.12 + 0.06}s"></span>
        </div>
      </td>
      ${Array(6).fill(0).map(() => skelCell()).join('')}
    </tr>`;

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
      <tbody>${[0,1,2,3,4].map(skelRow).join('')}</tbody>
    </table>`;

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

function setDpPdfPreset(preset) {
  const today   = new Date();
  const fmt     = d => d.toISOString().slice(0, 10);
  const fromEl  = document.getElementById('dpPdfFrom');
  const toEl    = document.getElementById('dpPdfTo');

  if (preset === '30d') {
    const from = new Date(today); from.setDate(from.getDate() - 30);
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === '90d') {
    const from = new Date(today); from.setDate(from.getDate() - 90);
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === 'year') {
    if (fromEl) fromEl.value = `${today.getFullYear()}-01-01`;
    if (toEl)   toEl.value   = fmt(today);
  }
  // 'custom' keeps whatever the inputs currently hold

  document.querySelectorAll('.dp-pdf-preset').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.preset === preset)
  );
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

  setDpPdfPreset('year');

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

      <div class="dp-section">
        <div class="dp-section-title">Dev Items <span class="dp-section-count">${dev.items.length}</span></div>
        ${itemsHtml}
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Tasks <span class="dp-section-count">${(dev.tasks || []).length}</span></div>
        ${(dev.tasks || []).length ? `
        <div class="dp-items-wrap">
          <table class="dp-items-table">
            <thead><tr>
              <th>#</th><th>Task Name</th><th>Type</th>
              <th>Status</th><th>Started</th><th>Est. End</th><th>Actual End</th>
            </tr></thead>
            <tbody>${(dev.tasks || []).map((t, i) => {
              const fmtDate = d => d ? String(d).slice(0, 10) : '—';
              const TASK_CLS = { completed: 'dp-status-done', 'in-progress': 'dp-status-ongoing', pending: 'dp-status-pending', cancelled: 'dp-status-cancelled' };
              return `<tr>
                <td class="dp-item-num">${i + 1}</td>
                <td class="dp-item-title">${escHtml(t.task_name || '—')}</td>
                <td>${escHtml(t.task_type || '—')}</td>
                <td><span class="dp-item-status ${TASK_CLS[t.status] || ''}">${escHtml(t.status || '—')}</span></td>
                <td>${fmtDate(t.start_date)}</td>
                <td>${fmtDate(t.estimated_end_date)}</td>
                <td>${fmtDate(t.actual_end_date)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<span class="dp-no-data">No tasks assigned.</span>'}
      </div>

      <div class="dp-section dp-section-last">
        <div class="dp-section-title">Issues <span class="dp-section-count">${(dev.issues || []).length}</span></div>
        ${(dev.issues || []).length ? `
        <div class="dp-items-wrap">
          <table class="dp-items-table">
            <thead><tr>
              <th>#</th><th>Ticket #</th><th>Title</th><th>System</th>
              <th>Category</th><th>Priority</th><th>Status</th>
            </tr></thead>
            <tbody>${(dev.issues || []).map((iss, i) => {
              const PRIO_CLS = { high: 'dp-prio-high', medium: 'dp-prio-medium', low: 'dp-prio-low' };
              const STAT_CLS = { resolved: 'dp-status-done', open: 'dp-status-pending', 'in-progress': 'dp-status-ongoing', closed: 'dp-status-cancelled' };
              return `<tr>
                <td class="dp-item-num">${i + 1}</td>
                <td style="white-space:nowrap">${escHtml(iss.ticket_number || '—')}</td>
                <td class="dp-item-title">${escHtml(iss.title || '—')}</td>
                <td>${escHtml(iss.site_name || '—')}</td>
                <td>${escHtml(iss.request_category || '—')}</td>
                <td><span class="dp-item-status ${PRIO_CLS[(iss.priority || '').toLowerCase()] || ''}">${escHtml(iss.priority || '—')}</span></td>
                <td><span class="dp-item-status ${STAT_CLS[(iss.status || '').toLowerCase()] || ''}">${escHtml(iss.status || '—')}</span></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<span class="dp-no-data">No issues assigned.</span>'}
      </div>`;
}

function downloadDevPerfPdf() {
  if (!_devPerfSelected) return;

  const dateFrom        = document.getElementById('dpPdfFrom')?.value    || '';
  const dateTo          = document.getElementById('dpPdfTo')?.value      || '';
  const includeHeader   = document.getElementById('dpPdfHeader')?.checked   !== false;
  const includeBranding = document.getElementById('dpPdfBranding')?.checked !== false;

  const filterByDate = (arr, field) => {
    if (!dateFrom && !dateTo) return arr || [];
    return (arr || []).filter(item => {
      const d = (item[field] || '').slice(0, 10);
      if (!d) return true;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo  ) return false;
      return true;
    });
  };

  const filtered = {
    ..._devPerfSelected,
    items:  filterByDate(_devPerfSelected.items,  'start_date'),
    tasks:  filterByDate(_devPerfSelected.tasks,  'start_date'),
    issues: filterByDate(_devPerfSelected.issues, 'created_at'),
  };

  const printArea = document.getElementById('devPerfPrintArea');
  printArea.innerHTML = _buildPrintHtml(filtered, { includeHeader, includeBranding, dateFrom, dateTo });
  window.print();
  setTimeout(() => { printArea.innerHTML = ''; }, 1000);
}

/* ── Configurations Tab ─────────────────────────────────────────────────── */

function switchConfigTab(ctab) {
  _currentConfigTab = ctab;
  document.querySelectorAll('#configSubTabs .status-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.ctab === ctab)
  );
  document.querySelectorAll('.config-sub-panel').forEach(p => {
    p.style.display = (p.id === `config-panel-${ctab}`) ? '' : 'none';
  });
  _loadCurrentConfigSub();
}

function _loadCurrentConfigSub() {
  if (_currentConfigTab === 'companies')          loadCfgCompanies();
  if (_currentConfigTab === 'request-categories') loadCfgCategories();
  if (_currentConfigTab === 'request-types')      loadCfgTypes();
  if (_currentConfigTab === 'non-software-items') loadCfgNsi();
  if (_currentConfigTab === 'brands')             loadCfgBrands();
  if (_currentConfigTab === 'departments')        loadCfgDepts();
  if (_currentConfigTab === 'actions')            loadCfgActions();
}

/* shared modal helpers */
function _resetCfgModal(prefix) {
  document.getElementById(`${prefix}FormActions`).style.display = '';
  document.getElementById(`${prefix}FormLoading`).style.display = 'none';
  document.getElementById(`${prefix}FormError`).style.display   = 'none';
}
function _setCfgLoading(prefix, loading) {
  document.getElementById(`${prefix}FormActions`).style.display = loading ? 'none' : '';
  document.getElementById(`${prefix}FormLoading`).style.display = loading ? ''     : 'none';
}
function _showCfgError(prefix, msg) {
  document.getElementById(`${prefix}FormError`).style.display = '';
  document.getElementById(`${prefix}ErrorMsg`).textContent = msg;
}

/* ── Companies ── */

async function loadCfgCompanies() {
  const wrap = document.getElementById('config-companies-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/companies', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgCompaniesCache = await res.json();
    _renderCfgCompanies();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgCompanies() {
  const wrap = document.getElementById('config-companies-body');
  if (!_cfgCompaniesCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No companies. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Code</th><th>Name</th><th></th></tr></thead>
      <tbody>${_cfgCompaniesCache.map(c => `
        <tr>
          <td><code class="mono-val">${escHtml(c.company_code)}</code></td>
          <td>${escHtml(c.name)}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgCompanyModal(${JSON.stringify(c)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgCompany('${escHtml(c.company_code)}')">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCfgCompanyModal(company) {
  _cfgCompanyEditCode = company ? company.company_code : null;
  document.getElementById('cfgCompanyModalTitle').textContent = _cfgCompanyEditCode ? 'Edit Company' : 'Add Company';
  const codeField = document.getElementById('cfgCompanyCode');
  codeField.value    = company?.company_code ?? '';
  codeField.disabled = !!_cfgCompanyEditCode;
  document.getElementById('cfgCompanyName').value = company?.name ?? '';
  _resetCfgModal('cfgCompany');
  document.getElementById('cfgCompanyModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgCompanyModal() {
  document.getElementById('cfgCompanyModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgCompanyEditCode = null;
}

function overlayCfgCompany(e) {
  if (e.target === document.getElementById('cfgCompanyModal')) closeCfgCompanyModal();
}

async function saveCfgCompany(e) {
  e.preventDefault();
  const code = document.getElementById('cfgCompanyCode').value.trim().toUpperCase();
  const name = document.getElementById('cfgCompanyName').value.trim();
  if (!name) { _showCfgError('cfgCompany', 'Name is required.'); return; }
  if (!_cfgCompanyEditCode && !code) { _showCfgError('cfgCompany', 'Code is required.'); return; }
  _setCfgLoading('cfgCompany', true);
  try {
    let res;
    if (_cfgCompanyEditCode) {
      res = await fetch(`/api/admin/config/companies/${encodeURIComponent(_cfgCompanyEditCode)}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } else {
      res = await fetch('/api/admin/config/companies', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_code: code, name }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgCompanyEditCode;
    closeCfgCompanyModal();
    showToast(`Company ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgCompanies();
    _loadAdminCompanies();
  } catch (err) {
    _setCfgLoading('cfgCompany', false);
    _showCfgError('cfgCompany', err.message);
  }
}

async function deleteCfgCompany(code) {
  if (!await showConfirm({ title: 'Delete Company', message: `Delete company "${code}"?`, detail: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/companies/${encodeURIComponent(code)}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Company deleted.');
    loadCfgCompanies();
    _loadAdminCompanies();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Request Categories ── */

async function loadCfgCategories() {
  const wrap = document.getElementById('config-categories-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/request-categories', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgCategoriesCache = await res.json();
    _renderCfgCategories();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgCategories() {
  const wrap = document.getElementById('config-categories-body');
  if (!_cfgCategoriesCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No request categories. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Name</th><th>Group</th><th>Description</th><th></th></tr></thead>
      <tbody>${_cfgCategoriesCache.map(c => `
        <tr>
          <td><code class="mono-val">${c.category_id}</code></td>
          <td>${escHtml(c.category_name)}</td>
          <td>${escHtml(c.category_group || '—')}</td>
          <td class="issue-desc-cell">${escHtml(c.category_desc || '—')}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgCategoryModal(${JSON.stringify(c)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgCategory(${c.category_id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function _fillCategoryGroupSelect(selectedGroup) {
  const sel = document.getElementById('cfgCategoryGroup');
  sel.innerHTML = '<option value="">— No group —</option>';
  [
    { value: 'IT',      label: 'IT — IT Helpdesk' },
    { value: 'General', label: 'General — Always visible' },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === selectedGroup) opt.selected = true;
    sel.appendChild(opt);
  });
  _adminDepartments.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.department_code;
    opt.textContent = `${d.department_code} — ${d.department_name}`;
    if (d.department_code === selectedGroup) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openCfgCategoryModal(cat) {
  _cfgCategoryEditId = cat ? cat.category_id : null;
  document.getElementById('cfgCategoryModalTitle').textContent = _cfgCategoryEditId ? 'Edit Category' : 'Add Category';
  document.getElementById('cfgCategoryName').value = cat?.category_name ?? '';
  document.getElementById('cfgCategoryDesc').value = cat?.category_desc ?? '';
  _fillCategoryGroupSelect(cat?.category_group ?? '');
  _resetCfgModal('cfgCategory');
  document.getElementById('cfgCategoryModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgCategoryModal() {
  document.getElementById('cfgCategoryModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgCategoryEditId = null;
}

function overlayCfgCategory(e) {
  if (e.target === document.getElementById('cfgCategoryModal')) closeCfgCategoryModal();
}

async function saveCfgCategory(e) {
  e.preventDefault();
  const name  = document.getElementById('cfgCategoryName').value.trim();
  const group = document.getElementById('cfgCategoryGroup').value.trim() || null;
  const desc  = document.getElementById('cfgCategoryDesc').value.trim()  || null;
  if (!name) { _showCfgError('cfgCategory', 'Name is required.'); return; }
  _setCfgLoading('cfgCategory', true);
  try {
    let res;
    if (_cfgCategoryEditId) {
      res = await fetch(`/api/admin/config/request-categories/${_cfgCategoryEditId}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_name: name, category_group: group, category_desc: desc }),
      });
    } else {
      res = await fetch('/api/admin/config/request-categories', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_name: name, category_group: group, category_desc: desc }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgCategoryEditId;
    closeCfgCategoryModal();
    showToast(`Category ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgCategories();
  } catch (err) {
    _setCfgLoading('cfgCategory', false);
    _showCfgError('cfgCategory', err.message);
  }
}

async function deleteCfgCategory(id) {
  if (!await showConfirm({ title: 'Delete Category', message: 'Delete this category?', detail: 'Request types that reference it may be affected.', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/request-categories/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Category deleted.');
    loadCfgCategories();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Request Types ── */

async function loadCfgTypes() {
  const wrap = document.getElementById('config-types-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/request-types', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgTypesCache = await res.json();
    _renderCfgTypes();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgTypes() {
  const wrap = document.getElementById('config-types-body');
  if (!_cfgTypesCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No request types. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Category</th><th>Request Type</th><th>Visible</th><th></th></tr></thead>
      <tbody>${_cfgTypesCache.map(t => `
        <tr>
          <td><code class="mono-val">${t.id}</code></td>
          <td>${escHtml(t.request_category)}</td>
          <td>${escHtml(t.request_type)}</td>
          <td>${t.is_visible !== false ? '<span class="badge-visible">Visible</span>' : '<span class="badge-hidden">Hidden</span>'}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgTypeModal(${JSON.stringify(t)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgType(${t.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

async function openCfgTypeModal(type) {
  _cfgTypeEditId = type ? type.id : null;
  document.getElementById('cfgTypeModalTitle').textContent = _cfgTypeEditId ? 'Edit Request Type' : 'Add Request Type';

  if (_cfgCategoriesCache.length === 0) {
    try {
      const res = await fetch('/api/admin/config/request-categories', { headers: authHeaders() });
      if (res.ok) _cfgCategoriesCache = await res.json();
    } catch { /* non-fatal */ }
  }
  const catSel = document.getElementById('cfgTypeCategory');
  catSel.innerHTML = '<option value="">— Select category —</option>' +
    _cfgCategoriesCache.map(c =>
      `<option value="${escHtml(c.category_name)}"${type?.request_category === c.category_name ? ' selected' : ''}>${escHtml(c.category_name)}</option>`
    ).join('');

  document.getElementById('cfgTypeRequestType').value = type?.request_type ?? '';
  document.getElementById('cfgTypeVisible').checked   = type ? (type.is_visible !== false) : true;
  _resetCfgModal('cfgType');
  document.getElementById('cfgTypeModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgTypeModal() {
  document.getElementById('cfgTypeModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgTypeEditId = null;
}

function overlayCfgType(e) {
  if (e.target === document.getElementById('cfgTypeModal')) closeCfgTypeModal();
}

async function saveCfgType(e) {
  e.preventDefault();
  const category    = document.getElementById('cfgTypeCategory').value;
  const requestType = document.getElementById('cfgTypeRequestType').value.trim();
  const isVisible   = document.getElementById('cfgTypeVisible').checked;
  if (!category)    { _showCfgError('cfgType', 'Category is required.'); return; }
  if (!requestType) { _showCfgError('cfgType', 'Request Type name is required.'); return; }
  _setCfgLoading('cfgType', true);
  try {
    let res;
    if (_cfgTypeEditId) {
      res = await fetch(`/api/admin/config/request-types/${_cfgTypeEditId}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_category: category, request_type: requestType, is_visible: isVisible }),
      });
    } else {
      res = await fetch('/api/admin/config/request-types', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_category: category, request_type: requestType, is_visible: isVisible }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgTypeEditId;
    closeCfgTypeModal();
    showToast(`Request type ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgTypes();
  } catch (err) {
    _setCfgLoading('cfgType', false);
    _showCfgError('cfgType', err.message);
  }
}

async function deleteCfgType(id) {
  if (!await showConfirm({ title: 'Delete Request Type', message: 'Delete this request type?', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/request-types/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Request type deleted.');
    loadCfgTypes();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Non-Software Items ── */

async function loadCfgNsi() {
  const wrap = document.getElementById('config-nsi-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/non-software-items', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgNsiCache = await res.json();
    _renderCfgNsi();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgNsi() {
  const wrap = document.getElementById('config-nsi-body');
  if (!_cfgNsiCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No non-software items. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Category</th><th>Subcategory</th><th>Visible</th><th></th></tr></thead>
      <tbody>${_cfgNsiCache.map(n => `
        <tr>
          <td><code class="mono-val">${n.id}</code></td>
          <td>${escHtml(n.category)}</td>
          <td>${escHtml(n.subcategory)}</td>
          <td>${n.is_visible !== false ? '<span class="badge-visible">Visible</span>' : '<span class="badge-hidden">Hidden</span>'}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgNsiModal(${JSON.stringify(n)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgNsi(${n.id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCfgNsiModal(item) {
  _cfgNsiEditId = item ? item.id : null;
  document.getElementById('cfgNsiModalTitle').textContent = _cfgNsiEditId ? 'Edit Item' : 'Add Item';
  document.getElementById('cfgNsiCategory').value    = item?.category    ?? 'Hardware';
  document.getElementById('cfgNsiSubcategory').value = item?.subcategory ?? '';
  document.getElementById('cfgNsiVisible').checked   = item ? (item.is_visible !== false) : true;
  _resetCfgModal('cfgNsi');
  document.getElementById('cfgNsiModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgNsiModal() {
  document.getElementById('cfgNsiModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgNsiEditId = null;
}

function overlayCfgNsi(e) {
  if (e.target === document.getElementById('cfgNsiModal')) closeCfgNsiModal();
}

async function saveCfgNsi(e) {
  e.preventDefault();
  const category    = document.getElementById('cfgNsiCategory').value;
  const subcategory = document.getElementById('cfgNsiSubcategory').value.trim();
  const isVisible   = document.getElementById('cfgNsiVisible').checked;
  if (!subcategory) { _showCfgError('cfgNsi', 'Subcategory is required.'); return; }
  _setCfgLoading('cfgNsi', true);
  try {
    let res;
    if (_cfgNsiEditId) {
      res = await fetch(`/api/admin/config/non-software-items/${_cfgNsiEditId}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subcategory, is_visible: isVisible }),
      });
    } else {
      res = await fetch('/api/admin/config/non-software-items', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subcategory, is_visible: isVisible }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgNsiEditId;
    closeCfgNsiModal();
    showToast(`Item ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgNsi();
  } catch (err) {
    _setCfgLoading('cfgNsi', false);
    _showCfgError('cfgNsi', err.message);
  }
}

async function deleteCfgNsi(id) {
  if (!await showConfirm({ title: 'Delete Item', message: 'Delete this item?', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/non-software-items/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Item deleted.');
    loadCfgNsi();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Brands ── */

async function loadCfgBrands() {
  const wrap = document.getElementById('config-brands-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/brands', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgBrandsCache = await res.json();
    _renderCfgBrands();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgBrands() {
  const wrap = document.getElementById('config-brands-body');
  if (!_cfgBrandsCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No brands. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Code</th><th>Initials</th><th>Name</th><th>Description</th><th></th></tr></thead>
      <tbody>${_cfgBrandsCache.map(b => `
        <tr>
          <td><code class="mono-val">${escHtml(b.brand_code)}</code></td>
          <td><code class="mono-val">${escHtml(b.brand_initial || '—')}</code></td>
          <td>${escHtml(b.brand_name)}</td>
          <td class="issue-desc-cell">${escHtml(b.brand_desc || '—')}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgBrandModal(${JSON.stringify(b)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgBrand('${escHtml(b.brand_code)}')">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCfgBrandModal(brand) {
  _cfgBrandEditCode = brand ? brand.brand_code : null;
  document.getElementById('cfgBrandModalTitle').textContent = _cfgBrandEditCode ? 'Edit Brand' : 'Add Brand';
  const codeField = document.getElementById('cfgBrandCode');
  codeField.value    = brand?.brand_code ?? '';
  codeField.disabled = !!_cfgBrandEditCode;
  document.getElementById('cfgBrandInitials').value = brand?.brand_initial ?? '';
  document.getElementById('cfgBrandName').value     = brand?.brand_name    ?? '';
  document.getElementById('cfgBrandDesc').value     = brand?.brand_desc    ?? '';
  _resetCfgModal('cfgBrand');
  document.getElementById('cfgBrandModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgBrandModal() {
  document.getElementById('cfgBrandModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgBrandEditCode = null;
}

function overlayCfgBrand(e) {
  if (e.target === document.getElementById('cfgBrandModal')) closeCfgBrandModal();
}

async function saveCfgBrand(e) {
  e.preventDefault();
  const code     = document.getElementById('cfgBrandCode').value.trim().toUpperCase();
  const initials = document.getElementById('cfgBrandInitials').value.trim().toUpperCase();
  const name     = document.getElementById('cfgBrandName').value.trim();
  const desc     = document.getElementById('cfgBrandDesc').value.trim();
  if (!name)     { _showCfgError('cfgBrand', 'Name is required.'); return; }
  if (!initials) { _showCfgError('cfgBrand', 'Initials are required.'); return; }
  if (!_cfgBrandEditCode && !code) { _showCfgError('cfgBrand', 'Brand Code is required.'); return; }
  _setCfgLoading('cfgBrand', true);
  try {
    let res;
    if (_cfgBrandEditCode) {
      res = await fetch(`/api/admin/config/brands/${encodeURIComponent(_cfgBrandEditCode)}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: name, brand_initial: initials, brand_desc: desc }),
      });
    } else {
      res = await fetch('/api/admin/config/brands', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_code: code, brand_name: name, brand_initial: initials, brand_desc: desc }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgBrandEditCode;
    closeCfgBrandModal();
    showToast(`Brand ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgBrands();
  } catch (err) {
    _setCfgLoading('cfgBrand', false);
    _showCfgError('cfgBrand', err.message);
  }
}

async function deleteCfgBrand(code) {
  if (!await showConfirm({ title: 'Delete Brand', message: `Delete brand "${code}"?`, detail: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/brands/${encodeURIComponent(code)}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Brand deleted.');
    loadCfgBrands();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Departments ── */

async function loadCfgDepts() {
  const wrap = document.getElementById('config-depts-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/departments', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgDeptsCache = await res.json();
    _renderCfgDepts();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgDepts() {
  const wrap = document.getElementById('config-depts-body');
  if (!_cfgDeptsCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No departments. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Code</th><th>Name</th><th>Description</th><th>Status</th><th></th></tr></thead>
      <tbody>${_cfgDeptsCache.map(d => `
        <tr>
          <td><code class="mono-val">${d.department_id}</code></td>
          <td><code class="mono-val">${escHtml(d.department_code)}</code></td>
          <td>${escHtml(d.department_name)}</td>
          <td class="issue-desc-cell">${escHtml(d.department_desc || '—')}</td>
          <td>${d.is_active !== false ? '<span class="badge-visible">Active</span>' : '<span class="badge-hidden">Inactive</span>'}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick="openCfgDeptModal(${d.department_id})">Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgDept(${d.department_id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCfgDeptModal(deptOrId) {
  const dept = typeof deptOrId === 'number'
    ? (_cfgDeptsCache.find(d => d.department_id === deptOrId) ?? null)
    : deptOrId;
  _cfgDeptEditId = dept ? dept.department_id : null;
  document.getElementById('cfgDeptModalTitle').textContent = _cfgDeptEditId ? 'Edit Department' : 'Add Department';
  const codeField = document.getElementById('cfgDeptCode');
  codeField.value    = dept?.department_code ?? '';
  codeField.disabled = !!_cfgDeptEditId;
  document.getElementById('cfgDeptName').value   = dept?.department_name ?? '';
  document.getElementById('cfgDeptDesc').value   = dept?.department_desc ?? '';
  document.getElementById('cfgDeptActive').checked = dept ? (dept.is_active !== false) : true;
  _resetCfgModal('cfgDept');
  document.getElementById('cfgDeptModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgDeptModal() {
  document.getElementById('cfgDeptModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgDeptEditId = null;
}

function overlayCfgDept(e) {
  if (e.target === document.getElementById('cfgDeptModal')) closeCfgDeptModal();
}

async function saveCfgDept(e) {
  e.preventDefault();
  const code     = document.getElementById('cfgDeptCode').value.trim().toUpperCase();
  const name     = document.getElementById('cfgDeptName').value.trim();
  const desc     = document.getElementById('cfgDeptDesc').value.trim() || null;
  const isActive = document.getElementById('cfgDeptActive').checked;
  if (!name) { _showCfgError('cfgDept', 'Name is required.'); return; }
  if (!_cfgDeptEditId && !code) { _showCfgError('cfgDept', 'Code is required.'); return; }
  _setCfgLoading('cfgDept', true);
  try {
    let res;
    if (_cfgDeptEditId) {
      res = await fetch(`/api/admin/config/departments/${_cfgDeptEditId}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_name: name, department_desc: desc, is_active: isActive }),
      });
    } else {
      res = await fetch('/api/admin/config/departments', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_code: code, department_name: name, department_desc: desc, is_active: isActive }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgDeptEditId;
    closeCfgDeptModal();
    showToast(`Department ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgDepts();
    _loadAdminDepartments();
  } catch (err) {
    _setCfgLoading('cfgDept', false);
    _showCfgError('cfgDept', err.message);
  }
}

async function deleteCfgDept(id) {
  if (!await showConfirm({ title: 'Delete Department', message: 'Delete this department?', detail: 'Users with this department assigned may be affected.', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/departments/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Department deleted.');
    loadCfgDepts();
    _loadAdminDepartments();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Actions ── */

async function loadCfgActions() {
  const wrap = document.getElementById('config-actions-body');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/admin/config/actions', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _cfgActionsCache = await res.json();
    _renderCfgActions();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed: ${escHtml(err.message)}</div>`;
  }
}

function _renderCfgActions() {
  const wrap = document.getElementById('config-actions-body');
  if (!_cfgActionsCache.length) {
    wrap.innerHTML = '<div class="admin-empty">No actions defined. Add one above.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Code</th><th>Name</th><th>Description</th><th>Active</th><th></th></tr></thead>
      <tbody>${_cfgActionsCache.map(a => `
        <tr>
          <td><code class="mono-val">${a.action_id}</code></td>
          <td><code class="mono-val">${escHtml(a.action_code)}</code></td>
          <td>${escHtml(a.action_name)}</td>
          <td class="issue-desc-cell">${escHtml(a.action_desc || '—')}</td>
          <td>${a.is_active !== false ? '<span class="badge-visible">Active</span>' : '<span class="badge-hidden">Inactive</span>'}</td>
          <td class="action-cell">
            <button class="btn-tbl-secondary" onclick='openCfgActionModal(${JSON.stringify(a)})'>Edit</button>
            <button class="btn-tbl-danger" onclick="deleteCfgAction(${a.action_id})">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function openCfgActionModal(action) {
  _cfgActionEditId = action ? action.action_id : null;
  document.getElementById('cfgActionModalTitle').textContent = _cfgActionEditId ? 'Edit Action' : 'Add Action';
  document.getElementById('cfgActionCode').value    = action?.action_code ?? '';
  document.getElementById('cfgActionName').value    = action?.action_name ?? '';
  document.getElementById('cfgActionDesc').value    = action?.action_desc ?? '';
  document.getElementById('cfgActionActive').checked = action ? (action.is_active !== false) : true;
  _resetCfgModal('cfgAction');
  document.getElementById('cfgActionModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCfgActionModal() {
  document.getElementById('cfgActionModal').classList.remove('open');
  document.body.style.overflow = '';
  _cfgActionEditId = null;
}

function overlayCfgAction(e) {
  if (e.target === document.getElementById('cfgActionModal')) closeCfgActionModal();
}

async function saveCfgAction(e) {
  e.preventDefault();
  const code     = document.getElementById('cfgActionCode').value.trim().toUpperCase();
  const name     = document.getElementById('cfgActionName').value.trim();
  const desc     = document.getElementById('cfgActionDesc').value.trim() || null;
  const isActive = document.getElementById('cfgActionActive').checked;
  if (!name) { _showCfgError('cfgAction', 'Action name is required.'); return; }
  if (!code) { _showCfgError('cfgAction', 'Code is required.'); return; }
  _setCfgLoading('cfgAction', true);
  try {
    let res;
    if (_cfgActionEditId) {
      res = await fetch(`/api/admin/config/actions/${_cfgActionEditId}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_name: name, action_code: code, action_desc: desc, is_active: isActive }),
      });
    } else {
      res = await fetch('/api/admin/config/actions', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_name: name, action_code: code, action_desc: desc, is_active: isActive }),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const wasEdit = _cfgActionEditId;
    closeCfgActionModal();
    showToast(`Action ${wasEdit ? 'updated' : 'added'}.`);
    loadCfgActions();
    _actionsCache = null; // invalidate resolution actions cache
  } catch (err) {
    _setCfgLoading('cfgAction', false);
    _showCfgError('cfgAction', err.message);
  }
}

async function deleteCfgAction(id) {
  if (!await showConfirm({ title: 'Delete Action', message: 'Delete this action?', detail: 'It will no longer appear in resolution checklists.', confirmText: 'Delete', danger: true })) return;
  try {
    const res = await fetch(`/api/admin/config/actions/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Action deleted.');
    loadCfgActions();
    _actionsCache = null; // invalidate resolution actions cache
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function _buildPrintHtml(dev, opts = {}) {
  const { includeHeader = true, includeBranding = true, dateFrom = '', dateTo = '' } = opts;
  const fullName    = [dev.first_name, dev.last_name].filter(Boolean).join(' ') || dev.username;
  const displayName = dev.display_name || fullName;
  const today       = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateRangeLabel = (dateFrom || dateTo)
    ? ` · ${dateFrom || '…'} to ${dateTo || '…'}`
    : '';

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

  const fmtDate = d => d ? String(d).slice(0, 10) : '—';

  const _pBadge = (color, bg, text) =>
    `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap">${escHtml(text)}</span>`;

  const itemRows = dev.items.map((it, i) => {
    const clr = DP_STAT_COLOR[it.status] || '#6b7280';
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:5px 8px;color:#94a3b8;font-size:12px">${i + 1}</td>
      <td style="padding:5px 8px;font-weight:500">${escHtml(it.title || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(it.dev_item_type || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(it.system_name || '—')}</td>
      <td style="padding:5px 8px">${_pBadge(clr, DP_STAT_BG[it.status] || '#f3f4f6', it.status || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.start_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.estimated_end_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(it.actual_end_date)}</td>
    </tr>`;
  }).join('');

  const TASK_STATUS_COLOR = { completed: '#16a34a', 'in-progress': '#2563eb', pending: '#d97706', cancelled: '#dc2626' };
  const TASK_STATUS_BG    = { completed: '#f0fdf4', 'in-progress': '#eff6ff', pending: '#fffbeb', cancelled: '#fef2f2' };

  const taskRows = (dev.tasks || []).map((t, i) => {
    const clr = TASK_STATUS_COLOR[t.status] || '#6b7280';
    const bg  = TASK_STATUS_BG[t.status]    || '#f3f4f6';
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:5px 8px;color:#94a3b8;font-size:12px">${i + 1}</td>
      <td style="padding:5px 8px;font-weight:500">${escHtml(t.task_name || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(t.task_type || '—')}</td>
      <td style="padding:5px 8px">${_pBadge(clr, bg, t.status || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(t.start_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(t.estimated_end_date)}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(t.actual_end_date)}</td>
    </tr>`;
  }).join('');

  const PRIORITY_COLOR = { high: '#dc2626', medium: '#d97706', low: '#2563eb' };
  const PRIORITY_BG    = { high: '#fef2f2', medium: '#fffbeb', low: '#eff6ff' };
  const ISSUE_STATUS_COLOR = { resolved: '#16a34a', open: '#d97706', closed: '#6b7280', 'in-progress': '#2563eb' };
  const ISSUE_STATUS_BG    = { resolved: '#f0fdf4', open: '#fffbeb', closed: '#f3f4f6', 'in-progress': '#eff6ff' };

  const issueRows = (dev.issues || []).map((iss, i) => {
    const pKey  = (iss.priority || '').toLowerCase();
    const sKey  = (iss.status   || '').toLowerCase();
    const pClr  = PRIORITY_COLOR[pKey]    || '#6b7280';
    const pBg   = PRIORITY_BG[pKey]       || '#f3f4f6';
    const sClr  = ISSUE_STATUS_COLOR[sKey] || '#6b7280';
    const sBg   = ISSUE_STATUS_BG[sKey]    || '#f3f4f6';
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:5px 8px;color:#94a3b8;font-size:12px">${i + 1}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px;white-space:nowrap">${escHtml(iss.ticket_number || '—')}</td>
      <td style="padding:5px 8px;font-weight:500">${escHtml(iss.title || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(iss.site_name || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${escHtml(iss.request_category || '—')}</td>
      <td style="padding:5px 8px">${_pBadge(pClr, pBg, iss.priority || '—')}</td>
      <td style="padding:5px 8px">${_pBadge(sClr, sBg, iss.status   || '—')}</td>
      <td style="padding:5px 8px;color:#64748b;font-size:12px">${fmtDate(iss.created_at)}</td>
    </tr>`;
  }).join('');

  const badges = [
    dev.is_admin     ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin-right:4px">Admin</span>'  : '',
    dev.is_developer ? '<span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Developer</span>' : '',
  ].join('');

  return `<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px 24px;color:#1e293b">
    ${includeHeader ? `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e2e8f0">
      <div>
        <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escHtml(displayName)}</div>
        <div style="margin-bottom:6px">${badges}</div>
        ${infoRows ? `<table style="margin-top:8px">${infoRows}</table>` : ''}
      </div>
      ${includeBranding ? `<div style="text-align:right;color:#94a3b8;font-size:12px">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">Performance Report</div>
        <div>Generated: ${today}${escHtml(dateRangeLabel)}</div>
        <div>RGMC Gateway</div>
      </div>` : `<div style="text-align:right;color:#94a3b8;font-size:12px">
        <div style="font-size:14px;font-weight:600;color:#1e293b">Performance Report</div>
        ${dateRangeLabel ? `<div>${escHtml(dateRangeLabel.replace(' · ', ''))}</div>` : ''}
      </div>`}
    </div>

    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Performance Metrics</div>
      <table style="border-collapse:collapse;width:auto"><tr>${metricCells}</tr></table>
    </div>

    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Systems Handled (${dev.systems.length})</div>
      <div>${systemsHtml}</div>
    </div>` : `
    <div style="margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:baseline">
      <div style="font-size:18px;font-weight:700">${escHtml(displayName)}</div>
      <div style="font-size:12px;color:#94a3b8">${dateRangeLabel ? escHtml(dateRangeLabel.replace(' · ', '')) : 'Performance Report'}</div>
    </div>`}

    <div style="margin-bottom:24px">
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

    <div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Tasks (${(dev.tasks || []).length})</div>
      ${(dev.tasks || []).length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #e2e8f0">
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">#</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Task Name</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Type</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Status</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Started</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Est. End</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Actual End</th>
        </tr></thead>
        <tbody>${taskRows}</tbody>
      </table>` : '<span style="color:#94a3b8">No tasks assigned.</span>'}
    </div>

    <div>
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Issues (${(dev.issues || []).length})</div>
      ${(dev.issues || []).length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #e2e8f0">
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">#</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Ticket #</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Title</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">System</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Category</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Priority</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Status</th>
          <th style="padding:6px 8px;text-align:left;color:#64748b;font-weight:600">Created</th>
        </tr></thead>
        <tbody>${issueRows}</tbody>
      </table>` : '<span style="color:#94a3b8">No issues assigned.</span>'}
    </div>
  </div>`;
}
