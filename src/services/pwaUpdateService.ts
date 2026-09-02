import { APP_VERSION, APP_EDITION } from '../constants/version';

export interface PwaUpdateInfo {
  appVersion: string;
  serverVersion?: string;
  activeCacheName?: string;
  hasUpdate: boolean;
  edition: string;
}

export class PwaUpdateService {
  /**
   * Queries the live server for the latest deployed version and inspects local caches
   */
  static async checkUpdateStatus(): Promise<PwaUpdateInfo> {
    let serverVersion: string | undefined;
    let activeCacheName: string | undefined;

    if (typeof window !== 'undefined') {
      // 1. Inspect client active cache keys
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          activeCacheName = keys.find((k) => k.startsWith('snapdialer-pwa-')) || keys[0];
        } catch {}
      }

      // 2. Fetch server version metadata
      try {
        const res = await fetch('/version.json?t=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (res.ok) {
          const data = await res.json();
          serverVersion = data.version;
        }
      } catch {}
    }

    const hasUpdate = Boolean(serverVersion && serverVersion !== APP_VERSION);

    return {
      appVersion: APP_VERSION,
      serverVersion,
      activeCacheName,
      hasUpdate,
      edition: APP_EDITION,
    };
  }

  /**
   * Force unregisters ServiceWorkers, purges all offline caches, and reloads with cache-busting
   */
  static async forceUpdateAndReload(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Delete all CacheStorage buckets
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (err) {
        console.warn('[PWA] Cache purge note:', err);
      }
    }

    // 2. Unregister all existing ServiceWorkers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch (err) {
        console.warn('[PWA] ServiceWorker unregister note:', err);
      }
    }

    // 3. Clear session cache and reload with unique cache-buster URL parameter
    const targetUrl = window.location.origin + window.location.pathname + '?pwa_update=' + Date.now();
    window.location.replace(targetUrl);
  }
}
