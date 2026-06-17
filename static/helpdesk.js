'use strict';

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Priority computation ─────────────────────────────────────────────────── */

const PRIORITY_META = {
  P1: { label: 'P1 — Critical / Show Stopper', cls: 'p1' },
  P2: { label: 'P2 — High Risk',               cls: 'p2' },
  P3: { label: 'P3 — Medium Risk',             cls: 'p3' },
  P4: { label: 'P4 — Low Risk',                cls: 'p4' },
};

const PRIORITY_NOTES = {
  P1: {
    mod:   'hd-priority-note--p1',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    title: 'P1 — Critical Priority',
    body:  'Reserved for company-wide outages where all operations are halted. Confirm this truly affects the entire company and cannot wait before submitting.',
  },
  P2: {
    mod:   'hd-priority-note--p2',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    title: 'P2 — High Risk',
    body:  'Major disruption affecting multiple teams or departments. The IT team will prioritize this promptly.',
  },
  P3: {
    mod:   'hd-priority-note--p3',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    title: 'P3 — Medium Risk',
    body:  'Moderate impact on a small group or individual. Will be addressed within 1 business day.',
  },
  P4: {
    mod:   'hd-priority-note--p4',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    title: 'P4 — Low Risk',
    body:  'Minor issue with minimal business impact. Will be resolved in the normal queue.',
  },
};

function _computePriority(impact, urgency) {
  if (!impact || !urgency) return null;
  if (impact === 'high'   && urgency === 'high')   return 'P1';
  if (impact === 'high'   && urgency === 'medium')  return 'P2';
  if (impact === 'medium' && urgency === 'high')    return 'P2';
  if (impact === 'medium' && urgency === 'medium')  return 'P3';
  return 'P4';
}

function hdComputePriority() {
  const impact  = document.getElementById('hdBusinessImpact').value;
  const urgency = document.getElementById('hdUrgency').value;
  const p       = _computePriority(impact, urgency);

  const emptyEl  = document.getElementById('hdPriorityEmpty');
  const badgeEl  = document.getElementById('hdPriorityBadge');
  const subEl    = document.getElementById('hdPrioritySub');
  const hiddenEl = document.getElementById('hdPriorityValue');

  const noteEl = document.getElementById('hdPriorityNote');

  if (!p) {
    emptyEl.style.display = '';
    badgeEl.style.display = 'none';
    subEl.style.display   = 'none';
    hiddenEl.value        = '';
    noteEl.style.display  = 'none';
    return;
  }

  const meta = PRIORITY_META[p];
  emptyEl.style.display  = 'none';
  badgeEl.className      = `hd-priority-badge ${meta.cls}`;
  badgeEl.textContent    = p;
  badgeEl.style.display  = '';
  subEl.textContent      = meta.label.split('—')[1]?.trim() || meta.label;
  subEl.style.display    = '';
  hiddenEl.value         = p;

  const note = PRIORITY_NOTES[p];
  noteEl.className   = `hd-priority-note ${note.mod}`;
  noteEl.innerHTML   = `${note.icon}<div><strong>${_esc(note.title)}</strong><p>${_esc(note.body)}</p></div>`;
  noteEl.style.display = '';
}

/* ── Ticket type radio styling ────────────────────────────────────────────── */

function hdOnTicketType(input) {
  document.querySelectorAll('.hd-ticket-option').forEach(el => el.classList.remove('selected'));
  const parent = input.closest('.hd-ticket-option');
  if (parent) parent.classList.add('selected');
}

/* ── File attachments ─────────────────────────────────────────────────────── */

let _hdFiles = [];
let _hdObjectUrls = [];

const _FILE_ICONS = {
  pdf:  { color: '#f87171', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` },
  word: { color: '#60a5fa', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>` },
  txt:  { color: '#a3a3a3', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
};

function _fileIcon(name) {
  if (/\.pdf$/i.test(name))                return _FILE_ICONS.pdf;
  if (/\.(doc|docx)$/i.test(name))         return _FILE_ICONS.word;
  return _FILE_ICONS.txt;
}

function hdUpdateFiles(input) {
  const incoming = Array.from(input.files);
  const slots    = 5 - _hdFiles.length;
  incoming.slice(0, slots).forEach(f => {
    _hdFiles.push(f);
    _hdObjectUrls.push(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  });
  input.value = '';
  _renderHdPreviews();
}

function hdRemoveFile(idx) {
  if (_hdObjectUrls[idx]) URL.revokeObjectURL(_hdObjectUrls[idx]);
  _hdFiles.splice(idx, 1);
  _hdObjectUrls.splice(idx, 1);
  _renderHdPreviews();
}

function _hdClearFiles() {
  _hdObjectUrls.forEach(u => u && URL.revokeObjectURL(u));
  _hdFiles = [];
  _hdObjectUrls = [];
  _renderHdPreviews();
}

function _renderHdPreviews() {
  const container = document.getElementById('hdFilePreviews');
  const label     = document.getElementById('hdFileLabel');
  if (!_hdFiles.length) {
    container.innerHTML    = '';
    container.style.display = 'none';
    label.textContent = 'Click to attach files or drag & drop';
    return;
  }
  const remaining = 5 - _hdFiles.length;
  label.textContent = remaining > 0
    ? `${_hdFiles.length} file${_hdFiles.length > 1 ? 's' : ''} selected — ${remaining} slot${remaining > 1 ? 's' : ''} remaining`
    : '5 files selected (maximum reached)';

  container.innerHTML = _hdFiles.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const objUrl = _hdObjectUrls[i];
    const shortName = f.name.length > 18 ? f.name.slice(0, 15) + '…' : f.name;
    if (isImg && objUrl) {
      return `<div class="hd-file-preview hd-file-preview--img">
        <button type="button" class="hd-file-remove" onclick="hdRemoveFile(${i})" title="Remove">&times;</button>
        <img class="hd-file-thumb" src="${_esc(objUrl)}" alt="${_esc(f.name)}">
        <div class="hd-file-name">${_esc(shortName)}</div>
      </div>`;
    }
    const icon = _fileIcon(f.name);
    return `<div class="hd-file-preview hd-file-preview--doc">
      <button type="button" class="hd-file-remove" onclick="hdRemoveFile(${i})" title="Remove">&times;</button>
      <div class="hd-file-icon" style="color:${icon.color};">${icon.svg}</div>
      <div class="hd-file-name">${_esc(shortName)}</div>
    </div>`;
  }).join('');
  container.style.display = '';
}

/* ── Companies dropdown ───────────────────────────────────────────────────── */

async function _loadCompanies() {
  try {
    const res  = await fetch('/api/companies');
    const list = await res.json();
    const sel  = document.getElementById('hdCompany');
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.company_code} — ${c.name}`;
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

/* ── Categories dropdown ──────────────────────────────────────────────────── */

async function _loadCategories() {
  try {
    const res  = await fetch('/api/helpdesk/categories');
    const list = await res.json();
    const sel  = document.getElementById('hdCategory');
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.category_name;
      opt.textContent = c.category_name;
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

/* ── Subcategories + Request Types (driven by category) ──────────────────── */

async function hdOnCategoryChange() {
  const category  = document.getElementById('hdCategory').value;
  const subSel    = document.getElementById('hdSubcategory');
  const typeSel   = document.getElementById('hdRequestType');

  subSel.innerHTML = '<option value="">Loading…</option>';
  subSel.disabled  = true;
  typeSel.innerHTML = '<option value="">Loading…</option>';
  typeSel.disabled  = true;

  if (!category) {
    subSel.innerHTML  = '<option value="">— Select category first —</option>';
    typeSel.innerHTML = '<option value="">— Select category first —</option>';
    return;
  }

  // Load subcategories and request types in parallel
  const [subItems, typeItems] = await Promise.all([
    fetch(`/api/helpdesk/subcategories?category=${encodeURIComponent(category)}`).then(r => r.json()).catch(() => []),
    fetch(`/api/helpdesk/request-types?category=${encodeURIComponent(category)}`).then(r => r.json()).catch(() => []),
  ]);

  subSel.innerHTML = '<option value="">— Select sub-category —</option>';
  subItems.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    subSel.appendChild(opt);
  });
  subSel.disabled = subItems.length === 0;

  typeSel.innerHTML = '<option value="">— Select request type —</option>';
  typeItems.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.request_type;
    opt.textContent = item.request_type;
    typeSel.appendChild(opt);
  });
  typeSel.disabled = typeItems.length === 0;
}

/* ── Pre-fill from URL params ─────────────────────────────────────────────── */

async function _applyUrlParams() {
  const params   = new URLSearchParams(window.location.search);
  const system   = params.get('system');
  const ticketType = params.get('ticket_type');
  const category = params.get('request_category');
  const subcategory = params.get('request_subcategory');
  const reqType  = params.get('request_type');

  if (ticketType) {
    const radio = document.querySelector(`input[name="ticket_type"][value="${CSS.escape(ticketType)}"]`);
    if (radio) { radio.checked = true; hdOnTicketType(radio); }
  }

  // Coming from a system card: pre-fill Software/Application + system
  if (system) {
    const catSel = document.getElementById('hdCategory');
    catSel.value = 'Software/Application';
    await hdOnCategoryChange();

    // Pre-select the system in the subcategory dropdown
    const subSel = document.getElementById('hdSubcategory');
    if (subSel.querySelector(`option[value="${CSS.escape(system)}"]`)) {
      subSel.value = system;
    }

    // Default to Incident/Problem for system redirects
    if (!ticketType) {
      const radio = document.querySelector('input[name="ticket_type"][value="incident_problem"]');
      if (radio) { radio.checked = true; hdOnTicketType(radio); }
    }

    // Pre-select Bug Fix
    const typeSel = document.getElementById('hdRequestType');
    const bugOpt  = typeSel.querySelector('option[value="Bug Fix"]');
    if (bugOpt) typeSel.value = 'Bug Fix';

    return;
  }

  if (category) {
    const catSel = document.getElementById('hdCategory');
    catSel.value = category;
    await hdOnCategoryChange();
  }

  if (subcategory) {
    const subSel = document.getElementById('hdSubcategory');
    if (subSel.querySelector(`option[value="${CSS.escape(subcategory)}"]`)) {
      subSel.value = subcategory;
    }
  }

  if (reqType) {
    const typeSel = document.getElementById('hdRequestType');
    const opt = typeSel.querySelector(`option[value="${CSS.escape(reqType)}"]`);
    if (opt) typeSel.value = reqType;
  }
}

/* ── Form submission ──────────────────────────────────────────────────────── */

async function hdSubmit(e) {
  e.preventDefault();

  const ticketType = document.querySelector('input[name="ticket_type"]:checked');
  if (!ticketType) {
    const el = document.getElementById('hdTicketTypes');
    el.style.outline = '2px solid var(--error)';
    el.style.borderRadius = '12px';
    setTimeout(() => { el.style.outline = ''; }, 1800);
    return;
  }

  const anydeskId = document.getElementById('hdAnydeskId').value.trim();
  if (anydeskId && !/^\d{9}$/.test(anydeskId)) {
    document.getElementById('hdError').style.display    = 'flex';
    document.getElementById('hdErrorMsg').textContent   = 'AnyDesk ID must be exactly 9 digits.';
    return;
  }

  document.getElementById('hdFormActions').style.display = 'none';
  document.getElementById('hdLoading').style.display     = 'flex';
  document.getElementById('hdSuccess').style.display     = 'none';
  document.getElementById('hdError').style.display       = 'none';

  const fd = new FormData(document.getElementById('hdForm'));
  _hdFiles.forEach(f => fd.append('attachments', f));

  try {
    const res  = await fetch('/api/helpdesk', { method: 'POST', body: fd });
    const data = await res.json();

    document.getElementById('hdLoading').style.display = 'none';

    if (data.success) {
      document.getElementById('hdSuccessMsg').textContent = data.message || 'Your ticket has been submitted.';
      document.getElementById('hdSuccess').style.display  = 'flex';
      document.getElementById('hdForm').reset();
      // Reset UI state after form reset
      document.querySelectorAll('.hd-ticket-option').forEach(el => el.classList.remove('selected'));
      document.getElementById('hdSubcategory').innerHTML = '<option value="">— Select category first —</option>';
      document.getElementById('hdSubcategory').disabled  = true;
      document.getElementById('hdRequestType').innerHTML = '<option value="">— Select category first —</option>';
      document.getElementById('hdRequestType').disabled  = true;
      hdComputePriority();
      _hdClearFiles();
    } else {
      document.getElementById('hdFormActions').style.display = 'flex';
      document.getElementById('hdError').style.display       = 'flex';
      document.getElementById('hdErrorMsg').textContent      = data.error || 'An unexpected error occurred.';
    }
  } catch {
    document.getElementById('hdLoading').style.display     = 'none';
    document.getElementById('hdFormActions').style.display = 'flex';
    document.getElementById('hdError').style.display       = 'flex';
    document.getElementById('hdErrorMsg').textContent      = 'Network error — please try again.';
  }
}

/* ── Bootstrap ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([_loadCompanies(), _loadCategories()]);
  await _applyUrlParams();

  const zone = document.getElementById('hdDropZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (dt?.files?.length) {
        const slots = 5 - _hdFiles.length;
        Array.from(dt.files).slice(0, slots).forEach(f => {
          _hdFiles.push(f);
          _hdObjectUrls.push(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
        });
        _renderHdPreviews();
      }
    });
  }
});
