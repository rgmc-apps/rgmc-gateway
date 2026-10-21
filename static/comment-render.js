'use strict';

/* ══════════════════════════════════════════════════════════════
   comment-render.js — shared safe renderer for every comment and
   description field in the app.

   Fields are stored as plain text that may contain literal <img>
   tags (inserted by CommentEditor when a screenshot is pasted or
   attached — GitHub's paste behavior). Older records may still hold
   rich HTML from the previous WYSIWYG editor. Both are handled the
   same way here: parsed and rebuilt through an allowlist, so
   user-typed markup can never inject scripts, styles, or event
   handlers, regardless of which era a record came from.

   Load after linkify.js (uses its escHtml fallback / linkifyHtml).
   ══════════════════════════════════════════════════════════════ */

const _CE_ALLOWED_TAGS = new Set(['IMG', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'H2', 'H3', 'A', 'SPAN', 'DIV']);

function _ceCleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    // Preserve raw newlines as <br> so plain-text content (which has no
    // block-level tags of its own) still wraps the way it was typed.
    // Tabs (from the "1.\t" auto-formatted numbered entries) collapse to a
    // single space under normal HTML whitespace rules, so expand them to
    // non-breaking spaces to keep the tabbed alignment visible.
    const frag  = document.createDocumentFragment();
    const parts = node.textContent.split('\n');
    parts.forEach((part, i) => {
      const segs = part.split('\t');
      segs.forEach((seg, j) => {
        if (seg) frag.appendChild(document.createTextNode(seg));
        if (j < segs.length - 1) frag.appendChild(document.createTextNode('    '));
      });
      if (i < parts.length - 1) frag.appendChild(document.createElement('br'));
    });
    return frag;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');

  const tag = node.tagName;
  if (!_CE_ALLOWED_TAGS.has(tag)) {
    // Unknown/unsafe tag (script, style, iframe, on*-handlers, etc.) —
    // drop the tag itself but keep its (recursively cleaned) content.
    const frag = document.createDocumentFragment();
    Array.from(node.childNodes).forEach(c => frag.appendChild(_ceCleanNode(c)));
    return frag;
  }

  if (tag === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) return document.createTextNode('');
    const img = document.createElement('img');
    img.setAttribute('src', src);
    img.setAttribute('alt', node.getAttribute('alt') || 'image');
    const w = parseInt(node.getAttribute('width'), 10);
    const h = parseInt(node.getAttribute('height'), 10);
    if (w > 0) img.setAttribute('width', String(Math.min(w, 2000)));
    if (h > 0) img.setAttribute('height', String(Math.min(h, 2000)));
    img.setAttribute('loading', 'lazy');
    img.className = 'ce-inline-img';
    return img;
  }

  const el = document.createElement(tag);

  if (tag === 'A') {
    const href = node.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) {
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(c => frag.appendChild(_ceCleanNode(c)));
      return frag;
    }
    el.setAttribute('href', href);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
    el.className = 'auto-link';
  }

  if (tag === 'SPAN') {
    const m = (node.getAttribute('style') || '').match(/color\s*:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
    if (m) el.setAttribute('style', `color:${m[1]}`);
  }

  Array.from(node.childNodes).forEach(c => el.appendChild(_ceCleanNode(c)));
  return el;
}

/* Parse `raw` as HTML and rebuild it using only the allowlisted tags
   above, dropping every attribute except the few we explicitly copy. */
function sanitizeRichText(raw) {
  if (!raw) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  const out = document.createElement('div');
  Array.from(tmp.childNodes).forEach(n => out.appendChild(_ceCleanNode(n)));
  return out.innerHTML;
}

/* Public entry point — safe to call on ANY stored comment/description
   value, old or new. Sanitizes, then auto-links bare URLs. */
function renderCommentPreview(raw) {
  if (!raw || !String(raw).trim()) return '';
  const safe = sanitizeRichText(raw);
  return typeof linkifyHtml === 'function' ? linkifyHtml(safe) : safe;
}

/* ══════════════════════════════════════════════════════════════
   Image lightbox — every page that renders comments/descriptions
   through renderCommentPreview() gets this for free: clicking any
   .ce-inline-img opens it full screen. Self-contained (injects its
   own styles) so it works even on pages that don't load style.css. */
let _ceLightboxEl = null;

function _ceEnsureLightbox() {
  if (_ceLightboxEl) return _ceLightboxEl;

  const style = document.createElement('style');
  style.textContent = `
    .ce-img-lightbox {
      display: none; position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,0.88);
      align-items: center; justify-content: center;
      cursor: zoom-out; padding: 32px;
    }
    .ce-img-lightbox.open { display: flex; }
    .ce-img-lightbox img {
      max-width: 100%; max-height: 100%;
      object-fit: contain; cursor: default;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      touch-action: none;
    }
    .ce-img-lightbox-close {
      position: absolute; top: 16px; right: 20px;
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.12); color: #fff;
      font-size: 24px; line-height: 1; cursor: pointer;
    }
    .ce-img-lightbox-close:hover { background: rgba(255,255,255,0.22); }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'ce-img-lightbox';
  overlay.innerHTML = `
    <button type="button" class="ce-img-lightbox-close" aria-label="Close">&times;</button>
    <img src="" alt="">
  `;
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.ce-img-lightbox-close')) closeImageLightbox();
  });
  document.body.appendChild(overlay);

  const img = overlay.querySelector('img');
  img.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      _ceLbPinching = true;
      _ceLbStartDist = _ceLbTouchDist(e.touches);
      _ceLbStartScale = _ceLbScale;
      e.preventDefault();
    } else if (e.touches.length === 1 && _ceLbScale > 1) {
      _ceLbPanning = true;
      _ceLbPanStartX = e.touches[0].clientX - _ceLbTx;
      _ceLbPanStartY = e.touches[0].clientY - _ceLbTy;
    }
  }, { passive: false });
  img.addEventListener('touchmove', e => {
    if (_ceLbPinching && e.touches.length === 2) {
      const dist = _ceLbTouchDist(e.touches);
      _ceLbScale = Math.min(4, Math.max(1, _ceLbStartScale * (dist / _ceLbStartDist)));
      _ceLbApplyTransform(img);
      e.preventDefault();
    } else if (_ceLbPanning && e.touches.length === 1) {
      _ceLbTx = e.touches[0].clientX - _ceLbPanStartX;
      _ceLbTy = e.touches[0].clientY - _ceLbPanStartY;
      _ceLbApplyTransform(img);
      e.preventDefault();
    }
  }, { passive: false });
  img.addEventListener('touchend', e => {
    if (e.touches.length < 2) _ceLbPinching = false;
    if (e.touches.length === 0) {
      _ceLbPanning = false;
      if (_ceLbScale <= 1) _ceLbResetZoom(img);
    }
  });
  img.addEventListener('touchcancel', () => _ceLbResetZoom(img));

  _ceLightboxEl = overlay;
  return overlay;
}

/* Pinch-to-zoom / drag-to-pan state for the lightbox image (mobile touch only) */
let _ceLbScale = 1, _ceLbTx = 0, _ceLbTy = 0;
let _ceLbPinching = false, _ceLbPanning = false;
let _ceLbStartDist = 0, _ceLbStartScale = 1;
let _ceLbPanStartX = 0, _ceLbPanStartY = 0;

function _ceLbTouchDist(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function _ceLbApplyTransform(img) {
  img.style.transform = `translate(${_ceLbTx}px, ${_ceLbTy}px) scale(${_ceLbScale})`;
}

function _ceLbResetZoom(img) {
  _ceLbScale = 1; _ceLbTx = 0; _ceLbTy = 0;
  _ceLbPinching = false; _ceLbPanning = false;
  if (img) img.style.transform = '';
}

function openImageLightbox(src, alt) {
  if (!src) return;
  const overlay = _ceEnsureLightbox();
  const img = overlay.querySelector('img');
  _ceLbResetZoom(img);
  img.src = src;
  img.alt = alt || 'image';
  overlay.classList.add('open');
}

function closeImageLightbox() {
  if (!_ceLightboxEl) return;
  _ceLightboxEl.classList.remove('open');
  const img = _ceLightboxEl.querySelector('img');
  img.src = '';
  _ceLbResetZoom(img);
}

document.addEventListener('click', e => {
  const img = e.target.closest('.ce-inline-img');
  if (img) openImageLightbox(img.getAttribute('src'), img.getAttribute('alt'));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _ceLightboxEl && _ceLightboxEl.classList.contains('open')) closeImageLightbox();
});
