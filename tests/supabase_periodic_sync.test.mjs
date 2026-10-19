import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Supabase Periodic Auto-Sync & Keep-Alive Engine', () => {
  // Mock localStorage store
  let mockStorage = {};
  const mockLocalStorage = {
    getItem: (key) => (key in mockStorage ? mockStorage[key] : null),
    setItem: (key, val) => {
      mockStorage[key] = String(val);
    },
    removeItem: (key) => {
      delete mockStorage[key];
    },
    clear: () => {
      mockStorage = {};
    },
  };

  function isSyncDue({
    isConfigured = true,
    autoSyncEnabled = true,
    lastSyncTime = null,
    intervalHours = 48,
    currentTimeMs = Date.now(),
  }) {
    if (!isConfigured || !autoSyncEnabled) {
      return false;
    }
    if (!lastSyncTime) {
      return true; // Never synced before
    }
    if (intervalHours === 0) {
      return true; // Sync on every launch
    }
    const lastSyncDate = new Date(lastSyncTime).getTime();
    if (isNaN(lastSyncDate)) {
      return true;
    }
    const elapsedMs = currentTimeMs - lastSyncDate;
    const requiredIntervalMs = intervalHours * 60 * 60 * 1000;
    return elapsedMs >= requiredIntervalMs;
  }

  test('never-synced instance immediately triggers sync', () => {
    const due = isSyncDue({
      isConfigured: true,
      autoSyncEnabled: true,
      lastSyncTime: null,
      intervalHours: 48,
    });
    assert.strictEqual(due, true);
  });

  test('every launch (0 hours) always triggers sync', () => {
    const due = isSyncDue({
      isConfigured: true,
      autoSyncEnabled: true,
      lastSyncTime: new Date().toISOString(),
      intervalHours: 0,
    });
    assert.strictEqual(due, true);
  });

  test('48-hour cadence triggers when elapsed time is >= 48 hours', () => {
    const now = Date.now();
    const fortyNineHoursAgo = new Date(now - 49 * 3600 * 1000).toISOString();
    const fortySevenHoursAgo = new Date(now - 47 * 3600 * 1000).toISOString();

    assert.strictEqual(
      isSyncDue({
        isConfigured: true,
        autoSyncEnabled: true,
        lastSyncTime: fortyNineHoursAgo,
        intervalHours: 48,
        currentTimeMs: now,
      }),
      true,
      '49 hours elapsed should be due'
    );

    assert.strictEqual(
      isSyncDue({
        isConfigured: true,
        autoSyncEnabled: true,
        lastSyncTime: fortySevenHoursAgo,
        intervalHours: 48,
        currentTimeMs: now,
      }),
      false,
      '47 hours elapsed should NOT be due'
    );
  });

  test('disabled auto-sync suppresses automatic sync', () => {
    const now = Date.now();
    const fourDaysAgo = new Date(now - 96 * 3600 * 1000).toISOString();
    assert.strictEqual(
      isSyncDue({
        isConfigured: true,
        autoSyncEnabled: false,
        lastSyncTime: fourDaysAgo,
        intervalHours: 48,
        currentTimeMs: now,
      }),
      false
    );
  });

  test('unconfigured Supabase suppresses automatic sync', () => {
    assert.strictEqual(
      isSyncDue({
        isConfigured: false,
        autoSyncEnabled: true,
        lastSyncTime: null,
        intervalHours: 48,
      }),
      false
    );
  });

  test('GitHub Actions keep-alive workflow file exists and is correctly configured', () => {
    const workflowPath = path.resolve('.github/workflows/supabase-keepalive.yml');
    assert.strictEqual(fs.existsSync(workflowPath), true, 'Workflow file must exist');

    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes("cron: '0 12 */3 * *'"), 'Must run every 3 days at 12:00 UTC');
    assert.ok(content.includes('workflow_dispatch:'), 'Must support manual execution');
    assert.ok(content.includes('secrets.SUPABASE_URL'), 'Must use SUPABASE_URL secret');
    assert.ok(content.includes('secrets.SUPABASE_ANON_KEY'), 'Must use SUPABASE_ANON_KEY secret');
    assert.ok(content.includes('curl'), 'Must use curl to ping the Supabase endpoint');
    assert.ok(content.includes('snap_lists'), 'Must query snap_ table to register active database traffic');
  });
});
