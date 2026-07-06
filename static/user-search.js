/* ════════════════════════════════════════════════════════════════
   USER SEARCH AUTOCOMPLETE
   Attaches to a name input; on selection fills related fields.

   Usage:
     initUserSearch('inputId', {
       email:      'emailFieldId',
       viber:      'viberFieldId',
       company:    'companySelectId',   // <select>
       department: 'departmentSelectId' // <select>
     });
   ════════════════════════════════════════════════════════════════ */

function initUserSearch(nameInputId, fieldMap) {
  const input = document.getElementById(nameInputId);
  if (!input) return;

  // Wrap the input in a relative container
  const parent = input.parentElement;
  parent.classList.add('us-wrap');

  let dropdown = null;
  let results  = [];
  let activeIdx = -1;
  let debounceTimer = null;

  function _buildName(u) {
    if (u.display_name) return u.display_name;
    const parts = [u.first_name, u.middle_initial, u.last_name].filter(Boolean);
    return parts.join(' ');
  }

  function _initial(u) {
    return (_buildName(u).charAt(0) || '?').toUpperCase();
  }

  function _openDropdown() {
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'us-dropdown';
      parent.appendChild(dropdown);
    }
    dropdown.style.display = '';
  }

  function _closeDropdown() {
    if (dropdown) dropdown.style.display = 'none';
    activeIdx = -1;
  }

  function _renderResults() {
    if (!dropdown) return;
    if (!results.length) {
      dropdown.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--text-muted);">No matching users found.</div>';
      return;
    }
    dropdown.innerHTML = results.map((u, i) => {
      const name = _buildName(u);
      const meta = [u.company, u.department].filter(Boolean).join(' · ');
      return `<div class="us-item${i === activeIdx ? ' us-active' : ''}" data-idx="${i}">
        <div class="us-avatar">${_initial(u)}</div>
        <div class="us-info">
          <div class="us-name">${_escHtml(name)}</div>
          ${meta ? `<div class="us-meta">${_escHtml(meta)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    dropdown.querySelectorAll('.us-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        _selectUser(results[+el.dataset.idx]);
      });
    });
  }

  function _escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _selectUser(u) {
    const name = _buildName(u);
    input.value = name;
    _closeDropdown();
    _showFilledBadge(name);

    // Fill each mapped field
    if (fieldMap.email && u.email) {
      const el = document.getElementById(fieldMap.email);
      if (el) el.value = u.email;
    }
    if (fieldMap.viber && u.viber_number) {
      const el = document.getElementById(fieldMap.viber);
      if (el) el.value = u.viber_number;
    }
    if (fieldMap.company && u.company) {
      const sel = document.getElementById(fieldMap.company);
      if (sel) {
        sel.value = u.company;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (fieldMap.department && u.department) {
      const sel = document.getElementById(fieldMap.department);
      if (sel) {
        sel.value = u.department;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function _showFilledBadge(name) {
    // Remove any existing badge
    parent.querySelectorAll('.us-filled-badge').forEach(b => b.remove());
    const badge = document.createElement('div');
    badge.className = 'us-filled-badge';
    badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Autofilled from system`;
    parent.appendChild(badge);
    setTimeout(() => badge.remove(), 4000);
  }

  async function _search(q) {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      results = await res.json();
      activeIdx = -1;
      _openDropdown();
      _renderResults();
    } catch { /* non-fatal */ }
  }

  // Event listeners
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    parent.querySelectorAll('.us-filled-badge').forEach(b => b.remove());
    if (q.length < 2) { _closeDropdown(); return; }
    debounceTimer = setTimeout(() => _search(q), 300);
  });

  input.addEventListener('keydown', e => {
    if (!dropdown || dropdown.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
      _renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      _renderResults();
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      _selectUser(results[activeIdx]);
    } else if (e.key === 'Escape') {
      _closeDropdown();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(_closeDropdown, 150);
  });
}
