// Lifeboard's own state: board preferences, plus a cache of the last rows each source
// returned so the board draws instantly and works offline. Nothing here is synced.
import { PLUGINS } from './plugins/index.js';

const KEY = 'lifeboard.v1';
const CACHE_KEY = 'lifeboard.cache';

const DEFAULTS = () => ({ order: PLUGINS.map((p) => p.id), off: [], theme: 'auto', demo: false });

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full: keep in memory */ }
}

export const prefs = { ...DEFAULTS(), ...(read(KEY) || {}) };
if (!['auto', 'light', 'dark'].includes(prefs.theme)) prefs.theme = 'auto';
if (!Array.isArray(prefs.order)) prefs.order = DEFAULTS().order;
if (!Array.isArray(prefs.off)) prefs.off = [];

export function savePrefs() { write(KEY, prefs); }

// Every known plugin in the user's order. A plugin added in a later version shows up at the end, switched on.
export function orderedPlugins() {
  const known = prefs.order.map((id) => PLUGINS.find((p) => p.id === id)).filter(Boolean);
  return [...new Set([...known, ...PLUGINS])];
}
export const isOn = (p) => !prefs.off.includes(p.id);

let cache = read(CACHE_KEY) || {};
if (typeof cache !== 'object' || Array.isArray(cache)) cache = {};

// undefined = never fetched; { raw: null } = fetched, nothing there.
export const cached = (source) => cache[source];
export function setCached(source, raw) { cache[source] = { raw, at: Date.now() }; write(CACHE_KEY, cache); }
export function clearCache() { cache = {}; try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ } }
