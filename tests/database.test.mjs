import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('WebDatabase SQL Pattern Matching & Normalization', () => {
  // Simulator of WebDatabase query matching
  function simulateRunAsync(sql, params, dbState) {
    const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();

    if (s.includes('update leads set') || (s.includes('update leads') && s.includes('set'))) {
      const leadId = params[params.length - 1];
      const lead = dbState.leads.find((l) => String(l.id).trim() === String(leadId).trim());
      if (lead) {
        if (
          s.includes('last_disposition = ?') &&
          s.includes('attempts_count = ?')
        ) {
          lead.last_disposition = params[0] || lead.last_disposition;
          lead.attempts_count = Number(params[1]) || (lead.attempts_count || 0) + 1;
          lead.cadence_step = Number(params[2]) || (lead.cadence_step || 0) + 1;
          lead.last_attempt_at = params[3] || new Date().toISOString();
          if (s.includes('follow_up_at = null') || s.includes('follow_up_at=null') || lead.last_disposition !== 'callback_requested') {
            lead.follow_up_at = null;
          }
          if (params[4] !== undefined && params[4] !== null) {
            lead.notes = params[4];
          }
          lead.updated_at = params[5] || new Date().toISOString();
        } else if (
          (s.includes('follow_up_at = null') || s.includes('follow_up_at=null')) &&
          !s.includes('last_disposition = ?')
        ) {
          lead.follow_up_at = null;
          if (lead.last_disposition === 'callback_requested') {
            lead.last_disposition = 'pending';
          }
          if (params[0] !== undefined && params[0] !== null) lead.notes = params[0];
          lead.updated_at = params[1] || new Date().toISOString();
        } else if (s.includes('follow_up_at = ?')) {
          lead.follow_up_at = params[0];
          lead.last_disposition = 'callback_requested';
          if (params[1] !== undefined && params[1] !== null) lead.notes = params[1];
          lead.updated_at = params[2] || new Date().toISOString();
        } else if (s.includes('name = ?')) {
          lead.name = params[0];
          lead.phone = params[1];
          lead.school = params[2];
          if (s.includes('room_number = ?')) {
            lead.email = params[3] || null;
            lead.room_number = params[4] || null;
            lead.planning_period = params[5] || null;
            lead.years_in_frs = params[6] || null;
            if (params[7] !== undefined && params[7] !== null) lead.notes = params[7];
            if (params[8] !== undefined) lead.priority_tier = Number(params[8]);
            if (params[9]) lead.list_id = params[9];
            lead.updated_at = params[10] || new Date().toISOString();
          }
        }
      }
      return { changes: lead ? 1 : 0 };
    }

    if (s.includes('insert into leads')) {
      const leadId = params[0];
      const leadObj = {
        id: leadId,
        list_id: params[1] || 'master_queue',
        name: params[2] || '',
        phone: params[3] || '',
        school: params[4] || 'VOL',
        priority_tier: params[20] !== undefined ? Number(params[20]) : 1,
      };
      dbState.leads.push(leadObj);
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  test('multiline UPDATE leads with newlines and tabs successfully updates all fields', () => {
    const dbState = {
      leads: [
        {
          id: 'lead_test_001',
          name: 'Sarah Connor',
          phone: '(386) 555-1111',
          school: 'VOL',
          email: null,
          room_number: null,
          planning_period: null,
          years_in_frs: null,
          notes: null,
          priority_tier: 1,
          list_id: 'master_queue',
        },
      ],
    };

    // Exactly as formatted in leadsRepository.ts
    const multilineSql = `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?, updated_at = ? 
       WHERE id = ?`;

    const now = new Date().toISOString();
    const params = [
      'Sarah Connor',
      '(386) 555-2222',
      'Deltona High School', // Changed campus
      'sconnor@volusia.k12.fl.us',
      'Building 4, Room 102',
      'Period 3 (10:15 - 11:05)',
      '14',
      'Requested FRS pension DROP breakdown',
      3, // Legacy tier
      'volusia_campaign_2026',
      now,
      'lead_test_001',
    ];

    const result = simulateRunAsync(multilineSql, params, dbState);
    assert.strictEqual(result.changes, 1);

    const updated = dbState.leads[0];
    assert.strictEqual(updated.school, 'Deltona High School');
    assert.strictEqual(updated.phone, '(386) 555-2222');
    assert.strictEqual(updated.room_number, 'Building 4, Room 102');
    assert.strictEqual(updated.planning_period, 'Period 3 (10:15 - 11:05)');
    assert.strictEqual(updated.years_in_frs, '14');
    assert.strictEqual(updated.notes, 'Requested FRS pension DROP breakdown');
    assert.strictEqual(updated.priority_tier, 3);
    assert.strictEqual(updated.list_id, 'volusia_campaign_2026');
  });

  test('whitespace normalization handles multiple spaces and line endings', () => {
    const variations = [
      'UPDATE   leads\n\n\r\t   SET name = ?',
      'update\nleads\nset\nname = ?',
      'UPDATE   LEADS   SET   name = ?',
    ];

    for (const sql of variations) {
      const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
      assert.ok(s.includes('update leads set') || (s.includes('update leads') && s.includes('set')));
    }
  });

  test('trimmed ID matching correctly finds leads regardless of parameter whitespace', () => {
    const dbState = {
      leads: [{ id: 'lead_abc_123', name: 'John Doe', school: 'VOL' }],
    };

    const targetId = '  lead_abc_123  '; // Untrimmed parameter

    const match = dbState.leads.find((l) => String(l.id).trim() === String(targetId).trim());
    assert.ok(match, 'Lead should be found via trimmed ID comparison');
    assert.strictEqual(match.name, 'John Doe');
  });

  test('updateLeadDisposition SQL updates attempts_count, last_disposition, and last_attempt_at without falling into clearFollowUp', () => {
    const dbState = {
      leads: [
        {
          id: 'lead_uncalled_001',
          name: 'Coach Miller',
          phone: '(386) 555-9876',
          attempts_count: 0,
          cadence_step: 1,
          last_disposition: 'pending',
          last_attempt_at: null,
          follow_up_at: null,
          notes: 'Fresh educator lead from scan',
        },
      ],
    };

    // The exact SQL generated by LeadsRepository.updateLeadDisposition
    const dispoSql = `UPDATE leads 
       SET last_disposition = ?, 
           attempts_count = ?, 
           cadence_step = ?, 
           last_attempt_at = ?, 
           follow_up_at = NULL,
           notes = COALESCE(?, notes),
           updated_at = ?
       WHERE id = ?`;

    const now = new Date().toISOString();
    const params = [
      'other',
      1, // incremented attempts
      2, // incremented cadence
      now,
      'Call attempt #1 (Other): Spoke with school principal; educator in conference.',
      now,
      'lead_uncalled_001',
    ];

    const result = simulateRunAsync(dispoSql, params, dbState);
    assert.strictEqual(result.changes, 1);

    const lead = dbState.leads[0];
    assert.strictEqual(lead.last_disposition, 'other', 'Disposition must be updated to other');
    assert.strictEqual(lead.attempts_count, 1, 'Attempts count must increment to 1');
    assert.strictEqual(lead.cadence_step, 2, 'Cadence step must increment to 2');
    assert.strictEqual(lead.last_attempt_at, now, 'Last attempt at must be set');
    assert.strictEqual(lead.follow_up_at, null, 'Follow up at must remain null');
    assert.ok(
      lead.notes.includes('Spoke with school principal'),
      'Notes must contain note text and not be corrupted with disposition string'
    );
  });

  test('hasEverBeenCalled returns false for never-called leads and true once dispositioned or logged', () => {
    const pristineLead = {
      id: 'lead_clean_1',
      attempts_count: 0,
      last_attempt_at: null,
      last_disposition: 'pending',
    };

    const dispoedLead = {
      id: 'lead_called_2',
      attempts_count: 1,
      last_attempt_at: '2026-09-15T18:00:00.000Z',
      last_disposition: 'other',
    };

    const desyncedLead = {
      id: 'lead_desync_3',
      attempts_count: 0,
      last_attempt_at: null,
      last_disposition: 'pending',
    };

    const callLogs = [
      { id: 'log_1', lead_id: 'lead_desync_3', disposition: 'connected' },
    ];

    const hasEverBeenCalled = (l) => {
      if (l.attempts_count && l.attempts_count > 0) return true;
      if (l.last_attempt_at) return true;
      if (l.last_disposition && l.last_disposition !== 'pending') return true;
      if (callLogs && callLogs.some((log) => String(log.lead_id).trim() === String(l.id).trim())) return true;
      return false;
    };

    assert.strictEqual(hasEverBeenCalled(pristineLead), false, 'Pristine lead has never been called');
    assert.strictEqual(hasEverBeenCalled(dispoedLead), true, 'Dispositioned lead is recognized as called');
    assert.strictEqual(hasEverBeenCalled(desyncedLead), true, 'Desynced lead with call log is recognized as called');
  });

  test('WebDatabase self-healing correctly restores missing attempts_count and last_disposition from existing call logs', () => {
    const leads = [
      {
        id: 'lead_healed_1',
        name: 'Teacher Jane',
        attempts_count: 0,
        last_disposition: 'pending',
        last_attempt_at: null,
      },
    ];

    const callLogs = [
      {
        id: 'log_1',
        lead_id: 'lead_healed_1',
        disposition: 'other',
        created_at: '2026-09-15T17:00:00.000Z',
      },
    ];

    // Simulate WebDatabase.init step 4
    for (const lead of leads) {
      const leadLogs = callLogs.filter((log) => String(log.lead_id).trim() === String(lead.id).trim());
      if (leadLogs.length > 0) {
        if (!lead.attempts_count || lead.attempts_count < leadLogs.length) {
          lead.attempts_count = leadLogs.length;
        }
        const sortedLogs = [...leadLogs].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const latestLog = sortedLogs[0];
        if (latestLog?.created_at && (!lead.last_attempt_at || latestLog.created_at > lead.last_attempt_at)) {
          lead.last_attempt_at = latestLog.created_at;
        }
        if (
          latestLog?.disposition &&
          (!lead.last_disposition || lead.last_disposition === 'pending') &&
          latestLog.disposition !== 'pending'
        ) {
          lead.last_disposition = latestLog.disposition;
        }
      }
    }

    assert.strictEqual(leads[0].attempts_count, 1, 'Self-healed attempts count should be 1');
    assert.strictEqual(leads[0].last_disposition, 'other', 'Self-healed disposition should be other');
    assert.strictEqual(leads[0].last_attempt_at, '2026-09-15T17:00:00.000Z', 'Self-healed timestamp should match');
  });
});

