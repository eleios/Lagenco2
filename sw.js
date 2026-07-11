/* ═══════════════════════════════════════════════════════
   LAGENCO PWA — Service Worker (v1.0)
   • Cache-first voor statische assets (HTML/CSS/JS/icons)
   • Network-first voor Firebase API calls (altijd vers)
   • Offline fallback-pagina wanneer de gebruiker offline is
   ═══════════════════════════════════════════════════════ */
'use strict';

const SW_VERSION = 'v1.0';
const STATIC_CACHE = 'lagenco-static-' + SW_VERSION;
const RUNTIME_CACHE = 'lagenco-runtime-' + SW_VERSION;

// Statische assets die altijd gecached worden (app-shell)
const STATIC_ASSETS = [
  'login.html',
  'business-panel.html',
  'business-panel.css',
  'business-panel.js',
  'business-panel-data.js',
  'bp-report.js',
  'login.js',
  'github-db.js',
  'admin-button.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-192-maskable.png',
  'icon-512-maskable.png',
  'favicon.svg',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  // Homepage (voor "Naar website" link)
  'index.html',
  'style.css',
  'script.js',
  // Juridische pagina's
  'privacybeleid.html',
  'cookiebeleid.html',
  'algemene-voorwaarden.html',
  'retourbeleid.html',
  'disclaimer.html',
  // Offline fallback
  'offline.html'
];

// Install: cache de statische assets
self.addEventListener('install', function (event) {
  console.log('[SW] Install ' + SW_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      // Gebruik addAll met fallback — sommige bestanden misschien niet aanwezig
      return Promise.allSettled(
        STATIC_ASSETS.map(function (url) {
          return cache.add(url).catch(function (e) {
            console.warn('[SW] Kon niet cachen:', url, e.message);
          });
        })
      );
    }).then(function () {
      console.log('[SW] Install voltooid');
      return self.skipWaiting();
    })
  );
});

// Activate: verwijder oude caches
self.addEventListener('activate', function (event) {
  console.log('[SW] Activate ' + SW_VERSION);
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== STATIC_CACHE && key !== RUNTIME_CACHE;
        }).map(function (key) {
          console.log('[SW] Verwijder oude cache:', key);
          return caches.delete(key);
        })
      );
    }).then(function () {
      console.log('[SW] Activate voltooid');
      return self.clients.claim();
    })
  );
});

// Fetch-strategie:
// 1. Firebase / Google API → network-only (altijd vers)
// 2. Navigatie (HTML) → network-first, fallback naar cache, fallback naar offline.html
// 3. Statische assets → cache-first, fallback naar network
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  // Skip Firebase / Google API (altijd network)
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // Skip cross-origin requests (CDN fonts/icons) — laat browser het oplossen
  // maar we proberen ze wel te cachen via runtime-cache
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (resp) {
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(RUNTIME_CACHE).then(function (cache) {
              cache.put(req, respClone).catch(function () {});
            });
          }
          return resp;
        }).catch(function () { return cached; });
      })
    );
    return;
  }

  // Navigatie requests (HTML-pagina's)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (resp) {
        // Cache de verse versie
        const respClone = resp.clone();
        caches.open(RUNTIME_CACHE).then(function (cache) {
          cache.put(req, respClone).catch(function () {});
        });
        return resp;
      }).catch(function () {
        // Offline: probeer cache, anders offline.html
        return caches.match(req).then(function (cached) {
          return cached || caches.match('offline.html');
        });
      })
    );
    return;
  }

  // Statische assets: cache-first
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        // Background update
        fetch(req).then(function (resp) {
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(STATIC_CACHE).then(function (cache) {
              cache.put(req, respClone).catch(function () {});
            });
          }
        }).catch(function () {});
        return cached;
      }
      // Niet in cache: haal op en cache
      return fetch(req).then(function (resp) {
        if (!resp || resp.status !== 200) return resp;
        const respClone = resp.clone();
        caches.open(STATIC_CACHE).then(function (cache) {
          cache.put(req, respClone).catch(function () {});
        });
        return resp;
      }).catch(function () {
        // Laatste redmiddo: geen fallback
        return new Response('Offline en niet in cache', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Message-handler: stel de SW in staat om updates te ontvangen
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
