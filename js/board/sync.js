// The board document: saved in this browser and synced to `lifeboard_data`, Lifeboard's own
// table (supabase/lifeboard-data.sql). Newest save wins, like RepLog. This and assets.js are the
// only code that writes anywhere; plugins stay read-only towards other apps.
import * as Cloud from '../cloud.js';
import { sanitizeBoard, defaultBoard, addNewPlugins } from './model.js';
import { uploadPending } from './assets.js';

const KEY = 'lifeboard.board';
const MISSING_TABLE = new Set(['PGRST205', '42P01']);

// What the settings sheet shows: 'local' (not signed in), 'saving', 'synced', 'missing' (SQL not run), 'error'.
export const syncState = { status: 'local', at: null, error: null };

function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
export function storeLocal(board) {
  try { localStorage.setItem(KEY, JSON.stringify(board)); } catch { /* full or private mode: keep in memory */ }
}

// First run: build the board from v1 preferences (plugin order, switched-off plugins, theme mode).
export function loadBoard(prefs = {}) {
  const raw = read();
  const board = raw ? sanitizeBoard(raw) : defaultBoard({ off: prefs.off, order: prefs.order, mode: prefs.theme });
  addNewPlugins(board);
  return board;
}

let timer = null;
let getBoard = null;
export function schedulePush(get) {
  getBoard = get;
  if (!Cloud.account || syncState.status === 'missing') return;
  syncState.status = 'saving';
  clearTimeout(timer);
  timer = setTimeout(push, 1500);
}

async function push() {
  clearTimeout(timer); timer = null;
  const board = getBoard?.();
  if (!board || !Cloud.account) return;
  try {
    if (await uploadPending(board)) storeLocal(board); // files first, so the row never points at missing files
    const c = await Cloud.client();
    const { error } = await c.from('lifeboard_data').upsert({ user_id: Cloud.account.id, board, updated_at: new Date(board.updatedAt || Date.now()).toISOString() });
    if (error) throw error;
    Object.assign(syncState, { status: 'synced', at: Date.now(), error: null });
  } catch (err) {
    Object.assign(syncState, { status: MISSING_TABLE.has(err.code) ? 'missing' : 'error', error: err.message });
  }
}
export function flush() { if (timer) push(); }

// Fetch the account's board. Returns it when it is newer than `local` (the caller switches to it);
// otherwise sends `local` up so other devices get it.
export async function pull(local, get) {
  getBoard = get;
  if (!Cloud.account) { syncState.status = 'local'; return null; }
  try {
    const c = await Cloud.client();
    const { data, error } = await c.from('lifeboard_data').select('board, updated_at').eq('user_id', Cloud.account.id).maybeSingle();
    if (error) throw error;
    const remote = data ? sanitizeBoard(data.board) : null;
    if (remote && remote.updatedAt > local.updatedAt) {
      addNewPlugins(remote);
      storeLocal(remote);
      Object.assign(syncState, { status: 'synced', at: Date.now(), error: null });
      return remote;
    }
    if (!remote || local.updatedAt > remote.updatedAt) await push();
    else Object.assign(syncState, { status: 'synced', at: Date.now(), error: null });
    return null;
  } catch (err) {
    Object.assign(syncState, { status: MISSING_TABLE.has(err.code) ? 'missing' : 'error', error: err.message });
    return null;
  }
}

export function forgetLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
