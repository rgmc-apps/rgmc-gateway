'use strict';

/**
 * Appends an "Others, please specify…" option to a department <select> and
 * wires up the companion text input visibility.
 *
 * @param {string} selectId   – ID of the <select> element
 * @param {string} inputId    – ID of the companion <input type="text"> element
 * @param {string} wrapperId  – ID of the wrapper div around the text input
 */
function deptOtherInit(selectId, inputId, wrapperId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  const opt = document.createElement('option');
  opt.value = '__other__';
  opt.textContent = 'Others, please specify…';
  sel.appendChild(opt);

  sel.addEventListener('change', () => {
    const wrap = document.getElementById(wrapperId);
    if (!wrap) return;
    const show = sel.value === '__other__';
    wrap.style.display = show ? 'block' : 'none';
    const inp = document.getElementById(inputId);
    if (inp) {
      inp.required = show;
      if (show) inp.focus();
      else inp.value = '';
    }
  });
}

/**
 * Resolves the final department name to submit:
 * – If "__other__" is selected, POSTs to /api/departments to save the new entry
 *   and returns the saved department_name.
 * – Otherwise returns the current select value (may be empty string).
 *
 * Never throws — falls back to the typed name if the API fails.
 *
 * @param {string} selectId  – ID of the <select>
 * @param {string} inputId   – ID of the companion text <input>
 * @returns {Promise<string>}
 */
async function deptOtherResolve(selectId, inputId) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.value !== '__other__') return sel ? sel.value : '';

  const inp  = document.getElementById(inputId);
  const name = (inp ? inp.value : '').trim();
  if (!name) return '';

  try {
    const res  = await fetch('/api/departments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ department_name: name }),
    });
    const data = await res.json();
    return data.department_name || name;
  } catch {
    return name;
  }
}
