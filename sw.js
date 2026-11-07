// Bump VERSION when deploying changes so clients refresh the cache.
const VERSION = 'v2';
const CACHE = 'owl-math-' + VERSION;
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

const MUSIC = [1, 2, 3, 4, 5].map(n => 'music/song' + n + '.mp3');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    c.addAll(CORE).then(() => c.addAll(MUSIC).catch(() => {})) // music is best-effort
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  // Audio uses Range requests: answer them from the cached full file.
  if (req.headers.has('range')) {
    e.respondWith(caches.match(req.url).then(async hit => {
      if (!hit) return fetch(req);
      const buf = await hit.arrayBuffer();
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range'));
      const start = m[1] ? +m[1] : 0;
      const end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
      return new Response(buf.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
        'Content-Length': end - start + 1 } });
    }));
    return;
  }
  if (req.mode === 'navigate') {
    // network-first so updates arrive, fall back to cache offline
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return r;
    }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
