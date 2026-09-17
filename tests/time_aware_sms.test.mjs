import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DateTimeAwareService } from '../src/services/dateTimeAwareService.ts';

describe('Time & Date Aware SMS Composition & Relative Appointment Phrasing', () => {
  // Reference anchor time: Monday, September 7, 2026 at 10:00 AM EDT
  const refMondayMorning = new Date('2026-09-07T14:00:00.000Z'); // 10:00 AM EDT

  // Helper function simulating AiSmsService.getSmartFallbackSMS logic
  function generateSmartFallbackSMS(lead, agentName = 'Alex', toneFocus, refDate = new Date()) {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const school = lead.school || 'your school';
    const planning = lead.planning_period ? ` during ${lead.planning_period}` : ' during your planning period';
    const room = lead.room_number ? ` in Room ${lead.room_number}` : '';

    const apptTokens = DateTimeAwareService.getAppointmentTokens(lead, refDate);
    const hasAppt = apptTokens.hasAppointment;
    const rel = apptTokens.relativeInfo;
    const suggestedOutreach = DateTimeAwareService.getSuggestedOutreachTimeframe(refDate);

    const isApptConfirmation =
      toneFocus === 'meeting_confirmation' ||
      lead.last_disposition === 'appointment_set' ||
      (hasAppt && toneFocus !== 'unanswered_followup' && toneFocus !== 'drop_bonus_focus' && toneFocus !== 'address_question');

    if (isApptConfirmation && rel) {
      if (rel.isToday && !rel.isPast) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Looking forward to our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your FRS numbers! See you soon.`;
      }
      if (rel.isTomorrow) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down tomorrow at ${rel.timeStr}${room}${planning} to review your state pension and DROP numbers. Looking forward to connecting!`;
      }
      if (rel.category === 'this_week') {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your personalized FRS report. Looking forward to meeting!`;
      }
      if (rel.category === 'next_week' || rel.category === 'future_date') {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down on ${rel.fullRelativePhrase}${room}${planning} to review your FRS options. Looking forward to connecting!`;
      }
      if (rel.isPast) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers following up on our sit-down ${rel.shortRelative}${room}. Thank you for your time reviewing your FRS options—please reach out if you have any questions!`;
      }
    }

    const prefSlot =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : `during ${lead.planning_period || 'planning'}`;

    const outreachPhrase = suggestedOutreach.timeframePhrase;

    return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your handwritten FRS Report Card from ${school} and wanted to help review your state pension and retirement options. I'll be on campus ${outreachPhrase}—does ${prefSlot} work for a quick sit-down${planning}${room}?`;
  }

  // Helper function simulating TelephonyService.interpolateTemplate logic
  function interpolateTemplate(template, lead, myName = 'Alex', refDate = new Date()) {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const roomText = lead.room_number ? `Room ${lead.room_number.replace(/^room\s*/i, '')}` : 'your classroom';
    const apptTokens = DateTimeAwareService.getAppointmentTokens(lead, refDate);

    return template.body
      .replace(/{{name}}/gi, () => firstName)
      .replace(/{{first_name}}/gi, () => firstName)
      .replace(/{{room_number}}/gi, () => roomText)
      .replace(/{{appointment_date}}/gi, () => apptTokens.appointmentDate)
      .replace(/{{appointment_time}}/gi, () => apptTokens.appointmentTime)
      .replace(/{{appointment_relative}}/gi, () => apptTokens.appointmentRelative)
      .replace(/{{appointment_day}}/gi, () => apptTokens.appointmentDay)
      .replace(/{{appointment_datetime}}/gi, () => apptTokens.appointmentDatetime)
      .replace(/{{my_name}}/gi, () => myName);
  }

  // 1. Same-Day Future Appointments (LATER TODAY)
  it('correctly classifies same-day future appointment as today_future and generates "later today" phrasing', () => {
    // Appointment scheduled for 2:15 PM EDT today (Sept 7, 2026)
    const apptTodayAfternoon = new Date('2026-09-07T18:15:00.000Z'); // 2:15 PM EDT

    const rel = DateTimeAwareService.getRelativeTimeInfo(apptTodayAfternoon, refMondayMorning, 'America/New_York');

    assert.strictEqual(rel.category, 'today_future');
    assert.strictEqual(rel.isToday, true);
    assert.strictEqual(rel.isTomorrow, false);
    assert.strictEqual(rel.isPast, false);
    assert.strictEqual(rel.timeStr, '2:15 PM');
    assert.ok(
      rel.shortRelative === 'later today' || rel.shortRelative === 'this afternoon',
      `Expected "later today" or "this afternoon", got: ${rel.shortRelative}`
    );
    assert.strictEqual(rel.shortRelative.includes('this week'), false, 'MUST NOT contain "this week"');
    assert.strictEqual(rel.shortRelative.includes('later this week'), false, 'MUST NOT contain "later this week"');

    // Verify Smart Fallback SMS generated for this lead
    const lead = {
      id: 'lead_today_1',
      name: 'Jennifer Walsh',
      school: 'Spruce Creek High',
      room_number: '204',
      planning_period: 'Period 4 (1:15 PM - 2:05 PM)',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-07T18:15:00.000Z',
    };

    const sms = generateSmartFallbackSMS(lead, 'Alex', 'meeting_confirmation', refMondayMorning);

    assert.ok(sms.includes('Jennifer'), 'Must address educator by first name');
    assert.ok(sms.includes('2:15 PM'), 'Must include exact appointment time');
    assert.ok(sms.includes('Room 204'), 'Must mention room number');
    assert.ok(
      sms.includes('later today') || sms.includes('this afternoon'),
      `Expected SMS to say "later today" or "this afternoon", got: "${sms}"`
    );
    assert.strictEqual(sms.includes('this week'), false, 'SMS must NEVER say "this week" for today appointments');
    assert.strictEqual(sms.includes('later this week'), false, 'SMS must NEVER say "later this week" for today appointments');
  });

  // 2. Same-Day Past Appointments (EARLIER TODAY)
  it('correctly classifies same-day past appointment as today_past and generates "earlier today" follow-up', () => {
    // Reference: Monday, Sept 7, 2026 at 4:00 PM EDT
    const refMondayLate = new Date('2026-09-07T20:00:00.000Z');
    // Appointment was at 10:15 AM EDT
    const apptEarlierToday = new Date('2026-09-07T14:15:00.000Z');

    const rel = DateTimeAwareService.getRelativeTimeInfo(apptEarlierToday, refMondayLate, 'America/New_York');

    assert.strictEqual(rel.category, 'today_past');
    assert.strictEqual(rel.isToday, true);
    assert.strictEqual(rel.isPast, true);
    assert.strictEqual(rel.shortRelative, 'earlier today');

    const lead = {
      id: 'lead_past_1',
      name: 'Carlos Mendez',
      school: 'Deltona High',
      room_number: '112',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-07T14:15:00.000Z',
    };

    const sms = generateSmartFallbackSMS(lead, 'Alex', 'meeting_confirmation', refMondayLate);
    assert.ok(sms.includes('earlier today'), `Expected "earlier today" in post-meeting follow-up, got: "${sms}"`);
    assert.strictEqual(sms.includes('later this week'), false);
  });

  // 3. Tomorrow Appointments
  it('correctly classifies tomorrow appointment and generates "tomorrow at [time]" phrasing', () => {
    // Tuesday Sept 8 at 10:15 AM EDT
    const apptTomorrow = new Date('2026-09-08T14:15:00.000Z');

    const rel = DateTimeAwareService.getRelativeTimeInfo(apptTomorrow, refMondayMorning, 'America/New_York');

    assert.strictEqual(rel.category, 'tomorrow');
    assert.strictEqual(rel.isToday, false);
    assert.strictEqual(rel.isTomorrow, true);
    assert.strictEqual(rel.timeStr, '10:15 AM');
    assert.strictEqual(rel.shortRelative, 'tomorrow');

    const lead = {
      id: 'lead_tomorrow_1',
      name: 'Amanda Hayes',
      school: 'University High',
      room_number: '305',
      planning_period: 'Period 2',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-08T14:15:00.000Z',
    };

    const sms = generateSmartFallbackSMS(lead, 'Alex', 'meeting_confirmation', refMondayMorning);
    assert.ok(sms.includes('tomorrow at 10:15 AM'), `Expected "tomorrow at 10:15 AM", got: "${sms}"`);
    assert.strictEqual(sms.includes('this week'), false);
    assert.strictEqual(sms.includes('later this week'), false);
  });

  // 4. Later This Week Appointments (e.g. Thursday)
  it('correctly names specific day of week for appointments later this week', () => {
    // Thursday Sept 10 at 1:30 PM EDT (same school work week)
    const apptThursday = new Date('2026-09-10T17:30:00.000Z');

    const rel = DateTimeAwareService.getRelativeTimeInfo(apptThursday, refMondayMorning, 'America/New_York');

    assert.strictEqual(rel.category, 'this_week');
    assert.strictEqual(rel.isToday, false);
    assert.strictEqual(rel.isTomorrow, false);
    assert.strictEqual(rel.shortRelative, 'this Thursday');
    assert.strictEqual(rel.fullRelativePhrase, 'this Thursday at 1:30 PM');

    const lead = {
      id: 'lead_thu_1',
      name: 'David Miller',
      school: 'Atlantic High',
      room_number: '104',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T17:30:00.000Z',
    };

    const sms = generateSmartFallbackSMS(lead, 'Alex', 'meeting_confirmation', refMondayMorning);
    assert.ok(sms.includes('this Thursday at 1:30 PM'), `Expected "this Thursday at 1:30 PM", got: "${sms}"`);
  });

  // 5. Next Week Appointments
  it('correctly indicates "next [DayOfWeek]" for appointments in the following school week', () => {
    // Next Tuesday Sept 15 at 11:00 AM EDT (8 days away)
    const apptNextTuesday = new Date('2026-09-15T15:00:00.000Z');

    const rel = DateTimeAwareService.getRelativeTimeInfo(apptNextTuesday, refMondayMorning, 'America/New_York');

    assert.strictEqual(rel.category, 'future_date');
    assert.strictEqual(rel.isToday, false);
    assert.strictEqual(rel.isTomorrow, false);
    assert.ok(rel.fullRelativePhrase.includes('Tuesday'), `Expected Tuesday in phrase, got: ${rel.fullRelativePhrase}`);
    assert.ok(rel.fullRelativePhrase.includes('Sep 15'), `Expected Sep 15 in phrase, got: ${rel.fullRelativePhrase}`);
  });

  // 6. Friday Afternoon Outreach Awareness (Unscheduled)
  it('avoids "this week" or "tomorrow" on Friday afternoons and suggests early next week', () => {
    // Friday Sept 11, 2026 at 2:00 PM EDT
    const fridayAfternoon = new Date('2026-09-11T18:00:00.000Z');

    const outreach = DateTimeAwareService.getSuggestedOutreachTimeframe(fridayAfternoon, 'America/New_York');

    assert.strictEqual(outreach.timeframePhrase, 'early next week');
    assert.strictEqual(outreach.timeframePhrase.includes('this week'), false);

    const unscheduledLead = {
      id: 'lead_unscheduled_fri',
      name: 'Rebecca Soto',
      school: 'Heritage Middle',
      planning_period: 'Period 3',
      last_disposition: 'no_answer',
    };

    const sms = generateSmartFallbackSMS(unscheduledLead, 'Alex', undefined, fridayAfternoon);
    assert.ok(sms.includes('early next week'), `Expected "early next week" on Friday, got: "${sms}"`);
    assert.strictEqual(sms.includes('this week'), false, 'Must not say "this week" on Friday afternoon');
  });

  // 7. Telephony Dynamic Template Tokens Interpolation
  it('interpolates appointment temporal tokens in SMSTemplates with precise relative phrasing', () => {
    const template = {
      id: 'tpl_appt_test',
      title: 'Sit-Down Confirmation',
      body: 'Hi {{first_name}}, this is {{my_name}} with ValuTeachers. Confirming our sit-down {{appointment_relative}} at {{appointment_time}} in {{room_number}}!',
    };

    // Scenario A: Appointment later today
    const leadToday = {
      id: 'lead_token_today',
      name: 'Maria Gonzalez',
      room_number: '108',
      appointment_scheduled_at: '2026-09-07T19:00:00.000Z', // 3:00 PM EDT
    };

    const textToday = interpolateTemplate(template, leadToday, 'Alex', refMondayMorning);
    assert.ok(
      textToday.includes('later today') || textToday.includes('this afternoon'),
      `Expected later today or this afternoon, got: "${textToday}"`
    );
    assert.ok(textToday.includes('3:00 PM'), `Expected 3:00 PM, got: "${textToday}"`);
    assert.ok(textToday.includes('Room 108'), `Expected Room 108, got: "${textToday}"`);
    assert.strictEqual(textToday.includes('this week'), false);

    // Scenario B: Appointment tomorrow
    const leadTomorrow = {
      id: 'lead_token_tomorrow',
      name: 'Robert Vance',
      room_number: '310',
      appointment_scheduled_at: '2026-09-08T15:30:00.000Z', // 11:30 AM EDT
    };

    const textTomorrow = interpolateTemplate(template, leadTomorrow, 'Alex', refMondayMorning);
    assert.ok(textTomorrow.includes('tomorrow at 11:30 AM'), `Expected "tomorrow at 11:30 AM", got: "${textTomorrow}"`);
    assert.ok(textTomorrow.includes('Room 310'));
    assert.strictEqual(textTomorrow.includes('this week'), false);
  });
});
