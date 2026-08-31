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

// Generate Offline-First Service Worker Manifest from compiled ./dist
try {
  const distDir = path.join(__dirname, 'dist');
  const swSrc = path.join(__dirname, 'web', 'sw.js');
  const swDest = path.join(distDir, 'sw.js');

  if (fs.existsSync(distDir) && fs.existsSync(swSrc)) {
    const allFiles = getAllFiles(distDir);
    const relativeUrls = allFiles
      .map((f) => '/' + path.relative(distDir, f).replace(/\\/g, '/'))
      .filter((url) => !url.endsWith('/sw.js') && !url.endsWith('/CNAME'));

    if (!relativeUrls.includes('/')) {
      relativeUrls.unshift('/');
    }

    const cacheVersion = `snapdialer-pwa-v1.0.1-${Date.now()}`;
    let swContent = fs.readFileSync(swSrc, 'utf8');
    swContent = swContent.replace(/const CACHE_NAME = ['"][^'"]+['"];/, `const CACHE_NAME = '${cacheVersion}';`);
    swContent = swContent.replace(/const ASSETS_TO_CACHE = \[[^\]]*\];/s, `const ASSETS_TO_CACHE = ${JSON.stringify(relativeUrls, null, 2)};`);

    fs.writeFileSync(swDest, swContent, 'utf8');
    console.log(`[PWA Offline Engine] Generated dist/sw.js with ${relativeUrls.length} pre-cached assets (Cache: ${cacheVersion})`);
  }
} catch (e) {
  console.warn('Service worker manifest generator note:', e);
}

const surge = require('C:/Users/brorm/AppData/Local/npm-cache/_npx/23158936acd5c32d/node_modules/surge')({
  endpoint: 'https://surge.surge.sh'
});
surge(['./dist', 'valuteachers-dialer.surge.sh', '--endpoint', 'https://surge.surge.sh']);
