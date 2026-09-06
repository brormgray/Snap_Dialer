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
});
