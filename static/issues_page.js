'use strict';

/* ── Session ── */
const SESSION_KEY = 'rgmc_gateway_session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function ipSignOut() { clearSession(); location.href = '/'; }
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
function _stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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

/* ── Badges ── */
const ISSUE_STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const ISSUE_STATUS_CLASS  = { open: 'badge-issue-open', in_progress: 'badge-issue-progress', resolved: 'badge-issue-resolved', closed: 'badge-issue-closed' };
const PRIORITY_BADGE = {
  p1: '<span class="iss-prio-badge iss-prio--critical">P1</span>',
  p2: '<span class="iss-prio-badge iss-prio--high">P2</span>',
  p3: '<span class="iss-prio-badge iss-prio--medium">P3</span>',
  p4: '<span class="iss-prio-badge iss-prio--low">P4</span>',
  critical: '<span class="iss-prio-badge iss-prio--critical">Critical</span>',
  high:     '<span class="iss-prio-badge iss-prio--high">High</span>',
  medium:   '<span class="iss-prio-badge iss-prio--medium">Medium</span>',
  low:      '<span class="iss-prio-badge iss-prio--low">Low</span>',
};

function _ipAgeDays(issue) {
  if (issue && issue.shift_age_days != null) return Math.floor(issue.shift_age_days);
  if (!issue || !issue.created_at) return 0;
  return Math.floor((Date.now() - new Date(issue.created_at).getTime()) / 86400000);
}
function _ipAgePill(issue) {
  const days = _ipAgeDays(issue);
  const cls  = days > 14 ? 'iss-age-pill--critical' : days > 7 ? 'iss-age-pill--warn' : '';
  const label = days === 0 ? 'today' : days === 1 ? '1 day' : `${days}d`;
  return `<span class="iss-age-pill ${cls}">${label}</span>`;
}

/* ── State ── */
let _ipIssuesCache = [];
let _ipStatus       = 'all';
let _ipPage         = 1;
const _ipPerPage    = 25;

async function loadIssuesPage() {
  const wrap = document.getElementById('ipIssuesBody');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading issues…</span></div>';
  try {
    const res = await fetch('/api/issues/scoped', { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load issues');
    _ipIssuesCache = await res.json();
    _ipPopulateCompanyFilter();
    ipApplyFilters();
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load issues: ${escHtml(err.message)}</div>`;
  }
}

function _ipPopulateCompanyFilter() {
  const sel = document.getElementById('ipFilterCompany');
  if (!sel) return;
  const current = sel.value;
  const companies = Array.from(new Set(_ipIssuesCache.map(i => i.company_name).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">All Companies</option>' +
    companies.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  sel.value = current;
}

function ipSwitchStatus(status) {
  _ipStatus = status;
  _ipPage   = 1;
  document.querySelectorAll('#ipStatusTabs .status-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.istatus === status);
  });
  ipApplyFilters();
}

function ipClearSearch() {
  document.getElementById('ipFilterSearch').value = '';
  ipApplyFilters();
}

function ipApplyFilters() {
  const search   = document.getElementById('ipFilterSearch').value.trim().toLowerCase();
  const priority = document.getElementById('ipFilterPriority').value;
  const company  = document.getElementById('ipFilterCompany').value;
  const from     = document.getElementById('ipFilterFrom').value;
  const to       = document.getElementById('ipFilterTo').value;

  document.getElementById('ipFilterSearchClear').style.display = search ? '' : 'none';

  let rows = _ipIssuesCache.slice();
  if (_ipStatus !== 'all') rows = rows.filter(i => i.status === _ipStatus);
  if (priority) rows = rows.filter(i => (i.priority || '').toLowerCase() === priority);
  if (company)  rows = rows.filter(i => i.company_name === company);
  if (from) rows = rows.filter(i => (i.created_at || '').slice(0, 10) >= from);
  if (to)   rows = rows.filter(i => (i.created_at || '').slice(0, 10) <= to);
  if (search) {
    rows = rows.filter(i => [
      i.ticket_number, i.title, i.employee_name, i.company_name, i.site_name,
      _stripHtml(i.description || ''),
    ].some(v => (v || '').toLowerCase().includes(search)));
  }

  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  _ipRenderTable(rows);
}

function _ipRenderTable(rows) {
  const wrap = document.getElementById('ipIssuesBody');
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / _ipPerPage));
  if (_ipPage > pages) _ipPage = pages;
  const start = (_ipPage - 1) * _ipPerPage;
  const pageRows = rows.slice(start, start + _ipPerPage);

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
          <th>Assigned To</th>
          <th>Age</th>
          <th>Reported</th>
        </tr>
      </thead>
      <tbody>${pageRows.map(_ipRenderRow).join('')}</tbody>
    </table>
    <div class="iss-pagination">
      <span class="iss-page-info">Showing ${start + 1}–${Math.min(start + _ipPerPage, total)} of ${total}</span>
      <div class="iss-page-controls">
        <button class="iss-page-nav" onclick="ipSetPage(${_ipPage - 1})" ${_ipPage === 1 ? 'disabled' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="iss-page-info">Page ${_ipPage} of ${pages}</span>
        <button class="iss-page-nav" onclick="ipSetPage(${_ipPage + 1})" ${_ipPage === pages ? 'disabled' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>`;
}

function ipSetPage(p) {
  _ipPage = Math.max(1, p);
  ipApplyFilters();
}

function _ipRenderRow(issue) {
  const statusBadge = `<span class="label-badge ${ISSUE_STATUS_CLASS[issue.status] || 'label-rgmc'}">${ISSUE_STATUS_LABELS[issue.status] || issue.status}</span>`;
  const prioBadge    = PRIORITY_BADGE[(issue.priority || '').toLowerCase()] || '<span class="text-muted">—</span>';
  const rawDesc      = _stripHtml(issue.description || '');
  const titleText    = issue.title ? issue.title : (rawDesc.length > 60 ? rawDesc.slice(0, 58) + '…' : rawDesc);
  const ticketRef    = issue.ticket_number
    ? `<code class="mono-val" style="font-size:11px;">${escHtml(issue.ticket_number)}</code><br>`
    : '';
  const safeId = escHtml(issue.id);
  return `<tr class="iss-row-clickable" onclick="location.href='/admin/issues/${safeId}'">
    <td>${ticketRef}<span class="user-name">${escHtml(issue.site_name || '')}</span></td>
    <td>${escHtml(issue.employee_name || '')}<br><small class="text-muted">${escHtml(issue.company_name || '')}</small></td>
    <td class="issue-desc-cell">${escHtml(titleText)}</td>
    <td>${prioBadge}</td>
    <td>${statusBadge}</td>
    <td>${issue.assigned_to ? `<code class="mono-val">${escHtml(issue.assigned_to)}</code>` : '<span class="text-muted">—</span>'}</td>
    <td>${_ipAgePill(issue)}</td>
    <td class="date-cell">${fmtDateTime(issue.created_at)}</td>
  </tr>`;
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || !(session.isAdmin || session.isManagement || session.isDepartmentHead)) {
    location.href = '/';
    return;
  }

  if (!(session.isAdmin || session.isManagement)) {
    document.getElementById('ipPageSub').textContent = 'Current issue tickets routed to your department.';
  }

  const container = document.getElementById('issuesHeaderUser');
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
      `<a href="/workspace" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        My Team Workspace
      </a>`,
    ];
    if (session.isDeveloper || session.isAdmin) {
      navItems.push(`<a href="/developer" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Dev Board
      </a>`);
    }
    if (session.isAdmin || session.isManagement) {
      navItems.push(`<a href="/admin" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Admin Panel
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
          <button class="profile-menu-item profile-menu-item--danger" onclick="ipSignOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfileMenu(); });
  document.addEventListener('click', () => closeProfileMenu());

  loadIssuesPage().then(() => hidePageLoader());
});
