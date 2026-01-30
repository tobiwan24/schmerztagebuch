// Service Worker für Schmerztagebuch PWA
// Vollständig Offline-First mit manuellem Update

const VERSION = '1.0.0';
const CACHE_NAME = `schmerztagebuch-v${VERSION}`;
const RUNTIME_CACHE = `schmerztagebuch-runtime-v${VERSION}`;

// Install Event - Aggressive Pre-Caching
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v' + VERSION);
  
  // Übernimmt sofort die Kontrolle
  event.waitUntil(self.skipWaiting());
});

// Activate Event - Cleanup alte Caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v' + VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('schmerztagebuch-') && cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Cache First (vollständig offline)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // CACHE FIRST Strategie - App funktioniert vollständig offline
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Nicht im Cache - vom Netzwerk holen
        console.log('[SW] Fetching from network:', url.pathname);
        return fetch(request)
          .then((response) => {
            // Nur erfolgreiche Responses cachen
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone response
            const responseToCache = response.clone();

            // Cache in Runtime-Cache
            caches.open(RUNTIME_CACHE).then((cache) => {
              console.log('[SW] Caching new resource:', url.pathname);
              cache.put(request, responseToCache);
            });

            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            
            // Fallback für Navigation
            if (request.mode === 'navigate') {
              return caches.match('/index.html').then((fallback) => {
                return fallback || new Response('Offline - Bitte App neu laden', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' }
                });
              });
            }

            throw error;
          });
      })
  );
});

// Message Event - Update-Handling
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting - activating immediately');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Client kann Update-Check triggern
    event.waitUntil(
      self.registration.update().then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ 
            type: 'UPDATE_CHECKED',
            hasUpdate: self.registration.waiting !== null
          });
        }
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('schmerztagebuch-')) {
              return caches.delete(cacheName);
            }
          })
        );
      }).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ 
        version: VERSION 
      });
    }
  }
});

// Background Sync (optional - wenn unterstützt)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Hier könnte man Daten synchronisieren
      Promise.resolve()
    );
  }
});
