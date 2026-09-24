'use strict';

/* ══════════════════════════════════════════════════════════════
   CommentEditor — GitHub-style "Write / Preview" tabbed editor.
   Wraps a plain <textarea> in place; the textarea itself keeps
   working exactly as before (same id, same .value), so existing
   code that reads/writes it needs no changes.

   Pasting or attaching an image uploads it, then inserts a literal
   <img width="…" height="…" alt="image" src="…"> tag as TEXT at the
   cursor — matching GitHub's own comment-box paste behavior. Preview
   renders that text (and any legacy rich content) through the shared
   renderCommentPreview() so images show up inline and everything
   else is safely escaped/linkified.

   Load after linkify.js + comment-render.js.
   ══════════════════════════════════════════════════════════════ */

const CE_MAX_FILE_BYTES = 5 * 1024 * 1024;

class CommentEditor {
  constructor(el, opts = {}) {
    this._ta = typeof el === 'string' ? document.getElementById(el) : el;
    if (!this._ta) return;
    this._opts = opts;
    this._uploadEntityType = opts.uploadEntityType || null;
    this._getEntityId      = opts.getEntityId || null;
    this._authHeaders      = opts.authHeaders || (typeof authHeaders === 'function' ? authHeaders : () => ({}));
    this._canUpload        = !!(this._uploadEntityType && this._getEntityId);
    this._build();
  }

  /* ── DOM ──────────────────────────────────────────────────── */
  _build() {
    const ta = this._ta;
    const wrap = document.createElement('div');
    wrap.className = 'ce-wrap';

    const tabs = document.createElement('div');
    tabs.className = 'ce-tabs';
    const writeTab   = this._mkTab('Write', true);
    const previewTab = this._mkTab('Preview', false);
    tabs.appendChild(writeTab);
    tabs.appendChild(previewTab);

    if (this._canUpload) {
      const attachBtn = document.createElement('button');
      attachBtn.type = 'button';
      attachBtn.className = 'ce-attach-btn';
      attachBtn.title = 'Attach an image';
      attachBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        Array.from(fileInput.files || []).forEach(f => this._insertImage(f));
        fileInput.value = '';
      });
      tabs.appendChild(attachBtn);
      tabs.appendChild(fileInput);
      this._fileInput = fileInput;
    }

    const writePanel = document.createElement('div');
    writePanel.className = 'ce-panel ce-write-panel';

    const previewPanel = document.createElement('div');
    previewPanel.className = 'ce-panel ce-preview-panel';
    previewPanel.style.display = 'none';

    const errBox = document.createElement('div');
    errBox.className = 'ce-error';
    errBox.style.display = 'none';

    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(tabs);
    writePanel.appendChild(ta);
    if (this._canUpload) {
      const hint = document.createElement('div');
      hint.className = 'ce-hint';
      hint.textContent = 'Attach images by pasting or clicking the image button above.';
      writePanel.appendChild(hint);
    }
    writePanel.appendChild(errBox);
    wrap.appendChild(writePanel);
    wrap.appendChild(previewPanel);

    this._wrap        = wrap;
    this._writeTab     = writeTab;
    this._previewTab   = previewTab;
    this._writePanel   = writePanel;
    this._previewPanel = previewPanel;
    this._errBox       = errBox;

    writeTab.addEventListener('click', () => this._activate('write'));
    previewTab.addEventListener('click', () => this._activate('preview'));

    if (this._canUpload) {
      ta.addEventListener('paste', e => this._onPaste(e));
      ta.addEventListener('dragover', e => e.preventDefault());
      ta.addEventListener('drop', e => this._onDrop(e));
    }

    previewPanel.addEventListener('click', e => {
      const img = e.target.closest('.ce-inline-img');
      if (img) window.open(img.getAttribute('src'), '_blank', 'noopener');
    });
  }

  _mkTab(label, active) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ce-tab' + (active ? ' active' : '');
    btn.textContent = label;
    return btn;
  }

  _activate(which) {
    const isWrite = which === 'write';
    this._writeTab.classList.toggle('active', isWrite);
    this._previewTab.classList.toggle('active', !isWrite);
    this._writePanel.style.display   = isWrite ? '' : 'none';
    this._previewPanel.style.display = isWrite ? 'none' : '';
    if (!isWrite) {
      const val = this._ta.value || '';
      this._previewPanel.innerHTML = val.trim()
        ? renderCommentPreview(val)
        : '<div class="ce-preview-empty">Nothing to preview.</div>';
    }
  }

  /* ── Image paste / attach ─────────────────────────────────── */
  _onPaste(event) {
    const images = Array.from(event.clipboardData?.items || [])
      .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
      .map(i => i.getAsFile()).filter(Boolean);
    if (!images.length) return;
    event.preventDefault();
    images.forEach(f => this._insertImage(f));
  }

  _onDrop(event) {
    const images = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    images.forEach(f => this._insertImage(f));
  }

  _showError(msg) {
    if (!this._errBox) return;
    this._errBox.textContent = msg;
    this._errBox.style.display = '';
  }

  _clearError() {
    if (this._errBox) this._errBox.style.display = 'none';
  }

  async _insertImage(file) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > CE_MAX_FILE_BYTES) {
      this._showError(`"${file.name}" is larger than 5 MB and was not attached.`);
      return;
    }
    this._clearError();

    const token = `[Uploading ${file.name}#${Math.random().toString(36).slice(2, 8)}…]`;
    this._insertAtCursor(token);

    const [dims, uploaded] = await Promise.all([
      _ceImageDims(file),
      this._uploadImage(file).catch(() => null),
    ]);

    const current = this._ta.value;
    if (!uploaded) {
      this._ta.value = current.replace(token, '');
      this._showError(`Failed to upload "${file.name}". Please try again.`);
      return;
    }
    const tag = `<img width="${dims.w}" height="${dims.h}" alt="image" src="${uploaded.url}">`;
    this._ta.value = current.replace(token, tag);
  }

  _insertAtCursor(text) {
    const ta = this._ta;
    const start = ta.selectionStart ?? ta.value.length;
    const end   = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    const pos = start + text.length;
    try { ta.setSelectionRange(pos, pos); } catch { /* ignore */ }
    ta.focus();
  }

  async _uploadImage(file) {
    const entityId = this._getEntityId();
    if (!entityId) throw new Error('No entity id');
    const fd = new FormData();
    fd.append('entity_type', this._uploadEntityType);
    fd.append('entity_id',   entityId);
    fd.append('file',        file);
    const res = await fetch('/api/upload/resolution', { method: 'POST', headers: this._authHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
    return data;
  }

  /* ── Public API (mirrors the old RichEditor's shape) ──────── */
  getValue() { return this._ta.value; }
  setValue(v) { this._ta.value = v || ''; }
}

function _ceImageDims(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/* ── Factory helper ─────────────────────────────────────────── */
function initCommentEditor(id, opts) {
  const el = document.getElementById(id);
  if (!el) return null;
  return new CommentEditor(el, opts);
}
