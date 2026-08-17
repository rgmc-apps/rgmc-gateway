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
function _descPreview(raw, max = 110) {
  if (!raw) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  const text = (tmp.innerText || tmp.textContent || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? text.slice(0, max) + '…' : text;
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

// Actual SP = elapsed days for completed items (start_date → actual_end_date). 1 day = 1 SP.
function actualSP(item) {
  if (item.status !== 'done' || !item.start_date || !item.actual_end_date) return null;
  return daysElapsed(item);
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
let _devActionsCache     = null;
let _devResPendingFiles  = [];
let _viewMode            = 'kanban'; // 'kanban' | 'list' | 'analytics' | 'epics'
let _listSort            = { col: 'status', dir: 'asc' };
let _listFiltersPopulated = false;
let _epics               = [];
let _itemTypes           = [];
let _editingEpicId       = null;
let _addItemToEpicId     = null;
let _epicPageId          = null;
let _epicPageItems       = [];
let _epicDescEditor      = null;
let _selectedIds         = new Set();
let _lasso               = null;  // active rubber-band drag state
let _lassoDragged        = false; // suppresses the click after a lasso drag

const DONE_WEEKS_KEY = 'dev-done-weeks';

/* ══════════════════════════════════════════════════════════════════════════════
   Multi-select — selection state, lasso, bulk actions
   ══════════════════════════════════════════════════════════════════════════════ */

function toggleSelectItem(id, checked) {
  if (checked) _selectedIds.add(id);
  else _selectedIds.delete(id);
  _syncSelectionUI();
}

function selectAllInTable(tbodyId, checked) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.querySelectorAll('[data-item-id]').forEach(row => {
    if (checked) _selectedIds.add(row.dataset.itemId);
    else _selectedIds.delete(row.dataset.itemId);
  });
  _syncSelectionUI();
}

function clearBulkSelection() {
  _selectedIds.clear();
  _syncSelectionUI();
  const tp = document.getElementById('bulkTypePopover');
  const sp = document.getElementById('bulkStatusPopover');
  if (tp) tp.style.display = 'none';
  if (sp) sp.style.display = 'none';
  closeBulkEditPanel();
}

function _syncSelectionUI() {
  document.querySelectorAll('[data-item-id]').forEach(el => {
    const sel = _selectedIds.has(el.dataset.itemId);
    el.classList.toggle('dlt-selected', sel);
    const cb = el.querySelector('.dlt-cb');
    if (cb) cb.checked = sel;
  });

  // Update select-all header checkboxes
  ['devListBody', 'parkedListBody', 'epicPageItemsBody'].forEach(id => {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    const rows = tbody.querySelectorAll('[data-item-id]');
    if (!rows.length) return;
    const allSel = [...rows].every(r => _selectedIds.has(r.dataset.itemId));
    const anySel = [...rows].some(r => _selectedIds.has(r.dataset.itemId));
    const cb = tbody.closest('table')?.querySelector('.dlt-cb-all');
    if (cb) { cb.checked = allSel; cb.indeterminate = !allSel && anySel; }
  });

  const bar = document.getElementById('bulkActionBar');
  const n   = _selectedIds.size;
  const el  = document.getElementById('bulkCount');
  if (el)  el.textContent  = n;
  if (bar) bar.style.display = n > 0 ? '' : 'none';
  if (!n) {
    const tp = document.getElementById('bulkTypePopover');
    const sp = document.getElementById('bulkStatusPopover');
    if (tp) tp.style.display = 'none';
    if (sp) sp.style.display = 'none';
  }
}

/* ── Lasso rubber-band selection ── */

function _initLasso() {
  document.addEventListener('mousedown', _lassoStart);
  document.addEventListener('mousemove', _lassoMove);
  document.addEventListener('mouseup',   _lassoEnd);
}

function _lassoStart(e) {
  if (e.button !== 0) return;
  if (e.target.closest('button, a, input, select, label, .dlt-cb-cell, .epic-item-cb-wrap')) return;
  const zone = e.target.closest('.dev-list-table-wrap, .epic-items-list');
  if (!zone) return;
  _lasso = { zone, startX: e.clientX, startY: e.clientY, active: false, el: null };
}

function _lassoMove(e) {
  if (!_lasso) return;
  const dx = e.clientX - _lasso.startX;
  const dy = e.clientY - _lasso.startY;
  if (!_lasso.active && Math.hypot(dx, dy) > 5) {
    _lasso.active = true;
    const el = document.createElement('div');
    el.className = 'lasso-rect';
    document.body.appendChild(el);
    _lasso.el = el;
    document.body.style.userSelect = 'none';
  }
  if (!_lasso.active) return;
  e.preventDefault();
  const x = Math.min(e.clientX, _lasso.startX);
  const y = Math.min(e.clientY, _lasso.startY);
  const w = Math.abs(dx);
  const h = Math.abs(dy);
  Object.assign(_lasso.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  const r = { left: x, right: x + w, top: y, bottom: y + h };
  document.querySelectorAll('[data-item-id]').forEach(row => {
    const b = row.getBoundingClientRect();
    const hit = b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
    row.classList.toggle('dlt-lasso-hover', hit);
  });
}

function _lassoEnd(e) {
  if (!_lasso) return;
  if (_lasso.active) {
    document.querySelectorAll('.dlt-lasso-hover').forEach(row => {
      _selectedIds.add(row.dataset.itemId);
      row.classList.remove('dlt-lasso-hover');
    });
    _syncSelectionUI();
    if (_lasso.el) _lasso.el.remove();
    document.body.style.userSelect = '';
    _lassoDragged = true;
    setTimeout(() => { _lassoDragged = false; }, 150);
  }
  _lasso = null;
}

/* ── Bulk operations ── */

async function bulkParkToggle() {
  const ids = [..._selectedIds];
  if (!ids.length) return;
  const items     = ids.map(id => _items.find(i => i.id === id)).filter(Boolean);
  const anyActive = items.some(i => !i.is_parked);
  const newVal    = anyActive;
  try {
    await Promise.all(ids.map(id =>
      fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_parked: newVal }),
      })
    ));
    ids.forEach(id => {
      const it = _items.find(i => i.id === id);
      if (it) it.is_parked = newVal;
    });
    clearBulkSelection();
    renderBoard();
    showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} ${newVal ? 'parked' : 'unparked'}.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

function bulkDuplicateAs(e) {
  e.stopPropagation();
  const tp = document.getElementById('bulkTypePopover');
  const sp = document.getElementById('bulkStatusPopover');
  sp.style.display = 'none';
  if (tp.style.display !== 'none') { tp.style.display = 'none'; return; }
  tp.innerHTML = _itemTypes.length
    ? _itemTypes.map(t => `<button class="bulk-pop-btn" onclick="bulkApplyDuplicateAs(event,'${escHtml(t.name)}')">${typeBadge(t.name)}</button>`).join('')
    : '<div style="padding:8px 10px;color:var(--text-muted);font-size:12px;">No item types configured.</div>';
  tp.style.display = '';
}

async function bulkApplyDuplicateAs(e, typeName) {
  e.stopPropagation();
  document.getElementById('bulkTypePopover').style.display = 'none';
  const ids   = [..._selectedIds];
  const srcs  = ids.map(id => _items.find(i => i.id === id)).filter(Boolean);
  try {
    const created = await Promise.all(srcs.map(item =>
      fetch('/api/dev/items', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:              item.title,
          description:        item.description,
          status:             'pending',
          system_ids:         item.system_ids,
          start_date:         item.start_date,
          estimated_end_date: item.estimated_end_date,
          story_points:       item.story_points,
          actual_end_date:    null,
          dev_item_type:      typeName,
          epic_id:            item.epic_id,
          is_parked:          false,
          assigned_to:        item.assigned_to,
        }),
      }).then(r => r.json())
    ));
    created.forEach(it => { if (it?.id) _items.push(it); });
    clearBulkSelection();
    renderBoard();
    showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} duplicated as ${typeName}.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

function bulkUpdateStatus(e) {
  e.stopPropagation();
  const sp = document.getElementById('bulkStatusPopover');
  const tp = document.getElementById('bulkTypePopover');
  tp.style.display = 'none';
  if (sp.style.display !== 'none') { sp.style.display = 'none'; return; }
  const statuses = [
    { val: 'pending',  cls: 'dp-s-pending'  },
    { val: 'ongoing',  cls: 'dp-s-ongoing'  },
    { val: 'coding',   cls: 'dp-s-coding'   },
    { val: 'testing',  cls: 'dp-s-testing'  },
    { val: 'done',     cls: 'dp-s-done'     },
  ];
  sp.innerHTML = statuses.map(s =>
    `<button class="bulk-pop-btn" onclick="bulkApplyStatus(event,'${s.val}')">
       <span class="dp-item-status ${s.cls}">${s.val}</span>
     </button>`
  ).join('');
  sp.style.display = '';
}

async function bulkApplyStatus(e, status) {
  e.stopPropagation();
  document.getElementById('bulkStatusPopover').style.display = 'none';
  const ids = [..._selectedIds];
  try {
    await Promise.all(ids.map(id => {
      const it      = _items.find(i => i.id === id);
      const payload = { status };
      if (status === 'done' && !it?.actual_end_date) {
        payload.actual_end_date = new Date().toISOString().slice(0, 10);
      } else if (status !== 'done') {
        payload.actual_end_date = null;
      }
      if ((status === 'ongoing' || status === 'coding') && !it?.start_date) {
        payload.start_date = new Date().toISOString().slice(0, 10);
      }
      return fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }));
    ids.forEach(id => {
      const it = _items.find(i => i.id === id);
      if (!it) return;
      it.status = status;
      if (status === 'done' && !it.actual_end_date) it.actual_end_date = new Date().toISOString().slice(0, 10);
      else if (status !== 'done') it.actual_end_date = null;
      if ((status === 'ongoing' || status === 'coding') && !it.start_date) it.start_date = new Date().toISOString().slice(0, 10);
    });
    clearBulkSelection();
    if (!_rm.matches && document.startViewTransition) {
      document.startViewTransition(() => renderBoard());
    } else {
      renderBoard();
    }
    showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} set to ${status}.`);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}
/* ── Bulk edit fields panel ── */

function openBulkEditPanel(e) {
  e.stopPropagation();
  const panel = document.getElementById('bulkEditPanel');
  if (!panel) return;

  // Close other popovers
  document.getElementById('bulkTypePopover').style.display   = 'none';
  document.getElementById('bulkStatusPopover').style.display = 'none';

  // Toggle
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  // Update count
  document.getElementById('bepCount').textContent = _selectedIds.size;

  // Populate assignee dropdown from current members
  const sel = document.getElementById('bepAssignTo');
  sel.innerHTML = '<option value="">— choose —</option>' +
    Object.entries(_members)
      .sort(([, a], [, b]) => (a.displayName || '').localeCompare(b.displayName || ''))
      .map(([u, m]) => `<option value="${escHtml(u)}">${escHtml(m.displayName || u)}</option>`)
      .join('');

  // Reset all fields: uncheck, clear, disable
  panel.querySelectorAll('.bep-cb').forEach(cb => { cb.checked = false; });
  panel.querySelectorAll('.bep-input').forEach(inp => { inp.value = ''; inp.disabled = true; });

  panel.style.display = '';
}

function closeBulkEditPanel() {
  const p = document.getElementById('bulkEditPanel');
  if (p) p.style.display = 'none';
}

function _initBulkEditPanel() {
  const panel = document.getElementById('bulkEditPanel');
  if (!panel) return;

  // Checkbox → enable/disable paired input
  panel.querySelectorAll('.bep-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const inp = panel.querySelector(`.bep-input[data-field="${cb.dataset.field}"]`);
      if (!inp) return;
      inp.disabled = !cb.checked;
      if (cb.checked) inp.focus();
    });
  });

  // Typing in an input auto-checks its checkbox
  panel.querySelectorAll('.bep-input').forEach(inp => {
    inp.addEventListener('input', () => {
      if (!inp.value) return;
      const cb = panel.querySelector(`.bep-cb[data-field="${inp.dataset.field}"]`);
      if (cb && !cb.checked) { cb.checked = true; inp.disabled = false; }
    });
    // For select elements use 'change' instead
    inp.addEventListener('change', () => {
      if (inp.tagName !== 'SELECT') return;
      const cb = panel.querySelector(`.bep-cb[data-field="${inp.dataset.field}"]`);
      if (cb && !cb.checked) { cb.checked = true; inp.disabled = false; }
    });
  });
}

async function bulkApplyEdit() {
  const panel = document.getElementById('bulkEditPanel');
  if (!panel) return;

  // Collect only checked + filled fields
  const patch = {};
  panel.querySelectorAll('.bep-cb:checked').forEach(cb => {
    const field = cb.dataset.field;
    const inp   = panel.querySelector(`.bep-input[data-field="${field}"]`);
    if (!inp) return;
    const raw = inp.value.trim();
    if (field === 'story_points') {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) patch[field] = v;
    } else if (field === 'assigned_to') {
      patch[field] = raw || null;
    } else {
      patch[field] = raw || null;
    }
  });

  if (!Object.keys(patch).length) {
    showToast('Check at least one field and fill in a value.');
    return;
  }

  const ids    = [..._selectedIds];
  const applyBtn = panel.querySelector('.bep-btn-apply');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying…'; }

  try {
    await Promise.all(ids.map(id =>
      fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
    ));
    // Update local cache
    ids.forEach(id => {
      const it = _items.find(i => i.id === id);
      if (it) Object.assign(it, patch);
    });
    closeBulkEditPanel();
    clearBulkSelection();
    renderBoard();
    const fieldLabels = { story_points: 'story points', start_date: 'start date', estimated_end_date: 'est. end date', assigned_to: 'assignee' };
    const names = Object.keys(patch).map(f => fieldLabels[f] || f);
    showToast(`${ids.length} item${ids.length !== 1 ? 's' : ''} updated (${names.join(', ')}).`);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
  }
}

let _doneWeeks = Math.max(1, parseInt(localStorage.getItem(DONE_WEEKS_KEY) || '2', 10));

function setDoneWeeks(val) {
  const n = Math.max(1, Math.min(52, parseInt(val, 10) || 2));
  _doneWeeks = n;
  localStorage.setItem(DONE_WEEKS_KEY, String(n));
  const inp = document.getElementById('doneWeeksInput');
  if (inp) inp.value = n;
  _flipBoard();
}

function setFilter(f) {
  _filter = f;
  document.querySelectorAll('.dev-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  _flipBoard();
}

/* ── View mode ── */
function setViewMode(mode) {
  _viewMode = mode;
  document.querySelectorAll('.dev-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === mode);
  });
  document.getElementById('devKanbanView').style.display    = mode === 'kanban'    ? '' : 'none';
  document.getElementById('devListView').style.display      = mode === 'list'      ? '' : 'none';
  document.getElementById('devAnalyticsView').style.display = mode === 'analytics' ? '' : 'none';
  document.getElementById('devEpicsView').style.display      = mode === 'epics'     ? '' : 'none';
  // Hide epic detail page when navigating away
  if (mode !== 'epics') {
    const epv = document.getElementById('epicPageView');
    if (epv) epv.style.display = 'none';
    _epicPageId    = null;
    _epicPageItems = [];
  }

  if (mode === 'list')      renderListView();
  if (mode === 'analytics') renderAnalytics();
  if (mode === 'epics')     renderEpicsView();

  // Pause canvas animation when kanban is not visible
  Object.values(_ambiences).forEach(a => mode === 'kanban' ? a.resume() : a.pause());
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
/* ── Rich editor instance ─────────────────────────────────── */
let _itemDescEditor = null;

document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || (!session.isDeveloper && !session.isAdmin)) {
    location.href = '/';
    return;
  }

  _itemDescEditor  = initRichEditor('itemDesc');
  _epicDescEditor  = initRichEditor('epicDesc');

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
  initAmbience();
  initPhysicsDrag();
  loadMembers().then(() => loadSystems()).then(() => Promise.all([loadItems(), loadEpics(), loadItemTypes()])).then(() => {
    hidePageLoader();
    const epicParam = new URLSearchParams(window.location.search).get('epic');
    if (epicParam) {
      setViewMode('epics');
      openEpicPage(epicParam, { pushState: false });
    }
  });

  window.addEventListener('popstate', e => {
    const epicId = e.state?.epic || new URLSearchParams(window.location.search).get('epic');
    if (epicId) {
      setViewMode('epics');
      openEpicPage(epicId, { pushState: false });
    } else if (_epicPageId) {
      _epicPageId    = null;
      _epicPageItems = [];
      document.getElementById('epicPageView').style.display = 'none';
      document.getElementById('devEpicsView').style.display = '';
      renderEpicsView();
    }
  });

  const doneWeeksInput = document.getElementById('doneWeeksInput');
  if (doneWeeksInput) doneWeeksInput.value = _doneWeeks;

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const overlay = document.getElementById('cmdPalette');
      if (overlay?.classList.contains('open')) closeCmdPalette();
      else openCmdPalette();
      return;
    }
    if (e.key === 'Escape') {
      if (document.getElementById('cmdPalette')?.classList.contains('open')) { closeCmdPalette(); return; }
      closeDoneRemarksModal(); closeDetailModal(); closeEpicModal(); closeAddSystemModal(); closeArchiveModal(); closeProfileMenu(); closeEpicPage(); closeItemTypesModal();
      const tp = document.getElementById('bulkTypePopover');
      const sp = document.getElementById('bulkStatusPopover');
      const ep = document.getElementById('bulkEditPanel');
      if (tp && tp.style.display !== 'none') { tp.style.display = 'none'; return; }
      if (sp && sp.style.display !== 'none') { sp.style.display = 'none'; return; }
      if (ep && ep.style.display !== 'none') { closeBulkEditPanel(); return; }
      if (_selectedIds.size) clearBulkSelection();
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#sysMultiWrap'))     closeSysDropdown();
    if (!e.target.closest('#epicSysMultiWrap')) closeEpicSysDropdown();
    if (!e.target.closest('.dup-type-wrap')) {
      const m = document.getElementById('dupTypeMenu');
      if (m) m.classList.remove('open');
    }
    closeProfileMenu();
    if (!e.target.closest('#bulkDupBtn'))    { const p = document.getElementById('bulkTypePopover');   if (p) p.style.display = 'none'; }
    if (!e.target.closest('#bulkStatusBtn')) { const p = document.getElementById('bulkStatusPopover'); if (p) p.style.display = 'none'; }
    if (!e.target.closest('#bulkEditBtn') && !e.target.closest('#bulkEditPanel')) closeBulkEditPanel();
  });

  _initLasso();
  _initBulkEditPanel();

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
      _buildSystemChecklist([]);
    }
  } catch { /* non-fatal */ }
}

function _parseSystemIds(item) {
  if (!item) return [];
  if (Array.isArray(item.system_ids) && item.system_ids.length) return item.system_ids.filter(Boolean);
  if (item.system_id) return [item.system_id];
  return [];
}

function _buildSystemChecklist(selectedIds = []) {
  const dropdown = document.getElementById('sysMultiDropdown');
  if (!dropdown) return;
  if (!_systems.length) {
    dropdown.innerHTML = '<div class="sys-multi-empty">No systems available.</div>';
    _updateSysLabel([]);
    return;
  }
  dropdown.innerHTML = _systems.map(s => {
    const checked = selectedIds.includes(s.id);
    return `<label class="sys-multi-item${checked ? ' checked' : ''}">
      <input type="checkbox" value="${escHtml(s.id)}" ${checked ? 'checked' : ''}
             onchange="this.closest('.sys-multi-item').classList.toggle('checked',this.checked);_updateSysLabel()">
      <span>${escHtml(s.name)}</span>
    </label>`;
  }).join('');
  _updateSysLabel(selectedIds);
}

function _getSelectedSystemIds() {
  const dropdown = document.getElementById('sysMultiDropdown');
  if (!dropdown) return [];
  return Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}

function _updateSysLabel(ids) {
  const label = document.getElementById('sysMultiLabel');
  if (!label) return;
  const selected = ids !== undefined ? ids : _getSelectedSystemIds();
  if (!selected.length) {
    label.textContent = '— None —';
    label.classList.add('is-placeholder');
    return;
  }
  const names = selected.map(id => {
    const s = _systems.find(s => s.id === id);
    return s ? s.name : id;
  });
  label.textContent = names.join(', ');
  label.classList.remove('is-placeholder');
}

function toggleSysDropdown() {
  const dropdown = document.getElementById('sysMultiDropdown');
  const wrap     = document.getElementById('sysMultiWrap');
  if (!dropdown) return;
  const opening = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', opening);
  wrap?.classList.toggle('is-open', opening);
}

function closeSysDropdown() {
  document.getElementById('sysMultiDropdown')?.classList.remove('open');
  document.getElementById('sysMultiWrap')?.classList.remove('is-open');
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
      return `<div class="kanban-skel" style="animation-delay:${delay}ms;border-top-color:${clr}">
        ${hasTag ? '<div class="skel-bar skel-tag"></div>' : ''}
        <div class="skel-bar skel-title" style="--sw:${w1}"></div>
        ${w2 ? `<div class="skel-bar skel-title" style="--sw:${w2}"></div>` : ''}
        <div class="skel-footer">
          <div class="skel-date"></div>
          <div class="skel-avatar-dot"></div>
        </div>
      </div>`;
    }).join('');
    if (_ambiences[status]) col.prepend(_ambiences[status].canvas);
  });
}

/* ── Load & render board ── */
async function loadItems() {
  const board  = document.getElementById('kanbanBoard');
  const loader = document.getElementById('boardLoader');
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
    board.classList.add('board-revealed');
    if (loader) {
      loader.classList.add('board-loader--done');
      loader.addEventListener('transitionend', () => loader.remove(), { once: true });
    }
  }
}

const STATUSES = ['pending', 'ongoing', 'coding', 'testing', 'done'];

/* ══════════════════════════════════════════════════════════════════════════════
   Command Palette — ⌘K / Ctrl+K
   ══════════════════════════════════════════════════════════════════════════════ */

let _cmdCursor = -1;

const _CMD_ICONS = {
  kanban:    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`,
  list:      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  analytics: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  epics:     `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  add:       `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  filter:    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  user:      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  portal:    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  signout:   `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
};

const CMD_ACTIONS = [
  { id: 'view-kanban',    section: 'Views',    label: 'Kanban Board',   desc: 'Switch to kanban view',         icon: 'kanban',    action: () => setViewMode('kanban') },
  { id: 'view-list',      section: 'Views',    label: 'Dev Items List', desc: 'Switch to list view',           icon: 'list',      action: () => setViewMode('list') },
  { id: 'view-analytics', section: 'Views',    label: 'Analytics',      desc: 'Switch to analytics view',      icon: 'analytics', action: () => setViewMode('analytics') },
  { id: 'view-epics',     section: 'Views',    label: 'Epics',          desc: 'Switch to epics view',          icon: 'epics',     action: () => setViewMode('epics') },
  { id: 'create-item',    section: 'Actions',  label: 'New Dev Item',   desc: 'Create a new dev item',         icon: 'add',       action: () => openDetailModal(null) },
  { id: 'filter-all',     section: 'Filters',  label: 'All Items',      desc: 'Show all dev items',            icon: 'filter',    action: () => setFilter('all') },
  { id: 'filter-mine',    section: 'Filters',  label: 'My Issues',      desc: 'Show only items assigned to you', icon: 'user',   action: () => setFilter('mine') },
  { id: 'nav-portal',     section: 'Navigate', label: 'Portal',         desc: 'Go back to main portal',        icon: 'portal',    action: () => { location.href = '/'; } },
  { id: 'nav-profile',    section: 'Navigate', label: 'My Profile',     desc: 'View and edit your profile',    icon: 'user',      action: () => { location.href = '/profile'; } },
  { id: 'nav-signout',    section: 'Navigate', label: 'Sign Out',       desc: 'Sign out of your account',      icon: 'signout',   action: () => devSignOut() },
];

function openCmdPalette() {
  const overlay = document.getElementById('cmdPalette');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  _cmdCursor = -1;
  const input = document.getElementById('cmdInput');
  if (input) { input.value = ''; input.focus(); }
  _cmdRender();
}

function closeCmdPalette() {
  const overlay = document.getElementById('cmdPalette');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function overlayCloseCmd(e) {
  if (e.target === document.getElementById('cmdPalette')) closeCmdPalette();
}

function _cmdFilteredActions() {
  const q = (document.getElementById('cmdInput')?.value || '').toLowerCase().trim();
  if (!q) return CMD_ACTIONS;
  return CMD_ACTIONS.filter(a =>
    a.label.toLowerCase().includes(q) ||
    a.desc.toLowerCase().includes(q) ||
    a.section.toLowerCase().includes(q) ||
    a.id.toLowerCase().includes(q)
  );
}

function _cmdRender() {
  const results  = document.getElementById('cmdResults');
  if (!results) return;
  const filtered = _cmdFilteredActions();
  const q        = (document.getElementById('cmdInput')?.value || '').trim();

  if (!filtered.length) {
    results.innerHTML = `<div class="cmd-empty">No commands matching "<strong>${escHtml(q)}</strong>"</div>`;
    _cmdCursor = -1;
    return;
  }

  _cmdCursor = Math.min(_cmdCursor, filtered.length - 1);

  const sections = {};
  filtered.forEach(a => { (sections[a.section] = sections[a.section] || []).push(a); });

  let html = '';
  let idx  = 0;
  for (const [section, items] of Object.entries(sections)) {
    html += `<div class="cmd-section-label">${escHtml(section)}</div>`;
    items.forEach(a => {
      const active = idx === _cmdCursor ? ' cmd-result--active' : '';
      html += `<div class="cmd-result${active}" role="option" data-cmd-id="${escHtml(a.id)}" onclick="cmdExec('${escHtml(a.id)}')">
        <div class="cmd-result-icon">${_CMD_ICONS[a.icon] || ''}</div>
        <div class="cmd-result-body">
          <div class="cmd-result-label">${escHtml(a.label)}</div>
          ${a.desc ? `<div class="cmd-result-desc">${escHtml(a.desc)}</div>` : ''}
        </div>
      </div>`;
      idx++;
    });
  }
  results.innerHTML = html;
}

function _cmdSyncHighlight() {
  const results  = document.getElementById('cmdResults');
  if (!results) return;
  const filtered = _cmdFilteredActions();
  _cmdCursor     = Math.max(0, Math.min(_cmdCursor, filtered.length - 1));
  results.querySelectorAll('.cmd-result').forEach((el, i) => {
    el.classList.toggle('cmd-result--active', i === _cmdCursor);
    if (i === _cmdCursor) el.scrollIntoView({ block: 'nearest' });
  });
}

function _cmdKey(e) {
  const filtered = _cmdFilteredActions();
  if (e.key === 'ArrowDown')  { e.preventDefault(); _cmdCursor = Math.min(_cmdCursor + 1, filtered.length - 1); _cmdSyncHighlight(); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); _cmdCursor = Math.max(_cmdCursor - 1, 0); _cmdSyncHighlight(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const item = filtered[Math.max(0, _cmdCursor)];
    if (item) cmdExec(item.id);
  }
}

function cmdExec(id) {
  const action = CMD_ACTIONS.find(a => a.id === id);
  if (!action) return;
  closeCmdPalette();
  action.action();
}

/* ══════════════════════════════════════════════════════════════════════════════
   FLIP Card Choreography — animate cards to new positions on filter change
   ══════════════════════════════════════════════════════════════════════════════ */

function _flipBoard() {
  if (_rm.matches || _items.length > 80) { renderBoard(); return; }

  // FIRST — snapshot current card positions
  const first = {};
  document.querySelectorAll('.kanban-card[id^="card-"]').forEach(el => {
    first[el.id] = el.getBoundingClientRect();
  });

  // LAST — render new state
  renderBoard();

  // INVERT + PLAY — animate each card from its old position to its new position
  document.querySelectorAll('.kanban-card[id^="card-"]').forEach(el => {
    const f = first[el.id];
    if (!f) return;
    const l  = el.getBoundingClientRect();
    const dx = f.left - l.left;
    const dy = f.top  - l.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate(
      [
        { transform: `translate(${dx}px,${dy}px)`, opacity: 0.65 },
        { transform: 'translate(0,0)',              opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'none' }
    );
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   Ambient column canvas — Lissajous-drifting blobs in developer palette colors
   ══════════════════════════════════════════════════════════════════════════════ */

const _ambiences = {};

function _parseRgba(color) {
  const m = color.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

class ColumnAmbience {
  constructor(status, canvasEl) {
    this.status  = status;
    this.canvas  = canvasEl;
    this.ctx     = canvasEl.getContext('2d');
    this.colors  = [];
    this.overdue = 0;
    this.active  = true;
    this.raf     = null;
    this._blobs  = Array.from({ length: 5 }, (_, i) => ({
      phase:  Math.random() * Math.PI * 2,
      r:      50 + Math.random() * 65,
      fxMul:  0.27 + i * 0.15,
      fyMul:  0.18 + i * 0.11,
      phiOff: i * 1.41,
    }));
    this._resize();
    this._loop();
  }

  _resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      this.canvas.width  = rect.width;
      this.canvas.height = rect.height;
    }
  }

  update(colors, overdue) {
    this.colors  = colors;
    this.overdue = overdue;
  }

  _loop() {
    if (!this.active) return;
    this._draw();
    this.raf = requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const { canvas: cv, ctx } = this;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!this.colors.length || cv.width === 0) return;

    const t = performance.now() * 0.001;

    this._blobs.forEach((b, i) => {
      const bx = cv.width  * (0.5 + 0.44 * Math.cos(t * b.fxMul + b.phase + b.phiOff));
      const by = cv.height * (0.5 + 0.44 * Math.sin(t * b.fyMul + b.phase * 0.77 + b.phiOff));

      const pulse = this.overdue > 0
        ? 1 + 0.22 * Math.sin(t * 2.8 + i * 1.5)
        : 1 + 0.08 * Math.sin(t * 0.9 + i * 2.1);

      const rgb = _parseRgba(this.colors[i % this.colors.length]);
      if (!rgb) return;

      const alpha = this.overdue > 0 ? 0.28 : 0.18;
      const r     = b.r * pulse;
      const grd   = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grd.addColorStop(0,    `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`);
      grd.addColorStop(0.55, `rgba(${rgb.r},${rgb.g},${rgb.b},${(alpha * 0.28).toFixed(3)})`);
      grd.addColorStop(1,    `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    });
  }

  pause()  { this.active = false; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } }
  resume() { if (!this.active) { this.active = true; this._loop(); } }
  destroy() { this.pause(); this.canvas.remove(); }
}

function initAmbience() {
  if (_rm.matches) return;
  STATUSES.forEach(status => {
    const cardsEl = document.getElementById(`cards-${status}`);
    if (!cardsEl) return;
    const cv = document.createElement('canvas');
    cv.className = 'col-ambient-canvas';
    cv.setAttribute('aria-hidden', 'true');
    cardsEl.prepend(cv);
    _ambiences[status] = new ColumnAmbience(status, cv);
  });
  window.addEventListener('resize', () => {
    STATUSES.forEach(s => _ambiences[s]?._resize());
  });
  document.addEventListener('visibilitychange', () => {
    const h = document.hidden;
    Object.values(_ambiences).forEach(a => h ? a.pause() : a.resume());
  });
}

function _updateAmbience(colItemsMap) {
  if (_rm.matches) return;
  STATUSES.forEach(status => {
    const amb = _ambiences[status];
    if (!amb) return;
    amb._resize();
    const items   = colItemsMap[status] || [];
    const overdue = items.filter(it =>
      it.estimated_end_date && !it.actual_end_date &&
      new Date(it.estimated_end_date + 'T00:00:00') < new Date()
    ).length;
    const seen   = new Set();
    const colors = items
      .map(it => devColor(it.assigned_to || it.created_by))
      .filter(c => seen.has(c) ? false : seen.add(c));
    amb.update(colors.length ? colors : [DEV_PALETTE[0]], overdue);
  });
}

function renderBoard() {
  const counts      = {};
  const colItemsMap = {};
  const me      = loadSession()?.username || '';
  const visible = (_filter === 'mine' ? _items.filter(i => i.assigned_to === me || i.created_by === me) : _items).filter(i => !i.is_parked);

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
    counts[status]      = count;
    colItemsMap[status] = items;

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
    // Restore ambient canvas (innerHTML removes it)
    if (_ambiences[status]) col.prepend(_ambiences[status].canvas);
  });
  updateColArcs(counts);
  _updateAmbience(colItemsMap);

  // Keep other views in sync when visible
  if (_viewMode === 'list')      renderListView();
  if (_viewMode === 'analytics') renderAnalytics();
  if (_viewMode === 'epics')     renderEpicsView();
}

const _TYPE_DEFAULT_COLOR = '#a1a1aa';

function _typeColor(devItemType) {
  if (!devItemType) return _TYPE_DEFAULT_COLOR;
  const t = _itemTypes.find(t => t.is_freeform && devItemType.startsWith(t.name + ': '))
         || _itemTypes.find(t => t.name === devItemType);
  return t?.color || _TYPE_DEFAULT_COLOR;
}

function _colorBadgeStyle(color) {
  if (!color || color.length < 4) return '';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `background:rgba(${r},${g},${b},0.15);border-color:rgba(${r},${g},${b},0.35);color:${color};`;
}

function typeBadge(devItemType) {
  if (!devItemType) return '';
  const freeformMatch = _itemTypes.find(t => t.is_freeform && devItemType.startsWith(t.name + ': '));
  const display = freeformMatch ? devItemType.slice(freeformMatch.name.length + 2) : devItemType;
  const color   = _typeColor(devItemType);
  return `<span class="kcard-type-badge" style="${_colorBadgeStyle(color)}" title="${escHtml(devItemType)}">${escHtml(display)}</span>`;
}

function renderCard(item, idx = 0) {
  const elapsed    = daysElapsed(item);
  const overdue    = item.estimated_end_date && !item.actual_end_date &&
                     new Date(item.estimated_end_date + 'T00:00:00') < new Date();
  const statusIdx  = STATUSES.indexOf(item.status);

  const sysIds    = _parseSystemIds(item);
  const sysLabels = sysIds.map(id => { const s = _systems.find(s => s.id === id); return s ? s.name : null; }).filter(Boolean);
  const devClr    = devColor(item.created_by);

  const epic            = item.epic_id ? _epics.find(e => e.epic_id === item.epic_id) : null;
  const assigneeKey     = item.assigned_to || item.created_by;
  const assigneeDisplay = (_members[assigneeKey]?.displayName || assigneeKey || '').split(' ')[0];

  const topRow = (sysLabels.length || item.dev_item_type) ? `<div class="kcard-top-row">
      ${sysLabels.length ? `<div class="kcard-sys-tags">${sysLabels.map(l => `<div class="kcard-system-tag">${escHtml(l)}</div>`).join('')}</div>` : ''}
      ${typeBadge(item.dev_item_type)}
    </div>` : '';
  return `<div class="kanban-card" id="card-${escHtml(item.id)}"
               style="animation-delay:${idx * 55}ms;--dev-clr:${devClr};view-transition-name:card-${item.id}">
    <div class="kcard-header-row">
      ${item.dev_item_code ? `<div class="kcard-code">${escHtml(item.dev_item_code)}</div>` : '<span></span>'}
      ${item.story_points != null ? `<span class="kcard-sp-badge" title="Story points">${item.story_points} SP</span>` : ''}
    </div>
    ${topRow}
    ${epic ? `<div class="kcard-epic-chip">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      ${escHtml(epic.epic_name)}
    </div>` : ''}
    <div class="kcard-title">${escHtml(item.title)}</div>
    ${item.description ? `<div class="kcard-desc">${escHtml(_descPreview(item.description))}</div>` : ''}
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
      <div class="kcard-assignee-wrap">
        ${authorBubble(assigneeKey)}
        ${assigneeDisplay ? `<span class="kcard-assignee-label" title="${escHtml(_members[assigneeKey]?.displayName || assigneeKey)}">${escHtml(assigneeDisplay)}</span>` : ''}
      </div>
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
    openDoneRemarksModal((remarks, actionIds, files) => _execMoveItem(id, newStatus, remarks, actionIds, files));
    return;
  }
  await _execMoveItem(id, newStatus, null, [], []);
}

async function _execMoveItem(id, newStatus, remarks, actionIds = [], files = []) {
  const item = _items.find(i => i.id === id);
  if (!item) return;
  const patch = { status: newStatus };
  if (newStatus === 'done' && !item.actual_end_date) {
    patch.actual_end_date = new Date().toISOString().slice(0, 10);
  }
  if (newStatus !== 'done') {
    patch.actual_end_date = null;
  }
  if ((newStatus === 'ongoing' || newStatus === 'coding') && !item.start_date) {
    patch.start_date = new Date().toISOString().slice(0, 10);
  }
  if (remarks) patch.remarks = remarks;
  if (newStatus === 'done') {
    if (actionIds.length) patch.resolution_action_ids = actionIds;
    if (files.length) {
      const urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('entity_type', 'dev_item');
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
    await fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    if (!_rm.matches && document.startViewTransition) {
      document.startViewTransition(() => { Object.assign(item, patch); renderBoard(); });
    } else {
      Object.assign(item, patch);
      renderBoard();
    }
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
    if (newStatus === 'done') {
      // Re-render so the card stays visible in its current column while the remarks modal is open
      renderBoard();
      await moveItem(id, newStatus);
    } else {
      // Optimistic update: show card in the new column immediately
      const rollback = { status: item.status, actual_end_date: item.actual_end_date, start_date: item.start_date };
      const dragPatch = { status: newStatus, actual_end_date: null };
      item.status = newStatus;
      item.actual_end_date = null;
      if ((newStatus === 'ongoing' || newStatus === 'coding') && !item.start_date) {
        dragPatch.start_date = new Date().toISOString().slice(0, 10);
        item.start_date = dragPatch.start_date;
      }
      renderBoard();
      document.getElementById(`card-${id}`)?.classList.add('kcard-saving');
      try {
        const res = await fetch(`/api/dev/items/${encodeURIComponent(id)}`, {
          method:  'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body:    JSON.stringify(dragPatch),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      } catch (err) {
        Object.assign(item, rollback);
        showToast(`Could not move card: ${err.message}`);
      } finally {
        renderBoard();
      }
    }
  } else {
    renderBoard();
  }
}

/* ── Delete ── */
async function deleteItem(id) {
  const item = _items.find(i => i.id === id);
  const title = item?.title || id;
  if (!await showConfirm({ title: 'Delete Item', message: `Delete "${title}"?`, detail: 'This also removes all activity logs and cannot be undone.', confirmText: 'Delete', danger: true })) return;
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
  if (_lassoDragged) return;
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
  const _spEl = document.getElementById('itemStoryPoints');
  if (_spEl) _spEl.value = item?.story_points != null ? item.story_points : '';
  _buildSystemChecklist(_parseSystemIds(item ?? {}));

  // Epic dropdown
  const epicSel = document.getElementById('itemEpic');
  if (epicSel) {
    epicSel.innerHTML = '<option value="">— None —</option>' +
      _epics.filter(e => e.is_active !== false).map(e =>
        `<option value="${escHtml(e.epic_id)}">${escHtml(e.epic_name)}</option>`
      ).join('');
    epicSel.value = item?.epic_id ?? '';
  }
  // is_parked checkbox
  const parkedCb = document.getElementById('itemIsParked');
  if (parkedCb) parkedCb.checked = !!item?.is_parked;
  // If opened from epic context, pre-select that epic
  if (_addItemToEpicId && !item && epicSel) epicSel.value = _addItemToEpicId;

  // Assigned To dropdown — populated from _members
  const assignSel = document.getElementById('itemAssignedTo');
  if (assignSel) {
    const me = loadSession()?.username || '';
    assignSel.innerHTML = '<option value="">— Unassigned —</option>' +
      Object.entries(_members).map(([uname, m]) =>
        `<option value="${escHtml(uname)}">${escHtml(m.displayName || uname)}</option>`
      ).join('');
    // Default new items to the current user
    assignSel.value = item?.assigned_to ?? me;
  }

  // Item type — build dropdown from _itemTypes, handle freeform (e.g. "Others: ...") detection
  const savedType   = item?.dev_item_type ?? '';
  const typeSelect  = document.getElementById('itemType');
  const othersGroup = document.getElementById('itemTypeOthersGroup');
  const othersInput = document.getElementById('itemTypeOthers');
  typeSelect.innerHTML = '<option value="">— Select Type —</option>' +
    _itemTypes.filter(t => t.is_active !== false).map(t =>
      `<option value="${escHtml(t.name)}">${escHtml(t.name)}</option>`
    ).join('');
  const freeformMatch = _itemTypes.find(t => t.is_freeform && savedType.startsWith(t.name + ': '));
  if (freeformMatch) {
    typeSelect.value  = freeformMatch.name;
    othersInput.value = savedType.slice(freeformMatch.name.length + 2);
    othersGroup.style.display = '';
  } else {
    typeSelect.value  = _itemTypes.find(t => t.name === savedType) ? savedType : '';
    othersInput.value = '';
    othersGroup.style.display = 'none';
  }

  const body      = document.getElementById('itemDetailBody');
  const logPane   = document.getElementById('detailLogPane');
  const deleteBtn = document.getElementById('detailDeleteBtn');
  const dupWrap   = document.getElementById('dupTypeWrap');

  if (item) {
    body.classList.remove('detail-new');
    logPane.style.display   = '';
    deleteBtn.style.display = '';
    if (dupWrap) { dupWrap.style.display = ''; _buildDupTypeMenu(); }
    refreshLogs();
    loadLinkedIssues(item.id);
  } else {
    body.classList.add('detail-new');
    logPane.style.display   = 'none';
    deleteBtn.style.display = 'none';
    if (dupWrap) dupWrap.style.display = 'none';
  }

  resetItemForm();
  const detailModal = document.getElementById('itemDetailModal');
  // Elevate above archive or epic modal if either is open
  const archiveOpen = document.getElementById('archiveModal').classList.contains('open');
  const epicOpen    = document.getElementById('epicDetailModal')?.classList.contains('open');
  detailModal.style.zIndex = (archiveOpen || epicOpen) ? '1100' : '';
  detailModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('itemTitle').focus(), 60);
}

function closeDetailModal() {
  closeSysDropdown();
  const dupMenu = document.getElementById('dupTypeMenu');
  if (dupMenu) dupMenu.classList.remove('open');
  const detailModal = document.getElementById('itemDetailModal');
  detailModal.classList.remove('open');
  detailModal.style.zIndex = '';
  // Only restore scroll if no other modal is still open
  const anyOpen = document.querySelector('.modal-overlay.open:not(#itemDetailModal)');
  if (!anyOpen) document.body.style.overflow = '';
  _editingId = null;
  const liSec = document.getElementById('linkedIssSection');
  if (liSec) liSec.style.display = 'none';
  if (_epicPageId) _loadEpicPageItems(_epicPageId);
}

function overlayCloseDetail(e) {
  if (e.target === document.getElementById('itemDetailModal')) closeDetailModal();
}

/* ── Resolution helpers (actions checklist + image attachments) ── */
async function _devLoadActions() {
  if (_devActionsCache) return;
  try {
    const r = await fetch('/api/actions');
    _devActionsCache = r.ok ? await r.json() : [];
  } catch { _devActionsCache = []; }
}

function _devRenderActionsGrid() {
  const grid = document.getElementById('devActionsGrid');
  if (!grid) return;
  const actions = _devActionsCache || [];
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

function _devGetCheckedActionIds() {
  const grid = document.getElementById('devActionsGrid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => parseInt(cb.value, 10));
}

function devResAttachChange(input) {
  const remaining = 5 - _devResPendingFiles.length;
  _devResPendingFiles.push(...Array.from(input.files).slice(0, remaining));
  input.value = '';
  _devRenderResAttachPreviews();
}

function _devRenderResAttachPreviews() {
  const wrap   = document.getElementById('devResAttachPreviews');
  const addBtn = document.getElementById('devResAttachAddBtn');
  if (!wrap) return;
  if (addBtn) addBtn.style.display = _devResPendingFiles.length >= 5 ? 'none' : '';
  wrap.innerHTML = _devResPendingFiles.map((f, i) =>
    `<div class="res-attach-thumb">
      <img src="${URL.createObjectURL(f)}" alt="${escHtml(f.name)}">
      <button type="button" class="res-attach-remove" onclick="devResRemovePending(${i})" title="Remove">&times;</button>
    </div>`
  ).join('');
}

function devResRemovePending(i) {
  _devResPendingFiles.splice(i, 1);
  _devRenderResAttachPreviews();
}

/* ── Mark-Done remarks modal ── */
async function openDoneRemarksModal(onConfirm) {
  _doneRemarksCallback = onConfirm;
  _devResPendingFiles  = [];
  document.getElementById('doneRemarksText').value = '';
  await _devLoadActions();
  _devRenderActionsGrid();
  _devRenderResAttachPreviews();
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
  const remarks    = document.getElementById('doneRemarksText').value.trim();
  const actionIds  = _devGetCheckedActionIds();
  const files      = _devResPendingFiles.slice();
  const cb = _doneRemarksCallback;
  closeDoneRemarksModal();
  if (cb) cb(remarks, actionIds, files);
}

async function deleteItemFromDetail() {
  if (!_editingId) return;
  const id = _editingId;
  closeDetailModal();
  await deleteItem(id);
}

function _buildDupTypeMenu() {
  const menu = document.getElementById('dupTypeMenu');
  if (!menu) return;
  const currentItem = _editingId ? _items.find(i => i.id === _editingId) : null;
  const currentType = currentItem?.dev_item_type ?? '';
  const currentBase = _itemTypes.find(t => t.is_freeform && currentType.startsWith(t.name + ': '))?.name ?? currentType;
  const options = _itemTypes.filter(t => t.is_active !== false && t.name !== currentBase);
  if (!options.length) {
    menu.innerHTML = '<div class="dup-type-empty">No other types available</div>';
  } else {
    menu.innerHTML = options.map(t =>
      `<button type="button" class="dup-type-option" onclick="duplicateItemAs('${escHtml(t.name)}')">${escHtml(t.name)}</button>`
    ).join('');
  }
}

function toggleDupTypeMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('dupTypeMenu');
  if (!menu) return;
  menu.classList.toggle('open');
}

async function duplicateItemAs(targetTypeName) {
  const menu = document.getElementById('dupTypeMenu');
  if (menu) menu.classList.remove('open');
  if (!_editingId) return;
  const src = _items.find(i => i.id === _editingId);
  if (!src) return;

  const typeDef = _itemTypes.find(t => t.name === targetTypeName);
  const payload = {
    title:             src.title,
    description:       src.description ?? '',
    status:            'pending',
    dev_item_type:     targetTypeName,
    assigned_to:       src.assigned_to ?? null,
    epic_id:           src.epic_id ?? null,
    start_date:        src.start_date ?? null,
    estimated_end_date: src.estimated_end_date ?? null,
    story_points:      src.story_points ?? null,
    system_ids:        src.system_ids ?? [],
  };

  try {
    const res = await fetch('/api/dev/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const created = await res.json();
    closeDetailModal();
    await loadItems();
    showToast(`Duplicated as "${targetTypeName}".`);
    // Open the new item immediately
    if (created?.id) openDetailModal(created.id);
  } catch (err) {
    showToast('Failed to duplicate item: ' + err.message, 'error');
  }
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
    openDoneRemarksModal((remarks, actionIds, files) => _execSaveItem(remarks, actionIds, files));
    return;
  }
  await _execSaveItem(null, [], []);
}

async function _execSaveItem(remarks, actionIds = [], files = []) {
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
  const selTypeDef = _itemTypes.find(t => t.name === typeVal);
  const devItemType = selTypeDef?.is_freeform
    ? (othersText ? `${typeVal}: ${othersText}` : typeVal)
    : (typeVal || null);

  const formStartDate = document.getElementById('itemStart').value;
  const autoStartDate = (!formStartDate && (newStatus === 'ongoing' || newStatus === 'coding') && !prevItem?.start_date)
    ? new Date().toISOString().slice(0, 10)
    : (formStartDate || null);

  const payload = {
    title,
    description:        document.getElementById('itemDesc').value.trim() || null,
    status:             newStatus,
    system_ids:         _getSelectedSystemIds(),
    start_date:         autoStartDate,
    estimated_end_date: document.getElementById('itemEstEnd').value || null,
    story_points:       (v => v !== '' && v !== null ? parseFloat(v) : null)(document.getElementById('itemStoryPoints')?.value ?? ''),
    actual_end_date,
    dev_item_type:      devItemType,
    epic_id:            document.getElementById('itemEpic')?.value || null,
    is_parked:          document.getElementById('itemIsParked')?.checked ?? false,
    assigned_to:        document.getElementById('itemAssignedTo')?.value || null,
  };
  if (remarks) payload.remarks = remarks;
  if (newStatus === 'done') {
    if (actionIds.length) payload.resolution_action_ids = actionIds;
    if (files.length && (_editingId || true)) {
      const entityId = _editingId || 'new';
      const urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('entity_type', 'dev_item');
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
    const wasEditing   = !!_editingId;
    const savedEpicId  = payload.epic_id;
    renderBoard();
    closeDetailModal();
    showToast(`Item ${wasEditing ? 'updated' : 'created'}.`);
    // Refresh epic items pane if epic modal is open
    if (_editingEpicId && (savedEpicId === _editingEpicId)) {
      _refreshEpicItems(_editingEpicId);
    }
    if (_addItemToEpicId) {
      const epicId = _addItemToEpicId;
      _addItemToEpicId = null;
      _refreshEpicItems(epicId);
    }
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

const _ISS_STATUS_LABEL = { new:'New', open:'Open', in_progress:'In Progress', resolved:'Resolved', closed:'Closed' };
const _ISS_STATUS_CLASS = { new:'badge-iss-new-pill', open:'badge-iss-open-pill', in_progress:'badge-iss-progress-pill', resolved:'badge-iss-resolved-pill', closed:'badge-iss-closed-pill' };

async function loadLinkedIssues(itemId) {
  const section = document.getElementById('linkedIssSection');
  const list    = document.getElementById('linkedIssList');
  if (!section || !list) return;
  list.innerHTML = '<span class="linked-iss-loading">Loading…</span>';
  section.style.display = '';
  try {
    const res = await fetch(`/api/dev/items/${encodeURIComponent(itemId)}/issues`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed');
    const issues = await res.json();
    if (!issues.length) {
      section.style.display = 'none';
      return;
    }
    list.innerHTML = issues.map(iss => {
      const ticket  = iss.ticket_number ? `#${escHtml(iss.ticket_number)}` : escHtml(iss.id.slice(0, 8)) + '…';
      const title   = escHtml(iss.title || iss.description?.slice(0, 80) || '');
      const status  = iss.status || 'open';
      const label   = _ISS_STATUS_LABEL[status] || status;
      const cls     = _ISS_STATUS_CLASS[status] || '';
      const dupBadge = iss.is_duplicate ? '<span class="linked-iss-dup-badge">Dup</span>' : '';
      return `<div class="linked-iss-row">
        <span class="linked-iss-ticket">${ticket}</span>
        ${dupBadge}
        <span class="linked-iss-title">${title}</span>
        <span class="linked-iss-status ${cls}">${escHtml(label)}</span>
      </div>`;
    }).join('');
  } catch {
    section.style.display = 'none';
  }
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
  const sysIds    = _parseSystemIds(item);
  const sysLabels = sysIds.map(id => { const s = _systems.find(s => s.id === id); return s ? s.name : null; }).filter(Boolean);
  const id        = escHtml(item.id);
  return `<div onclick="openDetailModal('${id}')"
    style="cursor:pointer;padding:14px 16px;border-bottom:1px solid var(--border);display:flex;gap:14px;align-items:flex-start;transition:background 0.12s;"
    onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">
    <div style="flex:1;min-width:0;">
      ${item.dev_item_code ? `<div class="kcard-code" style="margin-bottom:4px;">${escHtml(item.dev_item_code)}</div>` : ''}
      <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-bottom:5px;">${escHtml(item.title)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${sysLabels.map(l => `<span class="kcard-system-tag">${escHtml(l)}</span>`).join('')}
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
    const currentSelected = _getSelectedSystemIds();
    currentSelected.push(saved.id);
    _buildSystemChecklist(currentSelected);
    // Also refresh epic sys dropdown if the epic modal is open
    if (document.getElementById('epicDetailModal')?.classList.contains('open')) {
      const epicSelected = _getSelectedEpicSystemIds();
      epicSelected.push(saved.id);
      _buildEpicSysChecklist(epicSelected);
    }
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

/* ══════════════════════════════════════════════════════════════════════════════
   Dev Items — List View
   ══════════════════════════════════════════════════════════════════════════════ */

const STATUS_ORDER_MAP = { pending: 0, ongoing: 1, coding: 2, testing: 3, done: 4 };

function sortListBy(col) {
  if (_listSort.col === col) {
    _listSort.dir = _listSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _listSort.col = col;
    _listSort.dir = col === 'status' ? 'asc' : (col === 'elapsed' || col === 'story_points' ? 'desc' : 'asc');
  }
  renderListView();
}

function _getListItems() {
  const me = loadSession()?.username || '';
  let items = _filter === 'mine' ? _items.filter(i => i.assigned_to === me || i.created_by === me) : _items.slice();

  const search  = (document.getElementById('listSearch')?.value       || '').toLowerCase().trim();
  const statusF = document.getElementById('listStatusFilter')?.value  || '';
  const typeF   = document.getElementById('listTypeFilter')?.value    || '';
  const devF    = document.getElementById('listDevFilter')?.value     || '';
  const sysF    = document.getElementById('listSysFilter')?.value     || '';

  if (search) {
    items = items.filter(i =>
      (i.title         || '').toLowerCase().includes(search) ||
      (i.dev_item_code || '').toLowerCase().includes(search) ||
      (i.dev_item_type || '').toLowerCase().includes(search)
    );
  }
  if (statusF) items = items.filter(i => i.status === statusF);
  if (typeF)   items = items.filter(i => {
    const dtype   = i.dev_item_type || '';
    const typeDef = _itemTypes.find(t => t.name === typeF);
    return typeDef?.is_freeform ? dtype.startsWith(typeF) : dtype === typeF;
  });
  if (devF)    items = items.filter(i => i.assigned_to === devF || i.created_by === devF);
  if (sysF)    items = items.filter(i => _parseSystemIds(i).includes(sysF));

  const col = _listSort.col;
  const dir = _listSort.dir === 'asc' ? 1 : -1;

  items.sort((a, b) => {
    let av, bv;
    if (col === 'status') {
      av = STATUS_ORDER_MAP[a.status] ?? 99;
      bv = STATUS_ORDER_MAP[b.status] ?? 99;
    } else if (col === 'elapsed') {
      av = daysElapsed(a) ?? -1;
      bv = daysElapsed(b) ?? -1;
    } else if (col === 'story_points') {
      av = a.story_points ?? -1;
      bv = b.story_points ?? -1;
    } else if (col === 'systems') {
      const sa = _parseSystemIds(a), sb = _parseSystemIds(b);
      av = sa.length ? (_systems.find(s => s.id === sa[0])?.name || '').toLowerCase() : '';
      bv = sb.length ? (_systems.find(s => s.id === sb[0])?.name || '').toLowerCase() : '';
    } else if (col === 'created_by') {
      const au = a.assigned_to || a.created_by || '';
      const bu = b.assigned_to || b.created_by || '';
      av = (_members[au]?.displayName || au).toLowerCase();
      bv = (_members[bu]?.displayName || bu).toLowerCase();
    } else {
      av = (a[col] || '').toString().toLowerCase();
      bv = (b[col] || '').toString().toLowerCase();
    }
    if (av < bv) return -dir;
    if (av > bv) return  dir;
    return 0;
  });

  return items;
}

function _populateListFilters() {
  if (_listFiltersPopulated) return;
  _listFiltersPopulated = true;

  const devSel = document.getElementById('listDevFilter');
  if (devSel) {
    const devUsernames = new Set([
      ...Object.keys(_members),
      ..._items.map(i => i.assigned_to).filter(Boolean),
      ..._items.map(i => i.created_by).filter(Boolean),
    ]);
    [...devUsernames].sort((a, b) => {
      const an = (_members[a]?.displayName || a).toLowerCase();
      const bn = (_members[b]?.displayName || b).toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    }).forEach(d => {
      const opt = document.createElement('option');
      opt.value       = d;
      opt.textContent = _members[d]?.displayName || d;
      devSel.appendChild(opt);
    });
  }

  const sysSel = document.getElementById('listSysFilter');
  if (sysSel) {
    _systems.forEach(s => {
      const opt = document.createElement('option');
      opt.value       = s.id;
      opt.textContent = s.name;
      sysSel.appendChild(opt);
    });
  }
}

// SP cell: shows estimated SP, and for done items also shows actual SP (start→end days)
function _spCell(item) {
  const est = item.story_points;
  const act = actualSP(item);
  if (act !== null && est != null) {
    const diff = act - est;
    const cls  = diff > 0 ? 'dlt-sp-over' : diff < 0 ? 'dlt-sp-under' : 'dlt-sp-exact';
    return `<span class="dlt-sp">${est}<span class="dlt-sp-suffix">est</span></span>`
         + `<span class="dlt-sp-actual ${cls}">${act}<span class="dlt-sp-suffix">act</span></span>`;
  }
  if (act !== null) {
    return `<span class="dlt-sp dlt-sp-actual-only">${act}<span class="dlt-sp-suffix">act</span></span>`;
  }
  if (est != null) {
    return `<span class="dlt-sp">${est}<span class="dlt-sp-suffix">pt</span></span>`;
  }
  return `<span class="dlt-muted">—</span>`;
}

function renderListView() {
  if (_viewMode !== 'list') return;
  _populateListFilters();

  const allItems = _getListItems();
  const items    = allItems.filter(i => !i.is_parked);

  // Parked items — apply same non-status filters independently
  const me        = loadSession()?.username || '';
  const searchVal = (document.getElementById('listSearch')?.value || '').toLowerCase().trim();
  const typeF     = document.getElementById('listTypeFilter')?.value  || '';
  const devF      = document.getElementById('listDevFilter')?.value   || '';
  const sysF      = document.getElementById('listSysFilter')?.value   || '';
  let parked = (_filter === 'mine' ? _items.filter(i => i.assigned_to === me || i.created_by === me) : _items.slice())
    .filter(i => i.is_parked);
  if (searchVal) parked = parked.filter(i =>
    (i.title || '').toLowerCase().includes(searchVal) ||
    (i.dev_item_code || '').toLowerCase().includes(searchVal) ||
    (i.dev_item_type || '').toLowerCase().includes(searchVal));
  if (typeF) parked = parked.filter(i => typeF === 'Others'
    ? (i.dev_item_type || '').startsWith('Others')
    : (i.dev_item_type || '') === typeF);
  if (devF)  parked = parked.filter(i => i.assigned_to === devF || i.created_by === devF);
  if (sysF)  parked = parked.filter(i => _parseSystemIds(i).includes(sysF));

  const countEl = document.getElementById('listCount');
  if (countEl) countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  // Update sort icons
  ['dev_item_code','title','status','dev_item_type','systems','created_by','start_date','estimated_end_date','story_points','elapsed'].forEach(col => {
    const el = document.getElementById(`sort-${col}`);
    if (!el) return;
    el.textContent = _listSort.col === col ? (_listSort.dir === 'asc' ? '↑' : '↓') : '';
  });

  const tbody = document.getElementById('devListBody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="dlt-empty">No items match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const sysIds    = _parseSystemIds(item);
    const sysNames  = sysIds.map(id => _systems.find(s => s.id === id)?.name).filter(Boolean);
    const elapsed   = daysElapsed(item);
    const overdue   = item.estimated_end_date && !item.actual_end_date &&
                      new Date(item.estimated_end_date + 'T00:00:00') < new Date();
    const assignee  = item.assigned_to || item.created_by;
    const m         = _members[assignee] || {};
    const devName   = m.displayName || assignee || '—';
    const devInit   = (devName.charAt(0) || '?').toUpperCase();

    const statusCls = {
      pending: 'dp-s-pending', ongoing: 'dp-s-ongoing', coding: 'dp-s-coding',
      testing: 'dp-s-testing', done: 'dp-s-done',
    }[item.status] || '';

    const rawType    = item.dev_item_type || '';
    const typeDisp   = rawType.startsWith('Others: ') ? rawType.slice('Others: '.length) : rawType;
    const typeStyle  = rawType ? _colorBadgeStyle(_typeColor(rawType)) : '';

    const sysHtml = sysNames.length
      ? sysNames.slice(0, 3).map(n => `<span class="kcard-system-tag">${escHtml(n)}</span>`).join('')
        + (sysNames.length > 3 ? `<span class="kcard-system-tag">+${sysNames.length - 3}</span>` : '')
      : `<span class="dlt-muted">—</span>`;

    const avatarHtml = m.avatarUrl
      ? `<img src="${m.avatarUrl}" class="dlt-avatar" alt="${escHtml(devInit)}">`
      : `<div class="dlt-avatar dlt-avatar-initial">${escHtml(devInit)}</div>`;

    const isSel = _selectedIds.has(item.id);
    return `<tr class="dlt-row${isSel ? ' dlt-selected' : ''}" data-item-id="${escHtml(item.id)}" onclick="openDetailModal('${escHtml(item.id)}')">
      <td class="dlt-td dlt-cb-cell" onclick="event.stopPropagation()">
        <input type="checkbox" class="dlt-cb" ${isSel ? 'checked' : ''} onchange="toggleSelectItem('${escHtml(item.id)}', this.checked)">
      </td>
      <td class="dlt-td dlt-code">${item.dev_item_code ? escHtml(item.dev_item_code) : '—'}</td>
      <td class="dlt-td">
        <div class="dlt-title-text">${escHtml(item.title)}</div>
        ${item.description ? `<div class="dlt-desc-preview">${escHtml(_descPreview(item.description, 75))}</div>` : ''}
      </td>
      <td class="dlt-td"><span class="dp-item-status ${statusCls}">${escHtml(item.status)}</span></td>
      <td class="dlt-td">${rawType ? `<span class="kcard-type-badge" style="${typeStyle}">${escHtml(typeDisp)}</span>` : `<span class="dlt-muted">—</span>`}</td>
      <td class="dlt-td"><div class="dlt-sys-tags">${sysHtml}</div></td>
      <td class="dlt-td">
        <div class="dlt-dev-cell">${avatarHtml}<span class="dlt-dev-name">${escHtml(devName)}</span></div>
      </td>
      <td class="dlt-td dlt-date">${fmtDate(item.start_date)}</td>
      <td class="dlt-td dlt-date${overdue ? ' dlt-overdue' : ''}">${fmtDate(item.estimated_end_date)}${overdue ? ' ⚠' : ''}</td>
      <td class="dlt-td">${_spCell(item)}</td>
      <td class="dlt-td">${elapsed !== null ? `<span class="dlt-elapsed-val">${elapsed}d</span>` : `<span class="dlt-muted">—</span>`}</td>
    </tr>`;
  }).join('');

  // Parked section
  const parkedSection = document.getElementById('parkedSection');
  const parkedCount   = document.getElementById('parkedCount');
  const parkedBody    = document.getElementById('parkedListBody');
  if (parkedSection) parkedSection.style.display = parked.length ? '' : 'none';
  if (parkedCount)   parkedCount.textContent = `${parked.length} item${parked.length !== 1 ? 's' : ''}`;
  if (parkedBody) {
    parkedBody.innerHTML = parked.length
      ? parked.map(item => {
          const sysIds    = _parseSystemIds(item);
          const sysNames  = sysIds.map(id => _systems.find(s => s.id === id)?.name).filter(Boolean);
          const elapsed   = daysElapsed(item);
          const assignee  = item.assigned_to || item.created_by;
          const m         = _members[assignee] || {};
          const devName   = m.displayName || assignee || '—';
          const devInit   = (devName.charAt(0) || '?').toUpperCase();
          const rawType   = item.dev_item_type || '';
          const typeDisp  = rawType.startsWith('Others: ') ? rawType.slice('Others: '.length) : rawType;
          const typeStyle = rawType ? _colorBadgeStyle(_typeColor(rawType)) : '';
          const sysHtml   = sysNames.length
            ? sysNames.slice(0, 3).map(n => `<span class="kcard-system-tag">${escHtml(n)}</span>`).join('')
              + (sysNames.length > 3 ? `<span class="kcard-system-tag">+${sysNames.length - 3}</span>` : '')
            : `<span class="dlt-muted">—</span>`;
          const avatarHtml = m.avatarUrl
            ? `<img src="${m.avatarUrl}" class="dlt-avatar" alt="${escHtml(devInit)}">`
            : `<div class="dlt-avatar dlt-avatar-initial">${escHtml(devInit)}</div>`;
          const isSel = _selectedIds.has(item.id);
          return `<tr class="dlt-row${isSel ? ' dlt-selected' : ''}" data-item-id="${escHtml(item.id)}" onclick="openDetailModal('${escHtml(item.id)}')">
            <td class="dlt-td dlt-cb-cell" onclick="event.stopPropagation()">
              <input type="checkbox" class="dlt-cb" ${isSel ? 'checked' : ''} onchange="toggleSelectItem('${escHtml(item.id)}', this.checked)">
            </td>
            <td class="dlt-td dlt-code">${item.dev_item_code ? escHtml(item.dev_item_code) : '—'}</td>
            <td class="dlt-td">
              <div class="dlt-title-text">${escHtml(item.title)}</div>
              ${item.description ? `<div class="dlt-desc-preview">${escHtml(_descPreview(item.description, 75))}</div>` : ''}
            </td>
            <td class="dlt-td">${rawType ? `<span class="kcard-type-badge" style="${typeStyle}">${escHtml(typeDisp)}</span>` : `<span class="dlt-muted">—</span>`}</td>
            <td class="dlt-td"><div class="dlt-sys-tags">${sysHtml}</div></td>
            <td class="dlt-td"><div class="dlt-dev-cell">${avatarHtml}<span class="dlt-dev-name">${escHtml(devName)}</span></div></td>
            <td class="dlt-td dlt-date">${fmtDate(item.start_date)}</td>
            <td class="dlt-td dlt-date">${fmtDate(item.estimated_end_date)}</td>
            <td class="dlt-td">${_spCell(item)}</td>
            <td class="dlt-td">${elapsed !== null ? `<span class="dlt-elapsed-val">${elapsed}d</span>` : `<span class="dlt-muted">—</span>`}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="10" class="dlt-empty">No parked items match the filters.</td></tr>`;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   Analytics view
   ══════════════════════════════════════════════════════════════════════════════ */

function renderAnalytics() {
  if (_viewMode !== 'analytics') return;
  const me    = loadSession()?.username || '';
  const items = _filter === 'mine' ? _items.filter(i => i.assigned_to === me || i.created_by === me) : _items;
  _renderAnaKpis(items);
  _renderAnaTypeChart(items);
  _renderAnaAgingChart(items);
  _renderAnaElapsedChart(items);
  _renderAnaMonthChart(items);
  _renderAnaDevChart(items);
  _renderAnaSpAccuracyChart(items);
}

function _renderAnaKpis(items) {
  const strip = document.getElementById('anaKpiStrip');
  if (!strip) return;

  const total   = items.length;
  const active  = items.filter(i => i.status !== 'done').length;
  const done    = items.filter(i => i.status === 'done').length;
  const overdue = items.filter(i =>
    i.estimated_end_date && !i.actual_end_date &&
    new Date(i.estimated_end_date + 'T00:00:00') < new Date()
  ).length;

  const withElapsed = items.filter(i => daysElapsed(i) !== null);
  const avgElapsed  = withElapsed.length
    ? Math.round(withElapsed.reduce((s, i) => s + daysElapsed(i), 0) / withElapsed.length)
    : null;
  const maxElapsed  = withElapsed.length
    ? Math.max(...withElapsed.map(i => daysElapsed(i)))
    : null;

  // SP metrics
  const withEstSP   = items.filter(i => i.story_points != null);
  const totalEstSP  = withEstSP.length
    ? parseFloat(withEstSP.reduce((s, i) => s + i.story_points, 0).toFixed(2)) : null;
  const withActSP   = items.filter(i => actualSP(i) !== null);
  const totalActSP  = withActSP.length
    ? withActSP.reduce((s, i) => s + actualSP(i), 0) : null;
  const bothSP      = items.filter(i => i.story_points != null && actualSP(i) !== null);
  const avgAccuracy = bothSP.length
    ? Math.round(bothSP.reduce((s, i) => s + (actualSP(i) / i.story_points) * 100, 0) / bothSP.length)
    : null;

  strip.innerHTML = `
    <div class="ana-kpi-card">
      <div class="ana-kpi-n">${total}</div>
      <div class="ana-kpi-lbl">Total Items</div>
    </div>
    <div class="ana-kpi-card ana-kpi-active">
      <div class="ana-kpi-n">${active}</div>
      <div class="ana-kpi-lbl">Active</div>
    </div>
    <div class="ana-kpi-card ana-kpi-done">
      <div class="ana-kpi-n">${done}</div>
      <div class="ana-kpi-lbl">Completed</div>
    </div>
    <div class="ana-kpi-card${overdue > 0 ? ' ana-kpi-warn' : ''}">
      <div class="ana-kpi-n">${overdue}</div>
      <div class="ana-kpi-lbl">Overdue</div>
    </div>
    <div class="ana-kpi-card">
      <div class="ana-kpi-n">${avgElapsed !== null ? avgElapsed + 'd' : '—'}</div>
      <div class="ana-kpi-lbl">Avg Elapsed</div>
    </div>
    <div class="ana-kpi-card">
      <div class="ana-kpi-n">${maxElapsed !== null ? maxElapsed + 'd' : '—'}</div>
      <div class="ana-kpi-lbl">Max Elapsed</div>
    </div>
    <div class="ana-kpi-card">
      <div class="ana-kpi-n">${totalEstSP !== null ? totalEstSP + 'pt' : '—'}</div>
      <div class="ana-kpi-lbl">Est. Story Points</div>
    </div>
    <div class="ana-kpi-card ana-kpi-done">
      <div class="ana-kpi-n">${totalActSP !== null ? totalActSP + 'pt' : '—'}</div>
      <div class="ana-kpi-lbl">Actual Story Points</div>
    </div>
    <div class="ana-kpi-card${avgAccuracy !== null && avgAccuracy > 120 ? ' ana-kpi-warn' : ''}">
      <div class="ana-kpi-n">${avgAccuracy !== null ? avgAccuracy + '%' : '—'}</div>
      <div class="ana-kpi-lbl">Avg SP Accuracy</div>
    </div>`;
}

function _anaBarRows(data) {
  const max = Math.max(...data.map(d => d.value), 1);
  return data.map(d => {
    const pct = (d.value / max * 100).toFixed(1);
    return `<div class="ana-bar-row">
      <div class="ana-bar-label" title="${escHtml(d.label)}">${escHtml(d.label)}</div>
      <div class="ana-bar-track">
        <div class="ana-bar-fill" style="width:${pct}%;background:${d.color};"></div>
      </div>
      <div class="ana-bar-count">${d.value}</div>
    </div>`;
  }).join('');
}

function _renderAnaTypeChart(items) {
  const el = document.getElementById('anaTypeChart');
  if (!el) return;
  const counts = {};
  items.forEach(i => {
    const t = i.dev_item_type || 'Unspecified';
    counts[t] = (counts[t] || 0) + 1;
  });
  const TYPE_CLR = {
    'New Feature': '#22d3ee', 'Improvement': '#60a5fa', 'Bug Fix': '#f87171',
    'Admin Task': '#fbbf24', 'Discussion': '#c4b5fd', 'Maintenance': '#94a3b8',
    'Unspecified': '#6b7280',
  };
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({
    label: label.startsWith('Others: ') ? label.slice('Others: '.length) : label,
    value,
    color: TYPE_CLR[label] || '#a78bfa',
  }));
  el.innerHTML = data.length ? _anaBarRows(data) : '<div class="ana-no-data">No data.</div>';
}

function _renderAnaAgingChart(items) {
  const el = document.getElementById('anaAgingChart');
  if (!el) return;
  const active = items.filter(i => i.status !== 'done' && i.start_date);
  const buckets = [
    { label: '0–7 days',    min: 0,  max: 7,          color: '#4ade80', count: 0 },
    { label: '8–14 days',   min: 8,  max: 14,         color: '#facc15', count: 0 },
    { label: '15–30 days',  min: 15, max: 30,         color: '#fb923c', count: 0 },
    { label: '31–60 days',  min: 31, max: 60,         color: '#f87171', count: 0 },
    { label: '60+ days',    min: 61, max: Infinity,   color: '#e11d48', count: 0 },
  ];
  active.forEach(i => {
    const d = daysElapsed(i);
    if (d === null) return;
    const b = buckets.find(b => d >= b.min && d <= b.max);
    if (b) b.count++;
  });
  const data = buckets.map(b => ({ label: b.label, value: b.count, color: b.color }));
  el.innerHTML = data.some(d => d.value > 0)
    ? _anaBarRows(data)
    : '<div class="ana-no-data">No active items with start dates.</div>';
}

function _renderAnaElapsedChart(items) {
  const el = document.getElementById('anaElapsedChart');
  if (!el) return;
  const buckets = [
    { label: '1 day',       min: 0,  max: 1,         color: '#4ade80', count: 0 },
    { label: '2–7 days',    min: 2,  max: 7,         color: '#a3e635', count: 0 },
    { label: '1–2 weeks',   min: 8,  max: 14,        color: '#facc15', count: 0 },
    { label: '2–4 weeks',   min: 15, max: 28,        color: '#fb923c', count: 0 },
    { label: '1–2 months',  min: 29, max: 60,        color: '#f87171', count: 0 },
    { label: '2+ months',   min: 61, max: Infinity,  color: '#e11d48', count: 0 },
  ];
  items.forEach(i => {
    const d = daysElapsed(i);
    if (d === null) return;
    const b = buckets.find(b => d >= b.min && d <= b.max);
    if (b) b.count++;
  });
  const data = buckets.map(b => ({ label: b.label, value: b.count, color: b.color }));
  el.innerHTML = data.some(d => d.value > 0)
    ? _anaBarRows(data)
    : '<div class="ana-no-data">No items with start dates.</div>';
}

function _renderAnaMonthChart(items) {
  const el = document.getElementById('anaMonthChart');
  if (!el) return;
  const done = items.filter(i => i.actual_end_date);
  if (!done.length) {
    el.innerHTML = '<div class="ana-no-data">No completed items yet.</div>';
    return;
  }
  const months = {};
  done.forEach(i => { const k = i.actual_end_date.slice(0, 7); months[k] = (months[k] || 0) + 1; });
  const keys = Object.keys(months).sort().slice(-12);
  const data = keys.map(k => {
    const [y, m] = k.split('-');
    return {
      label: new Date(+y, +m - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
      value: months[k],
      color: '#4ade80',
    };
  });
  el.innerHTML = _anaBarRows(data);
}

function _renderAnaDevChart(items) {
  const el = document.getElementById('anaDevChart');
  if (!el) return;
  const devs = {};
  items.forEach(i => {
    const d = i.created_by || 'Unassigned';
    if (!devs[d]) devs[d] = { pending: 0, ongoing: 0, coding: 0, testing: 0, done: 0 };
    if (devs[d][i.status] !== undefined) devs[d][i.status]++;
  });
  if (!Object.keys(devs).length) { el.innerHTML = '<div class="ana-no-data">No data.</div>'; return; }

  const STATUS_CLR = {
    pending: '#9ca3af', ongoing: '#c084fc', coding: '#60a5fa', testing: '#fbbf24', done: '#4ade80',
  };

  const rows = Object.entries(devs)
    .sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))
    .map(([dev, counts]) => {
      const m       = _members[dev] || {};
      const name    = m.displayName || dev;
      const init    = (name.charAt(0) || '?').toUpperCase();
      const total   = Object.values(counts).reduce((s, v) => s + v, 0);
      const avatar  = m.avatarUrl
        ? `<img src="${m.avatarUrl}" class="dlt-avatar" alt="${escHtml(init)}">`
        : `<div class="dlt-avatar dlt-avatar-initial">${escHtml(init)}</div>`;
      const cells   = ['pending','ongoing','coding','testing','done'].map(s =>
        `<td class="ana-dev-stat" style="color:${STATUS_CLR[s]};">${counts[s] || '—'}</td>`
      ).join('');
      return `<tr class="ana-dev-row">
        <td class="ana-dev-name-cell">${avatar}<span>${escHtml(name)}</span></td>
        ${cells}
        <td class="ana-dev-total">${total}</td>
      </tr>`;
    }).join('');

  el.innerHTML = `<table class="ana-dev-table">
    <thead>
      <tr>
        <th>Developer</th>
        <th style="color:#9ca3af">Pending</th>
        <th style="color:#c084fc">Ongoing</th>
        <th style="color:#60a5fa">Coding</th>
        <th style="color:#fbbf24">Testing</th>
        <th style="color:#4ade80">Done</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _renderAnaSpAccuracyChart(items) {
  const el = document.getElementById('anaSpAccuracyChart');
  if (!el) return;

  // Only done items that have both estimated and actual SP
  const comparable = items.filter(i => i.story_points != null && actualSP(i) !== null);
  if (!comparable.length) {
    el.innerHTML = '<div class="ana-no-data">No completed items with both estimated and actual story points.</div>';
    return;
  }

  // SP accuracy distribution buckets (actual / estimated * 100)
  const buckets = [
    { label: '≤50% (way under)',   min: 0,   max: 50,  color: '#60a5fa', count: 0 },
    { label: '51–80% (under)',     min: 51,  max: 80,  color: '#93c5fd', count: 0 },
    { label: '81–120% (on track)', min: 81,  max: 120, color: '#4ade80', count: 0 },
    { label: '121–150% (over)',    min: 121, max: 150, color: '#fb923c', count: 0 },
    { label: '>150% (way over)',   min: 151, max: Infinity, color: '#f87171', count: 0 },
  ];
  comparable.forEach(i => {
    const pct = (actualSP(i) / i.story_points) * 100;
    const b = buckets.find(b => pct >= b.min && pct <= b.max);
    if (b) b.count++;
  });

  const data = buckets.map(b => ({ label: b.label, value: b.count, color: b.color }));
  el.innerHTML = data.some(d => d.value > 0) ? _anaBarRows(data) : '<div class="ana-no-data">No data.</div>';

  // Developer SP summary table
  const devEl = document.getElementById('anaSpDevTable');
  if (!devEl) return;

  const devMap = {};
  items.forEach(i => {
    const d = i.assigned_to || i.created_by || 'Unassigned';
    if (!devMap[d]) devMap[d] = { estSP: 0, actSP: 0, actCount: 0, estCount: 0 };
    if (i.story_points != null) { devMap[d].estSP += i.story_points; devMap[d].estCount++; }
    const asp = actualSP(i);
    if (asp !== null) { devMap[d].actSP += asp; devMap[d].actCount++; }
  });

  const rows = Object.entries(devMap)
    .filter(([, v]) => v.estCount > 0 || v.actCount > 0)
    .sort((a, b) => b[1].actSP - a[1].actSP)
    .map(([dev, v]) => {
      const m      = _members[dev] || {};
      const name   = m.displayName || dev;
      const init   = (name.charAt(0) || '?').toUpperCase();
      const avatar = m.avatarUrl
        ? `<img src="${m.avatarUrl}" class="dlt-avatar" alt="${escHtml(init)}">`
        : `<div class="dlt-avatar dlt-avatar-initial">${escHtml(init)}</div>`;
      const estSP  = v.estCount  ? parseFloat(v.estSP.toFixed(2))  : '—';
      const actSP  = v.actCount  ? v.actSP : '—';
      const acc    = (v.estCount && v.actCount)
        ? Math.round((v.actSP / v.estSP) * 100) + '%' : '—';
      const accCls = (v.estCount && v.actCount)
        ? (v.actSP / v.estSP > 1.2 ? 'color:#fb923c' : v.actSP / v.estSP < 0.8 ? 'color:#60a5fa' : 'color:#4ade80')
        : '';
      return `<tr class="ana-dev-row">
        <td class="ana-dev-name-cell">${avatar}<span>${escHtml(name)}</span></td>
        <td class="ana-dev-stat" style="color:var(--gold);">${estSP !== '—' ? estSP + 'pt' : '—'}</td>
        <td class="ana-dev-stat" style="color:#4ade80;">${actSP !== '—' ? actSP + 'pt' : '—'}</td>
        <td class="ana-dev-stat" style="${accCls};font-weight:600;">${acc}</td>
      </tr>`;
    }).join('');

  devEl.innerHTML = rows.length
    ? `<table class="ana-dev-table">
        <thead><tr>
          <th>Developer</th>
          <th style="color:var(--gold)">Est. SP</th>
          <th style="color:#4ade80">Actual SP</th>
          <th>Accuracy</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
    : '<div class="ana-no-data">No story point data.</div>';
}

/* ══════════════════════════════════════════════════════════════════════════════
   Epics
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Epic systems dropdown (mirrors item sys dropdown with epic- prefix) ── */
function _buildEpicSysChecklist(selectedIds = []) {
  const dropdown = document.getElementById('epicSysMultiDropdown');
  if (!dropdown) return;
  if (!_systems.length) {
    dropdown.innerHTML = '<div class="sys-multi-empty">No systems available.</div>';
    _updateEpicSysLabel([]);
    return;
  }
  dropdown.innerHTML = _systems.map(s => {
    const checked = selectedIds.includes(s.id);
    return `<label class="sys-multi-item${checked ? ' checked' : ''}">
      <input type="checkbox" value="${escHtml(s.id)}" ${checked ? 'checked' : ''}
             onchange="this.closest('.sys-multi-item').classList.toggle('checked',this.checked);_updateEpicSysLabel()">
      <span>${escHtml(s.name)}</span>
    </label>`;
  }).join('');
  _updateEpicSysLabel(selectedIds);
}

function _getSelectedEpicSystemIds() {
  const dropdown = document.getElementById('epicSysMultiDropdown');
  if (!dropdown) return [];
  return Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

function _updateEpicSysLabel(ids) {
  const label = document.getElementById('epicSysMultiLabel');
  if (!label) return;
  const selected = ids !== undefined ? ids : _getSelectedEpicSystemIds();
  if (!selected.length) {
    label.textContent = '— None —';
    label.classList.add('is-placeholder');
    return;
  }
  label.textContent = selected.map(id => _systems.find(s => s.id === id)?.name || id).join(', ');
  label.classList.remove('is-placeholder');
}

function toggleEpicSysDropdown() {
  const dropdown = document.getElementById('epicSysMultiDropdown');
  const wrap     = document.getElementById('epicSysMultiWrap');
  if (!dropdown) return;
  const opening = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', opening);
  wrap?.classList.toggle('is-open', opening);
}

function closeEpicSysDropdown() {
  document.getElementById('epicSysMultiDropdown')?.classList.remove('open');
  document.getElementById('epicSysMultiWrap')?.classList.remove('is-open');
}

/* ── Load epics ── */
async function loadEpics() {
  try {
    const res = await fetch('/api/dev/epics', { headers: authHeaders() });
    if (res.ok) _epics = await res.json();
  } catch { /* non-fatal */ }
}

/* ── Item types ── */
async function loadItemTypes() {
  try {
    const res = await fetch('/api/dev/item-types', { headers: authHeaders() });
    if (res.ok) {
      _itemTypes = await res.json();
      _populateTypeFilter();
    }
  } catch { /* non-fatal */ }
}

function _populateTypeFilter() {
  const sel = document.getElementById('listTypeFilter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Types</option>' +
    _itemTypes.filter(t => t.is_active !== false).map(t =>
      `<option value="${escHtml(t.name)}">${escHtml(t.name)}</option>`
    ).join('');
  if (_itemTypes.some(t => t.name === cur)) sel.value = cur;
}

function onItemTypeChange() {
  const val = document.getElementById('itemType')?.value;
  const t   = _itemTypes.find(t => t.name === val);
  const grp = document.getElementById('itemTypeOthersGroup');
  if (grp) grp.style.display = t?.is_freeform ? '' : 'none';
}

/* ── Item types modal ── */
function openItemTypesModal() {
  document.getElementById('itemTypesModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderItemTypesList();
  setTimeout(() => document.getElementById('newItemTypeName')?.focus(), 60);
}

function closeItemTypesModal() {
  document.getElementById('itemTypesModal')?.classList.remove('open');
  const anyOpen = document.querySelector('.modal-overlay.open:not(#itemTypesModal)');
  if (!anyOpen) document.body.style.overflow = '';
}

function overlayCloseItemTypes(e) {
  if (e.target === document.getElementById('itemTypesModal')) closeItemTypesModal();
}

function renderItemTypesList() {
  const listEl = document.getElementById('itemTypesList');
  if (!listEl) return;
  if (!_itemTypes.length) {
    listEl.innerHTML = '<div class="dlt-empty" style="padding:20px 0;">No types yet. Add one below.</div>';
    return;
  }
  listEl.innerHTML = _itemTypes.map((t, idx) => `
    <div class="itype-row" data-id="${escHtml(t.id)}">
      <div class="itype-order-btns">
        <button class="itype-order-btn" onclick="moveItemType('${escHtml(t.id)}',-1)" title="Move up"${idx === 0 ? ' disabled' : ''}>↑</button>
        <button class="itype-order-btn" onclick="moveItemType('${escHtml(t.id)}',1)" title="Move down"${idx === _itemTypes.length - 1 ? ' disabled' : ''}>↓</button>
      </div>
      <input type="color" class="itype-color-swatch" value="${escHtml(t.color || '#a1a1aa')}" title="Badge color"
        onchange="saveItemTypeColor('${escHtml(t.id)}',this.value)">
      <input class="itype-name-input" type="text" value="${escHtml(t.name)}" maxlength="64"
        onblur="saveItemTypeName('${escHtml(t.id)}',this)"
        onkeydown="if(event.key==='Enter')this.blur();">
      ${t.is_freeform ? '<span class="itype-badge">freeform</span>' : ''}
      <label class="itype-active-label" title="${t.is_active ? 'Active' : 'Inactive'} — click to toggle">
        <input type="checkbox" class="itype-active-cb" ${t.is_active ? 'checked' : ''}
          onchange="toggleItemTypeActive('${escHtml(t.id)}',this.checked)">
        <span class="itype-active-track"></span>
      </label>
      <button class="itype-delete-btn" onclick="deleteItemType('${escHtml(t.id)}')" title="Delete type">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

async function saveItemTypeName(id, inputEl) {
  const name = (inputEl.value || '').trim();
  const t    = _itemTypes.find(t => t.id === id);
  if (!name) { if (t) inputEl.value = t.name; return; }
  if (!t || t.name === name) return;
  try {
    const res = await fetch(`/api/dev/item-types/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const saved = await res.json();
    const idx = _itemTypes.findIndex(t => t.id === id);
    if (idx !== -1) _itemTypes[idx] = saved;
    _populateTypeFilter();
    showToast('Type renamed.');
  } catch (err) {
    if (t) inputEl.value = t.name;
    showToast(`Error: ${err.message}`);
  }
}

async function saveItemTypeColor(id, color) {
  const t = _itemTypes.find(t => t.id === id);
  if (!t || t.color === color) return;
  try {
    const res = await fetch(`/api/dev/item-types/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const saved = await res.json();
    const idx = _itemTypes.findIndex(t => t.id === id);
    if (idx !== -1) _itemTypes[idx] = saved;
    if (_viewMode === 'list') renderListView();
    else renderBoard();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function toggleItemTypeActive(id, isActive) {
  try {
    const res = await fetch(`/api/dev/item-types/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const saved = await res.json();
    const idx = _itemTypes.findIndex(t => t.id === id);
    if (idx !== -1) _itemTypes[idx] = saved;
    _populateTypeFilter();
  } catch (err) {
    showToast(`Error: ${err.message}`);
    renderItemTypesList();
  }
}

async function moveItemType(id, direction) {
  const idx = _itemTypes.findIndex(t => t.id === id);
  if (idx === -1) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= _itemTypes.length) return;
  [_itemTypes[idx], _itemTypes[swapIdx]] = [_itemTypes[swapIdx], _itemTypes[idx]];
  _itemTypes[idx].sort_order     = idx;
  _itemTypes[swapIdx].sort_order = swapIdx;
  renderItemTypesList();
  _populateTypeFilter();
  try {
    await Promise.all([
      fetch(`/api/dev/item-types/${encodeURIComponent(_itemTypes[idx].id)}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: idx }),
      }),
      fetch(`/api/dev/item-types/${encodeURIComponent(_itemTypes[swapIdx].id)}`, {
        method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: swapIdx }),
      }),
    ]);
  } catch (err) {
    showToast(`Order save failed: ${err.message}`);
  }
}

async function deleteItemType(id) {
  const t = _itemTypes.find(t => t.id === id);
  if (!t) return;
  if (!await showConfirm({
    title: 'Delete Type', message: `Delete "${t.name}"?`,
    detail: 'Existing items using this type keep their value but it will no longer appear in the dropdown.',
    confirmText: 'Delete', danger: true,
  })) return;
  try {
    const res = await fetch(`/api/dev/item-types/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _itemTypes = _itemTypes.filter(t => t.id !== id);
    renderItemTypesList();
    _populateTypeFilter();
    showToast('Type deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function addItemType() {
  const nameEl     = document.getElementById('newItemTypeName');
  const freeformEl = document.getElementById('newItemTypeFreeform');
  const colorEl    = document.getElementById('newItemTypeColor');
  const name       = (nameEl?.value || '').trim();
  if (!name) { nameEl?.focus(); return; }
  try {
    const res = await fetch('/api/dev/item-types', {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        sort_order: _itemTypes.length,
        is_active:  true,
        is_freeform: freeformEl?.checked ?? false,
        color:      colorEl?.value || _TYPE_DEFAULT_COLOR,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const created = await res.json();
    _itemTypes.push(created);
    if (nameEl)     nameEl.value = '';
    if (freeformEl) freeformEl.checked = false;
    if (colorEl)    colorEl.value = _TYPE_DEFAULT_COLOR;
    renderItemTypesList();
    _populateTypeFilter();
    showToast('Type added.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

/* ── Epics view ── */
const EPIC_STATUS_LABEL = { planning: 'Planning', active: 'Active', on_hold: 'On Hold', done: 'Done', cancelled: 'Cancelled' };
const EPIC_STATUS_CLS   = { planning: 'es-planning', active: 'es-active', on_hold: 'es-on-hold', done: 'es-done', cancelled: 'es-cancelled' };

function _epicDevAvatarStack(usernames, max) {
  if (!usernames.length) return '';
  const shown = usernames.slice(0, max);
  const extra = usernames.length - shown.length;
  const avatars = shown.map(u => {
    const m    = _members[u] || {};
    const name = m.displayName || u;
    const init = (name.charAt(0) || '?').toUpperCase();
    return m.avatarUrl
      ? `<img src="${escHtml(m.avatarUrl)}" class="epic-dev-avatar" title="${escHtml(name)}" alt="${escHtml(init)}">`
      : `<div class="epic-dev-avatar epic-dev-avatar-init" title="${escHtml(name)}">${escHtml(init)}</div>`;
  }).join('');
  const extraHtml = extra > 0
    ? `<div class="epic-dev-avatar epic-dev-avatar-more" title="${extra} more developer${extra !== 1 ? 's' : ''}">+${extra}</div>`
    : '';
  return `<div class="epic-dev-stack">${avatars}${extraHtml}</div>`;
}

function _epicCardHtml(e) {
  const sysIds     = Array.isArray(e.system_ids) ? e.system_ids : [];
  const sysNames   = sysIds.map(id => _systems.find(s => s.id === id)?.name).filter(Boolean);
  const epicItems  = _items.filter(i => i.epic_id === e.epic_id);
  const itemCount  = epicItems.length;
  const cls = EPIC_STATUS_CLS[e.epic_status] || 'es-planning';
  const lbl = EPIC_STATUS_LABEL[e.epic_status] || e.epic_status;

  const devUsernames = [...new Set(epicItems.map(i => i.assigned_to || i.created_by).filter(Boolean))];
  const devStack     = _epicDevAvatarStack(devUsernames, 4);

  const spItems = epicItems.filter(i => i.story_points != null);
  const totalSP = spItems.length ? parseFloat(spItems.reduce((s, i) => s + i.story_points, 0).toFixed(2)) : 0;
  const spHtml  = spItems.length
    ? `<span class="epic-card-sp"><span class="epic-card-sp-sigma">∑</span>${totalSP}<span class="epic-card-sp-unit">pt</span></span>`
    : '';

  return `<div class="epic-card" onclick="openEpicPage('${escHtml(e.epic_id)}')">
    <div class="epic-card-top">
      <button class="epic-status-badge ${cls} epic-status-btn" onclick="openEpicStatusMenu(event,'${escHtml(e.epic_id)}')" title="Change status">${escHtml(lbl)}<svg class="epic-status-caret" xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
      ${e.epic_code ? `<span class="epic-card-code">${escHtml(e.epic_code)}</span>` : ''}
      ${!e.is_active ? '<span class="epic-inactive-badge">Inactive</span>' : ''}
    </div>
    <div class="epic-card-name">${escHtml(e.epic_name)}</div>
    ${e.epic_description ? `<div class="epic-card-desc">${escHtml(_descPreview(e.epic_description, 100))}</div>` : ''}
    ${sysNames.length ? `<div class="epic-card-sys">${sysNames.map(n => `<span class="kcard-system-tag">${escHtml(n)}</span>`).join('')}</div>` : ''}
    <div class="epic-card-footer">
      <div class="epic-card-footer-left">
        <span class="epic-card-item-count">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          ${itemCount} item${itemCount !== 1 ? 's' : ''}
        </span>
        ${spHtml}
      </div>
      <div class="epic-card-footer-right">
        ${devStack}
        <span class="epic-card-date">${fmtDate(e.date_created)}</span>
      </div>
    </div>
  </div>`;
}

function _renderEpicSection(sectionId, gridId, countId, epics) {
  const section = document.getElementById(sectionId);
  const grid    = document.getElementById(gridId);
  const countEl = document.getElementById(countId);
  if (!section || !grid) return;
  if (!epics.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  if (countEl) countEl.textContent = epics.length;
  grid.innerHTML = epics.map(_epicCardHtml).join('');
}

function renderEpicsView() {
  if (_viewMode !== 'epics') return;

  const search  = (document.getElementById('epicSearch')?.value  || '').toLowerCase().trim();
  const statusF = document.getElementById('epicStatusFilter')?.value || '';

  let epics = _epics.slice();
  if (search)  epics = epics.filter(e => (e.epic_name || '').toLowerCase().includes(search) || (e.epic_description || '').toLowerCase().includes(search) || (e.epic_code || '').toLowerCase().includes(search));
  if (statusF) epics = epics.filter(e => e.epic_status === statusF);

  const countEl = document.getElementById('epicCount');
  if (countEl) countEl.textContent = `${epics.length} epic${epics.length !== 1 ? 's' : ''}`;

  const active = epics.filter(e => e.epic_status === 'active');
  const done   = epics.filter(e => e.epic_status === 'done' || e.epic_status === 'cancelled');
  const other  = epics.filter(e => !['active', 'done', 'cancelled'].includes(e.epic_status));

  _renderEpicSection('epicActiveSection', 'epicActiveGrid', 'epicActiveCount', active);
  _renderEpicSection('epicOtherSection',  'epicOtherGrid',  'epicOtherCount',  other);
  _renderEpicSection('epicDoneSection',   'epicDoneGrid',   'epicDoneCount',   done);

  const emptyEl = document.getElementById('epicEmptyState');
  if (emptyEl) emptyEl.style.display = epics.length ? 'none' : '';
}

/* ── Epic quick-status menu ── */
let _epicStatusMenuId = null;

function openEpicStatusMenu(event, epicId) {
  event.stopPropagation();

  const existing = document.getElementById('epicStatusMenu');
  if (existing && _epicStatusMenuId === epicId) {
    closeEpicStatusMenu();
    return;
  }
  closeEpicStatusMenu();

  _epicStatusMenuId = epicId;
  const epic = _epics.find(e => e.epic_id === epicId);
  if (!epic) return;

  const menu = document.createElement('div');
  menu.id = 'epicStatusMenu';
  menu.className = 'epic-status-menu';
  menu.innerHTML = Object.entries(EPIC_STATUS_LABEL).map(([val, lbl]) => `
    <button class="epic-status-menu-item ${val === epic.epic_status ? 'is-current' : ''}" onclick="quickChangeEpicStatus('${epicId}','${val}',event)">
      <span class="epic-status-menu-dot ${EPIC_STATUS_CLS[val]}"></span>${lbl}
      ${val === epic.epic_status ? '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </button>`).join('');

  document.body.appendChild(menu);

  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menuW = 160;
  let left = rect.left + window.scrollX;
  let top  = rect.bottom + window.scrollY + 4;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;

  requestAnimationFrame(() => menu.classList.add('is-open'));
  setTimeout(() => document.addEventListener('click', _epicStatusMenuOutside, { once: true }), 0);
}

function _epicStatusMenuOutside(e) {
  const menu = document.getElementById('epicStatusMenu');
  if (menu && !menu.contains(e.target)) closeEpicStatusMenu();
}

function closeEpicStatusMenu() {
  const menu = document.getElementById('epicStatusMenu');
  if (menu) menu.remove();
  _epicStatusMenuId = null;
  document.removeEventListener('click', _epicStatusMenuOutside);
}

async function quickChangeEpicStatus(epicId, newStatus, event) {
  if (event) event.stopPropagation();
  closeEpicStatusMenu();

  const epic = _epics.find(e => e.epic_id === epicId);
  if (!epic || epic.epic_status === newStatus) return;

  const prev = epic.epic_status;
  epic.epic_status = newStatus;
  renderEpicsView();
  if (_epicPageId === epicId) _populateEpicPage(epic);

  try {
    const res = await fetch(`/api/dev/epics/${encodeURIComponent(epicId)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ epic_status: newStatus }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
    const saved = await res.json();
    const idx = _epics.findIndex(e => e.epic_id === epicId);
    if (idx !== -1) _epics[idx] = saved;
    renderEpicsView();
    if (_epicPageId === epicId) _populateEpicPage(saved);
    showToast(`Epic status → ${EPIC_STATUS_LABEL[newStatus] || newStatus}`);
  } catch (err) {
    epic.epic_status = prev;
    renderEpicsView();
    if (_epicPageId === epicId) _populateEpicPage(epic);
    showToast(`Failed: ${err.message}`);
  }
}

/* ── Epic detail modal ── */
function openEpicModal(epicIdOrNull) {
  const epic = epicIdOrNull ? _epics.find(e => e.epic_id === epicIdOrNull) : null;
  _editingEpicId = epic?.epic_id ?? null;

  document.getElementById('epicModalTitle').textContent = epic ? 'Edit Epic' : 'New Epic';
  document.getElementById('epicModalMeta').textContent  = epic
    ? `Created ${fmtDate(epic.date_created)}`
    : 'Fill in the details below';
  document.getElementById('epicName').value   = epic?.epic_name        ?? '';
  document.getElementById('epicStatus').value = epic?.epic_status      ?? 'planning';
  document.getElementById('epicDesc').value   = epic?.epic_description ?? '';
  document.getElementById('epicIsActive').checked = epic?.is_active !== false;

  _buildEpicSysChecklist(Array.isArray(epic?.system_ids) ? epic.system_ids : []);

  const deleteBtn  = document.getElementById('epicDeleteBtn');
  const addItemBtn = document.getElementById('epicAddItemBtn');
  const itemsList  = document.getElementById('epicItemsList');
  const countEl    = document.getElementById('epicItemsCount');

  if (epic) {
    if (deleteBtn)  deleteBtn.style.display  = '';
    if (addItemBtn) addItemBtn.style.display = '';
    if (itemsList)  itemsList.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
    if (countEl)    countEl.textContent = '';
    _refreshEpicItems(epic.epic_id);
  } else {
    if (deleteBtn)  deleteBtn.style.display  = 'none';
    if (addItemBtn) addItemBtn.style.display = 'none';
    if (itemsList)  itemsList.innerHTML = '<div class="dlt-empty">Save the epic first to link items.</div>';
    if (countEl)    countEl.textContent = '';
  }

  _resetEpicForm();
  document.getElementById('epicDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('epicName').focus(), 60);
}

function closeEpicModal() {
  closeEpicSysDropdown();
  document.getElementById('epicDetailModal').classList.remove('open');
  const anyOpen = document.querySelector('.modal-overlay.open:not(#epicDetailModal)');
  if (!anyOpen) document.body.style.overflow = '';
  _editingEpicId   = null;
  _addItemToEpicId = null;
}

function overlayCloseEpic(e) {
  if (e.target === document.getElementById('epicDetailModal')) closeEpicModal();
}

function _resetEpicForm() {
  document.getElementById('epicFormLoading').style.display = 'none';
  document.getElementById('epicFormError').style.display   = 'none';
  document.getElementById('epicSaveBtn').disabled          = false;
}

async function _refreshEpicItems(epicId) {
  const listEl   = document.getElementById('epicItemsList');
  const countEl  = document.getElementById('epicItemsCount');
  if (!listEl) return;
  try {
    const res = await fetch(`/api/dev/epics/${encodeURIComponent(epicId)}/items`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const items = await res.json();
    items.forEach(item => { if (!_items.find(i => i.id === item.id)) _items.push(item); });
    if (countEl) countEl.textContent = items.length || '';
    listEl.innerHTML = items.length
      ? items.map(item => _renderEpicItemRow(item)).join('')
      : '<div class="dlt-empty">No items linked to this epic yet.</div>';
  } catch (err) {
    listEl.innerHTML = `<div class="admin-error" style="margin:8px;">${escHtml(err.message)}</div>`;
  }
}

function _renderEpicItemRow(item) {
  const statusCls = {
    pending: 'dp-s-pending', ongoing: 'dp-s-ongoing', coding: 'dp-s-coding',
    testing: 'dp-s-testing', done: 'dp-s-done',
  }[item.status] || '';

  const overdue = item.estimated_end_date && !item.actual_end_date &&
    new Date(item.estimated_end_date + 'T00:00:00') < new Date();

  const assignee = item.assigned_to || item.created_by;
  const m        = _members[assignee] || {};
  const devName  = m.displayName || assignee || '';
  const initial  = (devName.charAt(0) || '?').toUpperCase();
  const avatarHtml = m.avatarUrl
    ? `<img src="${escHtml(m.avatarUrl)}" class="epic-item-avatar" alt="${escHtml(initial)}">`
    : `<div class="epic-item-avatar epic-item-avatar-initial">${escHtml(initial)}</div>`;

  const elapsed = daysElapsed(item);
  let dateHtml = '';
  if (item.actual_end_date) {
    dateHtml = `<span class="epic-item-date epic-item-date--done">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Done ${fmtDate(item.actual_end_date)}</span>`;
  } else if (item.estimated_end_date) {
    dateHtml = `<span class="epic-item-date${overdue ? ' epic-item-date--overdue' : ''}">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${overdue ? 'Overdue · ' : 'Due '}${fmtDate(item.estimated_end_date)}</span>`;
  } else if (elapsed !== null) {
    dateHtml = `<span class="epic-item-date">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      ${elapsed}d elapsed</span>`;
  }

  const isSel = _selectedIds.has(item.id);
  return `<div class="epic-item-row${isSel ? ' dlt-selected' : ''}" data-item-id="${escHtml(item.id)}" onclick="openItemFromEpic('${escHtml(item.id)}')">
    <label class="epic-item-cb-wrap" onclick="event.stopPropagation()">
      <input type="checkbox" class="dlt-cb" ${isSel ? 'checked' : ''} onchange="toggleSelectItem('${escHtml(item.id)}', this.checked)">
    </label>
    <div class="epic-item-main">
      <div class="epic-item-top">
        ${item.dev_item_code ? `<span class="epic-item-code">${escHtml(item.dev_item_code)}</span>` : ''}
        <span class="epic-item-title">${escHtml(item.title)}</span>
        ${item.is_parked ? '<span class="epic-item-parked">Parked</span>' : ''}
      </div>
      <div class="epic-item-meta">
        ${typeBadge(item.dev_item_type)}
        ${devName ? `<span class="epic-item-assignee">${avatarHtml}<span>${escHtml(devName)}</span></span>` : ''}
        ${item.story_points != null ? `<span class="epic-item-sp">${item.story_points}pt</span>` : ''}
        ${dateHtml}
      </div>
    </div>
    <span class="dp-item-status ${statusCls}">${escHtml(item.status)}</span>
  </div>`;
}

async function saveEpic() {
  const name = document.getElementById('epicName').value.trim();
  if (!name) {
    document.getElementById('epicFormError').textContent   = 'Epic name is required.';
    document.getElementById('epicFormError').style.display = '';
    return;
  }

  const wasNew = !_editingEpicId;
  const payload = {
    epic_name:        name,
    epic_status:      document.getElementById('epicStatus').value,
    epic_description: document.getElementById('epicDesc').value.trim() || null,
    system_ids:       _getSelectedEpicSystemIds(),
    is_active:        document.getElementById('epicIsActive').checked,
  };

  document.getElementById('epicFormLoading').style.display = '';
  document.getElementById('epicSaveBtn').disabled          = true;
  document.getElementById('epicFormError').style.display   = 'none';

  try {
    let res;
    if (_editingEpicId) {
      res = await fetch(`/api/dev/epics/${encodeURIComponent(_editingEpicId)}`, {
        method:  'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/dev/epics', {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();

    if (wasNew) {
      _epics.unshift(saved);
      _editingEpicId = saved.epic_id;
      document.getElementById('epicModalTitle').textContent  = 'Edit Epic';
      document.getElementById('epicModalMeta').textContent   = `Created ${fmtDate(saved.date_created)}`;
      document.getElementById('epicDeleteBtn').style.display  = '';
      document.getElementById('epicAddItemBtn').style.display = '';
      document.getElementById('epicItemsList').innerHTML      = '<div class="dlt-empty">No items linked to this epic yet.</div>';
    } else {
      const idx = _epics.findIndex(e => e.epic_id === saved.epic_id);
      if (idx !== -1) _epics[idx] = saved;
      _refreshEpicItems(saved.epic_id);
      if (_epicPageId === saved.epic_id) _populateEpicPage(saved);
    }

    // Refresh epic select in item form if it's open
    const epicSel = document.getElementById('itemEpic');
    if (epicSel) {
      const curVal = epicSel.value;
      epicSel.innerHTML = '<option value="">— None —</option>' +
        _epics.filter(e => e.is_active !== false).map(e =>
          `<option value="${escHtml(e.epic_id)}">${escHtml(e.epic_name)}</option>`
        ).join('');
      epicSel.value = curVal;
    }

    renderEpicsView();
    showToast(`Epic ${wasNew ? 'created' : 'updated'}.`);
  } catch (err) {
    document.getElementById('epicFormError').textContent   = err.message;
    document.getElementById('epicFormError').style.display = '';
  } finally {
    document.getElementById('epicFormLoading').style.display = 'none';
    document.getElementById('epicSaveBtn').disabled          = false;
  }
}

async function deleteEpicFromDetail() {
  if (!_editingEpicId) return;
  const epic = _epics.find(e => e.epic_id === _editingEpicId);
  if (!await showConfirm({
    title:       'Delete Epic',
    message:     `Delete "${epic?.epic_name || 'this epic'}"?`,
    detail:      'Linked dev items will be unlinked. This cannot be undone.',
    confirmText: 'Delete',
    danger:      true,
  })) return;
  const id = _editingEpicId;
  closeEpicModal();
  try {
    const res = await fetch(`/api/dev/epics/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _epics = _epics.filter(e => e.epic_id !== id);
    _items.forEach(i => { if (i.epic_id === id) i.epic_id = null; });
    renderEpicsView();
    showToast('Epic deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function addItemToEpicModal() {
  if (!_editingEpicId) return;
  _addItemToEpicId = _editingEpicId;
  openDetailModal(null);
}

function openItemFromEpic(itemId) {
  if (_lassoDragged) return;
  openDetailModal(itemId);
  // Ensure item detail modal floats above epic modal
  const detailModal = document.getElementById('itemDetailModal');
  if (detailModal) detailModal.style.zIndex = '1100';
}

/* ══════════════════════════════════════════════════════════════════════════════
   Epic Detail Page
   ══════════════════════════════════════════════════════════════════════════════ */

function openEpicPage(epicId, { pushState = true } = {}) {
  const epic = _epics.find(e => e.epic_id === epicId);
  if (!epic) return;
  _epicPageId    = epicId;
  _epicPageItems = [];
  _populateEpicPage(epic);
  document.getElementById('devEpicsView').style.display = 'none';
  document.getElementById('epicPageView').style.display = '';
  _loadEpicPageItems(epicId);
  if (pushState) {
    const url = new URL(window.location.href);
    url.searchParams.set('epic', epicId);
    history.pushState({ epic: epicId }, '', url.toString());
  }
}

function closeEpicPage() {
  _epicPageId    = null;
  _epicPageItems = [];
  document.getElementById('epicPageView').style.display  = 'none';
  document.getElementById('devEpicsView').style.display  = '';
  renderEpicsView();
  const url = new URL(window.location.href);
  url.searchParams.delete('epic');
  history.pushState({}, '', url.toString());
}

function shareEpicPage() {
  if (!_epicPageId) return;
  const url = new URL(window.location.href);
  url.searchParams.set('epic', _epicPageId);
  navigator.clipboard.writeText(url.toString()).then(() => {
    showToast('Epic link copied to clipboard.');
  }).catch(() => {
    showToast('Copy failed — link: ' + url.toString(), 'error');
  });
}

function _populateEpicPage(epic) {
  const cls = EPIC_STATUS_CLS[epic.epic_status] || 'es-planning';
  const lbl = EPIC_STATUS_LABEL[epic.epic_status] || epic.epic_status;

  const titleEl = document.getElementById('epicPageTitle');
  if (titleEl) titleEl.textContent = epic.epic_name || '';

  const codeEl = document.getElementById('epicPageCode');
  if (codeEl) { codeEl.textContent = epic.epic_code || ''; codeEl.style.display = epic.epic_code ? '' : 'none'; }

  const statusEl = document.getElementById('epicPageStatus');
  if (statusEl) { statusEl.textContent = lbl; statusEl.className = `epic-status-badge ${cls}`; }

  const activeEl = document.getElementById('epicPageActiveFlag');
  if (activeEl) activeEl.style.display = epic.is_active !== false ? 'none' : '';

  const descEl = document.getElementById('epicPageDesc');
  if (descEl) {
    if (epic.epic_description) { descEl.innerHTML = epic.epic_description; descEl.style.display = ''; }
    else                        { descEl.style.display = 'none'; }
  }

  const dateEl = document.getElementById('epicPageDate');
  if (dateEl) dateEl.textContent = `Created ${fmtDate(epic.date_created)}`;

  const sysEl = document.getElementById('epicPageSystems');
  if (sysEl) {
    const sysIds   = Array.isArray(epic.system_ids) ? epic.system_ids : [];
    const sysNames = sysIds.map(id => _systems.find(s => s.id === id)?.name).filter(Boolean);
    sysEl.innerHTML = sysNames.map(n => `<span class="kcard-system-tag">${escHtml(n)}</span>`).join('');
  }

  const teamRowEl = document.getElementById('epicPageTeamRow');
  const devsEl    = document.getElementById('epicPageDevs');
  const spEl      = document.getElementById('epicPageTotalSP');
  if (teamRowEl) teamRowEl.style.display = 'none';
  if (devsEl)    { devsEl.innerHTML = ''; devsEl.style.display = 'none'; }
  if (spEl)      { spEl.innerHTML = '';   spEl.style.display = 'none'; }
}

function _updateEpicPageProgress() {
  const total = _epicPageItems.length;
  const done  = _epicPageItems.filter(i => i.status === 'done').length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const fillEl = document.getElementById('epicPageProgressFill');
  const textEl = document.getElementById('epicPageProgressText');
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (textEl) textEl.textContent = total ? `${done} / ${total} done (${pct}%)` : 'No items yet';

  const teamRowEl = document.getElementById('epicPageTeamRow');
  const devsEl    = document.getElementById('epicPageDevs');
  const spEl      = document.getElementById('epicPageTotalSP');

  const devUsernames = [...new Set(_epicPageItems.map(i => i.assigned_to || i.created_by).filter(Boolean))];
  if (devsEl) {
    if (devUsernames.length) {
      devsEl.innerHTML = `
        <span class="epic-page-team-label">Team</span>
        <div class="epic-page-dev-list">
          ${devUsernames.map(u => {
            const m    = _members[u] || {};
            const name = m.displayName || u;
            const init = (name.charAt(0) || '?').toUpperCase();
            const avatar = m.avatarUrl
              ? `<img src="${escHtml(m.avatarUrl)}" class="epic-dev-avatar epic-dev-avatar-lg" alt="${escHtml(init)}">`
              : `<div class="epic-dev-avatar epic-dev-avatar-lg epic-dev-avatar-init">${escHtml(init)}</div>`;
            return `<span class="epic-page-dev-chip">${avatar}<span class="epic-page-dev-name">${escHtml(name)}</span></span>`;
          }).join('')}
        </div>`;
      devsEl.style.display = '';
    } else {
      devsEl.innerHTML = '';
      devsEl.style.display = 'none';
    }
  }

  const spItems = _epicPageItems.filter(i => i.story_points != null);
  if (spEl) {
    if (spItems.length) {
      const totalSP = parseFloat(spItems.reduce((s, i) => s + i.story_points, 0).toFixed(2));
      spEl.innerHTML = `<span class="epic-page-sp-sigma">∑</span><span class="epic-page-sp-val">${totalSP}</span><span class="epic-page-sp-unit">pt total</span>`;
      spEl.style.display = '';
    } else {
      spEl.innerHTML = '';
      spEl.style.display = 'none';
    }
  }

  if (teamRowEl) teamRowEl.style.display = (devUsernames.length || spItems.length) ? '' : 'none';
}

async function _loadEpicPageItems(epicId) {
  const tbody   = document.getElementById('epicPageItemsBody');
  const countEl = document.getElementById('epicPageItemCount');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11" class="dlt-empty">Loading…</td></tr>';
  try {
    const res = await fetch(`/api/dev/epics/${encodeURIComponent(epicId)}/items`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _epicPageItems = await res.json();
    _epicPageItems.forEach(item => {
      const idx = _items.findIndex(i => i.id === item.id);
      if (idx !== -1) _items[idx] = item; else _items.push(item);
    });
    if (countEl) countEl.textContent = _epicPageItems.length || '';
    _updateEpicPageProgress();
    renderEpicPageItems();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="dlt-empty">${escHtml(err.message)}</td></tr>`;
  }
}

function renderEpicPageItems() {
  const tbody = document.getElementById('epicPageItemsBody');
  if (!tbody) return;
  const search  = (document.getElementById('epicPageSearch')?.value || '').toLowerCase().trim();
  const statusF = document.getElementById('epicPageStatusFilter')?.value || '';

  let items = _epicPageItems.slice();
  if (search)  items = items.filter(i => (i.title || '').toLowerCase().includes(search) || (i.dev_item_code || '').toLowerCase().includes(search));
  if (statusF) items = items.filter(i => i.status === statusF);

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="dlt-empty">${_epicPageItems.length ? 'No items match filters.' : 'No items linked to this epic yet.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(_renderEpicPageRow).join('');
}

function _renderEpicPageRow(item) {
  const statusCls = {
    pending: 'dp-s-pending', ongoing: 'dp-s-ongoing', coding: 'dp-s-coding',
    testing: 'dp-s-testing', done: 'dp-s-done',
  }[item.status] || '';

  const overdue  = item.estimated_end_date && !item.actual_end_date &&
    new Date(item.estimated_end_date + 'T00:00:00') < new Date();
  const assignee = item.assigned_to || item.created_by;
  const m        = _members[assignee] || {};
  const devName  = m.displayName || assignee || '';
  const sysIds   = _parseSystemIds(item);
  const sysName  = sysIds.length ? (_systems.find(s => s.id === sysIds[0])?.name || '') : '';
  const elapsed  = daysElapsed(item);

  const isSel = _selectedIds.has(item.id);
  return `<tr class="dlt-row${isSel ? ' dlt-selected' : ''}" data-item-id="${escHtml(item.id)}" onclick="openDetailModal('${escHtml(item.id)}')">
    <td class="dlt-td dlt-cb-cell" onclick="event.stopPropagation()">
      <input type="checkbox" class="dlt-cb" ${isSel ? 'checked' : ''} onchange="toggleSelectItem('${escHtml(item.id)}', this.checked)">
    </td>
    <td class="dlt-td dlt-th-code">${item.dev_item_code ? `<span class="epic-item-code">${escHtml(item.dev_item_code)}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
    <td class="dlt-td dlt-th-title">
      <span>${escHtml(item.title)}</span>
      ${item.is_parked ? '<span class="epic-item-parked" style="margin-left:6px;">Parked</span>' : ''}
    </td>
    <td class="dlt-td">${typeBadge(item.dev_item_type)}</td>
    <td class="dlt-td"><span class="dp-item-status ${statusCls}">${escHtml(item.status)}</span></td>
    <td class="dlt-td" style="font-size:12.5px;color:var(--text-secondary);">${devName ? escHtml(devName) : '<span style="color:var(--text-muted);">—</span>'}</td>
    <td class="dlt-td" style="color:var(--text-muted);font-size:12px;">${item.date_started ? fmtDate(item.date_started) : '—'}</td>
    <td class="dlt-td" style="color:${overdue ? '#f87171' : 'var(--text-muted)'};font-size:12px;">${item.estimated_end_date ? fmtDate(item.estimated_end_date) : '—'}</td>
    <td class="dlt-td">${_spCell(item)}</td>
    <td class="dlt-td" style="color:var(--text-muted);font-size:12px;">${elapsed !== null ? `${elapsed}d` : '—'}</td>
    <td class="dlt-td">${sysName ? `<span class="kcard-system-tag" style="font-size:11px;">${escHtml(sysName)}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
  </tr>`;
}

function addItemToEpicPage() {
  if (!_epicPageId) return;
  _addItemToEpicId = _epicPageId;
  openDetailModal(null);
}

function editCurrentEpic() {
  if (!_epicPageId) return;
  openEpicModal(_epicPageId);
}

async function deleteCurrentEpic() {
  if (!_epicPageId) return;
  const id   = _epicPageId;
  const epic = _epics.find(e => e.epic_id === id);
  if (!await showConfirm({
    title:       'Delete Epic',
    message:     `Delete "${epic?.epic_name || 'this epic'}"?`,
    detail:      'Linked dev items will be unlinked. This cannot be undone.',
    confirmText: 'Delete',
    danger:      true,
  })) return;
  closeEpicPage();
  try {
    const res = await fetch(`/api/dev/epics/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _epics = _epics.filter(e => e.epic_id !== id);
    _items.forEach(i => { if (i.epic_id === id) i.epic_id = null; });
    renderEpicsView();
    showToast('Epic deleted.');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}
