'use strict';

/* ══════════════════════════════════════════════════════════════
   user-hovercard.js — shared "who posted this" UI for every
   comment / activity thread in the app.

   Any name rendered with userRef(username, displayName) becomes a
   hoverable + clickable reference: hovering shows a small profile
   card (avatar, name, role), clicking opens a modal with contact
   details (name, email, contact number).

   Self-contained on purpose — no dependency on each page's own
   escHtml/authHeaders, so load order relative to admin.js /
   issues_page.js / developer.js / tasks.js / user.js never matters.
   ══════════════════════════════════════════════════════════════ */

function userRef(username, displayName) {
  const safeUser = _uhcEsc(username || '');
  const safeName = _uhcEsc(displayName || username || '?');
  if (!username) return safeName;
  return `<span class="user-ref" data-user-ref="${safeUser}" data-user-name="${safeName}" tabindex="0" role="button" aria-haspopup="dialog">${safeName}</span>`;
}

function _uhcEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _uhcAuthHeaders() {
  try {
    const s = JSON.parse(localStorage.getItem('rgmc_gateway_session'));
    return { 'X-Gateway-Username': s?.username || '' };
  } catch { return {}; }
}

const _uhcCache = {};

function _uhcFetchUser(username) {
  if (_uhcCache[username]) return _uhcCache[username];
  const p = fetch(`/api/users/${encodeURIComponent(username)}/card`, { headers: _uhcAuthHeaders() })
    .then(res => res.ok ? res.json() : null)
    .catch(() => null);
  _uhcCache[username] = p;
  return p;
}

function _uhcInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function _uhcAvatarHtml(user, size) {
  const name    = user?.display_name || '?';
  const initial = _uhcEsc(_uhcInitial(name));
  if (user?.avatar_url) {
    return `<span class="uhc-avatar" style="width:${size}px;height:${size}px;"><img src="${_uhcEsc(user.avatar_url)}" alt=""></span>`;
  }
  return `<span class="uhc-avatar uhc-avatar--initials" style="width:${size}px;height:${size}px;">${initial}</span>`;
}

/* ── Tooltip ── */
let _uhcTooltipEl   = null;
let _uhcShowTimer    = null;
let _uhcHideTimer    = null;
let _uhcActiveTarget = null;

function _uhcEnsureTooltip() {
  if (_uhcTooltipEl) return _uhcTooltipEl;
  const el = document.createElement('div');
  el.className = 'uhc-tooltip';
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  _uhcTooltipEl = el;
  return el;
}

function _uhcScheduleShow(target) {
  clearTimeout(_uhcHideTimer);
  clearTimeout(_uhcShowTimer);
  _uhcShowTimer = setTimeout(() => _uhcShowTooltip(target), 220);
}

function _uhcScheduleHide() {
  clearTimeout(_uhcShowTimer);
  clearTimeout(_uhcHideTimer);
  _uhcHideTimer = setTimeout(_uhcHideTooltip, 120);
}

async function _uhcShowTooltip(target) {
  if (!target || !document.contains(target)) return;
  _uhcActiveTarget = target;
  const username = target.getAttribute('data-user-ref');
  const fallback = target.getAttribute('data-user-name') || username;
  const tip = _uhcEnsureTooltip();

  tip.innerHTML = `
    <div class="uhc-tip-row">
      ${_uhcAvatarHtml({ display_name: fallback }, 34)}
      <div class="uhc-tip-info">
        <div class="uhc-tip-name">${_uhcEsc(fallback)}</div>
        <div class="uhc-tip-meta uhc-tip-meta--loading">Loading…</div>
      </div>
    </div>
    <div class="uhc-tip-hint">Click for contact info</div>`;
  _uhcPositionTooltip(target, tip);
  tip.classList.add('open');

  const user = await _uhcFetchUser(username);
  if (_uhcActiveTarget !== target || !tip.classList.contains('open')) return;
  if (!user) {
    tip.querySelector('.uhc-tip-meta').textContent = '@' + username;
    return;
  }
  const meta = [user.position, user.department].filter(Boolean).join(' · ') || '@' + user.username;
  tip.querySelector('.uhc-tip-row').innerHTML = `
    ${_uhcAvatarHtml(user, 34)}
    <div class="uhc-tip-info">
      <div class="uhc-tip-name">${_uhcEsc(user.display_name)}</div>
      <div class="uhc-tip-meta">${_uhcEsc(meta)}</div>
    </div>`;
  _uhcPositionTooltip(target, tip);
}

function _uhcHideTooltip() {
  _uhcActiveTarget = null;
  _uhcTooltipEl?.classList.remove('open');
}

function _uhcPositionTooltip(target, tip) {
  const r = target.getBoundingClientRect();
  const tipW = tip.offsetWidth || 220;
  const tipH = tip.offsetHeight || 70;
  const margin = 10;

  let top  = r.top - tipH - margin;
  let flip = false;
  if (top < 8) { top = r.bottom + margin; flip = true; }

  let left = r.left;
  const maxLeft = window.innerWidth - tipW - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);

  tip.style.top  = `${top + window.scrollY}px`;
  tip.style.left = `${left + window.scrollX}px`;
  tip.classList.toggle('uhc-tooltip--below', flip);
}

/* ── Modal ── */
let _uhcModalEl = null;

function _uhcEnsureModal() {
  if (_uhcModalEl) return _uhcModalEl;
  const el = document.createElement('div');
  el.className = 'modal-overlay uhc-modal-overlay';
  el.innerHTML = `
    <div class="modal uhc-modal">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">User Details</h3>
          <p class="modal-site-name">&nbsp;</p>
        </div>
        <button type="button" class="modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body uhc-modal-body"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) _uhcCloseModal(); });
  el.querySelector('.modal-close').addEventListener('click', _uhcCloseModal);
  _uhcModalEl = el;
  return el;
}

function _uhcCloseModal() {
  _uhcModalEl?.classList.remove('open');
}

async function _uhcOpenModal(target) {
  _uhcHideTooltip();
  const username = target.getAttribute('data-user-ref');
  const fallback = target.getAttribute('data-user-name') || username;
  const modal = _uhcEnsureModal();
  const body  = modal.querySelector('.uhc-modal-body');

  body.innerHTML = `
    <div class="uhc-modal-head">
      ${_uhcAvatarHtml({ display_name: fallback }, 56)}
      <div>
        <div class="uhc-modal-name">${_uhcEsc(fallback)}</div>
        <div class="uhc-modal-handle">@${_uhcEsc(username)}</div>
      </div>
    </div>
    <div class="uhc-modal-loading"><div class="spinner"></div><span>Loading…</span></div>`;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  const user = await _uhcFetchUser(username);
  if (!modal.classList.contains('open')) return;

  if (!user) {
    body.querySelector('.uhc-modal-loading').outerHTML =
      '<div class="uhc-modal-empty">Couldn’t load this user’s details.</div>';
    return;
  }

  const meta = [user.position, user.company || user.department].filter(Boolean).join(' · ');
  body.innerHTML = `
    <div class="uhc-modal-head">
      ${_uhcAvatarHtml(user, 56)}
      <div>
        <div class="uhc-modal-name">${_uhcEsc(user.display_name)}</div>
        <div class="uhc-modal-handle">@${_uhcEsc(user.username)}</div>
        ${meta ? `<div class="uhc-modal-role">${_uhcEsc(meta)}</div>` : ''}
      </div>
    </div>
    <div class="uhc-modal-fields">
      <div class="uhc-modal-field">
        <span class="uhc-field-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </span>
        <div class="uhc-field-body">
          <span class="uhc-field-label">Email</span>
          ${user.email
            ? `<a class="uhc-field-value uhc-field-link" href="mailto:${_uhcEsc(user.email)}">${_uhcEsc(user.email)}</a>`
            : '<span class="uhc-field-value uhc-field-empty">Not on file</span>'}
        </div>
      </div>
      <div class="uhc-modal-field">
        <span class="uhc-field-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </span>
        <div class="uhc-field-body">
          <span class="uhc-field-label">Contact Number</span>
          ${user.contact_number
            ? `<a class="uhc-field-value uhc-field-link" href="tel:${_uhcEsc(user.contact_number)}">${_uhcEsc(user.contact_number)}</a>`
            : '<span class="uhc-field-value uhc-field-empty">Not on file</span>'}
        </div>
      </div>
    </div>`;
}

/* ── Delegated event wiring (installed once per page) ── */
if (!window._uhcInstalled) {
  window._uhcInstalled = true;

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-user-ref]');
    if (target) _uhcScheduleShow(target);
  });
  document.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-user-ref]');
    if (target) _uhcScheduleHide();
  });
  document.addEventListener('focusin', e => {
    const target = e.target.closest('[data-user-ref]');
    if (target) _uhcScheduleShow(target);
  });
  document.addEventListener('focusout', e => {
    const target = e.target.closest('[data-user-ref]');
    if (target) _uhcScheduleHide();
  });
  document.addEventListener('click', e => {
    const target = e.target.closest('[data-user-ref]');
    if (target) { e.preventDefault(); _uhcOpenModal(target); }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-user-ref]')) {
      e.preventDefault();
      _uhcOpenModal(e.target);
    }
    if (e.key === 'Escape') {
      _uhcHideTooltip();
      _uhcCloseModal();
    }
  });
  document.addEventListener('scroll', () => _uhcHideTooltip(), true);
}
