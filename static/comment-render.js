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
    const frag  = document.createDocumentFragment();
    const parts = node.textContent.split('\n');
    parts.forEach((part, i) => {
      if (part) frag.appendChild(document.createTextNode(part));
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
