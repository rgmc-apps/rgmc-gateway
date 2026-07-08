'use strict';

let _riDescEditor = null;

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Companies dropdown ───────────────────────────────────── */

async function _fetchAndPopulateCompanies() {
  try {
    const res  = await fetch('/api/companies');
    const list = await res.json();
    const sel  = document.getElementById('riCompanyName');
    if (!sel) return;
    list.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.company_code} — ${c.name}`;
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

/* ── Departments dropdown ─────────────────────────────────── */

async function _fetchAndPopulateDepartments() {
  const sel = document.getElementById('riDepartment');
  if (!sel) return;
  try {
    const res  = await fetch('/api/departments');
    const list = await res.json();
    list.forEach(d => {
      const opt = document.createElement('option');
      opt.value       = d.department_name;
      opt.textContent = d.department_name;
      sel.appendChild(opt);
    });
    deptOtherInit('riDepartment', 'riDepartment-other-input', 'riDepartment-other-wrap');
  } catch { /* non-fatal */ }
}

/* ── Priority hint ────────────────────────────────────────── */

const _PRIORITY_INFO = {
  P1: { color: '#D85858', desc: 'Severe impact — system down or entire company affected. Immediate response required.' },
  P2: { color: '#E8873A', desc: 'Significant impact — department or team affected. Urgent attention needed.' },
  P3: { color: '#D49632', desc: 'Moderate impact — single user or minor workflow disruption. Prompt action needed.' },
  P4: { color: '#52A870', desc: 'Minimal impact — cosmetic issue or minor inconvenience. No immediate urgency.' },
};

function riUpdatePriorityHint() {
  const sel  = document.getElementById('riPriority');
  const hint = document.getElementById('riPriorityHint');
  if (!hint) return;
  const info = _PRIORITY_INFO[sel.value];
  if (!info) { hint.innerHTML = ''; return; }
  hint.innerHTML =
    `<span class="ri-prio-dot" style="background:${info.color}"></span>`
    + `<span>${info.desc}</span>`;
}

/* ── Category + Subcategory dropdowns ─────────────────────── */

async function _fetchAndPopulateCategories() {
  const sel = document.getElementById('riCategory');
  if (!sel) return;
  try {
    const res  = await fetch('/api/helpdesk/categories');
    const cats = await res.json();
    sel.innerHTML = '';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.category_name;
      opt.textContent = c.category_name;
      sel.appendChild(opt);
    });
    // Default to Software/Application
    const sw = [...sel.options].find(o => o.value === 'Software/Application');
    if (sw) sw.selected = true;
    else if (sel.options.length) sel.options[0].selected = true;
  } catch {
    sel.innerHTML = '<option value="Software/Application">Software/Application</option>';
  }
}

async function _fetchAndPopulateSubcategories(category) {
  const sel   = document.getElementById('riSubcategory');
  const label = document.getElementById('riSubcategoryLabel');
  if (!sel) return;

  // Clear immediately so a stale value can't sneak through while the fetch is in flight
  document.getElementById('riSiteName').value = '';

  const isSoftware = category === 'Software/Application';
  if (label) {
    label.innerHTML = (isSoftware ? 'Affected System' : 'Item / Subcategory')
      + ' <span class="required">*</span>';
  }

  sel.innerHTML = '<option value="" disabled selected>Loading…</option>';
  try {
    const res   = await fetch(`/api/helpdesk/subcategories?category=${encodeURIComponent(category)}`);
    const items = await res.json();
    sel.innerHTML = `<option value="" disabled selected>Select ${isSoftware ? 'system' : 'item'}…</option>`;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.label;
      opt.textContent = item.label;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = '<option value="" disabled selected>Failed to load</option>';
  }
}

function riOnCategoryChange() {
  const cat = document.getElementById('riCategory').value;
  if (cat) _fetchAndPopulateSubcategories(cat);
}

function riOnSubcategoryChange() {
  const val = document.getElementById('riSubcategory').value;
  document.getElementById('riSiteName').value = val;
  const errEl = document.getElementById('riSubcategoryError');
  if (errEl) errEl.style.display = 'none';
}

/* ── Payload help modal ───────────────────────────────────── */

function riOpenPayloadHelp() {
  document.getElementById('riPayloadHelpOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function riClosePayloadHelp() {
  document.getElementById('riPayloadHelpOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Form submission ──────────────────────────────────────── */

async function riSubmit(e) {
  e.preventDefault();

  const siteName      = document.getElementById('riSiteName').value.trim();
  const subGroup      = document.getElementById('riSubcategoryGroup');
  const subGroupShown = subGroup && subGroup.style.display !== 'none';

  if (!siteName) {
    if (subGroupShown) {
      const subSel = document.getElementById('riSubcategory');
      const errEl  = document.getElementById('riSubcategoryError');
      if (errEl) errEl.style.display = 'block';
      subSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      subSel.focus();
      subSel.classList.add('input-shake');
      setTimeout(() => subSel.classList.remove('input-shake'), 400);
    }
    return;
  }

  const descHtml = _riDescEditor ? _riDescEditor.getValue() : document.getElementById('riDescription').value.trim();
  if (!descHtml) {
    const editorWrap = _riDescEditor?._wrap || document.getElementById('riDescription');
    editorWrap.classList.add('input-shake');
    editorWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => editorWrap.classList.remove('input-shake'), 400);
    return;
  }

  document.getElementById('riFormActions').style.display = 'none';
  document.getElementById('riLoading').style.display     = 'flex';
  document.getElementById('riSuccess').style.display     = 'none';
  document.getElementById('riError').style.display       = 'none';

  const form = document.getElementById('riForm');
  const fd   = new FormData(form);

  const fileInput = document.getElementById('riAttachments');
  const files = Array.from(fileInput.files).slice(0, 5);
  fd.delete('attachments');
  files.forEach(f => fd.append('attachments', f));

  fd.set('site_name', siteName);
  fd.set('description', descHtml);

  const resolvedDept = await deptOtherResolve('riDepartment', 'riDepartment-other-input');
  fd.set('department', resolvedDept);

  try {
    const res  = await fetch('/api/issues', { method: 'POST', body: fd });
    const data = await res.json();

    document.getElementById('riLoading').style.display = 'none';

    if (data.success) {
      document.getElementById('riSuccessMsg').textContent = data.message || 'Your report has been submitted.';
      document.getElementById('riSuccess').style.display = 'flex';
      document.getElementById('riAccountSuggestion').style.display = 'flex';
      form.reset();
      document.getElementById('riSiteName').value = siteName;
      document.getElementById('riFileLabel').textContent = 'Click to attach files or drag & drop';
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

document.addEventListener('DOMContentLoaded', async () => {
  _riDescEditor = initRichEditor('riDescription');
  document.getElementById('riForm').addEventListener('reset', () => _riDescEditor?.setValue(''));

  _fetchAndPopulateCompanies();
  _fetchAndPopulateDepartments();
  riUpdatePriorityHint(); // show hint for default P4

  initUserSearch('riEmployeeName', {
    email:      'riEmail',
    viber:      'riViberNumber',
    company:    'riCompanyName',
    department: 'riDepartment',
  });

  // Parse ?system=, ?error=, and ?payload= query params
  const params    = new URLSearchParams(window.location.search);
  const system    = (params.get('system')  || '').trim();
  const errorCode = (params.get('error')   || '').trim();
  const payload   = (params.get('payload') || '').trim();

  // Always load categories and default to Software/Application
  await _fetchAndPopulateCategories();

  if (system) {
    // System pre-filled from URL param — show strip, hide subcategory picker
    document.getElementById('riSiteName').value         = system;
    document.getElementById('riSystemName').textContent = system;
    document.getElementById('riSystemStrip').style.display    = 'flex';
    document.getElementById('riSubcategoryGroup').style.display = 'none';
  } else {
    // No param — show the subcategory dropdown and load default subcategories
    document.getElementById('riSystemStrip').style.display      = 'none';
    document.getElementById('riSubcategoryGroup').style.display = 'flex';
    const defaultCat = document.getElementById('riCategory').value;
    if (defaultCat) await _fetchAndPopulateSubcategories(defaultCat);
  }

  if (errorCode) {
    document.getElementById('riErrorCode').value = errorCode;
  }

  if (payload) {
    document.getElementById('riUserPayload').value = payload;
  }

  // Close payload help modal on ESC
  document.addEventListener('keydown', e => { if (e.key === 'Escape') riClosePayloadHelp(); });

  // Drag & drop feedback on the file zone
  const zone = document.getElementById('riDropZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', () => zone.classList.remove('dragover'));
  }
});
