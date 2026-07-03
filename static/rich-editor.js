'use strict';

/* ══════════════════════════════════════════════════════════════
   RichEditor — lightweight contenteditable rich text editor
   Replaces a <textarea> in place; monkey-patches .value so
   existing code works without changes.
   ══════════════════════════════════════════════════════════════ */

class RichEditor {
  constructor(el) {
    this._ta = typeof el === 'string' ? document.querySelector(el) : el;
    if (!this._ta) return;
    this._placeholder = this._ta.getAttribute('placeholder') || '';
    this._minRows     = Math.max(parseInt(this._ta.rows) || 3, 3);
    this._build();
    this._patchTextarea();
  }

  /* ── Build DOM ────────────────────────────────────────── */
  _build() {
    const wrap = document.createElement('div');
    wrap.className = 're-wrap';

    const toolbar = this._buildToolbar();

    const body = document.createElement('div');
    body.className     = 're-body is-empty';
    body.contentEditable = 'true';
    body.spellcheck    = true;
    body.dataset.placeholder = this._placeholder;
    body.style.minHeight = `${this._minRows * 1.65}em`;

    wrap.appendChild(toolbar);
    wrap.appendChild(body);

    this._ta.parentNode.insertBefore(wrap, this._ta);
    this._ta.style.display = 'none';
    this._wrap = wrap;
    this._body = body;

    this._bindEvents();
  }

  /* ── Toolbar ──────────────────────────────────────────── */
  _buildToolbar() {
    const tb = document.createElement('div');
    tb.className = 're-toolbar';

    // Size picker
    const sizeWrap = this._buildSizePicker();

    const sep = () => { const s = document.createElement('div'); s.className = 're-sep'; return s; };

    // Bold / Italic / Underline / Strike
    const fmtGrp = document.createElement('div');
    fmtGrp.className = 're-group';
    this._fmtBtns = {};
    [
      { cmd: 'bold',          html: '<strong>B</strong>', title: 'Bold (Ctrl+B)' },
      { cmd: 'italic',        html: '<em>I</em>',         title: 'Italic (Ctrl+I)' },
      { cmd: 'underline',     html: '<u>U</u>',           title: 'Underline (Ctrl+U)' },
      { cmd: 'strikeThrough', html: '<s>S</s>',           title: 'Strikethrough' },
    ].forEach(({ cmd, html, title }) => {
      const btn = this._mkBtn(html, title);
      btn.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(cmd); this._body.focus(); this._sync(); this._updateState(); });
      fmtGrp.appendChild(btn);
      this._fmtBtns[cmd] = btn;
    });

    // Color picker
    const colorWrap = this._buildColorPicker();

    // List + indent
    const listGrp = document.createElement('div');
    listGrp.className = 're-group';
    [
      { cmd: 'insertUnorderedList', title: 'Bullet list',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>` },
      { cmd: 'insertOrderedList', title: 'Numbered list',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>` },
      { cmd: 'indent', title: 'Indent (Tab)',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 8 17 12 13 16"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>` },
      { cmd: 'outdent', title: 'Outdent (Shift+Tab)',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 8 7 12 11 16"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>` },
    ].forEach(({ cmd, title, svg }) => {
      const btn = this._mkBtn(svg, title);
      btn.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(cmd); this._body.focus(); this._sync(); this._updateState(); });
      listGrp.appendChild(btn);
    });

    // Clear formatting
    const clearGrp = document.createElement('div');
    clearGrp.className = 're-group';
    const clearBtn = this._mkBtn(
      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>`,
      'Clear formatting'
    );
    clearBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, 'p');
      this._body.focus(); this._sync();
    });
    clearGrp.appendChild(clearBtn);

    tb.appendChild(sizeWrap);
    tb.appendChild(sep());
    tb.appendChild(fmtGrp);
    tb.appendChild(sep());
    tb.appendChild(colorWrap);
    tb.appendChild(sep());
    tb.appendChild(listGrp);
    tb.appendChild(sep());
    tb.appendChild(clearGrp);

    return tb;
  }

  _buildSizePicker() {
    const wrap = document.createElement('div');
    wrap.className = 're-size-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 're-size-btn';
    btn.title = 'Text size';
    btn.innerHTML =
      `<span class="re-size-label">Normal</span>` +
      `<svg class="re-caret" xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    this._sizeLabel = btn.querySelector('.re-size-label');

    const menu = document.createElement('div');
    menu.className = 're-dropdown-menu';

    [
      { label: 'Small',   size: '0.8em',  tag: null,  sizeNum: '1' },
      { label: 'Normal',  size: '1em',    tag: 'p',   sizeNum: null },
      { label: 'Large',   size: '1.2em',  tag: 'h3',  sizeNum: null },
      { label: 'Heading', size: '1.45em', tag: 'h2',  sizeNum: null },
    ].forEach(({ label, size, tag, sizeNum }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 're-dropdown-item';
      item.style.fontSize = size;
      item.textContent = label;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        if (sizeNum) {
          document.execCommand('fontSize', false, sizeNum);
        } else if (tag) {
          document.execCommand('formatBlock', false, tag);
        }
        this._sizeLabel.textContent = label;
        menu.classList.remove('open');
        this._body.focus(); this._sync();
      });
      menu.appendChild(item);
    });

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      menu.classList.toggle('open');
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  _buildColorPicker() {
    const wrap = document.createElement('div');
    wrap.className = 're-color-wrap';

    const btn = this._mkBtn('', 'Text color');
    btn.className += ' re-color-btn';
    const indicator = document.createElement('span');
    indicator.className = 're-color-a';
    indicator.textContent = 'A';
    btn.appendChild(indicator);
    this._colorDot = indicator;

    const menu = document.createElement('div');
    menu.className = 're-dropdown-menu re-color-menu';

    const colors = [
      '#EDE5D0', '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
      '#94a3b8', '#dc2626', '#d97706', '#16a34a',
      '#2563eb', '#7c3aed', '#db2777', '#0891b2',
    ];
    colors.forEach(c => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 're-color-swatch';
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('mousedown', e => {
        e.preventDefault();
        document.execCommand('foreColor', false, c);
        this._colorDot.style.textDecoration = `underline 3px ${c}`;
        menu.classList.remove('open');
        this._body.focus(); this._sync();
      });
      menu.appendChild(sw);
    });

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      menu.classList.toggle('open');
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  _mkBtn(html, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 're-btn';
    btn.title = title;
    btn.innerHTML = html;
    return btn;
  }

  /* ── Events ───────────────────────────────────────────── */
  _bindEvents() {
    this._body.addEventListener('input',    () => { this._sync(); this._updateEmpty(); this._updateState(); });
    this._body.addEventListener('focus',    () => this._wrap.classList.add('focused'));
    this._body.addEventListener('blur',     () => this._wrap.classList.remove('focused'));
    this._body.addEventListener('mouseup',  () => this._updateState());
    this._body.addEventListener('keyup',    () => this._updateState());
    this._body.addEventListener('keydown',  e  => this._onKey(e));
    this._body.addEventListener('paste',    e  => this._onPaste(e));

    document.addEventListener('mousedown', e => {
      if (!this._wrap.contains(e.target)) {
        this._wrap.querySelectorAll('.re-dropdown-menu.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  _onKey(e) {
    // Tab / Shift+Tab → indent / outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      this._sync();
      return;
    }

    // Space after `- ` → bullet list; `1. ` → ordered list
    if (e.key === ' ') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const text = node.textContent;
      if (text === '-') {
        e.preventDefault();
        node.textContent = '';
        document.execCommand('insertUnorderedList');
        this._sync(); this._updateState();
      } else if (/^1\.$/.test(text)) {
        e.preventDefault();
        node.textContent = '';
        document.execCommand('insertOrderedList');
        this._sync(); this._updateState();
      }
    }
  }

  _onPaste(e) {
    // Strip rich content from clipboard; paste plain text only
    const text = e.clipboardData?.getData('text/plain');
    if (text !== undefined) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
    }
  }

  /* ── State sync ───────────────────────────────────────── */
  _sync() {
    const h = this._body.innerHTML;
    this._ta.value = (h === '<br>' || h === '') ? '' : h;
  }

  _updateEmpty() {
    this._body.classList.toggle('is-empty', !this._body.textContent.trim());
  }

  _updateState() {
    try {
      Object.entries(this._fmtBtns).forEach(([cmd, btn]) => {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      });
    } catch { /* cross-origin guard */ }
  }

  /* ── Monkey-patch .value on the original <textarea> ──── */
  _patchTextarea() {
    const self = this;
    Object.defineProperty(this._ta, 'value', {
      configurable: true,
      get() { return self.getValue(); },
      set(v) { self.setValue(v); },
    });
  }

  /* ── Public API ───────────────────────────────────────── */
  getValue() {
    const h = this._body.innerHTML;
    if (!h || h === '<br>' || h === '<p></p>' || h === '<p><br></p>') return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = h;
    if (!tmp.textContent.trim()) return '';
    return h;
  }

  setValue(raw) {
    if (!raw) {
      this._body.innerHTML = '';
      this._updateEmpty();
      return;
    }
    // Plain text → wrap in paragraphs; HTML → inject directly
    if (!/<[a-z]/i.test(raw)) {
      this._body.innerHTML = raw
        .split('\n')
        .map(l => l.trim() ? `<p>${_reEsc(l)}</p>` : '<p><br></p>')
        .join('');
    } else {
      this._body.innerHTML = raw;
    }
    this._updateEmpty();
    this._sync();
  }
}

function _reEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Factory helper ─────────────────────────────────────── */
function initRichEditor(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  return new RichEditor(el);
}
