const CACHE_NAME = 'snapdialer-pwa-v1.0.1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png'
];

// Install Event: Pre-cache core shell & assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-caching asset note:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event: Clear obsolete caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Cache-First for static assets, Stale-While-Revalidate for navigation
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore non-http/https schemes (like chrome-extension://, tel:, sms:)
  if (!url.protocol.startsWith('http')) return;

  // External APIs (e.g. Gemini AI API) should not be cached by Service Worker
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
    return;
  }

  // Navigation requests (HTML Pages) -> Stale-While-Revalidate with immediate Cache Fallback
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match('/index.html').then((cachedHtml) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put('/index.html', responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedHtml);

        // If we have cached HTML, return it immediately for instant sub-second boot
        return cachedHtml || fetchPromise;
      })
    );
    return;
  }

  // Static Assets (JS bundles, CSS, images, icons, fonts) -> Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return from cache immediately, optionally revalidate in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // If not in cache, fetch from network and save into cache
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is for a script or page, fallback to cached index.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
    })
  );
});
