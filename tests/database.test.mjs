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
        if (s.includes('follow_up_at = ?')) {
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
});
