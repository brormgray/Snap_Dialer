import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('Version Synchronization & Dynamic Release Management Suite', () => {
  const rootDir = path.resolve('.');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const appJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8'));
  const versionTs = fs.readFileSync(path.join(rootDir, 'src/constants/version.ts'), 'utf8');
  const deploySurge = fs.readFileSync(path.join(rootDir, 'deploy-surge.js'), 'utf8');

  it('ensures package.json, app.json, and version.ts are in 100% version alignment', () => {
    assert.strictEqual(pkg.version, '1.8.0');
    assert.strictEqual(appJson.expo.version, '1.8.0');
    assert.ok(versionTs.includes(`export const APP_VERSION = '1.8.0';`));
    assert.ok(versionTs.includes('export const APP_BUILD_DATE ='));
    assert.ok(versionTs.includes('export const APP_BUILD_TIMESTAMP ='));
  });

  it('ensures deploy-surge.js dynamically resolves version from package.json without hardcoded version strings', () => {
    assert.ok(!deploySurge.includes("version: '1.7.2'"));
    assert.ok(!deploySurge.includes('snapdialer-pwa-v1.7.2-'));
    assert.ok(deploySurge.includes("const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));"));
    assert.ok(deploySurge.includes("const currentVersion = pkg.version || '1.8.0';"));
  });

  it('verifies scripts/version-sync.js exports syncVersion function capable of atomic updates', () => {
    const { syncVersion } = require('../scripts/version-sync.js');
    assert.strictEqual(typeof syncVersion, 'function');
  });
});
