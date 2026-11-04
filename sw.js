// Service Worker: alles vorab in den Cache, danach immer zuerst aus dem Cache → komplett offline.
// Die Dateiliste und Version stehen in version.js (von werkzeuge/precache-liste.ps1 geschrieben).
importScripts('version.js');

const CACHE = `spielunterhaltung-${self.SPIEL_VERSION}`;
const LOKAL = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(self.SPIEL_DATEIEN.map((pfad) => new Request(pfad, { cache: 'reload' })))),
  );
  // Kein automatisches skipWaiting: die Seite fragt mit „Neue Version verfügbar“
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen
      .filter((n) => n.startsWith('spielunterhaltung-') && n !== CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET') return;
  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Lokal entwickeln: zuerst das Netz (Änderungen sofort sichtbar), Cache nur wenn offline
    if (LOKAL) {
      try { return await fetch(anfrage); } catch { /* weiter mit Cache */ }
    }
    const treffer = await cache.match(anfrage, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      return await fetch(anfrage);
    } catch {
      // Offline auf einer unbekannten Seite → App-Startseite
      if (anfrage.mode === 'navigate') {
        const seite = await cache.match('./index.html');
        if (seite) return seite;
      }
      return new Response('Offline und nicht im Speicher.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
