// Network-first for the app's own files, cache fallback so the board opens offline.
// Data never goes through here: Supabase is another origin and is left alone.
// Bump CACHE whenever a shipped file changes, and keep SHELL in step with index.html.
const CACHE = 'lifeboard-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/dates.js', 'js/store.js', 'js/cloud.js', 'js/sources.js', 'js/demo.js',
  'js/plugins/index.js', 'js/plugins/kit.js', 'js/plugins/replog.js', 'js/plugins/sleep.js', 'js/plugins/appearance-lab.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
