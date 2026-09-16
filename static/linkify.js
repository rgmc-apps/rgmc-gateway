'use strict';

/* Shared URL auto-linking utility, used wherever a description/comment/notes
   field is rendered so plain-text or rich-editor URLs become clickable links.
   Safe to load on any page regardless of script order — falls back to its
   own escaper if the page hasn't defined a global escHtml yet. */
if (typeof escHtml === 'undefined') {
  window.escHtml = function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
}

const _LINKIFY_URL_RE = /((?:https?:\/\/|www\.)[^\s<>"'“”]+)/gi;

function _linkifyWalk(node) {
  if (node.nodeType === 1) {
    const tag = node.tagName;
    if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE') return;
    Array.from(node.childNodes).forEach(_linkifyWalk);
    return;
  }
  if (node.nodeType !== 3) return; // text nodes only

  const text = node.nodeValue;
  _LINKIFY_URL_RE.lastIndex = 0;
  if (!_LINKIFY_URL_RE.test(text)) return;
  _LINKIFY_URL_RE.lastIndex = 0;

  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  let match;
  while ((match = _LINKIFY_URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    let url   = match[0];
    let trail = '';
    while (url.length && /[.,;:!?)\]]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    if (url) {
      const a = document.createElement('a');
      a.href        = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      a.target      = '_blank';
      a.rel         = 'noopener noreferrer';
      a.className   = 'auto-link';
      a.textContent = url;
      frag.appendChild(a);
    } else {
      frag.appendChild(document.createTextNode(match[0]));
    }
    if (trail) frag.appendChild(document.createTextNode(trail));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.parentNode.replaceChild(frag, node);
}

/* Wrap bare URLs found in trusted HTML with clickable <a> tags, without
   disturbing existing markup or double-linking content already inside an <a>.
   Use for rich-editor output (descriptions, resolution notes, etc.) and for
   plain text that has already been through escHtml(). */
function linkifyHtml(html) {
  if (!html) return html || '';
  const container = document.createElement('div');
  container.innerHTML = html;
  Array.from(container.childNodes).forEach(_linkifyWalk);
  return container.innerHTML;
}

/* Escape plain text, then linkify URLs. Use for fields that are NOT already
   HTML — e.g. plain-text comments typed into a simple <textarea>. */
function linkifyText(text) {
  return linkifyHtml(escHtml(text));
}
