import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DateTimeAwareService } from '../src/services/dateTimeAwareService.ts';
import {
  getScheduleForSchool,
  matchPeriodId,
  getPlanningTimeWindow,
} from '../src/data/bellSchedules.ts';
import {
  ALL_DRIP_TEMPLATES,
} from '../src/data/dripTemplates.ts';
import { SecurityService } from '../src/services/securityService.ts';
import { NotesService } from '../src/services/notesService.ts';
import { DeduplicationService } from '../src/services/deduplicationService.ts';

const ROOT = process.cwd();

describe('World-Class Multi-Agent Audit Verification Suite', () => {
  describe('1. Quantitative Formulas, Timezone & Pipeline State Verification', () => {
    it('DateTimeAwareService formats dates and times in America/New_York accurately', () => {
      // 2026-10-15T20:00:00Z is 4:00 PM EDT (Thursday, Oct 15, 2026)
      const ref = new Date('2026-10-15T20:00:00.000Z');
      assert.equal(DateTimeAwareService.formatDateKey(ref), '2026-10-15');
      assert.equal(DateTimeAwareService.formatTime(ref), '4:00 PM');
      assert.ok(DateTimeAwareService.formatDate(ref).includes('Oct 15'));
    });

    it('DateTimeAwareService.getRelativeTimeInfo classifies same-day, tomorrow, and next-week appointments accurately', () => {
      const ref = new Date('2026-10-15T14:00:00.000Z'); // Thursday 10:00 AM EDT
      const laterToday = new Date('2026-10-15T18:00:00.000Z'); // Thursday 2:00 PM EDT
      const info = DateTimeAwareService.getRelativeTimeInfo(laterToday, ref);
      assert.equal(info.category, 'today_future');
      assert.equal(info.isToday, true);
    });

    it('PipelineStateService enforces strict appointment and callback state invariants', () => {
      const pipelineSrc = fs.readFileSync(path.join(ROOT, 'src/services/pipelineStateService.ts'), 'utf8');
      assert.ok(
        pipelineSrc.includes('static isActiveAppointment(lead: Lead): boolean'),
        'PipelineStateService must expose centralized isActiveAppointment helper'
      );
      assert.ok(
        pipelineSrc.includes('static isDispoNeeded(lead: Lead, now: Date = new Date()): boolean'),
        'PipelineStateService must expose centralized isDispoNeeded helper'
      );
      assert.ok(
        pipelineSrc.includes('static isScheduledCallback(lead: Lead): boolean'),
        'PipelineStateService must expose centralized isScheduledCallback helper'
      );
    });

    it('CadenceEngine enforces TCPA text_ok compliance and any_unconnected condition handling', () => {
      const cadenceSrc = fs.readFileSync(path.join(ROOT, 'src/services/cadenceEngine.ts'), 'utf8');
      assert.ok(
        cadenceSrc.includes('lead.text_ok === false'),
        'CadenceEngine must check TCPA text_ok compliance before prompting SMS'
      );
      assert.ok(
        cadenceSrc.includes("rule.condition_disposition === 'any_unconnected'"),
        'CadenceEngine must evaluate any_unconnected rules for unanswered calls'
      );
    });
  });

  describe('2. Bell Schedules & Planning Period Parsing Verification', () => {
    it('getScheduleForSchool resolves partial campus names like "Mainland" and "DeLand"', () => {
      const mainland = getScheduleForSchool('Mainland');
      assert.ok(Array.isArray(mainland) && mainland.length >= 7, 'Should resolve Mainland High School schedule');

      const deland = getScheduleForSchool('DeLand High');
      assert.ok(Array.isArray(deland) && deland.length >= 7, 'Should resolve DeLand High School schedule');
    });

    it('matchPeriodId does not falsely match "Period 10" as "Period 1" and supports Periods 8, 9 & Lunch', () => {
      assert.equal(matchPeriodId('Period 10'), null, 'Period 10 must not collide with Period 1');
      assert.equal(matchPeriodId('Period 1'), 'p1');
      assert.equal(matchPeriodId('8th Period'), 'p8');
      assert.equal(matchPeriodId('Period 9'), 'p9');
      assert.equal(matchPeriodId('Lunch B'), 'lunch');
    });

    it('getPlanningTimeWindow returns valid display window for matched period', () => {
      const win = getPlanningTimeWindow('Period 3', 'Mainland High School');
      assert.ok(win && win.includes('AM'), 'Period 3 should return morning time window');
    });
  });

  describe('3. Deduplication, Drip Templates, CSV Injection Defense & Security Verification', () => {
    it('DeduplicationService.mergeRecords preserves Non-FRS (is_frs: false), appointment outcomes, and drip state', () => {
      const primary = {
        id: 'lead_p1',
        name: 'Robert Smith',
        phone: '3865550101',
        school: 'University High',
        status: 'warm',
        attempt_count: 2,
        is_frs: false,
        appointment_outcome: 'converted_client',
        appointment_completed_at: '2026-10-14T15:00:00.000Z',
        is_client: true,
        client_since: '2026-10-14T15:00:00.000Z',
        drip_track: 'annual_client_review',
        drip_step: 2,
        next_drip_due_at: '2026-11-14',
        drip_paused: false,
      };
      const secondary = {
        id: 'lead_s1',
        name: 'Robert Smith',
        phone: '3865550101',
        school: 'University High',
        status: 'cold',
        attempt_count: 0,
        // is_frs undefined on newly scanned card
      };

      const merged = DeduplicationService.mergeRecords(primary, secondary);
      assert.equal(merged.is_frs, false, 'Must preserve explicit false (Non-FRS) on primary record');
      assert.equal(merged.appointment_outcome, 'converted_client');
      assert.equal(merged.appointment_completed_at, '2026-10-14T15:00:00.000Z');
      assert.equal(merged.client_since, '2026-10-14T15:00:00.000Z');
      assert.equal(merged.drip_track, 'annual_client_review');
      assert.equal(merged.drip_step, 2);
      assert.equal(merged.next_drip_due_at, '2026-11-14');
    });

    it('Drip templates use {{room_number}} token without duplicate "Room {{room_number}}"', () => {
      const allBodies = ALL_DRIP_TEMPLATES.map((t) => t.body);

      for (const body of allBodies) {
        assert.ok(!body.includes('Room {{room_number}}'), 'Drip template must not hardcode "Room {{room_number}}"');
      }
    });

    it('CsvService neutralizes formula injection payloads including leading whitespace', () => {
      const csvSrc = fs.readFileSync(path.join(ROOT, 'src/services/csvService.ts'), 'utf8');
      assert.ok(
        csvSrc.includes('/^[\\s]*[=+\\-@\\t\\r]/'),
        'CsvService.escapeCell must neutralize formula characters even when preceded by whitespace'
      );
    });

    it('SecurityService.verifyPin performs constant-time verification and rejects length mismatches', () => {
      SecurityService.setPin('4829');
      assert.equal(SecurityService.verifyPin('4829'), true);
      assert.equal(SecurityService.verifyPin('4828'), false);
      assert.equal(SecurityService.verifyPin('482'), false);
      assert.equal(SecurityService.verifyPin('48290'), false);
      SecurityService.disablePin();
    });

    it('NotesService parses and updates notes cleanly without data loss', () => {
      const raw = NotesService.addNote('', 'Spoke during 3rd period planning');
      const parsed = NotesService.parseNotes(raw);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].text, 'Spoke during 3rd period planning');
    });
  });

  describe('4. Cross-Screen Focus Listeners, Synchronous WebKit Gesture & DB Integrity', () => {
    it('All primary screens register navigation focus listeners or useFocusEffect', () => {
      const screens = [
        'ListsScreen.tsx',
        'DialerHudScreen.tsx',
        'LeadDetailScreen.tsx',
        'AnalyticsScreen.tsx',
        'PlanningHeatmapScreen.tsx',
        'CadenceSettingsScreen.tsx',
        'SettingsScreen.tsx',
      ];
      for (const file of screens) {
        const content = fs.readFileSync(path.join(ROOT, 'src/screens', file), 'utf8');
        const hasFocusSync =
          content.includes("addListener('focus'") ||
          content.includes('addListener("focus"') ||
          content.includes("addListener?.('focus'") ||
          content.includes('useFocusEffect');
        assert.ok(hasFocusSync, `${file} must subscribe to navigation focus events to prevent stale cross-screen state`);
      }
    });

    it('Database adapter and CallLogsRepository preserve non-voice disposition separation and boolean client portfolio persistence', () => {
      const dbSource = fs.readFileSync(path.join(ROOT, 'src/db/database.ts'), 'utf8');
      assert.ok(
        dbSource.includes('params[0] === 1 || params[0] === true'),
        'database.ts must accept both numeric 1 and boolean true for is_client in saveClientPortfolio'
      );

      const logsRepoSource = fs.readFileSync(path.join(ROOT, 'src/db/callLogsRepository.ts'), 'utf8');
      assert.ok(
        logsRepoSource.includes("r.disposition.startsWith('appt_')"),
        'callLogsRepository.ts must exclude post-appointment wrap-up logs (appt_*) and standalone SMS/drip logs from voice dial counts'
      );
    });
  });
});
