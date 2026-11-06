/**
 * Service worker: guarda os arquivos do app em cache para funcionar offline.
 * Estratégia: "cache primeiro" para os arquivos do app, atualizando em segundo plano.
 * Ao publicar uma nova versão, aumente CACHE_VERSION.
 */
const CACHE_VERSION = 'estudos-v2';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  'js/app.js', 'js/sample.js',
  'js/core/db.js', 'js/core/dates.js', 'js/core/events.js', 'js/core/planner.js', 'js/core/srs.js',
  'js/core/markdown.js', 'js/core/cardgen.js', 'js/core/importers.js', 'js/core/ai.js', 'js/core/stats.js',
  'js/ui/dom.js', 'js/ui/icons.js', 'js/ui/common.js', 'js/ui/highlights.js',
  'js/views/dashboard.js', 'js/views/calendar.js', 'js/views/subjects.js', 'js/views/more.js', 'js/views/settings.js',
  'js/views/library.js', 'js/views/reader.js', 'js/views/flashcards.js', 'js/views/study.js',
  'js/views/pomodoro.js', 'js/views/stats.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ex.: api.anthropic.com — sempre rede
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached || caches.match('index.html'));
      return cached || network;
    }),
  );
});
