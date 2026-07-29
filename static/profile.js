'use strict';

/* ── Session ── */
const SESSION_KEY = 'rgmc_gateway_session';
function loadSession()  { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(d) { localStorage.setItem(SESSION_KEY, JSON.stringify(d)); }

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

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Profile dropdown (same pattern as other pages) ── */
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
function profileSignOut() { localStorage.removeItem(SESSION_KEY); location.href = '/'; }

function buildHeaderDropdown(session) {
  const container = document.getElementById('profileHeaderUser');
  if (!container || !session) return;

  const initial     = escHtml((session.firstName || session.username).charAt(0).toUpperCase());
  const displayName = escHtml(session.displayName || session.firstName || session.username);
  const fullName    = escHtml(session.fullName || session.username);
  const username    = escHtml(session.username);
  const av          = session.avatarUrl && (session.avatarUrl.startsWith('data:') || session.avatarUrl.startsWith('https://')) ? session.avatarUrl : '';

  const avatarSmHtml = av
    ? `<div class="profile-avatar-sm"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
    : `<div class="profile-avatar-sm">${initial}</div>`;
  const avatarLgHtml = av
    ? `<div class="profile-avatar-lg"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
    : `<div class="profile-avatar-lg">${initial}</div>`;

  const navItems = [
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
        <button class="profile-menu-item profile-menu-item--danger" onclick="profileSignOut()">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </div>`;
}

/* ── Companies dropdown ── */
let _profileCompanies = [];

async function _loadProfileCompanies() {
  try {
    const res = await fetch('/api/companies');
    _profileCompanies = await res.json();
  } catch { _profileCompanies = []; }
}

function _populateProfileCompany(selectedName) {
  const sel = document.getElementById('fieldCompany');
  if (!sel) return;
  const placeholder = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(placeholder);
  _profileCompanies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.company_code} — ${c.name}`;
    if (c.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ── Avatar state ── */
let _pendingAvatarUrl = null; // null = no change, '' = remove, 'data:...' = new image
let _dirty = false;

function markDirty() { _dirty = true; }

/* ── Render the avatar preview circle ── */
function renderAvatarPreview(url, initial) {
  const el = document.getElementById('avatarPreview');
  if (url) {
    el.innerHTML = `<img src="${url}" class="profile-upload-img" alt="Avatar">`;
  } else {
    el.innerHTML = `<span class="profile-upload-initial">${escHtml(initial)}</span>`;
  }
  document.getElementById('removeAvatarBtn').style.display = url ? '' : 'none';
}

/* ── Image resize ── */
function resizeImage(file, size = 128) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Center-crop to square
        const dim = Math.min(img.width, img.height);
        const sx  = (img.width  - dim) / 2;
        const sy  = (img.height - dim) / 2;
        ctx.drawImage(img, sx, sy, dim, dim, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleAvatarFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.'); return; }

  const session = loadSession();
  const initial = (session?.firstName || session?.username || '?').charAt(0).toUpperCase();

  const dataUrl = await resizeImage(file);
  _pendingAvatarUrl = dataUrl;
  _dirty = true;
  renderAvatarPreview(dataUrl, initial);
  input.value = '';
}

function removeAvatar() {
  const session = loadSession();
  const initial = (session?.firstName || session?.username || '?').charAt(0).toUpperCase();
  _pendingAvatarUrl = '';
  _dirty = true;
  renderAvatarPreview('', initial);
}

/* ── Save ── */
async function saveProfile() {
  if (!_dirty) { showToast('No changes to save.'); return; }

  const btn    = document.getElementById('saveBtn');
  const status = document.getElementById('profileSaveStatus');
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.className = 'profile-save-status saving';

  try {
    let newAvatarUrl = undefined; // undefined = no change

    // ── Avatar: upload to Storage or delete ──
    if (_pendingAvatarUrl !== null) {
      if (_pendingAvatarUrl === '') {
        // Remove avatar
        const res  = await fetch('/api/profile/avatar', { method: 'DELETE', headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to remove avatar');
        newAvatarUrl = '';
      } else {
        // Upload new avatar (base64 data URL)
        const res  = await fetch('/api/profile/avatar', {
          method:  'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ avatar: _pendingAvatarUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to upload avatar');
        newAvatarUrl = data.avatar_url;
      }
    }

    // ── Profile fields ──
    const firstName     = document.getElementById('fieldFirstName').value.trim();
    const middleInitial = document.getElementById('fieldMiddleInitial').value.trim();
    const lastName      = document.getElementById('fieldLastName').value.trim();
    const displayName   = document.getElementById('fieldDisplayName').value.trim();
    const email         = document.getElementById('fieldEmail').value.trim();
    const viberNumber   = document.getElementById('fieldViberNumber').value.trim();
    const anydeskId     = document.getElementById('fieldAnydeskId').value.trim();
    const company       = document.getElementById('fieldCompany').value;
    const department    = document.getElementById('fieldDepartment').value.trim();
    const position      = document.getElementById('fieldPosition').value.trim();

    if (anydeskId && !/^\d{9}$/.test(anydeskId)) {
      status.textContent = 'AnyDesk ID must be exactly 9 digits.';
      status.className = 'profile-save-status error';
      btn.disabled = false;
      return;
    }

    const res  = await fetch('/api/profile', {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ first_name: firstName, middle_initial: middleInitial || null,
                                last_name: lastName, display_name: displayName, email,
                                viber_number: viberNumber, anydesk_id: anydeskId || null,
                                company, department, position }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    // ── Update local session ──
    const session = loadSession();
    if (session) {
      session.firstName   = firstName;
      session.fullName    = `${firstName} ${lastName}`.trim();
      session.displayName = displayName || '';
      session.company     = company     || '';
      session.department  = department  || '';
      session.email       = email       || '';
      if (newAvatarUrl !== undefined) {
        session.avatarUrl = newAvatarUrl ? `${newAvatarUrl}?v=${Date.now()}` : '';
      }
      saveSession(session);
      buildHeaderDropdown(session);
    }

    _dirty = false;
    _pendingAvatarUrl = null;
    status.textContent = 'Saved!';
    status.className = 'profile-save-status saved';
    showToast('Profile updated.');
    setTimeout(() => { status.textContent = ''; status.className = 'profile-save-status'; }, 3000);
  } catch (err) {
    status.textContent = err.message || 'Save failed.';
    status.className = 'profile-save-status error';
  } finally {
    btn.disabled = false;
  }
}

/* ── Password utilities ── */
function _passwordStrength(pw) {
  if (!pw) return { score: 0, label: '', pct: 0, color: '' };
  let s = 0;
  if (pw.length >= 8)  s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    { label: 'Very Weak', color: '#ef4444' },
    { label: 'Weak',      color: '#f97316' },
    { label: 'Fair',      color: '#eab308' },
    { label: 'Good',      color: '#84cc16' },
    { label: 'Strong',    color: '#22c55e' },
  ];
  const idx = Math.min(Math.max(Math.floor(s * 5 / 7), 0), 4);
  return { score: s, label: levels[idx].label, color: levels[idx].color, pct: Math.min(100, Math.round(s * 17)) };
}

function updatePwStrength() {
  const val  = document.getElementById('fieldNewPassword')?.value || '';
  const wrap = document.getElementById('profileStrength');
  const fill = document.getElementById('profileStrengthFill');
  const lbl  = document.getElementById('profileStrengthLabel');
  if (!wrap || !fill || !lbl) return;
  if (!val) { wrap.style.display = 'none'; return; }
  const r = _passwordStrength(val);
  wrap.style.display    = '';
  fill.style.width      = r.pct + '%';
  fill.style.background = r.color;
  lbl.textContent       = r.label;
  lbl.style.color       = r.color;
}

function togglePwField(id) {
  const el = document.getElementById(id);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function _generatePassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%&*-_=+?';
  const all     = upper + lower + digits + special;
  const pw = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 12; i++) pw.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

function profileGeneratePassword() {
  const pw = _generatePassword();
  const pwEl      = document.getElementById('fieldNewPassword');
  const confirmEl = document.getElementById('fieldConfirmPassword');
  if (pwEl)      { pwEl.value = pw;      pwEl.type = 'text'; }
  if (confirmEl) { confirmEl.value = pw; confirmEl.type = 'text'; }
  updatePwStrength();
}

async function changePassword() {
  const currentPw = (document.getElementById('fieldCurrentPassword')?.value || '').trim();
  const newPw     = (document.getElementById('fieldNewPassword')?.value     || '').trim();
  const confirmPw = (document.getElementById('fieldConfirmPassword')?.value || '').trim();
  const status    = document.getElementById('profilePwStatus');

  status.textContent = '';
  status.className   = 'profile-pw-status';

  if (!newPw)             { status.textContent = 'Please enter a new password.';            status.className = 'profile-pw-status error'; return; }
  if (newPw.length < 8)   { status.textContent = 'Password must be at least 8 characters.'; status.className = 'profile-pw-status error'; return; }
  if (newPw !== confirmPw) { status.textContent = 'Passwords do not match.';                 status.className = 'profile-pw-status error'; return; }

  status.textContent = 'Updating…';
  status.className   = 'profile-pw-status saving';

  try {
    const res  = await fetch('/api/auth/change-password', {
      method:  'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ current_password: currentPw, new_password: newPw, confirm_password: confirmPw }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Update failed.');

    // Clear fields
    ['fieldCurrentPassword', 'fieldNewPassword', 'fieldConfirmPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.type = 'password'; }
    });
    const strengthWrap = document.getElementById('profileStrength');
    if (strengthWrap) strengthWrap.style.display = 'none';

    // Show current password field going forward (password is now set)
    const cpGroup = document.getElementById('currentPwGroup');
    if (cpGroup) cpGroup.style.display = '';

    status.textContent = 'Password updated!';
    status.className   = 'profile-pw-status saved';
    showToast('Password updated successfully.');
    setTimeout(() => { status.textContent = ''; status.className = 'profile-pw-status'; }, 4000);
  } catch (err) {
    status.textContent = err.message || 'Update failed.';
    status.className   = 'profile-pw-status error';
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  const session = loadSession();
  if (!session || !session.username) {
    location.href = '/';
    return;
  }

  buildHeaderDropdown(session);

  // Pre-fill from session
  document.getElementById('fieldUsername').value    = session.username;
  document.getElementById('fieldFirstName').value   = session.firstName  || '';
  document.getElementById('fieldLastName').value    = (session.fullName || '').replace(session.firstName || '', '').trim();
  document.getElementById('fieldDisplayName').value = session.displayName || '';
  document.getElementById('fieldEmail').value       = session.email      || '';
  document.getElementById('fieldDepartment').value  = session.department || '';

  const initial = (session.firstName || session.username).charAt(0).toUpperCase();
  renderAvatarPreview(session.avatarUrl || '', initial);

  // Load companies then fetch fresh profile data from server
  await _loadProfileCompanies();
  _populateProfileCompany(session.company || '');

  try {
    const res  = await fetch('/api/profile', { headers: authHeaders() });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('fieldFirstName').value     = data.first_name     || '';
      document.getElementById('fieldMiddleInitial').value = data.middle_initial || '';
      document.getElementById('fieldLastName').value      = data.last_name      || '';
      document.getElementById('fieldDisplayName').value   = data.display_name   || '';
      document.getElementById('fieldEmail').value       = data.email         || '';
      document.getElementById('fieldViberNumber').value = data.viber_number  || '';
      document.getElementById('fieldAnydeskId').value   = data.anydesk_id   || '';
      document.getElementById('fieldDepartment').value  = data.department    || '';
      document.getElementById('fieldPosition').value    = data.position      || '';
      _populateProfileCompany(data.company || '');
      if (data.avatar_url) renderAvatarPreview(data.avatar_url, initial);
      // Show current password field only if a password is already set
      if (data.has_password) {
        const cpGroup = document.getElementById('currentPwGroup');
        if (cpGroup) cpGroup.style.display = '';
      }
      // Sync session
      session.firstName   = data.first_name   || '';
      session.fullName    = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      session.displayName = data.display_name || '';
      session.avatarUrl   = data.avatar_url   || '';
      session.company     = data.company      || '';
      session.department  = data.department   || '';
      session.email       = data.email        || '';
      saveSession(session);
    }
  } catch { /* use session data as fallback */ }
  hidePageLoader();

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfileMenu(); });
  document.addEventListener('click',   () => closeProfileMenu());
});
