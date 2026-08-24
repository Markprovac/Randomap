const CACHE = 'rando-radar-v1.6.1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=1.6.1',
  './app.js?v=1.6.1',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Force réellement le réseau lors de l'installation d'une nouvelle version.
    await Promise.all(APP_SHELL.map(async url => {
      const req = new Request(url, { cache: 'reload' });
      const resp = await fetch(req);
      if (resp.ok) await cache.put(req, resp.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(new Request(req, { cache: 'no-store' }));
    if (fresh && fresh.ok) await cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    return (await cache.match(req)) || (await cache.match('./index.html'));
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML, JS et CSS : réseau d'abord. Cela évite qu'une nouvelle version
  // continue d'exécuter l'ancien JavaScript de la PWA.
  const isCore = req.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname);
  if (isCore) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Ressources stables : cache d'abord avec repli réseau.
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(resp => {
    if (resp && resp.ok) {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return resp;
  })));
});
