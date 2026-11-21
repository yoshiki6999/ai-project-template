// Service worker: offline-first app shell, network-first deck, never caches /api/.
const VERSION = 'nlc-v1';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/util.js', '/js/ruby.js', '/js/fsrs.js', '/js/store.js', '/js/deck.js', '/js/speech.js',
  '/js/api.js', '/js/session.js', '/js/views/home.js', '/js/views/learn.js', '/js/views/detail.js',
  '/js/views/story.js', '/js/views/roleplay.js', '/js/views/scenes.js', '/js/views/library.js', '/js/views/me.js',
  '/data/deck.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/data/deck.json' || e.request.mode === 'navigate') {
    // network-first so content updates arrive; fall back to cache offline
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
    return;
  }
  // stale-while-revalidate for static assets
  e.respondWith(caches.match(e.request).then((cached) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
