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

/* ── State ── */
let _items       = [];
let _systems     = [];
let _editingId   = null;
let _loggingId   = null;
let _draggingId  = null;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = loadSession();
  if (!session || !session.username || (!session.isDeveloper && !session.isAdmin)) {
    location.href = '/';
    return;
  }
  document.getElementById('devUsername').textContent = session.firstName || session.username;
  loadSystems().then(() => loadItems());

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeItemModal(); closeLogModal(); closeAddSystemModal(); }
  });
});

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
  STATUSES.forEach(status => {
    const col   = document.getElementById(`cards-${status}`);
    const items = _items.filter(i => i.status === status);
    document.getElementById(`count-${status}`).textContent = items.length;
    col.innerHTML = items.length
      ? items.map(renderCard).join('')
      : `<div class="kanban-empty">No items</div>`;
  });
}

function renderCard(item) {
  const elapsed    = daysElapsed(item);
  const overdue    = item.estimated_end_date && !item.actual_end_date &&
                     new Date(item.estimated_end_date + 'T00:00:00') < new Date();
  const statusIdx  = STATUSES.indexOf(item.status);

  const sysLabel = systemName(item.system_id);
  return `<div class="kanban-card" id="card-${escHtml(item.id)}"
               draggable="true"
               ondragstart="onDragStart(event,'${escHtml(item.id)}')"
               ondragend="onDragEnd(event)">
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
      <span class="kcard-author">${escHtml(item.created_by)}</span>
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

/* ── Drag and drop ── */
function onDragStart(e, id) {
  _draggingId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById(`card-${id}`);
    if (el) el.classList.add('dragging');
  }, 0);
}
function onDragEnd(e) {
  if (_draggingId) {
    const el = document.getElementById(`card-${_draggingId}`);
    if (el) el.classList.remove('dragging');
  }
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  _draggingId = null;
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.currentTarget;
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  col.classList.add('drag-over');
}
async function onDrop(e, newStatus) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  if (!_draggingId) return;
  const id   = _draggingId;
  const item = _items.find(i => i.id === id);
  if (!item || item.status === newStatus) return;
  await moveItem(id, newStatus);
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
