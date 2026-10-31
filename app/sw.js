// Offline-Modus: Beim Installieren landen alle App-Dateien (Liste in precache.json) im Cache,
// danach kommt alles aus dem Cache. Jede neue Version (VERSION setzt das Veröffentlichen) lädt den Cache neu.
const VERSION = 'dev';
const CACHE = `schachtrainer-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const files = await fetch('precache.json', { cache: 'no-store' }).then(r => r.json());
    const cache = await caches.open(CACHE);
    await cache.addAll(files.map(f => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Supabase usw. direkt ins Netz
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? './index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && req.mode !== 'navigate') cache.put(req, res.clone());
    return res;
  })());
});
