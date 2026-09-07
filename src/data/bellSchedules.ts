export interface BellPeriod {
  id: string;
  name: string; // e.g. "Period 1", "Period 2", "Lunch", etc.
  startTime: string; // "08:30" (24-hour format)
  endTime: string; // "09:18"
  displayTime: string; // "8:30 AM – 9:18 AM"
  isInstructional: boolean;
}

export interface SchoolBellSchedule {
  schoolName: string;
  category: 'high' | 'middle' | 'elementary';
  periods: BellPeriod[];
}

/**
 * Official Volusia County Public High Schools Bell Schedule
 * Applicable to: Deltona High, University High, Mainland High, Spruce Creek High, DeLand High, etc.
 */
export const VOLUSIA_HIGH_STANDARD: BellPeriod[] = [
  { id: 'p1', name: 'Period 1', startTime: '08:30', endTime: '09:18', displayTime: '8:30 AM – 9:18 AM', isInstructional: true },
  { id: 'p2', name: 'Period 2', startTime: '09:24', endTime: '10:12', displayTime: '9:24 AM – 10:12 AM', isInstructional: true },
  { id: 'p3', name: 'Period 3', startTime: '10:18', endTime: '11:06', displayTime: '10:18 AM – 11:06 AM', isInstructional: true },
  { id: 'p4', name: 'Period 4', startTime: '11:12', endTime: '12:36', displayTime: '11:12 AM – 12:36 PM', isInstructional: true },
  { id: 'p5', name: 'Period 5', startTime: '12:42', endTime: '13:30', displayTime: '12:42 PM – 1:30 PM', isInstructional: true },
  { id: 'p6', name: 'Period 6', startTime: '13:36', endTime: '14:24', displayTime: '1:36 PM – 2:24 PM', isInstructional: true },
  { id: 'p7', name: 'Period 7', startTime: '14:30', endTime: '15:30', displayTime: '2:30 PM – 3:30 PM', isInstructional: true },
  { id: 'after', name: 'After School', startTime: '15:30', endTime: '17:00', displayTime: '3:30 PM – 5:00 PM', isInstructional: false },
];

/**
 * Volusia County Middle Schools Standard Bell Schedule
 */
export const VOLUSIA_MIDDLE_STANDARD: BellPeriod[] = [
  { id: 'p1', name: 'Period 1', startTime: '09:15', endTime: '10:05', displayTime: '9:15 AM – 10:05 AM', isInstructional: true },
  { id: 'p2', name: 'Period 2', startTime: '10:09', endTime: '10:59', displayTime: '10:09 AM – 10:59 AM', isInstructional: true },
  { id: 'p3', name: 'Period 3', startTime: '11:03', endTime: '11:53', displayTime: '11:03 AM – 11:53 AM', isInstructional: true },
  { id: 'p4', name: 'Period 4', startTime: '11:57', endTime: '13:21', displayTime: '11:57 AM – 1:21 PM', isInstructional: true },
  { id: 'p5', name: 'Period 5', startTime: '13:25', endTime: '14:15', displayTime: '1:25 PM – 2:15 PM', isInstructional: true },
  { id: 'p6', name: 'Period 6', startTime: '14:19', endTime: '15:09', displayTime: '2:19 PM – 3:09 PM', isInstructional: true },
  { id: 'p7', name: 'Period 7', startTime: '15:13', endTime: '16:15', displayTime: '3:13 PM – 4:15 PM', isInstructional: true },
  { id: 'after', name: 'After School', startTime: '16:15', endTime: '17:30', displayTime: '4:15 PM – 5:30 PM', isInstructional: false },
];

export const KNOWN_SCHOOL_SCHEDULES: Record<string, BellPeriod[]> = {
  'deltona high': VOLUSIA_HIGH_STANDARD,
  'deltona high school': VOLUSIA_HIGH_STANDARD,
  'university high': VOLUSIA_HIGH_STANDARD,
  'university high school': VOLUSIA_HIGH_STANDARD,
  'mainland high': VOLUSIA_HIGH_STANDARD,
  'mainland high school': VOLUSIA_HIGH_STANDARD,
  'spruce creek high': VOLUSIA_HIGH_STANDARD,
  'spruce creek': VOLUSIA_HIGH_STANDARD,
  'deland high': VOLUSIA_HIGH_STANDARD,
  'deland high school': VOLUSIA_HIGH_STANDARD,
  'pine ridge high': VOLUSIA_HIGH_STANDARD,
  'seabreeze high': VOLUSIA_HIGH_STANDARD,
  'vol': VOLUSIA_HIGH_STANDARD,
  'heritage middle': VOLUSIA_MIDDLE_STANDARD,
  'deltona middle': VOLUSIA_MIDDLE_STANDARD,
  'galaxy middle': VOLUSIA_MIDDLE_STANDARD,
};

/**
 * Returns the relevant bell schedule periods for a given campus name.
 */
export function getScheduleForSchool(schoolName?: string | null): BellPeriod[] {
  if (!schoolName) return VOLUSIA_HIGH_STANDARD;
  const key = schoolName.toLowerCase().trim();
  if (KNOWN_SCHOOL_SCHEDULES[key]) {
    return KNOWN_SCHOOL_SCHEDULES[key];
  }
  if (key.includes('middle') || key.includes('ms')) {
    return VOLUSIA_MIDDLE_STANDARD;
  }
  return VOLUSIA_HIGH_STANDARD;
}

/**
 * Parse an educator's planning period string (e.g., "3rd", "Period 3", "P3", "3")
 * and match it to a period ID ('p1' through 'p7', or 'after').
 */
export function matchPeriodId(planningString?: string | null): string | null {
  if (!planningString) return null;
  const p = planningString.toLowerCase().trim();

  if (/\b(period\s*1|1st(\s*period)?|p1|per\s*1)\b/i.test(p) || p === '1' || p === '1st') return 'p1';
  if (/\b(period\s*2|2nd(\s*period)?|p2|per\s*2)\b/i.test(p) || p === '2' || p === '2nd') return 'p2';
  if (/\b(period\s*3|3rd(\s*period)?|p3|per\s*3)\b/i.test(p) || p === '3' || p === '3rd') return 'p3';
  if (/\b(period\s*4|4th(\s*period)?|p4|per\s*4)\b/i.test(p) || p === '4' || p === '4th') return 'p4';
  if (/\b(period\s*5|5th(\s*period)?|p5|per\s*5)\b/i.test(p) || p === '5' || p === '5th') return 'p5';
  if (/\b(period\s*6|6th(\s*period)?|p6|per\s*6)\b/i.test(p) || p === '6' || p === '6th') return 'p6';
  if (/\b(period\s*7|7th(\s*period)?|p7|per\s*7)\b/i.test(p) || p === '7' || p === '7th') return 'p7';
  if (p.includes('after') || p.includes('dismissal') || /\b(3:[3-5]\d|[4-5]:\d\d|[4-5]\s*pm)\b/i.test(p)) return 'after';

  return null;
}

/**
 * Returns formatted time window for an educator's planning period.
 * Example: "10:18 AM – 11:06 AM"
 */
export function getPlanningTimeWindow(
  planningPeriod?: string | null,
  schoolName?: string | null
): string | null {
  const periodId = matchPeriodId(planningPeriod);
  if (!periodId) return null;

  const schedule = getScheduleForSchool(schoolName);
  const matchedPeriod = schedule.find((p) => p.id === periodId);
  return matchedPeriod ? matchedPeriod.displayTime : null;
}

/**
 * Returns whether an educator is currently in their planning period right now
 * based on current Florida local time.
 */
export function isTeacherInPlanningNow(
  planningPeriod?: string | null,
  schoolName?: string | null
): { inPlanning: boolean; currentPeriodName?: string; displayTime?: string } {
  const periodId = matchPeriodId(planningPeriod);
  if (!periodId) return { inPlanning: false };

  const schedule = getScheduleForSchool(schoolName);
  const matched = schedule.find((p) => p.id === periodId);
  if (!matched) return { inPlanning: false };

  const now = new Date();
  // Enforce Volusia County Florida Eastern Time (America/New_York)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  const minutePart = parts.find((p) => p.type === 'minute')?.value;
  const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;

  // Check Monday through Friday only
  if (weekdayPart === 'Sat' || weekdayPart === 'Sun') {
    return { inPlanning: false, currentPeriodName: matched.name, displayTime: matched.displayTime };
  }

  const currentHours = hourPart !== undefined ? parseInt(hourPart, 10) : now.getHours();
  const currentMinutes = minutePart !== undefined ? parseInt(minutePart, 10) : now.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  const [startH, startM] = matched.startTime.split(':').map(Number);
  const [endH, endM] = matched.endTime.split(':').map(Number);

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  const isCurrent = currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= endTotalMinutes;

  return {
    inPlanning: isCurrent,
    currentPeriodName: matched.name,
    displayTime: matched.displayTime,
  };
}
