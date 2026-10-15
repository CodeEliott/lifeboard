// Files pinned on the board: photos, wallpapers and uploaded fonts.
// Kept in this browser (IndexedDB, so the board works offline) and, when signed in, in the
// private `lifeboard` Storage bucket under "<user id>/<file id>.<ext>" so other devices get them.
import * as Cloud from '../cloud.js';
import { loadUploadedFont } from './theme.js';
import { newId, EXTS } from './model.js';

const BUCKET = 'lifeboard';
const MAX_FONT = 3 * 1024 * 1024;

let dbp = null;
function db() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('lifeboard-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}
const getLocal = (id) => tx('readonly', (s) => s.get(id)).catch(() => undefined);
const putLocal = (id, blob) => tx('readwrite', (s) => s.put(blob, id)).catch(() => {});
const delLocal = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});

const urls = new Map(); // image id -> object URL
const ready = new Set(); // ids usable on this device (image URL made or font loaded)
export const urlOf = (id) => urls.get(id) || '';
export const isReady = (id) => ready.has(id);

async function use(id, a, blob) {
  if (a.kind === 'image') { if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob)); }
  else await loadUploadedFont(id, blob);
  ready.add(id);
}

const remotePath = (id, a) => `${Cloud.account.id}/${id}.${a.ext}`;

// Make every file the board uses available here, downloading the missing ones.
// Resolves true when something new became usable (the caller redraws).
let ensuring = null;
export function ensure(board) {
  ensuring ||= (async () => {
    let fresh = false;
    for (const [id, a] of Object.entries(board.assets)) {
      if (ready.has(id)) continue;
      try {
        let blob = await getLocal(id);
        if (!blob && Cloud.account && a.up) {
          const c = await Cloud.client();
          const { data, error } = await c.storage.from(BUCKET).download(remotePath(id, a));
          if (!error && data) { blob = data; await putLocal(id, blob); }
        }
        if (blob) { await use(id, a, blob); fresh = true; }
      } catch (err) { console.warn('File not available:', id, err.message); }
    }
    return fresh;
  })().finally(() => { ensuring = null; });
  return ensuring;
}

// Send files that only exist on this device. Marks them `up`; returns true if any was sent.
export async function uploadPending(board) {
  if (!Cloud.account) return false;
  let sent = false;
  for (const [id, a] of Object.entries(board.assets)) {
    if (a.up) continue;
    const blob = await getLocal(id);
    if (!blob) continue;
    const c = await Cloud.client();
    const { error } = await c.storage.from(BUCKET).upload(remotePath(id, a), blob, { upsert: true, contentType: a.mime });
    if (error) throw error;
    a.up = true; sent = true;
  }
  return sent;
}

export async function forget(id, a) {
  await delLocal(id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  ready.delete(id);
  if (Cloud.account && a?.up) {
    try { const c = await Cloud.client(); await c.storage.from(BUCKET).remove([remotePath(id, a)]); } catch { /* offline: the file stays, unused */ }
  }
}

// Photos are shrunk before saving: 1600 px on the long side (2400 for wallpapers).
// PNG and GIF stay PNG to keep transparency; everything else becomes JPEG.
export async function addImage(file, maxSide = 1600) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)); const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const png = file.type === 'image/png' || file.type === 'image/gif';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.86));
  if (!blob) throw new Error('Could not read that image.');
  const id = newId();
  const ext = png ? 'png' : 'jpg';
  const asset = { kind: 'image', ext, mime: EXTS[ext], w, h, up: false };
  await putLocal(id, blob);
  await use(id, asset, blob);
  return { id, asset };
}

export async function addFont(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) throw new Error('Use a .woff2, .woff, .ttf or .otf font file.');
  if (file.size > MAX_FONT) throw new Error('That font file is over 3 MB.');
  const id = newId();
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40) || 'My font';
  const asset = { kind: 'font', ext, mime: EXTS[ext], name, up: false };
  try { await use(id, asset, file); } catch { throw new Error('That file could not be read as a font.'); }
  await putLocal(id, file);
  return { id, asset };
}
