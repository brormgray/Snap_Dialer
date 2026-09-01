import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Two-Way Delta Sync with Last-Write-Wins (LWW) Conflict Resolution', () => {
  function reconcileLww(localItems, cloudItems) {
    const localMap = new Map(localItems.map((l) => [String(l.id).trim(), { ...l }]));
    const cloudMap = new Map(cloudItems.map((c) => [String(c.id).trim(), { ...c }]));

    let localUpdated = 0;
    let cloudUpdated = 0;
    let localCreated = 0;
    let cloudCreated = 0;

    const finalLocal = [];
    const itemsToPushToCloud = [];

    // Reconcile cloud against local
    for (const [id, cItem] of cloudMap.entries()) {
      const lItem = localMap.get(id);
      if (!lItem) {
        // Exists in cloud, missing locally -> insert into local
        finalLocal.push(cItem);
        localCreated++;
      } else {
        const cTime = cItem.updated_at ? new Date(cItem.updated_at).getTime() : 0;
        const lTime = lItem.updated_at ? new Date(lItem.updated_at).getTime() : 0;

        if (cTime > lTime) {
          // Cloud is newer -> overwrite local
          finalLocal.push(cItem);
          localUpdated++;
        } else if (lTime > cTime) {
          // Local is newer -> keep local & push to cloud
          finalLocal.push(lItem);
          itemsToPushToCloud.push(lItem);
          cloudUpdated++;
        } else {
          // Exactly equal
          finalLocal.push(lItem);
        }
      }
    }

    // Check local items missing from cloud
    for (const [id, lItem] of localMap.entries()) {
      if (!cloudMap.has(id)) {
        finalLocal.push(lItem);
        itemsToPushToCloud.push(lItem);
        cloudCreated++;
      }
    }

    return {
      finalLocal,
      itemsToPushToCloud,
      stats: { localUpdated, cloudUpdated, localCreated, cloudCreated },
    };
  }

  test('cloud newer updates local item without data loss', () => {
    const local = [
      { id: 'lead_1', name: 'John Doe', school: 'Old School', updated_at: '2026-09-01T10:00:00Z' },
    ];
    const cloud = [
      { id: 'lead_1', name: 'John Doe', school: 'Deltona High', updated_at: '2026-09-01T11:00:00Z' },
    ];

    const { finalLocal, itemsToPushToCloud, stats } = reconcileLww(local, cloud);
    assert.strictEqual(stats.localUpdated, 1);
    assert.strictEqual(stats.cloudUpdated, 0);
    assert.strictEqual(finalLocal[0].school, 'Deltona High');
    assert.strictEqual(itemsToPushToCloud.length, 0);
  });

  test('local newer pushes update to cloud', () => {
    const local = [
      { id: 'lead_1', name: 'Jane Smith', school: 'University High', updated_at: '2026-09-01T12:00:00Z' },
    ];
    const cloud = [
      { id: 'lead_1', name: 'Jane Smith', school: 'Old Campus', updated_at: '2026-09-01T10:00:00Z' },
    ];

    const { finalLocal, itemsToPushToCloud, stats } = reconcileLww(local, cloud);
    assert.strictEqual(stats.cloudUpdated, 1);
    assert.strictEqual(stats.localUpdated, 0);
    assert.strictEqual(itemsToPushToCloud.length, 1);
    assert.strictEqual(itemsToPushToCloud[0].school, 'University High');
  });

  test('record existing only on one side is safely copied to the other', () => {
    const local = [
      { id: 'lead_local_only', name: 'Local Teacher', updated_at: '2026-09-01T10:00:00Z' },
    ];
    const cloud = [
      { id: 'lead_cloud_only', name: 'Cloud Teacher', updated_at: '2026-09-01T10:00:00Z' },
    ];

    const { finalLocal, itemsToPushToCloud, stats } = reconcileLww(local, cloud);
    assert.strictEqual(stats.localCreated, 1);
    assert.strictEqual(stats.cloudCreated, 1);
    assert.strictEqual(finalLocal.length, 2);
    assert.strictEqual(itemsToPushToCloud.length, 1);
    assert.strictEqual(itemsToPushToCloud[0].id, 'lead_local_only');
  });
});
