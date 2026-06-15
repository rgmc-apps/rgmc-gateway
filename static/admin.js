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

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || !session.isAdmin) {
    location.href = '/';
    return;
  }
  document.getElementById('adminUsername').textContent = session.firstName || session.username;
  loadRequests('pending');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSystemModal(); closeRejectModal(); closeEditSystemsModal(); }
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
  return `<tr>
    <td><span class="user-name">${escHtml(s.name)}</span></td>
    <td><span class="label-badge ${catClass}">${escHtml(s.category)}</span></td>
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
        body:    JSON.stringify({ name, category, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder }),
      });
    } else {
      res = await fetch('/api/admin/systems', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, name, category, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder }),
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
