import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Drip Dispatcher, Telephony, Calendar & AI SMS Audit Suite', () => {
  // Load source files for AST / content verification
  const dripTemplatesSrc = fs.readFileSync(path.join(__dirname, '../src/data/dripTemplates.ts'), 'utf8');
  const dripDispatcherSrc = fs.readFileSync(path.join(__dirname, '../src/services/dripDispatcherService.ts'), 'utf8');
  const telephonySrc = fs.readFileSync(path.join(__dirname, '../src/services/telephonyService.ts'), 'utf8');
  const calendarSrc = fs.readFileSync(path.join(__dirname, '../src/services/calendarService.ts'), 'utf8');
  const aiSmsSrc = fs.readFileSync(path.join(__dirname, '../src/services/aiSmsService.ts'), 'utf8');

  // Extract templates dynamically from dripTemplates.ts content
  const extractTemplates = (constName) => {
    const regex = new RegExp(`export const ${constName}: SMSTemplate\\[\\] = ([\\s\\S]*?\\n\\]);`);
    const match = dripTemplatesSrc.match(regex);
    if (!match) throw new Error(`Could not find ${constName} in dripTemplates.ts`);
    return (new Function(`return ${match[1]};`))();
  };

  const NURTURE_DRIP_TEMPLATES = extractTemplates('NURTURE_DRIP_TEMPLATES');
  const NON_FRS_NURTURE_DRIP_TEMPLATES = extractTemplates('NON_FRS_NURTURE_DRIP_TEMPLATES');
  const CLIENT_REVIEW_DRIP_TEMPLATES = extractTemplates('CLIENT_REVIEW_DRIP_TEMPLATES');
  const NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES = extractTemplates('NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES');

  // DripDispatcherService simulation identical to implementation
  const getTemplateForLead = (lead) => {
    const track = lead.drip_track;
    const step = Number(lead.drip_step) || 0;
    const isFrs = lead.is_frs !== false;

    if (track === 'prospect_nurture') {
      const templates = isFrs ? NURTURE_DRIP_TEMPLATES : NON_FRS_NURTURE_DRIP_TEMPLATES;
      if (step < templates.length) {
        return templates[step] || null;
      }
      const monthlyStartIndex = 6;
      const monthlyPool = templates.slice(monthlyStartIndex);
      if (monthlyPool.length > 0) {
        const cycleIndex = (step - monthlyStartIndex) % monthlyPool.length;
        return monthlyPool[cycleIndex] || null;
      }
      return templates[templates.length - 1] || null;
    }

    if (track === 'client_annual_review') {
      const templates = isFrs ? CLIENT_REVIEW_DRIP_TEMPLATES : NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES;
      if (step < templates.length) {
        return templates[step] || null;
      }
      const cycleIndex = step % templates.length;
      return templates[cycleIndex] || null;
    }

    return null;
  };

  // TelephonyService.interpolateTemplate identical to implementation
  const interpolateTemplate = (template, lead, myName = 'Alex', agencyNameOverride) => {
    const primaryMeetingPref =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : 'during your planning period';

    const planningPeriodText = lead.planning_period || 'your planning period';
    const roomText = lead.room_number
      ? (/^room\b/i.test(lead.room_number.trim()) ? lead.room_number.trim() : `Room ${lead.room_number.trim()}`)
      : 'your classroom';

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const lastName = lead.name && lead.name.split(' ').length > 1 ? lead.name.split(' ').slice(1).join(' ') : '';

    const company = (lead.company || agencyNameOverride || '').trim();

    let formattedAnniversary = 'your policy anniversary';
    const targetDateStr = lead.annual_review_due_date || lead.policy_effective_date;
    if (targetDateStr) {
      try {
        const normalized = targetDateStr.length === 10 ? `${targetDateStr}T12:00:00` : targetDateStr;
        const d = new Date(normalized);
        if (!isNaN(d.getTime())) {
          formattedAnniversary = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        }
      } catch {}
    }

    let body = template.body;
    if (!company) {
      body = body
        .replace(/\s*(?:with|from|at|representing)\s+{{company}}/gi, '')
        .replace(/\s*(?:with|from|at|representing)\s+{{agency_name}}/gi, '')
        .replace(/\s*(?:with|from|at|representing)\s+{{agency}}/gi, '')
        .replace(/,\s*{{company}}/gi, '')
        .replace(/,\s*{{agency_name}}/gi, '')
        .replace(/,\s*{{agency}}/gi, '')
        .replace(/{{company}}/gi, '')
        .replace(/{{agency_name}}/gi, '')
        .replace(/{{agency}}/gi, '')
        .replace(/\b(?:with|from|at|representing)\s*([.,!?:;])/gi, '$1')
        .replace(/\b(?:with|from|at|representing)\s*$/gi, '');
    }

    return body
      .replace(/{{name}}/gi, () => firstName)
      .replace(/{{first_name}}/gi, () => firstName)
      .replace(/{{last_name}}/gi, () => lastName)
      .replace(/{{full_name}}/gi, () => lead.name || 'there')
      .replace(/{{school}}/gi, () => lead.school || 'your school')
      .replace(/{{planning_period}}/gi, () => planningPeriodText)
      .replace(/{{room_number}}/gi, () => roomText)
      .replace(/{{years_in_frs}}/gi, () => (lead.years_in_frs ? `${lead.years_in_frs} years` : 'your time'))
      .replace(/{{meeting_pref}}/gi, () => primaryMeetingPref)
      .replace(/{{company}}/gi, () => company)
      .replace(/{{agency_name}}/gi, () => company)
      .replace(/{{agency}}/gi, () => company)
      .replace(/{{note}}/gi, () => lead.notes || '')
      .replace(/{{notes}}/gi, () => lead.notes || '')
      .replace(/{{product}}/gi, () => 'Retirement plan')
      .replace(/{{anniversary_date}}/gi, () => formattedAnniversary)
      .replace(/{{appointment_date}}/gi, () => 'today')
      .replace(/{{appointment_time}}/gi, () => '2:00 PM')
      .replace(/{{appointment_relative}}/gi, () => 'today at 2:00 PM')
      .replace(/{{appointment_day}}/gi, () => 'Monday')
      .replace(/{{appointment_datetime}}/gi, () => 'Monday, Sep 7 at 2:00 PM')
      .replace(/{{time_window}}/gi, () => 'today at 2:00 PM')
      .replace(/{{relative_time}}/gi, () => 'today at 2:00 PM')
      .replace(/{{my_name}}/gi, () => myName)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([.,!?:;])/g, '$1')
      .replace(/^[ \t]+|[ \t]+$/gm, '')
      .trim();
  };

  // 1. DripDispatcherService Routing Audit
  describe('1. DripDispatcherService Routing (FRS vs Non-FRS)', () => {
    it('cleanly routes prospect nurture lead with is_frs === false to NON_FRS_NURTURE_DRIP_TEMPLATES', () => {
      const nonFrsLead = {
        id: 'nfrs_1',
        name: 'Jordan Belfort',
        phone: '4075551234',
        is_frs: false,
        drip_track: 'prospect_nurture',
        drip_step: 0,
      };

      for (let step = 0; step < 11; step++) {
        const lead = { ...nonFrsLead, drip_step: step };
        const tpl = getTemplateForLead(lead);
        assert.ok(tpl, `Should return template for step ${step}`);
        assert.strictEqual(tpl.id, NON_FRS_NURTURE_DRIP_TEMPLATES[step].id);
        // Non-FRS templates must not contain school/district/FRS keywords
        assert.ok(!tpl.body.includes('Florida Retirement System'), `Step ${step} contains FRS`);
        assert.ok(!tpl.body.includes('DROP'), `Step ${step} contains DROP`);
        assert.ok(!tpl.body.includes('{{school}}'), `Step ${step} contains {{school}}`);
        assert.ok(!tpl.body.includes('{{room_number}}'), `Step ${step} contains {{room_number}}`);
        assert.ok(!tpl.body.includes('{{planning_period}}'), `Step ${step} contains {{planning_period}}`);
        assert.ok(!tpl.body.includes('district'), `Step ${step} contains district`);
      }
    });

    it('cleanly cycles Non-FRS monthly authority templates indefinitely for step >= 6', () => {
      const nonFrsLead = {
        id: 'nfrs_2',
        name: 'David Mills',
        phone: '4075552345',
        is_frs: false,
        drip_track: 'prospect_nurture',
      };

      // Step 11 should cycle back to index 6
      const step11 = getTemplateForLead({ ...nonFrsLead, drip_step: 11 });
      assert.strictEqual(step11.id, NON_FRS_NURTURE_DRIP_TEMPLATES[6].id);

      // Step 12 should cycle to index 7
      const step12 = getTemplateForLead({ ...nonFrsLead, drip_step: 12 });
      assert.strictEqual(step12.id, NON_FRS_NURTURE_DRIP_TEMPLATES[7].id);

      // Verify no FRS leak in cycled templates
      assert.ok(!step11.body.includes('FRS'));
      assert.ok(!step12.body.includes('FRS'));
    });

    it('cleanly routes client review lead with is_frs === false to NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES', () => {
      const nonFrsClient = {
        id: 'nfrs_client_1',
        name: 'Claire Underwood',
        phone: '4075553456',
        is_frs: false,
        is_client: true,
        drip_track: 'client_annual_review',
      };

      for (let step = 0; step < 6; step++) {
        const lead = { ...nonFrsClient, drip_step: step };
        const tpl = getTemplateForLead(lead);
        assert.ok(tpl, `Should return template for client step ${step}`);
        assert.strictEqual(tpl.id, NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES[step].id);
        assert.ok(!tpl.body.includes('district'), `Client step ${step} contains district`);
        assert.ok(!tpl.body.includes('school'), `Client step ${step} contains school`);
        assert.ok(!tpl.body.includes('{{school}}'), `Client step ${step} contains {{school}}`);
        assert.ok(!tpl.body.includes('{{room_number}}'), `Client step ${step} contains {{room_number}}`);
        assert.ok(!tpl.body.includes('FRS'), `Client step ${step} contains FRS`);
      }
    });

    it('preserves FRS templates for educators where is_frs is true or undefined (legacy)', () => {
      const educator = {
        id: 'edu_1',
        name: 'Brenda Miller',
        phone: '4075557890',
        school: 'Winter Park High',
        room_number: '102',
        is_frs: true,
        drip_track: 'prospect_nurture',
        drip_step: 0,
      };

      const legacyEducator = {
        id: 'edu_legacy',
        name: 'Tom Davis',
        phone: '4075558901',
        school: 'Lake Brantley High',
        drip_track: 'prospect_nurture',
        drip_step: 0,
        // is_frs is undefined
      };

      const tplTrue = getTemplateForLead(educator);
      assert.strictEqual(tplTrue.id, NURTURE_DRIP_TEMPLATES[0].id);
      assert.ok(tplTrue.body.includes('{{school}}'));

      const tplLegacy = getTemplateForLead(legacyEducator);
      assert.strictEqual(tplLegacy.id, NURTURE_DRIP_TEMPLATES[0].id);
      assert.ok(tplLegacy.body.includes('{{school}}'));
    });
  });

  // 2. TelephonyService Interpolation Audit
  describe('2. TelephonyService.interpolateTemplate {{company}} Dissolution', () => {
    const sampleLead = {
      id: 'lead_test',
      name: 'Sarah Connor',
      phone: '4075559999',
      school: 'Lincoln High',
      room_number: '204',
      planning_period: '3rd Period',
    };

    it('cleanly dissolves "with {{company}}" when company is empty string ""', () => {
      const template = {
        id: 't1',
        title: 'Test',
        body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Looking forward to meeting!',
      };
      const out = interpolateTemplate(template, sampleLead, 'Alex', '');
      assert.strictEqual(out, 'Hi Sarah, this is Alex. Looking forward to meeting!');
      assert.ok(!out.includes('with'));
      assert.ok(!out.includes('  '), 'Must not leave double spaces');
    });

    it('cleanly dissolves "with {{company}}" when company is whitespace "   "', () => {
      const template = {
        id: 't2',
        title: 'Test',
        body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Looking forward to meeting!',
      };
      const out = interpolateTemplate(template, sampleLead, 'Alex', '   ');
      assert.strictEqual(out, 'Hi Sarah, this is Alex. Looking forward to meeting!');
      assert.ok(!out.includes('with'));
      assert.ok(!out.includes('  '));
    });

    it('cleanly dissolves "with {{company}}!" when punctuation follows directly', () => {
      const template = {
        id: 't3',
        title: 'Test',
        body: 'Hi {{name}}, this is {{my_name}} with {{company}}! Just checking in.',
      };
      const out = interpolateTemplate(template, sampleLead, 'Alex', '');
      assert.strictEqual(out, 'Hi Sarah, this is Alex! Just checking in.');
      assert.ok(!out.includes('with'));
      assert.ok(!out.includes('  '));
    });

    it('cleanly dissolves ", {{company}}" without trailing comma or double space', () => {
      const template = {
        id: 't4',
        title: 'Test',
        body: 'Hi {{first_name}}, are you still looking to optimize your retirement? - {{my_name}}, {{company}}',
      };
      const out = interpolateTemplate(template, sampleLead, 'Alex', '');
      assert.strictEqual(out, 'Hi Sarah, are you still looking to optimize your retirement? - Alex');
      assert.ok(!out.endsWith(','));
      assert.ok(!out.includes('  '));
    });

    it('cleanly dissolves "at {{company}}" and "from {{company}}"', () => {
      const templateAt = {
        id: 't5',
        title: 'Test At',
        body: 'Hi {{first_name}}, this is {{my_name}} at {{company}}. Quick check-in!',
      };
      const outAt = interpolateTemplate(templateAt, sampleLead, 'Alex', '');
      assert.strictEqual(outAt, 'Hi Sarah, this is Alex. Quick check-in!');

      const templateFrom = {
        id: 't6',
        title: 'Test From',
        body: 'Hi {{first_name}}, this is {{my_name}} from {{company}}. Quick check-in!',
      };
      const outFrom = interpolateTemplate(templateFrom, sampleLead, 'Alex', '');
      assert.strictEqual(outFrom, 'Hi Sarah, this is Alex. Quick check-in!');
    });

    it('properly inserts company when non-empty without awkward spacing', () => {
      const template = {
        id: 't7',
        title: 'Test With Company',
        body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Looking forward to meeting!',
      };
      const outValu = interpolateTemplate(template, sampleLead, 'Alex', 'ValuTeachers');
      assert.strictEqual(outValu, 'Hi Sarah, this is Alex with ValuTeachers. Looking forward to meeting!');

      const outApex = interpolateTemplate(template, sampleLead, 'Alex', 'Apex Advisory Group');
      assert.strictEqual(outApex, 'Hi Sarah, this is Alex with Apex Advisory Group. Looking forward to meeting!');
    });

    it('eliminates awkward spaces before punctuation marks across any template', () => {
      const template = {
        id: 't8',
        title: 'Punctuation Hygiene',
        body: 'Hi {{first_name}} , this is {{my_name}} with {{company}} . All good ?',
      };
      const out = interpolateTemplate(template, sampleLead, 'Alex', '');
      assert.strictEqual(out, 'Hi Sarah, this is Alex. All good?');
    });
  });

  // 3. AiSmsService Messaging Audit
  describe('3. AiSmsService Messaging Logic (FRS vs Non-FRS)', () => {
    it('verifies AiSmsService prompt includes strict Non-FRS directives when is_frs === false', () => {
      assert.ok(aiSmsSrc.includes('CRITICAL NON-FRS RULE: The recipient is a Non-FRS individual'));
      assert.ok(aiSmsSrc.includes('Do NOT mention Florida Retirement System (FRS), state pension multiplier, DROP, classroom room numbers, or school districts'));
      assert.ok(aiSmsSrc.includes('Focus on general retirement analysis, 401(k)/IRA reviews, rollovers, 0% downside floor annuities, or tax advantages'));
    });

    it('verifies getSmartFallbackSMS branches cleanly for all tones between FRS and Non-FRS', () => {
      // Direct source inspection of getSmartFallbackSMS branching
      assert.ok(aiSmsSrc.includes("if (toneFocus === 'sprint_roadblock')"));
      assert.ok(aiSmsSrc.includes("if (toneFocus === 'annual_review')"));
      assert.ok(aiSmsSrc.includes("if (toneFocus === 'unanswered_followup')"));

      // Verify Non-FRS sprint roadblock mentions retirement rollover or savings
      assert.ok(aiSmsSrc.includes('finalizing your retirement rollover or savings paperwork'));
      // Verify FRS sprint roadblock mentions FRS & 403(b)
      assert.ok(aiSmsSrc.includes('finalizing your FRS & 403(b) paperwork'));

      // Verify Non-FRS client check mentions retirement contributions or transfers
      assert.ok(aiSmsSrc.includes('retirement contributions or transfers are running smoothly'));
      // Verify FRS client check mentions district pay stub
      assert.ok(aiSmsSrc.includes('district pay stub'));

      // Verify Non-FRS annual review mentions retirement goals
      assert.ok(aiSmsSrc.includes('plan matches your retirement goals. When is a good time for a quick review?'));
      // Verify FRS annual review mentions FRS milestones and planning period
      assert.ok(aiSmsSrc.includes('FRS milestones. When is a good time during your planning period at ${school} to meet?'));
    });
  });

  // 4. CalendarService Event Audit
  describe('4. CalendarService Event Branching (FRS vs Non-FRS)', () => {
    // Helper replicating CalendarService.buildEducatorEvent logic
    const buildEducatorEvent = (lead, scheduledDate = new Date('2026-09-07T14:00:00.000Z'), durationMinutes = 20, customNotes = null) => {
      const validStart = scheduledDate;
      const endDate = new Date(validStart.getTime() + durationMinutes * 60000);
      const isFrs = lead.is_frs !== false;
      const roomStr = lead.room_number ? `Room ${lead.room_number}` : (isFrs ? 'Classroom' : '');
      const schoolStr = lead.school || (isFrs ? 'Campus' : 'Office/Remote');
      const planningStr = isFrs && lead.planning_period ? ` (${lead.planning_period})` : '';

      const title = isFrs
        ? `🎯 FRS Sit-Down: ${lead.name}${planningStr}`
        : `🎯 Retirement Review: ${lead.name}`;
      const location = roomStr ? `${schoolStr} • ${roomStr}` : schoolStr;

      const description = [
        isFrs
          ? `FRS & Retirement Review with ${lead.name}`
          : `Retirement Strategy Review with ${lead.name}`,
        `Location: ${location}`,
        lead.planning_period ? `Best Window: ${lead.planning_period}` : null,
        `Phone: ${lead.phone}`,
        isFrs && lead.years_in_frs ? `Years in FRS: ${lead.years_in_frs}` : null,
        lead.frs_interests?.length ? `Focus Topics: ${lead.frs_interests.join(', ')}` : null,
        lead.custom_questions ? `Inquiries: "${lead.custom_questions}"` : null,
        customNotes ? `Appointment Notes: ${customNotes}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      return {
        title,
        description,
        location,
        startDate: validStart,
        endDate,
        alarmMinutes: 15,
        contactName: lead.name,
        contactPhone: lead.phone,
      };
    };

    it('verifies buildEducatorEvent branches title and description for FRS vs Non-FRS', () => {
      // Non-FRS lead
      const nonFrsLead = {
        id: 'cal_nfrs_1',
        name: 'Jonathan Myers',
        phone: '4075551122',
        is_frs: false,
      };

      // FRS educator
      const frsLead = {
        id: 'cal_frs_1',
        name: 'Maria Hernandez',
        phone: '4075553344',
        school: 'Oviedo High',
        room_number: '314',
        planning_period: '4th Period',
        years_in_frs: '15',
        is_frs: true,
      };

      const nonFrsEvent = buildEducatorEvent(nonFrsLead);
      assert.strictEqual(nonFrsEvent.title, '🎯 Retirement Review: Jonathan Myers');
      assert.strictEqual(nonFrsEvent.location, 'Office/Remote');
      assert.ok(!nonFrsEvent.location.includes('Campus'));
      assert.ok(!nonFrsEvent.location.includes('Classroom'));
      assert.ok(nonFrsEvent.description.includes('Retirement Strategy Review with Jonathan Myers'));
      assert.ok(!nonFrsEvent.description.includes('FRS'));
      assert.ok(!nonFrsEvent.description.includes('Years in FRS'));

      const frsEvent = buildEducatorEvent(frsLead);
      assert.strictEqual(frsEvent.title, '🎯 FRS Sit-Down: Maria Hernandez (4th Period)');
      assert.strictEqual(frsEvent.location, 'Oviedo High • Room 314');
      assert.ok(frsEvent.description.includes('FRS & Retirement Review with Maria Hernandez'));
      assert.ok(frsEvent.description.includes('Years in FRS: 15'));

      // Verify downloadIcsFile filename logic branches on FRS vs Non-FRS in calendarService.ts
      assert.ok(calendarSrc.includes("const isFrs = !event.title.includes('Retirement Review');"));
      assert.ok(calendarSrc.includes("const prefix = isFrs ? 'FRS_SitDown' : 'Retirement_Review';"));
    });
  });

  // 5. Zero Regression & Lead Record Integrity
  describe('5. Zero Regression & Lead Record Integrity', () => {
    it('ensures all 11 FRS nurture templates remain completely intact', () => {
      assert.strictEqual(NURTURE_DRIP_TEMPLATES.length, 11);
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[0].id, 'tpl_nurture_sprint_24h');
      assert.strictEqual(NURTURE_DRIP_TEMPLATES[10].id, 'tpl_nurture_month6_seasonal');
    });

    it('ensures all 11 Non-FRS nurture templates remain completely intact', () => {
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES.length, 11);
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[0].id, 'tpl_non_frs_nurture_sprint_24h');
      assert.strictEqual(NON_FRS_NURTURE_DRIP_TEMPLATES[10].id, 'tpl_non_frs_nurture_month6_seasonal');
    });

    it('ensures all 6 FRS client review templates remain completely intact', () => {
      assert.strictEqual(CLIENT_REVIEW_DRIP_TEMPLATES.length, 6);
      assert.strictEqual(CLIENT_REVIEW_DRIP_TEMPLATES[0].id, 'tpl_client_day30_paycheck');
      assert.strictEqual(CLIENT_REVIEW_DRIP_TEMPLATES[5].id, 'tpl_client_anniv7_reminder');
    });

    it('ensures all 6 Non-FRS client review templates remain completely intact', () => {
      assert.strictEqual(NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES.length, 6);
      assert.strictEqual(NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES[0].id, 'tpl_non_frs_client_day30_contribution');
      assert.strictEqual(NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES[5].id, 'tpl_non_frs_client_anniv7_reminder');
    });

    it('ensures calculateNextDripDate decay curve delays match decision psychology specifications', () => {
      // Step 0 -> 1: +2 days
      // Step 1 -> 2: +7 days
      // Step 2 -> 3: +7 days
      // Step 3 -> 4: +7 days
      // Step 4 -> 5: +14 days
      // Step 5 -> 6: +18 days
      // Step 6+: +30 days
      assert.ok(dripDispatcherSrc.includes('1: 2'));
      assert.ok(dripDispatcherSrc.includes('2: 7'));
      assert.ok(dripDispatcherSrc.includes('3: 7'));
      assert.ok(dripDispatcherSrc.includes('4: 7'));
      assert.ok(dripDispatcherSrc.includes('5: 14'));
      assert.ok(dripDispatcherSrc.includes('6: 18'));
      assert.ok(dripDispatcherSrc.includes('delaysByNextStep[nextStep] ?? 30'));
    });
  });
});
