const CACHE_NAME = 'snapdialer-pwa-v1.8.8';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install: Cache core assets and activate immediately
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

// Activate: Purge all stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for Navigation (HTML) & Cache-First for Fingerprinted Assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignore non-http/https schemes (like chrome-extension://, tel:, sms:)
  if (!url.protocol.startsWith('http')) return;

  // External APIs (Gemini AI, Supabase) should NEVER be intercepted
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.io') ||
    url.pathname.includes('version.json')
  ) {
    return;
  }

  // 1. Navigation / HTML Requests -> NETWORK-FIRST with OFFLINE FALLBACK
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          // Attempt network fetch with 2.5 second timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const networkRes = await fetch(event.request, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
            return networkRes;
          }
        } catch (netErr) {
          // Offline, airplane mode, or network failure -> Fall back to cached app shell
        }

        // Return cached shell
        const cached = (await caches.match('/index.html')) || 
                       (await caches.match('/')) || 
                       (await caches.match(event.request));
        if (cached) {
          return cached;
        }

        return new Response(
          '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><title>SnapDialer</title></head><body style="background:#0E1D13;color:#FCFCFA;font-family:sans-serif;text-align:center;padding:40px;"><h2>SnapDialer Offline</h2><p>Please connect to the internet once to load the app.</p></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }
        );
      })()
    );
    return;
  }

  // 2. Static Assets (JS Bundles, CSS, Images, Icons, Fonts)
  // Network-First: JS bundles are content-hashed by Expo so network is always authoritative.
  // Falls back to cache when offline.
  event.respondWith(
    (async () => {
      try {
        const networkRes = await fetch(event.request);
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, clone);
        }
        return networkRes;
      } catch (err) {
        // Network failed (offline) — fall back to cached version
        const cached = (await caches.match(event.request, { ignoreSearch: true })) ||
                       (await caches.match(url.pathname, { ignoreSearch: true }));
        if (cached) {
          return cached;
        }
        return new Response('', { status: 408, statusText: 'Offline Asset Unavailable' });
      }
    })()
  );
});
