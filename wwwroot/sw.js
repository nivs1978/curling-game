const CACHE_NAME = 'curling-game-v1';
const DEV_BYPASS =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '::1';
const DEV_QUERY_FLAG = 'nocache=1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './icon.png',
  './css/style.css',
  './js/main.js',
  './js/physics.js',
  './js/stone.js',
  './manifest.webmanifest',
  './img/golden_brush_stick_cup.png',
  './img/ice_sports_center.png',
  './img/curl_up_and_dye.png',
  './img/stones_realestate.png',
  './img/center_delivery.png',
  './img/sweep_and_clean.png'
];

self.addEventListener('install', (event) => {
  if (DEV_BYPASS) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
      	  if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (DEV_BYPASS || requestUrl.search.includes(DEV_QUERY_FLAG)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        const clonedResponse = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clonedResponse);
        });
        return response;
      });
    }).catch(() => caches.match('./'))
  );
});
