import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

const PipelineStateService = loadActualPipelineStateService();

describe('Weekly Cadence, Sunday Resets & Appts Set Filtering Engine', () => {
  // Reference date: Tuesday, September 29, 2026 @ 14:00:00
  const tuesdaySep29 = new Date('2026-09-29T14:00:00.000Z');

  it('1. Computes Sunday-to-Saturday weekly calendar boundaries with exact midnight precision', () => {
    const startOfWeek = PipelineStateService.getStartOfWeek(tuesdaySep29);
    const endOfWeek = PipelineStateService.getEndOfWeek(tuesdaySep29);

    // Tuesday is day 2 -> Sunday is 2026-09-27
    assert.equal(startOfWeek.getDay(), 0, 'Start of week must be Sunday (day 0)');
    assert.equal(startOfWeek.getHours(), 0);
    assert.equal(startOfWeek.getMinutes(), 0);
    assert.equal(startOfWeek.getSeconds(), 0);
    assert.equal(startOfWeek.getDate(), 27); // Sep 27

    // Saturday is day 6 -> Saturday is 2026-10-03
    assert.equal(endOfWeek.getDay(), 6, 'End of week must be Saturday (day 6)');
    assert.equal(endOfWeek.getHours(), 23);
    assert.equal(endOfWeek.getMinutes(), 59);
    assert.equal(endOfWeek.getSeconds(), 59);
    assert.equal(endOfWeek.getDate(), 3); // Oct 3
  });

  it('2. Correctly validates dates falling within the current calling week', () => {
    // Dates inside week: Sep 27 to Oct 3
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-09-27T12:00:00.000Z', tuesdaySep29), true);
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-09-29T12:00:00.000Z', tuesdaySep29), true);
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-10-02T10:00:00.000Z', tuesdaySep29), true); // Friday 10/2!
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-10-03T18:00:00.000Z', tuesdaySep29), true);

    // Dates outside week
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-09-26T12:00:00.000Z', tuesdaySep29), false); // Previous Saturday
    assert.equal(PipelineStateService.isDateInCurrentWeek('2026-10-04T12:00:00.000Z', tuesdaySep29), false); // Following Sunday
    assert.equal(PipelineStateService.isDateInCurrentWeek(null, tuesdaySep29), false);
    assert.equal(PipelineStateService.isDateInCurrentWeek(undefined, tuesdaySep29), false);
  });

  it('3. Rescheduled appointment for Friday 10/2 is classified as THIS WEEK', () => {
    const rescheduledToFriday = {
      id: 'lead_rescheduled_friday',
      name: 'Sarah Connor',
      phone: '555-111-2222',
      school: 'Deltona High',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-10-02T10:20:00.000Z', // Friday Oct 2 @ 10:20 AM
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    const futureNextWeek = {
      id: 'lead_future_next_week',
      name: 'John Connor',
      phone: '555-333-4444',
      school: 'Deltona High',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: '2026-10-09T10:20:00.000Z', // Following Friday Oct 9
      appointment_outcome: null,
      appointment_completed_at: null,
    };

    assert.equal(PipelineStateService.isActiveAppointment(rescheduledToFriday), true);
    assert.equal(PipelineStateService.isAppointmentThisWeek(rescheduledToFriday, tuesdaySep29), true);

    assert.equal(PipelineStateService.isActiveAppointment(futureNextWeek), true);
    assert.equal(PipelineStateService.isAppointmentThisWeek(futureNextWeek, tuesdaySep29), false);

    const appointmentsThisWeek = PipelineStateService.getAppointmentsThisWeek(
      [rescheduledToFriday, futureNextWeek],
      tuesdaySep29
    );
    assert.equal(appointmentsThisWeek.length, 1);
    assert.equal(appointmentsThisWeek[0].id, 'lead_rescheduled_friday');
  });

  it('4. Correctly classifies Unanswered and Voicemail outreach this week vs past weeks', () => {
    const unansweredThisWeek = {
      id: 'u_1',
      last_disposition: 'no_answer',
      last_attempt_at: '2026-09-28T16:00:00.000Z', // Monday of this week
    };

    const voicemailThisWeek = {
      id: 'u_2',
      last_disposition: 'voicemail',
      last_attempt_at: '2026-09-29T10:00:00.000Z', // Tuesday of this week
    };

    const unansweredLastWeek = {
      id: 'u_old',
      last_disposition: 'no_answer',
      last_attempt_at: '2026-09-24T15:00:00.000Z', // Thursday of LAST week
    };

    assert.equal(PipelineStateService.isUnansweredThisWeek(unansweredThisWeek, tuesdaySep29), true);
    assert.equal(PipelineStateService.isUnansweredThisWeek(voicemailThisWeek, tuesdaySep29), true);
    assert.equal(PipelineStateService.isUnansweredThisWeek(unansweredLastWeek, tuesdaySep29), false);
  });

  it('5. Correctly classifies Spoke / Connected conversations held THIS WEEK', () => {
    const spokeThisWeek = {
      id: 's_1',
      last_disposition: 'connected',
      last_attempt_at: '2026-09-28T11:00:00.000Z',
    };

    const spokeLastWeek = {
      id: 's_old',
      last_disposition: 'spoke',
      last_attempt_at: '2026-09-20T14:00:00.000Z',
    };

    assert.equal(PipelineStateService.isSpokeThisWeek(spokeThisWeek, tuesdaySep29), true);
    assert.equal(PipelineStateService.isSpokeThisWeek(spokeLastWeek, tuesdaySep29), false);
  });

  it('6. Correctly evaluates Callbacks due THIS WEEK vs future weeks', () => {
    const callbackDueToday = {
      id: 'cb_today',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-29T15:00:00.000Z',
    };

    const callbackDueFriday = {
      id: 'cb_fri',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-10-02T13:00:00.000Z',
    };

    const callbackDueNextWeek = {
      id: 'cb_next',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-10-08T13:00:00.000Z',
    };

    assert.equal(PipelineStateService.isCallbackDueThisWeek(callbackDueToday, tuesdaySep29), true);
    assert.equal(PipelineStateService.isCallbackDueThisWeek(callbackDueFriday, tuesdaySep29), true);
    assert.equal(PipelineStateService.isCallbackDueThisWeek(callbackDueNextWeek, tuesdaySep29), false);
  });

  it('7. Verifies simulation of ListsScreen weekly filter tab switching & sub-scope toggles', () => {
    const pool = [
      { id: '1', name: 'Fresh 1', last_disposition: 'pending', attempts_count: 0 },
      { id: '2', name: 'Recycled Last Week', last_disposition: 'pending', attempts_count: 2 },
      { id: '3', name: 'Fri Appt', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-10-02T14:00:00.000Z' },
      { id: '4', name: 'Next Week Appt', last_disposition: 'appointment_set', appointment_scheduled_at: '2026-10-09T14:00:00.000Z' },
      { id: '5', name: 'Unanswered This Week', last_disposition: 'no_answer', last_attempt_at: '2026-09-28T10:00:00.000Z' },
      { id: '6', name: 'Unanswered Old', last_disposition: 'no_answer', last_attempt_at: '2026-09-15T10:00:00.000Z' },
      { id: '7', name: 'Permanent Client', is_client: true, last_disposition: 'connected' },
    ];

    // 'pending' / To Call: Includes fresh AND recycled leads
    const toCall = pool.filter((l) => !l.last_disposition || l.last_disposition === 'pending');
    assert.equal(toCall.length, 2);
    assert.deepEqual(toCall.map((l) => l.id), ['1', '2']);

    // 'appts' with 'this_week' scope (default)
    const apptsThisWeek = pool.filter((l) => PipelineStateService.isActiveAppointment(l) && PipelineStateService.isAppointmentThisWeek(l, tuesdaySep29));
    assert.equal(apptsThisWeek.length, 1);
    assert.equal(apptsThisWeek[0].id, '3');

    // 'appts' with 'all' scope
    const apptsAll = pool.filter((l) => PipelineStateService.isActiveAppointment(l));
    assert.equal(apptsAll.length, 2);
    assert.deepEqual(apptsAll.map((l) => l.id), ['3', '4']);

    // 'unanswered' with 'this_week' scope
    const unansweredThisWeek = pool.filter((l) => PipelineStateService.isUnansweredThisWeek(l, tuesdaySep29));
    assert.equal(unansweredThisWeek.length, 1);
    assert.equal(unansweredThisWeek[0].id, '5');

    // 'clients' over all time (permanent)
    const clients = pool.filter((l) => Boolean(l.is_client));
    assert.equal(clients.length, 1);
    assert.equal(clients[0].id, '7');
  });
});
