'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   Global Search — header-wide search over the systems table and the screens
   the current user can access. Self-contained (own session read, own escaping)
   so it can be dropped into any authenticated page alongside that page's own
   JS file without depending on it. Markup lives in each template: #gsOverlay
   (spotlight panel, reuses .cmd-* classes from developer.css) and
   #gsSystemModal (reuses .modal-overlay/.modal from modal.css).
   ══════════════════════════════════════════════════════════════════════════════ */

const _GS_SESSION_KEY = 'rgmc_gateway_session';

function _gsSession() {
  try { return JSON.parse(localStorage.getItem(_GS_SESSION_KEY)); } catch { return null; }
}

function _gsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Canonical list of navigable screens, gated the same way buildAccessPanel()
   gates the "Your Access" feature list in script.js. */
const GS_SCREENS = [
  { label: 'Home / Systems Portal', href: '/',                description: 'RGMC, SBIC, NAV & tool launchers',  keywords: 'home dashboard portal systems rgmc sbic nav', ok: () => true },
  { label: 'My Team Workspace',     href: '/workspace',        description: 'Your tasks and team view',          keywords: 'workspace team my tasks',                     ok: () => true },
  { label: 'IT Helpdesk',           href: '/helpdesk',         description: 'Report & track IT issues',          keywords: 'helpdesk it support ticket issue',            ok: () => true },
  { label: 'General Helpdesk',      href: '/general-helpdesk', description: 'Non-IT requests',                   keywords: 'general helpdesk request',                    ok: () => true },
  { label: 'My Profile',            href: '/profile',          description: 'Account & preferences',             keywords: 'profile account settings',                    ok: () => true },
  { label: 'Tasks Board',           href: '/tasks',            description: 'Team task kanban',                  keywords: 'tasks board kanban',                          ok: s => !!(s && (s.isAdmin || s.isManagement)) },
  { label: 'Admin Panel',           href: '/admin',            description: 'Users, systems & settings',         keywords: 'admin panel users systems manage',            ok: s => !!(s && (s.isAdmin || s.isManagement)) },
  { label: 'Dev Board',             href: '/developer',        description: 'Dev items, epics & team',           keywords: 'dev developer board kanban items epics',      ok: s => !!(s && (s.isDeveloper || s.isAdmin)) },
];

const _GS_CATEGORY_CLASS = { RGMC: 'label-rgmc', SBIC: 'label-sbic', 'NAV Sites': 'label-nav' };

let _gsSystemsCache   = null; // null = not yet fetched
let _gsChangelogCache = null;
let _gsCursor         = -1;
let _gsEntries        = [];

/* ── Spotlight overlay ── */

function openGlobalSearch() {
  const overlay = document.getElementById('gsOverlay');
  const input   = document.getElementById('gsInput');
  if (!overlay || !input) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  input.value  = '';
  _gsCursor    = -1;
  _gsRenderResults('');
  setTimeout(() => input.focus(), 30);
  if (_gsSystemsCache === null) _gsFetchSystems();
}

function closeGlobalSearch() {
  const overlay = document.getElementById('gsOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

async function _gsFetchSystems() {
  try {
    const res = await fetch('/api/systems');
    _gsSystemsCache = res.ok ? await res.json().catch(() => []) : [];
  } catch {
    _gsSystemsCache = [];
  }
  const overlay = document.getElementById('gsOverlay');
  if (overlay && overlay.classList.contains('open')) {
    _gsRenderResults(document.getElementById('gsInput')?.value || '');
  }
}

function _gsOnInput(value) {
  _gsCursor = -1;
  _gsRenderResults(value);
}

function _gsRenderResults(query) {
  const results = document.getElementById('gsResults');
  if (!results) return;
  const q       = query.trim().toLowerCase();
  const session = _gsSession();

  const screens = GS_SCREENS.filter(s => {
    if (!s.ok(session)) return false;
    if (!q) return true;
    return s.label.toLowerCase().includes(q) || s.keywords.includes(q);
  });

  const systemsLoaded = Array.isArray(_gsSystemsCache);
  const systems = systemsLoaded
    ? _gsSystemsCache.filter(sys => !q
        || (sys.name || '').toLowerCase().includes(q)
        || (sys.category || '').toLowerCase().includes(q))
    : [];

  _gsEntries = [];
  let html = '';

  if (systems.length) {
    html += '<div class="cmd-section-label">Systems</div>';
    systems.forEach(sys => {
      _gsEntries.push({ type: 'system', data: sys });
      html += _gsSystemResultHtml(sys, _gsEntries.length - 1);
    });
  } else if (!systemsLoaded) {
    html += '<div class="cmd-section-label">Systems</div><div class="cmd-empty">Loading systems…</div>';
  }

  if (screens.length) {
    html += '<div class="cmd-section-label">Screens</div>';
    screens.forEach(scr => {
      _gsEntries.push({ type: 'screen', data: scr });
      html += _gsScreenResultHtml(scr, _gsEntries.length - 1);
    });
  }

  if (!_gsEntries.length && systemsLoaded) {
    html = '<div class="cmd-empty">No matches found.</div>';
  }

  results.innerHTML = html;
}

function _gsSystemResultHtml(sys, idx) {
  const svg  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  const desc = [sys.category, sys.is_wip ? 'Work in progress' : ''].filter(Boolean).join(' · ');
  return `
    <div class="cmd-result" data-gs-idx="${idx}" onmouseenter="_gsSetCursor(${idx})" onclick="_gsActivate(${idx})">
      <div class="cmd-result-icon">${svg}</div>
      <div class="cmd-result-body">
        <div class="cmd-result-label">${_gsEsc(sys.name)}</div>
        ${desc ? `<div class="cmd-result-desc">${_gsEsc(desc)}</div>` : ''}
      </div>
      <span class="cmd-result-hint">System</span>
    </div>`;
}

function _gsScreenResultHtml(scr, idx) {
  const svg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  return `
    <div class="cmd-result" data-gs-idx="${idx}" onmouseenter="_gsSetCursor(${idx})" onclick="_gsActivate(${idx})">
      <div class="cmd-result-icon">${svg}</div>
      <div class="cmd-result-body">
        <div class="cmd-result-label">${_gsEsc(scr.label)}</div>
        <div class="cmd-result-desc">${_gsEsc(scr.description || '')}</div>
      </div>
      <span class="cmd-result-hint">Screen</span>
    </div>`;
}

function _gsSetCursor(idx) {
  _gsCursor = idx;
  document.querySelectorAll('#gsResults .cmd-result').forEach(el => {
    el.classList.toggle('cmd-result--active', +el.dataset.gsIdx === idx);
  });
}

function _gsActivate(idx) {
  const entry = _gsEntries[idx];
  if (!entry) return;
  if (entry.type === 'screen') {
    location.href = entry.data.href;
  } else {
    closeGlobalSearch();
    openSystemDetails(entry.data);
  }
}

document.addEventListener('keydown', e => {
  const overlay = document.getElementById('gsOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeGlobalSearch();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!_gsEntries.length) return;
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    _gsSetCursor((_gsCursor + dir + _gsEntries.length) % _gsEntries.length);
    document.querySelector('#gsResults .cmd-result--active')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    _gsActivate(_gsCursor >= 0 ? _gsCursor : 0);
  }
});

document.addEventListener('click', e => {
  if (e.target.id === 'gsOverlay') closeGlobalSearch();
});

/* ── System details modal (links + recent changes) ── */

function openSystemDetails(sys) {
  const modal = document.getElementById('gsSystemModal');
  if (!modal || !sys) return;

  document.getElementById('gsSysModalTitle').textContent = sys.name || '';

  const catLabel = sys.category || '';
  const badges = [
    catLabel ? `<span class="label-badge ${_GS_CATEGORY_CLASS[catLabel] || 'label-task'}">${_gsEsc(catLabel)}</span>` : '',
    sys.is_wip ? '<span class="site-wip-badge">WIP</span>' : '',
  ].filter(Boolean).join('');
  document.getElementById('gsSysModalSubtitle').innerHTML = badges
    ? `<div class="gs-sys-badges">${badges}</div>` : '';

  const linksHtml = _gsSystemLinksHtml(sys);
  document.getElementById('gsSysModalBody').innerHTML = `
    <div class="gs-sys-section">
      <div class="gs-sys-section-label">Links</div>
      <div class="gs-sys-links">${linksHtml || '<span class="changelog-empty">No links configured for this system.</span>'}</div>
    </div>
    <div class="gs-sys-section">
      <div class="gs-sys-section-label">Recent Changes</div>
      <div class="changelog-feed gs-sys-changes" id="gsSysChanges">
        <div class="health-loading"><div class="spinner"></div><span>Loading recent changes…</span></div>
      </div>
    </div>`;

  modal.classList.add('open');
  _gsLoadSystemChanges(sys.name || '');
}

function closeGsSystemModal() {
  document.getElementById('gsSystemModal')?.classList.remove('open');
}

function _gsSystemLinksHtml(sys) {
  const parts = [];
  if (sys.is_windows_based) {
    if (sys.windows_launcher_url) parts.push(`<a class="btn btn-win-launch" href="${_gsEsc(sys.windows_launcher_url)}" download>Launcher</a>`);
    if (sys.windows_manifest_url) parts.push(`<a class="btn btn-win-manifest" href="${_gsEsc(sys.windows_manifest_url)}" download>Manifest</a>`);
  } else {
    if (sys.primary_url) parts.push(`<a class="btn btn-primary" href="${_gsEsc(sys.primary_url)}" target="_blank" rel="noopener">${_gsEsc(sys.primary_label || 'Open')}</a>`);
    if (sys.backup_url)  parts.push(`<a class="btn btn-backup" href="${_gsEsc(sys.backup_url)}" target="_blank" rel="noopener">${_gsEsc(sys.backup_label || 'Backup')}</a>`);
  }
  return parts.join('');
}

async function _gsLoadSystemChanges(systemName) {
  const container = document.getElementById('gsSysChanges');
  if (!container) return;
  try {
    if (_gsChangelogCache === null) {
      const session = _gsSession();
      const headers = session?.username ? { 'X-Gateway-Username': session.username } : {};
      const res = await fetch('/api/changelog?days=90', { headers });
      _gsChangelogCache = res.ok ? (await res.json().catch(() => []) || []) : [];
    }
    const entries = _gsChangelogCache.filter(e => Array.isArray(e.systems) && e.systems.includes(systemName));
    container.innerHTML = entries.length
      ? entries.slice(0, 15).map(_gsEntryHtml).join('')
      : '<div class="changelog-empty">No recent changes for this system.</div>';
  } catch {
    container.innerHTML = '<div class="changelog-empty">Could not load recent changes.</div>';
  }
}

const _GS_CL_TYPE = {
  bug: ['Fix', '#D85858'], bugfix: ['Fix', '#D85858'], fix: ['Fix', '#D85858'],
  feature: ['Feature', '#38bdf8'], feat: ['Feature', '#38bdf8'],
  improvement: ['Update', '#52A870'], improve: ['Update', '#52A870'], enhancement: ['Update', '#52A870'],
  task: ['Task', '#a78bfa'],
};

function _gsStripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || '').trim().replace(/\s+/g, ' ');
}

function _gsTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function _gsEntryHtml(item) {
  const [label, color] = _GS_CL_TYPE[(item.type || '').toLowerCase()] || [item.type || 'Done', '#C4972A'];
  const title = _gsEsc(item.title || '');
  const desc  = _gsEsc(_gsStripHtml(item.description));
  const when  = _gsTimeAgo(item.actual_end_date || item.created_at);
  const svg   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  return `
  <div class="cl-entry">
    <div class="cl-icon" style="background:${color}22;color:${color}">${svg}</div>
    <div class="cl-body">
      <div class="cl-top"><span class="cl-type-badge" style="background:${color}1f;color:${color};border:1px solid ${color}55">${_gsEsc(label)}</span></div>
      <div class="cl-title" title="${title}">${title}</div>
      ${desc ? `<div class="cl-desc">${desc}</div>` : ''}
      <div class="cl-meta">
        ${item.assigned_to ? `<span class="cl-assignee">@${_gsEsc(item.assigned_to)}</span>` : ''}
        ${item.assigned_to && when ? '<span class="cl-meta-sep">·</span>' : ''}
        ${when ? `<span>${_gsEsc(when)}</span>` : ''}
      </div>
    </div>
  </div>`;
}
