import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('FRS Toggle, Non-FRS Sequences & Dynamic Agency Branding', () => {
  const frsLead = {
    id: 'lead_frs_1',
    name: 'Sarah Connor',
    phone: '4075551234',
    school: 'Lincoln High',
    room_number: '204',
    planning_period: '3rd Period (10:15 - 11:05 AM)',
    years_in_frs: '12',
    is_client: false,
    is_frs: true,
    cadence_step: 1,
  };

  const nonFrsLead = {
    id: 'lead_non_frs_1',
    name: 'Marcus Wright',
    phone: '4075555678',
    school: 'Apex Consulting',
    room_number: null,
    planning_period: null,
    years_in_frs: null,
    is_client: false,
    is_frs: false,
    cadence_step: 1,
  };

  const legacyLead = {
    id: 'lead_legacy_1',
    name: 'John Connor',
    phone: '4075559999',
    school: 'West High',
    is_client: false,
    // is_frs is undefined
    cadence_step: 1,
  };

  const frsTemplates = [
    { id: 'drip_nurture_1', body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Following up on your Florida Retirement System pension options.' },
    { id: 'drip_nurture_2', body: 'Hi {{first_name}}, wanted to share a quick update on DROP timelines.' }
  ];

  const nonFrsTemplates = [
    { id: 'drip_non_frs_nurture_1', body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Following up on your retirement savings review.' },
    { id: 'drip_non_frs_nurture_2', body: 'Hi {{first_name}}, wanted to share a quick note on downside protection options.' }
  ];

  const frsClientTemplates = [
    { id: 'drip_client_day30', body: 'Hi {{first_name}}, policy confirmation check from your district review.' }
  ];

  const nonFrsClientTemplates = [
    { id: 'drip_non_frs_client_day30', body: 'Hi {{first_name}}, policy confirmation check on your retirement plan.' }
  ];

  // Pure template selector matching DripDispatcherService.getTemplateForLead
  const getTemplateForLead = (lead) => {
    const isFrs = lead.is_frs !== false;
    const isClient = Boolean(lead.is_client);
    const step = lead.cadence_step || 1;

    if (isClient) {
      const templates = isFrs ? frsClientTemplates : nonFrsClientTemplates;
      return templates[Math.min(step - 1, templates.length - 1)];
    } else {
      const templates = isFrs ? frsTemplates : nonFrsTemplates;
      return templates[Math.min(step - 1, templates.length - 1)];
    }
  };

  // Pure interpolation function matching TelephonyService.interpolateTemplate
  const interpolateTemplate = (template, lead, myName = 'Alex', agencyOverride = '') => {
    let body = template.body;
    const company = (lead.company || agencyOverride || '').trim();

    if (company) {
      body = body.replace(/{{company}}/gi, company);
    } else {
      body = body.replace(/\s*with\s+{{company}}/gi, '');
      body = body.replace(/,\s*{{company}}/gi, '');
      body = body.replace(/{{company}}/gi, '');
    }

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    body = body.replace(/{{first_name}}/gi, firstName);
    body = body.replace(/{{name}}/gi, lead.name || firstName);
    body = body.replace(/{{my_name}}/gi, myName);
    return body;
  };

  it('defaults legacy leads missing is_frs to FRS templates', () => {
    const tpl = getTemplateForLead(legacyLead);
    assert.ok(tpl, 'Should return a template');
    assert.equal(tpl.id, 'drip_nurture_1');
    assert.ok(tpl.body.includes('Florida Retirement System'));
  });

  it('routes FRS lead to FRS nurture drip sequence', () => {
    const tpl = getTemplateForLead(frsLead);
    assert.ok(tpl);
    assert.equal(tpl.id, 'drip_nurture_1');
    assert.ok(tpl.body.includes('Florida Retirement System'));
  });

  it('routes Non-FRS lead to NON_FRS nurture sequence without school/FRS jargon', () => {
    const tpl = getTemplateForLead(nonFrsLead);
    assert.ok(tpl);
    assert.equal(tpl.id, 'drip_non_frs_nurture_1');
    assert.ok(!tpl.body.includes('Florida Retirement System'));
    assert.ok(!tpl.body.includes('DROP'));
    assert.ok(tpl.body.includes('retirement savings review'));
  });

  it('routes client review drips appropriately for FRS vs Non-FRS', () => {
    const frsClient = { ...frsLead, is_client: true, cadence_step: 1 };
    const nonFrsClient = { ...nonFrsLead, is_client: true, cadence_step: 1 };

    const frsTpl = getTemplateForLead(frsClient);
    const nonFrsTpl = getTemplateForLead(nonFrsClient);

    assert.equal(frsTpl.id, 'drip_client_day30');
    assert.equal(nonFrsTpl.id, 'drip_non_frs_client_day30');
    assert.ok(!nonFrsTpl.body.includes('district'));
  });

  it('interpolates dynamic company/agency name when provided', () => {
    const template = {
      id: 'test_tpl',
      title: 'Test',
      body: 'Hi {{first_name}}, this is {{my_name}} with {{company}} regarding your review.',
    };

    const outValu = interpolateTemplate(template, frsLead, 'Alex', 'ValuTeachers');
    assert.ok(outValu.includes('Alex with ValuTeachers'));

    const outCustom = interpolateTemplate(template, frsLead, 'Rodney', 'Premier Advisors');
    assert.ok(outCustom.includes('Rodney with Premier Advisors'));
  });

  it('cleanly dissolves "with {{company}}" when company is empty', () => {
    const template = {
      id: 'test_tpl',
      title: 'Test',
      body: 'Hi {{first_name}}, this is {{my_name}} with {{company}} regarding your review.',
    };

    const outEmpty = interpolateTemplate(template, frsLead, 'Alex', '');
    assert.ok(!outEmpty.includes('with'), `Expected "with" to dissolve, got: "${outEmpty}"`);
    assert.ok(outEmpty.includes('this is Alex regarding your review.'));
  });

  it('pipeline filtering separates FRS and Non-FRS leads accurately', () => {
    const allLeads = [frsLead, nonFrsLead, legacyLead];

    const frsFiltered = allLeads.filter((l) => l.is_frs !== false);
    assert.equal(frsFiltered.length, 2);
    assert.ok(frsFiltered.some((l) => l.id === 'lead_frs_1'));
    assert.ok(frsFiltered.some((l) => l.id === 'lead_legacy_1'));

    const nonFrsFiltered = allLeads.filter((l) => l.is_frs === false);
    assert.equal(nonFrsFiltered.length, 1);
    assert.equal(nonFrsFiltered[0].id, 'lead_non_frs_1');
  });
});

describe('DexieDatabaseAdapter runAsync Parameter Parsing & Persistence Engine', () => {
  // Simulator of DexieDatabaseAdapter runAsync exactly mirroring src/db/database.ts
  class DexieDatabaseAdapter {
    constructor(initialState = {}) {
      this.leads = initialState.leads ? JSON.parse(JSON.stringify(initialState.leads)) : [];
      this.lists = initialState.lists ? JSON.parse(JSON.stringify(initialState.lists)) : [];
      this.call_logs = initialState.call_logs ? JSON.parse(JSON.stringify(initialState.call_logs)) : [];
    }

    async runAsync(sql, params = []) {
      const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();

      if (s.includes('insert into leads') || s.includes('insert or replace into leads')) {
        let interests = [];
        let preferences = [];
        try {
          interests = typeof params[12] === 'string' ? JSON.parse(params[12] || '[]') : Array.isArray(params[12]) ? params[12] : [];
        } catch {
          interests = [];
        }
        try {
          preferences = typeof params[14] === 'string' ? JSON.parse(params[14] || '[]') : Array.isArray(params[14]) ? params[14] : [];
        } catch {
          preferences = [];
        }

        const hasIsFrsInSql = s.includes('is_frs');
        let isFrs = true;
        let cadenceStep = 1;
        let lastDisp = 'pending';
        let attemptsCount = 0;
        let createdAt = new Date().toISOString();
        let updatedAt = new Date().toISOString();
        let isClient = false;

        if (hasIsFrsInSql) {
          isFrs = params[21] !== undefined ? (params[21] === 1 || params[21] === true || params[21] === 'true' || params[21] === '1') : true;
          if (params.length >= 26) {
            cadenceStep = params[22] !== undefined ? Number(params[22]) : 1;
            lastDisp = params[23] || 'pending';
            attemptsCount = params[24] !== undefined ? Number(params[24]) : 0;
            createdAt = params[25] || createdAt;
            updatedAt = params[26] || updatedAt;
            if (params[27] !== undefined) {
              isClient = params[27] === 1 || params[27] === true;
            }
          } else {
            cadenceStep = 1;
            lastDisp = 'pending';
            attemptsCount = 0;
            createdAt = params[22] || createdAt;
            updatedAt = params[23] || updatedAt;
          }
        } else {
          const isFullRestore = params.length >= 26;
          cadenceStep = isFullRestore && params[21] !== undefined ? Number(params[21]) : 1;
          lastDisp = isFullRestore && params[22] ? params[22] : 'pending';
          attemptsCount = isFullRestore && params[23] !== undefined ? Number(params[23]) : 0;
          createdAt = (isFullRestore ? params[24] : params[21]) || createdAt;
          updatedAt = (isFullRestore ? params[25] : params[22]) || updatedAt;
          if (params[26] !== undefined) {
            isClient = params[26] === 1 || params[26] === true;
          }
        }

        if (typeof createdAt !== 'string' || createdAt === '0' || createdAt === '1' || !createdAt.includes('-')) {
          createdAt = new Date().toISOString();
        }
        if (typeof updatedAt !== 'string' || updatedAt === '0' || updatedAt === '1' || !updatedAt.includes('-')) {
          updatedAt = new Date().toISOString();
        }

        const leadId = params[0] || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const existingIdx = this.leads.findIndex((l) => l.id === leadId);
        const existingLead = existingIdx >= 0 ? this.leads[existingIdx] : null;

        const leadObj = {
          id: leadId,
          list_id: params[1] || existingLead?.list_id || 'master_queue',
          name: params[2] || existingLead?.name || '',
          phone: params[3] || existingLead?.phone || '',
          school: params[4] || existingLead?.school || 'VOL',
          email: params[5] || existingLead?.email || null,
          age: params[6] || existingLead?.age || null,
          planning_period: params[7] || existingLead?.planning_period || null,
          room_number: params[8] || existingLead?.room_number || null,
          years_in_frs: params[9] || existingLead?.years_in_frs || null,
          text_ok: params[10] !== undefined ? (params[10] === 1 || params[10] === true) : (existingLead?.text_ok ?? true),
          frs_knowledge: params[11] || existingLead?.frs_knowledge || null,
          frs_interests: interests.length > 0 ? interests : (existingLead?.frs_interests || []),
          custom_questions: params[13] || existingLead?.custom_questions || null,
          meeting_preferences: preferences.length > 0 ? preferences : (existingLead?.meeting_preferences || []),
          annual_salary: params[15] || existingLead?.annual_salary || null,
          present_403b_contribution: params[16] || existingLead?.present_403b_contribution || null,
          source_image_uri: params[17] || existingLead?.source_image_uri || null,
          company: params[18] || existingLead?.company || null,
          notes: params[19] !== undefined ? params[19] : (existingLead?.notes ?? null),
          priority_tier: params[20] !== undefined && params[20] !== null ? Number(params[20]) : (existingLead?.priority_tier ?? 1),
          cadence_step: cadenceStep || existingLead?.cadence_step || 1,
          last_disposition: lastDisp || existingLead?.last_disposition || 'pending',
          attempts_count: attemptsCount !== undefined ? attemptsCount : (existingLead?.attempts_count ?? 0),
          is_client: isClient || existingLead?.is_client || false,
          is_frs: isFrs,
          products: existingLead?.products || [],
          annualized_premium: existingLead?.annualized_premium || 0,
          transfer_assets_volume: existingLead?.transfer_assets_volume || 0,
          appointment_outcome: existingLead?.appointment_outcome || null,
          appointment_scheduled_at: existingLead?.appointment_scheduled_at || null,
          appointment_completed_at: existingLead?.appointment_completed_at || null,
          created_at: createdAt || existingLead?.created_at || new Date().toISOString(),
          updated_at: updatedAt || new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          this.leads[existingIdx] = { ...this.leads[existingIdx], ...leadObj };
        } else {
          this.leads.push(leadObj);
        }
        return { changes: 1 };
      }

      if (s.includes('update leads set') || (s.includes('update leads') && s.includes('set'))) {
        const leadId = params[params.length - 1];
        const lead = this.leads.find((l) => String(l.id).trim() === String(leadId).trim());
        if (lead) {
          if (s.includes('notes = ?') && s.includes('attempts_count = ?') && s.includes('last_disposition = ?') && s.includes('room_number = ?')) {
            if (s.includes('meeting_preferences = ?') && s.includes('is_client = ?') && s.includes('annualized_premium = ?')) {
              lead.notes = params[0] || null;
              lead.attempts_count = Number(params[1]) || 0;
              lead.last_disposition = params[2] || 'pending';
              lead.last_attempt_at = params[3] || null;
              lead.follow_up_at = params[4] || null;
              lead.source_image_uri = params[5] || null;
              lead.room_number = params[6] || null;
              lead.planning_period = params[7] || null;
              lead.email = params[8] || null;
              lead.years_in_frs = params[9] || null;
              lead.frs_knowledge = params[10] || null;
              lead.custom_questions = params[11] || null;
              try {
                lead.frs_interests = typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || []);
              } catch { lead.frs_interests = []; }
              try {
                lead.meeting_preferences = typeof params[13] === 'string' ? JSON.parse(params[13]) : (params[13] || []);
              } catch { lead.meeting_preferences = []; }
              lead.is_client = params[14] === 1 || params[14] === true;

              let mIdx = 15;
              if (s.includes('is_frs = ?')) {
                lead.is_frs = params[mIdx] === 1 || params[mIdx] === true;
                mIdx++;
              }
              lead.client_since = params[mIdx] || null;
              mIdx++;
              try {
                lead.products = typeof params[mIdx] === 'string' ? JSON.parse(params[mIdx]) : (params[mIdx] || []);
              } catch { lead.products = []; }
              mIdx++;
              lead.annualized_premium = params[mIdx] !== undefined && params[mIdx] !== null ? Number(params[mIdx]) : null;
              mIdx++;
              lead.transfer_assets_volume = params[mIdx] !== undefined && params[mIdx] !== null ? Number(params[mIdx]) : null;
              mIdx++;
              lead.policy_effective_date = params[mIdx] || null;
              mIdx++;
              lead.annual_review_due_date = params[mIdx] || null;
              mIdx++;
              lead.drip_track = params[mIdx] || 'none';
              mIdx++;
              lead.drip_step = params[mIdx] !== undefined ? Number(params[mIdx]) : 0;
              mIdx++;
              lead.next_drip_scheduled_at = params[mIdx] || null;
              mIdx++;
              lead.appointment_scheduled_at = params[mIdx] || null;
              mIdx++;
              lead.appointment_outcome = params[mIdx] || null;
              mIdx++;
              lead.appointment_completed_at = params[mIdx] || null;
              mIdx++;
              lead.updated_at = params[mIdx] || new Date().toISOString();
            } else {
              lead.notes = params[0] || null;
              lead.attempts_count = Number(params[1]) || 0;
              lead.last_disposition = params[2] || 'pending';
              lead.last_attempt_at = params[3] || null;
              lead.follow_up_at = params[4] || null;
              lead.source_image_uri = params[5] || null;
              lead.room_number = params[6] || null;
              lead.planning_period = params[7] || null;
              lead.email = params[8] || null;
              lead.years_in_frs = params[9] || null;
              lead.frs_knowledge = params[10] || null;
              lead.custom_questions = params[11] || null;
              try {
                lead.frs_interests = typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || []);
              } catch { lead.frs_interests = []; }
              try {
                lead.meeting_preferences = typeof params[13] === 'string' ? JSON.parse(params[13]) : (params[13] || []);
              } catch { lead.meeting_preferences = []; }
              let legacyIdx = 14;
              if (s.includes('is_frs = ?')) {
                lead.is_frs = params[legacyIdx] === 1 || params[legacyIdx] === true;
                legacyIdx++;
              }
              lead.updated_at = params[legacyIdx] || new Date().toISOString();
            }
          } else if (s.includes('name = ?')) {
            lead.name = params[0];
            lead.phone = params[1];
            lead.school = params[2];
            if (s.includes('room_number = ?')) {
              lead.email = params[3] || null;
              lead.room_number = params[4] || null;
              lead.planning_period = params[5] || null;
              lead.years_in_frs = params[6] || null;
              if (params[7] !== undefined) lead.notes = params[7] || null;
              if (params[8] !== undefined) lead.priority_tier = Number(params[8]);
              if (params[9]) lead.list_id = params[9];
              if (s.includes('is_client = ?')) {
                lead.is_client = params[10] === 1 || params[10] === true;
                let pIdx = 11;
                if (s.includes('is_frs = ?')) {
                  lead.is_frs = params[pIdx] === 1 || params[pIdx] === true;
                  pIdx++;
                }
                lead.client_since = params[pIdx] || lead.client_since || null;
                pIdx++;
                try {
                  lead.products = typeof params[pIdx] === 'string' ? JSON.parse(params[pIdx]) : (params[pIdx] || []);
                } catch { lead.products = []; }
                pIdx++;
                lead.annualized_premium = params[pIdx] !== undefined && params[pIdx] !== null ? Number(params[pIdx]) : null;
                pIdx++;
                lead.transfer_assets_volume = params[pIdx] !== undefined && params[pIdx] !== null ? Number(params[pIdx]) : null;
                pIdx++;
                lead.policy_effective_date = params[pIdx] || null;
                pIdx++;
                lead.annual_review_due_date = params[pIdx] || null;
                pIdx++;
                lead.drip_track = params[pIdx] || 'none';
                pIdx++;
                lead.drip_step = params[pIdx] !== undefined ? Number(params[pIdx]) : 0;
                pIdx++;
                lead.last_drip_sent_at = params[pIdx] || null;
                pIdx++;
                lead.next_drip_scheduled_at = params[pIdx] || null;
                pIdx++;
                if (s.includes('appointment_scheduled_at = ?')) {
                  lead.appointment_scheduled_at = params[pIdx] || null;
                  pIdx++;
                  lead.appointment_outcome = params[pIdx] || null;
                  pIdx++;
                  lead.appointment_completed_at = params[pIdx] || null;
                  pIdx++;
                  if (s.includes('last_disposition = ?')) {
                    lead.last_disposition = params[pIdx] || lead.last_disposition || 'pending';
                    pIdx++;
                    lead.updated_at = params[pIdx] || new Date().toISOString();
                  } else {
                    lead.updated_at = params[pIdx] || new Date().toISOString();
                  }
                } else {
                  lead.updated_at = params[pIdx] || new Date().toISOString();
                }
                if (lead.is_client) {
                  if (!lead.appointment_outcome) lead.appointment_outcome = 'converted';
                  if (!lead.appointment_completed_at) lead.appointment_completed_at = new Date().toISOString();
                  if (lead.last_disposition === 'appointment_set') lead.last_disposition = 'connected';
                }
              } else if (s.includes('is_frs = ?')) {
                lead.is_frs = params[10] === 1 || params[10] === true;
                lead.updated_at = params[11] || new Date().toISOString();
              } else {
                lead.updated_at = params[10] || new Date().toISOString();
              }
            } else if (s.includes('email = ?')) {
              lead.email = params[3] || null;
              lead.planning_period = params[4] || null;
              lead.years_in_frs = params[5] || null;
              if (params[6] !== undefined) lead.notes = params[6] || null;
              if (params[7] !== undefined) lead.priority_tier = Number(params[7]);
              if (params[8]) lead.list_id = params[8];
              let emIdx = 9;
              if (s.includes('is_frs = ?')) {
                lead.is_frs = params[emIdx] === 1 || params[emIdx] === true;
                emIdx++;
              }
              lead.updated_at = params[emIdx] || new Date().toISOString();
            } else {
              lead.planning_period = params[3] || null;
              lead.years_in_frs = params[4] || null;
              if (params[5] !== undefined) lead.notes = params[5] || null;
              if (params[6] !== undefined) lead.priority_tier = Number(params[6]);
              if (params[7]) lead.list_id = params[7];
              let plIdx = 8;
              if (s.includes('is_frs = ?')) {
                lead.is_frs = params[plIdx] === 1 || params[plIdx] === true;
                plIdx++;
              }
              lead.updated_at = params[plIdx] || new Date().toISOString();
            }
          } else if (s.includes('is_frs = ?')) {
            lead.is_frs = params[0] === 1 || params[0] === true;
            if (s.includes('updated_at = ?') && params[1]) {
              lead.updated_at = params[1];
            } else {
              lead.updated_at = new Date().toISOString();
            }
          }
        }
        return { changes: lead ? 1 : 0 };
      }
      return { changes: 0 };
    }
  }

  it('1. correctly updates is_frs to false in UPDATE leads (name = ?) without shifting any subsequent fields', async () => {
    const initialLead = {
      id: 'lead_frs_test_1',
      name: 'Sarah Connor',
      phone: '4075551234',
      school: 'Lincoln High',
      email: 'sconnor@school.edu',
      room_number: '204',
      planning_period: '3rd Period',
      years_in_frs: '12',
      notes: 'Initial notes',
      priority_tier: 1,
      list_id: 'campaign_1',
      is_client: true,
      is_frs: true,
      client_since: '2026-01-15T00:00:00.000Z',
      products: ['flow_annuity'],
      annualized_premium: 3600,
      transfer_assets_volume: 50000,
      policy_effective_date: '2026-02-01',
      annual_review_due_date: '2027-02-01',
      drip_track: 'client_annual_review',
      drip_step: 1,
      last_drip_sent_at: '2026-03-01T12:00:00.000Z',
      next_drip_scheduled_at: '2026-06-01T12:00:00.000Z',
      appointment_scheduled_at: '2026-01-10T15:00:00.000Z',
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-01-10T16:00:00.000Z',
      last_disposition: 'connected',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
    };

    const adapter = new DexieDatabaseAdapter({ leads: [initialLead] });

    // UPDATE query exactly as executed in LeadsRepository.updateLeadDetails
    const sql = `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?,
           is_client = ?, is_frs = ?, client_since = ?, products = ?, annualized_premium = ?, transfer_assets_volume = ?, policy_effective_date = ?, annual_review_due_date = ?,
           drip_track = ?, drip_step = ?, last_drip_sent_at = ?, next_drip_scheduled_at = ?,
           appointment_scheduled_at = ?, appointment_outcome = ?, appointment_completed_at = ?, last_disposition = ?, updated_at = ? 
       WHERE id = ?`;

    const params = [
      'Sarah Connor Updated', // 0
      '4075551234', // 1
      'Lincoln High Updated', // 2
      'sconnor_new@school.edu', // 3
      '205', // 4
      '4th Period', // 5
      '13', // 6
      'Updated educator notes', // 7
      2, // 8: priority_tier
      'campaign_2', // 9: list_id
      1, // 10: is_client (true)
      0, // 11: is_frs (FALSE - TOGGLE TEST)
      '2026-01-20T00:00:00.000Z', // 12: client_since
      JSON.stringify(['flow_annuity', 'life_insurance']), // 13: products
      7200, // 14: annualized_premium
      125000, // 15: transfer_assets_volume
      '2026-02-15', // 16: policy_effective_date
      '2027-02-15', // 17: annual_review_due_date
      'client_annual_review', // 18: drip_track
      2, // 19: drip_step
      '2026-03-15T12:00:00.000Z', // 20: last_drip_sent_at
      '2026-07-01T12:00:00.000Z', // 21: next_drip_scheduled_at
      '2026-01-12T15:00:00.000Z', // 22: appointment_scheduled_at
      'converted', // 23: appointment_outcome
      '2026-01-12T16:00:00.000Z', // 24: appointment_completed_at
      'connected', // 25: last_disposition
      '2026-09-17T21:05:00.000Z', // 26: updated_at
      'lead_frs_test_1', // 27: id
    ];

    await adapter.runAsync(sql, params);
    const updated = adapter.leads.find((l) => l.id === 'lead_frs_test_1');

    assert.ok(updated, 'Lead should exist');
    assert.strictEqual(updated.is_frs, false, 'is_frs must be updated to false');
    assert.strictEqual(updated.is_client, true, 'is_client must be true');
    assert.strictEqual(updated.client_since, '2026-01-20T00:00:00.000Z', 'client_since must NOT receive is_frs boolean (not shifted)');
    assert.deepStrictEqual(updated.products, ['flow_annuity', 'life_insurance'], 'products array must be preserved');
    assert.strictEqual(updated.annualized_premium, 7200, 'annualized_premium must match index 14');
    assert.strictEqual(updated.transfer_assets_volume, 125000, 'transfer_assets_volume must match index 15');
    assert.strictEqual(updated.policy_effective_date, '2026-02-15', 'policy_effective_date must match index 16');
    assert.strictEqual(updated.annual_review_due_date, '2027-02-15', 'annual_review_due_date must match index 17');
    assert.strictEqual(updated.drip_track, 'client_annual_review', 'drip_track must match index 18');
    assert.strictEqual(updated.drip_step, 2, 'drip_step must match index 19');
    assert.strictEqual(updated.last_drip_sent_at, '2026-03-15T12:00:00.000Z', 'last_drip_sent_at must match index 20');
    assert.strictEqual(updated.next_drip_scheduled_at, '2026-07-01T12:00:00.000Z', 'next_drip_scheduled_at must match index 21');
    assert.strictEqual(updated.appointment_scheduled_at, '2026-01-12T15:00:00.000Z', 'appointment_scheduled_at must match index 22');
    assert.strictEqual(updated.appointment_outcome, 'converted', 'appointment_outcome must match index 23');
    assert.strictEqual(updated.appointment_completed_at, '2026-01-12T16:00:00.000Z', 'appointment_completed_at must match index 24');
    assert.strictEqual(updated.last_disposition, 'connected', 'last_disposition must match index 25');
    assert.strictEqual(updated.updated_at, '2026-09-17T21:05:00.000Z', 'updated_at must match index 26');
  });

  it('2. correctly updates is_frs back to true in UPDATE leads (name = ?) without shifting any subsequent fields', async () => {
    const initialLead = {
      id: 'lead_non_frs_test_2',
      name: 'Marcus Wright',
      phone: '4075555678',
      school: 'Apex Office',
      is_frs: false,
      is_client: false,
      client_since: null,
      products: [],
      annualized_premium: null,
      transfer_assets_volume: null,
      policy_effective_date: null,
      annual_review_due_date: null,
      drip_track: 'none',
      drip_step: 0,
      last_drip_sent_at: null,
      next_drip_scheduled_at: null,
      appointment_scheduled_at: null,
      appointment_outcome: null,
      appointment_completed_at: null,
      last_disposition: 'pending',
    };

    const adapter = new DexieDatabaseAdapter({ leads: [initialLead] });

    const sql = `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?,
           is_client = ?, is_frs = ?, client_since = ?, products = ?, annualized_premium = ?, transfer_assets_volume = ?, policy_effective_date = ?, annual_review_due_date = ?,
           drip_track = ?, drip_step = ?, last_drip_sent_at = ?, next_drip_scheduled_at = ?,
           appointment_scheduled_at = ?, appointment_outcome = ?, appointment_completed_at = ?, last_disposition = ?, updated_at = ? 
       WHERE id = ?`;

    const params = [
      'Marcus Wright', // 0
      '4075555678', // 1
      'Apex Office', // 2
      'mwright@apex.com', // 3
      null, // 4
      null, // 5
      null, // 6
      'Toggled back to FRS', // 7
      1, // 8
      'master_queue', // 9
      0, // 10: is_client (false)
      1, // 11: is_frs (TRUE - TOGGLE BACK TEST)
      null, // 12: client_since
      '[]', // 13: products
      null, // 14: annualized_premium
      null, // 15: transfer_assets_volume
      null, // 16: policy_effective_date
      null, // 17: annual_review_due_date
      'none', // 18: drip_track
      0, // 19: drip_step
      null, // 20: last_drip_sent_at
      null, // 21: next_drip_scheduled_at
      null, // 22: appointment_scheduled_at
      null, // 23: appointment_outcome
      null, // 24: appointment_completed_at
      'pending', // 25: last_disposition
      '2026-09-17T21:08:00.000Z', // 26: updated_at
      'lead_non_frs_test_2', // 27: id
    ];

    await adapter.runAsync(sql, params);
    const updated = adapter.leads.find((l) => l.id === 'lead_non_frs_test_2');

    assert.ok(updated);
    assert.strictEqual(updated.is_frs, true, 'is_frs must be updated back to true');
    assert.strictEqual(updated.is_client, false);
    assert.strictEqual(updated.client_since, null);
    assert.strictEqual(updated.updated_at, '2026-09-17T21:08:00.000Z');
  });

  it('3. dynamically aligns parameters when is_frs is omitted in legacy name = ? queries', async () => {
    const initialLead = {
      id: 'lead_legacy_test_3',
      name: 'Legacy Teacher',
      phone: '4075559999',
      is_client: false,
      is_frs: true,
      client_since: null,
      annualized_premium: null,
    };

    const adapter = new DexieDatabaseAdapter({ leads: [initialLead] });

    // Legacy query WITHOUT is_frs in SET clause
    const sql = `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?,
           is_client = ?, client_since = ?, products = ?, annualized_premium = ?, transfer_assets_volume = ?, policy_effective_date = ?, annual_review_due_date = ?,
           drip_track = ?, drip_step = ?, last_drip_sent_at = ?, next_drip_scheduled_at = ?, updated_at = ? 
       WHERE id = ?`;

    const params = [
      'Legacy Teacher', // 0
      '4075559999', // 1
      'VOL', // 2
      'legacy@vol.edu', // 3
      '101', // 4
      '1st Period', // 5
      '5', // 6
      'Legacy notes', // 7
      1, // 8
      'master_queue', // 9
      1, // 10: is_client
      '2026-01-01T00:00:00.000Z', // 11: client_since
      JSON.stringify(['flow_annuity']), // 12: products
      5000, // 13: annualized_premium
      20000, // 14: transfer_assets_volume
      '2026-01-15', // 15: policy_effective_date
      '2027-01-15', // 16: annual_review_due_date
      'client_annual_review', // 17: drip_track
      1, // 18: drip_step
      null, // 19: last_drip_sent_at
      null, // 20: next_drip_scheduled_at
      '2026-09-17T21:10:00.000Z', // 21: updated_at
      'lead_legacy_test_3', // 22: id
    ];

    await adapter.runAsync(sql, params);
    const updated = adapter.leads.find((l) => l.id === 'lead_legacy_test_3');

    assert.ok(updated);
    assert.strictEqual(updated.is_client, true);
    assert.strictEqual(updated.client_since, '2026-01-01T00:00:00.000Z', 'client_since correctly reads index 11');
    assert.deepStrictEqual(updated.products, ['flow_annuity'], 'products correctly reads index 12');
    assert.strictEqual(updated.annualized_premium, 5000, 'annualized_premium correctly reads index 13');
  });

  it('4. correctly parses is_frs at index 15 in deduplication consolidate (meeting_preferences = ?) and aligns all subsequent indices', async () => {
    const masterLead = {
      id: 'lead_master_dedup',
      name: 'Consolidated Teacher',
      phone: '4075553333',
      is_client: false,
      is_frs: true,
      client_since: null,
      products: [],
      annualized_premium: 0,
      transfer_assets_volume: 0,
      policy_effective_date: null,
      annual_review_due_date: null,
      drip_track: 'none',
      drip_step: 0,
      next_drip_scheduled_at: null,
      appointment_scheduled_at: null,
      appointment_outcome: null,
      appointment_completed_at: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    const adapter = new DexieDatabaseAdapter({ leads: [masterLead] });

    // SQL exactly as constructed in LeadsRepository.consolidateDuplicateLeads
    const sql = `UPDATE leads SET
       notes = ?,
       attempts_count = ?,
       last_disposition = ?,
       last_attempt_at = ?,
       follow_up_at = ?,
       source_image_uri = ?,
       room_number = ?,
       planning_period = ?,
       email = ?,
       years_in_frs = ?,
       frs_knowledge = ?,
       custom_questions = ?,
       frs_interests = ?,
       meeting_preferences = ?,
       is_client = ?,
       is_frs = ?,
       client_since = ?,
       products = ?,
       annualized_premium = ?,
       transfer_assets_volume = ?,
       policy_effective_date = ?,
       annual_review_due_date = ?,
       drip_track = ?,
       drip_step = ?,
       next_drip_scheduled_at = ?,
       appointment_scheduled_at = ?,
       appointment_outcome = ?,
       appointment_completed_at = ?,
       updated_at = ?
     WHERE id = ?`;

    const params = [
      'Consolidated merged notes', // 0
      3, // 1: attempts_count
      'connected', // 2: last_disposition
      '2026-09-10T10:00:00.000Z', // 3: last_attempt_at
      null, // 4: follow_up_at
      null, // 5: source_image_uri
      '301', // 6: room_number
      '5th Period', // 7: planning_period
      'cteacher@district.edu', // 8: email
      '15', // 9: years_in_frs
      'high', // 10: frs_knowledge
      'None', // 11: custom_questions
      JSON.stringify(['drop', 'pension']), // 12: frs_interests
      JSON.stringify(['planning_period']), // 13: meeting_preferences
      1, // 14: is_client (true)
      0, // 15: is_frs (FALSE - TOGGLED TO NON-FRS)
      '2026-02-15T00:00:00.000Z', // 16: client_since (NOT shifted!)
      JSON.stringify(['flow_annuity']), // 17: products (NOT shifted!)
      8500, // 18: annualized_premium (NOT shifted!)
      175000, // 19: transfer_assets_volume (NOT shifted!)
      '2026-03-01', // 20: policy_effective_date (NOT shifted!)
      '2027-03-01', // 21: annual_review_due_date (NOT shifted!)
      'client_annual_review', // 22: drip_track (NOT shifted!)
      3, // 23: drip_step (NOT shifted!)
      '2026-08-01', // 24: next_drip_scheduled_at (NOT shifted!)
      '2026-02-10T14:00:00.000Z', // 25: appointment_scheduled_at
      'converted', // 26: appointment_outcome
      '2026-02-10T15:00:00.000Z', // 27: appointment_completed_at
      '2026-09-17T21:15:00.000Z', // 28: updated_at
      'lead_master_dedup', // 29: id
    ];

    await adapter.runAsync(sql, params);
    const updated = adapter.leads.find((l) => l.id === 'lead_master_dedup');

    assert.ok(updated);
    assert.strictEqual(updated.is_frs, false, 'is_frs must be parsed at index 15 as false');
    assert.strictEqual(updated.is_client, true, 'is_client must be true');
    assert.strictEqual(updated.client_since, '2026-02-15T00:00:00.000Z', 'client_since must NOT receive is_frs (not shifted)');
    assert.deepStrictEqual(updated.products, ['flow_annuity'], 'products array must match index 17');
    assert.strictEqual(updated.annualized_premium, 8500, 'annualized_premium must match index 18');
    assert.strictEqual(updated.transfer_assets_volume, 175000, 'transfer_assets_volume must match index 19');
    assert.strictEqual(updated.policy_effective_date, '2026-03-01', 'policy_effective_date must match index 20');
    assert.strictEqual(updated.annual_review_due_date, '2027-03-01', 'annual_review_due_date must match index 21');
    assert.strictEqual(updated.drip_track, 'client_annual_review', 'drip_track must match index 22');
    assert.strictEqual(updated.drip_step, 3, 'drip_step must match index 23');
    assert.strictEqual(updated.next_drip_scheduled_at, '2026-08-01', 'next_drip_scheduled_at must match index 24');
    assert.strictEqual(updated.appointment_outcome, 'converted', 'appointment_outcome must match index 26');
    assert.strictEqual(updated.updated_at, '2026-09-17T21:15:00.000Z', 'updated_at must match index 28');
  });

  it('5. correctly parses is_frs at index 21 on insert into leads and ensures createdAt and updatedAt are timestamps', async () => {
    const adapter = new DexieDatabaseAdapter();

    const insertSql = `INSERT INTO leads (
      id, list_id, name, phone, school, email, age, planning_period, 
      room_number, years_in_frs, text_ok, frs_knowledge, frs_interests, 
      custom_questions, meeting_preferences, annual_salary, present_403b_contribution, 
      source_image_uri, company, notes, priority_tier, is_frs, cadence_step, last_disposition, attempts_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 0, ?, ?)`;

    const nowTimestamp = '2026-09-17T21:20:00.000Z';

    // Insert Lead A with is_frs = 0 (false)
    await adapter.runAsync(insertSql, [
      'lead_created_non_frs', // 0
      'master_queue', // 1
      'Non-FRS Client Prospect', // 2
      '4075557788', // 3
      'Private Practice', // 4
      'client@private.com', // 5
      null, // 6
      null, // 7
      null, // 8
      null, // 9
      1, // 10: text_ok
      null, // 11
      '[]', // 12
      null, // 13
      '[]', // 14
      null, // 15
      null, // 16
      null, // 17
      'Alpha Advisory', // 18
      'New non-FRS educator card', // 19
      1, // 20: priority_tier
      0, // 21: is_frs (FALSE)
      nowTimestamp, // 22: created_at
      nowTimestamp, // 23: updated_at
    ]);

    const leadA = adapter.leads.find((l) => l.id === 'lead_created_non_frs');
    assert.ok(leadA);
    assert.strictEqual(leadA.is_frs, false, 'Lead A is_frs must be parsed as false');
    assert.strictEqual(leadA.created_at, nowTimestamp, 'Lead A created_at must be timestamp, not 0');
    assert.strictEqual(leadA.updated_at, nowTimestamp, 'Lead A updated_at must be timestamp, not 0');

    // Insert Lead B with is_frs = 1 (true)
    await adapter.runAsync(insertSql, [
      'lead_created_frs', // 0
      'master_queue', // 1
      'FRS Teacher', // 2
      '4075559988', // 3
      'VOL High', // 4
      'teacher@vol.edu', // 5
      null, // 6
      '2nd Period', // 7
      '104', // 8
      '8', // 9
      1, // 10: text_ok
      'medium', // 11
      JSON.stringify(['pension']), // 12
      null, // 13
      JSON.stringify(['planning_period']), // 14
      null, // 15
      null, // 16
      null, // 17
      null, // 18
      'New FRS educator card', // 19
      1, // 20: priority_tier
      1, // 21: is_frs (TRUE)
      nowTimestamp, // 22: created_at
      nowTimestamp, // 23: updated_at
    ]);

    const leadB = adapter.leads.find((l) => l.id === 'lead_created_frs');
    assert.ok(leadB);
    assert.strictEqual(leadB.is_frs, true, 'Lead B is_frs must be parsed as true');
    assert.strictEqual(leadB.created_at, nowTimestamp, 'Lead B created_at must be timestamp, not 1');
    assert.strictEqual(leadB.updated_at, nowTimestamp, 'Lead B updated_at must be timestamp, not 1');
  });

  it('6. correctly executes full backup restore statement (27 params) with is_frs without parameter shifting', async () => {
    const adapter = new DexieDatabaseAdapter();

    const restoreSql = `INSERT OR REPLACE INTO leads (
      id, list_id, name, phone, school, email, age, planning_period,
      room_number, years_in_frs, text_ok, frs_knowledge, frs_interests,
      custom_questions, meeting_preferences, annual_salary, present_403b_contribution,
      source_image_uri, company, notes, priority_tier, is_frs, cadence_step, last_disposition, attempts_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await adapter.runAsync(restoreSql, [
      'lead_restored_1', // 0
      'restored_list', // 1
      'Restored Non-FRS Lead', // 2
      '4075554321', // 3
      'Private Academy', // 4
      'restored@academy.com', // 5
      '42', // 6
      null, // 7
      null, // 8
      null, // 9
      1, // 10
      null, // 11
      '[]', // 12
      null, // 13
      '[]', // 14
      '65000', // 15
      '400', // 16
      null, // 17
      'Independent Group', // 18
      'Restored from cloud backup', // 19
      2, // 20: priority_tier
      0, // 21: is_frs (FALSE)
      3, // 22: cadence_step
      'no_answer', // 23: last_disposition
      4, // 24: attempts_count
      '2026-08-01T12:00:00.000Z', // 25: created_at
      '2026-09-01T12:00:00.000Z', // 26: updated_at
    ]);

    const restored = adapter.leads.find((l) => l.id === 'lead_restored_1');
    assert.ok(restored);
    assert.strictEqual(restored.is_frs, false, 'Restored is_frs must be false');
    assert.strictEqual(restored.cadence_step, 3, 'Restored cadence_step must be 3');
    assert.strictEqual(restored.last_disposition, 'no_answer', 'Restored last_disposition must be no_answer');
    assert.strictEqual(restored.attempts_count, 4, 'Restored attempts_count must be 4');
    assert.strictEqual(restored.created_at, '2026-08-01T12:00:00.000Z', 'created_at must match index 25');
    assert.strictEqual(restored.updated_at, '2026-09-01T12:00:00.000Z', 'updated_at must match index 26');
  });

  it('7. correctly updates is_frs in standalone UPDATE leads SET is_frs = ? and preserves all other fields', async () => {
    const initialLead = {
      id: 'lead_toggle_standalone',
      name: 'Standalone Toggle Teacher',
      phone: '4075558888',
      school: 'Deltona Middle',
      is_frs: true,
      notes: 'Preserve these notes',
      priority_tier: 1,
      appointment_outcome: 'converted',
      products: ['flow_annuity'],
    };

    const adapter = new DexieDatabaseAdapter({ leads: [initialLead] });

    // Toggle to false
    await adapter.runAsync('UPDATE leads SET is_frs = ?, updated_at = ? WHERE id = ?', [
      0,
      '2026-09-17T21:25:00.000Z',
      'lead_toggle_standalone',
    ]);

    let lead = adapter.leads.find((l) => l.id === 'lead_toggle_standalone');
    assert.ok(lead);
    assert.strictEqual(lead.is_frs, false, 'Toggled to false');
    assert.strictEqual(lead.name, 'Standalone Toggle Teacher');
    assert.strictEqual(lead.notes, 'Preserve these notes');
    assert.deepStrictEqual(lead.products, ['flow_annuity']);

    // Toggle back to true
    await adapter.runAsync('UPDATE leads SET is_frs = ?, updated_at = ? WHERE id = ?', [
      1,
      '2026-09-17T21:26:00.000Z',
      'lead_toggle_standalone',
    ]);

    lead = adapter.leads.find((l) => l.id === 'lead_toggle_standalone');
    assert.ok(lead);
    assert.strictEqual(lead.is_frs, true, 'Toggled back to true');
    assert.strictEqual(lead.name, 'Standalone Toggle Teacher');
    assert.strictEqual(lead.notes, 'Preserve these notes');
    assert.deepStrictEqual(lead.products, ['flow_annuity']);
  });

  it('8. verifies static code integrity across database.ts, backupService.ts, and dexieDb.ts', () => {
    const dbPath = path.resolve(__dirname, '../src/db/database.ts');
    const backupPath = path.resolve(__dirname, '../src/services/backupService.ts');
    const dexiePath = path.resolve(__dirname, '../src/db/dexieDb.ts');

    const dbCode = fs.readFileSync(dbPath, 'utf8');
    const backupCode = fs.readFileSync(backupPath, 'utf8');
    const dexieCode = fs.readFileSync(dexiePath, 'utf8');

    // 1. database.ts exports DexieDatabaseAdapter and WebDatabase
    assert.ok(dbCode.includes('export class DexieDatabaseAdapter'), 'database.ts must export class DexieDatabaseAdapter');
    assert.ok(dbCode.includes('export const WebDatabase = DexieDatabaseAdapter'), 'database.ts must export WebDatabase alias');

    // 2. database.ts parses is_frs at index 11 in name = ? and aligns subsequent indices
    assert.ok(dbCode.includes("s.includes('name = ?')"), 'database.ts must match name = ?');
    assert.ok(dbCode.includes("s.includes('is_frs = ?')"), 'database.ts must check is_frs = ?');
    assert.ok(dbCode.includes('pIdx++'), 'database.ts must dynamically increment pIdx for aligned parameters');

    // 3. database.ts parses is_frs at index 15 in meeting_preferences = ? and aligns subsequent indices
    assert.ok(dbCode.includes("s.includes('meeting_preferences = ?')"), 'database.ts must match meeting_preferences = ?');
    assert.ok(dbCode.includes('mIdx++'), 'database.ts must dynamically increment mIdx for aligned parameters');

    // 4. database.ts parses is_frs at index 21 in insert into leads and reads timestamps for createdAt/updatedAt
    assert.ok(dbCode.includes("s.includes('insert into leads')"), 'database.ts must match insert into leads');
    assert.ok(dbCode.includes("hasIsFrsInSql = s.includes('is_frs')"), 'database.ts must check hasIsFrsInSql');

    // 5. backupService.ts includes is_frs in the SQLite restore statement
    assert.ok(backupCode.includes('priority_tier, is_frs, cadence_step'), 'backupService.ts must include is_frs in restore SQL columns');
    assert.ok(backupCode.includes('isFrsVal'), 'backupService.ts must provide isFrsVal in parameters');

    // 6. dexieDb.ts preserves is_frs during legacy migration
    assert.ok(dexieCode.includes('is_frs: raw.is_frs !== undefined'), 'dexieDb.ts must explicitly preserve is_frs in normalizedLeads');
  });
});

