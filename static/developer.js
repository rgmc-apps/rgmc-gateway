'use strict';

/* ── Session ── */
const SESSION_KEY = 'rgmc_gateway_session';
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function devSignOut() { clearSession(); location.href = '/'; }
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
function daysElapsed(item) {
  if (!item.start_date) return null;
  const start = new Date(item.start_date + 'T00:00:00');
  const end   = item.actual_end_date
    ? new Date(item.actual_end_date + 'T00:00:00')
    : new Date();
  const diff  = Math.floor((end - start) / 86400000);
  return diff >= 0 ? diff : 0;
}

/* ── Number roll animation ── */
function rollNumber(el, from, to, ms = 480) {
  if (_rm.matches || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3); // ease-out-cubic
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ── State ── */
let _items               = [];
let _systems             = [];
let _members             = {};   // username → { displayName, avatarUrl }
let _editingId           = null;
let _filter              = 'all'; // 'all' | 'mine'
let _doneRemarksCallback = null;

const DONE_WEEKS_KEY = 'dev-done-weeks';
let _doneWeeks = Math.max(1, parseInt(localStorage.getItem(DONE_WEEKS_KEY) || '2', 10));

function setDoneWeeks(val) {
  const n = Math.max(1, Math.min(52, parseInt(val, 10) || 2));
  _doneWeeks = n;
  localStorage.setItem(DONE_WEEKS_KEY, String(n));
  const inp = document.getElementById('doneWeeksInput');
  if (inp) inp.value = n;
  renderBoard();
}

function setFilter(f) {
  _filter = f;
  document.querySelectorAll('.dev-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  renderBoard();
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
  if (!session || !session.username || (!session.isDeveloper && !session.isAdmin)) {
    location.href = '/';
    return;
  }

  // Build profile dropdown
  const container = document.getElementById('devHeaderUser');
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
    if (session.isAdmin || session.isManagement) {
      navItems.push(`<a href="/tasks" class="profile-menu-item">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
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
          <button class="profile-menu-item profile-menu-item--danger" onclick="devSignOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>`;
  }

  initColArcs();
  initPhysicsDrag();
  loadMembers().then(() => loadSystems()).then(() => loadItems());

  const doneWeeksInput = document.getElementById('doneWeeksInput');
  if (doneWeeksInput) doneWeeksInput.value = _doneWeeks;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDoneRemarksModal(); closeDetailModal(); closeAddSystemModal(); closeArchiveModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', () => closeProfileMenu());

  document.getElementById('itemType').addEventListener('change', function () {
    const othersGroup = document.getElementById('itemTypeOthersGroup');
    othersGroup.style.display = this.value === 'Others' ? '' : 'none';
    if (this.value !== 'Others') document.getElementById('itemTypeOthers').value = '';
  });
});

/* ── Per-developer card color palette ── */
const DEV_PALETTE = [
  'rgba(125,211,252,0.60)',  // sky
  'rgba(249,168,212,0.60)',  // pink
  'rgba(134,239,172,0.60)',  // green
  'rgba(253,224,71,0.55)',   // yellow
  'rgba(196,181,253,0.60)',  // violet
  'rgba(251,146,60,0.60)',   // orange
  'rgba(103,232,249,0.60)',  // cyan
  'rgba(248,113,113,0.60)',  // red
];

function devColor(username) {
  if (!username) return DEV_PALETTE[0];
  let h = 5381;
  for (let i = 0; i < username.length; i++) h = (h * 33 ^ username.charCodeAt(i)) >>> 0;
  return DEV_PALETTE[h % DEV_PALETTE.length];
}

/* ── Members (avatars for cards) ── */
async function loadMembers() {
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
const ARC_C = +(2 * Math.PI * ARC_R).toFixed(1); // circumference ≈ 62.8

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
    fill.setAttribute('stroke-dashoffset', String(ARC_C)); // starts empty
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

/* ── Systems ── */
async function loadSystems() {
  try {
    const res = await fetch('/api/dev/systems', { headers: authHeaders() });
    if (res.ok) {
      _systems = await res.json();
      populateSystemDropdown(document.getElementById('itemSystem'), null);
    }
  } catch { /* non-fatal */ }
}

function populateSystemDropdown(select, selectedId) {
  const prev = selectedId ?? select.value;
  select.innerHTML = '<option value="">— None —</option>' +
    _systems.map(s => `<option value="${escHtml(s.id)}" ${s.id === prev ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('');
}

function systemName(id) {
  if (!id) return null;
  const s = _systems.find(s => s.id === id);
  return s ? s.name : id;
}

/* ── Skeleton loader ── */
function _showSkeletons() {
  const statusClr = {
    pending: 'rgba(107,114,128,0.18)',
    ongoing: 'rgba(168,85,247,0.18)',
    coding:  'rgba(59,130,246,0.20)',
    testing: 'rgba(245,158,11,0.18)',
    done:    'rgba(34,197,94,0.16)',
  };
  /* shape variants: [title-width-1, title-width-2|null, hasTag] */
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
async function loadItems() {
  const board = document.getElementById('kanbanBoard');
  board.classList.add('loading');
  _showSkeletons();

  try {
    const res = await fetch('/api/dev/items', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _items = await res.json();
    renderBoard();
  } catch (err) {
    ['pending','ongoing','coding','testing','done'].forEach(s => {
      document.getElementById(`cards-${s}`).innerHTML =
        `<div class="admin-error" style="margin:8px;">Failed to load: ${escHtml(err.message)}</div>`;
    });
  } finally {
    board.classList.remove('loading');
  }
}

const STATUSES = ['pending', 'ongoing', 'coding', 'testing', 'done'];

function renderBoard() {
  const counts = {};
  const me      = loadSession()?.username || '';
  const visible = _filter === 'mine' ? _items.filter(i => i.created_by === me) : _items;

  STATUSES.forEach(status => {
    const col  = document.getElementById(`cards-${status}`);
    let   items = visible.filter(i => i.status === status);

    if (status === 'done') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - _doneWeeks * 7);
      const cutoffStr      = cutoff.toISOString().slice(0, 10);
      const allDoneCount   = items.length;
      items                = items.filter(i => !i.actual_end_date || i.actual_end_date >= cutoffStr);
      const archivedCount  = allDoneCount - items.length;
      const archivedEl     = document.getElementById('done-archived-count');
      if (archivedEl) archivedEl.textContent = archivedCount > 0 ? `${archivedCount} archived` : '';
    }

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
      ? items.map((item, idx) => renderCard(item, idx)).join('')
      : `<div class="kanban-empty">
           <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
           ${_filter === 'mine' ? 'None assigned to you' : 'No items'}
         </div>`;
  });
  updateColArcs(counts);
}

const TYPE_CLASS = {
  'New Feature':  'ktype-feature',
  'Improvement':  'ktype-improvement',
  'Bug Fix':      'ktype-bugfix',
  'Admin Task':   'ktype-admin',
  'Discussion':   'ktype-discussion',
  'Maintenance':  'ktype-maintenance',
};

function typeBadge(devItemType) {
  if (!devItemType) return '';
  const label = devItemType.startsWith('Others: ') ? devItemType : devItemType;
  const display = devItemType.startsWith('Others: ') ? devItemType.slice('Others: '.length) : devItemType;
  const cls = TYPE_CLASS[devItemType] || 'ktype-others';
  return `<span class="kcard-type-badge ${cls}" title="${escHtml(label)}">${escHtml(display)}</span>`;
}

function renderCard(item, idx = 0) {
  const elapsed    = daysElapsed(item);
  const overdue    = item.estimated_end_date && !item.actual_end_date &&
                     new Date(item.estimated_end_date + 'T00:00:00') < new Date();
  const statusIdx  = STATUSES.indexOf(item.status);

  const sysLabel = systemName(item.system_id);
  const devClr   = devColor(item.created_by);
  const topRow = (sysLabel || item.dev_item_type) ? `<div class="kcard-top-row">
      ${sysLabel ? `<div class="kcard-system-tag">${escHtml(sysLabel)}</div>` : ''}
      ${typeBadge(item.dev_item_type)}
    </div>` : '';
  return `<div class="kanban-card" id="card-${escHtml(item.id)}"
               style="animation-delay:${idx * 55}ms;--dev-clr:${devClr}">
    ${item.dev_item_code ? `<div class="kcard-code">${escHtml(item.dev_item_code)}</div>` : ''}
    ${topRow}
    <div class="kcard-title">${escHtml(item.title)}</div>
    ${item.description ? `<div class="kcard-desc">${escHtml(item.description)}</div>` : ''}
    <div class="kcard-meta">
      <div class="kcard-dates">
        ${item.start_date ? `<span class="kcard-date-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Start: ${fmtDate(item.start_date)}
        </span>` : ''}
        ${item.estimated_end_date ? `<span class="kcard-date-item ${overdue ? 'kcard-overdue' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Est: ${fmtDate(item.estimated_end_date)}${overdue ? ' ⚠' : ''}
        </span>` : ''}
        ${item.actual_end_date ? `<span class="kcard-date-item kcard-actual">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Done: ${fmtDate(item.actual_end_date)}
        </span>` : ''}
        ${elapsed !== null ? `<span class="kcard-elapsed">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          ${elapsed} day${elapsed !== 1 ? 's' : ''} elapsed
        </span>` : ''}
      </div>
      ${authorBubble(item.created_by)}
    </div>
    <div class="kcard-actions">
      ${statusIdx > 0
        ? `<button class="kcard-btn" onclick="moveItem('${escHtml(item.id)}','${STATUSES[statusIdx-1]}')" title="Move left">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
           </button>`
        : '<span class="kcard-btn-placeholder"></span>'}
      <div class="kcard-actions-center">
        <button class="kcard-btn" onclick="openDetailModal('${escHtml(item.id)}')" title="Details &amp; Activity">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      ${statusIdx < STATUSES.length - 1
        ? `<button class="kcard-btn" onclick="moveItem('${escHtml(item.id)}','${STATUSES[statusIdx+1]}')" title="Move right">
             <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
           </button>`
        : '<span class="kcard-btn-placeholder"></span>'}
    </div>
  </div>`;
}

/* ── Move item (arrow buttons) ── */
async function moveItem(id, newStatus) {
  const item = _items.find(i => i.id === id);
  if (!item) return;
  if (newStatus === 'done' && item.status !== 'done') {
    openDoneRemarksModal(remarks => _execMoveItem(id, newStatus, remarks));
    return;
  }
  await _execMoveItem(id, newStatus, null);
}

async function _execMoveItem(id, newStatus, remarks) {
  const item = _items.find(i => i.id === id);
  if (!item) return;
  const patch = { status: newStatus };
  if (newStatus === 'done' && !item.actual_end_date) {
    patch.actual_end_date = new Date().toISOString().slice(0, 10);
  }
  if (newStatus !== 'done') {
    patch.actual_end_date = null;
  }
  if (remarks) patch.remarks = remarks;
  try {
    await fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    Object.assign(item, patch);
    renderBoard();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Physics drag-and-drop ── */
const SPRING_K    = 0.16;
const SPRING_D    = 0.70;
const MAX_TILT    = 8;
const TILT_FACTOR = 0.55;
const _rm         = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  const item      = _items.find(i => i.id === id);
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

  if (item && newStatus && newStatus !== item.status) {
    await moveItem(id, newStatus);
  } else {
    renderBoard();
  }
}

/* ── Delete ── */
async function deleteItem(id) {
  const item = _items.find(i => i.id === id);
  const title = item?.title || id;
  if (!confirm(`Delete "${title}"? This also removes all activity logs and cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _items = _items.filter(i => i.id !== id);
    renderBoard();
    showToast('Item deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Item detail modal (add / edit + activity log) ── */
function openDetailModal(idOrNull) {
  const item = idOrNull ? _items.find(i => i.id === idOrNull) : null;
  _editingId = item?.id ?? null;

  document.getElementById('detailModalTitle').textContent = item ? 'Edit Item' : 'New Item';
  document.getElementById('detailModalMeta').textContent  = item
    ? `${item.dev_item_code ? item.dev_item_code + ' · ' : ''}Created by ${item.created_by}`
    : 'Fill in the details below';
  document.getElementById('itemEditId').value   = item?.id ?? '';
  document.getElementById('itemTitle').value    = item?.title ?? '';
  document.getElementById('itemDesc').value     = item?.description ?? '';
  document.getElementById('itemStatus').value   = item?.status ?? 'pending';
  document.getElementById('itemStart').value    = item?.start_date ?? '';
  document.getElementById('itemEstEnd').value   = item?.estimated_end_date ?? '';
  populateSystemDropdown(document.getElementById('itemSystem'), item?.system_id ?? null);

  // Item type — handle "Others: ..." case
  const savedType = item?.dev_item_type ?? '';
  const knownTypes = ['New Feature','Improvement','Bug Fix','Admin Task','Discussion','Maintenance','Others'];
  const typeSelect = document.getElementById('itemType');
  const othersGroup = document.getElementById('itemTypeOthersGroup');
  const othersInput = document.getElementById('itemTypeOthers');
  if (savedType.startsWith('Others: ')) {
    typeSelect.value   = 'Others';
    othersInput.value  = savedType.slice('Others: '.length);
    othersGroup.style.display = '';
  } else {
    typeSelect.value   = knownTypes.includes(savedType) ? savedType : '';
    othersInput.value  = '';
    othersGroup.style.display = 'none';
  }

  const body      = document.getElementById('itemDetailBody');
  const logPane   = document.getElementById('detailLogPane');
  const deleteBtn = document.getElementById('detailDeleteBtn');

  if (item) {
    body.classList.remove('detail-new');
    logPane.style.display   = '';
    deleteBtn.style.display = '';
    refreshLogs();
  } else {
    body.classList.add('detail-new');
    logPane.style.display   = 'none';
    deleteBtn.style.display = 'none';
  }

  resetItemForm();
  document.getElementById('itemDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('itemTitle').focus(), 60);
}

function closeDetailModal() {
  document.getElementById('itemDetailModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingId = null;
}

function overlayCloseDetail(e) {
  if (e.target === document.getElementById('itemDetailModal')) closeDetailModal();
}

/* ── Mark-Done remarks modal ── */
function openDoneRemarksModal(onConfirm) {
  _doneRemarksCallback = onConfirm;
  document.getElementById('doneRemarksText').value = '';
  document.getElementById('doneRemarksModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('doneRemarksText').focus(), 60);
}

function closeDoneRemarksModal() {
  document.getElementById('doneRemarksModal').classList.remove('open');
  const detailOpen = document.getElementById('itemDetailModal').classList.contains('open');
  if (!detailOpen) document.body.style.overflow = '';
  _doneRemarksCallback = null;
}

function overlayCloseDoneRemarks(e) {
  if (e.target === document.getElementById('doneRemarksModal')) closeDoneRemarksModal();
}

function confirmMarkDone() {
  const remarks = document.getElementById('doneRemarksText').value.trim();
  const cb = _doneRemarksCallback;
  closeDoneRemarksModal();
  if (cb) cb(remarks);
}

async function deleteItemFromDetail() {
  if (!_editingId) return;
  const id = _editingId;
  closeDetailModal();
  await deleteItem(id);
}

function resetItemForm() {
  document.getElementById('itemFormActions').style.display = '';
  document.getElementById('itemFormLoading').style.display = 'none';
  document.getElementById('itemFormError').style.display   = 'none';
  document.getElementById('itemSubmitBtn').disabled        = false;
}

async function saveItem(e) {
  e.preventDefault();
  const title = document.getElementById('itemTitle').value.trim();
  if (!title) {
    document.getElementById('itemFormError').style.display = '';
    document.getElementById('itemErrorMsg').textContent    = 'Title is required.';
    return;
  }

  const newStatus = document.getElementById('itemStatus').value;
  const prevItem  = _editingId ? _items.find(i => i.id === _editingId) : null;

  if (newStatus === 'done' && prevItem?.status !== 'done') {
    openDoneRemarksModal(remarks => _execSaveItem(remarks));
    return;
  }
  await _execSaveItem(null);
}

async function _execSaveItem(remarks) {
  const title = document.getElementById('itemTitle').value.trim();
  if (!title) return;

  const newStatus = document.getElementById('itemStatus').value;
  const prevItem  = _editingId ? _items.find(i => i.id === _editingId) : null;

  let actual_end_date = prevItem?.actual_end_date ?? null;
  if (newStatus === 'done' && !actual_end_date) {
    actual_end_date = new Date().toISOString().slice(0, 10);
  } else if (newStatus !== 'done') {
    actual_end_date = null;
  }

  const typeVal    = document.getElementById('itemType').value;
  const othersText = document.getElementById('itemTypeOthers').value.trim();
  const devItemType = typeVal === 'Others'
    ? (othersText ? `Others: ${othersText}` : 'Others')
    : (typeVal || null);

  const payload = {
    title,
    description:        document.getElementById('itemDesc').value.trim() || null,
    status:             newStatus,
    system_id:          document.getElementById('itemSystem').value || null,
    start_date:         document.getElementById('itemStart').value || null,
    estimated_end_date: document.getElementById('itemEstEnd').value || null,
    actual_end_date,
    dev_item_type:      devItemType,
  };
  if (remarks) payload.remarks = remarks;

  document.getElementById('itemFormActions').style.display = 'none';
  document.getElementById('itemFormLoading').style.display = '';

  try {
    let res;
    if (_editingId) {
      res = await fetch(`/api/dev/items/${encodeURIComponent(_editingId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/dev/items', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    if (_editingId) {
      const idx = _items.findIndex(i => i.id === _editingId);
      if (idx !== -1) _items[idx] = saved;
    } else {
      _items.push(saved);
    }
    renderBoard();
    closeDetailModal();
    showToast(`Item ${_editingId ? 'updated' : 'created'}.`);
  } catch (err) {
    document.getElementById('itemFormLoading').style.display = 'none';
    document.getElementById('itemFormActions').style.display = '';
    document.getElementById('itemFormError').style.display   = '';
    document.getElementById('itemErrorMsg').textContent      = err.message;
  }
}

/* ── Activity log (inside detail pane) ── */
function fmtHours(h) {
  if (h == null) return '';
  const n = parseFloat(h);
  if (!n) return '';
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(2).replace(/\.?0+$/, '')}h`;
}

async function refreshLogs() {
  if (!_editingId) return;
  const list    = document.getElementById('logList');
  const totalEl = document.getElementById('logTotalHours');
  list.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const [actRes, mvRes] = await Promise.all([
      fetch(`/api/dev/items/${encodeURIComponent(_editingId)}/logs`,     { headers: authHeaders() }),
      fetch(`/api/dev/items/${encodeURIComponent(_editingId)}/movement`, { headers: authHeaders() }),
    ]);
    const logs  = actRes.ok ? await actRes.json() : [];
    const moves = mvRes.ok  ? await mvRes.json()  : [];

    const total = logs.reduce((sum, l) => sum + (parseFloat(l.hours_spent) || 0), 0);
    if (total > 0) {
      const display = total % 1 === 0 ? `${total}` : total.toFixed(2).replace(/\.?0+$/, '');
      totalEl.textContent = `${display} hrs total`;
      totalEl.style.display = '';
    } else {
      totalEl.style.display = 'none';
    }

    const all = [
      ...logs.map(l => ({ ...l, _type: 'activity' })),
      ...moves.map(m => ({ ...m, _type: 'movement' })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (all.length === 0) {
      list.innerHTML = '<div class="activity-log-empty">No activity yet. Be the first to log something.</div>';
      return;
    }

    list.innerHTML = all.map(entry => {
      if (entry._type === 'movement') {
        const label = entry.from_status
          ? `${entry.from_status} → ${entry.to_status}`
          : `Created (${entry.to_status})`;
        return `<div class="activity-log-entry" style="opacity:0.72;">
          <div class="log-meta">
            <span class="log-author">${escHtml(entry.username)}</span>
            <span class="log-time">${fmtDateTime(entry.created_at)}</span>
          </div>
          <div class="log-message" style="display:flex;align-items:center;gap:5px;font-style:italic;color:var(--text-muted);">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            ${escHtml(label)}
          </div>
        </div>`;
      }
      const hrs = fmtHours(entry.hours_spent);
      return `<div class="activity-log-entry">
        <div class="log-meta">
          <span class="log-author">${escHtml(entry.username)}</span>
          ${hrs ? `<span class="log-hours-badge">${escHtml(hrs)}</span>` : ''}
          <span class="log-time">${fmtDateTime(entry.created_at)}</span>
        </div>
        <div class="log-message">${escHtml(entry.message)}</div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    list.innerHTML = `<div class="admin-error">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

/* ── Archive modal ── */
function openArchiveModal() {
  document.getElementById('archiveModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadArchive();
}

function closeArchiveModal() {
  document.getElementById('archiveModal').classList.remove('open');
  const anyOpen = document.querySelector('.modal-overlay.open:not(#archiveModal)');
  if (!anyOpen) document.body.style.overflow = '';
}

function overlayCloseArchive(e) {
  if (e.target === document.getElementById('archiveModal')) closeArchiveModal();
}

function renderArchiveRow(item) {
  const sysLabel = systemName(item.system_id);
  const id       = escHtml(item.id);
  return `<div onclick="openDetailModal('${id}')"
    style="cursor:pointer;padding:14px 16px;border-bottom:1px solid var(--border);display:flex;gap:14px;align-items:flex-start;transition:background 0.12s;"
    onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">
    <div style="flex:1;min-width:0;">
      ${item.dev_item_code ? `<div class="kcard-code" style="margin-bottom:4px;">${escHtml(item.dev_item_code)}</div>` : ''}
      <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-bottom:5px;">${escHtml(item.title)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${sysLabel           ? `<span class="kcard-system-tag">${escHtml(sysLabel)}</span>` : ''}
        ${item.dev_item_type ? typeBadge(item.dev_item_type) : ''}
        ${item.created_by    ? `<span style="font-size:11px;color:var(--text-muted);">${authorBubble(item.created_by)}</span>` : ''}
      </div>
    </div>
    <div style="flex-shrink:0;text-align:right;font-size:11px;color:var(--text-muted);">
      <div style="font-weight:600;color:#22c55e;margin-bottom:2px;">Done</div>
      ${item.actual_end_date ? `<div>${fmtDate(item.actual_end_date)}</div>` : ''}
    </div>
  </div>`;
}

async function loadArchive() {
  const listEl = document.getElementById('archiveList');
  const metaEl = document.getElementById('archiveModalMeta');
  listEl.innerHTML = '<div class="admin-loading" style="padding:24px;"><div class="spinner"></div><span>Loading…</span></div>';
  metaEl.textContent = `Done items completed more than ${_doneWeeks} week(s) ago`;
  try {
    const res = await fetch(`/api/dev/items/archive?weeks=${_doneWeeks}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const items = await res.json();

    // Ensure archived items are accessible in _items for the detail modal
    items.forEach(item => {
      if (!_items.find(i => i.id === item.id)) _items.push(item);
    });

    if (items.length === 0) {
      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:14px;">No archived items found.</div>';
      return;
    }
    listEl.innerHTML = items.map(item => renderArchiveRow(item)).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="admin-error" style="margin:12px;">${escHtml(err.message)}</div>`;
  }
}

/* ── Add System modal ── */
function openAddSystemModal() {
  document.getElementById('addSystemForm').reset();
  document.getElementById('newSysIsVisible').checked = true;
  document.getElementById('addSysFormActions').style.display = '';
  document.getElementById('addSysFormLoading').style.display = 'none';
  document.getElementById('addSysFormError').style.display   = 'none';
  document.getElementById('addSystemModal').classList.add('open');
}

function closeAddSystemModal() {
  document.getElementById('addSystemModal').classList.remove('open');
}

function overlayCloseAddSystem(e) {
  if (e.target === document.getElementById('addSystemModal')) closeAddSystemModal();
}

async function saveNewSystem(e) {
  e.preventDefault();
  const id           = document.getElementById('newSysId').value.trim();
  const name         = document.getElementById('newSysName').value.trim();
  const category     = document.getElementById('newSysCategory').value;
  const primaryUrl   = document.getElementById('newSysPrimaryUrl').value.trim();
  const primaryLabel = document.getElementById('newSysPrimaryLabel').value.trim();
  const backupUrl    = document.getElementById('newSysBackupUrl').value.trim() || null;
  const backupLabel  = document.getElementById('newSysBackupLabel').value.trim() || null;
  const sortOrder    = parseInt(document.getElementById('newSysSortOrder').value, 10) || 0;
  const isVisible    = document.getElementById('newSysIsVisible').checked;

  if (!id || !name || !primaryUrl || !primaryLabel) {
    document.getElementById('addSysFormError').style.display = '';
    document.getElementById('addSysErrorMsg').textContent    = 'ID, Name, Primary URL, and Button Label are required.';
    return;
  }

  document.getElementById('addSysFormActions').style.display = 'none';
  document.getElementById('addSysFormLoading').style.display = '';

  try {
    const res = await fetch('/api/dev/systems', {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, name, category, primary_url: primaryUrl, primary_label: primaryLabel, backup_url: backupUrl, backup_label: backupLabel, sort_order: sortOrder, is_visible: isVisible }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    _systems.push(saved);
    _systems.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    populateSystemDropdown(document.getElementById('itemSystem'), saved.id);
    closeAddSystemModal();
    showToast(`System "${name}" added.`);
  } catch (err) {
    document.getElementById('addSysFormLoading').style.display = 'none';
    document.getElementById('addSysFormActions').style.display = '';
    document.getElementById('addSysFormError').style.display   = '';
    document.getElementById('addSysErrorMsg').textContent      = err.message;
  }
}

async function addLog() {
  if (!_editingId) return;
  const message = document.getElementById('logMessage').value.trim();
  document.getElementById('logAddError').style.display = 'none';
  if (!message) {
    document.getElementById('logAddError').style.display  = '';
    document.getElementById('logAddErrorMsg').textContent = 'Message cannot be empty.';
    return;
  }
  const rawHours = document.getElementById('logHours').value.trim();
  const hours_spent = rawHours !== '' && parseFloat(rawHours) >= 0 ? parseFloat(rawHours) : null;
  try {
    const res = await fetch(`/api/dev/items/${encodeURIComponent(_editingId)}/logs`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, hours_spent }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    document.getElementById('logMessage').value = '';
    document.getElementById('logHours').value   = '';
    await refreshLogs();
  } catch (err) {
    document.getElementById('logAddError').style.display  = '';
    document.getElementById('logAddErrorMsg').textContent = err.message;
  }
}
