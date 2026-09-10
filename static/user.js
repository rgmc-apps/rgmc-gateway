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
function _hexToRgba(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(107,114,128,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(107,114,128,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
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
let _wsIssStatus        = 'all';
let _taskEditId         = null;
let _activeTab          = 'issues';
let _currentIssue       = null;
let _utAssigneeOpen     = false;
let _utViewMode         = 'kanban';

let _utStatuses = [];

function _utStatusSlugs()   { return _utStatuses.map(s => s.slug); }
function _utIsTerminal(slug){ return !!_utStatuses.find(s => s.slug === slug)?.is_terminal; }
function _utStatusLabel(slug){ return _utStatuses.find(s => s.slug === slug)?.label ?? slug; }
function _utStatusColor(slug){ return _utStatuses.find(s => s.slug === slug)?.color ?? '#6b7280'; }
function _utInitialStatus() { return _utStatuses.find(s => s.is_initial) ?? _utStatuses[0]; }

const _UT_DEFAULT_STATUSES = [
  { slug: 'open',    label: 'Open',    color: '#6b7280', sort_order: 0, is_initial: true,  is_terminal: false, is_system: true },
  { slug: 'ongoing', label: 'Ongoing', color: '#f59e0b', sort_order: 1, is_initial: false, is_terminal: false, is_system: true },
  { slug: 'done',    label: 'Done',    color: '#22c55e', sort_order: 2, is_initial: false, is_terminal: true,  is_system: true },
];

let _utCfgStatusesCache = [];
let _utCfgStatusEditId  = null;

/* ── Tab switching ── */
function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('[data-main-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mainTab === tab);
  });
  ['issues', 'team', 'tasks', 'config'].forEach(t => {
    const panel = document.getElementById(`ws-panel-${t}`);
    if (!panel) return;
    panel.classList.toggle('ws-active', t === tab);
    panel.style.display = '';
  });
  if (tab === 'issues' && _issues[_issueSubtab] === null) loadIssues(_issueSubtab);
  if (tab === 'team') { if (_teamMembers !== null) renderTeam(_teamMembers); else loadTeam(); }
  if (tab === 'tasks') { if (_utStatuses.length === 0) { loadUtStatuses().then(() => loadTasks()); } else if (_tasks.length === 0) { loadTasks(); } if (_teamMembers === null) _ensureTeamMembersLoaded(); }
  if (tab === 'config') loadWsConfig();
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
  if (_issues[subtab] === null) {
    loadIssues(subtab);
  } else {
    _wsPopulateCompanyFilter(_issues[subtab]);
    wsIssApplyFilters();
  }
}

function wsIssSwitchStatus(status) {
  _wsIssStatus = status;
  document.querySelectorAll('#wsIssueStatusTabs .status-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.wsStatus === status)
  );
  wsIssApplyFilters();
}

function wsIssApplyFilters() {
  const search   = (document.getElementById('wsIssFilterSearch')?.value   || '').toLowerCase().trim();
  const from     = document.getElementById('wsIssFilterFrom')?.value   || '';
  const to       = document.getElementById('wsIssFilterTo')?.value     || '';
  const priority = document.getElementById('wsIssFilterPriority')?.value || '';
  const company  = document.getElementById('wsIssFilterCompany')?.value  || '';
  const clearBtn = document.getElementById('wsIssFilterSearchClear');
  if (clearBtn) clearBtn.style.display = search ? '' : 'none';

  const all = _issues[_issueSubtab] || [];
  _wsRenderIssueKpis(all);

  let baseFiltered = [...all];
  if (search) baseFiltered = baseFiltered.filter(i =>
    (i.ticket_number || '').toLowerCase().includes(search) ||
    (i.title         || '').toLowerCase().includes(search) ||
    (i.description   || '').toLowerCase().includes(search) ||
    (i.employee_name || '').toLowerCase().includes(search) ||
    (i.company_name  || '').toLowerCase().includes(search)
  );
  if (from)     baseFiltered = baseFiltered.filter(i => i.created_at && i.created_at.slice(0,10) >= from);
  if (to)       baseFiltered = baseFiltered.filter(i => i.created_at && i.created_at.slice(0,10) <= to);
  if (priority) baseFiltered = baseFiltered.filter(i => (i.priority || '').toLowerCase() === priority);
  if (company)  baseFiltered = baseFiltered.filter(i => i.company_name === company);

  const openRows = baseFiltered.filter(i => ['new', 'open'].includes(i.status));
  renderOpenIssuesTable(openRows);

  let rows = _wsIssStatus === 'all'
    ? baseFiltered
    : baseFiltered.filter(i => i.status === _wsIssStatus);

  renderIssueList(_issueSubtab, rows, true);
  _wsRenderIssueAnalytics(rows);
}

function renderOpenIssuesTable(openIssues) {
  const section = document.getElementById('wsOpenIssuesSection');
  const badge   = document.getElementById('wsOpenIssBadge');
  const tbody   = document.getElementById('wsOpenIssTableBody');
  if (!section || !tbody) return;

  const count = openIssues.length;
  if (badge) badge.textContent = count;

  if (count === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const STATUS_LABEL = { new: 'New', open: 'Open' };
  tbody.innerHTML = openIssues.map(iss => {
    const id      = escHtml(iss.id);
    const ticket  = escHtml(iss.ticket_number || '—');
    const title   = escHtml(iss.title || iss.description || '(No title)');
    const status  = iss.status || 'new';
    const slabel  = STATUS_LABEL[status] || escHtml(status);
    const prioHtml = prioBadgeHtml(iss.priority);
    const reporter = escHtml(iss.employee_name || '—');
    const cat     = escHtml(iss.request_category || '—');
    const assignee = iss.assigned_to
      ? `<span class="open-iss-assignee">${escHtml(iss.assigned_to)}</span>`
      : '<span class="open-iss-unassigned">Unassigned</span>';
    const date    = escHtml(fmtDate(iss.created_at));
    return `<tr class="open-iss-row" onclick="openIssueDetailById('${id}')" title="View issue">
      <td class="dlt-td open-iss-col-ticket"><span class="open-iss-ticket">${ticket}</span></td>
      <td class="dlt-td open-iss-col-title">
        <span class="open-iss-title-text">${title}</span>
        <span class="iss-badge ${issueBadgeClass(status)} open-iss-status-badge">${slabel}</span>
      </td>
      <td class="dlt-td">${prioHtml || '<span class="open-iss-noprio">—</span>'}</td>
      <td class="dlt-td open-iss-col-reporter">${reporter}</td>
      <td class="dlt-td open-iss-col-cat">${cat}</td>
      <td class="dlt-td">${assignee}</td>
      <td class="dlt-td open-iss-col-date">${date}</td>
    </tr>`;
  }).join('');
}

function wsIssClearSearch() {
  const inp = document.getElementById('wsIssFilterSearch');
  if (inp) inp.value = '';
  const clearBtn = document.getElementById('wsIssFilterSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  wsIssApplyFilters();
}

function wsIssSetDatePreset(preset) {
  const today  = new Date();
  const fmt    = d => d.toISOString().slice(0, 10);
  const fromEl = document.getElementById('wsIssFilterFrom');
  const toEl   = document.getElementById('wsIssFilterTo');
  const customRange = document.getElementById('wsIssCustomRange');

  const fixedPresets = ['today', '1month', 'year'];
  const active = document.querySelector('.ws-date-preset.active')?.dataset.wsPreset;
  if (fixedPresets.includes(preset) && active === preset) {
    document.querySelectorAll('.ws-date-preset').forEach(b => b.classList.remove('active'));
    if (customRange) customRange.style.display = 'none';
    if (fromEl) fromEl.value = '';
    if (toEl)   toEl.value   = '';
    wsIssApplyFilters();
    return;
  }

  document.querySelectorAll('.ws-date-preset').forEach(b => b.classList.remove('active'));
  if (customRange) customRange.style.display = 'none';
  const btn = document.querySelector(`.ws-date-preset[data-ws-preset="${preset}"]`);
  if (btn) btn.classList.add('active');

  if (preset === 'today') {
    const t = fmt(today);
    if (fromEl) fromEl.value = t;
    if (toEl)   toEl.value   = t;
  } else if (preset === 'weeks') {
    const n = Math.max(1, parseInt(document.getElementById('wsIssDateWeeks')?.value || '1', 10) || 1);
    const from = new Date(today); from.setDate(from.getDate() - n * 7);
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === '1month') {
    const from = new Date(today); from.setMonth(from.getMonth() - 1);
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === 'months') {
    const n = Math.max(1, parseInt(document.getElementById('wsIssDateMonths')?.value || '3', 10) || 3);
    const from = new Date(today); from.setMonth(from.getMonth() - n);
    if (fromEl) fromEl.value = fmt(from);
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === 'year') {
    if (fromEl) fromEl.value = `${today.getFullYear()}-01-01`;
    if (toEl)   toEl.value   = fmt(today);
  } else if (preset === 'custom') {
    if (customRange) customRange.style.display = 'flex';
    return;
  }
  wsIssApplyFilters();
}

function wsIssCustomDateChanged() {
  document.querySelectorAll('.ws-date-preset').forEach(b =>
    b.classList.toggle('active', b.dataset.wsPreset === 'custom')
  );
  wsIssApplyFilters();
}

function _wsRenderIssueKpis(all) {
  const total    = all.length;
  const open     = all.filter(i => ['new', 'open'].includes(i.status)).length;
  const progress = all.filter(i => i.status === 'in_progress').length;
  const resolved = all.filter(i => ['resolved', 'closed'].includes(i.status)).length;
  const _wsSetText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  _wsSetText('wsIssKpiTotal',    total);
  _wsSetText('wsIssKpiOpen',     open);
  _wsSetText('wsIssKpiProgress', progress);
  _wsSetText('wsIssKpiResolved', resolved);
}

function _wsPopulateCompanyFilter(all) {
  const sel = document.getElementById('wsIssFilterCompany');
  if (!sel) return;
  const current   = sel.value;
  const companies = [...new Set(all.map(i => i.company_name).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Companies</option>' +
    companies.map(c => `<option value="${escHtml(c)}"${c === current ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}

function _wsRenderIssueAnalytics(all) {
  _wsRenderIssRing(all);
  _wsRenderIssBars('wsIssCategoryBars', all, i => i.request_category || 'Uncategorized');
  _wsRenderIssBars('wsIssCompanyBars',  all, i => i.company_name     || 'Unknown');
}

function _wsRenderIssRing(all) {
  const counts = {
    open:        all.filter(i => ['new', 'open'].includes(i.status)).length,
    in_progress: all.filter(i => i.status === 'in_progress').length,
    resolved:    all.filter(i => i.status === 'resolved').length,
    closed:      all.filter(i => i.status === 'closed').length,
  };
  const total    = all.length || 1;
  const resolved = counts.resolved + counts.closed;
  const pct      = Math.round((resolved / total) * 100);
  const pctEl = document.getElementById('wsIssRingPct');
  if (pctEl) pctEl.textContent = pct + '%';

  const svg = document.getElementById('wsIssRingChart');
  if (!svg) return;
  const cx = 70, cy = 70, r = 54, stroke = 10;
  const circ  = 2 * Math.PI * r;
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

  const legend = document.getElementById('wsIssRingLegend');
  if (legend) legend.innerHTML = Object.entries(counts).map(([key, val]) =>
    `<div class="iss-legend-item"><span class="iss-legend-dot" style="background:${colors[key]}"></span><span class="iss-legend-label">${labels[key]}</span><span class="iss-legend-val">${val}</span></div>`
  ).join('');
}

function _wsRenderIssBars(containerId, all, keyFn) {
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
    if (scope === _issueSubtab) {
      _wsPopulateCompanyFilter(data);
      wsIssApplyFilters();
    }
  } catch (err) {
    if (listEl) listEl.innerHTML = `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function renderIssueList(scope, issues, preFiltered) {
  const listEl = document.getElementById(`ws-issue-list-${scope}`);
  if (!listEl) return;

  const issueIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);margin-bottom:14px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  if (!issues || issues.length === 0) {
    const msgs = {
      team:  'No issues have been routed to your team yet.',
      mine:  'No issues are currently assigned to you.',
      filed: 'You have not filed any issues yet. Use the IT Helpdesk to submit one.',
    };
    const msg = preFiltered ? 'No issues match the current filters.' : (msgs[scope] || 'No issues found.');
    listEl.innerHTML = `<div class="ws-empty-state">${issueIcon}<p style="color:var(--text-muted);font-size:14px;margin:0;">${msg}</p></div>`;
    return;
  }

  listEl.innerHTML = issues.map(iss => renderIssueCard(iss)).join('');
}

function renderIssueCard(iss) {
  const status     = iss.status || 'new';
  const label      = ISSUE_STATUS_LABELS[status] || status.replace('_', ' ');
  const title      = iss.title || iss.description || '(No title)';
  const desc       = iss.title && iss.description ? iss.description : '';
  const id         = escHtml(iss.id);
  const isTerminal = ['resolved', 'closed'].includes(status);
  const confirmedBadge = isTerminal && iss.confirmed_fix
    ? `<span class="iss-confirmed-badge" style="font-size:10px;padding:2px 8px;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Confirmed</span>`
    : (isTerminal ? `<span class="iss-unconfirmed-note" style="font-size:10px;">Awaiting confirmation</span>` : '');
  return `<div class="issue-card" onclick="openIssueDetailById('${id}')">
    <div class="issue-card-top">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
        ${iss.ticket_number ? `<span class="issue-card-ticket">${escHtml(iss.ticket_number)}</span>` : ''}
        <span class="iss-badge ${issueBadgeClass(status)}">${escHtml(label)}</span>
        ${prioBadgeHtml(iss.priority)}
        ${confirmedBadge}
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

async function openIssueDetail(iss) {
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

  // Show reopen section only for resolved / closed issues
  const reopenSection = document.getElementById('iss-reopen-section');
  const isTerminal = ['resolved', 'closed'].includes(status);
  if (reopenSection) reopenSection.style.display = isTerminal ? '' : 'none';

  // Confirmed fix row
  const cfRow = document.getElementById('iss-confirm-fix-row');
  const cfVal = document.getElementById('iss-modal-confirm-fix');
  if (cfRow && cfVal) {
    if (isTerminal) {
      cfRow.style.display = '';
      if (iss.confirmed_fix) {
        const dt = iss.confirmed_fix_at ? ' on ' + fmtDate(iss.confirmed_fix_at) : '';
        cfVal.innerHTML = `<span class="iss-confirmed-badge"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Confirmed${escHtml(dt)}</span>`;
      } else {
        cfVal.innerHTML = `<span class="iss-unconfirmed-note">Awaiting confirmation</span>`;
      }
    } else {
      cfRow.style.display = 'none';
    }
  }

  // Show dept head action panel
  const session = loadSession();
  const dhPanel = document.getElementById('iss-dh-actions');
  if (session && (session.isDepartmentHead || session.isAdmin || session.isManagement)) {
    dhPanel.style.display = '';
    document.getElementById('iss-dh-status').value = status;
    document.getElementById('iss-dh-error').style.display = 'none';

    // Show loading state immediately — members may not be loaded yet
    const sel = document.getElementById('iss-dh-assignee');
    sel.innerHTML = '<option value="">Loading members…</option>';
    sel.disabled  = true;

    // Open the modal now so the user doesn't wait on the fetch
    document.getElementById('issCommentInput').value = '';
    document.getElementById('issueDetailModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    loadIssActivity(iss.id);

    // Fetch members if not already loaded, then populate
    await _ensureTeamMembersLoaded();
    _populateIssueAssigneeSelect(iss.assigned_to || '');
    sel.disabled = false;
  } else {
    dhPanel.style.display = 'none';
    document.getElementById('issCommentInput').value = '';
    document.getElementById('issueDetailModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    loadIssActivity(iss.id);
  }
}

function _populateIssueAssigneeSelect(currentAssignee) {
  const sel     = document.getElementById('iss-dh-assignee');
  const members = _teamMembers || [];
  sel.innerHTML = '';

  const unassigned = document.createElement('option');
  unassigned.value       = '';
  unassigned.textContent = '— Unassigned —';
  if (!currentAssignee) unassigned.selected = true;
  sel.appendChild(unassigned);

  // If the currently assigned user isn't in our team list, still show them
  const inTeam = members.some(m => m.username === currentAssignee);
  if (currentAssignee && !inTeam) {
    const opt = document.createElement('option');
    opt.value       = currentAssignee;
    opt.textContent = currentAssignee;
    opt.selected    = true;
    sel.appendChild(opt);
  }

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
      wsIssApplyFilters();
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

/* ── Team Config Tab ── */

let _wsDeptDetails = null;
let _wsConfigLoaded = false;

async function loadWsConfig() {
  if (!_wsConfigLoaded) {
    _wsConfigLoaded = true;
    await Promise.all([loadWsTeamRoles(), loadWsDeptDetails()]);
    loadUtCfgStatuses();
  }
}

async function loadWsTeamRoles() {
  const el = document.getElementById('ws-config-team-roles');
  if (!el) return;
  el.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res = await fetch('/api/user/team', { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    const members = await res.json();
    if (!_teamMembers) _teamMembers = members;
    _renderWsTeamRoles(members, el);
  } catch (err) {
    el.innerHTML = `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function _renderWsTeamRoles(members, el) {
  const leads = members.filter(m => m.is_department_head || m.is_admin || m.is_management);
  const rest  = members.filter(m => !m.is_department_head && !m.is_admin && !m.is_management);

  function memberCard(m, compact) {
    const name    = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.username;
    const initial = (name.charAt(0) || '?').toUpperCase();
    const av      = m.avatar_url && (m.avatar_url.startsWith('data:') || m.avatar_url.startsWith('https://')) ? m.avatar_url : '';
    const avatarInner = av ? `<img src="${escHtml(av)}" alt="${escHtml(initial)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : escHtml(initial);
    const roleBadges  = [
      m.is_admin           ? '<span class="badge-admin">Admin</span>' : '',
      m.is_management      ? '<span class="badge-admin" style="background:rgba(120,53,15,.18);color:#f59e0b;border:1px solid rgba(245,158,11,.3);">Mgmt</span>' : '',
      m.is_department_head ? '<span class="badge-admin" style="background:rgba(14,165,233,.18);color:#38bdf8;border:1px solid rgba(56,189,248,.3);">Dept Head</span>' : '',
    ].filter(Boolean).join('');
    if (compact) {
      return `<div class="team-member-card" style="display:flex;align-items:center;gap:10px;padding:10px 14px;flex-direction:row;text-align:left;min-width:0;">
        <div class="team-avatar" style="width:36px;height:36px;min-width:36px;font-size:14px;">${avatarInner}</div>
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(name)}</div>
          ${m.position ? `<div style="font-size:11px;color:var(--text-muted);">${escHtml(m.position)}</div>` : ''}
        </div>
      </div>`;
    }
    return `<div class="team-member-card">
      <div class="team-avatar">${avatarInner}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:4px;">${roleBadges}</div>
      <div class="team-member-name">${escHtml(name)}</div>
      ${m.position ? `<div class="team-member-position">${escHtml(m.position)}</div>` : ''}
      ${m.email ? `<a href="mailto:${escHtml(m.email)}" class="team-member-email" onclick="event.stopPropagation()">${escHtml(m.email)}</a>` : ''}
    </div>`;
  }

  let html = '';
  if (leads.length) {
    html += `<div class="team-member-grid" style="margin-bottom:16px;">${leads.map(m => memberCard(m, false)).join('')}</div>`;
  }
  if (rest.length) {
    html += `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px;">Other Members (${rest.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${rest.map(m => memberCard(m, true)).join('')}</div>`;
  }
  if (!leads.length && !rest.length) {
    html = '<div class="ws-empty-state" style="padding:20px 0;"><p style="color:var(--text-muted);font-size:14px;margin:0;">No team members found.</p></div>';
  }
  el.innerHTML = html;
}

async function loadWsDeptDetails() {
  try {
    const res = await fetch('/api/user/department', { headers: authHeaders() });
    if (!res.ok) return;
    _wsDeptDetails = await res.json();
    document.getElementById('wsDeptCode').textContent  = _wsDeptDetails.department_code || '—';
    document.getElementById('wsDeptName').value        = _wsDeptDetails.department_name || '';
    document.getElementById('wsDeptDesc').value        = _wsDeptDetails.department_desc || '';
  } catch { /* non-fatal */ }
}

async function saveWsDeptDetails(e) {
  e.preventDefault();
  const name = document.getElementById('wsDeptName').value.trim();
  const desc = document.getElementById('wsDeptDesc').value.trim();
  if (!name) return;
  document.getElementById('wsDeptDetailsActions').style.display  = 'none';
  document.getElementById('wsDeptDetailsSaving').style.display   = '';
  document.getElementById('wsDeptDetailsError').style.display    = 'none';
  try {
    const res = await fetch('/api/user/department', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_name: name, department_desc: desc || null }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    document.getElementById('wsDeptDetailsSaving').style.display  = 'none';
    document.getElementById('wsDeptDetailsActions').style.display = '';
    showToast('Department details updated.');
  } catch (err) {
    document.getElementById('wsDeptDetailsSaving').style.display  = 'none';
    document.getElementById('wsDeptDetailsActions').style.display = '';
    document.getElementById('wsDeptDetailsError').style.display   = '';
    document.getElementById('wsDeptDetailsErrorMsg').textContent  = err.message;
  }
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

function setUtViewMode(mode) {
  _utViewMode = mode;
  document.querySelectorAll('[data-ut-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.utView === mode);
  });
  const kanbanWrap = document.getElementById('ut-kanban-wrap');
  const listView   = document.getElementById('ut-list-view');
  if (kanbanWrap) kanbanWrap.style.display = mode === 'kanban' ? '' : 'none';
  if (listView)   listView.style.display   = mode === 'list'   ? '' : 'none';
  if (mode === 'list') renderTaskList();
}

/* ── Dept task statuses (dynamic) ── */
async function loadUtStatuses() {
  try {
    const res = await fetch('/api/user/task-statuses', { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      _utStatuses = Array.isArray(data) && data.length ? data : _UT_DEFAULT_STATUSES;
    } else {
      _utStatuses = _UT_DEFAULT_STATUSES;
    }
  } catch {
    _utStatuses = _UT_DEFAULT_STATUSES;
  }
  _buildUtKanbanCols();
  _buildUtStatsBar();
  _populateUtStatusSelect();
}

function _buildUtKanbanCols() {
  const board = document.getElementById('ut-kanban');
  if (!board) return;
  board.innerHTML = _utStatuses.map(s =>
    `<div class="kanban-col" id="ut-col-${escHtml(s.slug)}" data-status="${escHtml(s.slug)}">
      <div class="kanban-col-header">
        <span class="kanban-col-dot" style="background:${escHtml(s.color)};"></span>
        ${escHtml(s.label)}
        <span class="kanban-count" id="ut-count-${escHtml(s.slug)}">0</span>
      </div>
      <div class="kanban-cards" id="ut-cards-${escHtml(s.slug)}"></div>
    </div>`
  ).join('');
}

function _buildUtStatsBar() {
  const bar = document.getElementById('utStatsBar');
  if (!bar) return;
  bar.innerHTML = _utStatuses.map(s => {
    const color = s.color || '#6b7280';
    const bg    = _hexToRgba(color, 0.08);
    const bd    = _hexToRgba(color, 0.28);
    return `<div class="dev-stat-pill" style="background:${bg};border-color:${bd};border-top-color:${escHtml(color)};">
      <span class="dev-stat-count" id="ut-stat-${escHtml(s.slug)}" style="color:${escHtml(color)};">—</span>
      <span class="dev-stat-label">${escHtml(s.label)}</span>
    </div>`;
  }).join('');
}

function _populateUtStatusSelect(currentSlug) {
  const sel = document.getElementById('ut-task-status');
  if (!sel) return;
  const slug = currentSlug ?? sel.value ?? _utInitialStatus()?.slug ?? '';
  sel.innerHTML = _utStatuses.map(s =>
    `<option value="${escHtml(s.slug)}"${s.slug === slug ? ' selected' : ''}>${escHtml(s.label)}</option>`
  ).join('');
}

async function loadTasks() {
  _utStatusSlugs().forEach(slug => {
    const el = document.getElementById(`ut-cards-${slug}`);
    if (el) el.innerHTML = '<div class="admin-loading" style="padding:12px 0;"><div class="spinner"></div></div>';
  });
  try {
    const res = await fetch(`/api/user/tasks?scope=${_taskFilter}`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
    _tasks = await res.json();
    renderTaskBoard();
  } catch (err) {
    _utStatusSlugs().forEach(slug => {
      const el = document.getElementById(`ut-cards-${slug}`);
      if (el) el.innerHTML = `<div class="admin-error" style="margin:8px 0;">${escHtml(err.message)}</div>`;
    });
  }
}

function renderTaskBoard() {
  const slugs = _utStatusSlugs();
  const byStatus = {};
  slugs.forEach(slug => { byStatus[slug] = []; });
  _tasks.forEach(task => {
    const slot = slugs.includes(task.status) ? task.status : (slugs[0] ?? '');
    if (slot) byStatus[slot].push(task);
  });

  slugs.forEach(slug => {
    const col   = document.getElementById(`ut-cards-${slug}`);
    const tasks = byStatus[slug];

    const countEl = document.getElementById(`ut-count-${slug}`);
    if (countEl) countEl.textContent = tasks.length;
    const statEl = document.getElementById(`ut-stat-${slug}`);
    if (statEl) statEl.textContent = tasks.length;

    if (!col) return;
    col.innerHTML = tasks.length
      ? tasks.map(t => renderTaskCard(t)).join('')
      : `<div class="kanban-empty">
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
           No tasks
         </div>`;
  });
  if (_utViewMode === 'list') renderTaskList();
  renderPastTasks();
}


function renderTaskList() {
  const tbody = document.getElementById('utListBody');
  if (!tbody) return;
  const activeTasks = _tasks.filter(t => !_utIsTerminal(t.status));
  if (!activeTasks.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="dlt-empty">No active tasks.</td></tr>';
    return;
  }
  tbody.innerHTML = activeTasks.map(t => {
    const id      = escHtml(t.id);
    const title   = escHtml(t.title);
    const status  = t.status || 'open';
    const slabel  = _utStatusLabel(status);
    const dotColor = _utStatusColor(status);
    const assignee = t.assigned_to ? escHtml(t.assigned_to) : '<span class="open-iss-unassigned">—</span>';
    const due     = t.due_date ? escHtml(fmtDate(t.due_date)) : '—';
    const creator = t.created_by ? escHtml(t.created_by) : '—';
    return `<tr class="dlt-row" onclick="openUtModal('${id}')" style="cursor:pointer;" title="Edit task">
      <td class="dlt-td dlt-th-title">
        <span class="ut-list-title">${title}</span>
        ${t.description ? `<span class="ut-list-desc">${escHtml(t.description.slice(0, 60))}${t.description.length > 60 ? '…' : ''}</span>` : ''}
      </td>
      <td class="dlt-td">
        <span class="ut-list-status-dot" style="background:${escHtml(dotColor)};width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle;"></span>
        <span class="ut-list-status-label">${slabel}</span>
      </td>
      <td class="dlt-td">${assignee}</td>
      <td class="dlt-td">${due}</td>
      <td class="dlt-td">${creator}</td>
      <td class="dlt-td ut-list-col-actions">
        <button class="ut-card-btn" onclick="event.stopPropagation();openUtModal('${id}')" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderPastTasks() {
  const section = document.getElementById('utPastTasksSection');
  const badge   = document.getElementById('utPastTasksBadge');
  const tbody   = document.getElementById('utPastTasksBody');
  if (!section || !tbody) return;

  const doneTasks = _tasks
    .filter(t => _utIsTerminal(t.status))
    .sort((a, b) => {
      const da = a.updated_at || a.created_at || '';
      const db = b.updated_at || b.created_at || '';
      return db.localeCompare(da);
    });

  if (badge) badge.textContent = doneTasks.length;

  if (!doneTasks.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  tbody.innerHTML = doneTasks.map(t => {
    const id      = escHtml(t.id);
    const title   = escHtml(t.title);
    const assignee = t.assigned_to ? escHtml(t.assigned_to) : '—';
    const due     = t.due_date  ? escHtml(fmtDate(t.due_date))  : '—';
    const creator = t.created_by ? escHtml(t.created_by) : '—';
    const completed = t.updated_at ? escHtml(fmtDate(t.updated_at)) : (t.created_at ? escHtml(fmtDate(t.created_at)) : '—');
    return `<tr class="dlt-row past-task-row" onclick="openUtModal('${id}')" style="cursor:pointer;" title="View task">
      <td class="dlt-td dlt-th-title">
        <span class="past-task-title">${title}</span>
        ${t.description ? `<span class="ut-list-desc">${escHtml(t.description.slice(0, 60))}${t.description.length > 60 ? '…' : ''}</span>` : ''}
      </td>
      <td class="dlt-td">${assignee}</td>
      <td class="dlt-td">${due}</td>
      <td class="dlt-td">${creator}</td>
      <td class="dlt-td past-task-completed">${completed}</td>
      <td class="dlt-td ut-list-col-actions">
        <button class="ut-card-btn ut-card-btn--danger" onclick="event.stopPropagation();deleteUtTaskCard('${id}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderTaskCard(task) {
  const slugs     = _utStatusSlugs();
  const statusIdx = slugs.indexOf(task.status);
  const id        = escHtml(task.id);
  return `<div class="ut-card" id="utc-${id}">
    ${task.task_code ? `<div class="ut-card-code">${escHtml(task.task_code)}</div>` : ''}
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
          ? `<button class="ut-card-btn" onclick="moveUtTask('${id}','${escHtml(slugs[statusIdx-1])}')" title="Move back">
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
             </button>`
          : '<span class="ut-card-btn-placeholder"></span>'}
        <button class="ut-card-btn" onclick="openUtModal('${id}')" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="ut-card-btn ut-card-btn--danger" onclick="deleteUtTaskCard('${id}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
        ${statusIdx < slugs.length - 1
          ? `<button class="ut-card-btn" onclick="moveUtTask('${id}','${escHtml(slugs[statusIdx+1])}')" title="Move forward">
               <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
             </button>`
          : '<span class="ut-card-btn-placeholder"></span>'}
      </div>
    </div>
  </div>`;
}

function _renderCol(slug) {
  const slugs  = _utStatusSlugs();
  const col    = document.getElementById(`ut-cards-${slug}`);
  if (!col) return;
  const tasks  = _tasks.filter(t => (slugs.includes(t.status) ? t.status : slugs[0] ?? '') === slug);
  const countEl = document.getElementById(`ut-count-${slug}`);
  if (countEl) countEl.textContent = tasks.length;
  const statEl  = document.getElementById(`ut-stat-${slug}`);
  if (statEl)  statEl.textContent  = tasks.length;
  col.innerHTML = tasks.length
    ? tasks.map(t => renderTaskCard(t)).join('')
    : `<div class="kanban-empty">
         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
         No tasks
       </div>`;
}

async function moveUtTask(id, newStatus) {
  const idx = _tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const task      = _tasks[idx];
  const oldStatus = task.status;
  if (oldStatus === newStatus) return;

  // Optimistic update — card moves instantly, no wait for network
  _tasks[idx] = { ...task, status: newStatus };
  _renderCol(oldStatus);
  _renderCol(newStatus);
  if (_utViewMode === 'list') renderTaskList();
  renderPastTasks();

  try {
    const res = await fetch(`/api/user/tasks/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const updated = await res.json();
    // Reconcile with server response (updated_at, etc.)
    _tasks[idx] = updated;
    _renderCol(newStatus);
    if (_utViewMode === 'list') renderTaskList();
    renderPastTasks();
  } catch (err) {
    // Revert on failure
    _tasks[idx] = task;
    _renderCol(newStatus);
    _renderCol(oldStatus);
    if (_utViewMode === 'list') renderTaskList();
    renderPastTasks();
    showToast(`Error: ${err.message}`);
  }
}

/* ── Task modal ── */
async function openUtModal(idOrNull) {
  const task = typeof idOrNull === 'string' ? _tasks.find(t => t.id === idOrNull) : null;
  _taskEditId = task?.id ?? null;
  document.getElementById('ut-modal-title-text').textContent = task ? 'Edit Task' : 'New Task';
  const subtitleEl = document.getElementById('ut-modal-subtitle');
  if (subtitleEl) subtitleEl.textContent = task?.task_code ? task.task_code : 'Fill in the task details below';
  document.getElementById('ut-task-id').value    = task?.id          ?? '';
  document.getElementById('ut-task-title').value = task?.title       ?? '';
  document.getElementById('ut-task-desc').value  = task?.description ?? '';
  _populateUtStatusSelect(task?.status ?? _utInitialStatus()?.slug ?? '');
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

/* ── Reopen Issue ── */
function openReopenModal() {
  if (!_currentIssue) return;
  const ticket = _currentIssue.ticket_number || '';
  document.getElementById('reopen-modal-ref').textContent = ticket ? `Follow-up for ${ticket}` : 'Follow-up for this issue';
  document.getElementById('reopen-reason').value          = '';
  document.getElementById('reopen-error').style.display   = 'none';
  const btn = document.getElementById('reopen-submit-btn');
  btn.disabled   = false;
  btn.innerHTML  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.62"/></svg> Submit Follow-up`;
  document.getElementById('reopenIssueModal').classList.add('open');
}

function closeReopenModal() {
  document.getElementById('reopenIssueModal').classList.remove('open');
}

function overlayCloseReopen(e) {
  if (e.target === document.getElementById('reopenIssueModal')) closeReopenModal();
}

async function submitReopen() {
  if (!_currentIssue) return;
  const reason = (document.getElementById('reopen-reason').value || '').trim();
  if (!reason) {
    document.getElementById('reopen-error-msg').textContent = 'Please describe the reason for reopening.';
    document.getElementById('reopen-error').style.display   = 'flex';
    return;
  }

  const btn = document.getElementById('reopen-submit-btn');
  btn.disabled  = true;
  btn.textContent = 'Submitting…';
  document.getElementById('reopen-error').style.display = 'none';

  try {
    const res = await fetch(`/api/user/issues/${encodeURIComponent(_currentIssue.id)}/reopen`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit follow-up');
    const data = await res.json();
    closeReopenModal();
    closeIssueDetail();
    const ticketRef = data.ticket_number ? ` (${data.ticket_number})` : '';
    showToast(`Follow-up ticket${ticketRef} submitted successfully.`);
    // Invalidate caches so the new issue appears on the next load
    _issues.team  = null;
    _issues.mine  = null;
    _issues.filed = null;
    if (_activeTab === 'issues') loadIssues(_issueSubtab);
  } catch (err) {
    document.getElementById('reopen-error-msg').textContent = err.message;
    document.getElementById('reopen-error').style.display   = 'flex';
    btn.disabled  = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.62"/></svg> Submit Follow-up`;
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
  _ensureTeamMembersLoaded(); // pre-fetch so assignee dropdowns open instantly
  loadUtStatuses(); // pre-load statuses so the kanban is ready when user clicks Tasks tab
  initUtPhysicsDrag();

  /* Show Team Config tab for dept heads / admins / management */
  if (session && (session.isDepartmentHead || session.isAdmin || session.isManagement)) {
    const cfgTabBtn = document.getElementById('ws-tab-config-btn');
    if (cfgTabBtn) cfgTabBtn.style.display = '';
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeWsIssShareModal(); closeReopenModal(); closeIssueDetail(); closeUtModal(); closeUtCfgStatusModal(); closeProfileMenu(); }
  });
  document.addEventListener('click', e => {
    closeProfileMenu();
    if (_utAssigneeOpen && !document.getElementById('ut-assignee-wrap')?.contains(e.target)) _closeAssigneeDropdown();
  });
});

/* ── Dept Head: Task Status Config ── */

async function loadUtCfgStatuses() {
  const list = document.getElementById('utCfgStatusList');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading" style="padding:8px 0;"><div class="spinner"></div></div>';
  try {
    const res = await fetch('/api/user/task-statuses', { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    _utCfgStatusesCache = await res.json();
    _renderUtCfgStatuses();
  } catch (err) {
    list.innerHTML = `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function _renderUtCfgStatuses() {
  const list = document.getElementById('utCfgStatusList');
  if (!list) return;
  if (!_utCfgStatusesCache.length) {
    list.innerHTML = '<div class="admin-empty">No statuses yet. Add one above.</div>';
    return;
  }
  const HANDLE_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="2.5" r="1.1"/><circle cx="8" cy="2.5" r="1.1"/><circle cx="4" cy="6" r="1.1"/><circle cx="8" cy="6" r="1.1"/><circle cx="4" cy="9.5" r="1.1"/><circle cx="8" cy="9.5" r="1.1"/></svg>`;
  list.innerHTML = `<div class="ts-list" id="utCfgTsList">${_utCfgStatusesCache.map(s => `
    <div class="ts-item" draggable="true" data-id="${escHtml(s.id)}">
      <span class="ts-drag-handle" title="Drag to reorder">${HANDLE_SVG}</span>
      <span class="ts-color-dot" style="background:${escHtml(s.color)};"></span>
      <span class="ts-item-label">${escHtml(s.label)}</span>
      <span class="ts-item-slug">${escHtml(s.slug)}</span>
      <span class="ts-item-badges">
        ${s.is_terminal ? '<span class="badge-visible">Terminal</span>' : ''}
        ${s.is_system   ? '<span class="badge-hidden">System</span>'   : ''}
      </span>
      <span class="ts-item-actions">
        <button class="btn-tbl-secondary" onclick='event.stopPropagation();openUtCfgStatusModal(${escHtml(JSON.stringify(s))})'>Edit</button>
        ${!s.is_system ? `<button class="btn-tbl-danger" onclick="event.stopPropagation();deleteUtCfgStatus('${escHtml(s.id)}')">Delete</button>` : ''}
      </span>
    </div>`).join('')}
  </div>`;
  _initStatusDrag(list.querySelector('#utCfgTsList'), _utCfgStatusesCache, async newOrder => {
    const patches = newOrder
      .map((id, i) => ({ id, sort_order: i }))
      .filter(({ id, sort_order }) => {
        const old = _utCfgStatusesCache.find(s => s.id === id);
        return old && old.sort_order !== sort_order;
      });
    if (!patches.length) return;
    try {
      await Promise.all(patches.map(({ id, sort_order }) =>
        fetch(`/api/user/task-statuses/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order }),
        })
      ));
      await loadUtCfgStatuses();
      await loadUtStatuses();
    } catch (err) {
      showToast(`Reorder failed: ${err.message}`);
      await loadUtCfgStatuses();
    }
  });
}

function _initStatusDrag(listEl, cache, onReorder) {
  if (!listEl) return;
  let dragging = null;

  listEl.addEventListener('dragstart', e => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    dragging = item;
    requestAnimationFrame(() => item.classList.add('dragging'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.id);
  });

  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('[data-id]');
    if (!target || target === dragging) return;
    listEl.querySelectorAll('[data-id]').forEach(el => el.classList.remove('drag-over'));
    target.classList.add('drag-over');
    const rect = target.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      listEl.insertBefore(dragging, target);
    } else {
      listEl.insertBefore(dragging, target.nextSibling);
    }
  });

  listEl.addEventListener('dragleave', e => {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.querySelectorAll('[data-id]').forEach(el => el.classList.remove('drag-over'));
    }
  });

  listEl.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('dragging');
    listEl.querySelectorAll('[data-id]').forEach(el => el.classList.remove('drag-over'));
    const newOrder = [...listEl.querySelectorAll('[data-id]')].map(el => el.dataset.id);
    dragging = null;
    onReorder(newOrder);
  });
}

function openUtCfgStatusModal(status) {
  _utCfgStatusEditId = status ? status.id : null;
  document.getElementById('utCfgStatusModalTitle').textContent = _utCfgStatusEditId ? 'Edit Status' : 'Add Status';
  document.getElementById('utCfgTsLabel').value        = status?.label ?? '';
  document.getElementById('utCfgTsColor').value        = status?.color ?? '#6b7280';
  document.getElementById('utCfgTsIsTerminal').checked = !!status?.is_terminal;
  const deleteBtn = document.getElementById('utCfgTsDeleteBtn');
  deleteBtn.style.display = (_utCfgStatusEditId && !status?.is_system) ? '' : 'none';
  document.getElementById('utCfgStatusFormActions').style.display = '';
  document.getElementById('utCfgStatusFormLoading').style.display = 'none';
  document.getElementById('utCfgStatusFormError').style.display   = 'none';
  document.getElementById('utCfgStatusModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('utCfgTsLabel').focus(), 60);
}

function closeUtCfgStatusModal() {
  document.getElementById('utCfgStatusModal').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveUtCfgStatus(e) {
  e.preventDefault();
  const label      = document.getElementById('utCfgTsLabel').value.trim();
  const color      = document.getElementById('utCfgTsColor').value;
  const is_terminal = document.getElementById('utCfgTsIsTerminal').checked;
  if (!label) {
    document.getElementById('utCfgStatusFormError').style.display = '';
    document.getElementById('utCfgStatusErrorMsg').textContent = 'Label is required.';
    return;
  }
  document.getElementById('utCfgStatusFormActions').style.display = 'none';
  document.getElementById('utCfgStatusFormLoading').style.display = '';
  try {
    const payload = { label, color, is_terminal };
    let res;
    if (_utCfgStatusEditId) {
      res = await fetch(`/api/user/task-statuses/${encodeURIComponent(_utCfgStatusEditId)}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/user/task-statuses', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    closeUtCfgStatusModal();
    showToast('Status saved.');
    await loadUtCfgStatuses();
    await loadUtStatuses(); // rebuild kanban with updated statuses
  } catch (err) {
    document.getElementById('utCfgStatusFormLoading').style.display = 'none';
    document.getElementById('utCfgStatusFormActions').style.display = '';
    document.getElementById('utCfgStatusFormError').style.display = '';
    document.getElementById('utCfgStatusErrorMsg').textContent = err.message;
  }
}

async function deleteUtCfgStatus(id) {
  const targetId = id ?? _utCfgStatusEditId;
  if (!targetId) return;
  if (!await showConfirm({ title: 'Delete Status', message: 'Delete this task status?', detail: 'Tasks with this status will remain but may appear uncategorised.', confirmText: 'Delete', danger: true })) return;
  closeUtCfgStatusModal();
  try {
    const res = await fetch(`/api/user/task-statuses/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Status deleted.');
    await loadUtCfgStatuses();
    await loadUtStatuses();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}


/* ── Workspace Issue Share Modal ── */
function openWsIssShareModal() {
  if (!_currentIssue) return;
  const iss    = _currentIssue;
  const url    = window.location.origin + '/admin/issues/' + encodeURIComponent(iss.id);
  const ref    = iss.ticket_number || 'Ticket';
  const title  = iss.title || ((iss.description || '').slice(0, 48) + (iss.description && iss.description.length > 48 ? '…' : ''));
  const sub    = ref + (title ? ' — ' + title : '');
  const msgTxt = ref + '\n' + url;

  document.getElementById('wsIssShareModalSub').textContent = sub;
  document.getElementById('wsIssShareLinkInput').value      = url;
  document.getElementById('wsIssShareCopied').classList.remove('visible');
  document.getElementById('wsIssShareCopyBtn').textContent  = 'Copy';

  document.getElementById('wsIssShareWa').href        = 'https://api.whatsapp.com/send?text='     + encodeURIComponent(msgTxt);
  document.getElementById('wsIssShareViber').href     = 'viber://forward?text='                   + encodeURIComponent(msgTxt);
  document.getElementById('wsIssShareTg').href        = 'https://t.me/share/url?url='             + encodeURIComponent(url) + '&text=' + encodeURIComponent(ref);
  document.getElementById('wsIssShareEmail').href     = 'mailto:?subject='                        + encodeURIComponent(ref) + '&body=' + encodeURIComponent('Ticket link:\n' + url);
  document.getElementById('wsIssShareTeams').href     = 'https://teams.microsoft.com/share?href=' + encodeURIComponent(url) + '&msgText=' + encodeURIComponent(ref);
  document.getElementById('wsIssShareMessenger').href = 'fb-messenger://share?link='              + encodeURIComponent(url);

  document.getElementById('wsIssShareModal').classList.add('active');
  document.body.style.overflow = 'hidden';

  navigator.clipboard.writeText(url).then(() => {
    document.getElementById('wsIssShareCopied').classList.add('visible');
  }).catch(() => {});
}

function closeWsIssShareModal() {
  document.getElementById('wsIssShareModal').classList.remove('active');
  document.body.style.overflow = '';
}

function copyWsIssShareLink() {
  const url = document.getElementById('wsIssShareLinkInput').value;
  navigator.clipboard.writeText(url).then(() => {
    document.getElementById('wsIssShareCopied').classList.add('visible');
    const btn = document.getElementById('wsIssShareCopyBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    const input = document.getElementById('wsIssShareLinkInput');
    input.select();
    document.execCommand('copy');
  });
}
