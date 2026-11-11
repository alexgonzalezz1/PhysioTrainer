// Service worker: permite usar la app sin conexión.
// Estrategia "red primero": si hay conexión siempre se sirve la última versión;
// si no, se usa la copia guardada.
const CACHE = 'cuaderno-fallos-v1';
const SHELL = [
  './', 'index.html', 'css/styles.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/md.js', 'js/parse.js', 'js/ai.js', 'js/demo.js',
  'vendor/anthropic-sdk.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // p. ej. la API de Anthropic
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
