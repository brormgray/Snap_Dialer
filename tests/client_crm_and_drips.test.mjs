import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Advisor CRM, Production Ledger & Dual-Track SMS Drips', () => {
  // 1. Lead Hydration & Data Defensiveness
  it('hydrates client conversion fields defensively from various formats', () => {
    // Test product parsing: JSON string array, raw array, comma-separated string
    const parseProducts = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return raw.split(',').map((p) => p.trim()).filter(Boolean);
      }
      return [];
    };

    assert.deepStrictEqual(
      parseProducts('["flow_annuity","life_insurance"]'),
      ['flow_annuity', 'life_insurance']
    );
    assert.deepStrictEqual(
      parseProducts(['annuity_transfer', 'investments']),
      ['annuity_transfer', 'investments']
    );
    assert.deepStrictEqual(
      parseProducts('flow_annuity, investments'),
      ['flow_annuity', 'investments']
    );
    assert.deepStrictEqual(parseProducts(null), []);
  });

  // 2. Production KPI Calculations & Time-Horizon Aggregations
  it('calculates total AP, transfer assets, converted clients, and average AP per client', () => {
    const clients = [
      {
        id: 'c1',
        name: 'Teacher 1',
        is_client: true,
        annualized_premium: 3600,
        transfer_assets_volume: 50000,
      },
      {
        id: 'c2',
        name: 'Teacher 2',
        is_client: true,
        annualized_premium: 6000,
        transfer_assets_volume: 120000,
      },
      {
        id: 'c3',
        name: 'Teacher 3',
        is_client: true,
        annualized_premium: 2400,
        transfer_assets_volume: null,
      },
      {
        id: 'p1',
        name: 'Prospect Only',
        is_client: false,
        annualized_premium: 10000, // Should not count because is_client is false
      },
    ];

    const activeClients = clients.filter((c) => c.is_client);
    let totalAP = 0;
    let totalTransfer = 0;
    for (const c of activeClients) {
      if (c.annualized_premium) totalAP += c.annualized_premium;
      if (c.transfer_assets_volume) totalTransfer += c.transfer_assets_volume;
    }
    const avgAP = activeClients.length > 0 ? Math.round(totalAP / activeClients.length) : 0;

    assert.strictEqual(activeClients.length, 3);
    assert.strictEqual(totalAP, 12000);
    assert.strictEqual(totalTransfer, 170000);
    assert.strictEqual(avgAP, 4000);
  });

  it('safely handles 0 clients without NaN or divide-by-zero errors', () => {
    const activeClients = [];
    const totalAP = 0;
    const avgAP = activeClients.length > 0 ? Math.round(totalAP / activeClients.length) : 0;
    assert.strictEqual(avgAP, 0);
    assert.strictEqual(isNaN(avgAP), false);
  });

  // 3. Deduplication Preservation of Client Portfolio
  it('preserves client status, highest AP, and union of products during deduplication', () => {
    const master = {
      id: 'lead_1',
      name: 'Maria Gonzalez',
      phone: '3865550199',
      is_client: false,
      annualized_premium: null,
      products: ['flow_annuity'],
    };

    const duplicate = {
      id: 'lead_1_dup',
      name: 'Maria Gonzalez',
      phone: '(386) 555-0199',
      is_client: true,
      client_since: '2024-03-01T10:00:00.000Z',
      annualized_premium: 4800,
      transfer_assets_volume: 75000,
      products: ['annuity_transfer'],
    };

    // Simulate deduplication consolidation
    let isClient = Boolean(master.is_client);
    let clientSince = master.client_since;
    let annualizedPremium = Number(master.annualized_premium) || null;
    let transferVolume = Number(master.transfer_assets_volume) || null;
    const productsSet = new Set(master.products || []);

    if (duplicate.is_client) {
      isClient = true;
      if (!clientSince || (duplicate.client_since && new Date(duplicate.client_since) < new Date(clientSince))) {
        clientSince = duplicate.client_since;
      }
    }
    if (duplicate.annualized_premium && (annualizedPremium === null || Number(duplicate.annualized_premium) > annualizedPremium)) {
      annualizedPremium = Number(duplicate.annualized_premium);
    }
    if (duplicate.transfer_assets_volume && (transferVolume === null || Number(duplicate.transfer_assets_volume) > transferVolume)) {
      transferVolume = Number(duplicate.transfer_assets_volume);
    }
    if (duplicate.products && Array.isArray(duplicate.products)) {
      duplicate.products.forEach((p) => productsSet.add(p));
    }

    assert.strictEqual(isClient, true);
    assert.strictEqual(clientSince, '2024-03-01T10:00:00.000Z');
    assert.strictEqual(annualizedPremium, 4800);
    assert.strictEqual(transferVolume, 75000);
    assert.deepStrictEqual(Array.from(productsSet).sort(), ['annuity_transfer', 'flow_annuity'].sort());
  });

  // 4. Enhanced Token Interpolation
  it('interpolates first_name, product, anniversary_date, room_number, and planning_period', () => {
    const lead = {
      id: 'lead_test',
      name: 'Robert Davis',
      phone: '3865554321',
      school: 'Deltona High',
      room_number: '4-102',
      planning_period: 'Period 3 (10:15 - 11:05 AM)',
      products: ['flow_annuity'],
      annual_review_due_date: '2025-10-15',
    };

    const PRODUCT_MAP = {
      flow_annuity: '403(b) Flow Annuity',
      annuity_transfer: 'Annuity Transfer-In',
      life_insurance: 'Life Insurance plan',
      investments: 'ValuTeachers retirement plan',
    };

    const templateBody = 'Hi {{first_name}}, your {{product}} annual review is due {{anniversary_date}}. Can we meet in Room {{room_number}} during {{planning_period}}? - {{my_name}}';
    
    const firstName = lead.name.split(' ')[0];
    const productLabel = lead.products.map((p) => PRODUCT_MAP[p] || p).join(' & ');
    const targetDateStr = lead.annual_review_due_date;
    const normalized = targetDateStr.length === 10 ? `${targetDateStr}T12:00:00` : targetDateStr;
    const anniversaryDate = new Date(normalized).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const result = templateBody
      .replace(/{{first_name}}/gi, firstName)
      .replace(/{{product}}/gi, productLabel)
      .replace(/{{anniversary_date}}/gi, anniversaryDate)
      .replace(/{{room_number}}/gi, lead.room_number)
      .replace(/{{planning_period}}/gi, lead.planning_period)
      .replace(/{{my_name}}/gi, 'Alex');

    assert.strictEqual(
      result,
      'Hi Robert, your 403(b) Flow Annuity annual review is due October 15. Can we meet in Room 4-102 during Period 3 (10:15 - 11:05 AM)? - Alex'
    );
  });

  // 5. Dual-Track SMS Drip Scheduling Calculations
  it('computes correct interval delays for Track A (Nurture) and Track B (Client Review)', () => {
    // Track A: Days 7, 14, 24, 45 (for Day 7, 21, 45, 90)
    const dayDelays = [7, 14, 24, 45];
    assert.strictEqual(dayDelays[0], 7);
    assert.strictEqual(dayDelays[0] + dayDelays[1], 21);
    assert.strictEqual(dayDelays[0] + dayDelays[1] + dayDelays[2], 45);
    assert.strictEqual(dayDelays[0] + dayDelays[1] + dayDelays[2] + dayDelays[3], 90);

    // Track B: 30 days before anniversary
    const anniversary = new Date('2025-10-15T00:00:00.000Z');
    const minus30 = new Date(anniversary.getTime() - 30 * 86400000);
    const minus7 = new Date(anniversary.getTime() - 7 * 86400000);

    assert.strictEqual(minus30.toISOString().slice(0, 10), '2025-09-15');
    assert.strictEqual(minus7.toISOString().slice(0, 10), '2025-10-08');
  });

  // 6. Due Drip Detection
  it('correctly identifies leads due for drip outreach today', () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const leads = [
      {
        id: 'l1',
        name: 'Due Lead 1',
        phone: '3865551111',
        drip_track: 'prospect_nurture',
        next_drip_scheduled_at: todayStr,
        text_ok: true,
      },
      {
        id: 'l2',
        name: 'Overdue Lead 2',
        phone: '3865552222',
        drip_track: 'client_annual_review',
        next_drip_scheduled_at: yesterdayStr,
        text_ok: true,
      },
      {
        id: 'l3',
        name: 'Future Lead 3',
        phone: '3865553333',
        drip_track: 'prospect_nurture',
        next_drip_scheduled_at: nextWeekStr,
        text_ok: true,
      },
      {
        id: 'l4',
        name: 'DNC Lead 4',
        phone: '3865554444',
        drip_track: 'prospect_nurture',
        next_drip_scheduled_at: todayStr,
        last_disposition: 'do_not_call',
        text_ok: true,
      },
      {
        id: 'l5',
        name: 'Text Opt-Out Lead 5',
        phone: '3865555555',
        drip_track: 'prospect_nurture',
        next_drip_scheduled_at: todayStr,
        text_ok: false,
      },
    ];

    const dueLeads = leads.filter((l) => {
      if (!l.drip_track || l.drip_track === 'none') return false;
      if (l.last_disposition === 'do_not_call' || l.last_disposition === 'bad_number') return false;
      if (l.text_ok === false) return false;
      if (!l.phone || l.phone.replace(/\D/g, '').length < 7) return false;
      if (l.next_drip_scheduled_at && l.next_drip_scheduled_at.slice(0, 10) <= todayStr) {
        return true;
      }
      return false;
    });

    assert.strictEqual(dueLeads.length, 2);
    assert.deepStrictEqual(dueLeads.map((l) => l.id), ['l1', 'l2']);
  });

  // 7. Custom SMS Body Audit Logging
  it('records custom edited SMS body in call log audit trail instead of generic template string', () => {
    const lead = {
      id: 'lead_drip_custom',
      name: 'Jennifer Miller',
      phone: '3865558822',
      school: 'University High',
      drip_track: 'prospect_nurture',
      drip_step: 0,
    };

    const template = {
      id: 'nurture_1',
      track: 'prospect_nurture',
      step: 0,
      title: 'Initial Follow-Up',
      body: 'Hi {{first_name}}, this is {{my_name}} with ValuTeachers. Following up on your 403(b) review.',
    };

    // Simulate DripDispatcherService.recordDripDispatched logic
    function recordDripDispatchedSim(lead, template, customBody) {
      // Interpolate default if not custom
      const defaultInterpolated = template.body
        .replace(/{{first_name}}/gi, lead.name.split(' ')[0])
        .replace(/{{my_name}}/gi, 'Alex');
      const finalSmsBody = customBody?.trim() || defaultInterpolated;

      const log = {
        lead_id: lead.id,
        lead_name: lead.name,
        phone: lead.phone,
        disposition: 'connected',
        notes: `[Drip Outreach] Step ${template.step + 1}: ${template.title}`,
        sms_sent: true,
        sms_body: finalSmsBody,
        call_duration_seconds: 0,
        attempt_number: 1,
        created_at: new Date().toISOString(),
      };
      return log;
    }

    // Case A: Advisor edited the text before dispatching
    const advisorCustomizedText = "Hey Jennifer! Stopped by University High today regarding your 403(b) planning. Let's touch base during 4th period! - Alex";
    const logA = recordDripDispatchedSim(lead, template, advisorCustomizedText);
    assert.strictEqual(logA.sms_body, advisorCustomizedText);
    assert.notStrictEqual(logA.sms_body, template.body);

    // Case B: Advisor sent with standard template without editing
    const logB = recordDripDispatchedSim(lead, template, undefined);
    assert.strictEqual(logB.sms_body, 'Hi Jennifer, this is Alex with ValuTeachers. Following up on your 403(b) review.');
  });

  // 8. Multi-Stage Prospect Nurture Decay Curve & Indefinite Looping
  it('calculates decay curve intervals: Sprint (24-48h), Bridge (Wks 2-6), Monthly Indefinite', () => {
    // Delays relative to previous touchpoint dispatch
    const delaysByNextStep = {
      1: 2,   // Step 0 -> Step 1: 48h later
      2: 7,   // Step 1 -> Step 2: Week 2 (+7d)
      3: 7,   // Step 2 -> Step 3: Week 3 (+7d)
      4: 7,   // Step 3 -> Step 4: Week 4 (+7d)
      5: 14,  // Step 4 -> Step 5: Week 6 (+14d)
      6: 18,  // Step 5 -> Step 6: Month 2 (+18d, ~Day 60)
    };

    const baseDate = new Date('2025-02-01T12:00:00.000Z');
    
    // Test step 1 (Sprint 48h)
    const next1 = new Date(baseDate.getTime() + (delaysByNextStep[1] ?? 30) * 86400000);
    assert.strictEqual(next1.toISOString().slice(0, 10), '2025-02-03');

    // Test step 2 (Bridge Wk 2)
    const next2 = new Date(baseDate.getTime() + (delaysByNextStep[2] ?? 30) * 86400000);
    assert.strictEqual(next2.toISOString().slice(0, 10), '2025-02-08');

    // Test step 5 (Bridge Wk 6)
    const next5 = new Date(baseDate.getTime() + (delaysByNextStep[5] ?? 30) * 86400000);
    assert.strictEqual(next5.toISOString().slice(0, 10), '2025-02-15');

    // Test step 7+ (Monthly indefinite: default 30 days)
    const next7 = new Date(baseDate.getTime() + (delaysByNextStep[7] ?? 30) * 86400000);
    assert.strictEqual(next7.toISOString().slice(0, 10), '2025-03-03');
  });

  // 9. Indefinite Monthly Template Cycling
  it('cycles indefinitely through monthly authority templates once step >= 6', () => {
    const templates = [
      { id: 'sprint_0', stage: 'sprint' },
      { id: 'sprint_1', stage: 'sprint' },
      { id: 'bridge_2', stage: 'bridge' },
      { id: 'bridge_3', stage: 'bridge' },
      { id: 'bridge_4', stage: 'bridge' },
      { id: 'bridge_5', stage: 'bridge' },
      { id: 'month_6', stage: 'monthly' },
      { id: 'month_7', stage: 'monthly' },
      { id: 'month_8', stage: 'monthly' },
      { id: 'month_9', stage: 'monthly' },
      { id: 'month_10', stage: 'monthly' },
    ];

    const getTemplate = (step) => {
      if (step < templates.length) return templates[step];
      const monthlyStart = 6;
      const monthlyPool = templates.slice(monthlyStart);
      const cycleIndex = (step - monthlyStart) % monthlyPool.length;
      return monthlyPool[cycleIndex];
    };

    assert.strictEqual(getTemplate(0).id, 'sprint_0');
    assert.strictEqual(getTemplate(5).id, 'bridge_5');
    assert.strictEqual(getTemplate(6).id, 'month_6');
    assert.strictEqual(getTemplate(10).id, 'month_10');
    // Step 11 should cycle to month_6
    assert.strictEqual(getTemplate(11).id, 'month_6');
    // Step 12 should cycle to month_7
    assert.strictEqual(getTemplate(12).id, 'month_7');
    // Step 15 should cycle to month_10
    assert.strictEqual(getTemplate(15).id, 'month_10');
  });

  // 10. Existing Lead Assessment & Backfill Verification
  it('assesses unassessed existing leads with nurture_drip outcome or client status and assigns schedules', () => {
    const today = new Date('2025-02-15T12:00:00.000Z');
    const todayStr = '2025-02-15';

    const leads = [
      {
        id: 'legacy_nurture_1',
        name: 'Carlos Ruiz',
        phone: '3865551234',
        appointment_outcome: 'nurture_drip',
        appointment_completed_at: '2025-02-14T10:00:00.000Z', // Yesterday (1 day ago)
        drip_track: null,
        drip_step: null,
        next_drip_scheduled_at: null,
        text_ok: true,
      },
      {
        id: 'legacy_client_1',
        name: 'Patricia Adams',
        phone: '3865555678',
        is_client: true,
        client_since: '2025-01-01T10:00:00.000Z', // 45 days ago
        drip_track: 'client_annual_review',
        next_drip_scheduled_at: null,
        text_ok: true,
      },
    ];

    // Simulate assessAndBackfill logic
    const assessed = leads.map((lead) => {
      let targetTrack = lead.drip_track;
      let targetStep = lead.drip_step || 0;
      let targetNext = lead.next_drip_scheduled_at;

      if (lead.appointment_outcome === 'nurture_drip' && (!targetTrack || targetTrack === 'none')) {
        targetTrack = 'prospect_nurture';
        targetStep = 0;
      }

      if (targetTrack && !targetNext) {
        const baseStr = lead.is_client ? lead.client_since : lead.appointment_completed_at;
        const days = Math.floor((today.getTime() - new Date(baseStr).getTime()) / 86400000);
        if (targetTrack === 'prospect_nurture') {
          if (days <= 2) {
            targetStep = 0;
            targetNext = '2025-02-15'; // Due today (Sprint!)
          }
        } else if (targetTrack === 'client_annual_review') {
          if (days < 90) {
            targetStep = 1;
            targetNext = todayStr;
          }
        }
      }

      return {
        ...lead,
        drip_track: targetTrack,
        drip_step: targetStep,
        next_drip_scheduled_at: targetNext,
      };
    });

    assert.strictEqual(assessed[0].drip_track, 'prospect_nurture');
    assert.strictEqual(assessed[0].drip_step, 0);
    assert.strictEqual(assessed[0].next_drip_scheduled_at, '2025-02-15');

    assert.strictEqual(assessed[1].drip_track, 'client_annual_review');
    assert.strictEqual(assessed[1].drip_step, 1);
    assert.strictEqual(assessed[1].next_drip_scheduled_at, '2025-02-15');
  });

  // 11. Multi-Stage Stage Resolution & Labels
  it('correctly maps each step to sprint, bridge, monthly, or client stages', () => {
    const getStageForStep = (track, step) => {
      if (track === 'client_annual_review') return 'client';
      if (step === 0 || step === 1) return 'sprint';
      if (step >= 2 && step <= 5) return 'bridge';
      return 'monthly';
    };

    assert.strictEqual(getStageForStep('prospect_nurture', 0), 'sprint');
    assert.strictEqual(getStageForStep('prospect_nurture', 1), 'sprint');
    assert.strictEqual(getStageForStep('prospect_nurture', 2), 'bridge');
    assert.strictEqual(getStageForStep('prospect_nurture', 3), 'bridge');
    assert.strictEqual(getStageForStep('prospect_nurture', 4), 'bridge');
    assert.strictEqual(getStageForStep('prospect_nurture', 5), 'bridge');
    assert.strictEqual(getStageForStep('prospect_nurture', 6), 'monthly');
    assert.strictEqual(getStageForStep('prospect_nurture', 10), 'monthly');
    assert.strictEqual(getStageForStep('client_annual_review', 0), 'client');
    assert.strictEqual(getStageForStep('client_annual_review', 3), 'client');
  });
});

