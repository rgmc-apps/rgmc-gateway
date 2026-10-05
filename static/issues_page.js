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
let _ipTab          = 'list';
const _ipPerPage    = 25;
let _ipLinkedTargetIds = new Set();

async function loadIssuesPage() {
  const wrap = document.getElementById('ipIssuesBody');
  wrap.innerHTML = '<div class="admin-loading"><div class="spinner"></div><span>Loading issues…</span></div>';
  try {
    const res = await fetch('/api/issues/scoped', { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to load issues');
    _ipIssuesCache = await res.json();
    _ipPopulateCompanyFilter();
    ipApplyFilters();
    _ipRenderAnalytics(_ipIssuesCache);
  } catch (err) {
    wrap.innerHTML = `<div class="admin-error">Failed to load issues: ${escHtml(err.message)}</div>`;
  }
}

/* ── Tabs ── */
function ipSwitchTab(tab) {
  _ipTab = tab;
  document.querySelectorAll('.dev-filter-tabs .dev-filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('ipListPanel').style.display      = tab === 'list' ? '' : 'none';
  document.getElementById('ipAnalyticsPanel').style.display = tab === 'analytics' ? '' : 'none';
  if (tab === 'analytics') _ipRenderAnalytics(_ipIssuesCache);
}

/* ── Analytics ── */
function _ipSetText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function _ipRenderAnalytics(all) {
  if (!all) return;
  const open     = all.filter(i => i.status === 'open').length;
  const progress = all.filter(i => i.status === 'in_progress').length;
  const terminal = all.filter(i => ['resolved', 'closed'].includes(i.status));
  const devItem  = all.filter(i => i.dev_item_id).length;
  const task     = all.filter(i => i.task_id || i.user_task_id).length;
  const confirmed = terminal.filter(i => i.confirmed_fix).length;
  const awaiting   = terminal.length - confirmed;

  _ipSetText('ipKpiTotal',     all.length);
  _ipSetText('ipKpiOpen',      open);
  _ipSetText('ipKpiProgress',  progress);
  _ipSetText('ipKpiResolved',  terminal.length);
  _ipSetText('ipKpiDevItem',   devItem);
  _ipSetText('ipKpiTask',      task);
  _ipSetText('ipKpiConfirmed', confirmed);
  _ipSetText('ipKpiAwaiting',  awaiting);

  const openIssues = all.filter(i => ['open', 'in_progress'].includes(i.status));
  const ages       = openIssues.map(i => i.shift_age_days).filter(v => v != null);
  const resDays    = terminal.map(i => i.shift_age_days).filter(v => v != null);
  const avgAge     = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
  const avgRes     = resDays.length ? resDays.reduce((a, b) => a + b, 0) / resDays.length : null;
  const oldest     = ages.length ? Math.max(...ages) : null;
  const unassigned = openIssues.filter(i => !i.assigned_to).length;

  _ipSetText('ipKpiAvgAge',     avgAge  != null ? avgAge.toFixed(1)  : '—');
  _ipSetText('ipKpiAvgRes',     avgRes  != null ? avgRes.toFixed(1)  : '—');
  _ipSetText('ipKpiOldest',     oldest  != null ? oldest.toFixed(1)  : '—');
  _ipSetText('ipKpiUnassigned', unassigned);
  _ipSetText('ipKpiResolvedTask', terminal.filter(i => i.task_id || i.user_task_id).length);

  _ipRenderRing(all);
  _ipRenderBars('ipCategoryBars', all, i => i.request_category || 'Uncategorized');
  _ipRenderBars('ipCompanyBars',  all, i => i.company_name     || 'Unknown');
  _ipRenderBars('ipPriorityBars', all, i => i.priority ? i.priority.toUpperCase() : 'None');
  _ipRenderBars('ipSiteBars',     all, i => i.site_name || 'Unknown');
  _ipRenderBars('ipAssigneeBars', openIssues, i => i.assigned_to || 'Unassigned');
  _ipRenderBars('ipResPathBars', terminal, i => {
    if (i.is_duplicate) return 'Duplicate';
    if (i.dev_item_id)  return 'Dev Item';
    if (i.task_id || i.user_task_id) return 'Task';
    return 'Quick Resolve';
  });
  _ipRenderBars('ipResolverBars', terminal.filter(i => i.resolved_by), i => i.resolved_by);
}

function _ipRenderRing(all) {
  const counts = {
    open:        all.filter(i => i.status === 'open').length,
    in_progress: all.filter(i => i.status === 'in_progress').length,
    resolved:    all.filter(i => i.status === 'resolved').length,
    closed:      all.filter(i => i.status === 'closed').length,
  };
  const total    = all.length || 1;
  const resolved = counts.resolved + counts.closed;
  const pct      = Math.round((resolved / total) * 100);
  const pctEl = document.getElementById('ipRingPct');
  if (pctEl) pctEl.textContent = pct + '%';

  const svg = document.getElementById('ipRingChart');
  if (!svg) return;
  const cx = 70, cy = 70, r = 54, stroke = 10;
  const circ = 2 * Math.PI * r;
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

  const legend = document.getElementById('ipRingLegend');
  if (legend) legend.innerHTML = Object.entries(counts).map(([key, val]) =>
    `<div class="iss-legend-item"><span class="iss-legend-dot" style="background:${colors[key]}"></span><span class="iss-legend-label">${labels[key]}</span><span class="iss-legend-val">${val}</span></div>`
  ).join('');
}

function _ipRenderBars(containerId, all, keyFn) {
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

  // Pre-compute all issue IDs referenced by another issue's linked_issue_ids
  // (same "Connected" logic as Admin → Issues) so the badge can show reverse links too.
  _ipLinkedTargetIds = new Set();
  for (const i of _ipIssuesCache) {
    for (const id of (i.linked_issue_ids || [])) _ipLinkedTargetIds.add(id);
    if (i.linked_issue_id) _ipLinkedTargetIds.add(i.linked_issue_id);
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
          <th>Confirmed</th>
          <th>Connected</th>
          <th>Assigned To</th>
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
  const importedBadge = issue.imported_from
    ? `<span class="badge-imported" title="Imported from ${escHtml(issue.imported_from)}${issue.legacy_ticket_id ? ' — legacy #' + escHtml(issue.legacy_ticket_id) : ''}">Imported</span>`
    : '';
  const ticketRef    = issue.ticket_number
    ? `<code class="mono-val" style="font-size:11px;">${escHtml(issue.ticket_number)}</code>${importedBadge}<br>`
    : importedBadge ? `${importedBadge}<br>` : '';

  const isTerminalStatus = ['resolved', 'closed'].includes((issue.status || '').toLowerCase());
  const confirmedCell = isTerminalStatus
    ? (issue.confirmed_fix
        ? `<span class="iss-confirmed-badge" title="Reporter confirmed fix${issue.confirmed_fix_at ? ' on ' + fmtDate(issue.confirmed_fix_at) : ''}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Yes</span>`
        : `<span class="iss-unconfirmed-note">Pending</span>`)
    : '<span class="text-muted">—</span>';

  const devBadge      = issue.dev_item_id  ? '<span class="badge-dev"   title="Linked to dev item">Dev Item</span>' : '';
  const taskBadge     = issue.task_id      ? '<span class="badge-task"  title="Linked to task">Task</span>'         : '';
  const userTaskBadge = issue.user_task_id ? '<span class="badge-user-task" title="Linked to user task">User Task</span>' : '';
  const epicBadge     = issue.epic_id      ? '<span class="badge-epic"  title="Promoted to epic">Epic</span>'       : '';
  const hasOutgoing   = (issue.linked_issue_ids || []).length > 0 || !!issue.linked_issue_id;
  const hasIncoming   = _ipLinkedTargetIds.has(issue.id);
  const linkedBadge   = issue.is_duplicate
    ? '<span class="badge-duplicate">Duplicate</span>'
    : (hasOutgoing || hasIncoming) ? '<span class="badge-linked">Linked</span>' : '';
  const connectedHtml = [devBadge, taskBadge, userTaskBadge, epicBadge, linkedBadge].filter(Boolean).join(' ') || '<span class="text-muted">—</span>';

  const safeId = escHtml(issue.id);
  return `<tr class="iss-row-clickable" onclick="ipOpenIssueModal('${safeId}')">
    <td>${ticketRef}<span class="user-name">${escHtml(issue.site_name || '')}</span></td>
    <td>${escHtml(issue.employee_name || '')}<br><small class="text-muted">${escHtml(issue.company_name || '')}</small></td>
    <td class="issue-desc-cell">${escHtml(titleText)}</td>
    <td>${prioBadge}</td>
    <td>${statusBadge}</td>
    <td>${confirmedCell}</td>
    <td class="iss-connected-cell" onclick="event.stopPropagation()">${connectedHtml}</td>
    <td>${issue.assigned_to ? `<code class="mono-val">${escHtml(issue.assigned_to)}</code>` : '<span class="text-muted">—</span>'}</td>
    <td class="date-cell">${fmtDateTime(issue.created_at)}${_ipAgePill(issue)}</td>
  </tr>`;
}

/* ── Issue detail modal — read-only for most staff; admins & department
   heads get the editable fields and Actions menu, same as /admin ── */
let _ipEditingIssueId = null;
let _ipCanManage      = false;

function _ipDescPreview(raw, max = 110) {
  if (!raw) return '';
  const text = _stripHtml(raw).replace(/\s+/g, ' ');
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/* Populates the "Legacy Ticket Details" block shown for issues brought in
   via the bulk importer (issue.imported_from). `ids` maps logical slots to
   this page's actual element ids. */
function _renderIssueLegacySection(issue, ids) {
  const group = document.getElementById(ids.group);
  if (!group) return;
  if (!issue.imported_from) {
    group.style.display = 'none';
    return;
  }
  group.style.display = '';

  const ticketField = document.getElementById(ids.ticketField);
  if (issue.legacy_ticket_id) {
    ticketField.style.display = '';
    document.getElementById(ids.ticketId).textContent = issue.legacy_ticket_id;
  } else {
    ticketField.style.display = 'none';
  }

  const assigneeField = document.getElementById(ids.assigneeField);
  if (issue.legacy_assignee_name) {
    assigneeField.style.display = '';
    document.getElementById(ids.assignee).textContent = issue.legacy_assignee_name;
  } else {
    assigneeField.style.display = 'none';
  }

  document.getElementById(ids.source).textContent     = issue.imported_from;
  document.getElementById(ids.importedAt).textContent = issue.imported_at ? fmtDateTime(issue.imported_at) : '—';

  const rawToggle = document.getElementById(ids.rawToggle);
  const rawEntries = issue.legacy_raw_data && typeof issue.legacy_raw_data === 'object'
    ? Object.entries(issue.legacy_raw_data).filter(([, v]) => v !== null && v !== '')
    : [];
  if (rawEntries.length) {
    rawToggle.style.display = '';
    document.getElementById(ids.rawBody).innerHTML = rawEntries
      .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(String(v))}</td></tr>`)
      .join('');
  } else {
    rawToggle.style.display = 'none';
  }
}

async function ipOpenIssueModal(id) {
  const issue = _ipIssuesCache.find(i => i.id === id);
  if (!issue) return;
  _ipEditingIssueId = id;

  document.getElementById('ipIssueModalLoading').style.display = 'none';
  document.getElementById('ipIssueModalError').style.display   = 'none';
  document.getElementById('ipIssueModalActions').style.display = _ipCanManage ? '' : 'none';

  const titleRef = issue.ticket_number ? `[${issue.ticket_number}] ${issue.site_name || ''}` : `Issue: ${issue.site_name || ''}`;
  document.getElementById('ipIssModalTitle').textContent = titleRef;
  document.getElementById('ipIssModalMeta').textContent  = `Submitted ${fmtDateTime(issue.created_at)}`;
  document.getElementById('ipIssReporter').textContent   = issue.employee_name || '—';
  document.getElementById('ipIssCompany').textContent    = issue.company_name || '—';
  document.getElementById('ipIssEmail').innerHTML        = issue.email
    ? `<a href="mailto:${escHtml(issue.email)}" class="tbl-link">${escHtml(issue.email)}</a>`
    : '—';

  const deptRow = document.getElementById('ipIssDeptRow');
  if (issue.department) {
    document.getElementById('ipIssDepartment').textContent = issue.department;
    deptRow.style.display = '';
  } else {
    deptRow.style.display = 'none';
  }

  document.getElementById('ipIssPriority').innerHTML = PRIORITY_BADGE[(issue.priority || '').toLowerCase()] || '<span class="text-muted">—</span>';
  document.getElementById('ipIssDescription').innerHTML = renderCommentPreview(issue.description || '');

  const isTerminal = ['resolved', 'closed'].includes(issue.status);

  // Reporter's own attachments
  const repUrls  = issue.attachment_urls || [];
  const attGroup = document.getElementById('ipIssAttachmentsGroup');
  const attList  = document.getElementById('ipIssAttachmentsList');
  if (repUrls.length > 0) {
    attGroup.style.display = '';
    attList.innerHTML = repUrls.map(u => {
      const name  = decodeURIComponent(u.split('/').pop().replace(/^\d+_/, ''));
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
      if (isImg) {
        return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-thumb attach-thumb-modal" title="${escHtml(name)}"><img src="${escHtml(u)}" alt="${escHtml(name)}" loading="lazy"></a>`;
      }
      return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-link"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escHtml(name)}</a>`;
    }).join('');
  } else {
    attGroup.style.display = 'none';
  }

  if (_ipCanManage) {
    document.getElementById('ipIssTitleGroup').style.display = '';
    document.getElementById('ipIssTitleInput').value = issue.title || '';

    document.getElementById('ipIssStatus').style.display = 'none';
    const statusSel = document.getElementById('ipIssStatusSelect');
    statusSel.style.display = '';
    statusSel.value = issue.status;

    document.getElementById('ipIssAssignedTo').style.display = 'none';
    const assignSel = document.getElementById('ipIssAssignedToSelect');
    assignSel.style.display = '';

    document.getElementById('ipIssReqDeptGroup').style.display = '';

    await _ipEnsureDevelopers();
    assignSel.innerHTML = '<option value="">— Unassigned —</option>' +
      _ipDevelopersCache.map(u => {
        const label = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
        const selected = u.username === issue.assigned_to ? ' selected' : '';
        return `<option value="${escHtml(u.username)}"${selected}>${escHtml(label)} (@${escHtml(u.username)})</option>`;
      }).join('');

    await _ipEnsureDepartments();
    _ipFillDeptSelect('ipIssReqDept', issue.request_to_department_id || '', true);

    _ipToggleIssueResolution(issue.status);
    document.getElementById('ipIssResolutionNotes').value = issue.resolution_notes || '';
    document.getElementById('ipIssResolvedByInput').value = issue.resolved_by      || '';

    _ipIssResExistingUrls = Array.isArray(issue.resolution_attachment_urls) ? issue.resolution_attachment_urls.filter(Boolean) : [];
    _ipIssResPendingFiles = [];
    await _ipLoadActionsCache();
    const selectedActionIds = Array.isArray(issue.resolution_action_ids) ? issue.resolution_action_ids : [];
    _ipRenderActionsGrid(selectedActionIds);
    _ipRenderResAttachPreviews();

    const isLinked = !!(issue.dev_item_id || issue.task_id || issue.user_task_id);
    document.getElementById('ipIssRemarksGroup').style.display = isLinked ? 'none' : '';
    document.getElementById('ipIssResolutionRemarks').value    = issue.resolution_remarks || '';

    document.getElementById('ipIssResGroup').style.display = 'none';

    const anyPromoted = !!(issue.dev_item_id || issue.task_id || issue.user_task_id || issue.epic_id);
    ['ipIssPromoteDevBtn', 'ipIssPromoteTaskBtn', 'ipIssPromoteUserTaskBtn', 'ipIssPromoteEpicBtn'].forEach(elId => {
      const el = document.getElementById(elId);
      if (el) el.style.display = anyPromoted ? 'none' : '';
    });
    const promotedNote = document.getElementById('ipIssPromotedNote');
    if (promotedNote) promotedNote.style.display = anyPromoted ? '' : 'none';
    const resolveItem = document.getElementById('ipIssQuickResolveItem');
    if (resolveItem) resolveItem.style.display = isTerminal ? 'none' : '';
    _ipCloseIssActionsMenu();
  } else {
    document.getElementById('ipIssTitleGroup').style.display   = 'none';
    document.getElementById('ipIssStatus').style.display       = '';
    document.getElementById('ipIssStatusSelect').style.display = 'none';
    document.getElementById('ipIssAssignedTo').style.display   = '';
    document.getElementById('ipIssAssignedToSelect').style.display = 'none';
    document.getElementById('ipIssReqDeptGroup').style.display = 'none';
    ['ipIssResolutionEditGroup', 'ipIssResolvedByGroup', 'ipIssActionsGroup', 'ipIssResAttachGroup', 'ipIssRemarksGroup'].forEach(elId => {
      document.getElementById(elId).style.display = 'none';
    });

    const resGroup = document.getElementById('ipIssResGroup');
    const resUrls  = issue.resolution_attachment_urls || [];
    if (isTerminal && (issue.resolution_notes || resUrls.length)) {
      resGroup.style.display = '';
      document.getElementById('ipIssResNotes').innerHTML     = renderCommentPreview(issue.resolution_notes || '');
      document.getElementById('ipIssResolvedBy').textContent = issue.resolved_by || '—';
      document.getElementById('ipIssResAttach').innerHTML = resUrls.map(u => {
        const name  = decodeURIComponent(u.split('/').pop().replace(/^\d+_/, ''));
        const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
        if (isImg) {
          return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="res-attach-thumb"><img src="${escHtml(u)}" alt="${escHtml(name)}" loading="lazy"></a>`;
        }
        return `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="attach-link">${escHtml(name)}</a>`;
      }).join('');
    } else {
      resGroup.style.display = 'none';
    }
  }

  document.getElementById('ipIssStatus').innerHTML       = `<span class="label-badge ${ISSUE_STATUS_CLASS[issue.status] || 'label-rgmc'}">${ISSUE_STATUS_LABELS[issue.status] || issue.status}</span>`;
  document.getElementById('ipIssAssignedTo').textContent = issue.assigned_to || '— Unassigned —';

  const cfGroup   = document.getElementById('ipIssConfirmedFixGroup');
  const cfDisplay = document.getElementById('ipIssConfirmedFixDisplay');
  if (isTerminal) {
    cfGroup.style.display = '';
    if (issue.confirmed_fix) {
      const dt = issue.confirmed_fix_at ? ' on ' + fmtDate(issue.confirmed_fix_at) : '';
      cfDisplay.innerHTML = `<span class="iss-confirmed-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Reporter confirmed fix${escHtml(dt)}</span>`;
    } else {
      cfDisplay.innerHTML = `<span class="iss-unconfirmed-note"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Awaiting reporter confirmation</span>`;
    }
  } else {
    cfGroup.style.display = 'none';
  }

  // Linked items
  const devGroup = document.getElementById('ipIssDevItemGroup');
  if (issue.dev_item_id) {
    devGroup.style.display = '';
    document.getElementById('ipIssDevItemId').textContent = issue.dev_item_id.slice(0, 8) + '…';
    document.getElementById('ipIssDevItemBtn').onclick = () => ipOpenLinkedItemModal('dev_item', issue.dev_item_id);
  } else {
    devGroup.style.display = 'none';
  }

  const taskGroup = document.getElementById('ipIssTaskGroup');
  if (issue.task_id) {
    taskGroup.style.display = '';
    document.getElementById('ipIssTaskId').textContent = issue.task_id.slice(0, 8) + '…';
    document.getElementById('ipIssTaskBtn').onclick = () => ipOpenLinkedItemModal('task', issue.task_id);
  } else {
    taskGroup.style.display = 'none';
  }

  const userTaskGroup = document.getElementById('ipIssUserTaskGroup');
  if (issue.user_task_id) {
    userTaskGroup.style.display = '';
    const el     = document.getElementById('ipIssUserTaskId');
    const cached = _ipUserTaskCodeCache[issue.user_task_id];
    el.textContent = cached || issue.user_task_id.slice(0, 8) + '…';
    if (!cached) _ipFetchUserTaskCode(issue.user_task_id).then(code => { if (code) el.textContent = code; });
    document.getElementById('ipIssUserTaskBtn').onclick = () => ipOpenLinkedItemModal('user_task', issue.user_task_id);
  } else {
    userTaskGroup.style.display = 'none';
  }

  const epicGroup = document.getElementById('ipIssEpicGroup');
  if (issue.epic_id) {
    epicGroup.style.display = '';
    const el     = document.getElementById('ipIssEpicName');
    const cached = _ipEpicNameCache[issue.epic_id];
    el.textContent = cached || String(issue.epic_id);
    if (!cached) _ipFetchEpicName(issue.epic_id).then(name => { if (name) el.textContent = name; });
  } else {
    epicGroup.style.display = 'none';
  }

  const linkGroup   = document.getElementById('ipIssLinkGroup');
  const linkLabel   = document.getElementById('ipIssLinkLabel');
  const linkDisplay = document.getElementById('ipIssLinkDisplay');
  const allLinkedIds = Array.from(new Set([
    ...(issue.linked_issue_ids || []),
    ...(issue.linked_issue_id ? [issue.linked_issue_id] : []),
  ]));
  if (allLinkedIds.length) {
    linkGroup.style.display = '';
    linkLabel.textContent   = issue.is_duplicate ? 'Duplicate of' : `Linked Issues (${allLinkedIds.length})`;
    linkDisplay.innerHTML = allLinkedIds.map(lid => {
      const linked = _ipIssuesCache.find(i => i.id === lid);
      const ticket = linked?.ticket_number || lid.slice(0, 8);
      const title  = linked?.title || _ipDescPreview(linked?.description, 80) || '';
      const isDup  = issue.is_duplicate && lid === issue.linked_issue_id;
      const badge  = isDup ? '<span class="badge-duplicate">Duplicate</span>' : '<span class="badge-linked">Linked</span>';
      return `<div style="margin-bottom:4px;cursor:pointer;" onclick="ipOpenLinkedItemModal('issue','${escHtml(lid)}')">${badge} <span class="iss-link-ref">#${escHtml(ticket)}</span>${title ? ` — <span class="iss-link-ref-title">${escHtml(title)}</span>` : ''}</div>`;
    }).join('');
  } else {
    linkGroup.style.display = 'none';
    linkDisplay.innerHTML   = '';
  }

  const refByGroup   = document.getElementById('ipIssReferencedByGroup');
  const refByList    = document.getElementById('ipIssReferencedByList');
  const referencers  = _ipIssuesCache.filter(i =>
    (i.linked_issue_ids || []).includes(issue.id) || i.linked_issue_id === issue.id
  );
  if (referencers.length) {
    refByGroup.style.display = '';
    refByList.innerHTML = referencers.map(ref => {
      const tk    = ref.ticket_number ? `#${escHtml(ref.ticket_number)}` : escHtml(ref.id.slice(0, 8)) + '…';
      const ttl   = escHtml(ref.title || _ipDescPreview(ref.description, 80));
      const isDup = ref.is_duplicate && ref.linked_issue_id === issue.id;
      const badge = isDup ? '<span class="badge-duplicate">Duplicate</span>' : '<span class="badge-linked">Linked</span>';
      return `<div style="margin-bottom:4px;cursor:pointer;" onclick="ipOpenLinkedItemModal('issue','${escHtml(ref.id)}')">${badge} <span class="iss-link-ref">${tk}</span>${ttl ? ` — <span class="iss-link-ref-title">${ttl}</span>` : ''}</div>`;
    }).join('');
  } else {
    refByGroup.style.display = 'none';
  }

  _renderIssueLegacySection(issue, {
    group: 'ipIssLegacyGroup', ticketField: 'ipIssLegacyTicketField', ticketId: 'ipIssLegacyTicketId',
    assigneeField: 'ipIssLegacyAssigneeField', assignee: 'ipIssLegacyAssignee',
    source: 'ipIssLegacySource', importedAt: 'ipIssLegacyImportedAt',
    rawToggle: 'ipIssLegacyRawToggle', rawBody: 'ipIssLegacyRawBody',
  });

  document.getElementById('ipIssCommentInput').value = '';
  document.getElementById('ipIssueModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  ipLoadIssueActivity(id);
}

function ipCloseIssueModal() {
  document.getElementById('ipIssueModal').classList.remove('open');
  document.body.style.overflow = '';
  _ipEditingIssueId = null;
  _ipCloseIssActionsMenu();
}

/* ── Manage-mode support: developers / users / departments / resolution actions ── */
let _ipDevelopersCache    = [];
let _ipAllUsersCache      = null;
let _ipSystemsCache       = null;
let _ipDeptsCache         = null;
let _ipActionsCache       = null;
let _ipIssResExistingUrls = [];
let _ipIssResPendingFiles = [];
const _ipEpicNameCache     = {};
const _ipUserTaskCodeCache = {};

async function _ipEnsureDevelopers() {
  if (_ipDevelopersCache.length > 0) return;
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    if (res.ok) {
      const all = await res.json();
      _ipDevelopersCache = all.filter(u => u.is_developer);
    }
  } catch { /* non-fatal */ }
}

async function _ipEnsureAllUsers() {
  if (_ipAllUsersCache) return _ipAllUsersCache;
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    _ipAllUsersCache = res.ok ? await res.json() : [];
  } catch { _ipAllUsersCache = []; }
  return _ipAllUsersCache;
}

async function _ipEnsureDepartments() {
  if (_ipDeptsCache) return _ipDeptsCache;
  try {
    const res = await fetch('/api/departments');
    _ipDeptsCache = res.ok ? await res.json() : [];
  } catch { _ipDeptsCache = []; }
  return _ipDeptsCache;
}

function _ipFillDeptSelect(selId, selectedVal, byId = false) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const placeholder = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(placeholder);
  (_ipDeptsCache || []).forEach(d => {
    const opt = document.createElement('option');
    opt.value = byId ? d.department_id : d.department_name;
    opt.textContent = `${d.department_code} — ${d.department_name}`;
    if (byId ? String(d.department_id) === String(selectedVal) : d.department_name === selectedVal) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function _ipFetchEpicName(id) {
  if (_ipEpicNameCache[id]) return _ipEpicNameCache[id];
  try {
    const res = await fetch(`/api/admin/linked/epic/${encodeURIComponent(id)}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const item = await res.json();
    if (item.epic_name) _ipEpicNameCache[id] = item.epic_name;
    return item.epic_name || null;
  } catch { return null; }
}

async function _ipFetchUserTaskCode(id) {
  if (_ipUserTaskCodeCache[id]) return _ipUserTaskCodeCache[id];
  try {
    const res = await fetch(`/api/admin/linked/user-task/${encodeURIComponent(id)}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const item = await res.json();
    if (item.task_code) _ipUserTaskCodeCache[id] = item.task_code;
    return item.task_code || null;
  } catch { return null; }
}

/* ── Linked item preview modal (dev item / task / user task / issue) ──
   Opens on top of the issue modal without closing it — clicking a dev item,
   task, user task, or linked/referenced issue shows a read-only preview. */
const _ipLinkedItemTypeLabels = {
  dev_item:  { title: 'Dev Board Item',  endpoint: id => `/api/admin/linked/dev-item/${encodeURIComponent(id)}` },
  task:      { title: 'Task Board Item', endpoint: id => `/api/admin/linked/task/${encodeURIComponent(id)}` },
  user_task: { title: 'User Task',       endpoint: id => `/api/admin/linked/user-task/${encodeURIComponent(id)}` },
  issue:     { title: 'Issue',           endpoint: id => `/api/public/issues/${encodeURIComponent(id)}` },
};

async function ipOpenLinkedItemModal(type, id) {
  const meta = _ipLinkedItemTypeLabels[type];
  if (!meta || !id) return;
  document.getElementById('ipLinkedItemModalTitle').textContent = meta.title;
  document.getElementById('ipLinkedItemModalMeta').textContent  = '';
  document.getElementById('ipLinkedItemModalBody').innerHTML =
    '<div class="admin-loading"><div class="spinner"></div><span>Loading…</span></div>';
  document.getElementById('ipLinkedItemModal').classList.add('open');

  try {
    let item = type === 'issue' ? _ipIssuesCache.find(i => i.id === id) : null;
    if (!item) {
      const res = await fetch(meta.endpoint(id), { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      item = await res.json();
    }
    document.getElementById('ipLinkedItemModalBody').innerHTML = _ipRenderLinkedItemBody(type, item);
    document.getElementById('ipLinkedItemModalMeta').textContent = _ipLinkedItemCode(type, item);
  } catch (err) {
    document.getElementById('ipLinkedItemModalBody').innerHTML =
      `<div class="admin-error">${escHtml(err.message)}</div>`;
  }
}

function ipCloseLinkedItemModal() {
  document.getElementById('ipLinkedItemModal').classList.remove('open');
}

function ipOverlayCloseLinkedItem(e) {
  if (e.target === document.getElementById('ipLinkedItemModal')) ipCloseLinkedItemModal();
}

function _ipLinkedItemCode(type, item) {
  if (type === 'dev_item')  return item.dev_item_code || '';
  if (type === 'task')      return item.task_code     || '';
  if (type === 'user_task') return item.task_code     || '';
  if (type === 'issue')     return item.ticket_number ? `#${item.ticket_number}` : (item.id ? item.id.slice(0, 8) + '…' : '');
  return '';
}

function _ipFmtLinkedDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function _ipRenderLinkedItemBody(type, item) {
  const rows = [];
  const statusHtml = item.status
    ? `<span class="linked-status-badge linked-status-${escHtml(item.status.replace('_', '-'))}">${escHtml(item.status.replace('_', ' '))}</span>`
    : '—';

  if (type === 'dev_item') {
    const name = escHtml(item.title || '—');
    const desc = item.description || '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Title</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        `<div class="form-group"><label class="form-label">Type</label><p class="modal-detail-val">${escHtml(item.dev_item_type || '—')}</p></div>` +
      `</div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Start Date</label><p class="modal-detail-val">${_ipFmtLinkedDate(item.start_date)}</p></div>` +
        `<div class="form-group"><label class="form-label">Est. End Date</label><p class="modal-detail-val">${_ipFmtLinkedDate(item.estimated_end_date)}</p></div>` +
      `</div>`,
    );
    if (item.actual_end_date) rows.push(
      `<div class="form-group"><label class="form-label">Completed</label><p class="modal-detail-val">${_ipFmtLinkedDate(item.actual_end_date)}</p></div>`
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${renderCommentPreview(desc)}</p></div>`
    );

  } else if (type === 'task') {
    const name = escHtml(item.task_name || '—');
    const desc = item.description || '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Task Name</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        `<div class="form-group"><label class="form-label">Type</label><p class="modal-detail-val">${escHtml(item.task_type || '—')}</p></div>` +
      `</div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Start Date</label><p class="modal-detail-val">${_ipFmtLinkedDate(item.start_date)}</p></div>` +
        `<div class="form-group"><label class="form-label">Est. End Date</label><p class="modal-detail-val">${_ipFmtLinkedDate(item.estimated_end_date)}</p></div>` +
      `</div>`,
    );
    if (item.assigned_to) rows.push(
      `<div class="form-group"><label class="form-label">Assigned To</label><p class="modal-detail-val">${escHtml(item.assigned_to)}</p></div>`
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${renderCommentPreview(desc)}</p></div>`
    );

  } else if (type === 'user_task') {
    const name = escHtml(item.title || '—');
    const desc = item.description || '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Title</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        (item.department_name ? `<div class="form-group"><label class="form-label">Department</label><p class="modal-detail-val">${escHtml(item.department_name)}</p></div>` : '') +
      `</div>`,
    );
    if (item.assigned_to) rows.push(
      `<div class="form-group"><label class="form-label">Assigned To</label><p class="modal-detail-val">${escHtml(item.assigned_to)}</p></div>`
    );
    if (item.created_by) rows.push(
      `<div class="form-group"><label class="form-label">Created by</label><p class="modal-detail-val">${escHtml(item.created_by)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${renderCommentPreview(desc)}</p></div>`
    );

  } else { // issue
    const name = escHtml(item.title || _ipDescPreview(item.description, 80) || '—');
    const desc = item.description || '';
    rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Title</label><p class="modal-detail-val">${name}</p></div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Status</label><p class="modal-detail-val">${statusHtml}</p></div>` +
        `<div class="form-group"><label class="form-label">Priority</label><p class="modal-detail-val">${PRIORITY_BADGE[(item.priority || '').toLowerCase()] || '<span class="text-muted">—</span>'}</p></div>` +
      `</div>`,
      `<div class="form-row">` +
        `<div class="form-group"><label class="form-label">Reporter</label><p class="modal-detail-val">${escHtml(item.employee_name || '—')}</p></div>` +
        `<div class="form-group"><label class="form-label">Company</label><p class="modal-detail-val">${escHtml(item.company_name || '—')}</p></div>` +
      `</div>`,
    );
    if (item.assigned_to) rows.push(
      `<div class="form-group"><label class="form-label">Assigned To</label><p class="modal-detail-val">${escHtml(item.assigned_to)}</p></div>`
    );
    if (desc) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Description</label><p class="modal-detail-val linked-item-desc">${renderCommentPreview(desc)}</p></div>`
    );
    if (item.resolution_notes) rows.push(
      `<div class="form-group form-group-full"><label class="form-label">Resolution Notes</label><p class="modal-detail-val linked-item-desc">${renderCommentPreview(item.resolution_notes)}</p></div>`
    );
  }

  return rows.join('');
}

function _ipToggleIssueResolution(status) {
  const isTerminal = status === 'resolved' || status === 'closed';
  ['ipIssResolutionEditGroup', 'ipIssResolvedByGroup', 'ipIssActionsGroup', 'ipIssResAttachGroup', 'ipIssConfirmedFixGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isTerminal ? '' : 'none';
  });
}

function ipOnIssueAssigneeChange() {
  const assignee = document.getElementById('ipIssAssignedToSelect').value;
  if (!assignee) return;
  const statusSel = document.getElementById('ipIssStatusSelect');
  if (statusSel && statusSel.value === 'open') {
    statusSel.value = 'in_progress';
    _ipToggleIssueResolution('in_progress');
  }
}

/* ── Resolution actions checklist + attachments ── */
async function _ipLoadActionsCache() {
  if (_ipActionsCache) return _ipActionsCache;
  try {
    const r = await fetch('/api/actions');
    _ipActionsCache = r.ok ? await r.json() : [];
  } catch { _ipActionsCache = []; }
  return _ipActionsCache;
}

function _ipRenderActionsGrid(selectedIds = []) {
  const grid = document.getElementById('ipIssActionsGrid');
  if (!grid) return;
  const actions = _ipActionsCache || [];
  if (!actions.length) {
    grid.innerHTML = '<span class="res-actions-empty">No actions configured.</span>';
    return;
  }
  grid.innerHTML = actions.map(a => {
    const checked = selectedIds.includes(a.action_id) ? ' checked' : '';
    const cls     = selectedIds.includes(a.action_id) ? ' checked' : '';
    return `<label class="res-action-item${cls}" title="${escHtml(a.action_desc || '')}">
      <input type="checkbox" value="${a.action_id}"${checked} onchange="this.closest('.res-action-item').classList.toggle('checked',this.checked)">
      ${escHtml(a.action_name)}
    </label>`;
  }).join('');
}

function _ipGetCheckedActionIds() {
  const grid = document.getElementById('ipIssActionsGrid');
  if (!grid) return [];
  return Array.from(grid.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value, 10));
}

function _ipRenderResAttachPreviews() {
  const wrap = document.getElementById('ipIssResAttachPreviews');
  if (!wrap) return;
  const totalCount = _ipIssResExistingUrls.length + _ipIssResPendingFiles.length;
  const addBtn = document.getElementById('ipIssResAttachAddBtn');
  if (addBtn) addBtn.style.display = totalCount >= 5 ? 'none' : '';

  let html = _ipIssResExistingUrls.map((url, i) => `
    <div class="res-attach-thumb" data-index="${i}" data-type="existing">
      <img src="${escHtml(url)}" alt="attachment">
      <button type="button" class="res-attach-remove" onclick="ipResRemoveExisting(${i})" title="Remove">&times;</button>
    </div>`).join('');
  html += _ipIssResPendingFiles.map((f, i) => `
    <div class="res-attach-thumb" data-index="${i}" data-type="pending">
      <img src="${escHtml(URL.createObjectURL(f))}" alt="${escHtml(f.name)}">
      <button type="button" class="res-attach-remove" onclick="ipResRemovePending(${i})" title="Remove">&times;</button>
    </div>`).join('');
  wrap.innerHTML = html;
}

function ipResAttachChange(input) {
  const remaining = 5 - _ipIssResExistingUrls.length - _ipIssResPendingFiles.length;
  const files = Array.from(input.files).slice(0, remaining);
  _ipIssResPendingFiles.push(...files);
  input.value = '';
  _ipRenderResAttachPreviews();
}

function ipResRemoveExisting(i) { _ipIssResExistingUrls.splice(i, 1); _ipRenderResAttachPreviews(); }
function ipResRemovePending(i)  { _ipIssResPendingFiles.splice(i, 1); _ipRenderResAttachPreviews(); }

async function _ipUploadIssResFiles(issueId) {
  const urls = [];
  for (const file of _ipIssResPendingFiles) {
    const fd = new FormData();
    fd.append('entity_type', 'issue');
    fd.append('entity_id',   issueId);
    fd.append('file',        file);
    try {
      const r = await fetch('/api/upload/resolution', { method: 'POST', headers: authHeaders(), body: fd });
      const d = await r.json();
      if (d.url) urls.push(d.url);
    } catch { /* skip failed upload */ }
  }
  return [..._ipIssResExistingUrls, ...urls];
}

/* ── Save / Quick Resolve ── */
async function ipSaveIssuePatch() {
  if (!_ipEditingIssueId) return;
  const status     = document.getElementById('ipIssStatusSelect').value;
  const assignedTo = document.getElementById('ipIssAssignedToSelect').value || null;

  document.getElementById('ipIssueModalActions').style.display = 'none';
  document.getElementById('ipIssueModalLoading').style.display = '';
  document.getElementById('ipIssueModalError').style.display   = 'none';

  try {
    const isTerminal = status === 'resolved' || status === 'closed';
    const reqDeptRaw = document.getElementById('ipIssReqDept').value;

    let resAttachUrls = undefined;
    if (isTerminal) resAttachUrls = await _ipUploadIssResFiles(_ipEditingIssueId);

    const body = {
      status,
      assigned_to:              assignedTo,
      title:                    document.getElementById('ipIssTitleInput').value.trim() || null,
      request_to_department_id: reqDeptRaw ? parseInt(reqDeptRaw, 10) : null,
      resolution_notes:           isTerminal ? (document.getElementById('ipIssResolutionNotes').value.trim() || null) : undefined,
      resolved_by:                isTerminal ? (document.getElementById('ipIssResolvedByInput').value.trim() || null) : undefined,
      resolution_action_ids:      isTerminal ? _ipGetCheckedActionIds()                                               : undefined,
      resolution_attachment_urls: isTerminal ? resAttachUrls                                                          : undefined,
      resolution_remarks:         document.getElementById('ipIssRemarksGroup')?.style.display !== 'none'
                                    ? (document.getElementById('ipIssResolutionRemarks').value.trim() || null)
                                    : undefined,
    };
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    ipCloseIssueModal();
    showToast('Issue updated.');
    loadIssuesPage();
  } catch (err) {
    document.getElementById('ipIssueModalLoading').style.display = 'none';
    document.getElementById('ipIssueModalActions').style.display = '';
    document.getElementById('ipIssueModalError').style.display   = '';
    document.getElementById('ipIssueModalErrorMsg').textContent  = err.message;
  }
}

/* ── Issue Actions submenu ── */
let _ipIssActionsOpen = false;

function ipToggleIssActionsMenu(e) {
  if (e) e.stopPropagation();
  _ipIssActionsOpen ? _ipCloseIssActionsMenu() : _ipOpenIssActionsMenu();
}
function _ipOpenIssActionsMenu() {
  _ipIssActionsOpen = true;
  document.getElementById('ipIssActionsMenu')?.classList.add('open');
  document.getElementById('ipIssActionsWrap')?.classList.add('open');
}
function _ipCloseIssActionsMenu() {
  _ipIssActionsOpen = false;
  document.getElementById('ipIssActionsMenu')?.classList.remove('open');
  document.getElementById('ipIssActionsWrap')?.classList.remove('open');
}

function ipQuickResolveIssue() {
  if (!_ipEditingIssueId) return;
  _ipCloseIssActionsMenu();
  const session  = loadSession();
  const fullName = (session?.fullName || session?.firstName || session?.username || '').trim();
  document.getElementById('ipQrResolvedBy').value      = fullName;
  document.getElementById('ipQrResolutionNotes').value = '';
  document.getElementById('ipQuickResolveOverlay').classList.add('open');
}
function ipCloseQuickResolveModal() {
  document.getElementById('ipQuickResolveOverlay')?.classList.remove('open');
}
async function ipSubmitQuickResolve() {
  if (!_ipEditingIssueId) return;
  const resolvedBy      = document.getElementById('ipQrResolvedBy').value.trim();
  const resolutionNotes = document.getElementById('ipQrResolutionNotes').value.trim();
  ipCloseQuickResolveModal();
  document.getElementById('ipIssueModalActions').style.display = 'none';
  document.getElementById('ipIssueModalLoading').style.display = '';
  document.getElementById('ipIssueModalError').style.display   = 'none';
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}`, {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        status:           'resolved',
        resolved_by:      resolvedBy || undefined,
        resolution_notes: resolutionNotes || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resolve issue');
    ipCloseIssueModal();
    showToast('Issue marked as resolved.');
    loadIssuesPage();
  } catch (err) {
    document.getElementById('ipIssueModalLoading').style.display = 'none';
    document.getElementById('ipIssueModalActions').style.display = '';
    document.getElementById('ipIssueModalError').style.display   = '';
    document.getElementById('ipIssueModalErrorMsg').textContent  = err.message;
  }
}

/* ── Promote to Dev Item / Admin Task ── */
let _ipPromoteType        = null;
let _ipPromoteSystemsData = [];

async function ipOpenPromoteModal(type) {
  if (!_ipEditingIssueId) return;
  _ipCloseIssActionsMenu();
  _ipPromoteType = type;

  const titles = { dev: 'Promote to Dev Item', task: 'Promote to Admin Task' };
  const subs   = { dev: 'A dev board item will be created linked to this issue.', task: 'An admin task will be created linked to this issue.' };
  document.getElementById('ipPromoteModalTitle').textContent = titles[type] || 'Promote Issue';
  document.getElementById('ipPromoteModalSub').textContent   = subs[type]  || '';

  await _ipEnsureDevelopers();
  const sel = document.getElementById('ipPromoteAssigneeSelect');
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    _ipDevelopersCache.map(u => {
      const label = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      return `<option value="${escHtml(u.username)}">${escHtml(label)} (@${escHtml(u.username)})</option>`;
    }).join('');

  const devFields = document.getElementById('ipPromoteDevFields');
  if (devFields) devFields.style.display = type === 'dev' ? '' : 'none';

  if (type === 'dev') {
    const issue = _ipIssuesCache.find(i => i.id === _ipEditingIssueId);
    if (issue) {
      const _pd       = _stripHtml(issue.description || '');
      const autoTitle = issue.title || `[${issue.site_name}] ${_pd.slice(0, 80)}${_pd.length > 80 ? '…' : ''}`;
      document.getElementById('ipPromoteDevTitle').value = autoTitle;

      const dept = issue.department ? `, ${issue.department}` : '';
      document.getElementById('ipPromoteDevDesc').value =
        `Reported by ${issue.employee_name} (${issue.company_name || ''}${dept})\nEmail: ${issue.email}\n\n${_pd}`;

      await _ipLoadPromoteSystems(issue.site_name);
    }
  }

  document.getElementById('ipPromoteModal').classList.add('open');
}

async function _ipLoadPromoteSystems(preSelectSiteName) {
  const listEl = document.getElementById('ipPromoteSystemsList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="promote-systems-msg">Loading systems…</div>';
  try {
    if (!_ipSystemsCache || !_ipSystemsCache.length) {
      const res = await fetch('/api/admin/systems', { headers: authHeaders() });
      if (res.ok) _ipSystemsCache = await res.json();
    }
    _ipPromoteSystemsData = (_ipSystemsCache || []).filter(s => !s.is_task);
  } catch {
    _ipPromoteSystemsData = [];
  }
  _ipRenderPromoteSystems(preSelectSiteName);
}

function _ipRenderPromoteSystems(preSelectSiteName) {
  const listEl = document.getElementById('ipPromoteSystemsList');
  if (!listEl) return;
  const q = (document.getElementById('ipPromoteSystemSearch')?.value || '').toLowerCase().trim();
  const filtered = q
    ? _ipPromoteSystemsData.filter(s => (s.name || '').toLowerCase().includes(q))
    : _ipPromoteSystemsData;
  if (!filtered.length) {
    listEl.innerHTML = '<div class="promote-systems-msg">No systems match your search</div>';
    return;
  }
  listEl.innerHTML = filtered.map(s => {
    const checked = preSelectSiteName && (s.name || '').toLowerCase() === (preSelectSiteName || '').toLowerCase() ? 'checked' : '';
    return `<label class="promote-system-item">
      <input type="checkbox" class="promote-system-chk" value="${escHtml(s.id)}" ${checked}>
      <span>${escHtml(s.name)}</span>
    </label>`;
  }).join('');
}

function ipFilterPromoteSystems() { _ipRenderPromoteSystems(null); }

async function ipSubmitPromote() {
  if (!_ipEditingIssueId || !_ipPromoteType) return;
  const assignee = document.getElementById('ipPromoteAssigneeSelect').value.trim();
  const endpoint = _ipPromoteType === 'dev' ? 'promote' : 'promote-task';
  const toastMsg = _ipPromoteType === 'dev' ? 'Issue promoted to dev board item.' : 'Issue promoted to task board.';

  const body = { assigned_to: assignee || null };
  if (_ipPromoteType === 'dev') {
    const title     = (document.getElementById('ipPromoteDevTitle')?.value || '').trim();
    const desc      = (document.getElementById('ipPromoteDevDesc')?.value || '').trim();
    const systemIds = Array.from(document.querySelectorAll('#ipPromoteSystemsList .promote-system-chk:checked')).map(c => c.value);
    if (title)            body.title       = title;
    if (desc)             body.description = desc;
    if (systemIds.length) body.system_ids  = systemIds;
  }

  document.getElementById('ipPromoteModal').classList.remove('open');
  document.getElementById('ipIssueModalActions').style.display = 'none';
  document.getElementById('ipIssueModalLoading').style.display = '';
  document.getElementById('ipIssueModalError').style.display   = 'none';

  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}/${endpoint}`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    ipCloseIssueModal();
    showToast(toastMsg);
    loadIssuesPage();
  } catch (err) {
    document.getElementById('ipIssueModalLoading').style.display = 'none';
    document.getElementById('ipIssueModalActions').style.display = '';
    document.getElementById('ipIssueModalError').style.display   = '';
    document.getElementById('ipIssueModalErrorMsg').textContent  = err.message;
  }
}

/* ── Promote to Epic ── */
function ipPromoteIssueToEpic() {
  if (!_ipEditingIssueId) return;
  _ipCloseIssActionsMenu();
  const issue  = _ipIssuesCache.find(i => i.id === _ipEditingIssueId);
  const nameEl = document.getElementById('ipPromoteEpicName');
  if (nameEl) nameEl.value = issue?.title || '';
  const errEl = document.getElementById('ipPromoteEpicError');
  if (errEl) errEl.style.display = 'none';
  const submitBtn = document.getElementById('ipPromoteEpicSubmitBtn');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Promote'; }
  document.getElementById('ipPromoteEpicModal').classList.add('open');
  setTimeout(() => nameEl?.focus(), 80);
}
function ipClosePromoteEpicModal() {
  document.getElementById('ipPromoteEpicModal')?.classList.remove('open');
}
async function ipSubmitPromoteEpic() {
  if (!_ipEditingIssueId) return;
  const nameEl    = document.getElementById('ipPromoteEpicName');
  const errEl     = document.getElementById('ipPromoteEpicError');
  const submitBtn = document.getElementById('ipPromoteEpicSubmitBtn');
  const epicName  = (nameEl?.value || '').trim();
  if (errEl) errEl.style.display = 'none';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Promoting…'; }
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}/promote-epic`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ epic_name: epicName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    ipClosePromoteEpicModal();
    ipCloseIssueModal();
    showToast('Issue promoted to epic.');
    loadIssuesPage();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Promote'; }
  }
}

/* ── Promote to User Task ── */
async function ipPromoteIssueToUserTask() {
  if (!_ipEditingIssueId) return;
  _ipCloseIssActionsMenu();

  await Promise.all([_ipEnsureDepartments(), _ipEnsureAllUsers()]);

  const deptSel = document.getElementById('ipPutDeptSelect');
  deptSel.innerHTML = '<option value="">— Any Department —</option>' +
    (_ipDeptsCache || []).map(d => `<option value="${d.department_id}">${escHtml(d.department_name)}</option>`).join('');

  const userSel = document.getElementById('ipPutUserSelect');
  userSel.innerHTML = '<option value="">— Unassigned —</option>' +
    (_ipAllUsersCache || []).map(u => {
      const label = u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      return `<option value="${escHtml(u.username)}">${escHtml(label)} (@${escHtml(u.username)})</option>`;
    }).join('');

  document.getElementById('ipPromoteUserTaskModal').classList.add('open');
}
function ipClosePromoteUserTaskModal() {
  document.getElementById('ipPromoteUserTaskModal')?.classList.remove('open');
}
async function ipSubmitPromoteUserTask() {
  if (!_ipEditingIssueId) return;
  const deptSel  = document.getElementById('ipPutDeptSelect');
  const userSel  = document.getElementById('ipPutUserSelect');
  const deptId   = deptSel.value || null;
  const deptName = deptId ? deptSel.options[deptSel.selectedIndex].textContent : '';
  const username = userSel.value || null;

  document.getElementById('ipPromoteUserTaskModal').classList.remove('open');
  document.getElementById('ipIssueModalActions').style.display = 'none';
  document.getElementById('ipIssueModalLoading').style.display = '';
  document.getElementById('ipIssueModalError').style.display   = 'none';

  const body = {};
  if (username) body.assigned_to     = username;
  if (deptId)   body.department_id   = parseInt(deptId, 10);
  if (deptName) body.department_name = deptName;

  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}/promote-user-task`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Promote failed');
    ipCloseIssueModal();
    showToast('Issue promoted to user task.');
    loadIssuesPage();
  } catch (err) {
    document.getElementById('ipIssueModalLoading').style.display = 'none';
    document.getElementById('ipIssueModalActions').style.display = '';
    document.getElementById('ipIssueModalError').style.display   = '';
    document.getElementById('ipIssueModalErrorMsg').textContent  = err.message;
    document.getElementById('ipPromoteUserTaskModal').classList.add('open');
  }
}

/* ── Issue Link / Duplicate Modal ──
   Department heads only get the "Another Issue" tab — Task/Dev Item linking
   stays admin/management-only since it reaches into boards they can't otherwise see. */
let _ipLinkTab           = 'issue';
let _ipLinkSelectedId    = null;
let _ipLinkSelectedLabel = '';
let _ipLinkTasksCache    = null;
let _ipLinkDevCache      = null;
let _ipLinkSearchTimers  = {};

function ipOpenIssueLinkModal() {
  _ipCloseIssActionsMenu();
  _ipLinkTab           = 'issue';
  _ipLinkSelectedId    = null;
  _ipLinkSelectedLabel = '';

  const session    = loadSession();
  const fullAccess = !!(session?.isAdmin || session?.isManagement);
  document.getElementById('ipIssueLinkTaskTabBtn').style.display = fullAccess ? '' : 'none';
  document.getElementById('ipIssueLinkDevTabBtn').style.display  = fullAccess ? '' : 'none';

  document.querySelectorAll('#ipIssueLinkTabs .iss-link-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.ltab === 'issue')
  );
  document.querySelectorAll('#ipIssueLinkModal .iss-link-tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById('ipIssueLinkTabIssue').style.display = '';
  document.getElementById('ipIssueLinkIsDuplicate').checked    = false;
  document.getElementById('ipIssueLinkDevIsDuplicate').checked = false;
  document.getElementById('ipIssueLinkIssueSearch').value = '';
  document.getElementById('ipIssueLinkTaskSearch').value  = '';
  document.getElementById('ipIssueLinkDevSearch').value   = '';
  _ipIssueLinkClearResults();
  _ipIssueLinkUpdateSelected();
  _ipIssueLinkUpdateConfirmBtn();
  document.getElementById('ipIssueLinkLoading').style.display = 'none';
  document.getElementById('ipIssueLinkError').style.display   = 'none';
  document.getElementById('ipIssueLinkModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function ipCloseIssueLinkModal() {
  document.getElementById('ipIssueLinkModal')?.classList.remove('open');
  // don't restore overflow — issue modal is still open behind it
}
function ipSetIssueLinkTab(tab) {
  _ipLinkTab        = tab;
  _ipLinkSelectedId = null;
  document.querySelectorAll('#ipIssueLinkTabs .iss-link-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.ltab === tab)
  );
  document.querySelectorAll('#ipIssueLinkModal .iss-link-tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`ipIssueLinkTab${tab === 'issue' ? 'Issue' : tab === 'task' ? 'Task' : 'Dev'}`).style.display = '';
  _ipIssueLinkUpdateSelected();
  _ipIssueLinkUpdateConfirmBtn();
}
function ipIssueLinkDupChange() { _ipIssueLinkUpdateConfirmBtn(); }
function _ipIssueLinkClearResults() {
  ['ipIssueLinkIssueResults', 'ipIssueLinkTaskResults', 'ipIssueLinkDevResults'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="iss-link-hint">Type to search…</div>';
  });
}
function _ipIssueLinkUpdateSelected() {
  const el    = document.getElementById('ipIssueLinkSelected');
  const label = document.getElementById('ipIssueLinkSelectedLabel');
  if (_ipLinkSelectedId) {
    el.style.display  = '';
    label.textContent = _ipLinkSelectedLabel;
  } else {
    el.style.display  = 'none';
  }
}
function _ipIssueLinkUpdateConfirmBtn() {
  const btn        = document.getElementById('ipIssueLinkConfirmBtn');
  const labelEl    = document.getElementById('ipIssueLinkConfirmLabel');
  const isIssueTab = _ipLinkTab === 'issue';
  const isDevTab   = _ipLinkTab === 'dev_item';
  const isDup      = isIssueTab
    ? document.getElementById('ipIssueLinkIsDuplicate')?.checked
    : isDevTab
      ? document.getElementById('ipIssueLinkDevIsDuplicate')?.checked
      : false;
  const enabled = !!_ipLinkSelectedId;
  btn.disabled  = !enabled;
  if (isDup && (isIssueTab || isDevTab)) {
    labelEl.textContent = isIssueTab ? 'Mark Duplicate & Resolve' : 'Mark Duplicate & Track';
    btn.classList.add('btn-modal-danger');
  } else {
    labelEl.textContent = 'Link';
    btn.classList.remove('btn-modal-danger');
  }
}
function ipIssueLinkDeselect() {
  _ipLinkSelectedId    = null;
  _ipLinkSelectedLabel = '';
  _ipIssueLinkUpdateSelected();
  _ipIssueLinkUpdateConfirmBtn();
}
function ipIssueLinkSearch(tab, q) {
  clearTimeout(_ipLinkSearchTimers[tab]);
  _ipLinkSearchTimers[tab] = setTimeout(() => _ipDoIssueLinkSearch(tab, q.trim()), 280);
}
async function _ipDoIssueLinkSearch(tab, q) {
  const resultsId = tab === 'issue' ? 'ipIssueLinkIssueResults'
    : tab === 'task' ? 'ipIssueLinkTaskResults' : 'ipIssueLinkDevResults';
  const wrap = document.getElementById(resultsId);
  if (!wrap) return;

  if (!q) {
    wrap.innerHTML = '<div class="iss-link-hint">Type to search…</div>';
    return;
  }
  wrap.innerHTML = '<div class="iss-link-hint"><div class="spinner" style="width:14px;height:14px;margin-right:6px;display:inline-block;vertical-align:middle"></div>Searching…</div>';

  try {
    let items = [];
    if (tab === 'issue') {
      const res = await fetch(`/api/admin/issues/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const all = res.ok ? await res.json() : [];
      const editingIssue  = _ipIssuesCache.find(i => i.id === _ipEditingIssueId);
      const alreadyLinked = new Set([
        ...(editingIssue?.linked_issue_ids || []),
        ...(editingIssue?.linked_issue_id ? [editingIssue.linked_issue_id] : []),
      ]);
      items = all.filter(i => i.id !== _ipEditingIssueId && !alreadyLinked.has(i.id));
    } else if (tab === 'task') {
      if (!_ipLinkTasksCache) {
        const res = await fetch('/api/tasks', { headers: authHeaders() });
        _ipLinkTasksCache = res.ok ? await res.json() : [];
      }
      const ql = q.toLowerCase();
      items = _ipLinkTasksCache.filter(t =>
        (t.task_name || '').toLowerCase().includes(ql) || (t.description || '').toLowerCase().includes(ql)
      ).slice(0, 20);
    } else {
      if (!_ipLinkDevCache) {
        const res = await fetch('/api/dev/items', { headers: authHeaders() });
        _ipLinkDevCache = res.ok ? await res.json() : [];
      }
      const ql = q.toLowerCase();
      items = _ipLinkDevCache.filter(d =>
        (d.title || '').toLowerCase().includes(ql) || (d.description || '').toLowerCase().includes(ql)
      ).slice(0, 20);
    }

    if (!items.length) {
      wrap.innerHTML = '<div class="iss-link-hint">No results found.</div>';
      return;
    }

    wrap.innerHTML = items.map(item => {
      let id, primary, secondary, statusText;
      if (tab === 'issue') {
        const _ld  = _stripHtml(item.description || '');
        id         = item.id;
        primary    = escHtml(item.ticket_number ? `#${item.ticket_number}` : item.id.slice(0, 8));
        secondary  = escHtml(item.title || (_ld.length > 80 ? _ld.slice(0, 80) + '…' : _ld));
        statusText = `<span class="iss-link-status iss-link-status--${(item.status||'').replace('_','-')}">${escHtml(item.status || '')}</span>`;
      } else if (tab === 'task') {
        const _ld  = _stripHtml(item.description || '');
        id         = item.id;
        primary    = escHtml(item.task_name || 'Untitled');
        secondary  = _ld ? escHtml(_ld.length > 80 ? _ld.slice(0, 80) + '…' : _ld) : '';
        statusText = `<span class="iss-link-status">${escHtml(item.status || '')}</span>`;
      } else {
        const _ld  = _stripHtml(item.description || '');
        id         = item.id;
        primary    = escHtml(item.title || 'Untitled');
        secondary  = _ld ? escHtml(_ld.length > 80 ? _ld.slice(0, 80) + '…' : _ld) : '';
        statusText = `<span class="iss-link-status">${escHtml(item.status || '')}</span>`;
      }
      const isSelected = id === _ipLinkSelectedId;
      return `<div class="iss-link-item${isSelected ? ' selected' : ''}" onclick='_ipSelectLinkItem(${JSON.stringify(id)}, ${JSON.stringify(primary + (secondary ? ' — ' + (item.title || item.task_name || _ipDescPreview(item.description, 60)) : ''))})'>
        <div class="iss-link-item-primary">${primary} ${statusText}</div>
        ${secondary ? `<div class="iss-link-item-secondary">${secondary}</div>` : ''}
      </div>`;
    }).join('');
  } catch (err) {
    wrap.innerHTML = `<div class="iss-link-hint">Search failed: ${escHtml(err.message)}</div>`;
  }
}
function _ipSelectLinkItem(id, label) {
  _ipLinkSelectedId    = id;
  _ipLinkSelectedLabel = label;
  document.querySelectorAll('#ipIssueLinkModal .iss-link-item').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('onclick').includes(JSON.stringify(id)));
  });
  _ipIssueLinkUpdateSelected();
  _ipIssueLinkUpdateConfirmBtn();
}
async function ipConfirmIssueLink() {
  if (!_ipLinkSelectedId || !_ipEditingIssueId) return;
  const isIssueTab = _ipLinkTab === 'issue';
  const isDevTab   = _ipLinkTab === 'dev_item';
  const isDup      = isIssueTab
    ? document.getElementById('ipIssueLinkIsDuplicate').checked
    : isDevTab
      ? document.getElementById('ipIssueLinkDevIsDuplicate').checked
      : false;
  const loadEl = document.getElementById('ipIssueLinkLoading');
  const errEl  = document.getElementById('ipIssueLinkError');
  const actEl  = document.getElementById('ipIssueLinkConfirmBtn');
  loadEl.style.display = '';
  errEl.style.display  = 'none';
  actEl.disabled       = true;
  try {
    const res = await fetch(`/api/admin/issues/${encodeURIComponent(_ipEditingIssueId)}/link`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ link_type: _ipLinkTab, target_id: _ipLinkSelectedId, is_duplicate: isDup }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Link failed');
    ipCloseIssueLinkModal();
    showToast(
      isDup && isIssueTab ? 'Marked as duplicate and resolved.' :
      isDup && isDevTab   ? 'Marked as duplicate — status will follow the dev item.' :
      'Issue linked.'
    );
    const reopenId = _ipEditingIssueId;
    await loadIssuesPage();
    setTimeout(() => ipOpenIssueModal(reopenId), 0);
  } catch (err) {
    loadEl.style.display = 'none';
    actEl.disabled       = false;
    errEl.style.display  = '';
    document.getElementById('ipIssueLinkErrorMsg').textContent = err.message;
  }
}

async function ipLoadIssueActivity(issueId) {
  const list = document.getElementById('ipIssActivityList');
  list.innerHTML = '<div class="iss-activity-loading"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const res  = await fetch(`/api/issues/${encodeURIComponent(issueId)}/activity`, { headers: authHeaders() });
    const data = res.ok ? await res.json() : [];
    _ipRenderActivity(data);
  } catch {
    list.innerHTML = '<div class="iss-activity-empty">Failed to load activity.</div>';
  }
}

function _ipRenderCommentAttachments(urls) {
  if (!urls || !urls.length) return '';
  return `<div class="comment-attach-grid">${urls.map(u =>
    `<a href="${escHtml(u)}" target="_blank" rel="noopener" class="comment-attach-thumb"><img src="${escHtml(u)}" alt="attachment" loading="lazy"></a>`
  ).join('')}</div>`;
}

function _ipRenderActivity(entries) {
  const list = document.getElementById('ipIssActivityList');
  if (!entries || entries.length === 0) {
    list.innerHTML = '<div class="iss-activity-empty">No activity yet. Be the first to comment.</div>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const time     = fmtDateTime(e.created_at);
    const name     = e.display_name || e.username || '?';
    const initial  = escHtml((name.charAt(0) || '?').toUpperCase());
    const avatar   = e.avatar_url ? `<img src="${escHtml(e.avatar_url)}" alt="${initial}">` : initial;
    let tag = '', body = '';
    if (e.type === 'comment') {
      tag  = '<span class="iss-act-tag iss-act-tag--comment">Comment</span>';
      body = `<div class="iss-act-text">${renderCommentPreview(e.text || '')}</div>${_ipRenderCommentAttachments(e.attachment_urls)}`;
    } else if (e.type === 'moved') {
      const src = e.source === 'dev' ? 'Dev' : 'Task';
      tag  = `<span class="iss-act-tag iss-act-tag--moved">Moved · ${src}</span>`;
      body = `<div class="iss-act-text">${escHtml(e.from || 'None')}<span class="iss-act-arrow">→</span>${escHtml(e.to || '')}</div>`;
    } else {
      const src = e.source === 'dev' ? 'Dev' : 'Task';
      tag  = `<span class="iss-act-tag iss-act-tag--note">Note · ${src}</span>`;
      body = `<div class="iss-act-text">${renderCommentPreview(e.text || '')}</div>`;
    }
    return `<div class="iss-act-entry">
      <div class="iss-act-avatar">${avatar}</div>
      <div class="iss-act-body">
        <div class="iss-act-meta">${tag}<span class="iss-act-user">${userRef(e.username, name)}</span><span class="iss-act-time">${time}</span></div>
        ${body}
      </div>
    </div>`;
  }).join('');
}

async function ipPostIssueComment() {
  const input   = document.getElementById('ipIssCommentInput');
  const comment = (input?.value || '').trim();
  if (!comment || !_ipEditingIssueId) return;
  const btn = document.getElementById('ipIssCommentSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/issues/${encodeURIComponent(_ipEditingIssueId)}/comments`, {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ comment }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to post comment');
    input.value = '';
    await ipLoadIssueActivity(_ipEditingIssueId);
  } catch (err) {
    showToast(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Issue Import (legacy helpdesk export, admins only) ── */
let _ipIssueImportFile  = null;
let _ipIssueImportReady = false;

function ipOpenIssueImportModal() {
  _ipIssueImportFile  = null;
  _ipIssueImportReady = false;
  document.getElementById('ipIssueImportFile').value = '';
  document.getElementById('ipIssueImportSummary').style.display = 'none';
  document.getElementById('ipIssueImportSummary').innerHTML      = '';
  document.getElementById('ipIssueImportLoading').style.display  = 'none';
  document.getElementById('ipIssueImportError').style.display    = 'none';
  const btn = document.getElementById('ipIssueImportConfirmBtn');
  btn.disabled = true;
  document.getElementById('ipIssueImportConfirmLabel').textContent = 'Select a file to begin';
  document.getElementById('ipIssueImportModal').classList.add('open');
}

function ipCloseIssueImportModal() {
  document.getElementById('ipIssueImportModal')?.classList.remove('open');
}

function ipIssueImportFileChange(input) {
  const file = input.files?.[0];
  if (!file) return;
  _ipIssueImportFile  = file;
  _ipIssueImportReady = false;
  _ipRunIssueImportPreview();
}

async function _ipRunIssueImportPreview() {
  if (!_ipIssueImportFile) return;
  const btn = document.getElementById('ipIssueImportConfirmBtn');
  btn.disabled = true;
  document.getElementById('ipIssueImportConfirmLabel').textContent = 'Select a file to begin';
  document.getElementById('ipIssueImportSummary').style.display = 'none';
  document.getElementById('ipIssueImportError').style.display   = 'none';
  document.getElementById('ipIssueImportLoadingText').textContent = 'Analyzing file…';
  document.getElementById('ipIssueImportLoading').style.display   = '';

  try {
    const fd = new FormData();
    fd.append('file', _ipIssueImportFile);
    fd.append('dry_run', 'true');
    const res = await fetch('/api/admin/issues/import', { method: 'POST', headers: authHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not read this file.');
    document.getElementById('ipIssueImportLoading').style.display = 'none';
    _ipRenderIssueImportSummary(data, false);
    _ipIssueImportReady = data.ready > 0;
    btn.disabled = !_ipIssueImportReady;
    document.getElementById('ipIssueImportConfirmLabel').textContent =
      _ipIssueImportReady ? `Import ${data.ready} Ticket${data.ready === 1 ? '' : 's'}` : 'Nothing to import';
  } catch (err) {
    document.getElementById('ipIssueImportLoading').style.display = 'none';
    document.getElementById('ipIssueImportError').style.display   = '';
    document.getElementById('ipIssueImportErrorMsg').textContent  = err.message;
  }
}

async function ipConfirmIssueImport() {
  if (!_ipIssueImportFile || !_ipIssueImportReady) return;
  const btn = document.getElementById('ipIssueImportConfirmBtn');
  btn.disabled = true;
  document.getElementById('ipIssueImportError').style.display   = 'none';
  document.getElementById('ipIssueImportLoadingText').textContent = 'Importing tickets…';
  document.getElementById('ipIssueImportLoading').style.display   = '';

  try {
    const fd = new FormData();
    fd.append('file', _ipIssueImportFile);
    fd.append('dry_run', 'false');
    const res = await fetch('/api/admin/issues/import', { method: 'POST', headers: authHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed.');
    document.getElementById('ipIssueImportLoading').style.display = 'none';
    _ipRenderIssueImportSummary(data, true);
    document.getElementById('ipIssueImportConfirmLabel').textContent = 'Done';
    showToast(`Imported ${data.imported} ticket${data.imported === 1 ? '' : 's'}.`);
    loadIssuesPage();
    if (data.error) {
      document.getElementById('ipIssueImportError').style.display  = '';
      document.getElementById('ipIssueImportErrorMsg').textContent = data.error;
    }
  } catch (err) {
    btn.disabled = false;
    document.getElementById('ipIssueImportLoading').style.display = 'none';
    document.getElementById('ipIssueImportError').style.display   = '';
    document.getElementById('ipIssueImportErrorMsg').textContent  = err.message;
  }
}

function _ipRenderIssueImportSummary(data, committed) {
  const wrap = document.getElementById('ipIssueImportSummary');
  wrap.style.display = '';

  const stats = `
    <div class="iss-import-stats">
      <div class="iss-import-stat iss-import-stat--ready">
        <div class="iss-import-stat-val">${committed ? data.imported : data.ready}</div>
        <div class="iss-import-stat-label">${committed ? 'Imported' : 'Ready'}</div>
      </div>
      <div class="iss-import-stat iss-import-stat--dup">
        <div class="iss-import-stat-val">${data.duplicate}</div>
        <div class="iss-import-stat-label">Already Imported</div>
      </div>
      <div class="iss-import-stat iss-import-stat--skipped">
        <div class="iss-import-stat-val">${data.skipped}</div>
        <div class="iss-import-stat-label">Skipped</div>
      </div>
      <div class="iss-import-stat iss-import-stat--warn">
        <div class="iss-import-stat-val">${data.status_warning_count}</div>
        <div class="iss-import-stat-label">Status Defaulted</div>
      </div>
    </div>`;

  const notes = [];
  if (data.skipped_reasons?.length) {
    notes.push(`
      <details class="iss-import-note-group">
        <summary>Skipped rows (missing required fields)${data.skipped > data.skipped_reasons.length ? ` — showing first ${data.skipped_reasons.length}` : ''}</summary>
        <ul class="iss-import-note-list">${data.skipped_reasons.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
      </details>`);
  }
  if (data.status_warnings?.length) {
    notes.push(`
      <details class="iss-import-note-group">
        <summary>Rows with an unrecognized status${data.status_warning_count > data.status_warnings.length ? ` — showing first ${data.status_warnings.length}` : ''}</summary>
        <ul class="iss-import-note-list">${data.status_warnings.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
      </details>`);
  }

  let preview = '';
  if (!committed && data.preview?.length) {
    preview = `
      <div class="iss-import-preview-wrap">
        <div class="iss-import-preview-title">Preview (first ${data.preview.length} of ${data.ready} ready to import)</div>
        <table class="admin-table">
          <thead><tr><th>Legacy #</th><th>Title</th><th>Reporter</th><th>Company</th><th>Status</th><th>Priority</th></tr></thead>
          <tbody>${data.preview.map(r => `<tr>
            <td><code class="mono-val">${escHtml(r.legacy_ticket_id || '—')}</code></td>
            <td class="issue-desc-cell">${escHtml(r.title || '')}</td>
            <td>${escHtml(r.employee_name || '')}</td>
            <td>${escHtml(r.company_name || '')}</td>
            <td>${escHtml((r.status || '').replace('_',' '))}</td>
            <td>${escHtml(r.priority || '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  const successBanner = committed
    ? `<div class="iss-import-success">
         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
         Imported ${data.imported} ticket${data.imported === 1 ? '' : 's'} from the legacy export.
       </div>`
    : '';

  wrap.innerHTML = successBanner + stats + (notes.length ? `<div class="iss-import-notes">${notes.join('')}</div>` : '') + preview;
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

  _ipCanManage = !!(session.isAdmin || session.isDepartmentHead);
  if (session.isAdmin) document.getElementById('ipUploadIssuesBtn').style.display = '';

  initCommentEditor('ipIssCommentInput', { uploadEntityType: 'issue', getEntityId: () => _ipEditingIssueId });
  initCommentEditor('ipIssResolutionNotes', {});
  initCommentEditor('ipIssResolutionRemarks', {});
  initCommentEditor('ipQrResolutionNotes', {});

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

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeProfileMenu();
      ipCloseLinkedItemModal();
      ipCloseIssueLinkModal();
      ipClosePromoteEpicModal();
      ipClosePromoteUserTaskModal();
      document.getElementById('ipPromoteModal')?.classList.remove('open');
      ipCloseQuickResolveModal();
      ipCloseIssueImportModal();
      _ipCloseIssActionsMenu();
      ipCloseIssueModal();
    }
  });
  document.addEventListener('click', e => {
    closeProfileMenu();
    if (_ipIssActionsOpen && !document.getElementById('ipIssActionsWrap')?.contains(e.target)) _ipCloseIssActionsMenu();
  });

  const ipStatusSelect = document.getElementById('ipIssStatusSelect');
  if (ipStatusSelect) {
    ipStatusSelect.addEventListener('change', function () {
      _ipToggleIssueResolution(this.value);
      if (this.value === 'resolved' || this.value === 'closed') {
        const resolvedByInput = document.getElementById('ipIssResolvedByInput');
        if (resolvedByInput && !resolvedByInput.value.trim()) {
          const sel = document.getElementById('ipIssAssignedToSelect');
          const opt = sel.options[sel.selectedIndex];
          if (opt && opt.value) {
            resolvedByInput.value = opt.textContent.trim().replace(/\s*\(@[^)]+\)\s*$/, '').trim();
          }
        }
      }
    });
  }

  loadIssuesPage().then(() => hidePageLoader());
});
