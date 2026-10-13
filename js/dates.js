// Dates in local time as ISO day strings (YYYY-MM-DD).
export function dayStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function today() { return dayStr(new Date()); }
export function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
export function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// startDow: 1 = weeks start on Monday, 0 = Sunday (RepLog's weekStart setting).
export function weekStart(s, startDow = 1) {
  const d = parseDay(s);
  d.setDate(d.getDate() - ((d.getDay() - startDow + 7) % 7));
  return dayStr(d);
}

export function fmtDay(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDay(s).toLocaleDateString('en-GB', opts);
}

// A timestamp stored as ms, a numeric string or ISO text, as a local day string.
export function dayOf(ts) {
  const n = Number(ts);
  const d = new Date(Number.isFinite(n) && n > 0 ? n : Date.parse(ts));
  return Number.isNaN(d.getTime()) ? null : dayStr(d);
}

export function ago(ms, now = Date.now()) {
  const m = Math.round((now - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// "Today", "Yesterday" or "3 days ago" between two day strings.
export function relDay(day, ref) {
  const n = daysBetween(day, ref);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}
