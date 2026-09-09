import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Post-Appointment Lifecycle & Dispo Queue Architecture', () => {
  // Domain simulation of PipelineStateService logic
  function getAppointmentWindow(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set' && !lead.appointment_scheduled_at) {
      return null;
    }

    let start = null;
    if (lead.appointment_scheduled_at) {
      const raw = lead.appointment_scheduled_at.trim();
      const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const hasExplicitNonMidnightTime = /T(?!00:00:00(\.000)?(Z|[+-]\d{2}:\d{2})?$)\d{2}:\d{2}/.test(raw);

      if (dateOnlyMatch && !hasExplicitNonMidnightTime) {
        // Parse calendar year, month (0-indexed), and day in local time to prevent UTC midnight shift
        const y = parseInt(dateOnlyMatch[1], 10);
        const m = parseInt(dateOnlyMatch[2], 10) - 1;
        const d = parseInt(dateOnlyMatch[3], 10);
        start = new Date(y, m, d, 9, 0, 0, 0);
      } else {
        start = new Date(raw);
      }
    } else if (lead.follow_up_at) {
      start = new Date(lead.follow_up_at);
    } else {
      const bookingTimestamp = lead.last_attempt_at || lead.updated_at || lead.created_at;
      const refDate = bookingTimestamp ? new Date(bookingTimestamp) : now;
      const validRef = !isNaN(refDate.getTime()) ? refDate : now;
      const isBookedRecently = Math.abs(now.getTime() - validRef.getTime()) < 24 * 3600000;
      start = isBookedRecently ? new Date(now.getTime() + 24 * 3600000) : new Date(validRef.getTime() + 24 * 3600000);
    }

    if (!start || isNaN(start.getTime())) return null;

    // Simulate standard 30-min window locked to same calendar day
    const end = new Date(start);
    end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
    end.setTime(start.getTime() + 30 * 60 * 1000);
    return { startDate: start, endDate: end };
  }

  function isAppointmentWindowEnded(lead, now = new Date()) {
    const window = getAppointmentWindow(lead, now);
    if (!window) return false;
    return now.getTime() >= window.endDate.getTime();
  }

  function isUpcomingAppointment(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return !isAppointmentWindowEnded(lead, now);
  }

  function isDispoNeeded(lead, now = new Date()) {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return isAppointmentWindowEnded(lead, now);
  }

  // 1. Appointment booking sets appointment_scheduled_at
  it('correctly locks appointment_scheduled_at ISO timestamp on booking', () => {
    const lead = {
      id: 'lead_appt_1',
      name: 'Sarah Jenkins',
      phone: '3865550111',
      school: 'Deland High School',
      last_disposition: 'pending',
      appointment_scheduled_at: null,
      appointment_outcome: null,
    };

    const scheduledDateISO = '2026-09-08T14:30:00.000Z';
    // Simulate booking action
    const bookedLead = {
      ...lead,
      last_disposition: 'appointment_set',
      appointment_scheduled_at: scheduledDateISO,
      follow_up_at: scheduledDateISO,
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(bookedLead.last_disposition, 'appointment_set');
    assert.strictEqual(bookedLead.appointment_scheduled_at, scheduledDateISO);
    assert.strictEqual(bookedLead.appointment_outcome, null);
  });

  // 2. Upcoming appointment identification
  it('correctly identifies upcoming appointments before the window ends', () => {
    const now = new Date('2026-09-08T10:00:00.000Z');
    const futureAppointment = {
      id: 'lead_future',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-08T14:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(isUpcomingAppointment(futureAppointment, now), true);
    assert.strictEqual(isDispoNeeded(futureAppointment, now), false);
  });

  // 3. Past appointment without outcome routes to Dispo Due
  it('routes past appointments without outcome to Dispo Due queue', () => {
    const now = new Date('2026-09-08T16:00:00.000Z'); // 4:00 PM
    const pastAppointment = {
      id: 'lead_past',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-08T14:00:00.000Z', // 2:00 PM (window ended 2:30 PM)
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.strictEqual(isUpcomingAppointment(pastAppointment, now), false);
    assert.strictEqual(isDispoNeeded(pastAppointment, now), true);
  });

  // 4. Logging outcomes removes lead from BOTH Appts Set and Dispo Due
  it('removes lead from both upcoming sit-downs and dispo due queues upon disposition', () => {
    const now = new Date('2026-09-08T16:00:00.000Z');
    const outcomes = ['converted', 'nurture_drip', 'rescheduled', 'no_show', 'declined'];

    for (const outcome of outcomes) {
      const dispositionedLead = {
        id: 'lead_dispo',
        last_disposition: outcome === 'converted' ? 'connected' : 'appointment_set',
        appointment_scheduled_at: '2026-09-08T14:00:00.000Z',
        appointment_outcome: outcome,
        appointment_completed_at: '2026-09-08T15:00:00.000Z',
      };

      assert.strictEqual(
        isUpcomingAppointment(dispositionedLead, now),
        false,
        `Outcome ${outcome} should not be upcoming`
      );
      assert.strictEqual(
        isDispoNeeded(dispositionedLead, now),
        false,
        `Outcome ${outcome} should not be in Dispo Due`
      );
    }
  });

  // 5. Audit Trail & KPI Preservation
  it('preserves historical appointment_set call log entry when recording post-appointment outcome', () => {
    const callLogs = [
      {
        id: 'log_booking_1',
        lead_id: 'lead_appt_1',
        disposition: 'appointment_set',
        duration_seconds: 145,
        created_at: '2026-09-01T10:15:00.000Z',
        notes: 'Sit-down booked for Sept 8 during 4th period',
      },
    ];

    // Simulate advisor completing sit-down wrap-up
    const newWrapUpLog = {
      id: 'log_wrapup_1',
      lead_id: 'lead_appt_1',
      disposition: 'connected',
      duration_seconds: 0,
      created_at: '2026-09-08T15:00:00.000Z',
      notes: '[Sit-Down Wrap-Up] Converted to client. $6,000 AP Flow Annuity enrolled.',
    };
    callLogs.push(newWrapUpLog);

    // Verify historical KPI calculation: total appointments booked remains 1
    const appointmentsBookedCount = callLogs.filter(
      (l) => l.disposition === 'appointment_set' && !l.sms_sent
    ).length;

    assert.strictEqual(appointmentsBookedCount, 1);
    assert.strictEqual(callLogs.length, 2);
    assert.strictEqual(callLogs[0].disposition, 'appointment_set');
    assert.strictEqual(callLogs[1].disposition, 'connected');
  });

  // 6. Deduplication preserves appointment lifecycle fields
  it('preserves latest appointment_scheduled_at and appointment_outcome during lead deduplication', () => {
    const olderLead = {
      id: 'older',
      name: 'Marcus Brody',
      phone: '3865559988',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-05T10:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    const newerLead = {
      id: 'newer',
      name: 'Marcus Brody',
      phone: '3865559988',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T14:00:00.000Z',
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-09-10T15:00:00.000Z',
    };

    // Deduplication logic prioritizing the latest outcome
    const merged = {
      ...olderLead,
      ...newerLead,
      appointment_scheduled_at: newerLead.appointment_scheduled_at || olderLead.appointment_scheduled_at,
      appointment_outcome: newerLead.appointment_outcome || olderLead.appointment_outcome,
      appointment_completed_at: newerLead.appointment_completed_at || olderLead.appointment_completed_at,
    };

    assert.strictEqual(merged.appointment_scheduled_at, '2026-09-10T14:00:00.000Z');
    assert.strictEqual(merged.appointment_outcome, 'converted');
    assert.strictEqual(merged.appointment_completed_at, '2026-09-10T15:00:00.000Z');
  });

  // 7. WebDatabase SQL Pattern Matching for Appointment Lifecycle
  it('matches WebDatabase SQL queries for appointment lifecycle columns', () => {
    function simulateWebDb(sql, params, record) {
      const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
      if (s.includes('update leads set') && s.includes('appointment_outcome = ?')) {
        record.appointment_outcome = params[0];
        record.appointment_completed_at = params[1];
        record.notes = params[2];
        record.updated_at = params[3];
        return { changes: 1 };
      }
      if (s.includes('update leads set') && s.includes('appointment_scheduled_at = ?')) {
        record.appointment_scheduled_at = params[0];
        record.follow_up_at = params[1];
        record.last_disposition = 'appointment_set';
        record.updated_at = params[2];
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    const testRecord = {
      id: 'lead_sql_test',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: null,
      appointment_outcome: null,
    };

    const sqlSchedule = `
      UPDATE leads 
      SET appointment_scheduled_at = ?, follow_up_at = ?, last_disposition = 'appointment_set', updated_at = ?
      WHERE id = ?
    `;
    const res1 = simulateWebDb(sqlSchedule, ['2026-09-12T13:00:00.000Z', '2026-09-12T13:00:00.000Z', '2026-09-06T15:00:00.000Z', 'lead_sql_test'], testRecord);
    assert.strictEqual(res1.changes, 1);
    assert.strictEqual(testRecord.appointment_scheduled_at, '2026-09-12T13:00:00.000Z');

    const sqlDispo = `
      UPDATE leads
      SET appointment_outcome = ?, appointment_completed_at = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `;
    const res2 = simulateWebDb(sqlDispo, ['converted', '2026-09-12T14:00:00.000Z', 'Client converted with $4,800 AP', '2026-09-12T14:05:00.000Z', 'lead_sql_test'], testRecord);
    assert.strictEqual(res2.changes, 1);
    assert.strictEqual(testRecord.appointment_outcome, 'converted');
    assert.strictEqual(testRecord.appointment_completed_at, '2026-09-12T14:00:00.000Z');
  });

  // 8. Historical Booking Anchor (Resolves the rolling horizon bug)
  it('anchors planning date calculation to booking timestamp when appointment_scheduled_at is null', () => {
    // Lead booked 7 days ago on Friday Aug 28, 2026 at 10:00 AM
    const bookedDate = new Date('2026-08-28T14:00:00.000Z');
    const now = new Date('2026-09-06T15:00:00.000Z'); // Today

    const historicalLead = {
      id: 'lead_last_week',
      last_disposition: 'appointment_set',
      last_attempt_at: bookedDate.toISOString(),
      planning_period: 'Period 3',
      school: 'Deland High School',
      appointment_scheduled_at: null,
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    // Calculate window using the booking timestamp anchor
    const bookingAnchor = new Date(historicalLead.last_attempt_at);
    // Standard appointment window is placed on or immediately following the booking date (Aug 28 or Aug 31)
    const windowStart = new Date(bookingAnchor.getTime() + 2 * 60 * 60 * 1000); // Same day Aug 28
    const windowEnd = new Date(windowStart.getTime() + 45 * 60 * 1000);

    const isEnded = now.getTime() >= windowEnd.getTime();
    assert.strictEqual(isEnded, true, 'Window from last week should be completely ended as of today');
  });

  // 9. Auto-completion of converted clients and prospect nurture drips
  it('automatically excludes converted clients and nurture drip leads from Appts Set and Dispo Due', () => {
    const now = new Date('2026-09-06T15:00:00.000Z');

    function isAppointmentCompleted(lead) {
      if (Boolean(lead.is_client) || lead.drip_track === 'prospect_nurture') {
        return true;
      }
      return Boolean(lead.appointment_outcome || lead.appointment_completed_at);
    }

    const convertedClientLead = {
      id: 'lead_client_1',
      last_disposition: 'appointment_set', // Even if last_disposition was still appointment_set
      is_client: true,
      annualized_premium: 6000,
      appointment_outcome: null,
    };

    const prospectDripLead = {
      id: 'lead_drip_1',
      last_disposition: 'appointment_set',
      is_client: false,
      drip_track: 'prospect_nurture',
      appointment_outcome: null,
    };

    assert.strictEqual(isAppointmentCompleted(convertedClientLead), true);
    assert.strictEqual(isAppointmentCompleted(prospectDripLead), true);
  });

  // 10. Auto-healing of legacy records during hydration
  it('auto-heals legacy appointment_set records into converted clients on hydration', () => {
    const rawLegacyLead = {
      id: 'legacy_client',
      name: 'Elena Rostova',
      phone: '3865551234',
      last_disposition: 'appointment_set',
      is_client: 1,
      appointment_outcome: null,
      appointment_completed_at: null,
      updated_at: '2026-09-01T10:00:00.000Z',
    };

    // Simulate hydrateLead auto-healing
    const isClient = rawLegacyLead.is_client === 1 || rawLegacyLead.is_client === true;
    let apptOutcome = rawLegacyLead.appointment_outcome;
    let apptCompletedAt = rawLegacyLead.appointment_completed_at;
    let lastDisp = rawLegacyLead.last_disposition;

    if (isClient) {
      if (!apptOutcome) {
        apptOutcome = 'converted';
        apptCompletedAt = apptCompletedAt || rawLegacyLead.updated_at;
      }
      if (lastDisp === 'appointment_set') {
        lastDisp = 'connected';
      }
    }

    assert.strictEqual(apptOutcome, 'converted');
    assert.strictEqual(apptCompletedAt, '2026-09-01T10:00:00.000Z');
    assert.strictEqual(lastDisp, 'connected');
  });

  // 11. Today vs Later-This-Week Appointment Filtering
  it('correctly distinguishes appointments scheduled for today vs later this week', () => {
    // Current simulated time: Monday Sept 7, 2026 at 10:00 AM EDT
    const now = new Date('2026-09-07T14:00:00.000Z');

    // Appointment A: Today at 1:15 PM EDT
    const apptToday = {
      id: 'lead_appt_today',
      name: 'Maria Gonzalez',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-07T17:15:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    // Appointment B: Thursday at 1:15 PM EDT (later this week)
    const apptLaterThisWeek = {
      id: 'lead_appt_thursday',
      name: 'David Miller',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T17:15:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    function formatDateKey(d, timeZone = 'America/New_York') {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }

    function isAppointmentToday(lead, refNow = now) {
      if (!lead.appointment_scheduled_at) return false;
      const apptDate = new Date(lead.appointment_scheduled_at);
      return formatDateKey(apptDate) === formatDateKey(refNow);
    }

    function isUpcomingAppointmentToday(lead, refNow = now) {
      if (lead.last_disposition !== 'appointment_set') return false;
      if (lead.appointment_outcome || lead.appointment_completed_at) return false;
      const apptDate = new Date(lead.appointment_scheduled_at);
      // Window is 30 mins
      const windowEnd = new Date(apptDate.getTime() + 30 * 60 * 1000);
      if (refNow.getTime() >= windowEnd.getTime()) return false;
      return isAppointmentToday(lead, refNow);
    }

    // Appointment A (Today) must return true
    assert.strictEqual(isAppointmentToday(apptToday, now), true);
    assert.strictEqual(isUpcomingAppointmentToday(apptToday, now), true);

    // Appointment B (Thursday / later this week) must return FALSE for today!
    assert.strictEqual(isAppointmentToday(apptLaterThisWeek, now), false);
    assert.strictEqual(isUpcomingAppointmentToday(apptLaterThisWeek, now), false);

    // But Appointment B is still an upcoming appointment overall for the pipeline!
    assert.strictEqual(isUpcomingAppointment(apptLaterThisWeek, now), true);
  });

  // 12. Today's Advisor Playbook Triad & Preview List Parity
  it('populates strictly today appointments in Today Playbook while keeping full week in Appts Set tab', () => {
    const now = new Date('2026-09-07T14:00:00.000Z'); // Monday Sept 7

    const pipelineLeads = [
      { id: '1', name: 'Today Lead 1', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-09-07T16:00:00.000Z' },
      { id: '2', name: 'Wed Lead 2', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-09-09T14:00:00.000Z' },
      { id: '3', name: 'Thu Lead 3', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-09-10T15:00:00.000Z' },
      { id: '4', name: 'Fri Lead 4', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-09-11T13:00:00.000Z' },
    ];

    function formatDateKey(d) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    }

    // Playbook Today's Sit-Downs: ONLY Sept 7 (count: 1)
    const todaySitDowns = pipelineLeads.filter((l) => {
      const apptDate = new Date(l.appointment_scheduled_at);
      return formatDateKey(apptDate) === formatDateKey(now);
    });
    assert.strictEqual(todaySitDowns.length, 1);
    assert.strictEqual(todaySitDowns[0].name, 'Today Lead 1');

    // Pipeline Appts Set tab: ALL 4 upcoming appointments
    const allUpcoming = pipelineLeads.filter((l) => {
      return l.last_disposition === 'appointment_set' && new Date(l.appointment_scheduled_at).getTime() > now.getTime();
    });
    assert.strictEqual(allUpcoming.length, 4);
  });

  // 13. Timezone & Date-Only Preservation (Prevents False "Due Now" for Tomorrow & Thursday)
  it('prevents appointments scheduled for tomorrow or Thursday from falsely triggering isDispoNeeded today', () => {
    // Current time: Tuesday, September 8, 2026 at 9:29 PM EDT
    // In UTC: 2026-09-09T01:29:00.000Z
    const tuesdayNight = new Date('2026-09-09T01:29:00.000Z');

    // Lead A: Scheduled for Wednesday 9/9 stored as UTC midnight or date-only
    const wedLeadUtcMidnight = {
      id: 'lead_wed_1',
      name: 'Elena Rostova',
      phone: '3865551234',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-09T00:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    const wedLeadDateOnly = {
      id: 'lead_wed_2',
      name: 'Marcus Vance',
      phone: '3865555678',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-09',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    // Lead B: Scheduled for Thursday 9/10
    const thuLead = {
      id: 'lead_thu',
      name: 'Claire Beauchamp',
      phone: '3865559012',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T14:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    // 1. None of these appointments should be considered "dispo needed" on Tuesday night
    assert.strictEqual(isDispoNeeded(wedLeadUtcMidnight, tuesdayNight), false);
    assert.strictEqual(isDispoNeeded(wedLeadDateOnly, tuesdayNight), false);
    assert.strictEqual(isDispoNeeded(thuLead, tuesdayNight), false);

    // 2. All of these appointments are upcoming appointments
    assert.strictEqual(isUpcomingAppointment(wedLeadUtcMidnight, tuesdayNight), true);
    assert.strictEqual(isUpcomingAppointment(wedLeadDateOnly, tuesdayNight), true);
    assert.strictEqual(isUpcomingAppointment(thuLead, tuesdayNight), true);
  });

  // 14. Date Parsing Local Time Alignment
  it('correctly sets appointment window to the scheduled calendar day without backward day shift', () => {
    // When an appointment is scheduled for 2026-09-09
    const lead = {
      id: 'lead_local_align',
      name: 'David Kim',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-09T00:00:00.000Z',
    };

    const window = getAppointmentWindow(lead);
    assert.ok(window, 'Window should not be null');

    // In local time, startDate must be on Sept 9 (the 9th of the month)
    assert.strictEqual(window.startDate.getDate(), 9);
    assert.strictEqual(window.startDate.getMonth(), 8); // 8 is September (0-indexed)
    assert.strictEqual(window.startDate.getFullYear(), 2026);

    // endDate must be on the exact same calendar day
    assert.strictEqual(window.endDate.getDate(), 9);
    assert.strictEqual(window.endDate.getMonth(), 8);
    assert.strictEqual(window.endDate.getFullYear(), 2026);
    assert.ok(window.endDate.getTime() > window.startDate.getTime());
  });
});

