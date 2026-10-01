import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DeduplicationService } from '../src/services/deduplicationService.ts';

describe('Intelligent Phone Number Arbitration & Multi-Number Engine', () => {
  describe('Phone Arbitration Triage Scenarios', () => {
    test('Scenario A: strictly preserves original phone as Primary when original educator has verified contact (spoke)', () => {
      const master = {
        name: 'Sarah Connor',
        phone: '(386) 555-1234',
        school: 'Deltona High',
        last_disposition: 'spoke',
        attempts_count: 2,
        alternate_phones: [],
      };

      const duplicate = {
        name: 'Sarah Connor',
        phone: '(386) 555-8888', // Different phone from new card
        school: 'Deltona High',
        last_disposition: 'pending',
      };

      const result = DeduplicationService.arbitratePhoneNumbers(master, duplicate);

      assert.strictEqual(result.primaryPhone, '(386) 555-1234', 'Must keep verified contact phone as primary');
      assert.strictEqual(result.alternatePhones.length, 1, 'Must queue new phone into alternate_phones');
      assert.strictEqual(result.alternatePhones[0], '(386) 555-8888');
      assert.strictEqual(result.revivedFromBadNumber, false);
      assert.ok(result.auditNotes[0].includes('Verified primary contact number'));
    });

    test('Scenario A: strictly preserves original phone as Primary when educator is a converted client or has appointment', () => {
      const masterClient = {
        name: 'Marcus Vance',
        phone: '386-555-1111',
        is_client: true,
        last_disposition: 'connected',
        alternate_phones: [],
      };

      const dupCard = {
        name: 'Marcus Vance',
        phone: '386-555-9999',
      };

      const result = DeduplicationService.arbitratePhoneNumbers(masterClient, dupCard);
      assert.strictEqual(result.primaryPhone, '386-555-1111', 'Client phone must never be overwritten');
      assert.ok(result.alternatePhones.includes('386-555-9999'));

      // Test with appointment_scheduled_at
      const masterAppt = {
        name: 'Linda Blair',
        phone: '386-555-2222',
        appointment_scheduled_at: '2026-10-05T14:00:00Z',
        last_disposition: 'appointment_set',
      };

      const resultAppt = DeduplicationService.arbitratePhoneNumbers(masterAppt, {
        name: 'Linda Blair',
        phone: '386-555-3333',
      });
      assert.strictEqual(resultAppt.primaryPhone, '386-555-2222', 'Appointment phone must never be overwritten');
      assert.ok(resultAppt.alternatePhones.includes('386-555-3333'));
    });

    test('Scenario B: retains original phone as Primary and queues alternate when called but unreached (no_answer/voicemail)', () => {
      const master = {
        name: 'David Ortiz',
        phone: '(386) 555-4000',
        school: 'Mainland High',
        last_disposition: 'no_answer',
        attempts_count: 3,
        alternate_phones: [],
      };

      const dupCard = {
        name: 'David Ortiz',
        phone: '(386) 555-4999', // e.g. classroom desk phone
        school: 'Mainland High',
      };

      const result = DeduplicationService.arbitratePhoneNumbers(master, dupCard);

      assert.strictEqual(result.primaryPhone, '(386) 555-4000', 'Original phone retained as primary dial target');
      assert.strictEqual(result.alternatePhones.length, 1);
      assert.strictEqual(result.alternatePhones[0], '(386) 555-4999');
      assert.ok(result.auditNotes[0].includes('called 3x without live contact'));
    });

    test('Scenario C: promotes new phone to Primary and revives lead when original was marked bad_number', () => {
      const masterDead = {
        name: 'Robert Davis',
        phone: '386-555-0000', // Dead / disconnected line
        school: 'Heritage Middle',
        last_disposition: 'bad_number',
        attempts_count: 1,
        alternate_phones: [],
      };

      const newValidCard = {
        name: 'Robert Davis',
        phone: '386-555-7777', // New working cell from fresh card
        school: 'Heritage Middle',
      };

      const result = DeduplicationService.arbitratePhoneNumbers(masterDead, newValidCard);

      assert.strictEqual(result.primaryPhone, '386-555-7777', 'Must promote new valid phone to primary');
      assert.strictEqual(result.revivedFromBadNumber, true, 'Flags lead as revived');
      assert.ok(result.alternatePhones.includes('386-555-0000'), 'Old dead number moved to alternates archive');
      assert.ok(result.auditNotes[0].includes('Former number 386-555-0000 was marked bad'));
    });

    test('Scenario D: handles untried leads and cleans up duplicate alternate numbers', () => {
      const master = {
        name: 'Emily Rose',
        phone: '386-555-6000',
        attempts_count: 0,
        alternate_phones: ['386-555-6000'], // contains duplicate of primary
      };

      const dupCard = {
        name: 'Emily Rose',
        phone: '386-555-6001',
        alternate_phones: ['386-555-6002', '386-555-6000'],
      };

      const result = DeduplicationService.arbitratePhoneNumbers(master, dupCard);

      assert.strictEqual(result.primaryPhone, '386-555-6000');
      // Should not contain primary phone 386-555-6000
      assert.strictEqual(result.alternatePhones.includes('386-555-6000'), false);
      assert.ok(result.alternatePhones.includes('386-555-6001'));
      assert.ok(result.alternatePhones.includes('386-555-6002'));
    });
  });

  describe('DeduplicationService.mergeRecords Integration', () => {
    test('deeply merges differing phone into alternate_phones with audit notes', () => {
      const master = {
        id: 'lead_master',
        list_id: 'master_queue',
        name: 'Patricia White',
        phone: '(386) 555-1010',
        school: 'Seabreeze High',
        last_disposition: 'connected',
        attempts_count: 1,
        notes: '[Sep 01] Spoke briefly during planning period',
        alternate_phones: [],
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
      };

      const dupCard = {
        name: 'Patricia White',
        phone: '(386) 555-2020',
        school: 'Seabreeze High',
        notes: '[Sep 16] Added classroom desk phone',
        room_number: 'Room 304',
      };

      const merged = DeduplicationService.mergeRecords(master, dupCard);

      assert.strictEqual(merged.phone, '(386) 555-1010', 'Primary phone preserved');
      assert.deepStrictEqual(merged.alternate_phones, ['(386) 555-2020']);
      assert.strictEqual(merged.room_number, 'Room 304', 'Room number updated');
      assert.ok(merged.notes.includes('[Sep 01] Spoke briefly'), 'Preserves original note');
      assert.ok(merged.notes.includes('[Sep 16] Added classroom desk phone'), 'Appends new note');
      assert.ok(merged.notes.includes('Alternate Phone from Duplicate Card Added: (386) 555-2020'), 'Includes audit trail');
    });

    test('revives bad_number lead on merge and resets disposition to pending', () => {
      const master = {
        id: 'lead_dead',
        list_id: 'master_queue',
        name: 'Gregory House',
        phone: '386-555-0000',
        school: 'Atlantic High',
        last_disposition: 'bad_number',
        attempts_count: 1,
        notes: 'Number disconnected',
        alternate_phones: [],
        created_at: '2026-08-10T10:00:00Z',
        updated_at: '2026-08-10T10:00:00Z',
      };

      const dupCard = {
        name: 'Gregory House',
        phone: '386-555-9876',
        school: 'Atlantic High',
      };

      const merged = DeduplicationService.mergeRecords(master, dupCard);

      assert.strictEqual(merged.phone, '386-555-9876', 'Promotes new number to primary');
      assert.strictEqual(merged.last_disposition, 'pending', 'Resets disposition to pending to revive in queue');
      assert.ok(merged.alternate_phones.includes('386-555-0000'), 'Archives bad number in alternate_phones');
      assert.ok(merged.notes.includes('[Lead Revived via Re-import]'));
    });
  });
});
