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
    body:  'This level is for concerns affecting the entire company and requiring immediate action. Please make sure this truly cannot wait before submitting.',
  },
  P2: {
    mod:   'hd-priority-note--p2',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    title: 'P2 — High Priority',
    body:  'This affects multiple people or teams and needs prompt attention. The team will prioritize this soon.',
  },
  P3: {
    mod:   'hd-priority-note--p3',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    title: 'P3 — Normal Priority',
    body:  'This affects a small group or just you. It will be addressed within 1 business day.',
  },
  P4: {
    mod:   'hd-priority-note--p4',
    icon:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    title: 'P4 — Low Priority',
    body:  'This has minimal impact and can be resolved in the normal queue.',
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

function ghComputePriority() {
  const impact  = document.getElementById('ghBusinessImpact').value;
  const urgency = document.getElementById('ghUrgency').value;
  const p       = _computePriority(impact, urgency);

  const emptyEl  = document.getElementById('ghPriorityEmpty');
  const badgeEl  = document.getElementById('ghPriorityBadge');
  const subEl    = document.getElementById('ghPrioritySub');
  const hiddenEl = document.getElementById('ghPriorityValue');
  const noteEl   = document.getElementById('ghPriorityNote');

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
  noteEl.className     = `hd-priority-note ${note.mod}`;
  noteEl.innerHTML     = `${note.icon}<div><strong>${_esc(note.title)}</strong><p>${_esc(note.body)}</p></div>`;
  noteEl.style.display = '';
}

/* ── Ticket type radio styling ────────────────────────────────────────────── */

function ghOnTicketType(input) {
  document.querySelectorAll('.hd-ticket-option').forEach(el => el.classList.remove('selected'));
  const parent = input.closest('.hd-ticket-option');
  if (parent) parent.classList.add('selected');
}

/* ── File attachments ─────────────────────────────────────────────────────── */

let _ghFiles = [];
let _ghObjectUrls = [];

const _FILE_ICONS = {
  pdf:  { color: '#f87171', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` },
  word: { color: '#60a5fa', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>` },
  txt:  { color: '#a3a3a3', svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
};

function _fileIcon(name) {
  if (/\.pdf$/i.test(name))        return _FILE_ICONS.pdf;
  if (/\.(doc|docx)$/i.test(name)) return _FILE_ICONS.word;
  return _FILE_ICONS.txt;
}

function ghUpdateFiles(input) {
  const incoming = Array.from(input.files);
  const slots    = 5 - _ghFiles.length;
  incoming.slice(0, slots).forEach(f => {
    _ghFiles.push(f);
    _ghObjectUrls.push(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  });
  input.value = '';
  _renderGhPreviews();
}

function ghRemoveFile(idx) {
  if (_ghObjectUrls[idx]) URL.revokeObjectURL(_ghObjectUrls[idx]);
  _ghFiles.splice(idx, 1);
  _ghObjectUrls.splice(idx, 1);
  _renderGhPreviews();
}

function _ghClearFiles() {
  _ghObjectUrls.forEach(u => u && URL.revokeObjectURL(u));
  _ghFiles = [];
  _ghObjectUrls = [];
  _renderGhPreviews();
}

function _renderGhPreviews() {
  const container = document.getElementById('ghFilePreviews');
  const label     = document.getElementById('ghFileLabel');
  if (!_ghFiles.length) {
    container.innerHTML     = '';
    container.style.display = 'none';
    label.textContent = 'Click to attach files or drag & drop';
    return;
  }
  const remaining = 5 - _ghFiles.length;
  label.textContent = remaining > 0
    ? `${_ghFiles.length} file${_ghFiles.length > 1 ? 's' : ''} selected — ${remaining} slot${remaining > 1 ? 's' : ''} remaining`
    : '5 files selected (maximum reached)';

  container.innerHTML = _ghFiles.map((f, i) => {
    const isImg  = f.type.startsWith('image/');
    const objUrl = _ghObjectUrls[i];
    const shortName = f.name.length > 18 ? f.name.slice(0, 15) + '…' : f.name;
    if (isImg && objUrl) {
      return `<div class="hd-file-preview hd-file-preview--img">
        <button type="button" class="hd-file-remove" onclick="ghRemoveFile(${i})" title="Remove">&times;</button>
        <img class="hd-file-thumb" src="${_esc(objUrl)}" alt="${_esc(f.name)}">
        <div class="hd-file-name">${_esc(shortName)}</div>
      </div>`;
    }
    const icon = _fileIcon(f.name);
    return `<div class="hd-file-preview hd-file-preview--doc">
      <button type="button" class="hd-file-remove" onclick="ghRemoveFile(${i})" title="Remove">&times;</button>
      <div class="hd-file-icon" style="color:${icon.color};">${icon.svg}</div>
      <div class="hd-file-name">${_esc(shortName)}</div>
    </div>`;
  }).join('');
  container.style.display = '';
}

/* ── Categories dropdown ─────────────────────────────────────────────────── */

async function _loadCategories(group = '') {
  const sel = document.getElementById('ghCategory');
  sel.innerHTML = '<option value="">— Select a category —</option>';
  try {
    const url  = group
      ? `/api/general-helpdesk/categories?group=${encodeURIComponent(group)}`
      : '/api/general-helpdesk/categories';
    const res  = await fetch(url);
    const list = await res.json();
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.category_name;
      opt.textContent = c.category_name;
      opt.dataset.group = c.category_group || '';
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

async function ghOnCategoryChange() {
  const catSel    = document.getElementById('ghCategory');
  const category  = catSel.value;
  const typeSel   = document.getElementById('ghRequestType');
  const typeGroup = document.getElementById('ghRequestTypeGroup');

  typeSel.innerHTML = '<option value="">Loading…</option>';
  typeSel.disabled  = true;

  if (!category) {
    typeSel.innerHTML       = '<option value="">— Select a category first —</option>';
    typeGroup.style.display = 'none';
    return;
  }

  // auto-select matching handling dept based on the category's group (dept code)
  const selectedOpt = catSel.options[catSel.selectedIndex];
  const catGroup    = selectedOpt ? (selectedOpt.dataset.group || '') : '';
  if (catGroup && catGroup !== 'General') {
    const deptSel = document.getElementById('ghReqDept');
    for (const opt of deptSel.options) {
      if (opt.dataset.code === catGroup) {
        deptSel.value = opt.value;
        break;
      }
    }
  }

  const items = await fetch(`/api/general-helpdesk/request-types?category=${encodeURIComponent(category)}`)
    .then(r => r.json()).catch(() => []);

  typeSel.innerHTML = '<option value="">— Select a type (optional) —</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.request_type;
    opt.textContent = item.request_type;
    typeSel.appendChild(opt);
  });
  typeSel.disabled        = items.length === 0;
  typeGroup.style.display = items.length > 0 ? '' : 'none';
}

/* ── IT Helpdesk redirect prompt ─────────────────────────────────────────── */

function _isItDepartment(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('information technology') || /\bit\b/.test(n);
}

function showItHelpdeskPrompt() {
  const modal = document.getElementById('ghItModal');
  if (modal) modal.style.display = 'flex';
}

function closeItHelpdeskPrompt() {
  const modal = document.getElementById('ghItModal');
  if (modal) modal.style.display = 'none';
}

function ghOnUserDeptChange() {
  const sel  = document.getElementById('ghDepartment');
  const val  = sel.value;
  if (_isItDepartment(val)) showItHelpdeskPrompt();
}

async function ghOnDeptChange() {
  const deptSel  = document.getElementById('ghReqDept');
  const selected = deptSel.options[deptSel.selectedIndex];
  const deptName = selected ? (selected.dataset.name || '') : '';
  const deptCode = selected ? (selected.dataset.code || '') : '';

  if (_isItDepartment(deptName)) showItHelpdeskPrompt();

  const typeSel   = document.getElementById('ghRequestType');
  const typeGroup = document.getElementById('ghRequestTypeGroup');
  typeSel.innerHTML       = '<option value="">— Select a category first —</option>';
  typeSel.disabled        = true;
  typeGroup.style.display = 'none';

  await _loadCategories(deptCode);
}

/* ── Companies dropdown ───────────────────────────────────────────────────── */

async function _loadCompanies() {
  try {
    const res  = await fetch('/api/companies');
    const list = await res.json();
    const sel  = document.getElementById('ghCompany');
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.company_code} — ${c.name}`;
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

/* ── Departments dropdowns ────────────────────────────────────────────────── */

async function _loadDepartments() {
  try {
    const res         = await fetch('/api/departments');
    const depts       = await res.json();
    const userDeptSel = document.getElementById('ghDepartment');
    const reqDeptSel  = document.getElementById('ghReqDept');
    depts.forEach(d => {
      if (userDeptSel) {
        const opt = document.createElement('option');
        opt.value = d.department_name;
        opt.textContent = `${d.department_code} — ${d.department_name}`;
        userDeptSel.appendChild(opt);
      }
      if (reqDeptSel) {
        const opt = document.createElement('option');
        opt.value = d.department_id;
        opt.textContent = `${d.department_code} — ${d.department_name}`;
        opt.dataset.name = d.department_name;
        opt.dataset.code = d.department_code;
        reqDeptSel.appendChild(opt);
      }
    });
  } catch { /* non-fatal */ }
}

/* ── Form submission ──────────────────────────────────────────────────────── */

async function ghSubmit(e) {
  e.preventDefault();

  const ticketType = document.querySelector('input[name="ticket_type"]:checked');
  if (!ticketType) {
    const el = document.getElementById('ghTicketTypes');
    el.style.outline      = '2px solid var(--error)';
    el.style.borderRadius = '12px';
    setTimeout(() => { el.style.outline = ''; }, 1800);
    return;
  }

  document.getElementById('ghFormActions').style.display = 'none';
  document.getElementById('ghLoading').style.display     = 'flex';
  document.getElementById('ghSuccess').style.display     = 'none';
  document.getElementById('ghError').style.display       = 'none';

  const fd = new FormData(document.getElementById('ghForm'));
  _ghFiles.forEach(f => fd.append('attachments', f));

  try {
    const res  = await fetch('/api/general-helpdesk', { method: 'POST', body: fd });
    const data = await res.json();

    document.getElementById('ghLoading').style.display = 'none';

    if (data.success) {
      document.getElementById('ghSuccessMsg').textContent = data.message || 'Your request has been submitted.';
      document.getElementById('ghSuccess').style.display  = 'flex';
      document.getElementById('ghForm').reset();
      document.querySelectorAll('.hd-ticket-option').forEach(el => el.classList.remove('selected'));
      ghComputePriority();
      _ghClearFiles();
      document.getElementById('ghRequestType').innerHTML = '<option value="">— Select a category first —</option>';
      document.getElementById('ghRequestType').disabled  = true;
      document.getElementById('ghRequestTypeGroup').style.display = 'none';
    } else {
      document.getElementById('ghFormActions').style.display = 'flex';
      document.getElementById('ghError').style.display       = 'flex';
      document.getElementById('ghErrorMsg').textContent      = data.error || 'An unexpected error occurred.';
    }
  } catch {
    document.getElementById('ghLoading').style.display     = 'none';
    document.getElementById('ghFormActions').style.display = 'flex';
    document.getElementById('ghError').style.display       = 'flex';
    document.getElementById('ghErrorMsg').textContent      = 'Network error — please try again.';
  }
}

/* ── Bootstrap ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeItHelpdeskPrompt();
  });

  await Promise.all([_loadCompanies(), _loadCategories(), _loadDepartments()]);
  hidePageLoader();

  const zone = document.getElementById('ghDropZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const dt = e.dataTransfer;
      if (dt?.files?.length) {
        const slots = 5 - _ghFiles.length;
        Array.from(dt.files).slice(0, slots).forEach(f => {
          _ghFiles.push(f);
          _ghObjectUrls.push(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
        });
        _renderGhPreviews();
      }
    });
  }
});
