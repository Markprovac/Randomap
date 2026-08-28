const CACHE = 'rando-radar-v1.10.31';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=1.10.31',
  './app.js?v=1.10.31',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

const EXTERNAL_SHELL = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async url => {
      const req = new Request(url, { cache: 'reload' });
      const resp = await fetch(req);
      if (resp.ok) await cache.put(req, resp.clone());
    }));
    // Leaflet est indispensable pour démarrer l'application sans réseau.
    // unpkg autorise CORS : on le place dans le cache lors de l'installation.
    await Promise.all(EXTERNAL_SHELL.map(async url => {
      try {
        const req = new Request(url, { mode: 'cors', cache: 'reload' });
        const resp = await fetch(req);
        if (resp.ok) await cache.put(req, resp.clone());
      } catch (_) {}
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

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) await cache.put(req, resp.clone());
    return resp;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Leaflet : cache d'abord pour permettre le démarrage complet hors ligne.
  if (url.origin === 'https://unpkg.com' && (/leaflet@1\.9\.4\/dist\/leaflet\.(?:js|css)$/.test(url.pathname) || /leaflet-rotate@0\.2\.3\/dist\/leaflet-rotate\.umd\.min\.js$/.test(url.pathname))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isCore = req.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname);
  if (isCore) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(resp => {
    if (resp && resp.ok) {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return resp;
  })));
});
