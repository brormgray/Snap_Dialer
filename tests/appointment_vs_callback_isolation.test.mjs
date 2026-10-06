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
        ],
        matchPeriodId: () => null,
      };
    }
    return {};
  };

  const runner = new Function('module', 'exports', 'require', transpiled.outputText);
  runner(moduleObj, moduleObj.exports, requireMock);

  return moduleObj.exports.PipelineStateService;
}

const PipelineStateService = loadActualPipelineStateService();

describe('Sit-Down Appointment vs. Phone Callback Isolation Engine', () => {
  const now = new Date('2026-10-06T14:00:00.000Z'); // 10:00 AM EDT
  const pastApptTime = '2026-10-06T14:30:00.000Z'; // 10:30 AM EDT (in past when now is 11:00 AM)
  const nowPast = new Date('2026-10-06T15:30:00.000Z'); // 11:30 AM EDT

  it('1. Confirmed sit-down appointment is NEVER classified as a scheduled phone callback', () => {
    const apptLead = {
      id: 'lead-appt-1',
      name: 'Sarah Connor',
      school: 'Deltona High',
      phone: '3865550199',
      last_disposition: 'appointment_set',
      appointment_scheduled_at: pastApptTime,
      follow_up_at: null,
      appointment_outcome: null,
    };

    assert.equal(PipelineStateService.isScheduledCallback(apptLead), false);
    assert.equal(PipelineStateService.isScheduledCallbackDueToday(apptLead, nowPast), false);
  });

  it('2. Legacy conflated lead (where follow_up_at matches appointment_scheduled_at) is guarded against false callback classification', () => {
    const legacyConflatedLead = {
      id: 'lead-legacy-1',
      name: 'John Doe',
      school: 'VOL',
      phone: '3865550188',
      last_disposition: 'no_answer', // Marked no-answer after no-show
      appointment_scheduled_at: pastApptTime,
      follow_up_at: pastApptTime, // Legacy bug duplicated appt time into follow_up_at
      appointment_outcome: 'no_show',
    };

    assert.equal(PipelineStateService.isScheduledCallback(legacyConflatedLead), false);
    assert.equal(PipelineStateService.isScheduledCallbackDueToday(legacyConflatedLead, nowPast), false);
  });

  it('3. In-person sit-down no-show outcome is NEVER classified as an overdue callback', () => {
    const noShowLead = {
      id: 'lead-noshow-1',
      name: 'Marcus Brody',
      school: 'Pine Ridge High',
      phone: '3865550122',
      last_disposition: 'no_answer',
      appointment_scheduled_at: pastApptTime,
      appointment_outcome: 'no_show',
      appointment_completed_at: pastApptTime,
      follow_up_at: pastApptTime, // Even if legacy timestamp lingers
    };

    assert.equal(PipelineStateService.isScheduledCallback(noShowLead), false);
    assert.equal(PipelineStateService.isScheduledCallbackDueToday(noShowLead, nowPast), false);
    assert.equal(PipelineStateService.isCallbackDueThisWeek(noShowLead, nowPast), false);
  });

  it('4. In-person sit-down declined outcome is NEVER classified as a callback', () => {
    const declinedLead = {
      id: 'lead-declined-1',
      name: 'Arthur Pendelton',
      school: 'University High',
      phone: '3865550133',
      last_disposition: 'spoke',
      appointment_scheduled_at: pastApptTime,
      appointment_outcome: 'declined',
      appointment_completed_at: pastApptTime,
      follow_up_at: pastApptTime,
    };

    assert.equal(PipelineStateService.isScheduledCallback(declinedLead), false);
    assert.equal(PipelineStateService.isScheduledCallbackDueToday(declinedLead, nowPast), false);
  });

  it('5. Genuine scheduled phone callback functions independently and is flagged as due/overdue', () => {
    const genuineCallbackLead = {
      id: 'lead-cb-1',
      name: 'Diana Prince',
      school: 'VOL',
      phone: '3865550144',
      last_disposition: 'callback_requested',
      follow_up_at: '2026-10-06T14:30:00.000Z',
      appointment_scheduled_at: null,
      appointment_outcome: null,
    };

    assert.equal(PipelineStateService.isScheduledCallback(genuineCallbackLead), true);
    assert.equal(PipelineStateService.isScheduledCallbackDueToday(genuineCallbackLead, nowPast), true);

    const badge = PipelineStateService.getCallbackTimeBadge(genuineCallbackLead, nowPast);
    assert.equal(badge.isOverdue, true);
  });

  it('6. Lead with both an in-person appointment history and a NEW explicit phone callback respects the phone callback', () => {
    const apptWithSubsequentCallback = {
      id: 'lead-multi-1',
      name: 'Bruce Wayne',
      school: 'Wayne Academy',
      phone: '3865550155',
      last_disposition: 'callback_requested', // Agent explicitly dispositioned as callback requested
      appointment_scheduled_at: '2026-10-05T14:00:00.000Z', // Yesterday's sitdown
      appointment_outcome: 'no_show',
      follow_up_at: '2026-10-06T16:00:00.000Z', // Distinct new phone callback time
    };

    assert.equal(PipelineStateService.isScheduledCallback(apptWithSubsequentCallback), true);
  });
});
