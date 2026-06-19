'use strict';

/* ── Session ── */
const SESSION_KEY = 'rgmc_gateway_session';
function loadSession()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function wsSignOut()    { clearSession(); location.href = '/'; }
function authHeaders()  { const s = loadSession(); return { 'X-Gateway-Username': s?.username || '' }; }

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
  const [y, m, d] = iso.slice(0, 10).split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── Profile dropdown ── */
function toggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const trigger = document.getElementById('profileTrigger');
  const menu    = document.getElementById('profileMenu');
  if (!trigger || !menu) return;
  if (menu.classList.contains('open')) closeProfileMenu();
  else { trigger.classList.add('open'); menu.classList.add('open'); }
}
function closeProfileMenu() {
  document.getElementById('profileTrigger')?.classList.remove('open');
  document.getElementById('profileMenu')?.classList.remove('open');
}

/* ── State ── */
let _tasks       = [];
let _issues      = { team: null, mine: null, filed: null };
let _issueMap    = {};
let _teamMembers = null;
let _taskFilter  = 'team';
let _issueSubtab = 'team';
let _taskEditId  = null;
let _activeTab   = 'issues';

const UT_STATUSES = ['open', 'ongoing', 'done'];

/* ── Tab switching ── */
function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('[data-main-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mainTab === tab);
  });
  ['issues', 'team', 'tasks'].forEach(t => {
    const panel = document.getElementById(`ws-panel-${t}`);
    if (!panel) return;
    panel.classList.toggle('ws-active', t === tab);
    panel.style.display = '';
  });
  if (tab === 'issues' && _issues[_issueSubtab] === null) loadIssues(_issueSubtab);
  if (tab === 'team'   && _teamMembers === null)           loadTeam();
  if (tab === 'tasks'  && _tasks.length === 0)             loadTasks();
}

function switchIssueSubtab(subtab) {
  _issueSubtab = subtab;
  document.querySelectorAll('[data-issue-subtab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.issueSubtab === subtab);
  });
  ['team', 'mine', 'filed'].forEach(s => {
    const panel = document.getElementById(`ws-issues-${s}`);
    if (panel) panel.style.display = s === subtab ? '' : 'none';
  });
  if (_issues[subtab] === null) loadIssues(subtab);
}

/* ── Issue helpers ── */
const ISSUE_STATUS_LABELS = {
  new:         'New',
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
  cancelled:   'Cancelled',
};

function issueBadgeClass(status) {
  const map = {
    new:         'iss-badge-new',
    open:        'iss-badge-open',
    in_progress: 'iss-badge-in_progress',
    resolved:    'iss-badge-resolved',
    closed:      'iss-badge-closed',
    cancelled:   'iss-badge-cancelled',
  };
  return map[status] || 'iss-badge-other';
}

function prioBadgeHtml(priority) {
  if (!priority) return '';
  const cls = {
    P1: 'prio-critical', Critical: 'prio-critical',
    P2: 'prio-high',     High:     'prio-high',
    P3: 'prio-medium',   Medium:   'prio-medium',
    P4: 'prio-low',      Low:      'prio-low',
  }[priority];
  return cls ? `<span class="prio-badge ${cls}">${escHtml(priority)}</span>` : '';
}

/* ── Issues loading ── */
async function loadIssues(scope) {
  const listEl = document.getElementById(`ws-issue-list-${scope}`);
  if (!listEl) return;
  listEl.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/user/issues/${scope}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    const data = await res.json();
    _issues[scope] = data;
    data.forEach(iss => { _issueMap[iss.id] = iss; });
    renderIssueList(scope, data);
  } catch (err) {
    listEl.innerHTML = `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function renderIssueList(scope, issues) {
  const listEl = document.getElementById(`ws-issue-list-${scope}`);
  if (!listEl) return;
  if (!issues || issues.length === 0) {
    const msgs = {
      team:  'No issues have been routed to your team yet.',
      mine:  'No issues are currently assigned to you.',
      filed: 'You have not filed any issues yet. Use the IT Helpdesk to submit one.',
    };
    listEl.innerHTML = `<div class="ws-empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);margin-bottom:14px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p style="color:var(--text-muted);font-size:14px;margin:0;">${msgs[scope] || 'No issues found.'}</p>
    </div>`;
    return;
  }
  listEl.innerHTML = issues.map(iss => renderIssueCard(iss)).join('');
}

function renderIssueCard(iss) {
  const status = iss.status || 'new';
  const label  = ISSUE_STATUS_LABELS[status] || status.replace('_', ' ');
  const title  = iss.title || iss.description || '(No title)';
  const desc   = iss.title && iss.description ? iss.description : '';
  const id     = escHtml(iss.id);
  return `<div class="issue-card" onclick="openIssueDetailById('${id}')">
    <div class="issue-card-top">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
        ${iss.ticket_number ? `<span class="issue-card-ticket">${escHtml(iss.ticket_number)}</span>` : ''}
        <span class="iss-badge ${issueBadgeClass(status)}">${escHtml(label)}</span>
        ${prioBadgeHtml(iss.priority)}
      </div>
      <span class="issue-card-date">${fmtDateTime(iss.created_at)}</span>
    </div>
    <div class="issue-card-title">${escHtml(title)}</div>
    ${desc ? `<div class="issue-card-excerpt">${escHtml(desc.slice(0, 140))}${desc.length > 140 ? '…' : ''}</div>` : ''}
    <div class="issue-card-meta">
      ${iss.employee_name    ? `<span>${escHtml(iss.employee_name)}</span>` : ''}
      ${iss.company_name     ? `<span>· ${escHtml(iss.company_name)}</span>` : ''}
      ${iss.request_category ? `<span>· ${escHtml(iss.request_category)}</span>` : ''}
      ${iss.ticket_type      ? `<span>· ${escHtml(iss.ticket_type)}</span>` : ''}
      ${iss.assigned_to      ? `<span class="issue-assigned-to">→ ${escHtml(iss.assigned_to)}</span>` : ''}
    </div>
  </div>`;
}

/* ── Issue detail modal ── */
function openIssueDetailById(id) {
  const iss = _issueMap[id];
  if (iss) openIssueDetail(iss);
}

function openIssueDetail(iss) {
  const status = iss.status || 'new';
  const label  = ISSUE_STATUS_LABELS[status] || status.replace('_', ' ');
  const title  = iss.title || iss.description || '(No title)';

  document.getElementById('iss-modal-ticket').textContent         = iss.ticket_number || '';
  const statusEl = document.getElementById('iss-modal-status');
  statusEl.className   = `iss-badge ${issueBadgeClass(status)}`;
  statusEl.textContent = label;
  document.getElementById('iss-modal-priority-badge').innerHTML  = prioBadgeHtml(iss.priority);
  document.getElementById('iss-modal-title').textContent          = title;
  document.getElementById('iss-modal-desc').textContent           = iss.description || '—';
  document.getElementById('iss-modal-reporter').textContent       = iss.employee_name || '—';
  document.getElementById('iss-modal-company').textContent        = iss.company_name  || '—';
  document.getElementById('iss-modal-email').textContent          = iss.email         || '—';
  document.getElementById('iss-modal-assigned').textContent       = iss.assigned_to   || 'Unassigned';
  document.getElementById('iss-modal-category').textContent       = iss.request_category || '—';
  document.getElementById('iss-modal-type').textContent           = iss.ticket_type   || '—';
  document.getElementById('iss-modal-urgency').textContent        = iss.urgency       || '—';
  document.getElementById('iss-modal-date').textContent           = fmtDateTime(iss.created_at);

  document.getElementById('issueDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeIssueDetail() {
  document.getElementById('issueDetailModal').classList.remove('open');
  document.body.style.overflow = '';
}

function overlayCloseIssue(e) {
  if (e.target === document.getElementById('issueDetailModal')) closeIssueDetail();
}

/* ── Team ── */
async function loadTeam() {
  const gridEl = document.getElementById('ws-team-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/user/team', { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    _teamMembers = await res.json();
    renderTeam(_teamMembers);
  } catch (err) {
    gridEl.innerHTML = `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function renderTeam(members) {
  const gridEl = document.getElementById('ws-team-grid');
  if (!gridEl) return;
  if (!members || members.length === 0) {
    gridEl.innerHTML = `<div class="ws-empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);margin-bottom:14px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <p style="color:var(--text-muted);font-size:14px;margin:0;">No team members found.<br>Make sure your department is set in your profile.</p>
    </div>`;
    return;
  }
  gridEl.innerHTML = members.map(m => {
    const name    = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.username;
    const initial = (name.charAt(0) || '?').toUpperCase();
    const av      = m.avatar_url && (m.avatar_url.startsWith('data:') || m.avatar_url.startsWith('https://')) ? m.avatar_url : '';
    const avatarInner = av
      ? `<img src="${escHtml(av)}" alt="${escHtml(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : escHtml(initial);
    return `<div class="team-member-card">
      <div class="team-avatar">${avatarInner}</div>
      <div class="team-member-name">${escHtml(name)}</div>
      ${m.position ? `<div class="team-member-position">${escHtml(m.position)}</div>` : ''}
      ${m.company  ? `<div class="team-member-company">${escHtml(m.company)}</div>`   : ''}
      ${m.email    ? `<a href="mailto:${escHtml(m.email)}" class="team-member-email" onclick="event.stopPropagation()">${escHtml(m.email)}</a>` : ''}
    </div>`;
  }).join('');
}

/* ── Tasks ── */
function setUtFilter(filter) {
  _taskFilter = filter;
  document.querySelectorAll('[data-task-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.taskFilter === filter);
  });
  _tasks = [];
  loadTasks();
}

async function loadTasks() {
  UT_STATUSES.forEach(s => {
    const el = document.getElementById(`ut-cards-${s}`);
    if (el) el.innerHTML = '<div class="admin-loading" style="padding:12px 0;"><div class="spinner"></div></div>';
  });
  try {
    const res = await fetch(`/api/user/tasks?scope=${_taskFilter}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    _tasks = await res.json();
    renderTaskBoard();
  } catch (err) {
    UT_STATUSES.forEach(s => {
      const el = document.getElementById(`ut-cards-${s}`);
      if (el) el.innerHTML = `<div class="admin-error" style="margin:8px 0;">${escHtml(err.message)}</div>`;
    });
  }
}

function renderTaskBoard() {
  UT_STATUSES.forEach(status => {
    const col   = document.getElementById(`ut-cards-${status}`);
    const tasks = _tasks.filter(t => t.status === status);

    const countEl = document.getElementById(`ut-count-${status}`);
    if (countEl) countEl.textContent = tasks.length;
    const statEl = document.getElementById(`ut-stat-${status}`);
    if (statEl) statEl.textContent = tasks.length;

    if (!col) return;
    col.innerHTML = tasks.length
      ? tasks.map(t => renderTaskCard(t)).join('')
      : `<div class="kanban-empty">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
           No tasks
         </div>`;
  });
}

function renderTaskCard(task) {
  const statusIdx = UT_STATUSES.indexOf(task.status);
  const id        = escHtml(task.id);
  return `<div class="ut-card" id="utc-${id}">
    <div class="ut-card-title">${escHtml(task.title)}</div>
    ${task.description ? `<div class="ut-card-desc">${escHtml(task.description)}</div>` : ''}
    <div class="ut-card-footer">
      <div class="ut-card-meta">
        ${task.due_date  ? `<span>Due ${fmtDate(task.due_date)}</span>` : ''}
        ${task.created_by ? `<span${task.due_date ? ' style="opacity:0.65;"' : ''}> · ${escHtml(task.created_by)}</span>` : ''}
      </div>
      <div class="ut-card-actions">
        ${statusIdx > 0
          ? `<button class="ut-card-btn" onclick="moveUtTask('${id}','${UT_STATUSES[statusIdx-1]}')" title="Move back">
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
             </button>`
          : '<span class="ut-card-btn-placeholder"></span>'}
        <button class="ut-card-btn" onclick="openUtModal('${id}')" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="ut-card-btn ut-card-btn--danger" onclick="deleteUtTaskCard('${id}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
        ${statusIdx < UT_STATUSES.length - 1
          ? `<button class="ut-card-btn" onclick="moveUtTask('${id}','${UT_STATUSES[statusIdx+1]}')" title="Move forward">
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
             </button>`
          : '<span class="ut-card-btn-placeholder"></span>'}
      </div>
    </div>
  </div>`;
}

async function moveUtTask(id, newStatus) {
  try {
    const res = await fetch(`/api/user/tasks/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const updated = await res.json();
    const idx = _tasks.findIndex(t => t.id === id);
    if (idx !== -1) _tasks[idx] = updated;
    renderTaskBoard();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Task modal ── */
function openUtModal(idOrNull) {
  const task = typeof idOrNull === 'string' ? _tasks.find(t => t.id === idOrNull) : null;
  _taskEditId = task?.id ?? null;
  document.getElementById('ut-modal-title-text').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('ut-task-id').value     = task?.id         ?? '';
  document.getElementById('ut-task-title').value  = task?.title      ?? '';
  document.getElementById('ut-task-desc').value   = task?.description ?? '';
  document.getElementById('ut-task-status').value = task?.status     ?? 'open';
  document.getElementById('ut-task-due').value    = task?.due_date   ?? '';
  document.getElementById('ut-delete-btn').style.display = task ? '' : 'none';
  _resetUtModalState();
  document.getElementById('utTaskModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('ut-task-title').focus(), 50);
}

function closeUtModal() {
  document.getElementById('utTaskModal').classList.remove('open');
  document.body.style.overflow = '';
  _taskEditId = null;
}

function overlayCloseUtTask(e) {
  if (e.target === document.getElementById('utTaskModal')) closeUtModal();
}

function _resetUtModalState() {
  document.getElementById('ut-form-actions').style.display = '';
  document.getElementById('ut-form-loading').style.display = 'none';
  document.getElementById('ut-form-error').style.display   = 'none';
  document.getElementById('ut-task-submit').disabled       = false;
}

async function saveUtTask(e) {
  e.preventDefault();
  const title = document.getElementById('ut-task-title').value.trim();
  if (!title) {
    document.getElementById('ut-form-error').style.display  = '';
    document.getElementById('ut-form-error-msg').textContent = 'Title is required.';
    return;
  }
  document.getElementById('ut-form-actions').style.display = 'none';
  document.getElementById('ut-form-loading').style.display = '';

  const payload = {
    title,
    description: document.getElementById('ut-task-desc').value.trim()  || null,
    status:      document.getElementById('ut-task-status').value,
    due_date:    document.getElementById('ut-task-due').value           || null,
  };

  try {
    let res;
    if (_taskEditId) {
      res = await fetch(`/api/user/tasks/${encodeURIComponent(_taskEditId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/user/tasks', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    if (_taskEditId) {
      const idx = _tasks.findIndex(t => t.id === _taskEditId);
      if (idx !== -1) _tasks[idx] = saved;
    } else {
      _tasks.unshift(saved);
    }
    renderTaskBoard();
    closeUtModal();
    showToast(`Task ${_taskEditId ? 'updated' : 'created'}.`);
  } catch (err) {
    document.getElementById('ut-form-loading').style.display = 'none';
    document.getElementById('ut-form-actions').style.display = '';
    document.getElementById('ut-form-error').style.display   = '';
    document.getElementById('ut-form-error-msg').textContent = err.message;
  }
}

async function deleteUtTaskFromModal() {
  if (!_taskEditId) return;
  const id = _taskEditId;
  closeUtModal();
  await _doDeleteUtTask(id);
}

async function deleteUtTaskCard(id) {
  await _doDeleteUtTask(id);
}

async function _doDeleteUtTask(id) {
  const task = _tasks.find(t => t.id === id);
  if (!confirm(`Delete "${task?.title || 'this task'}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/user/tasks/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    _tasks = _tasks.filter(t => t.id !== id);
    renderTaskBoard();
    showToast('Task deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username) {
    location.href = '/';
    return;
  }

  /* Build profile dropdown */
  const container = document.getElementById('wsHeaderUser');
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
          <button class="profile-menu-item profile-menu-item--danger" onclick="wsSignOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  /* Greeting */
  const greetEl = document.getElementById('wsGreeting');
  if (greetEl && session.firstName) {
    greetEl.textContent = `Welcome back, ${session.firstName} — your issues, team, and tasks in one place.`;
  }

  /* Load initial data */
  loadIssues('team');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeIssueDetail(); closeUtModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', () => closeProfileMenu());
});
