'use strict';

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

  const siteName = document.getElementById('riSiteName').value.trim();
  if (!siteName) {
    const sysInput = document.getElementById('riSystemInput');
    if (sysInput) {
      sysInput.focus();
      sysInput.classList.add('input-shake');
      setTimeout(() => sysInput.classList.remove('input-shake'), 400);
    }
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

document.addEventListener('DOMContentLoaded', () => {
  _fetchAndPopulateCompanies();

  // Parse ?system=, ?error=, and ?payload= query params
  const params    = new URLSearchParams(window.location.search);
  const system    = (params.get('system')  || '').trim();
  const errorCode = (params.get('error')   || '').trim();
  const payload   = (params.get('payload') || '').trim();

  if (system) {
    document.getElementById('riSiteName').value         = system;
    document.getElementById('riSystemName').textContent = system;
    document.getElementById('riSystemStrip').style.display    = 'flex';
    document.getElementById('riSystemInputGroup').style.display = 'none';
  } else {
    document.getElementById('riSystemStrip').style.display      = 'none';
    document.getElementById('riSystemInputGroup').style.display = 'flex';
    document.getElementById('riSystemInput').addEventListener('input', e => {
      document.getElementById('riSiteName').value = e.target.value;
    });
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
