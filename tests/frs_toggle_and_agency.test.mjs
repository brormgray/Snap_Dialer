import { describe, it } from 'node:test';
import assert from 'node:assert';

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
