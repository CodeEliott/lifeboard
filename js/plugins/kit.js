// Small helpers shared by plugins. Plugins get raw rows written by other apps,
// so every reader assumes fields can be missing or the wrong type.
export const list = (a) => (Array.isArray(a) ? a : []);
export const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
export const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// 7h05 style duration from minutes.
export function fmtDur(min) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

// A result with nothing to show but a hint (not connected, nothing logged yet).
export function emptyResult(hint, updatedAt = null) {
  return { empty: true, hint, updatedAt, tiles: [], today: [], days: {} };
}
