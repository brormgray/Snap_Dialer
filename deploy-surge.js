const { Agent, setGlobalDispatcher } = require('undici');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

// Undici dispatcher for fetch
const agent = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      if (hostname === 'surge.surge.sh') {
        return callback(null, [{ address: '192.241.214.148', family: 4 }]);
      }
      return callback(null, [{ address: '138.197.235.123', family: 4 }]);
    }
  }
});
setGlobalDispatcher(agent);

// Patch DNS for socket connections handling both single and array formats
const origLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname === 'surge.surge.sh' || hostname === 'surge.sh' || hostname.endsWith('.surge.sh') || hostname.endsWith('.surge.io')) {
    const ip = (hostname === 'surge.surge.sh') ? '192.241.214.148' : '138.197.235.123';
    if (options && options.all) {
      return callback(null, [{ address: ip, family: 4 }]);
    }
    return callback(null, ip, 4);
  }
  return origLookup(hostname, options, callback);
};

// Helper: Recursively find all files in directory
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

// Prepare dist for iOS Safari & Android PWA Offline Caching
try {
  const distDir = path.join(__dirname, 'dist');
  const webDir = path.join(__dirname, 'web');
  const swSrc = path.join(webDir, 'sw.js');
  const swDest = path.join(distDir, 'sw.js');

  if (fs.existsSync(distDir)) {
    // 1. Copy manifest.json to dist
    const manifestSrc = path.join(webDir, 'manifest.json');
    const manifestDest = path.join(distDir, 'manifest.json');
    if (fs.existsSync(manifestSrc)) {
      fs.copyFileSync(manifestSrc, manifestDest);
      console.log('[PWA] Copied manifest.json to dist/manifest.json');
    }

    // 2. Patch index.html with iOS Safari PWA tags & early ServiceWorker registration
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

      const pwaMetaTags = `
    <link rel="manifest" href="/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="SnapDialer" />
    <meta name="theme-color" content="#14291B" />
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(reg) {
            console.log('[PWA] ServiceWorker registered:', reg.scope);
          }).catch(function(err) {
            console.warn('[PWA] ServiceWorker registration note:', err);
          });
        });
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(e) {});
        }
      }
    </script>`;

      if (!indexHtml.includes('rel="manifest"')) {
        indexHtml = indexHtml.replace('</head>', `${pwaMetaTags}\n  </head>`);
        fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
        console.log('[PWA] Injected iOS PWA meta tags & inline Service Worker registration into dist/index.html');
      }
    }

    // 3. Scan dist and build offline pre-cache manifest in dist/sw.js
    if (fs.existsSync(swSrc)) {
      const allFiles = getAllFiles(distDir);
      const relativeUrls = allFiles
        .map((f) => '/' + path.relative(distDir, f).replace(/\\/g, '/'))
        .filter((url) => !url.endsWith('/sw.js') && !url.endsWith('/CNAME'));

      if (!relativeUrls.includes('/')) {
        relativeUrls.unshift('/');
      }

      const cacheVersion = `snapdialer-pwa-v1.0.2-${Date.now()}`;
      let swContent = fs.readFileSync(swSrc, 'utf8');
      swContent = swContent.replace(/const CACHE_NAME = ['"][^'"]+['"];/, `const CACHE_NAME = '${cacheVersion}';`);
      swContent = swContent.replace(/const ASSETS_TO_CACHE = \[[^\]]*\];/s, `const ASSETS_TO_CACHE = ${JSON.stringify(relativeUrls, null, 2)};`);

      fs.writeFileSync(swDest, swContent, 'utf8');
      console.log(`[PWA Offline Engine] Generated dist/sw.js with ${relativeUrls.length} pre-cached assets (Cache: ${cacheVersion})`);
    }
  }
} catch (e) {
  console.warn('PWA build preparation note:', e);
}

const surge = require('C:/Users/brorm/AppData/Local/npm-cache/_npx/23158936acd5c32d/node_modules/surge')({
  endpoint: 'https://surge.surge.sh'
});
surge(['./dist', 'valuteachers-dialer.surge.sh', '--endpoint', 'https://surge.surge.sh']);
