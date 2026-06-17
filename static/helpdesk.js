'use strict';

/* ── Priority computation ─────────────────────────────────────────────────── */

const PRIORITY_META = {
  P1: { label: 'P1 — Critical / Show Stopper', cls: 'p1' },
  P2: { label: 'P2 — High Risk',               cls: 'p2' },
  P3: { label: 'P3 — Medium Risk',             cls: 'p3' },
  P4: { label: 'P4 — Low Risk',                cls: 'p4' },
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

  const warnEl = document.getElementById('hdP1Warning');

  if (!p) {
    emptyEl.style.display  = '';
    badgeEl.style.display  = 'none';
    subEl.style.display    = 'none';
    hiddenEl.value         = '';
    warnEl.style.display   = 'none';
    return;
  }

  const meta = PRIORITY_META[p];
  emptyEl.style.display   = 'none';
  badgeEl.className       = `hd-priority-badge ${meta.cls}`;
  badgeEl.textContent     = p;
  badgeEl.style.display   = '';
  subEl.textContent       = meta.label.split('—')[1]?.trim() || meta.label;
  subEl.style.display     = '';
  hiddenEl.value          = p;
  warnEl.style.display    = p === 'P1' ? '' : 'none';
}

/* ── Ticket type radio styling ────────────────────────────────────────────── */

function hdOnTicketType(input) {
  document.querySelectorAll('.hd-ticket-option').forEach(el => el.classList.remove('selected'));
  const parent = input.closest('.hd-ticket-option');
  if (parent) parent.classList.add('selected');
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
});
