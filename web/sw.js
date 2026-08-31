const CACHE_NAME = 'snapdialer-pwa-v1.0.3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install: Pre-cache core shell & assets, activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[PWA Precache] Skipped asset:', asset, err);
        }
      }
    })
  );
});

// Activate: Clear obsolete caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Async/Await Offline-First Engine with Zero-Null Safety
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore non-http/https schemes (like chrome-extension://, tel:, sms:)
  if (!url.protocol.startsWith('http')) return;

  // External APIs (e.g. Gemini AI API) should not be cached
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
    return;
  }

  // 1. Navigation Requests (PWA Launch / Home Screen / Page Reload)
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        // Match cached index.html or root
        const cached = (await caches.match('/index.html')) || 
                       (await caches.match('/')) || 
                       (await caches.match(event.request));

        if (cached) {
          // In background, refresh cache when online
          fetch(event.request)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                const clone = networkRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
              }
            })
            .catch(() => {});
          return cached;
        }

        // Try network if not yet cached
        try {
          const networkRes = await fetch(event.request);
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', clone);
          }
          return networkRes;
        } catch (err) {
          const fallback = (await caches.match('/index.html')) || (await caches.match('/'));
          if (fallback) return fallback;
          return new Response(
            '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><title>SnapDialer</title></head><body style="background:#0E1D13;color:#FCFCFA;font-family:sans-serif;text-align:center;padding:40px;"><h2>SnapDialer Offline</h2><p>Please connect to the internet once to load the app.</p></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            }
          );
        }
      })()
    );
    return;
  }

  // 2. Static Assets (JS Bundles, CSS, Images, Icons, Fonts)
  event.respondWith(
    (async () => {
      // Check cache first (ignore query params/hashes)
      const cached = (await caches.match(event.request, { ignoreSearch: true })) ||
                     (await caches.match(url.pathname, { ignoreSearch: true }));

      if (cached) {
        return cached;
      }

      // Fetch from network if not in cache
      try {
        const networkRes = await fetch(event.request);
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, clone);
        }
        return networkRes;
      } catch (err) {
        // Fallback lookup by pathname
        const pathnameCached = await caches.match(url.pathname, { ignoreSearch: true });
        if (pathnameCached) {
          return pathnameCached;
        }

        // Return a valid response to prevent "Returned response is null"
        return new Response('', { status: 408, statusText: 'Offline Asset Unavailable' });
      }
    })()
  );
});
