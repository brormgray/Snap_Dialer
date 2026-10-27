import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadSupabaseSyncService() {
  const servicePath = path.resolve('src/services/supabaseSyncService.ts');
  const src = fs.readFileSync(servicePath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const moduleObj = { exports: {} };
  const requireMock = (id) => {
    if (id.includes('react-native')) {
      return { Platform: { OS: 'web' } };
    }
    if (id.includes('supabaseClient')) {
      return {
        getSupabaseClient: () => null,
        setSupabaseCredentials: () => {},
      };
    }
    if (id.includes('database')) {
      return {
        getDatabase: async () => ({}),
        resetDatabase: () => {},
      };
    }
    if (id.includes('indexedDbStorage')) {
      return {
        IndexedDbStorage: {
          saveState: async () => {},
        },
      };
    }
    return {};
  };

  const fn = new Function('require', 'module', 'exports', transpiled.outputText);
  fn(requireMock, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

describe('Supabase Disaster Recovery & Full-Fidelity Client Schema Suite', () => {
  const { mapLeadToSnapSchema, SUPABASE_SQL_SETUP } = loadSupabaseSyncService();

  it('verifies SUPABASE_SQL_SETUP contains all client portfolio & financial columns', () => {
    assert.ok(SUPABASE_SQL_SETUP.includes('is_client BOOLEAN DEFAULT FALSE'));
    assert.ok(SUPABASE_SQL_SETUP.includes('annualized_premium NUMERIC DEFAULT 0'));
    assert.ok(SUPABASE_SQL_SETUP.includes('transfer_assets_volume NUMERIC DEFAULT 0'));
    assert.ok(SUPABASE_SQL_SETUP.includes('policy_effective_date TEXT'));
    assert.ok(SUPABASE_SQL_SETUP.includes('annual_review_due_date TEXT'));
    assert.ok(SUPABASE_SQL_SETUP.includes('appointment_outcome TEXT'));
    assert.ok(SUPABASE_SQL_SETUP.includes('ALTER TABLE snap_leads ADD COLUMN IF NOT EXISTS is_client'));
    assert.ok(SUPABASE_SQL_SETUP.includes('ALTER TABLE snap_leads ADD COLUMN IF NOT EXISTS annualized_premium'));
  });

  it('serializes complete client portfolio & financial columns when fullSchema is enabled', () => {
    const lead = {
      id: 'lead_101',
      list_id: 'list_volusia',
      name: 'Sarah Connor',
      phone: '3865551234',
      school: 'Deltona High',
      email: 'sconnor@volusia.k12.fl.us',
      is_client: true,
      client_since: '2026-08-15T14:30:00.000Z',
      products: ['flow_annuity', 'life_insurance'],
      annualized_premium: 4800,
      transfer_assets_volume: 75000,
      policy_effective_date: '2026-09-01',
      annual_review_due_date: '2027-09-01',
      appointment_scheduled_at: '2026-08-15T14:00:00.000Z',
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-08-15T14:30:00.000Z',
      appointment_notes: '403(b) rollover into Allianz 222 + life flow',
      drip_track: 'client_annual_review',
      drip_step: 1,
      last_drip_sent_at: '2026-09-15T10:00:00.000Z',
      next_drip_scheduled_at: '2027-08-01',
      is_frs: true,
      age: '42',
      text_ok: true,
      frs_interests: ['DROP', '403b'],
      annual_salary: '54000',
      company: 'ValuTeachers',
    };

    const mapped = mapLeadToSnapSchema(lead, true);

    assert.strictEqual(mapped.id, 'lead_101');
    assert.strictEqual(mapped.name, 'Sarah Connor');
    assert.strictEqual(mapped.is_client, true);
    assert.strictEqual(mapped.client_since, '2026-08-15T14:30:00.000Z');
    assert.deepStrictEqual(mapped.products, ['flow_annuity', 'life_insurance']);
    assert.strictEqual(mapped.annualized_premium, 4800);
    assert.strictEqual(mapped.transfer_assets_volume, 75000);
    assert.strictEqual(mapped.policy_effective_date, '2026-09-01');
    assert.strictEqual(mapped.annual_review_due_date, '2027-09-01');
    assert.strictEqual(mapped.appointment_outcome, 'converted');
    assert.strictEqual(mapped.drip_track, 'client_annual_review');
    assert.strictEqual(mapped.annual_salary, '54000');
  });

  it('safely drops client-specific columns when falling back to baseline schema on un-migrated databases', () => {
    const lead = {
      id: 'lead_102',
      list_id: 'list_volusia',
      name: 'John Smith',
      phone: '3865559876',
      is_client: true,
      annualized_premium: 6000,
      transfer_assets_volume: 120000,
      products: ['flow_annuity'],
    };

    const baselineMapped = mapLeadToSnapSchema(lead, false);

    assert.strictEqual(baselineMapped.id, 'lead_102');
    assert.strictEqual(baselineMapped.name, 'John Smith');
    assert.strictEqual(baselineMapped.is_client, undefined);
    assert.strictEqual(baselineMapped.annualized_premium, undefined);
    assert.strictEqual(baselineMapped.products, undefined);
  });

  it('reconstructs converted client status from call activity logs (appt_converted)', () => {
    const leads = [
      {
        id: 'lead_recovered_1',
        name: 'Elena Rostova',
        phone: '3865554321',
        is_client: false, // Lost during cloud restore
        appointment_outcome: null,
      },
    ];

    const logs = [
      {
        id: 'log_c1',
        lead_id: 'lead_recovered_1',
        disposition: 'appt_converted',
        note: '[Sit-Down Wrap-Up] Converted to client after sit-down.',
        timestamp: '2026-08-20T15:00:00.000Z',
      },
    ];

    // Simulate recovery routine
    const logsByLead = new Map();
    for (const log of logs) {
      logsByLead.set(log.lead_id, [log]);
    }

    let recovered = 0;
    for (const lead of leads) {
      const leadLogs = logsByLead.get(lead.id) || [];
      const hasConvertedLog = leadLogs.some((l) => l.disposition === 'appt_converted');
      if (hasConvertedLog && !lead.is_client) {
        lead.is_client = true;
        lead.appointment_outcome = 'converted';
        lead.client_since = leadLogs[0].timestamp;
        recovered++;
      }
    }

    assert.strictEqual(recovered, 1);
    assert.strictEqual(leads[0].is_client, true);
    assert.strictEqual(leads[0].appointment_outcome, 'converted');
    assert.strictEqual(leads[0].client_since, '2026-08-20T15:00:00.000Z');
  });

  it('reconstructs client and extracts AP from lead notes if present', () => {
    const lead = {
      id: 'lead_recovered_2',
      name: 'Robert Davis',
      phone: '3865557788',
      is_client: false,
      annualized_premium: null,
      notes: '[Sit-Down Wrap-Up] Converted to client after sit-down. Set up $3,600 AP flow annuity with National Life Group.',
    };

    const hasConvertedNote = lead.notes.includes('[Sit-Down Wrap-Up] Converted to client');
    assert.strictEqual(hasConvertedNote, true);

    const matchAP = lead.notes.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*(?:AP|annualized\s*premium|annually|\/year|\/yr)/i);
    assert.ok(matchAP);
    const parsedAP = parseFloat(matchAP[1].replace(/,/g, ''));
    assert.strictEqual(parsedAP, 3600);
  });
});
