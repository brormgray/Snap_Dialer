const fs = require('fs');
const path = require('path');

/**
 * SnapDialer Single-Source Version Synchronization Engine
 * Keeps package.json, app.json, src/constants/version.ts, and web/sw.js perfectly synchronized.
 */
function syncVersion(mode = 'sync') {
  const rootDir = path.resolve(__dirname, '..');
  const pkgPath = path.join(rootDir, 'package.json');
  const appJsonPath = path.join(rootDir, 'app.json');
  const versionTsPath = path.join(rootDir, 'src/constants/version.ts');
  const swPath = path.join(rootDir, 'web/sw.js');
  const distVersionPath = path.join(rootDir, 'dist/version.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found at ' + pkgPath);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  let currentVersion = pkg.version || '1.7.2';
  let targetVersion = currentVersion;

  if (mode === 'patch') {
    const parts = currentVersion.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    targetVersion = parts.join('.');
  } else if (mode === 'minor') {
    const parts = currentVersion.split('.').map(Number);
    parts[1] = (parts[1] || 0) + 1;
    parts[2] = 0;
    targetVersion = parts.join('.');
  } else if (mode === 'major') {
    const parts = currentVersion.split('.').map(Number);
    parts[0] = (parts[0] || 0) + 1;
    parts[1] = 0;
    parts[2] = 0;
    targetVersion = parts.join('.');
  } else if (/^\d+\.\d+\.\d+/.test(mode)) {
    // Explicit semantic version passed (e.g. "1.8.0")
    targetVersion = mode;
  } else {
    // Mode is 'sync' - keep currentVersion
    targetVersion = currentVersion;
  }

  // 1. Update package.json
  if (pkg.version !== targetVersion) {
    pkg.version = targetVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  // 2. Update app.json
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    if (appJson.expo) {
      appJson.expo.version = targetVersion;
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
    }
  }

  // 3. Update src/constants/version.ts
  const now = new Date();
  const buildDate = now.toISOString().slice(0, 10);
  const buildTimestamp = now.getTime();
  const versionTsContent = `export const APP_VERSION = '${targetVersion}';
export const APP_EDITION = 'Retirement Edition';
export const APP_BUILD_DATE = '${buildDate}';
export const APP_BUILD_TIMESTAMP = ${buildTimestamp};
`;
  fs.writeFileSync(versionTsPath, versionTsContent, 'utf8');

  // 4. Update web/sw.js default cache name
  if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');
    swContent = swContent.replace(
      /const CACHE_NAME = ['"][^'"]+['"];/,
      `const CACHE_NAME = 'snapdialer-pwa-v${targetVersion}';`
    );
    fs.writeFileSync(swPath, swContent, 'utf8');
  }

  // 5. Update dist/version.json if dist directory exists
  if (fs.existsSync(path.dirname(distVersionPath))) {
    const versionPayload = {
      version: targetVersion,
      edition: 'Retirement Edition',
      buildDate: buildDate,
      buildTime: buildTimestamp,
      cacheName: `snapdialer-pwa-v${targetVersion}-${buildTimestamp}`
    };
    fs.writeFileSync(distVersionPath, JSON.stringify(versionPayload, null, 2), 'utf8');
  }

  console.log(`[Version Sync] Successfully synchronized SnapDialer to v${targetVersion} (Build: ${buildDate})`);
  return targetVersion;
}

if (require.main === module) {
  const arg = process.argv[2] || 'sync';
  syncVersion(arg);
}

module.exports = { syncVersion };
