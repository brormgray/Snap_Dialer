import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  matchPeriodId,
  getScheduleForSchool,
  VOLUSIA_HIGH_STANDARD,
  VOLUSIA_MIDDLE_STANDARD,
} from '../src/data/bellSchedules.ts';

describe('District Bell Schedules & Period Matching Engine', () => {
  test('matches various natural language planning period inputs to correct period IDs', () => {
    assert.strictEqual(matchPeriodId('Period 1'), 'p1');
    assert.strictEqual(matchPeriodId('1st period'), 'p1');
    assert.strictEqual(matchPeriodId('1st'), 'p1');
    assert.strictEqual(matchPeriodId('P1'), 'p1');

    assert.strictEqual(matchPeriodId('Period 3'), 'p3');
    assert.strictEqual(matchPeriodId('3rd Period'), 'p3');
    assert.strictEqual(matchPeriodId('3'), 'p3');

    assert.strictEqual(matchPeriodId('Period 7'), 'p7');
    assert.strictEqual(matchPeriodId('7th'), 'p7');

    assert.strictEqual(matchPeriodId('After school'), 'after');
    assert.strictEqual(matchPeriodId('3:30 PM'), 'after');
    assert.strictEqual(matchPeriodId('Dismissal'), 'after');

    assert.strictEqual(matchPeriodId(null), null);
    assert.strictEqual(matchPeriodId(''), null);
  });

  test('resolves correct schedule for known high schools and middle schools', () => {
    const deltonaSchedule = getScheduleForSchool('Deltona High School');
    assert.strictEqual(deltonaSchedule, VOLUSIA_HIGH_STANDARD);
    assert.strictEqual(deltonaSchedule[0].startTime, '08:30');

    const middleSchedule = getScheduleForSchool('Heritage Middle School');
    assert.strictEqual(middleSchedule, VOLUSIA_MIDDLE_STANDARD);
    assert.strictEqual(middleSchedule[0].startTime, '09:15');

    const fallbackSchedule = getScheduleForSchool('Unknown County School');
    assert.strictEqual(fallbackSchedule, VOLUSIA_HIGH_STANDARD);
  });

  test('calculates accurate display time strings', () => {
    const p3 = VOLUSIA_HIGH_STANDARD.find((p) => p.id === 'p3');
    assert.ok(p3);
    assert.strictEqual(p3.displayTime, '10:18 AM – 11:06 AM');
  });
});
