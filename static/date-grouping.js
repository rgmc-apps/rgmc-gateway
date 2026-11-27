'use strict';

/* ── Shared date-grouping helper ──────────────────────────────────────────
   Used by admin.js, issues_page.js, script.js, user.js and developer.js to
   group issue/dev-item lists by Year/Quarter, Year/Month or Year/Week. */

function _dgIsoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fdDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdDayNum + 3);
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return { isoYear: date.getUTCFullYear(), week };
}

function dgGroupKey(dateStr, period) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  if (period === 'month') {
    return { key: `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }
  if (period === 'week') {
    const { isoYear, week } = _dgIsoWeek(d);
    return { key: `${isoYear}-W${String(week).padStart(2, '0')}`, label: `Week ${week}, ${isoYear}` };
  }
  return null;
}

/* Groups items by the given period using dateField, newest group/item first.
   Items with no usable date land in a trailing "No date" group.
   Returns null when period is falsy/'none' so callers can fall back to normal rendering. */
function dgGroupItems(items, period, dateField) {
  if (!period || period === 'none') return null;
  const dated   = items.filter(i => dgGroupKey(i[dateField], period));
  const undated = items.filter(i => !dgGroupKey(i[dateField], period));
  dated.sort((a, b) => new Date(b[dateField]) - new Date(a[dateField]));

  const groups = [];
  const byKey  = new Map();
  for (const item of dated) {
    const g = dgGroupKey(item[dateField], period);
    let bucket = byKey.get(g.key);
    if (!bucket) {
      bucket = { key: g.key, label: g.label, items: [] };
      byKey.set(g.key, bucket);
      groups.push(bucket);
    }
    bucket.items.push(item);
  }
  if (undated.length) groups.push({ key: '__none__', label: 'No date', items: undated });
  return groups;
}

function dgGroupHeaderRowHtml(colspan, label, count) {
  return `<tr class="dg-group-row"><td colspan="${colspan}" class="dg-group-cell">
    <span class="dg-group-label">${label}</span><span class="dg-group-count">${count} item${count !== 1 ? 's' : ''}</span>
  </td></tr>`;
}

function dgGroupHeaderDivHtml(label, count) {
  return `<div class="dg-group-header"><span class="dg-group-label">${label}</span><span class="dg-group-count">${count} item${count !== 1 ? 's' : ''}</span></div>`;
}
