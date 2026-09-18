import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// 1. Compile and instantiate the actual PipelineStateService from src/services/pipelineStateService.ts
function loadPipelineStateService() {
  const servicePath = path.resolve('src/services/pipelineStateService.ts');
  const src = fs.readFileSync(servicePath, 'utf8');
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  // Mock out relative imports that aren't needed for callback predicates
  const code = transpiled.outputText.replace(/require\(['"].*['"]\)/g, '{}');
  const moduleObj = { exports: {} };
  const runner = new Function('module', 'exports', code);
  runner(moduleObj, moduleObj.exports);

  return moduleObj.exports.PipelineStateService;
}

const PipelineStateService = loadPipelineStateService();

describe("Advisor Daily Playbook: Strict Scheduled Callback & Calls Due Logic", () => {
  // Reference anchor: Friday, September 18, 2026 at 10:00 AM EDT (14:00:00 UTC)
  const refNow = new Date('2026-09-18T14:00:00.000Z');
  const easternTz = 'America/New_York';

  // --------------------------------------------------------------------------
  // 1. Fresh uncontacted leads are NEVER counted in Calls Due
  // --------------------------------------------------------------------------
  describe('1. Fresh uncontacted leads exclusion', () => {
    it('fresh leads with priority_tier 1 and last_disposition pending are NEVER scheduled callbacks', () => {
      const freshPendingLead = {
        id: 'fresh_1',
        name: 'Jane Doe',
        phone: '3865551234',
        school: 'Mainland High',
        priority_tier: 1,
        last_disposition: 'pending',
        attempts_count: 0,
        follow_up_at: null,
      };

      assert.equal(PipelineStateService.isScheduledCallback(freshPendingLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(freshPendingLead, refNow, easternTz), false);
    });

    it('fresh leads with priority_tier 1 and undefined/null last_disposition are NEVER scheduled callbacks', () => {
      const freshNoDispoLead = {
        id: 'fresh_2',
        name: 'Bob Smith',
        phone: '3865555678',
        priority_tier: 1,
        last_disposition: null,
        attempts_count: 0,
      };

      assert.equal(PipelineStateService.isScheduledCallback(freshNoDispoLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(freshNoDispoLead, refNow, easternTz), false);
    });

    it('even if a pending lead somehow has a follow_up_at timestamp, pending status strictly excludes it from callbacks', () => {
      const anomalousPendingLead = {
        id: 'fresh_3',
        name: 'Alice Johnson',
        priority_tier: 1,
        last_disposition: 'pending',
        follow_up_at: '2026-09-18T15:00:00.000Z',
      };

      assert.equal(PipelineStateService.isScheduledCallback(anomalousPendingLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(anomalousPendingLead, refNow, easternTz), false);
    });

    it('getScheduledCallbacksDueToday strictly excludes all fresh uncontacted leads', () => {
      const leadPool = [
        { id: 'f1', name: 'Fresh 1', priority_tier: 1, last_disposition: 'pending' },
        { id: 'f2', name: 'Fresh 2', priority_tier: 1, last_disposition: null },
        { id: 'f3', name: 'Fresh 3', priority_tier: 2, last_disposition: 'pending' },
        {
          id: 'cb1',
          name: 'Scheduled Callback',
          last_disposition: 'callback_requested',
          follow_up_at: '2026-09-18T15:00:00.000Z',
        },
      ];

      const due = PipelineStateService.getScheduledCallbacksDueToday(leadPool, refNow, easternTz);
      assert.equal(due.length, 1);
      assert.equal(due[0].id, 'cb1');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Callbacks scheduled for today appear in Calls Due
  // --------------------------------------------------------------------------
  describe('2. Callbacks scheduled for today appear in Calls Due', () => {
    it('lead with callback_requested and follow_up_at today appears in Calls Due', () => {
      const todayCallback = {
        id: 'cb_today_1',
        name: 'Marcus Bell',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-18T18:00:00.000Z', // 2:00 PM EDT
      };

      assert.equal(PipelineStateService.isScheduledCallback(todayCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(todayCallback, refNow, easternTz), true);
    });

    it('lead with date-only follow_up_at (YYYY-MM-DD) for today appears in Calls Due', () => {
      const dateOnlyCallback = {
        id: 'cb_today_date_only',
        name: 'Sarah Connor',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-18',
      };

      assert.equal(PipelineStateService.isScheduledCallback(dateOnlyCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(dateOnlyCallback, refNow, easternTz), true);
    });

    it('lead with callback_requested and missing follow_up_at is treated as due today', () => {
      const missingTimestampCallback = {
        id: 'cb_today_missing_ts',
        name: 'David Ortiz',
        last_disposition: 'callback_requested',
        follow_up_at: null,
      };

      assert.equal(PipelineStateService.isScheduledCallback(missingTimestampCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(missingTimestampCallback, refNow, easternTz), true);
    });

    it('overdue callbacks (scheduled yesterday or earlier) appear in today Calls Due', () => {
      const overdueCallback = {
        id: 'cb_overdue_yesterday',
        name: 'Elena Rostova',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-17T14:00:00.000Z', // Yesterday
      };

      assert.equal(PipelineStateService.isScheduledCallback(overdueCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(overdueCallback, refNow, easternTz), true);
    });

    it('callback requested following a voicemail with follow_up_at today appears in Calls Due', () => {
      const voicemailWithCallback = {
        id: 'cb_vm_1',
        name: 'Karen Vance',
        last_disposition: 'voicemail',
        follow_up_at: '2026-09-18T16:30:00.000Z',
      };

      assert.equal(PipelineStateService.isScheduledCallback(voicemailWithCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(voicemailWithCallback, refNow, easternTz), true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Callbacks scheduled for tomorrow/future do NOT appear in today's Calls Due
  // --------------------------------------------------------------------------
  describe("3. Future callbacks do NOT appear in today's Calls Due", () => {
    it('callback scheduled for tomorrow does NOT appear in today Calls Due', () => {
      const tomorrowCallback = {
        id: 'cb_tomorrow',
        name: 'Tom Morrow',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-19T14:00:00.000Z', // Saturday morning EDT
      };

      assert.equal(PipelineStateService.isScheduledCallback(tomorrowCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(tomorrowCallback, refNow, easternTz), false);
    });

    it('callback scheduled with date-only for tomorrow (YYYY-MM-DD) does NOT appear in today Calls Due', () => {
      const tomorrowDateOnly = {
        id: 'cb_tomorrow_date_only',
        name: 'Nancy Next',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-19',
      };

      assert.equal(PipelineStateService.isScheduledCallback(tomorrowDateOnly), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(tomorrowDateOnly, refNow, easternTz), false);
    });

    it('callback scheduled for next week does NOT appear in today Calls Due', () => {
      const nextWeekCallback = {
        id: 'cb_next_week',
        name: 'Walter White',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-25T14:00:00.000Z',
      };

      assert.equal(PipelineStateService.isScheduledCallback(nextWeekCallback), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(nextWeekCallback, refNow, easternTz), false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Callbacks remain due all day until dispositioned
  // --------------------------------------------------------------------------
  describe('4. Callbacks remain due all day until dispositioned', () => {
    const morningCallback = {
      id: 'cb_persistent_9am',
      name: 'Dr. Gregory House',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-18T13:00:00.000Z', // 9:00 AM EDT
    };

    it('is due at 8:00 AM EDT (before scheduled time)', () => {
      const morning8am = new Date('2026-09-18T12:00:00.000Z');
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, morning8am, easternTz), true);
    });

    it('is due at 10:00 AM EDT (1 hour after scheduled time)', () => {
      const morning10am = new Date('2026-09-18T14:00:00.000Z');
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, morning10am, easternTz), true);
    });

    it('is due at 2:00 PM EDT (midday during planning)', () => {
      const midday2pm = new Date('2026-09-18T18:00:00.000Z');
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, midday2pm, easternTz), true);
    });

    it('is due at 6:00 PM EDT (after school dismissal)', () => {
      const evening6pm = new Date('2026-09-18T22:00:00.000Z');
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, evening6pm, easternTz), true);
    });

    it('is due at 11:59 PM EDT (end of calendar day)', () => {
      const night1159pm = new Date('2026-09-19T03:59:00.000Z'); // 11:59 PM EDT on Sept 18
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, night1159pm, easternTz), true);
    });

    it('still remains due on the next day as overdue until dispositioned', () => {
      const nextDay = new Date('2026-09-19T14:00:00.000Z');
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(morningCallback, nextDay, easternTz), true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Dispositioning a callback removes it from today's Calls Due
  // --------------------------------------------------------------------------
  describe('5. Dispositioning transitions remove lead from Calls Due', () => {
    const baseLead = {
      id: 'cb_lifecycle_lead',
      name: 'Rachel Green',
      school: 'Deland High',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-09-18T14:00:00.000Z',
    };

    it('dispositioning to "connected" removes it from Calls Due', () => {
      const afterCall = {
        ...baseLead,
        last_disposition: 'connected',
        follow_up_at: null,
      };
      assert.equal(PipelineStateService.isScheduledCallback(afterCall), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(afterCall, refNow, easternTz), false);
    });

    it('dispositioning to "appointment_set" removes it from Calls Due', () => {
      const afterApptSet = {
        ...baseLead,
        last_disposition: 'appointment_set',
        appointment_scheduled_at: '2026-09-22T14:30:00.000Z',
        follow_up_at: '2026-09-22T14:30:00.000Z',
      };
      assert.equal(PipelineStateService.isScheduledCallback(afterApptSet), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(afterApptSet, refNow, easternTz), false);
    });

    it('dispositioning to "do_not_call" or "bad_number" removes it from Calls Due', () => {
      const dncLead = { ...baseLead, last_disposition: 'do_not_call' };
      const badNumLead = { ...baseLead, last_disposition: 'bad_number' };

      assert.equal(PipelineStateService.isScheduledCallback(dncLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(dncLead, refNow, easternTz), false);

      assert.equal(PipelineStateService.isScheduledCallback(badNumLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(badNumLead, refNow, easternTz), false);
    });

    it('dispositioning to "other" removes it from Calls Due', () => {
      const otherLead = { ...baseLead, last_disposition: 'other' };
      assert.equal(PipelineStateService.isScheduledCallback(otherLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(otherLead, refNow, easternTz), false);
    });

    it('marking educator as client (is_client: true) removes it from Calls Due', () => {
      const clientLead = { ...baseLead, is_client: true };
      assert.equal(PipelineStateService.isScheduledCallback(clientLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(clientLead, refNow, easternTz), false);
    });

    it('dispositioning to "no_answer" and clearing follow_up_at removes it from Calls Due', () => {
      const noAnswerLead = {
        ...baseLead,
        last_disposition: 'no_answer',
        follow_up_at: null,
      };
      assert.equal(PipelineStateService.isScheduledCallback(noAnswerLead), false);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(noAnswerLead, refNow, easternTz), false);
    });

    it('rescheduling callback to tomorrow removes it from today Calls Due', () => {
      const rescheduledLead = {
        ...baseLead,
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-19T15:00:00.000Z', // Tomorrow
      };
      assert.equal(PipelineStateService.isScheduledCallback(rescheduledLead), true);
      assert.equal(PipelineStateService.isScheduledCallbackDueToday(rescheduledLead, refNow, easternTz), false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Chronological sorting in getScheduledCallbacksDueToday
  // --------------------------------------------------------------------------
  describe('6. Chronological sorting order', () => {
    it('sorts callbacks due today in ascending chronological order', () => {
      const leads = [
        { id: 'lead_afternoon', name: 'Zack Afternoon', last_disposition: 'callback_requested', follow_up_at: '2026-09-18T18:00:00.000Z' }, // 2:00 PM
        { id: 'lead_overdue', name: 'Andy Overdue', last_disposition: 'callback_requested', follow_up_at: '2026-09-17T14:00:00.000Z' },   // Yesterday
        { id: 'lead_morning', name: 'Beth Morning', last_disposition: 'callback_requested', follow_up_at: '2026-09-18T13:00:00.000Z' },    // 9:00 AM
        { id: 'lead_no_time', name: 'Chris NoTime', last_disposition: 'callback_requested', follow_up_at: null },                           // Unscheduled
      ];

      const sorted = PipelineStateService.getScheduledCallbacksDueToday(leads, refNow, easternTz);
      assert.equal(sorted.length, 4);
      assert.equal(sorted[0].id, 'lead_overdue', 'Overdue yesterday should sort first');
      assert.equal(sorted[1].id, 'lead_morning', 'Morning 9am should sort second');
      assert.equal(sorted[2].id, 'lead_afternoon', 'Afternoon 2pm should sort third');
      assert.equal(sorted[3].id, 'lead_no_time', 'Unscheduled callback should sort last');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Timezone accuracy across America/New_York (Eastern Time)
  // --------------------------------------------------------------------------
  describe('7. Timezone boundary accuracy', () => {
    it('correctly handles Eastern late evening callback (where UTC date is already tomorrow)', () => {
      // 9:00 PM EDT on Friday Sept 18 is 01:00:00 UTC on Saturday Sept 19
      const lateFridayNightCallback = {
        id: 'cb_late_friday',
        name: 'Night Owl',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-19T01:00:00.000Z',
      };

      // In America/New_York, 2026-09-19T01:00:00Z is 2026-09-18 21:00:00 EDT (TODAY!)
      assert.equal(
        PipelineStateService.isScheduledCallbackDueToday(lateFridayNightCallback, refNow, 'America/New_York'),
        true,
        'Must resolve to today in Eastern timezone despite UTC date being tomorrow'
      );
    });

    it('correctly distinguishes tomorrow morning Eastern callback', () => {
      // 9:00 AM EDT Saturday Sept 19 is 13:00:00 UTC Saturday Sept 19
      const saturdayMorningCallback = {
        id: 'cb_sat_morning',
        name: 'Early Bird',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-19T13:00:00.000Z',
      };

      assert.equal(
        PipelineStateService.isScheduledCallbackDueToday(saturdayMorningCallback, refNow, 'America/New_York'),
        false,
        'Saturday morning callback must NOT be due on Friday'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. Zero Data Loss & Lead Record Preservation
  // --------------------------------------------------------------------------
  describe('8. Zero Data Loss & Record Preservation', () => {
    it('preserves all lead properties without mutation during evaluation and filtering', () => {
      const originalLead = {
        id: 'lead_immutability_check',
        name: 'Dr. John Watson',
        phone: '3865559999',
        school: 'Mainland High',
        room_number: '204B',
        planning_period: 'Period 3',
        priority_tier: 1,
        cadence_step: 2,
        notes: 'Requested follow up regarding FRS special risk benefits',
        last_disposition: 'callback_requested',
        follow_up_at: '2026-09-18T14:30:00.000Z',
        created_at: '2026-09-01T08:00:00.000Z',
        updated_at: '2026-09-15T12:00:00.000Z',
      };

      const clonedLead = JSON.parse(JSON.stringify(originalLead));

      const isCb = PipelineStateService.isScheduledCallback(originalLead);
      const isDue = PipelineStateService.isScheduledCallbackDueToday(originalLead, refNow, easternTz);
      const list = PipelineStateService.getScheduledCallbacksDueToday([originalLead], refNow, easternTz);

      assert.equal(isCb, true);
      assert.equal(isDue, true);
      assert.equal(list.length, 1);

      // Verify zero field mutation or loss
      assert.deepEqual(originalLead, clonedLead, 'Lead record must be 100% immutable and unmutated');
    });
  });
});
