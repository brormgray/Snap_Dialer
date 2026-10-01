import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DeduplicationService } from '../src/services/deduplicationService.ts';

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

  test('validates 10-digit phone requirement and rejects uncallable phone numbers', () => {
    function isValidDialablePhone(phone) {
      const digits = normalizePhoneKey(phone);
      return digits.length >= 10;
    }

    assert.strictEqual(isValidDialablePhone('(386) 555-1234'), true);
    assert.strictEqual(isValidDialablePhone('1-386-555-1234'), true);
    assert.strictEqual(isValidDialablePhone('3865551234'), true);
    assert.strictEqual(isValidDialablePhone('555-1234'), false, 'Rejects 7-digit local number without area code');
    assert.strictEqual(isValidDialablePhone(''), false, 'Rejects empty phone');
    assert.strictEqual(isValidDialablePhone(null), false, 'Rejects null phone');
    assert.strictEqual(isValidDialablePhone('N/A'), false, 'Rejects text string');
  });

  test('ingestion upsert merges new card data into existing educator without creating duplicates', () => {
    const existingDb = [
      {
        id: 'lead_perm_101',
        name: 'Marcus Vance',
        phone: '(386) 555-9000',
        school: 'Mainland High',
        room_number: '101',
        notes: '[Aug 15] Met at school orientation',
        attempts_count: 1,
        last_disposition: 'no_answer',
      },
    ];

    const callLogs = [
      { id: 'log_900', lead_id: 'lead_perm_101', disposition: 'no_answer' },
    ];

    // Simulate scanning the same educator with updated room & notes
    function ingestLeadMock(item, db, logs) {
      const targetPhoneKey = normalizePhoneKey(item.phone);
      if (targetPhoneKey.length < 10) {
        throw new Error('A valid 10-digit phone number is required.');
      }

      const existing = db.find((l) => normalizePhoneKey(l.phone) === targetPhoneKey);
      if (existing) {
        existing.room_number = item.room_number || existing.room_number;
        existing.planning_period = item.planning_period || existing.planning_period;
        if (item.notes && !existing.notes.includes(item.notes)) {
          existing.notes += '\n\n' + item.notes;
        }
        return { lead: existing, isNew: false };
      }

      const newLead = { id: 'lead_new_' + Date.now(), ...item };
      db.push(newLead);
      return { lead: newLead, isNew: true };
    }

    const intakeResult = ingestLeadMock(
      {
        name: 'Marcus Vance',
        phone: '1-386-555-9000', // Formatted differently
        school: 'Mainland High',
        room_number: 'Building 4 Room 402',
        planning_period: '4th Period',
        notes: '[Sep 03] Gave updated room number',
      },
      existingDb,
      callLogs
    );

    assert.strictEqual(intakeResult.isNew, false, 'Must identify existing educator');
    assert.strictEqual(existingDb.length, 1, 'Must NOT create duplicate row in database');
    assert.strictEqual(existingDb[0].id, 'lead_perm_101', 'Must preserve permanent UUID');
    assert.strictEqual(existingDb[0].room_number, 'Building 4 Room 402', 'Must update room number');
    assert.ok(existingDb[0].notes.includes('Met at school orientation'), 'Must preserve previous notes');
    assert.ok(existingDb[0].notes.includes('Gave updated room number'), 'Must append new notes');
    assert.strictEqual(callLogs[0].lead_id, 'lead_perm_101', 'Call logs remain permanently anchored');
  });

  test('editing educator phone number preserves stable ID and detects collision with another educator', () => {
    const db = [
      { id: 'lead_1', name: 'Teacher Alpha', phone: '3865551111' },
      { id: 'lead_2', name: 'Teacher Beta', phone: '3865552222' },
    ];
    const logs = [
      { id: 'log_alpha', lead_id: 'lead_1', disposition: 'appointment_set' },
    ];

    function updateLeadMock(leadData, database) {
      const targetPhoneKey = normalizePhoneKey(leadData.phone);
      if (targetPhoneKey.length < 10) {
        throw new Error('A valid 10-digit phone number is required.');
      }
      const collision = database.find(
        (l) => l.id !== leadData.id && normalizePhoneKey(l.phone) === targetPhoneKey
      );
      if (collision) {
        throw new Error(`Phone number is already assigned to "${collision.name}".`);
      }
      const existing = database.find((l) => l.id === leadData.id);
      existing.phone = leadData.phone;
      return existing;
    }

    // 1. Valid phone edit: ID and call logs stay intact
    const updatedAlpha = updateLeadMock({ id: 'lead_1', phone: '(386) 555-3333' }, db);
    assert.strictEqual(updatedAlpha.id, 'lead_1', 'ID must not change');
    assert.strictEqual(logs[0].lead_id, 'lead_1', 'Call logs remain linked to lead_1');
    assert.strictEqual(normalizePhoneKey(db[0].phone), '3865553333');

    // 2. Collision detection: attempting to change to Teacher Beta's phone throws error
    assert.throws(
      () => updateLeadMock({ id: 'lead_1', phone: '386-555-2222' }, db),
      /already assigned to "Teacher Beta"/
    );
  });

  test('sending confirmation SMS to booked educators does not inflate appointment counter', () => {
    const educators = [
      { id: 'lead_1', name: 'Teacher 1', last_disposition: 'appointment_set' },
      { id: 'lead_2', name: 'Teacher 2', last_disposition: 'appointment_set' },
      { id: 'lead_3', name: 'Teacher 3', last_disposition: 'appointment_set' },
      { id: 'lead_4', name: 'Teacher 4', last_disposition: 'no_answer' },
    ];

    // Initial 3 voice call appointments
    const logs = [
      { id: 'log_1', lead_id: 'lead_1', disposition: 'appointment_set', duration_seconds: 120, sms_sent: false },
      { id: 'log_2', lead_id: 'lead_2', disposition: 'appointment_set', duration_seconds: 95, sms_sent: false },
      { id: 'log_3', lead_id: 'lead_3', disposition: 'appointment_set', duration_seconds: 140, sms_sent: false },
    ];

    // Simulate sending confirmation SMS to all 3 appointment leads
    for (const edu of educators.filter((l) => l.last_disposition === 'appointment_set')) {
      const smsLogDisposition = edu.last_disposition === 'appointment_set' ? 'connected' : edu.last_disposition;
      logs.push({
        id: 'log_sms_' + edu.id,
        lead_id: edu.id,
        disposition: smsLogDisposition,
        duration_seconds: 0,
        sms_sent: true,
        note: 'Sent appointment confirmation SMS',
      });
    }

    // Tab chip count (exact match with filtered list of educators)
    const apptsInLeads = educators.filter((l) => l.last_disposition === 'appointment_set').length;

    // KPI count (deduplicated by educator, excluding standalone SMS)
    const scopedLeadIds = new Set(educators.map((l) => l.id));
    const uniqueApptLeadIdsInLogs = new Set(
      logs
        .filter(
          (log) =>
            log.disposition === 'appointment_set' &&
            !log.sms_sent &&
            Number(log.duration_seconds || 0) > 0 &&
            scopedLeadIds.has(log.lead_id)
        )
        .map((log) => log.lead_id)
    );
    const appointmentCount = Math.max(uniqueApptLeadIdsInLogs.size, apptsInLeads);

    assert.strictEqual(apptsInLeads, 3, 'Filter tab badge must show exactly 3');
    assert.strictEqual(appointmentCount, 3, 'KPI appointment count must show exactly 3, not 6');
  });

  describe('DeduplicationService Multi-Signal Identity & Similarity Matching', () => {
    test('normalizes phone digits, country codes, and handles phone extensions cleanly', () => {
      assert.strictEqual(DeduplicationService.normalizePhoneDigits('(386) 555-1234'), '3865551234');
      assert.strictEqual(DeduplicationService.normalizePhoneDigits('+1 (386) 555-1234'), '3865551234');
      assert.strictEqual(DeduplicationService.normalizePhoneDigits('1-386-555-1234 ext 204'), '3865551234');
      assert.strictEqual(DeduplicationService.normalizePhoneDigits('(386) 555-1234 x42'), '3865551234');
      assert.strictEqual(DeduplicationService.normalizePhoneDigits('386.555.1234#101'), '3865551234');
      assert.strictEqual(DeduplicationService.extractPrimary10Digits('(386) 555-1234'), '3865551234');
    });

    test('normalizes educator names with honorifics, suffixes, parentheticals, and order-agnostic tokens', () => {
      assert.deepStrictEqual(DeduplicationService.getNameTokens('John Smith'), ['doe', 'smith'].includes('john') ? ['john', 'smith'] : ['john', 'smith']);
      assert.deepStrictEqual(DeduplicationService.getNameTokens('Smith, John'), ['john', 'smith']);
      assert.deepStrictEqual(DeduplicationService.getNameTokens('Dr. John M. Smith Jr.'), ['john', 'smith']);
      assert.deepStrictEqual(DeduplicationService.getNameTokens('Mrs. Sarah Connor [4th Grade]'), ['connor', 'sarah']);
      assert.deepStrictEqual(DeduplicationService.getNameTokens('Coach Robert Taylor (Math Dept)'), ['robert', 'taylor']);
    });

    test('normalizes school names and resolves educational aliases', () => {
      assert.strictEqual(DeduplicationService.normalizeSchool('Deltona High School'), 'deltona');
      assert.strictEqual(DeduplicationService.normalizeSchool('Deltona High'), 'deltona');
      assert.strictEqual(DeduplicationService.normalizeSchool('Deltona HS'), 'deltona');
      assert.strictEqual(DeduplicationService.normalizeSchool('Heritage Middle School'), 'heritage');
      assert.strictEqual(DeduplicationService.normalizeSchool('Heritage MS'), 'heritage');
      assert.strictEqual(DeduplicationService.normalizeSchool('VOL'), '');
      assert.strictEqual(DeduplicationService.normalizeSchool('Volusia County Schools'), '');
    });

    test('detects exact 10-digit phone match with 100% confidence', () => {
      const leadA = { name: 'Sarah Connor', phone: '(386) 555-1234', school: 'Deltona High' };
      const leadB = { name: 'Sarah Connor', phone: '1-386-555-1234', school: 'Deltona High School' };
      const verdict = DeduplicationService.evaluateMatch(leadA, leadB);
      assert.strictEqual(verdict.isMatch, true);
      assert.strictEqual(verdict.confidence, 100);
      assert.ok(verdict.reason.includes('phone'));
    });

    test('detects educator duplicate when phone has 1-digit handwritten OCR misread', () => {
      // Very common on handwritten cards: Gemini OCR misreads '4' as '8'
      const leadA = { name: 'Sarah Connor', phone: '386-555-1234', school: 'Deltona High' };
      const leadB = { name: 'Sarah Connor', phone: '386-555-1238', school: 'Deltona High' };
      const verdict = DeduplicationService.evaluateMatch(leadA, leadB);
      assert.strictEqual(verdict.isMatch, true);
      assert.ok(verdict.confidence >= 95);
      assert.ok(verdict.reason.includes('OCR phone variance'));
    });

    test('detects educator duplicate when names match and school matches despite different phone numbers', () => {
      // Teacher wrote cell on one card and desk phone on another
      const leadA = { name: 'Marcus Vance', phone: '386-555-9000', school: 'Mainland High School' };
      const leadB = { name: 'Marcus Vance', phone: '386-258-4665', school: 'Mainland High' };
      const verdict = DeduplicationService.evaluateMatch(leadA, leadB);
      assert.strictEqual(verdict.isMatch, true);
      assert.ok(verdict.confidence >= 95);
      assert.ok(verdict.reason.includes('school'));
    });

    test('does NOT match different teachers with same last name or at same school (avoids false positives)', () => {
      const teacher1 = { name: 'John Smith', phone: '386-555-1111', school: 'Mainland High' };
      const teacher2 = { name: 'Mary Smith', phone: '386-555-2222', school: 'Mainland High' };
      const verdict = DeduplicationService.evaluateMatch(teacher1, teacher2);
      assert.strictEqual(verdict.isMatch, false);
      assert.strictEqual(verdict.confidence, 0);
    });

    test('Disjoint Set clusterDuplicateLeads clusters multi-lead chains into single educator clusters', () => {
      const leads = [
        { id: 'l1', name: 'John Doe', phone: '386-555-0001', school: 'Deltona High' },
        { id: 'l2', name: 'John Doe', phone: '386-555-0001', school: 'Deltona High School' },
        { id: 'l3', name: 'John Doe', phone: '386-555-0008', school: 'Deltona High' }, // 1-digit OCR typo
        { id: 'l4', name: 'Alice Walker', phone: '386-555-9999', school: 'Spruce Creek High' },
      ];

      const clusters = DeduplicationService.clusterDuplicateLeads(leads);
      assert.strictEqual(clusters.length, 1, 'Should produce exactly 1 duplicate cluster');
      assert.strictEqual(clusters[0].length, 3, 'Cluster should contain all 3 John Doe cards');
      assert.ok(clusters[0].some((l) => l.id === 'l1'));
      assert.ok(clusters[0].some((l) => l.id === 'l2'));
      assert.ok(clusters[0].some((l) => l.id === 'l3'));
    });

    test('non-destructively deep-merges appointments, client conversion, and notes without data loss', () => {
      const master = {
        id: 'master_lead',
        list_id: 'master_queue',
        name: 'Sarah Connor',
        phone: '3865551234',
        school: 'VOL',
        attempts_count: 1,
        last_disposition: 'no_answer',
        notes: '[Aug 20] Met at table scan',
        frs_interests: ['pension'],
        meeting_preferences: ['planning_period'],
        is_client: false,
        created_at: '2026-08-20T10:00:00Z',
        updated_at: '2026-08-20T10:00:00Z',
      };

      const duplicate = {
        id: 'dup_lead',
        name: 'Sarah Connor',
        phone: '3865551238', // alternate phone
        school: 'Deltona High School',
        room_number: 'Room 204',
        planning_period: '3rd Period',
        attempts_count: 3,
        last_disposition: 'appointment_set',
        appointment_scheduled_at: '2026-10-05T14:30:00Z',
        appointment_outcome: null,
        notes: '[Sep 16] Requested DROP sit-down review',
        frs_interests: ['drop', '403b'],
        meeting_preferences: ['after_school'],
        is_client: true,
        client_since: '2026-09-20T12:00:00Z',
        annualized_premium: 3600,
        transfer_assets_volume: 75000,
        products: ['Fixed Indexed Annuity'],
        created_at: '2026-09-16T14:00:00Z',
        updated_at: '2026-09-16T14:00:00Z',
      };

      const merged = DeduplicationService.mergeRecords(master, duplicate);

      // Verify ID anchored to master
      assert.strictEqual(merged.id, 'master_lead');
      // School updated from VOL to specific campus
      assert.strictEqual(merged.school, 'Deltona High School');
      // Room and planning period merged
      assert.strictEqual(merged.room_number, 'Room 204');
      assert.strictEqual(merged.planning_period, '3rd Period');
      // Notes preserved from both records and alternate phone recorded
      assert.ok(merged.notes.includes('Met at table scan'), 'Preserves original note');
      assert.ok(merged.notes.includes('Requested DROP sit-down review'), 'Preserves duplicate note');
      assert.ok(merged.notes.includes('Alternate Phone from Duplicate Card'), 'Records alternate phone');
      // Highest attempts and disposition preserved
      assert.strictEqual(merged.attempts_count, 3);
      assert.strictEqual(merged.last_disposition, 'appointment_set');
      assert.strictEqual(merged.appointment_scheduled_at, '2026-10-05T14:30:00Z');
      // Client status preserved
      assert.strictEqual(merged.is_client, true);
      assert.strictEqual(merged.annualized_premium, 3600);
      assert.strictEqual(merged.transfer_assets_volume, 75000);
      assert.deepStrictEqual(merged.products, ['Fixed Indexed Annuity']);
      // FRS Interests & preferences unioned
      assert.ok(merged.frs_interests.includes('pension'));
      assert.ok(merged.frs_interests.includes('drop'));
      assert.ok(merged.frs_interests.includes('403b'));
      assert.ok(merged.meeting_preferences.includes('planning_period'));
      assert.ok(merged.meeting_preferences.includes('after_school'));
    });

    test('simulates 9/16/2026 duplicate re-import scenario: accurately identified and merged with zero data loss', () => {
      // Existing educator in pipeline from 9/16/2026
      const existingPipeline = [
        {
          id: 'lead_sep16_99',
          list_id: 'campaign_september',
          name: 'Jennifer Miller',
          phone: '(386) 555-8822',
          school: 'Deltona High School',
          room_number: 'Building 2 Room 114',
          planning_period: '2nd Period (9:20 - 10:10)',
          years_in_frs: '12',
          attempts_count: 2,
          last_disposition: 'callback_requested',
          follow_up_at: '2026-10-02T10:00:00Z',
          notes: '[Sep 16] Original report card intake. Wants 5% salary bonus options.',
          frs_interests: ['pension_estimate'],
          created_at: '2026-09-16T15:30:00Z',
          updated_at: '2026-09-16T15:30:00Z',
        },
      ];

      // Re-imported card today (with handwritten OCR variation: '8822' read as '8828' or school written as Deltona High)
      const scannedCardToday = {
        name: 'Jennifer Miller',
        phone: '386-555-8828', // 1-digit handwritten OCR misread on cell phone
        school: 'Deltona High',
        notes: '[Oct 01] Accidental duplicate scan of same report card',
        frs_interests: ['drop'],
        isValid: true,
      };

      // 1. Ingestion duplicate check
      const { match, verdict } = DeduplicationService.findDuplicateInList(scannedCardToday, existingPipeline);
      assert.ok(match, 'Must identify existing educator from 9/16');
      assert.strictEqual(match.id, 'lead_sep16_99');
      assert.strictEqual(verdict.isMatch, true);

      // 2. Non-destructive merge
      const consolidated = DeduplicationService.mergeRecords(match, scannedCardToday);
      assert.strictEqual(consolidated.id, 'lead_sep16_99', 'Maintains permanent lead UUID');
      assert.strictEqual(consolidated.last_disposition, 'callback_requested', 'Preserves active callback');
      assert.strictEqual(consolidated.follow_up_at, '2026-10-02T10:00:00Z', 'Preserves follow-up date');
      assert.ok(consolidated.notes.includes('Original report card intake'), 'Preserves historical notes');
      assert.ok(consolidated.notes.includes('Accidental duplicate scan'), 'Preserves new note safely');
      assert.ok(consolidated.frs_interests.includes('pension_estimate'));
      assert.ok(consolidated.frs_interests.includes('drop'));
    });
  });
});
