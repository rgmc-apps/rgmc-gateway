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
let _items       = [];
let _systems     = [];
let _members     = {};   // username → { displayName, avatarUrl }
let _editingId   = null;
let _loggingId   = null;

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
    const av          = session.avatarUrl && session.avatarUrl.startsWith('data:image/') ? session.avatarUrl : '';

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
    ];
    if (session.isAdmin) {
      navItems.push(`
        <a href="/admin" class="profile-menu-item">
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

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeItemModal(); closeLogModal(); closeAddSystemModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', () => closeProfileMenu());
});

/* ── Members (avatars for cards) ── */
async function loadMembers() {
  try {
    const res = await fetch('/api/dev/members', { headers: authHeaders() });
    const data = await res.json();
    _members = {};
    (Array.isArray(data) ? data : []).forEach(m => {
      _members[m.username] = {
        displayName: m.display_name || m.first_name || m.username,
        avatarUrl:   m.avatar_url && m.avatar_url.startsWith('data:image/') ? m.avatar_url : '',
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

/* ── Load & render board ── */
async function loadItems() {
  const board = document.getElementById('kanbanBoard');
  board.classList.add('loading');

  try {
    const res = await fetch('/api/dev/items', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _items = await res.json();
    renderBoard();
  } catch (err) {
    ['pending','coding','testing','done'].forEach(s => {
      document.getElementById(`cards-${s}`).innerHTML =
        `<div class="admin-error" style="margin:8px;">Failed to load: ${escHtml(err.message)}</div>`;
    });
  } finally {
    board.classList.remove('loading');
  }
}

const STATUSES = ['pending', 'coding', 'testing', 'done'];

function renderBoard() {
  const counts = {};
  STATUSES.forEach(status => {
    const col   = document.getElementById(`cards-${status}`);
    const items = _items.filter(i => i.status === status);
    const count = items.length;
    counts[status] = count;

    const countEl  = document.getElementById(`count-${status}`);
    const prevCol  = parseInt(countEl.textContent, 10);
    rollNumber(countEl, isNaN(prevCol) ? 0 : prevCol, count);

    const statEl   = document.getElementById(`stat-count-${status}`);
    if (statEl) {
      const prevStat = parseInt(statEl.textContent, 10);
      rollNumber(statEl, isNaN(prevStat) ? 0 : prevStat, count);
    }

    col.innerHTML = count
      ? items.map((item, idx) => renderCard(item, idx)).join('')
      : `<div class="kanban-empty">
           <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
           No items
         </div>`;
  });
  updateColArcs(counts);
}

function renderCard(item, idx = 0) {
  const elapsed    = daysElapsed(item);
  const overdue    = item.estimated_end_date && !item.actual_end_date &&
                     new Date(item.estimated_end_date + 'T00:00:00') < new Date();
  const statusIdx  = STATUSES.indexOf(item.status);

  const sysLabel = systemName(item.system_id);
  return `<div class="kanban-card" id="card-${escHtml(item.id)}"
               style="animation-delay:${idx * 55}ms">
    ${sysLabel ? `<div class="kcard-system-tag">${escHtml(sysLabel)}</div>` : ''}
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
        <button class="kcard-btn" onclick="openItemModal('${escHtml(item.id)}')" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="kcard-btn kcard-btn-log" onclick="openLogModal('${escHtml(item.id)}')" title="Activity log">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="kcard-btn kcard-btn-del" onclick="deleteItem('${escHtml(item.id)}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
  const patch = { status: newStatus };
  if (newStatus === 'done' && !item.actual_end_date) {
    patch.actual_end_date = new Date().toISOString().slice(0, 10);
  }
  if (newStatus !== 'done') {
    patch.actual_end_date = null;
  }
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

/* ── Item modal (add / edit) ── */
function openItemModal(idOrNull) {
  const item = idOrNull ? _items.find(i => i.id === idOrNull) : null;
  _editingId = item?.id ?? null;

  document.getElementById('itemModalTitle').textContent = item ? 'Edit Item' : 'New Item';
  document.getElementById('itemModalSub').textContent   = item
    ? `Created by ${item.created_by}`
    : 'Fill in the details below';
  document.getElementById('itemEditId').value      = item?.id ?? '';
  document.getElementById('itemTitle').value       = item?.title ?? '';
  document.getElementById('itemDesc').value        = item?.description ?? '';
  document.getElementById('itemStatus').value      = item?.status ?? 'pending';
  document.getElementById('itemStart').value       = item?.start_date ?? '';
  document.getElementById('itemEstEnd').value      = item?.estimated_end_date ?? '';
  document.getElementById('itemActualEnd').value   = item?.actual_end_date ?? '';
  populateSystemDropdown(document.getElementById('itemSystem'), item?.system_id ?? null);

  resetItemForm();
  document.getElementById('itemModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('itemTitle').focus(), 60);
}

function closeItemModal() {
  document.getElementById('itemModal').classList.remove('open');
  document.body.style.overflow = '';
  _editingId = null;
}

function overlayCloseItem(e) {
  if (e.target === document.getElementById('itemModal')) closeItemModal();
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

  const payload = {
    title,
    description:        document.getElementById('itemDesc').value.trim() || null,
    status:             document.getElementById('itemStatus').value,
    system_id:          document.getElementById('itemSystem').value || null,
    start_date:         document.getElementById('itemStart').value || null,
    estimated_end_date: document.getElementById('itemEstEnd').value || null,
    actual_end_date:    document.getElementById('itemActualEnd').value || null,
  };

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
    closeItemModal();
    showToast(`Item ${_editingId ? 'updated' : 'created'}.`);
  } catch (err) {
    document.getElementById('itemFormLoading').style.display = 'none';
    document.getElementById('itemFormActions').style.display = '';
    document.getElementById('itemFormError').style.display   = '';
    document.getElementById('itemErrorMsg').textContent      = err.message;
  }
}

/* ── Activity log modal ── */
async function openLogModal(id) {
  const item = _items.find(i => i.id === id);
  _loggingId = id;
  document.getElementById('logModalTitle').textContent = item?.title ?? id;
  document.getElementById('logMessage').value          = '';
  document.getElementById('logAddError').style.display = 'none';
  document.getElementById('logModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  await refreshLogs();
  setTimeout(() => document.getElementById('logMessage').focus(), 80);
}

function closeLogModal() {
  document.getElementById('logModal').classList.remove('open');
  document.body.style.overflow = '';
  _loggingId = null;
}

function overlayCloseLog(e) {
  if (e.target === document.getElementById('logModal')) closeLogModal();
}

async function refreshLogs() {
  const list = document.getElementById('logList');
  list.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/dev/items/${encodeURIComponent(_loggingId)}/logs`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const logs = await res.json();
    if (logs.length === 0) {
      list.innerHTML = '<div class="activity-log-empty">No activity yet. Be the first to log something.</div>';
      return;
    }
    list.innerHTML = logs.map(log => `
      <div class="activity-log-entry">
        <div class="log-meta">
          <span class="log-author">${escHtml(log.username)}</span>
          <span class="log-time">${fmtDateTime(log.created_at)}</span>
        </div>
        <div class="log-message">${escHtml(log.message)}</div>
      </div>`).join('');
    list.scrollTop = list.scrollHeight;
  } catch (err) {
    list.innerHTML = `<div class="admin-error">Failed to load: ${escHtml(err.message)}</div>`;
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
  const message = document.getElementById('logMessage').value.trim();
  document.getElementById('logAddError').style.display = 'none';
  if (!message) {
    document.getElementById('logAddError').style.display    = '';
    document.getElementById('logAddErrorMsg').textContent   = 'Message cannot be empty.';
    return;
  }
  try {
    const res = await fetch(`/api/dev/items/${encodeURIComponent(_loggingId)}/logs`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    document.getElementById('logMessage').value = '';
    await refreshLogs();
  } catch (err) {
    document.getElementById('logAddError').style.display  = '';
    document.getElementById('logAddErrorMsg').textContent = err.message;
  }
}
