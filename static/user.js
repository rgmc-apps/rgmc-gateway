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
let _tasks              = [];
let _issues             = { team: null, mine: null, filed: null };
let _issueMap           = {};
let _teamMembers        = null;
let _taskFilter         = 'team';
let _issueSubtab        = 'team';
let _issueStatusFilter  = 'open_unassigned';
let _taskEditId         = null;
let _activeTab          = 'issues';
let _currentIssue       = null;
let _utAssigneeOpen     = false;

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
  if (tab === 'tasks') { if (_tasks.length === 0) loadTasks(); if (_teamMembers === null) _ensureTeamMembersLoaded(); }
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

function setIssueStatusFilter(filter) {
  _issueStatusFilter = filter;
  document.querySelectorAll('[data-issue-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.issueFilter === filter);
  });
  const issues = _issues[_issueSubtab];
  if (issues !== null) renderIssueList(_issueSubtab, issues);
}

function _applyIssueFilter(issues) {
  switch (_issueStatusFilter) {
    case 'open_unassigned': return issues.filter(i => ['new', 'open'].includes(i.status) && !i.assigned_to);
    case 'in_progress':     return issues.filter(i => i.status === 'in_progress');
    case 'resolved':        return issues.filter(i => i.status === 'resolved');
    case 'closed':          return issues.filter(i => i.status === 'closed');
    default:                return issues;
  }
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

  const issueIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);margin-bottom:14px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  if (!issues || issues.length === 0) {
    const msgs = {
      team:  'No issues have been routed to your team yet.',
      mine:  'No issues are currently assigned to you.',
      filed: 'You have not filed any issues yet. Use the IT Helpdesk to submit one.',
    };
    listEl.innerHTML = `<div class="ws-empty-state">${issueIcon}<p style="color:var(--text-muted);font-size:14px;margin:0;">${msgs[scope] || 'No issues found.'}</p></div>`;
    return;
  }

  const filtered = _applyIssueFilter(issues);
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="ws-empty-state">${issueIcon}<p style="color:var(--text-muted);font-size:14px;margin:0;">No issues match the selected filter.</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(iss => renderIssueCard(iss)).join('');
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
  _currentIssue = iss;
  const status = iss.status || 'new';
  const label  = ISSUE_STATUS_LABELS[status] || status.replace('_', ' ');
  const title  = iss.title || iss.description || '(No title)';

  document.getElementById('iss-modal-ticket').textContent        = iss.ticket_number || '';
  const statusEl = document.getElementById('iss-modal-status');
  statusEl.className   = `iss-badge ${issueBadgeClass(status)}`;
  statusEl.textContent = label;
  document.getElementById('iss-modal-priority-badge').innerHTML  = prioBadgeHtml(iss.priority);
  document.getElementById('iss-modal-title').textContent         = title;
  document.getElementById('iss-modal-desc').textContent          = iss.description || '—';
  document.getElementById('iss-modal-reporter').textContent      = iss.employee_name || '—';
  document.getElementById('iss-modal-company').textContent       = iss.company_name  || '—';
  document.getElementById('iss-modal-email').textContent         = iss.email         || '—';
  document.getElementById('iss-modal-assigned').textContent      = iss.assigned_to   || 'Unassigned';
  document.getElementById('iss-modal-category').textContent      = iss.request_category || '—';
  document.getElementById('iss-modal-type').textContent          = iss.ticket_type   || '—';
  document.getElementById('iss-modal-urgency').textContent       = iss.urgency       || '—';
  document.getElementById('iss-modal-date').textContent          = fmtDateTime(iss.created_at);

  // Show dept head action panel
  const session = loadSession();
  const dhPanel = document.getElementById('iss-dh-actions');
  if (session && (session.isDepartmentHead || session.isAdmin || session.isManagement)) {
    dhPanel.style.display = '';
    document.getElementById('iss-dh-status').value = status;
    document.getElementById('iss-dh-error').style.display = 'none';
    _populateIssueAssigneeSelect(iss.assigned_to || '');
  } else {
    dhPanel.style.display = 'none';
  }

  document.getElementById('issCommentInput').value = '';
  document.getElementById('issueDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadIssActivity(iss.id);
}

function _populateIssueAssigneeSelect(currentAssignee) {
  const sel = document.getElementById('iss-dh-assignee');
  sel.innerHTML = '<option value="">— Unassigned —</option>';
  const members = _teamMembers || [];
  members.forEach(m => {
    const name = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.username;
    const opt  = document.createElement('option');
    opt.value       = m.username;
    opt.textContent = `${name} (${m.username})`;
    if (m.username === currentAssignee) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function updateTeamIssue() {
  if (!_currentIssue) return;
  const assignedTo = document.getElementById('iss-dh-assignee').value;
  const status     = document.getElementById('iss-dh-status').value;
  const errEl      = document.getElementById('iss-dh-error');
  const saveBtn    = document.getElementById('iss-dh-save-btn');

  errEl.style.display    = 'none';
  saveBtn.disabled       = true;
  saveBtn.textContent    = 'Saving…';

  const payload = { status };
  payload.assigned_to = assignedTo || null;

  try {
    const res = await fetch(`/api/user/issues/team/${encodeURIComponent(_currentIssue.id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Update failed');

    // Refresh local state
    _currentIssue.status      = status;
    _currentIssue.assigned_to = assignedTo || null;
    _issueMap[_currentIssue.id] = _currentIssue;

    const scope = _issueSubtab;
    if (_issues[scope]) {
      const idx = _issues[scope].findIndex(i => i.id === _currentIssue.id);
      if (idx !== -1) _issues[scope][idx] = { ..._issues[scope][idx], status, assigned_to: assignedTo || null };
      renderIssueList(scope, _issues[scope]);
    }

    // Update the status badge in the modal header
    const statusEl = document.getElementById('iss-modal-status');
    statusEl.className   = `iss-badge ${issueBadgeClass(status)}`;
    statusEl.textContent = ISSUE_STATUS_LABELS[status] || status.replace('_', ' ');
    document.getElementById('iss-modal-assigned').textContent = assignedTo || 'Unassigned';

    showToast('Issue updated.');
  } catch (err) {
    document.getElementById('iss-dh-error-msg').textContent = err.message;
    errEl.style.display = 'flex';
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
  }
}

function closeIssueDetail() {
  document.getElementById('issueDetailModal').classList.remove('open');
  document.body.style.overflow = '';
}

function overlayCloseIssue(e) {
  if (e.target === document.getElementById('issueDetailModal')) closeIssueDetail();
}

/* ── Issue Activity & Comments ── */

function _renderIssActivityEntries(entries) {
  const list = document.getElementById('issActivityList');
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

async function loadIssActivity(issueId) {
  const list = document.getElementById('issActivityList');
  if (!list || !issueId) return;
  list.innerHTML = '<div class="iss-activity-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/issues/${encodeURIComponent(issueId)}/activity`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : [];
    _renderIssActivityEntries(data);
  } catch {
    list.innerHTML = '<div class="iss-activity-empty">Failed to load activity.</div>';
  }
}

function refreshIssActivity() {
  if (_currentIssue) loadIssActivity(_currentIssue.id);
}

async function postIssComment() {
  const input   = document.getElementById('issCommentInput');
  const comment = (input?.value || '').trim();
  if (!comment || !_currentIssue) return;

  const btn = document.querySelector('#issueDetailModal .iss-comment-submit');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/issues/${encodeURIComponent(_currentIssue.id)}/comments`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ comment }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to post comment');
    input.value = '';
    await loadIssActivity(_currentIssue.id);
  } catch (err) {
    showToast(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
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
        ${task.due_date   ? `<span>Due ${fmtDate(task.due_date)}</span>` : ''}
        ${task.created_by ? `<span${task.due_date ? ' style="opacity:0.65;"' : ''}> · ${escHtml(task.created_by)}</span>` : ''}
        ${task.assigned_to ? `<span class="issue-assigned-to" style="margin-left:auto;">→ ${escHtml(task.assigned_to)}</span>` : ''}
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
async function openUtModal(idOrNull) {
  const task = typeof idOrNull === 'string' ? _tasks.find(t => t.id === idOrNull) : null;
  _taskEditId = task?.id ?? null;
  document.getElementById('ut-modal-title-text').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('ut-task-id').value    = task?.id          ?? '';
  document.getElementById('ut-task-title').value = task?.title       ?? '';
  document.getElementById('ut-task-desc').value  = task?.description ?? '';
  document.getElementById('ut-task-status').value = task?.status     ?? 'open';
  document.getElementById('ut-task-due').value   = task?.due_date    ?? '';
  await _ensureTeamMembersLoaded();
  _setUtAssigneeDropdown(task?.assigned_to ?? '');
  document.getElementById('ut-delete-btn').style.display = task ? '' : 'none';

  const actSection = document.getElementById('ut-activity-section');
  if (actSection) actSection.style.display = task ? '' : 'none';

  _resetUtModalState();
  document.getElementById('utTaskModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('ut-task-title').focus(), 50);

  if (task) loadUtTaskActivity(task.id);
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

/* ── Assignee searchable dropdown ── */
async function _ensureTeamMembersLoaded() {
  if (_teamMembers !== null) return;
  try {
    const res = await fetch('/api/user/team', { headers: authHeaders() });
    if (!res.ok) throw new Error();
    _teamMembers = await res.json();
  } catch {
    _teamMembers = [];
  }
}

function _buildAssigneeList(filterText) {
  const list = document.getElementById('ut-assignee-list');
  if (!list) return;
  const q       = (filterText || '').toLowerCase().trim();
  const members = (_teamMembers || []).filter(m => {
    if (!q) return true;
    const name = (m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()).toLowerCase();
    return name.includes(q) || (m.username || '').toLowerCase().includes(q);
  });

  const rows = [];
  if (!q) {
    rows.push(`<div class="ut-assignee-opt" onclick="utAssigneeSelect('','Unassigned','')">
      <span class="ut-assignee-opt-avatar ut-assignee-opt-avatar--empty">—</span>
      <span class="ut-assignee-opt-name">Unassigned</span>
    </div>`);
  }
  members.forEach(m => {
    const name     = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.username;
    const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const safeUser = escHtml(m.username);
    const safeName = escHtml(name);
    const safeAv   = escHtml(m.avatar_url || '');
    const avatar   = m.avatar_url
      ? `<img class="ut-assignee-opt-avatar" src="${safeAv}" alt="">`
      : `<span class="ut-assignee-opt-avatar ut-assignee-opt-avatar--initials">${initials}</span>`;
    rows.push(`<div class="ut-assignee-opt" onclick="utAssigneeSelect('${safeUser}','${safeName}','${safeAv}')">
      ${avatar}
      <div class="ut-assignee-opt-info">
        <span class="ut-assignee-opt-name">${safeName}</span>
        ${m.position ? `<span class="ut-assignee-opt-pos">${escHtml(m.position)}</span>` : ''}
      </div>
    </div>`);
  });

  list.innerHTML = rows.length
    ? rows.join('')
    : `<div class="ut-assignee-empty">No members found</div>`;
}

function utAssigneeToggle() {
  _utAssigneeOpen ? _closeAssigneeDropdown() : _openAssigneeDropdown();
}

function _openAssigneeDropdown() {
  _utAssigneeOpen = true;
  document.getElementById('ut-assignee-dropdown')?.classList.add('open');
  document.getElementById('ut-assignee-wrap')?.classList.add('open');
  const search = document.getElementById('ut-assignee-search');
  if (search) search.value = '';
  _buildAssigneeList('');
  setTimeout(() => search?.focus(), 30);
}

function _closeAssigneeDropdown() {
  _utAssigneeOpen = false;
  document.getElementById('ut-assignee-dropdown')?.classList.remove('open');
  document.getElementById('ut-assignee-wrap')?.classList.remove('open');
}

function utAssigneeFilter(val) { _buildAssigneeList(val); }
function utAssigneeKeydown(e)  { if (e.key === 'Escape') _closeAssigneeDropdown(); }

function utAssigneeSelect(username, label, avatarUrl) {
  document.getElementById('ut-task-assignee').value  = username;
  document.getElementById('ut-assignee-label').textContent = label;
  const avatarEl = document.getElementById('ut-assignee-avatar');
  if (!username) {
    avatarEl.textContent          = '';
    avatarEl.className            = 'ut-assignee-avatar';
    avatarEl.style.backgroundImage = '';
  } else if (avatarUrl) {
    avatarEl.textContent          = '';
    avatarEl.className            = 'ut-assignee-avatar ut-assignee-avatar--img';
    avatarEl.style.backgroundImage = `url(${avatarUrl})`;
  } else {
    const initials = label.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    avatarEl.textContent          = initials;
    avatarEl.className            = 'ut-assignee-avatar ut-assignee-avatar--initials';
    avatarEl.style.backgroundImage = '';
  }
  _closeAssigneeDropdown();
}

function _setUtAssigneeDropdown(username) {
  if (!username) {
    utAssigneeSelect('', 'Unassigned', '');
    return;
  }
  const member = _teamMembers ? _teamMembers.find(m => m.username === username) : null;
  if (member) {
    const name = member.display_name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.username;
    utAssigneeSelect(member.username, name, member.avatar_url || '');
  } else {
    // Assigned to a user outside this team — show their username as-is
    utAssigneeSelect(username, username, '');
  }
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
    description: document.getElementById('ut-task-desc').value.trim()     || null,
    status:      document.getElementById('ut-task-status').value,
    due_date:    document.getElementById('ut-task-due').value              || null,
    assigned_to: document.getElementById('ut-task-assignee').value.trim() || null,
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
  if (!await showConfirm({ title: 'Delete Task', message: `Delete "${task?.title || 'this task'}"?`, detail: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
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

/* ── User Task Activity Log ── */
async function loadUtTaskActivity(taskId) {
  const list = document.getElementById('ut-activity-list');
  if (!list || !taskId) return;
  list.innerHTML = '<div class="iss-activity-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/user/tasks/${encodeURIComponent(taskId)}/activity`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : [];
    _renderUtActivityEntries(data);
  } catch {
    list.innerHTML = '<div class="iss-activity-empty">Failed to load activity.</div>';
  }
}

const _UT_ACT_ICONS = {
  status:   `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  assignee: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  edit:     `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
};

function _inferUtActType(message) {
  const m = (message || '').toLowerCase();
  if (m.startsWith('moved status'))  return 'status';
  if (m.startsWith('set assignee'))  return 'assignee';
  return 'edit';
}

function _renderUtActivityEntries(entries) {
  const list = document.getElementById('ut-activity-list');
  if (!list) return;
  if (!entries || entries.length === 0) {
    list.innerHTML = '<div class="iss-activity-empty">No activity yet.</div>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const time  = fmtDateTime(e.created_at);
    const user  = escHtml(e.username || '?');
    const msg   = escHtml(e.message  || '');
    const type  = _inferUtActType(e.message);
    const icon  = _UT_ACT_ICONS[type] || _UT_ACT_ICONS.edit;
    const tagCls   = { status: 'iss-act-tag--moved', assignee: 'iss-act-tag--comment', edit: 'iss-act-tag--note' }[type] || 'iss-act-tag--note';
    const tagLabel = { status: 'Status', assignee: 'Assignee', edit: 'Edit' }[type] || 'Update';
    return `<div class="iss-act-entry">
      <div class="iss-act-meta">
        <span class="iss-act-tag ${tagCls}" style="display:inline-flex;align-items:center;gap:4px;">${icon}${tagLabel}</span>
        <span class="iss-act-user">${user}</span>
        <span class="iss-act-time">${time}</span>
      </div>
      <div class="iss-act-text">${msg}</div>
    </div>`;
  }).join('');
}

/* ── User Task Physics Drag ── */
const _utRm   = window.matchMedia('(prefers-reduced-motion: reduce)');
const UT_SPRING_K    = 0.16;
const UT_SPRING_D    = 0.70;
const UT_MAX_TILT    = 8;
const UT_TILT_FACTOR = 0.55;

let _utDrag = null;

function initUtPhysicsDrag() {
  const board = document.getElementById('ut-kanban');
  if (!board) return;
  board.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const card = e.target.closest('.ut-card');
    if (!card || e.target.closest('button, a')) return;
    e.preventDefault();
    _utStartDrag(e, card);
  });
}

function _utStartDrag(e, card) {
  const rect = card.getBoundingClientRect();
  const offX = e.clientX - rect.left;
  const offY = e.clientY - rect.top;
  const id   = card.id.replace('utc-', '');

  const ghost = document.createElement('div');
  ghost.className    = 'drag-ghost';
  ghost.style.width  = rect.width  + 'px';
  ghost.style.height = rect.height + 'px';
  card.parentNode.insertBefore(ghost, card);

  card.classList.add('dragging-physics');
  card.style.width = rect.width + 'px';
  document.body.appendChild(card);
  document.body.classList.add('is-dragging');

  const initX = rect.left;
  const initY = rect.top;
  card.style.transform = `translate(${initX}px,${initY}px) scale(1.03)`;

  _utDrag = { id, el: card, ghost, x: initX, y: initY, vx: 0, vy: 0,
              tx: initX, ty: initY, offX, offY, activeCol: null, raf: null };

  document.addEventListener('pointermove',   _utOnDragMove);
  document.addEventListener('pointerup',     _utOnDragRelease);
  document.addEventListener('pointercancel', _utOnDragRelease);
  _utDrag.raf = requestAnimationFrame(_utPhysicsLoop);
}

function _utOnDragMove(e) {
  if (!_utDrag) return;
  e.preventDefault();
  _utDrag.tx = e.clientX - _utDrag.offX;
  _utDrag.ty = e.clientY - _utDrag.offY;
  const col = _utGetColAt(e.clientX, e.clientY);
  if (col !== _utDrag.activeCol) {
    document.querySelectorAll('#ut-kanban .kanban-col').forEach(c => c.classList.remove('drag-over'));
    if (col) col.classList.add('drag-over');
    _utDrag.activeCol = col;
  }
}

function _utPhysicsLoop() {
  if (!_utDrag) return;
  if (_utRm.matches) {
    _utDrag.x = _utDrag.tx; _utDrag.y = _utDrag.ty;
    _utDrag.el.style.transform = `translate(${_utDrag.x}px,${_utDrag.y}px) scale(1.02)`;
  } else {
    const ax = (_utDrag.tx - _utDrag.x) * UT_SPRING_K;
    const ay = (_utDrag.ty - _utDrag.y) * UT_SPRING_K;
    _utDrag.vx = (_utDrag.vx + ax) * UT_SPRING_D;
    _utDrag.vy = (_utDrag.vy + ay) * UT_SPRING_D;
    _utDrag.x += _utDrag.vx;
    _utDrag.y += _utDrag.vy;
    const tilt = Math.max(-UT_MAX_TILT, Math.min(UT_MAX_TILT, _utDrag.vx * UT_TILT_FACTOR));
    _utDrag.el.style.transform = `translate(${_utDrag.x}px,${_utDrag.y}px) rotate(${tilt.toFixed(2)}deg) scale(1.03)`;
  }
  _utDrag.raf = requestAnimationFrame(_utPhysicsLoop);
}

function _utGetColAt(x, y) {
  for (const col of document.querySelectorAll('#ut-kanban .kanban-col')) {
    const r = col.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return col;
  }
  return null;
}

async function _utOnDragRelease() {
  if (!_utDrag) return;
  cancelAnimationFrame(_utDrag.raf);
  document.removeEventListener('pointermove',   _utOnDragMove);
  document.removeEventListener('pointerup',     _utOnDragRelease);
  document.removeEventListener('pointercancel', _utOnDragRelease);
  document.querySelectorAll('#ut-kanban .kanban-col').forEach(c => c.classList.remove('drag-over'));
  document.body.classList.remove('is-dragging');

  const { el, ghost, id, activeCol } = _utDrag;
  _utDrag = null;

  const task      = _tasks.find(t => t.id === id);
  const newStatus = activeCol?.dataset.status;

  const gr = ghost.getBoundingClientRect();
  if (!_utRm.matches) {
    el.style.transition = 'transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s ease';
    el.style.boxShadow  = '';
  }
  el.style.transform = `translate(${gr.left}px,${gr.top}px) rotate(0deg) scale(1)`;
  await new Promise(r => setTimeout(r, _utRm.matches ? 0 : 260));

  el.classList.remove('dragging-physics');
  el.style.cssText = '';
  el.remove();
  ghost.remove();

  if (task && newStatus && newStatus !== task.status) {
    await moveUtTask(id, newStatus);
  } else {
    renderTaskBoard();
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
      `<a href="/general-helpdesk" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        General Helpdesk
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
  loadIssues('team').then(() => hidePageLoader());
  initUtPhysicsDrag();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeIssueDetail(); closeUtModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', e => {
    closeProfileMenu();
    if (_utAssigneeOpen && !document.getElementById('ut-assignee-wrap')?.contains(e.target)) _closeAssigneeDropdown();
  });
});
