'use strict';

const THEME_KEY = 'rgmc-theme';

const MOON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_ICON  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function _getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function _applyTheme(theme) {
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    localStorage.setItem(THEME_KEY, theme);
  } else {
    localStorage.removeItem(THEME_KEY);
  }

  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'light' ? MOON_ICON : SUN_ICON;
    btn.title     = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  }

  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400);
}

function toggleTheme() {
  _applyTheme(_getTheme() === 'dark' ? 'light' : 'dark');
}

/* ── Page Loader ── */
function hidePageLoader() {
  const el = document.getElementById('pageLoader');
  if (!el) return;
  el.classList.add('page-loader--done');
  el.addEventListener('transitionend', () => { if (el.parentNode) el.remove(); }, { once: true });
  setTimeout(() => { if (el.parentNode) el.remove(); }, 700);
}

/* ── Global Confirm Modal ── */
function showConfirm({ title = 'Confirm', message = '', detail = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    let overlay = document.getElementById('_gcmOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '_gcmOverlay';
      overlay.className = 'gcm-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="gcm-panel">
          <div class="gcm-head">
            <div class="gcm-icon-wrap" id="_gcmIcon"></div>
            <button class="gcm-dismiss" id="_gcmDismiss" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <h3 class="gcm-title" id="_gcmTitle"></h3>
          <p class="gcm-message" id="_gcmMessage"></p>
          <p class="gcm-detail" id="_gcmDetail" style="display:none;"></p>
          <div class="gcm-actions">
            <button class="gcm-btn gcm-btn-cancel" id="_gcmCancel"></button>
            <button class="gcm-btn gcm-btn-confirm" id="_gcmConfirm"></button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }

    const titleEl    = document.getElementById('_gcmTitle');
    const msgEl      = document.getElementById('_gcmMessage');
    const detailEl   = document.getElementById('_gcmDetail');
    const iconEl     = document.getElementById('_gcmIcon');
    const cancelBtn  = document.getElementById('_gcmCancel');
    const confirmBtn = document.getElementById('_gcmConfirm');
    const dismissBtn = document.getElementById('_gcmDismiss');

    titleEl.textContent    = title;
    msgEl.textContent      = message;
    detailEl.textContent   = detail;
    detailEl.style.display = detail ? '' : 'none';
    cancelBtn.textContent  = cancelText;
    confirmBtn.textContent = confirmText;
    confirmBtn.className   = `gcm-btn ${danger ? 'gcm-btn-danger' : 'gcm-btn-confirm'}`;
    iconEl.className       = `gcm-icon-wrap ${danger ? 'gcm-icon--danger' : 'gcm-icon--info'}`;
    iconEl.innerHTML       = danger
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    overlay.classList.add('gcm-open');
    setTimeout(() => confirmBtn.focus(), 50);

    function dismiss(result) {
      overlay.classList.remove('gcm-open');
      resolve(result);
    }

    const onConfirm = () => dismiss(true);
    const onCancel  = () => dismiss(false);
    const onKey     = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); dismiss(false); } };

    overlay.onclick = e => { if (e.target === overlay) { document.removeEventListener('keydown', onKey); dismiss(false); } };
    confirmBtn.onclick = () => { document.removeEventListener('keydown', onKey); onConfirm(); };
    cancelBtn.onclick  = () => { document.removeEventListener('keydown', onKey); onCancel();  };
    dismissBtn.onclick = () => { document.removeEventListener('keydown', onKey); onCancel();  };
    document.addEventListener('keydown', onKey);
  });
}

/* Inject the toggle button into the floating nav pill */
(function () {
  const inner = document.querySelector('.header-inner');
  if (!inner) return;

  const btn = document.createElement('button');
  btn.id        = 'themeToggleBtn';
  btn.className = 'btn-theme-toggle';
  const cur = _getTheme();
  btn.innerHTML = cur === 'light' ? MOON_ICON : SUN_ICON;
  btn.title     = cur === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  btn.addEventListener('click', toggleTheme);

  const user = inner.querySelector('.header-user');
  if (user) {
    inner.insertBefore(btn, user);
  } else {
    inner.appendChild(btn);
  }
})();
