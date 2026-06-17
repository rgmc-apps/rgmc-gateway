'use strict';

const SESSION_KEY = 'rgmc_gateway_session';

function _loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function _saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Companies dropdown ───────────────────────────────────── */

let _companies = [];

async function _fetchCompanies() {
  try {
    const res = await fetch('/api/companies');
    _companies = await res.json();
  } catch { _companies = []; }
}

function _populateCompanySelect(sel, selectedName) {
  const placeholder = sel.querySelector('option[disabled]');
  sel.innerHTML = '';
  if (placeholder) sel.appendChild(placeholder);
  _companies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.company_code} — ${c.name}`;
    sel.appendChild(opt);
  });
  if (selectedName) sel.value = selectedName;
}

/* ── Wall (auth) ──────────────────────────────────────────── */

function wallSignIn() {
  const username = document.getElementById('wallUsername').value.trim().toLowerCase();
  if (!username) { _wallError('Please enter your username.'); return; }

  _wallLoading(true);

  const fd = new FormData();
  fd.append('username', username);

  fetch('/verify-username', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
      _wallLoading(false);
      if (data.success) {
        _saveSession({
          username:    data.username,
          firstName:   data.first_name   || '',
          fullName:    data.full_name    || data.username,
          displayName: data.display_name || '',
          avatarUrl:   data.avatar_url   || '',
          company:     data.company      || '',
          department:  data.department   || '',
          email:       data.email        || '',
          systems:     data.systems      || [],
          isAdmin:     !!data.is_admin,
          isDeveloper: !!data.is_developer,
        });
        _showPage(_loadSession());
      } else {
        _wallError(data.error || 'Sign-in failed. Please try again.');
      }
    })
    .catch(() => { _wallLoading(false); _wallError('Network error — please try again.'); });
}

function _wallLoading(on) {
  document.getElementById('wallLoading').style.display = on ? 'flex' : 'none';
  document.getElementById('wallActions').style.display = on ? 'none' : 'flex';
  if (!on) return;
  document.getElementById('wallError').style.display = 'none';
}

function _wallError(msg) {
  const el = document.getElementById('wallError');
  el.textContent    = msg;
  el.style.display  = 'block';
  document.getElementById('wallLoading').style.display = 'none';
  document.getElementById('wallActions').style.display = 'flex';
}

/* ── Page reveal ──────────────────────────────────────────── */

function _showPage(session) {
  document.getElementById('riWall').style.display = 'none';
  document.getElementById('riPage').style.display = 'block';

  // Pre-fill form fields from session
  document.getElementById('riEmployeeName').value = session.fullName    || '';
  document.getElementById('riDepartment').value   = session.department  || '';
  document.getElementById('riEmail').value        = session.email       || '';
  const cSel = document.getElementById('riCompanyName');
  if (cSel && session.company) _populateCompanySelect(cSel, session.company);

  // Header user chip
  const displayName = session.displayName || session.firstName || session.username;
  const initial = (session.firstName || session.username || '?').charAt(0).toUpperCase();
  const av = session.avatarUrl && session.avatarUrl.startsWith('https://') ? session.avatarUrl : '';
  const avatarHtml = av
    ? `<img src="${_esc(av)}" class="ri-avatar-img" alt="${_esc(initial)}">`
    : `<span class="ri-avatar-initials">${_esc(initial)}</span>`;
  document.getElementById('riHeaderUser').innerHTML =
    `<div class="ri-header-avatar">${avatarHtml}</div>
     <span class="ri-header-username">${_esc(displayName)}</span>`;

  // Parse ?system= query param
  const params = new URLSearchParams(window.location.search);
  const system = (params.get('system') || '').trim();
  if (system) {
    document.getElementById('riSiteName').value          = system;
    document.getElementById('riSystemName').textContent  = system;
    document.getElementById('riSystemStrip').style.display   = 'flex';
    document.getElementById('riSystemInputGroup').style.display = 'none';
  } else {
    document.getElementById('riSystemStrip').style.display      = 'none';
    document.getElementById('riSystemInputGroup').style.display = 'flex';
    document.getElementById('riSystemInput').addEventListener('input', e => {
      document.getElementById('riSiteName').value = e.target.value;
    });
  }
}

/* ── Form submission ──────────────────────────────────────── */

async function riSubmit(e) {
  e.preventDefault();

  // Validate system when no ?system= param
  const siteName = document.getElementById('riSiteName').value.trim();
  if (!siteName) {
    const sysInput = document.getElementById('riSystemInput');
    if (sysInput) { sysInput.focus(); sysInput.classList.add('input-shake'); setTimeout(() => sysInput.classList.remove('input-shake'), 400); }
    return;
  }

  document.getElementById('riFormActions').style.display = 'none';
  document.getElementById('riLoading').style.display     = 'flex';
  document.getElementById('riSuccess').style.display     = 'none';
  document.getElementById('riError').style.display       = 'none';

  const form  = document.getElementById('riForm');
  const fd    = new FormData(form);

  // Limit to 5 attachments
  const fileInput = document.getElementById('riAttachments');
  const files = Array.from(fileInput.files).slice(0, 5);
  fd.delete('attachments');
  files.forEach(f => fd.append('attachments', f));

  fd.set('site_name', siteName);

  const session = _loadSession();
  const headers = session ? { 'X-Gateway-Username': session.username } : {};

  try {
    const res  = await fetch('/api/issues', { method: 'POST', headers, body: fd });
    const data = await res.json();

    document.getElementById('riLoading').style.display = 'none';

    if (data.success) {
      document.getElementById('riSuccessMsg').textContent = data.message || 'Your report has been submitted.';
      document.getElementById('riSuccess').style.display = 'flex';
      form.reset();
      document.getElementById('riSiteName').value = siteName; // keep system
      document.getElementById('riFileLabel').textContent = 'Click to attach files or drag & drop';
      // Re-fill name/email from session
      if (session) {
        document.getElementById('riEmployeeName').value = session.fullName   || '';
        document.getElementById('riDepartment').value   = session.department || '';
        document.getElementById('riEmail').value        = session.email      || '';
        const cSel = document.getElementById('riCompanyName');
        if (cSel && session.company) {
          for (const opt of cSel.options) {
            if (opt.value === session.company) { cSel.value = session.company; break; }
          }
        }
      }
    } else {
      document.getElementById('riFormActions').style.display = 'flex';
      document.getElementById('riError').style.display       = 'flex';
      document.getElementById('riErrorMsg').textContent      = data.error || 'An unexpected error occurred.';
    }
  } catch {
    document.getElementById('riLoading').style.display     = 'none';
    document.getElementById('riFormActions').style.display = 'flex';
    document.getElementById('riError').style.display       = 'flex';
    document.getElementById('riErrorMsg').textContent      = 'Network error — please try again.';
  }
}

/* ── File list update ─────────────────────────────────────── */

function riUpdateFiles(input) {
  const files = Array.from(input.files);
  const label = document.getElementById('riFileLabel');
  if (!files.length) {
    label.textContent = 'Click to attach files or drag & drop';
  } else {
    label.textContent = files.slice(0, 5).map(f => f.name).join(', ');
    if (files.length > 5) label.textContent += ` (+${files.length - 5} ignored — max 5)`;
  }
}

/* ── Bootstrap ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  const session = _loadSession();

  // System hint on the wall (before sign-in)
  const params = new URLSearchParams(window.location.search);
  const system = (params.get('system') || '').trim();
  if (system) {
    const hint = document.getElementById('wallSystemHint');
    if (hint) { hint.textContent = `You're reporting a problem with: ${system}`; hint.style.display = 'block'; }
  }

  // Load companies first so dropdowns are ready when _showPage runs
  _fetchCompanies().then(() => {
    if (session && session.username) {
      _showPage(session);
    } else {
      // Pre-populate the dropdown for when the user signs in
      const cSel = document.getElementById('riCompanyName');
      if (cSel) _populateCompanySelect(cSel, '');
    }
  });
  // else wall stays visible by default

  // Enter key on wall username field
  const wallInput = document.getElementById('wallUsername');
  if (wallInput) wallInput.addEventListener('keydown', e => { if (e.key === 'Enter') wallSignIn(); });

  // Drag & drop feedback on the file zone
  const zone = document.getElementById('riDropZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', () => zone.classList.remove('dragover'));
  }
});
