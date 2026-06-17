'use strict';

const THEME_KEY = 'rgmc-theme';

const MOON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_ICON  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function _getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function _applyTheme(theme) {
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

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
