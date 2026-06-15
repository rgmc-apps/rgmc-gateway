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
  const av          = session.avatarUrl && session.avatarUrl.startsWith('data:image/') ? session.avatarUrl : '';

  const avatarSmHtml = av
    ? `<div class="profile-avatar-sm"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
    : `<div class="profile-avatar-sm">${initial}</div>`;
  const avatarLgHtml = av
    ? `<div class="profile-avatar-lg"><img src="${av}" class="profile-avatar-img" alt="${initial}"></div>`
    : `<div class="profile-avatar-lg">${initial}</div>`;

  const navItems = [`<a href="/" class="profile-menu-item">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Portal
  </a>`];
  if (session.isDeveloper || session.isAdmin) {
    navItems.push(`<a href="/developer" class="profile-menu-item">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      Dev Board
    </a>`);
  }
  if (session.isAdmin) {
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
  const displayName = document.getElementById('fieldDisplayName').value.trim();
  const patch = {};

  if (_dirty) {
    patch.display_name = displayName;
    if (_pendingAvatarUrl !== null) {
      patch.avatar_url = _pendingAvatarUrl;
    }
  } else if (!_dirty) {
    showToast('No changes to save.');
    return;
  }

  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('profileSaveStatus');
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.className = 'profile-save-status saving';

  try {
    const res = await fetch('/api/profile', {
      method:  'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      // Update local session
      const session = loadSession();
      if (session) {
        if ('display_name' in patch) session.displayName = patch.display_name || '';
        if ('avatar_url' in patch)   session.avatarUrl   = patch.avatar_url   || '';
        // Refresh displayName shown in trigger
        const dn = session.displayName || session.firstName || session.username;
        session.displayName = dn;
        saveSession(session);
      }
      _dirty = false;
      _pendingAvatarUrl = null;
      status.textContent = 'Saved!';
      status.className = 'profile-save-status saved';
      showToast('Profile updated.');
      setTimeout(() => { status.textContent = ''; status.className = 'profile-save-status'; }, 3000);
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    status.textContent = err.message || 'Save failed.';
    status.className = 'profile-save-status error';
  } finally {
    btn.disabled = false;
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
  document.getElementById('fieldFullName').value    = session.fullName || '';
  document.getElementById('fieldDisplayName').value = session.displayName || '';

  const initial = (session.firstName || session.username).charAt(0).toUpperCase();
  renderAvatarPreview(session.avatarUrl || '', initial);

  // Fetch fresh data from server (avatar_url may be large, re-confirm)
  try {
    const res  = await fetch('/api/profile', { headers: authHeaders() });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('fieldDisplayName').value = data.display_name || '';
      if (data.avatar_url) renderAvatarPreview(data.avatar_url, initial);
      // Sync session
      session.displayName = data.display_name || '';
      session.avatarUrl   = data.avatar_url   || '';
      saveSession(session);
    }
  } catch { /* use session data as fallback */ }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfileMenu(); });
  document.addEventListener('click',   () => closeProfileMenu());
});
