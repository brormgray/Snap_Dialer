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

  test('prevents duplicate cloud lead push when local lead matches cloud lead by 10-digit phone', () => {
    const localLeads = [
      { id: 'local_lead_123', name: 'Sarah Jenkins', phone: '(386) 555-1234', updated_at: '2026-09-01T10:00:00Z' }
    ];
    const cloudLeads = [
      { id: 'cloud_lead_999', name: 'Sarah Jenkins', phone: '+1 386-555-1234', updated_at: '2026-09-01T11:00:00Z' }
    ];

    const localLeadsMap = new Map(localLeads.map((l) => [l.id, l]));
    const localLeadsPhoneMap = new Map();
    for (const l of localLeads) {
      const pKey = (l.phone || '').replace(/\D/g, '').replace(/^1/, '');
      if (pKey.length >= 10) localLeadsPhoneMap.set(pKey.slice(-10), l);
    }

    const cloudLeadsMap = new Map(cloudLeads.map((c) => [c.id, c]));
    const leadsToPush = [];
    const matchedLocalLeadIds = new Set();
    let localCreated = 0;
    let localUpdated = 0;

    for (const [id, cLead] of cloudLeadsMap.entries()) {
      let lLead = localLeadsMap.get(id);
      if (!lLead) {
        const cPhoneKey = (cLead.phone || '').replace(/\D/g, '').replace(/^1/, '');
        if (cPhoneKey.length >= 10) {
          lLead = localLeadsPhoneMap.get(cPhoneKey.slice(-10));
          if (lLead) {
            matchedLocalLeadIds.add(String(lLead.id).trim());
          }
        }
      } else {
        matchedLocalLeadIds.add(id);
      }

      if (!lLead) {
        localCreated++;
      } else {
        const cTime = new Date(cLead.updated_at).getTime();
        const lTime = new Date(lLead.updated_at).getTime();
        if (cTime > lTime) {
          Object.assign(lLead, cLead);
          localUpdated++;
        }
      }
    }

    for (const [id, lLead] of localLeadsMap.entries()) {
      if (!cloudLeadsMap.has(id) && !matchedLocalLeadIds.has(id)) {
        leadsToPush.push(lLead);
      }
    }

    assert.strictEqual(localUpdated, 1);
    assert.strictEqual(localCreated, 0);
    // matchedLocalLeadIds prevented pushing local_lead_123 as a new cloud lead
    assert.strictEqual(leadsToPush.length, 0);
  });

  test('pin lock security rate limits with 30-second lockout after 5 failed attempts', () => {
    let failedCount = 0;
    let lockoutUntil = 0;

    function handleFailedPin(nowMs) {
      if (nowMs < lockoutUntil) {
        return { lockedOut: true, remainingSec: Math.ceil((lockoutUntil - nowMs) / 1000) };
      }
      if (lockoutUntil > 0) {
        failedCount = 0;
        lockoutUntil = 0;
      }
      failedCount++;
      if (failedCount >= 5) {
        lockoutUntil = nowMs + 30000;
        return { lockedOut: true, remainingSec: 30 };
      }
      return { lockedOut: false, remainingAttempts: 5 - failedCount };
    }

    const t0 = 1000000;
    for (let i = 0; i < 4; i++) {
      const res = handleFailedPin(t0);
      assert.strictEqual(res.lockedOut, false);
    }
    // 5th attempt triggers lockout
    const res5 = handleFailedPin(t0);
    assert.strictEqual(res5.lockedOut, true);
    assert.strictEqual(res5.remainingSec, 30);

    // Attempt at +10s is rejected
    const res10s = handleFailedPin(t0 + 10000);
    assert.strictEqual(res10s.lockedOut, true);
    assert.strictEqual(res10s.remainingSec, 20);

    // Attempt at +31s is allowed
    const res31s = handleFailedPin(t0 + 31000);
    assert.strictEqual(res31s.lockedOut, false);
  });

  test('vision AI strips markdown code fences cleanly before JSON parsing', () => {
    const rawFencedResponse = '```json\n[\n  {\n    "name": "Jane Doe",\n    "phone": "3865551234",\n    "school": "University High"\n  }\n]\n```';
    const cleaned = rawFencedResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    assert.strictEqual(Array.isArray(parsed), true);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].name, 'Jane Doe');
    assert.strictEqual(parsed[0].phone, '3865551234');
  });

  test('cloud newer preserves local-only fields (proof card, text_ok, client portfolio, appointment status)', () => {
    const localLead = {
      id: 'lead_local_1',
      name: 'Maria Santos',
      phone: '3865558899',
      school: 'Old School',
      source_image_uri: 'data:image/jpeg;base64,mockLocalImageBase64',
      text_ok: true,
      frs_interests: 'DROP Rollover, Pension Maximization',
      is_client: true,
      annualized_premium: 6000,
      transfer_assets_volume: 85000,
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-09-02T14:30:00Z',
      updated_at: '2026-09-01T10:00:00Z',
    };

    const cloudLead = {
      id: 'lead_local_1',
      name: 'Maria Santos',
      phone: '3865558899',
      school: 'Deltona High', // updated campus in cloud
      source_image_uri: null, // cloud doesn't store heavy base64
      notes: 'Spoke at staff meeting',
      updated_at: '2026-09-05T10:00:00Z', // newer
    };

    const localPreserved = {
      source_image_uri: localLead.source_image_uri || cloudLead.source_image_uri || null,
      text_ok: localLead.text_ok !== undefined ? localLead.text_ok : true,
      frs_interests: localLead.frs_interests || cloudLead.frs_interests || null,
      is_client: localLead.is_client !== undefined ? localLead.is_client : false,
      annualized_premium: localLead.annualized_premium !== undefined ? localLead.annualized_premium : 0,
      transfer_assets_volume: localLead.transfer_assets_volume !== undefined ? localLead.transfer_assets_volume : 0,
      appointment_outcome: localLead.appointment_outcome || cloudLead.appointment_outcome || null,
      appointment_completed_at: localLead.appointment_completed_at || cloudLead.appointment_completed_at || null,
    };

    const merged = Object.assign({}, localLead, cloudLead, localPreserved);

    assert.strictEqual(merged.school, 'Deltona High');
    assert.strictEqual(merged.notes, 'Spoke at staff meeting');
    assert.strictEqual(merged.source_image_uri, 'data:image/jpeg;base64,mockLocalImageBase64');
    assert.strictEqual(merged.text_ok, true);
    assert.strictEqual(merged.is_client, true);
    assert.strictEqual(merged.annualized_premium, 6000);
    assert.strictEqual(merged.transfer_assets_volume, 85000);
    assert.strictEqual(merged.appointment_outcome, 'converted');
  });

  test('persistent PIN lockout survives page reload simulation using stored timestamp', () => {
    const mockLocalStorage = new Map();
    const LOCKOUT_KEY = 'snap_pin_lockout_until';

    function setLockout(untilMs) {
      mockLocalStorage.set(LOCKOUT_KEY, String(untilMs));
    }

    function getRemainingLockout(nowMs) {
      const val = mockLocalStorage.get(LOCKOUT_KEY);
      if (!val) return 0;
      const until = parseInt(val, 10);
      const diff = Math.ceil((until - nowMs) / 1000);
      return diff > 0 ? diff : 0;
    }

    const t0 = 2000000;
    setLockout(t0 + 30000);

    // Initial check: 30 seconds
    assert.strictEqual(getRemainingLockout(t0), 30);

    // Simulated page reload at +12s
    assert.strictEqual(getRemainingLockout(t0 + 12000), 18);

    // Simulated check after expiration at +31s
    assert.strictEqual(getRemainingLockout(t0 + 31000), 0);
  });
});

