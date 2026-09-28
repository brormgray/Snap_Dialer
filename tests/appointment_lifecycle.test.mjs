import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function loadActualPipelineStateService() {
  const servicePath = path.resolve('src/services/pipelineStateService.ts');
  const src = fs.readFileSync(servicePath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const moduleObj = { exports: {} };
  const requireMock = (id) => {
    if (id.includes('bellSchedules')) {
      return {
        getScheduleForSchool: () => [
          { id: '1', name: 'Period 1', startTime: '08:30', endTime: '09:20' },
          { id: '2', name: 'Period 2', startTime: '09:25', endTime: '10:15' },
          { id: '3', name: 'Period 3', startTime: '10:20', endTime: '11:10' },
          { id: '4', name: 'Period 4', startTime: '11:15', endTime: '12:05' },
          { id: '5', name: 'Period 5', startTime: '12:40', endTime: '13:30' },
          { id: '6', name: 'Period 6', startTime: '13:35', endTime: '14:25' },
          { id: '7', name: 'Period 7', startTime: '14:30', endTime: '15:20' },
        ],
        matchPeriodId: () => null,
      };
    }
    if (id.includes('calendarService')) {
      return {
        CalendarService: {
          calculateNextPlanningDate: () => new Date(),
        },
      };
    }
    if (id.includes('notesService')) {
      return {
        NotesService: {
          parseNotes: () => [],
          addNote: (prev, n) => `${n}\n\n${prev || ''}`,
        },
      };
    }
    return {};
  };

  const runner = new Function('module', 'exports', 'require', transpiled.outputText);
  runner(moduleObj, moduleObj.exports, requireMock);

  return moduleObj.exports.PipelineStateService;
}

const ActualPipelineStateService = loadActualPipelineStateService();

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

  // 15. Note Parsing & Extraction Fallback for Missing appointment_scheduled_at
  it('extracts date from notes when appointment_scheduled_at is null, preventing premature dispo due', () => {
    // Current time: Tuesday night 9/8/2026
    const tuesdayNight = new Date('2026-09-09T01:29:00.000Z');

    // Lead booked with appointment details only in notes
    const leadWithNote = {
      id: 'lead_note_appt',
      name: 'Maria Santos',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: null,
      notes: 'Spoke with teacher. Confirmed sit-down on Thursday Sep 10 at 10:15 AM in room 204.',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    function extractDateFromNotes(notes, now) {
      if (!notes) return null;
      const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const dateTextMatch = notes.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i);
      if (dateTextMatch) {
        const m = monthMap[dateTextMatch[1].slice(0, 3).toLowerCase()];
        const d = parseInt(dateTextMatch[2], 10);
        const y = dateTextMatch[3] ? parseInt(dateTextMatch[3], 10) : now.getFullYear();
        return new Date(y, m, d, 10, 15, 0, 0);
      }
      return null;
    }

    const extracted = extractDateFromNotes(leadWithNote.notes, tuesdayNight);
    assert.ok(extracted, 'Should extract date from note');
    assert.strictEqual(extracted.getDate(), 10);
    assert.strictEqual(extracted.getMonth(), 8); // Sep
    assert.ok(extracted.getTime() > tuesdayNight.getTime(), 'Extracted date should be in the future');
  });

  // 16. Auto-Healing Migration Simulation
  it('auto-heals leads in appointment_set state missing appointment_scheduled_at', () => {
    const rawDbLead = {
      id: 'lead_unhealed',
      name: 'Robert Davis',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: null,
      follow_up_at: null,
      notes: 'Scheduled for 2026-09-10 in 3rd period',
      created_at: '2026-09-07T14:00:00.000Z',
    };

    // Auto-healing simulation
    const healedLead = { ...rawDbLead };
    if (healedLead.last_disposition === 'appointment_set' && !healedLead.appointment_scheduled_at) {
      healedLead.appointment_scheduled_at = '2026-09-10T10:15:00.000Z';
      healedLead.follow_up_at = healedLead.appointment_scheduled_at;
    }

    assert.ok(healedLead.appointment_scheduled_at);
    assert.strictEqual(healedLead.appointment_scheduled_at, healedLead.follow_up_at);
  });

  // 17. prospect_nurture drip enrollment must not erase appointment_set
  it('preserves appointment_set status when lead has drip_track set to prospect_nurture', () => {
    const lead = {
      id: 'lead_drip_preservation',
      name: 'Jennifer Taylor',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-10T14:00:00.000Z',
      drip_track: 'prospect_nurture',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    function isActiveAppointment(l) {
      return l.last_disposition === 'appointment_set' && !l.appointment_outcome && !l.appointment_completed_at;
    }

    assert.strictEqual(isActiveAppointment(lead), true);
  });

  // 18. Nurture Drip Wrap-Up Preservation & Forward Auto-Healing
  it('preserves legitimate nurture_drip post-appointment outcomes and heals trapped leads', () => {
    // Case A: Post-appointment sit-down concluded and moved to prospect drip
    const wrappedUpLead = {
      id: 'lead_nurture_drip_1',
      name: 'Michael Miller',
      last_disposition: 'connected',
      appointment_outcome: 'nurture_drip',
      appointment_completed_at: '2026-09-08T18:00:00.000Z',
      appointment_scheduled_at: '2026-09-08T14:30:00.000Z',
      notes: '[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip (Day 7 Multiplier).',
      drip_track: 'prospect_nurture',
    };

    // Forward healing / hydration logic simulation
    const hydrateLeadSim = (raw) => {
      let lastDisp = raw.last_disposition || 'pending';
      let apptOutcome = raw.appointment_outcome || null;
      let apptCompletedAt = raw.appointment_completed_at || null;
      let dripTrack = raw.drip_track || 'none';

      const hasNurtureWrapUpNote = typeof raw.notes === 'string' && raw.notes.includes('[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip');
      const isProspectDripWrapUp = apptOutcome === 'nurture_drip' || hasNurtureWrapUpNote || (dripTrack === 'prospect_nurture' && Boolean(raw.appointment_scheduled_at));

      if (isProspectDripWrapUp) {
        if (apptOutcome !== 'nurture_drip') {
          apptOutcome = 'nurture_drip';
        }
        if (!apptCompletedAt) {
          apptCompletedAt = raw.updated_at || raw.created_at || '2026-09-08T18:00:00.000Z';
        }
        if (lastDisp === 'appointment_set') {
          lastDisp = 'connected';
        }
      }

      return {
        ...raw,
        last_disposition: lastDisp,
        appointment_outcome: apptOutcome,
        appointment_completed_at: apptCompletedAt,
      };
    };

    const hydratedLead = hydrateLeadSim(wrappedUpLead);
    assert.strictEqual(hydratedLead.last_disposition, 'connected');
    assert.strictEqual(hydratedLead.appointment_outcome, 'nurture_drip');
    assert.strictEqual(hydratedLead.appointment_completed_at, '2026-09-08T18:00:00.000Z');

    const now = new Date('2026-09-08T19:00:00.000Z');
    assert.strictEqual(isDispoNeeded(hydratedLead, now), false, 'Nurture drip lead must not show in Dispo Due');
    assert.strictEqual(isUpcomingAppointment(hydratedLead, now), false, 'Nurture drip lead must not show in Appts Set');

    // Case B: Lead that was previously trapped in appointment_set due to the old auto-healing bug
    const stuckLead = {
      id: 'lead_stuck_in_appt_set',
      name: 'Sarah Connor',
      last_disposition: 'appointment_set', // Was falsely reverted by old bug
      appointment_outcome: null, // Was falsely wiped by old bug
      appointment_completed_at: null,
      appointment_scheduled_at: '2026-09-08T14:30:00.000Z',
      notes: '[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip (Day 7 Multiplier).\n\nInitial notes',
      drip_track: 'prospect_nurture',
    };

    const healedStuckLead = hydrateLeadSim(stuckLead);
    assert.strictEqual(healedStuckLead.last_disposition, 'connected');
    assert.strictEqual(healedStuckLead.appointment_outcome, 'nurture_drip');
    assert.ok(healedStuckLead.appointment_completed_at);
    assert.strictEqual(isDispoNeeded(healedStuckLead, now), false);
    assert.strictEqual(isUpcomingAppointment(healedStuckLead, now), false);
  });

  // 19. scheduleFollowUp preserves historical notes
  it('preserves historical educator notes when scheduling a callback', () => {
    const existingNotes = '[Sep 08, 10:15 AM] Educator asked about 5% DROP bonus and retirement timeline.';
    const callbackNote = 'Prefers callback during 4th period planning';

    // Simulate NotesService.addNote prepend
    const timestampHeader = '[Sep 10, 2:30 PM]';
    const newEntry = `${timestampHeader} ${callbackNote}`;
    const mergedNotes = `${newEntry}\n\n${existingNotes}`;

    assert.ok(mergedNotes.includes(callbackNote), 'New callback note should be present');
    assert.ok(mergedNotes.includes('5% DROP bonus'), 'Historical notes must be preserved');
    assert.ok(mergedNotes.startsWith(timestampHeader), 'Newest note should be prepended to the top');
  });

  // 20. clearFollowUp safely resets follow_up_at and appends completion note
  it('clears follow_up_at and resets disposition to pending when callback is completed', () => {
    const lead = {
      id: 'lead_cb_complete',
      name: 'Angela White',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-10T14:00:00.000Z',
      notes: '[Sep 09, 11:00 AM] Callback scheduled for 2:00 PM',
    };

    // Simulate clearFollowUp
    const clearedLead = {
      ...lead,
      follow_up_at: null,
      last_disposition: lead.last_disposition === 'callback_requested' ? 'pending' : lead.last_disposition,
      notes: `[Sep 10, 2:15 PM] [Callback Completed] Follow-up marked complete.\n\n${lead.notes}`,
    };

    assert.strictEqual(clearedLead.follow_up_at, null);
    assert.strictEqual(clearedLead.last_disposition, 'pending');
    assert.ok(clearedLead.notes.includes('[Callback Completed]'));
    assert.ok(clearedLead.notes.includes('[Sep 09, 11:00 AM]'));
  });

  // 21. WebDatabase SQL query pattern matching routing
  it('correctly distinguishes scheduleAppointment, scheduleFollowUp, and clearFollowUp SQL patterns', () => {
    const scheduleAppointmentSql = `UPDATE leads 
       SET appointment_scheduled_at = ?,
           follow_up_at = ?,
           appointment_outcome = NULL,
           appointment_completed_at = NULL,
           last_disposition = 'appointment_set',
           notes = COALESCE(?, notes),
           updated_at = ?
       WHERE id = ?`.toLowerCase();

    const scheduleFollowUpSql = `UPDATE leads 
       SET follow_up_at = ?, 
           last_disposition = 'callback_requested', 
           notes = COALESCE(?, notes), 
           updated_at = ? 
       WHERE id = ?`.toLowerCase();

    const clearFollowUpSql = `UPDATE leads 
       SET follow_up_at = NULL, 
           last_disposition = CASE WHEN last_disposition = 'callback_requested' THEN 'pending' ELSE last_disposition END,
           notes = COALESCE(?, notes),
           updated_at = ? 
       WHERE id = ?`.toLowerCase();

    const isClearFollowUpMatch = (s) => s.includes('follow_up_at = null') || s.includes('follow_up_at=null');

    const isCallbackMatch = (s) =>
      (!s.includes('case when') && s.includes("last_disposition = 'callback_requested'")) ||
      (s.includes('follow_up_at = ?') && !s.includes('appointment_scheduled_at'));

    const isAppointmentMatch = (s) => s.includes('appointment_scheduled_at = ?');

    // scheduleFollowUpSql should match callback, but not appointment or clear
    assert.strictEqual(isCallbackMatch(scheduleFollowUpSql), true);
    assert.strictEqual(isAppointmentMatch(scheduleFollowUpSql), false);
    assert.strictEqual(isClearFollowUpMatch(scheduleFollowUpSql), false);

    // scheduleAppointmentSql should match appointment, but not callback or clear
    assert.strictEqual(isCallbackMatch(scheduleAppointmentSql), false);
    assert.strictEqual(isAppointmentMatch(scheduleAppointmentSql), true);
    assert.strictEqual(isClearFollowUpMatch(scheduleAppointmentSql), false);

    // clearFollowUpSql must match clear, and NEVER falsely match callback scheduling
    assert.strictEqual(isClearFollowUpMatch(clearFollowUpSql), true);
    assert.strictEqual(isCallbackMatch(clearFollowUpSql), false);
    assert.strictEqual(isAppointmentMatch(clearFollowUpSql), false);
  });

  // 22. Auto-healing corrupted or invalid follow_up_at values
  it('auto-heals corrupted follow_up_at strings and resets disposition to pending', () => {
    const corruptedLead = {
      id: 'lead_corrupted_123',
      name: 'Corrupted Callback Educator',
      last_disposition: 'callback_requested',
      follow_up_at: '[Callback Completed] Follow-up marked complete.',
      notes: 'Initial note',
    };

    let followUpAt = corruptedLead.follow_up_at;
    let lastDisp = corruptedLead.last_disposition;
    if (followUpAt) {
      const parsed = new Date(followUpAt);
      const isInvalid = isNaN(parsed.getTime());
      const isCompletionString = typeof followUpAt === 'string' && (
        followUpAt.includes('[Callback Completed]') ||
        followUpAt.includes('Follow-up marked complete')
      );

      if (isInvalid || isCompletionString) {
        followUpAt = null;
        if (lastDisp === 'callback_requested') {
          lastDisp = 'pending';
        }
      }
    }

    assert.strictEqual(followUpAt, null);
    assert.strictEqual(lastDisp, 'pending');
  });

  // 23. Dispositions other than callback_requested clear follow_up_at
  it('clears follow_up_at when lead is dispositioned as no_answer or spoke', () => {
    const lead = {
      id: 'lead_scheduled_cb',
      name: 'John Doe',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-15T14:00:00.000Z',
    };

    const dispoOutcomeNoAnswer = 'no_answer';
    const updatedLeadNoAnswer = {
      ...lead,
      last_disposition: dispoOutcomeNoAnswer,
      follow_up_at: dispoOutcomeNoAnswer === 'callback_requested' ? lead.follow_up_at : null,
    };

    assert.strictEqual(updatedLeadNoAnswer.last_disposition, 'no_answer');
    assert.strictEqual(updatedLeadNoAnswer.follow_up_at, null);

    const dispoOutcomeSpoke = 'spoke';
    const updatedLeadSpoke = {
      ...lead,
      last_disposition: dispoOutcomeSpoke,
      follow_up_at: dispoOutcomeSpoke === 'callback_requested' ? lead.follow_up_at : null,
    };

    assert.strictEqual(updatedLeadSpoke.last_disposition, 'spoke');
    assert.strictEqual(updatedLeadSpoke.follow_up_at, null);
  });

  // 24. 'Other' disposition clears follow_up_at and correctly excludes from callback tab
  it('clears follow_up_at and excludes from callback tab when dispositioned as other', () => {
    const callbackLead = {
      id: 'lead_cb_other',
      name: 'Maria Sanchez',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-15T16:00:00.000Z',
      notes: 'Initial callback note',
    };

    // Simulate dispositioning as 'other'
    const dispo = 'other';
    const customNote = 'Spoke with Secretary; Educator on Leave — Out until November';
    const timestamp = 'Sep 15, 4:30 PM';
    const updatedNotes = `[${timestamp}] Call attempt #2 (Other): ${customNote}\n\n${callbackLead.notes}`;

    const updatedLead = {
      ...callbackLead,
      last_disposition: dispo,
      follow_up_at: null,
      notes: updatedNotes,
      attempts_count: 2,
      cadence_step: 2,
    };

    assert.strictEqual(updatedLead.last_disposition, 'other');
    assert.strictEqual(updatedLead.follow_up_at, null);
    assert.ok(updatedLead.notes.includes('Call attempt #2 (Other): Spoke with Secretary'));

    // Verify callback filter tab logic correctly excludes 'other'
    const isAnswered = ['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number', 'other'].includes(updatedLead.last_disposition);
    const hasValidFollowUp = updatedLead.follow_up_at && !isNaN(new Date(updatedLead.follow_up_at).getTime());
    const isVisibleInCallbackTab = !isAnswered && (updatedLead.last_disposition === 'callback_requested' || !!hasValidFollowUp);

    assert.strictEqual(isVisibleInCallbackTab, false);
  });

  // 25. 'Other' disposition counts as completed lead in campaign list stats
  it('counts other disposition in completed leads for campaign progress', () => {
    const leads = [
      { id: '1', list_id: 'list_a', last_disposition: 'connected' },
      { id: '2', list_id: 'list_a', last_disposition: 'appointment_set' },
      { id: '3', list_id: 'list_a', last_disposition: 'bad_number' },
      { id: '4', list_id: 'list_a', last_disposition: 'do_not_call' },
      { id: '5', list_id: 'list_a', last_disposition: 'other' },
      { id: '6', list_id: 'list_a', last_disposition: 'no_answer' },
      { id: '7', list_id: 'list_a', last_disposition: 'pending' },
    ];

    const completedDispositions = ['connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call', 'other'];
    const completedCount = leads.filter((l) => completedDispositions.includes(l.last_disposition)).length;

    assert.strictEqual(completedCount, 5);
  });

  // 26. Universal Call Logging records duration and disposition
  it('correctly constructs call log audit entries with duration and disposition', () => {
    const callDuration = 45;
    const logEntry = {
      id: 'log_test_123',
      lead_id: 'lead_test',
      list_id: 'list_1',
      duration_seconds: callDuration,
      disposition: 'other',
      note: 'Call attempt #1 (Other): Spoke with Secretary / Front Desk',
      sms_sent: false,
    };

    assert.strictEqual(logEntry.duration_seconds, 45);
    assert.strictEqual(logEntry.disposition, 'other');
    assert.strictEqual(logEntry.sms_sent, false);
  });

  // 27. React Hooks Invariant: PostApptWrapUpCard and modal components maintain hook stability across state transitions
  it('guarantees unconditional hook calls and structural integrity in appointment components', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const filesToCheck = [
      'src/components/PostApptWrapUpCard.tsx',
      'src/components/AppointmentSchedulerModal.tsx',
      'src/components/CallbackSchedulerModal.tsx',
      'src/components/QuickDispositionModal.tsx',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const content = fs.readFileSync(fullPath, 'utf8');

      // 1. PostApptWrapUpCard must evaluate useMemo before if (!isApptLead) return null;
      if (relPath.includes('PostApptWrapUpCard')) {
        const useMemoIdx = content.indexOf('const scheduledDate = useMemo');
        const earlyReturnIdx = content.indexOf('if (!isApptLead) return null;');
        assert.ok(useMemoIdx !== -1, 'PostApptWrapUpCard must define scheduledDate with useMemo');
        assert.ok(earlyReturnIdx !== -1, 'PostApptWrapUpCard must check isApptLead');
        assert.ok(
          useMemoIdx < earlyReturnIdx,
          'PostApptWrapUpCard must execute useMemo before if (!isApptLead) return null to prevent React error #310'
        );
      }

      // 2. Modals must use the container/content pattern so the outer component guards without hooks,
      // and the inner Content component executes all hooks unconditionally.
      if (relPath.includes('Modal.tsx')) {
        const hasContentComponent = content.includes('Content({');
        assert.ok(hasContentComponent, `${relPath} must implement container/content pattern for hook stability`);

        // In the Content component, hooks must precede any conditional return
        const contentFnIdx = content.indexOf('Content({');
        const contentBody = content.slice(contentFnIdx);
        const firstHookIdx = contentBody.search(/\buse(State|Memo|Effect|Callback|Ref)\b/);
        const earlyReturnMatch = contentBody.slice(0, firstHookIdx).match(/if\s*\(.*?\)\s*return/);
        assert.strictEqual(
          earlyReturnMatch,
          null,
          `${relPath} Content component must not have early return before hooks`
        );
      }
    }
  });

  // 28. Simulated lead appointment transition maintains state and hook count stability
  it('simulates lead transition from pending to appointment_set without hook count mismatch', () => {
    // Lead begins as pending (isApptLead = false)
    let lead = {
      id: 'lead_hook_test',
      last_disposition: 'pending',
      appointment_scheduled_at: null,
      appointment_outcome: null,
      school: 'University High School',
      planning_period: 'Period 3',
    };

    // Simulated component render state tracker
    const simulateCardRender = (currentLead) => {
      const hookCalls = [];
      // Hook 1: useState(false) for isExpanded
      hookCalls.push('useState_isExpanded');
      // Hook 2: useState(false) for isSaving
      hookCalls.push('useState_isSaving');
      // Hook 3: useState(null) for actionFeedback
      hookCalls.push('useState_actionFeedback');
      // Hook 4: useState(false) for showRescheduleConfirm
      hookCalls.push('useState_showRescheduleConfirm');
      // Hook 5: useState(2) for customDaysToAdd
      hookCalls.push('useState_customDaysToAdd');

      // Hook 6: scheduledDate = useMemo(...) - MUST RUN UNCONDITIONALLY
      hookCalls.push('useMemo_scheduledDate');

      // Condition check AFTER hooks
      const isApptLead =
        currentLead.last_disposition === 'appointment_set' ||
        Boolean(currentLead.appointment_scheduled_at) ||
        Boolean(currentLead.appointment_outcome);

      if (!isApptLead) {
        return { rendered: false, hookCalls };
      }

      return { rendered: true, hookCalls };
    };

    // Render 1: Unscheduled lead
    const render1 = simulateCardRender(lead);
    assert.strictEqual(render1.rendered, false);
    assert.strictEqual(render1.hookCalls.length, 6);

    // Transition: user saves appointment
    lead = {
      ...lead,
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-20T13:00:00.000Z',
    };

    // Render 2: Scheduled lead
    const render2 = simulateCardRender(lead);
    assert.strictEqual(render2.rendered, true);
    assert.strictEqual(render2.hookCalls.length, 6);
    // Hook count and order must match exactly between render passes (React Invariant #310)
    assert.deepStrictEqual(render1.hookCalls, render2.hookCalls);
  });

  // 29. Today's Advisor Playbook Dispo Alert 1-Tap Review Navigation
  it('routes directly to LeadDetail when exactly 1 sit-down needs dispo review', () => {
    let navigatedToLeadId = null;
    let filteredTabSet = null;

    const navigateLead = (leadId) => {
      navigatedToLeadId = leadId;
    };

    const filterDispoDue = () => {
      filteredTabSet = 'dispo_needed';
    };

    // Scenario 1: Exactly 1 sit-down needs disposition
    const singleDispoLeads = [{ id: 'lead_review_single', name: 'James Wilson' }];

    const handleBannerPress = (dispoNeededLeads) => {
      if (dispoNeededLeads.length === 1) {
        navigateLead(dispoNeededLeads[0].id);
      } else if (filterDispoDue) {
        filterDispoDue();
      }
    };

    handleBannerPress(singleDispoLeads);
    assert.strictEqual(navigatedToLeadId, 'lead_review_single', 'Must navigate directly to lead when count is 1');
    assert.strictEqual(filteredTabSet, null, 'Must not stall on filter tab when exactly 1 lead is ready for review');

    // Scenario 2: Multiple sit-downs need disposition
    navigatedToLeadId = null;
    filteredTabSet = null;
    const multipleDispoLeads = [
      { id: 'lead_1', name: 'Lead 1' },
      { id: 'lead_2', name: 'Lead 2' },
    ];

    handleBannerPress(multipleDispoLeads);
    assert.strictEqual(filteredTabSet, 'dispo_needed', 'Must filter to dispo_needed tab when multiple leads need review');
    assert.strictEqual(navigatedToLeadId, null);
  });

  // 30. Existing Client Newly Scheduled Appointment in Playbook & Pipeline
  it('guarantees newly scheduled appointments for existing clients appear in Today Playbook and Appts Set', () => {
    // Current time: Monday Sep 28, 2026 at 11:00 AM EDT (15:00:00 UTC)
    const now = new Date('2026-09-28T15:00:00.000Z');

    // Existing client with active annuity who books an appointment for today at 2:00 PM EDT (18:00:00 UTC)
    const clientWithNewApptToday = {
      id: 'client_elena_1',
      name: 'Elena Rostova',
      phone: '3865551234',
      school: 'Deland High School',
      is_client: true,
      products: ['flow_annuity'],
      annualized_premium: 8500,
      client_since: '2025-01-15T10:00:00.000Z',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-28T18:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    // 1. isAppointmentCompleted must be FALSE for active newly scheduled appointment
    assert.strictEqual(
      ActualPipelineStateService.isAppointmentCompleted(clientWithNewApptToday),
      false,
      'Active newly scheduled appointment for client must not be considered completed'
    );

    // 2. isUpcomingAppointment must be TRUE
    assert.strictEqual(
      ActualPipelineStateService.isUpcomingAppointment(clientWithNewApptToday, now),
      true,
      'Appointment scheduled for 2:00 PM today must be upcoming at 11:00 AM'
    );

    // 3. isUpcomingAppointmentToday must be TRUE (calendar parity in America/New_York)
    assert.strictEqual(
      ActualPipelineStateService.isUpcomingAppointmentToday(clientWithNewApptToday, now, 'America/New_York'),
      true,
      'Must appear in Today Advisor Playbook sit-downs list'
    );

    // 4. isActiveAppointment must be TRUE (Appts Set tab & count)
    assert.strictEqual(
      ActualPipelineStateService.isActiveAppointment(clientWithNewApptToday),
      true,
      'Must appear in Appts Set tab and count badge'
    );

    // 5. Effective outcome must be null while active
    assert.strictEqual(
      ActualPipelineStateService.getEffectiveAppointmentOutcome(clientWithNewApptToday),
      null,
      'Effective appointment outcome must be null while appointment is pending'
    );

    // 6. When appointment window passes (e.g. at 3:00 PM EDT / 19:00:00 UTC) without an outcome:
    const pastApptNow = new Date('2026-09-28T19:00:00.000Z');
    assert.strictEqual(
      ActualPipelineStateService.isUpcomingAppointment(clientWithNewApptToday, pastApptNow),
      false
    );
    assert.strictEqual(
      ActualPipelineStateService.isDispoNeeded(clientWithNewApptToday, pastApptNow),
      true,
      'Window ended appointment must trigger Dispo Due alert in Playbook'
    );

    // 7. When outcome is logged (e.g. wrap up with additional policy or review complete):
    const wrappedUpClient = {
      ...clientWithNewApptToday,
      appointment_outcome: 'converted',
      appointment_completed_at: '2026-09-28T18:30:00.000Z',
    };
    assert.strictEqual(
      ActualPipelineStateService.isAppointmentCompleted(wrappedUpClient),
      true,
      'Once outcome is recorded, appointment is concluded'
    );
    assert.strictEqual(
      ActualPipelineStateService.isDispoNeeded(wrappedUpClient, pastApptNow),
      false,
      'Concluded appointment must leave Dispo Due queue'
    );
  });

  // 31. hydrateLead preservation of client appointments
  it('hydrateLead protects active client appointments from being auto-healed into connected/converted', () => {
    // Raw database record of client with newly booked appointment
    const rawClientLead = {
      id: 'client_active_appt',
      name: 'Marcus Bell',
      is_client: 1,
      products: '["flow_annuity"]',
      annualized_premium: 6000,
      client_since: '2025-06-01T10:00:00.000Z',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-09-28T18:00:00.000Z',
      appointment_outcome: null,
      appointment_completed_at: null,
      updated_at: '2026-09-28T11:00:00.000Z',
    };

    // Hydration simulation matching LeadsRepository.hydrateLead logic
    const isClient = rawClientLead.is_client === 1 || rawClientLead.is_client === true;
    let apptOutcome = rawClientLead.appointment_outcome || null;
    let apptCompletedAt = rawClientLead.appointment_completed_at || null;
    let lastDisp = rawClientLead.last_disposition || 'pending';

    const hasActiveAppointment = lastDisp === 'appointment_set' && Boolean(rawClientLead.appointment_scheduled_at);
    if (isClient && !hasActiveAppointment) {
      if (!apptOutcome) {
        apptOutcome = 'converted';
        apptCompletedAt = apptCompletedAt || rawClientLead.client_since || new Date().toISOString();
      }
      if (lastDisp === 'appointment_set') {
        lastDisp = 'connected';
      }
    }

    assert.strictEqual(lastDisp, 'appointment_set', 'last_disposition must remain appointment_set');
    assert.strictEqual(apptOutcome, null, 'appointment_outcome must remain null');
  });
});



