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
const CE_MENTION_DEBOUNCE_MS = 200;

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
    ta.addEventListener('keydown', e => this._onKeydown(e));

    previewPanel.addEventListener('click', e => {
      const img = e.target.closest('.ce-inline-img');
      if (img) window.open(img.getAttribute('src'), '_blank', 'noopener');
    });

    const mentionBox = document.createElement('div');
    mentionBox.className = 'ce-mention-dropdown';
    mentionBox.style.display = 'none';
    document.body.appendChild(mentionBox);
    this._mentionBox = mentionBox;
    this._mentionResults = [];
    this._mentionActiveIdx = -1;
    this._mentionStart = -1;
    this._mentionTimer = null;
    this._mentionCloseOnScroll = () => this._closeMentions();

    ta.addEventListener('input', () => this._onMentionInput());
    ta.addEventListener('blur', () => { setTimeout(() => this._closeMentions(), 150); });
    window.addEventListener('scroll', this._mentionCloseOnScroll, true);
    window.addEventListener('resize', this._mentionCloseOnScroll);
    mentionBox.addEventListener('mousedown', e => {
      const item = e.target.closest('.ce-mention-item');
      if (!item) return;
      e.preventDefault();
      this._selectMention(this._mentionResults[+item.dataset.idx]);
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

  /* ── Lightweight list auto-formatting ─────────────────────────
     Typing "- " at the start of a line turns it into a bullet ("• ").
     Typing "1. " (any number) turns it into a tab-aligned numbered
     entry ("1.\t"). Enter continues the current list; an empty list
     line ends it. Storage stays plain text (bullet char / literal
     tab), matching how images are stored as literal text too — see
     the file header comment. */
  _onKeydown(e) {
    if (this._mentionOpen() && this._onMentionKeydown(e)) return;
    if (e.key === ' ') this._maybeAutoFormatOnSpace(e);
    else if (e.key === 'Enter') this._maybeContinueListOnEnter(e);
  }

  _lineBounds() {
    const ta = this._ta;
    const pos = ta.selectionStart;
    const value = ta.value;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    let lineEnd = value.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = value.length;
    return { lineStart, lineEnd, pos, value };
  }

  _maybeAutoFormatOnSpace(e) {
    const ta = this._ta;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const { lineStart, pos, value } = this._lineBounds();
    const before = value.slice(lineStart, pos);

    if (before === '-') {
      e.preventDefault();
      ta.value = value.slice(0, lineStart) + '• ' + value.slice(pos);
      const newPos = lineStart + 2;
      ta.setSelectionRange(newPos, newPos);
      return;
    }

    const m = before.match(/^(\d+)\.$/);
    if (m) {
      e.preventDefault();
      const prefix = m[1] + '.\t';
      ta.value = value.slice(0, lineStart) + prefix + value.slice(pos);
      const newPos = lineStart + prefix.length;
      ta.setSelectionRange(newPos, newPos);
    }
  }

  _maybeContinueListOnEnter(e) {
    const ta = this._ta;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const { lineStart, lineEnd, pos, value } = this._lineBounds();
    if (pos !== lineEnd) return; // only auto-continue when Enter is pressed at end of line
    const line = value.slice(lineStart, lineEnd);

    const bulletMatch = line.match(/^• (.*)$/);
    if (bulletMatch) {
      e.preventDefault();
      if (bulletMatch[1].trim() === '') {
        ta.value = value.slice(0, lineStart) + value.slice(lineEnd);
        ta.setSelectionRange(lineStart, lineStart);
      } else {
        const insert = '\n• ';
        ta.value = value.slice(0, pos) + insert + value.slice(pos);
        const newPos = pos + insert.length;
        ta.setSelectionRange(newPos, newPos);
      }
      return;
    }

    const numMatch = line.match(/^(\d+)\.\t(.*)$/);
    if (numMatch) {
      e.preventDefault();
      if (numMatch[2].trim() === '') {
        ta.value = value.slice(0, lineStart) + value.slice(lineEnd);
        ta.setSelectionRange(lineStart, lineStart);
      } else {
        const next = parseInt(numMatch[1], 10) + 1;
        const insert = `\n${next}.\t`;
        ta.value = value.slice(0, pos) + insert + value.slice(pos);
        const newPos = pos + insert.length;
        ta.setSelectionRange(newPos, newPos);
      }
    }
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

  /* ── @mention autocomplete ─────────────────────────────────── */
  _mentionOpen() { return this._mentionBox && this._mentionBox.style.display !== 'none'; }

  _activeMentionTrigger() {
    const ta = this._ta;
    if (ta.selectionStart !== ta.selectionEnd) return null;
    const pos  = ta.selectionStart;
    const text = ta.value.slice(0, pos);
    const m = text.match(/(?:^|[\s(])@([a-zA-Z0-9_.\-]*)$/);
    if (!m) return null;
    return { start: pos - m[1].length - 1, query: m[1] };
  }

  _onMentionInput() {
    const trigger = this._activeMentionTrigger();
    clearTimeout(this._mentionTimer);
    if (!trigger) { this._closeMentions(); return; }
    this._mentionStart = trigger.start;
    this._mentionTimer = setTimeout(() => this._searchMentions(trigger.query), CE_MENTION_DEBOUNCE_MS);
  }

  async _searchMentions(query) {
    try {
      const res = await fetch(`/api/users/mention-search?q=${encodeURIComponent(query)}`, { headers: this._authHeaders() });
      if (!res.ok) { this._closeMentions(); return; }
      const users = await res.json();
      // The trigger may have moved/closed while the request was in flight.
      if (!this._activeMentionTrigger()) return;
      this._mentionResults = Array.isArray(users) ? users : [];
      this._mentionActiveIdx = this._mentionResults.length ? 0 : -1;
      this._renderMentions();
    } catch { this._closeMentions(); }
  }

  _mentionName(u) {
    return u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;
  }

  _renderMentions() {
    const box = this._mentionBox;
    if (!this._mentionResults.length) { this._closeMentions(); return; }
    box.innerHTML = this._mentionResults.map((u, i) => {
      const name = this._mentionName(u);
      const initial = (name.charAt(0) || '?').toUpperCase();
      return `<div class="ce-mention-item${i === this._mentionActiveIdx ? ' ce-mention-active' : ''}" data-idx="${i}">
        <div class="ce-mention-avatar">${u.avatar_url ? `<img src="${escHtml(u.avatar_url)}" alt="">` : escHtml(initial)}</div>
        <div class="ce-mention-info">
          <div class="ce-mention-name">${escHtml(name)}</div>
          <div class="ce-mention-uname">@${escHtml(u.username)}</div>
        </div>
      </div>`;
    }).join('');
    this._positionMentions();
    box.style.display = '';
  }

  _positionMentions() {
    const ta = this._ta;
    const rect = ta.getBoundingClientRect();
    const coords = _ceCaretCoords(ta, this._mentionStart);
    const left = rect.left + coords.left - ta.scrollLeft + window.scrollX;
    const top  = rect.top + coords.top - ta.scrollTop + coords.height + window.scrollY;
    this._mentionBox.style.left = Math.max(0, left) + 'px';
    this._mentionBox.style.top  = top + 'px';
  }

  _closeMentions() {
    if (!this._mentionBox) return;
    this._mentionBox.style.display = 'none';
    this._mentionResults = [];
    this._mentionActiveIdx = -1;
    this._mentionStart = -1;
  }

  _onMentionKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._mentionActiveIdx = Math.min(this._mentionActiveIdx + 1, this._mentionResults.length - 1);
      this._renderMentions();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._mentionActiveIdx = Math.max(this._mentionActiveIdx - 1, 0);
      this._renderMentions();
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (this._mentionActiveIdx < 0) return false;
      e.preventDefault();
      this._selectMention(this._mentionResults[this._mentionActiveIdx]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this._closeMentions();
      return true;
    }
    return false;
  }

  _selectMention(user) {
    if (!user) return;
    const ta = this._ta;
    const pos = ta.selectionStart;
    const insert = `@${user.username} `;
    ta.value = ta.value.slice(0, this._mentionStart) + insert + ta.value.slice(pos);
    const newPos = this._mentionStart + insert.length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
    this._closeMentions();
  }

  /* ── Public API (mirrors the old RichEditor's shape) ──────── */
  getValue() { return this._ta.value; }
  setValue(v) { this._ta.value = v || ''; }
}

/* Mirrors `ta`'s text up to `pos` into an offscreen div (matching font,
   padding, border and wrapping) to read back the pixel offset of the
   caret — there is no native API for this on a <textarea>. */
const _CE_MIRROR_PROPS = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'whiteSpace', 'wordWrap', 'wordBreak',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
];

function _ceCaretCoords(ta, pos) {
  const mirror = document.createElement('div');
  const style = getComputedStyle(ta);
  _CE_MIRROR_PROPS.forEach(p => { mirror.style[p] = style[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.height = 'auto';

  const before = document.createElement('span');
  before.textContent = ta.value.slice(0, pos);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const coords = { top: marker.offsetTop, left: marker.offsetLeft, height: marker.offsetHeight || 18 };
  document.body.removeChild(mirror);
  return coords;
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
