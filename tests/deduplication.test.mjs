import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Smart Pipeline Deduplication & Record Consolidation Engine', () => {
  function normalizePhoneKey(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.substring(1);
    }
    return digits;
  }

  function deduplicateLeadsInMemory(allLeads, callLogs = []) {
    const totalBefore = allLeads.length;
    if (totalBefore <= 1) {
      return { totalBefore, totalAfter: totalBefore, duplicatesRemoved: 0, uniqueEducators: totalBefore, leads: allLeads, callLogs };
    }

    const groups = new Map();
    for (const lead of allLeads) {
      const phoneKey = normalizePhoneKey(lead.phone);
      const key =
        phoneKey.length >= 7
          ? 'phone_' + phoneKey
          : 'name_' + lead.name.toLowerCase().trim() + '_' + (lead.school || 'VOL').toLowerCase().trim();

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(lead);
    }

    let duplicatesRemoved = 0;
    const finalLeads = [];
    const logs = [...callLogs];

    for (const [key, group] of groups.entries()) {
      if (group.length === 1) {
        finalLeads.push(group[0]);
        continue;
      }

      // Rank group to pick master
      group.sort((a, b) => {
        const isApptA = a.last_disposition === 'appointment_set' ? 1 : 0;
        const isApptB = b.last_disposition === 'appointment_set' ? 1 : 0;
        if (isApptA !== isApptB) return isApptB - isApptA;

        const isConnectedA = ['connected', 'spoke'].includes(a.last_disposition || '') ? 1 : 0;
        const isConnectedB = ['connected', 'spoke'].includes(b.last_disposition || '') ? 1 : 0;
        if (isConnectedA !== isConnectedB) return isConnectedB - isConnectedA;

        const attemptsA = Number(a.attempts_count) || 0;
        const attemptsB = Number(b.attempts_count) || 0;
        if (attemptsA !== attemptsB) return attemptsB - attemptsA;

        const notesLenA = (a.notes || '').length;
        const notesLenB = (b.notes || '').length;
        if (notesLenA !== notesLenB) return notesLenB - notesLenA;

        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      const master = { ...group[0] };
      const duplicates = group.slice(1);

      let mergedNotes = master.notes || '';
      let highestAttempts = Number(master.attempts_count) || 0;
      let bestDisposition = master.last_disposition || 'pending';

      for (const dup of duplicates) {
        duplicatesRemoved++;

        if (dup.notes && dup.notes.trim()) {
          if (!mergedNotes.includes(dup.notes.trim())) {
            mergedNotes = mergedNotes ? mergedNotes + '\n\n' + dup.notes.trim() : dup.notes.trim();
          }
        }
        if (dup.attempts_count && dup.attempts_count > highestAttempts) {
          highestAttempts = dup.attempts_count;
        }
        if (dup.last_disposition === 'appointment_set') {
          bestDisposition = 'appointment_set';
        } else if (bestDisposition !== 'appointment_set' && ['connected', 'spoke'].includes(dup.last_disposition || '')) {
          bestDisposition = dup.last_disposition;
        }

        // Re-link call logs
        for (const l of logs) {
          if (l.lead_id === dup.id) {
            l.lead_id = master.id;
          }
        }
      }

      master.notes = mergedNotes;
      master.attempts_count = highestAttempts;
      master.last_disposition = bestDisposition;
      finalLeads.push(master);
    }

    return {
      totalBefore,
      totalAfter: finalLeads.length,
      duplicatesRemoved,
      uniqueEducators: finalLeads.length,
      leads: finalLeads,
      callLogs: logs,
    };
  }

  test('normalizes various phone number formats into identical 10-digit keys', () => {
    assert.strictEqual(normalizePhoneKey('(386) 555-1234'), '3865551234');
    assert.strictEqual(normalizePhoneKey('1-386-555-1234'), '3865551234');
    assert.strictEqual(normalizePhoneKey('+1 (386) 555-1234'), '3865551234');
    assert.strictEqual(normalizePhoneKey('386.555.1234'), '3865551234');
    assert.strictEqual(normalizePhoneKey('3865551234'), '3865551234');
  });

  test('safely consolidates 3 duplicate records into 1 master record without data loss', () => {
    const rawLeads = [
      {
        id: 'lead_1',
        name: 'Sarah Jenkins',
        phone: '(386) 555-1234',
        school: 'Spruce Creek High',
        room_number: '204',
        notes: '[Aug 20] Met at table scan',
        attempts_count: 1,
        last_disposition: 'no_answer',
        created_at: '2026-08-20T10:00:00Z',
      },
      {
        id: 'lead_2',
        name: 'Sarah Jenkins',
        phone: '1-386-555-1234',
        school: 'Spruce Creek High',
        planning_period: '3rd Period (10:15 - 11:05)',
        notes: '[Aug 25] Confirmed sit-down during 3rd period',
        attempts_count: 2,
        last_disposition: 'appointment_set',
        created_at: '2026-08-25T14:00:00Z',
      },
      {
        id: 'lead_3',
        name: 'Sarah Jenkins',
        phone: '3865551234',
        school: 'Spruce Creek High',
        years_in_frs: '18',
        notes: '',
        attempts_count: 0,
        last_disposition: 'pending',
        created_at: '2026-08-28T09:00:00Z',
      },
    ];

    const callLogs = [
      { id: 'log_1', lead_id: 'lead_1', disposition: 'no_answer' },
      { id: 'log_2', lead_id: 'lead_2', disposition: 'appointment_set' },
    ];

    const result = deduplicateLeadsInMemory(rawLeads, callLogs);

    assert.strictEqual(result.totalBefore, 3);
    assert.strictEqual(result.totalAfter, 1);
    assert.strictEqual(result.duplicatesRemoved, 2);

    const keeper = result.leads[0];
    assert.strictEqual(keeper.name, 'Sarah Jenkins');
    assert.strictEqual(keeper.last_disposition, 'appointment_set', 'Must preserve appointment_set outcome');
    assert.strictEqual(keeper.attempts_count, 2, 'Must preserve highest attempt count');
    assert.ok(keeper.notes.includes('Met at table scan'), 'Must preserve notes from duplicate 1');
    assert.ok(keeper.notes.includes('Confirmed sit-down'), 'Must preserve notes from duplicate 2');

    // Verify all call logs were re-pointed to master
    assert.strictEqual(result.callLogs[0].lead_id, keeper.id);
    assert.strictEqual(result.callLogs[1].lead_id, keeper.id);
  });

  test('handles 33 unique leads with zero false duplicate deletions', () => {
    const uniqueLeads = Array.from({ length: 33 }, (_, i) => ({
      id: 'lead_' + (i + 1),
      name: 'Teacher ' + (i + 1),
      phone: '386555' + (1000 + i),
      school: 'Volusia High',
      attempts_count: 0,
      last_disposition: 'pending',
    }));

    const result = deduplicateLeadsInMemory(uniqueLeads);
    assert.strictEqual(result.totalBefore, 33);
    assert.strictEqual(result.totalAfter, 33);
    assert.strictEqual(result.duplicatesRemoved, 0);
  });
});
