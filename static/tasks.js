'use strict';

/* ── Session ── */
const SESSION_KEY = 'rgmc_gateway_session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function taskSignOut() { clearSession(); location.href = '/'; }
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
  const [y, m, d] = iso.slice(0, 10).split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function daysElapsed(task) {
  if (!task.start_date) return null;
  const start = new Date(task.start_date + 'T00:00:00');
  const end   = task.actual_end_date
    ? new Date(task.actual_end_date + 'T00:00:00')
    : new Date();
  const diff  = Math.floor((end - start) / 86400000);
  return diff >= 0 ? diff : 0;
}

/* ── Number roll animation ── */
const _rm = window.matchMedia('(prefers-reduced-motion: reduce)');
function rollNumber(el, from, to, ms = 480) {
  if (_rm.matches || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ── State ── */
const STATUSES      = ['open', 'in_progress', 'for_review', 'done'];
const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', for_review: 'For Review', done: 'Done' };

let _tasks              = [];
let _members            = {};
let _taskEditingId      = null;
let _taskFilter         = 'all';
let _taskDoneRemarksCallback = null;
let _taskActionsCache        = null;
let _taskResPendingFiles     = [];

function setTaskFilter(f) {
  _taskFilter = f;
  document.querySelectorAll('.dev-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  renderTaskBoard();
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

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || (!session.isAdmin && !session.isManagement)) {
    location.href = '/';
    return;
  }

  // Build profile dropdown
  const container = document.getElementById('tasksHeaderUser');
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
          <button class="profile-menu-item profile-menu-item--danger" onclick="taskSignOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  initColArcs();
  initPhysicsDrag();
  loadTaskMembers().then(() => loadTasks());

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeTaskDoneRemarksModal(); closeTaskDetailModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', () => closeProfileMenu());

  document.getElementById('taskType').addEventListener('change', function () {
    const othersGroup = document.getElementById('taskTypeOthersGroup');
    othersGroup.style.display = this.value === 'Others' ? '' : 'none';
    if (this.value !== 'Others') document.getElementById('taskTypeOthers').value = '';
  });
});

/* ── Per-creator card color palette ── */
const DEV_PALETTE = [
  'rgba(125,211,252,0.60)',
  'rgba(249,168,212,0.60)',
  'rgba(134,239,172,0.60)',
  'rgba(253,224,71,0.55)',
  'rgba(196,181,253,0.60)',
  'rgba(251,146,60,0.60)',
  'rgba(103,232,249,0.60)',
  'rgba(248,113,113,0.60)',
];

function devColor(username) {
  if (!username) return DEV_PALETTE[0];
  let h = 5381;
  for (let i = 0; i < username.length; i++) h = (h * 33 ^ username.charCodeAt(i)) >>> 0;
  return DEV_PALETTE[h % DEV_PALETTE.length];
}

/* ── Members (avatars for cards) ── */
async function loadTaskMembers() {
  try {
    const res = await fetch('/api/dev/members', { headers: authHeaders() });
    const data = await res.json();
    _members = {};
    (Array.isArray(data) ? data : []).forEach(m => {
      _members[m.username] = {
        displayName: m.display_name || m.first_name || m.username,
        avatarUrl:   m.avatar_url && (m.avatar_url.startsWith('data:') || m.avatar_url.startsWith('https://')) ? m.avatar_url : '',
      };
    });
  } catch { /* fallback: show initials only */ }
}

function authorBubble(username) {
  const m       = _members[username] || {};
  const name    = m.displayName || username;
  const initial = escHtml((name.charAt(0) || '?').toUpperCase());
  const label   = escHtml(name);
  if (m.avatarUrl) {
    return `<img src="${m.avatarUrl}" class="kcard-avatar" alt="${initial}" title="${label}">`;
  }
  return `<div class="kcard-avatar kcard-avatar-initial" title="${label}">${initial}</div>`;
}

/* ── Column arcs ── */
const ARC_R = 10;
const ARC_C = +(2 * Math.PI * ARC_R).toFixed(1);

function initColArcs() {
  STATUSES.forEach(status => {
    const header = document.querySelector(`#col-${status} .kanban-col-header`);
    if (!header || header.querySelector('.col-arc')) return;
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class',   'col-arc');
    svg.setAttribute('viewBox', '0 0 26 26');
    svg.setAttribute('aria-hidden', 'true');
    const bg   = document.createElementNS(ns, 'circle');
    bg.setAttribute('class', 'col-arc-bg');
    bg.setAttribute('cx', '13'); bg.setAttribute('cy', '13');
    bg.setAttribute('r', String(ARC_R));
    const fill = document.createElementNS(ns, 'circle');
    fill.setAttribute('class', 'col-arc-fill');
    fill.setAttribute('cx', '13'); fill.setAttribute('cy', '13');
    fill.setAttribute('r', String(ARC_R));
    fill.setAttribute('stroke-dasharray', String(ARC_C));
    fill.setAttribute('stroke-dashoffset', String(ARC_C));
    svg.appendChild(bg);
    svg.appendChild(fill);
    header.appendChild(svg);
  });
}

function updateColArcs(counts) {
  const max = Math.max(...Object.values(counts), 1);
  STATUSES.forEach(status => {
    const fill = document.querySelector(`#col-${status} .col-arc-fill`);
    if (!fill) return;
    const offset = ARC_C * (1 - counts[status] / max);
    fill.style.strokeDashoffset = offset.toFixed(2);
  });
}

/* ── Task type badge ── */
const TASK_TYPE_CLASS = {
  'General':       'ktype-feature',
  'Follow-up':     'ktype-improvement',
  'Investigation': 'ktype-admin',
  'Bug Fix':       'ktype-bugfix',
  'Improvement':   'ktype-improvement',
  'Admin Task':    'ktype-admin',
};

function taskTypeBadge(taskType) {
  if (!taskType) return '';
  const display = taskType.startsWith('Others: ') ? taskType.slice('Others: '.length) : taskType;
  const baseType = taskType.startsWith('Others: ') ? 'Others' : taskType;
  const cls = TASK_TYPE_CLASS[baseType] || 'ktype-others';
  return `<span class="kcard-type-badge ${cls}" title="${escHtml(taskType)}">${escHtml(display)}</span>`;
}

/* ── Skeleton loader ── */
function _showSkeletons() {
  const statusClr = {
    open:        'rgba(107,114,128,0.18)',
    in_progress: 'rgba(59,130,246,0.20)',
    for_review:  'rgba(245,158,11,0.18)',
    done:        'rgba(34,197,94,0.16)',
  };
  const shapes = [
    ['82%', '54%', true ],
    ['70%', null,  false],
    ['88%', '60%', true ],
    ['65%', '43%', false],
    ['75%', '50%', true ],
    ['78%', null,  false],
  ];
  STATUSES.forEach((status, colIdx) => {
    const col = document.getElementById(`cards-${status}`);
    if (!col) return;
    const clr = statusClr[status];
    const n   = colIdx === 0 ? 3 : 2;
    col.innerHTML = Array.from({ length: n }, (_, i) => {
      const [w1, w2, hasTag] = shapes[(colIdx * 2 + i) % shapes.length];
      const delay = colIdx * 50 + i * 85;
      return `<div class="kanban-skel" style="animation-delay:${delay}ms;border-left-color:${clr}">
        ${hasTag ? '<div class="skel-bar skel-tag"></div>' : ''}
        <div class="skel-bar skel-title" style="--sw:${w1}"></div>
        ${w2 ? `<div class="skel-bar skel-title" style="--sw:${w2}"></div>` : ''}
        <div class="skel-footer">
          <div class="skel-date"></div>
          <div class="skel-avatar-dot"></div>
        </div>
      </div>`;
    }).join('');
  });
}

/* ── Load & render board ── */
async function loadTasks() {
  const board = document.getElementById('kanbanBoard');
  board.classList.add('loading');
  _showSkeletons();

  try {
    const res = await fetch('/api/tasks', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _tasks = await res.json();
    renderTaskBoard();
  } catch (err) {
    STATUSES.forEach(s => {
      document.getElementById(`cards-${s}`).innerHTML =
        `<div class="admin-error" style="margin:8px;">Failed to load: ${escHtml(err.message)}</div>`;
    });
  } finally {
    board.classList.remove('loading');
  }
}

function renderTaskBoard() {
  const counts = {};
  const me = loadSession()?.username || '';
  const visible = _taskFilter === 'mine' ? _tasks.filter(t => t.created_by === me) : _tasks;

  STATUSES.forEach(status => {
    const col   = document.getElementById(`cards-${status}`);
    const items = visible.filter(t => t.status === status);
    const count = items.length;
    counts[status] = count;

    const countEl = document.getElementById(`count-${status}`);
    const prevCol = parseInt(countEl.textContent, 10);
    rollNumber(countEl, isNaN(prevCol) ? 0 : prevCol, count);

    const statEl = document.getElementById(`stat-count-${status}`);
    if (statEl) {
      const prevStat = parseInt(statEl.textContent, 10);
      rollNumber(statEl, isNaN(prevStat) ? 0 : prevStat, count);
    }

    col.innerHTML = count
      ? items.map((task, idx) => renderTaskCard(task, idx)).join('')
      : `<div class="kanban-empty">
           <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
           ${_taskFilter === 'mine' ? 'None assigned to you' : 'No tasks'}
         </div>`;
  });
  updateColArcs(counts);
}

function renderTaskCard(task, idx = 0) {
  const elapsed   = daysElapsed(task);
  const overdue   = task.estimated_end_date && !task.actual_end_date &&
                    new Date(task.estimated_end_date + 'T00:00:00') < new Date();
  const statusIdx = STATUSES.indexOf(task.status);
  const devClr    = devColor(task.created_by);
  const archived  = task.is_active === false;

  const topRow = task.task_type ? `<div class="kcard-top-row">
      ${taskTypeBadge(task.task_type)}
      ${archived ? '<span class="kcard-type-badge ktype-others" style="margin-left:auto;">Archived</span>' : ''}
    </div>` : (archived ? `<div class="kcard-top-row"><span class="kcard-type-badge ktype-others" style="margin-left:auto;">Archived</span></div>` : '');

  return `<div class="kanban-card${archived ? ' kanban-card--archived' : ''}" id="card-${escHtml(task.id)}"
               style="animation-delay:${idx * 55}ms;--dev-clr:${devClr}${archived ? ';opacity:0.6' : ''}">
    ${topRow}
    <div class="kcard-title">${escHtml(task.task_name)}</div>
    ${task.description ? `<div class="kcard-desc">${escHtml(task.description)}</div>` : ''}
    <div class="kcard-meta">
      <div class="kcard-dates">
        ${task.start_date ? `<span class="kcard-date-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Start: ${fmtDate(task.start_date)}
        </span>` : ''}
        ${task.estimated_end_date ? `<span class="kcard-date-item ${overdue ? 'kcard-overdue' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Est: ${fmtDate(task.estimated_end_date)}${overdue ? ' ⚠' : ''}
        </span>` : ''}
        ${task.actual_end_date ? `<span class="kcard-date-item kcard-actual">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Done: ${fmtDate(task.actual_end_date)}
        </span>` : ''}
        ${elapsed !== null ? `<span class="kcard-elapsed">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          ${elapsed} day${elapsed !== 1 ? 's' : ''} elapsed
        </span>` : ''}
      </div>
      ${authorBubble(task.created_by)}
    </div>
    <div class="kcard-actions">
      ${statusIdx > 0
        ? `<button class="kcard-btn" onclick="moveTask('${escHtml(task.id)}','${STATUSES[statusIdx-1]}')" title="Move left">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
           </button>`
        : '<span class="kcard-btn-placeholder"></span>'}
      <div class="kcard-actions-center">
        <button class="kcard-btn" onclick="openTaskDetailModal('${escHtml(task.id)}')" title="Details &amp; Activity">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      ${statusIdx < STATUSES.length - 1
        ? `<button class="kcard-btn" onclick="moveTask('${escHtml(task.id)}','${STATUSES[statusIdx+1]}')" title="Move right">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
           </button>`
        : '<span class="kcard-btn-placeholder"></span>'}
    </div>
  </div>`;
}

/* ── Move task (arrow buttons) ── */
async function moveTask(id, newStatus) {
  const task = _tasks.find(t => t.id === id);
  if (!task) return;
  if (newStatus === 'done' && task.status !== 'done') {
    openTaskDoneRemarksModal((remarks, actionIds, files) => _execMoveTask(id, newStatus, remarks, actionIds, files));
    return;
  }
  await _execMoveTask(id, newStatus, null, [], []);
}

async function _execMoveTask(id, newStatus, remarks, actionIds = [], files = []) {
  const task = _tasks.find(t => t.id === id);
  if (!task) return;
  const patch = { status: newStatus };
  if (newStatus === 'done' && !task.actual_end_date) {
    patch.actual_end_date = new Date().toISOString().slice(0, 10);
  }
  if (newStatus !== 'done') {
    patch.actual_end_date = null;
  }
  if (newStatus === 'done') {
    if (actionIds.length) patch.resolution_action_ids = actionIds;
    if (files.length) {
      const urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('entity_type', 'task');
        fd.append('entity_id',   id);
        fd.append('file',        file);
        try {
          const r = await fetch('/api/upload/resolution', { method: 'POST', headers: authHeaders(), body: fd });
          const d = await r.json();
          if (d.url) urls.push(d.url);
        } catch {}
      }
      if (urls.length) patch.resolution_attachment_urls = urls;
    }
  }
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const updated = await res.json();
    const idx = _tasks.findIndex(t => t.id === id);
    if (idx !== -1) _tasks[idx] = { ..._tasks[idx], ...updated };
    renderTaskBoard();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Physics drag-and-drop ── */
const SPRING_K    = 0.16;
const SPRING_D    = 0.70;
const MAX_TILT    = 8;
const TILT_FACTOR = 0.55;

let _drag = null;

function initPhysicsDrag() {
  document.getElementById('kanbanBoard').addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const card = e.target.closest('.kanban-card');
    if (!card || e.target.closest('button, a')) return;
    e.preventDefault();
    _startDrag(e, card);
  });
}

function _startDrag(e, card) {
  const rect = card.getBoundingClientRect();
  const offX = e.clientX - rect.left;
  const offY = e.clientY - rect.top;
  const id   = card.id.replace('card-', '');

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

  _drag = { id, el: card, ghost, x: initX, y: initY, vx: 0, vy: 0,
            tx: initX, ty: initY, offX, offY, activeCol: null, raf: null };

  document.addEventListener('pointermove', _onDragMove);
  document.addEventListener('pointerup',     _onDragRelease);
  document.addEventListener('pointercancel', _onDragRelease);
  _drag.raf = requestAnimationFrame(_physicsLoop);
}

function _onDragMove(e) {
  if (!_drag) return;
  e.preventDefault();
  _drag.tx = e.clientX - _drag.offX;
  _drag.ty = e.clientY - _drag.offY;
  const col = _getColAt(e.clientX, e.clientY);
  if (col !== _drag.activeCol) {
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
    if (col) col.classList.add('drag-over');
    _drag.activeCol = col;
  }
}

function _physicsLoop() {
  if (!_drag) return;
  if (_rm.matches) {
    _drag.x = _drag.tx; _drag.y = _drag.ty;
    _drag.el.style.transform = `translate(${_drag.x}px,${_drag.y}px) scale(1.02)`;
  } else {
    const ax = (_drag.tx - _drag.x) * SPRING_K;
    const ay = (_drag.ty - _drag.y) * SPRING_K;
    _drag.vx = (_drag.vx + ax) * SPRING_D;
    _drag.vy = (_drag.vy + ay) * SPRING_D;
    _drag.x += _drag.vx;
    _drag.y += _drag.vy;
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, _drag.vx * TILT_FACTOR));
    _drag.el.style.transform = `translate(${_drag.x}px,${_drag.y}px) rotate(${tilt.toFixed(2)}deg) scale(1.03)`;
  }
  _drag.raf = requestAnimationFrame(_physicsLoop);
}

function _getColAt(x, y) {
  for (const col of document.querySelectorAll('.kanban-col')) {
    const r = col.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return col;
  }
  return null;
}

async function _onDragRelease() {
  if (!_drag) return;
  cancelAnimationFrame(_drag.raf);
  document.removeEventListener('pointermove', _onDragMove);
  document.removeEventListener('pointerup',     _onDragRelease);
  document.removeEventListener('pointercancel', _onDragRelease);
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  document.body.classList.remove('is-dragging');

  const { el, ghost, id, activeCol } = _drag;
  _drag = null;

  const task      = _tasks.find(t => t.id === id);
  const newStatus = activeCol?.dataset.status;

  const gr = ghost.getBoundingClientRect();
  if (!_rm.matches) {
    el.style.transition = 'transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s ease';
    el.style.boxShadow  = '';
  }
  el.style.transform = `translate(${gr.left}px,${gr.top}px) rotate(0deg) scale(1)`;
  await new Promise(r => setTimeout(r, _rm.matches ? 0 : 260));

  el.classList.remove('dragging-physics');
  el.style.cssText = '';
  el.remove();
  ghost.remove();

  if (task && newStatus && newStatus !== task.status) {
    await moveTask(id, newStatus);
  } else {
    renderTaskBoard();
  }
}

/* ── Delete ── */
async function deleteTask(id) {
  const task = _tasks.find(t => t.id === id);
  const name = task?.task_name || id;
  if (!confirm(`Delete "${name}"? This also removes all activity logs and cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _tasks = _tasks.filter(t => t.id !== id);
    renderTaskBoard();
    showToast('Task deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Task detail modal ── */
function openTaskDetailModal(idOrNull) {
  const task = idOrNull ? _tasks.find(t => t.id === idOrNull) : null;
  _taskEditingId = task?.id ?? null;

  document.getElementById('taskDetailModalTitle').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('taskDetailModalMeta').textContent  = task
    ? `Created by ${task.created_by}`
    : 'Fill in the details below';
  document.getElementById('taskEditId').value      = task?.id ?? '';
  document.getElementById('taskName').value        = task?.task_name ?? '';
  document.getElementById('taskDesc').value        = task?.description ?? '';
  document.getElementById('taskStatus').value      = task?.status ?? 'open';
  document.getElementById('taskStart').value       = task?.start_date ?? '';
  document.getElementById('taskEstEnd').value      = task?.estimated_end_date ?? '';
  document.getElementById('taskIsActive').checked  = task ? (task.is_active !== false) : true;

  // Task type — handle "Others: ..." case
  const savedType   = task?.task_type ?? '';
  const knownTypes  = ['General','Follow-up','Investigation','Bug Fix','Improvement','Admin Task','Others'];
  const typeSelect  = document.getElementById('taskType');
  const othersGroup = document.getElementById('taskTypeOthersGroup');
  const othersInput = document.getElementById('taskTypeOthers');
  if (savedType.startsWith('Others: ')) {
    typeSelect.value   = 'Others';
    othersInput.value  = savedType.slice('Others: '.length);
    othersGroup.style.display = '';
  } else {
    typeSelect.value   = knownTypes.includes(savedType) ? savedType : '';
    othersInput.value  = '';
    othersGroup.style.display = 'none';
  }

  const body      = document.getElementById('taskDetailBody');
  const logPane   = document.getElementById('taskDetailLogPane');
  const deleteBtn = document.getElementById('taskDetailDeleteBtn');

  if (task) {
    body.classList.remove('detail-new');
    logPane.style.display   = '';
    deleteBtn.style.display = '';
    refreshTaskLogs();
  } else {
    body.classList.add('detail-new');
    logPane.style.display   = 'none';
    deleteBtn.style.display = 'none';
  }

  resetTaskForm();
  document.getElementById('taskDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('taskName').focus(), 60);
}

function closeTaskDetailModal() {
  document.getElementById('taskDetailModal').classList.remove('open');
  document.body.style.overflow = '';
  _taskEditingId = null;
}

function overlayCloseTaskDetail(e) {
  if (e.target === document.getElementById('taskDetailModal')) closeTaskDetailModal();
}

/* ── Resolution helpers (actions checklist + image attachments) ── */
async function _taskLoadActions() {
  if (_taskActionsCache) return;
  try {
    const r = await fetch('/api/actions');
    _taskActionsCache = r.ok ? await r.json() : [];
  } catch { _taskActionsCache = []; }
}

function _taskRenderActionsGrid() {
  const grid = document.getElementById('taskActionsGrid');
  if (!grid) return;
  const actions = _taskActionsCache || [];
  if (!actions.length) {
    grid.innerHTML = '<span class="res-actions-empty">No actions configured.</span>';
    return;
  }
  grid.innerHTML = actions.map(a =>
    `<label class="res-action-item" title="${escHtml(a.action_desc || '')}">
      <input type="checkbox" value="${a.action_id}" onchange="this.closest('.res-action-item').classList.toggle('checked',this.checked)">
      ${escHtml(a.action_name)}
    </label>`
  ).join('');
}

function _taskGetCheckedActionIds() {
  const grid = document.getElementById('taskActionsGrid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => parseInt(cb.value, 10));
}

function taskResAttachChange(input) {
  const remaining = 5 - _taskResPendingFiles.length;
  _taskResPendingFiles.push(...Array.from(input.files).slice(0, remaining));
  input.value = '';
  _taskRenderResAttachPreviews();
}

function _taskRenderResAttachPreviews() {
  const wrap   = document.getElementById('taskResAttachPreviews');
  const addBtn = document.getElementById('taskResAttachAddBtn');
  if (!wrap) return;
  if (addBtn) addBtn.style.display = _taskResPendingFiles.length >= 5 ? 'none' : '';
  wrap.innerHTML = _taskResPendingFiles.map((f, i) =>
    `<div class="res-attach-thumb">
      <img src="${URL.createObjectURL(f)}" alt="${escHtml(f.name)}">
      <button type="button" class="res-attach-remove" onclick="taskResRemovePending(${i})" title="Remove">&times;</button>
    </div>`
  ).join('');
}

function taskResRemovePending(i) {
  _taskResPendingFiles.splice(i, 1);
  _taskRenderResAttachPreviews();
}

/* ── Mark-Done remarks modal ── */
async function openTaskDoneRemarksModal(onConfirm) {
  _taskDoneRemarksCallback = onConfirm;
  _taskResPendingFiles     = [];
  document.getElementById('taskDoneRemarksText').value = '';
  await _taskLoadActions();
  _taskRenderActionsGrid();
  _taskRenderResAttachPreviews();
  document.getElementById('taskDoneRemarksModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('taskDoneRemarksText').focus(), 60);
}

function closeTaskDoneRemarksModal() {
  document.getElementById('taskDoneRemarksModal').classList.remove('open');
  const detailOpen = document.getElementById('taskDetailModal').classList.contains('open');
  if (!detailOpen) document.body.style.overflow = '';
  _taskDoneRemarksCallback = null;
}

function overlayCloseTaskDoneRemarks(e) {
  if (e.target === document.getElementById('taskDoneRemarksModal')) closeTaskDoneRemarksModal();
}

function confirmTaskMarkDone() {
  const remarks   = document.getElementById('taskDoneRemarksText').value.trim();
  const actionIds = _taskGetCheckedActionIds();
  const files     = _taskResPendingFiles.slice();
  const cb = _taskDoneRemarksCallback;
  closeTaskDoneRemarksModal();
  if (cb) cb(remarks, actionIds, files);
}

async function deleteTaskFromDetail() {
  if (!_taskEditingId) return;
  const id = _taskEditingId;
  closeTaskDetailModal();
  await deleteTask(id);
}

function resetTaskForm() {
  document.getElementById('taskFormActions').style.display = '';
  document.getElementById('taskFormLoading').style.display = 'none';
  document.getElementById('taskFormError').style.display   = 'none';
  document.getElementById('taskSubmitBtn').disabled        = false;
}

async function saveTask(e) {
  e.preventDefault();
  const taskName = document.getElementById('taskName').value.trim();
  if (!taskName) {
    document.getElementById('taskFormError').style.display = '';
    document.getElementById('taskErrorMsg').textContent    = 'Task name is required.';
    return;
  }

  const newStatus = document.getElementById('taskStatus').value;
  const prevTask  = _taskEditingId ? _tasks.find(t => t.id === _taskEditingId) : null;

  if (newStatus === 'done' && prevTask?.status !== 'done') {
    openTaskDoneRemarksModal((remarks, actionIds, files) => _execSaveTask(remarks, actionIds, files));
    return;
  }
  await _execSaveTask(null, [], []);
}

async function _execSaveTask(remarks, actionIds = [], files = []) {
  const taskName = document.getElementById('taskName').value.trim();
  if (!taskName) return;

  const newStatus = document.getElementById('taskStatus').value;
  const prevTask  = _taskEditingId ? _tasks.find(t => t.id === _taskEditingId) : null;

  let actual_end_date = prevTask?.actual_end_date ?? null;
  if (newStatus === 'done' && !actual_end_date) {
    actual_end_date = new Date().toISOString().slice(0, 10);
  } else if (newStatus !== 'done') {
    actual_end_date = null;
  }

  const typeVal    = document.getElementById('taskType').value;
  const othersText = document.getElementById('taskTypeOthers').value.trim();
  const taskType   = typeVal === 'Others'
    ? (othersText ? `Others: ${othersText}` : 'Others')
    : (typeVal || null);

  const payload = {
    task_name:          taskName,
    task_type:          taskType,
    description:        document.getElementById('taskDesc').value.trim() || null,
    status:             newStatus,
    is_active:          document.getElementById('taskIsActive').checked,
    start_date:         document.getElementById('taskStart').value || null,
    estimated_end_date: document.getElementById('taskEstEnd').value || null,
    actual_end_date,
  };
  if (newStatus === 'done') {
    if (actionIds.length) payload.resolution_action_ids = actionIds;
    if (files.length) {
      const entityId = _taskEditingId || 'new';
      const urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('entity_type', 'task');
        fd.append('entity_id',   entityId);
        fd.append('file',        file);
        try {
          const r = await fetch('/api/upload/resolution', { method: 'POST', headers: authHeaders(), body: fd });
          const d = await r.json();
          if (d.url) urls.push(d.url);
        } catch {}
      }
      if (urls.length) payload.resolution_attachment_urls = urls;
    }
  }

  document.getElementById('taskFormActions').style.display = 'none';
  document.getElementById('taskFormLoading').style.display = '';

  try {
    let res;
    if (_taskEditingId) {
      res = await fetch(`/api/tasks/${encodeURIComponent(_taskEditingId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/tasks', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    if (_taskEditingId) {
      const idx = _tasks.findIndex(t => t.id === _taskEditingId);
      if (idx !== -1) _tasks[idx] = saved;
    } else {
      _tasks.push(saved);
    }
    renderTaskBoard();
    closeTaskDetailModal();
    showToast(`Task ${_taskEditingId ? 'updated' : 'created'}.`);
  } catch (err) {
    document.getElementById('taskFormLoading').style.display = 'none';
    document.getElementById('taskFormActions').style.display = '';
    document.getElementById('taskFormError').style.display   = '';
    document.getElementById('taskErrorMsg').textContent      = err.message;
  }
}

/* ── Activity log (inside detail pane) ── */
function fmtHours(h) {
  if (h == null) return '';
  const n = parseFloat(h);
  if (!n) return '';
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(2).replace(/\.?0+$/, '')}h`;
}

async function refreshTaskLogs() {
  if (!_taskEditingId) return;
  const list    = document.getElementById('taskLogList');
  const totalEl = document.getElementById('taskLogTotalHours');
  list.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/tasks/${encodeURIComponent(_taskEditingId)}/logs`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const logs = await res.json();

    // Compute total hours (logs may not have hours_spent — keep for compatibility)
    const total = logs.reduce((sum, l) => sum + (parseFloat(l.hours_spent) || 0), 0);
    if (total > 0) {
      const display = total % 1 === 0 ? `${total}` : total.toFixed(2).replace(/\.?0+$/, '');
      totalEl.textContent   = `${display} hrs total`;
      totalEl.style.display = '';
    } else {
      totalEl.style.display = 'none';
    }

    if (logs.length === 0) {
      list.innerHTML = '<div class="activity-log-empty">No activity yet. Be the first to log something.</div>';
      return;
    }
    list.innerHTML = logs.map(log => {
      const hrs = fmtHours(log.hours_spent);
      return `
      <div class="activity-log-entry">
        <div class="log-meta">
          <span class="log-author">${escHtml(log.username)}</span>
          ${hrs ? `<span class="log-hours-badge">${escHtml(hrs)}</span>` : ''}
          <span class="log-time">${fmtDateTime(log.created_at)}</span>
        </div>
        <div class="log-message">${escHtml(log.message)}</div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    list.innerHTML = `<div class="admin-error">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

async function addTaskLog() {
  if (!_taskEditingId) return;
  const message = document.getElementById('taskLogMessage').value.trim();
  document.getElementById('taskLogAddError').style.display = 'none';
  if (!message) {
    document.getElementById('taskLogAddError').style.display    = '';
    document.getElementById('taskLogAddErrorMsg').textContent   = 'Message cannot be empty.';
    return;
  }
  const rawHours    = document.getElementById('taskLogHours').value.trim();
  const hours_spent = rawHours !== '' && parseFloat(rawHours) >= 0 ? parseFloat(rawHours) : null;
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(_taskEditingId)}/logs`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, hours_spent }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    document.getElementById('taskLogMessage').value = '';
    document.getElementById('taskLogHours').value   = '';
    await refreshTaskLogs();
  } catch (err) {
    document.getElementById('taskLogAddError').style.display  = '';
    document.getElementById('taskLogAddErrorMsg').textContent = err.message;
  }
}
