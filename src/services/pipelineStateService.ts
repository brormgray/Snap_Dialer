import { Lead, AppointmentOutcome } from '../types';
import { getScheduleForSchool, matchPeriodId } from '../data/bellSchedules';
import { CalendarService } from './calendarService';
import { NotesService } from './notesService';

export interface AppointmentTimeWindow {
  startDate: Date;
  endDate: Date;
}

export class PipelineStateService {
  /**
   * Scans lead notes or fallbacks to extract an intended appointment date
   */
  static extractAppointmentDateFromLead(lead: Lead, now: Date = new Date()): Date {
    // 1. Explicit appointment_scheduled_at
    if (lead.appointment_scheduled_at && lead.appointment_scheduled_at.trim()) {
      const raw = lead.appointment_scheduled_at.trim();
      const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const hasExplicitNonMidnightTime = /T(?!00:00:00(\.000)?(Z|[+-]\d{2}:\d{2})?$)\d{2}:\d{2}/.test(raw);

      if (dateOnlyMatch && !hasExplicitNonMidnightTime) {
        const y = parseInt(dateOnlyMatch[1], 10);
        const m = parseInt(dateOnlyMatch[2], 10) - 1;
        const d = parseInt(dateOnlyMatch[3], 10);

        const schedule = getScheduleForSchool(lead.school);
        const periodId = matchPeriodId(lead.planning_period);
        const period = periodId ? schedule.find((p) => p.id === periodId) : schedule[2];
        const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);

        return new Date(y, m, d, sH || 9, sM || 0, 0, 0);
      }
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // 2. Try follow_up_at if valid and in future or today
    if (lead.follow_up_at && lead.follow_up_at.trim()) {
      const parsed = new Date(lead.follow_up_at.trim());
      if (!isNaN(parsed.getTime()) && parsed.getTime() > now.getTime() - 12 * 3600000) {
        return parsed;
      }
    }

    // 3. Scan notes for explicit dates or days
    if (lead.notes && lead.notes.trim()) {
      const notes = lead.notes;

      // Check for ISO date in notes: 2026-09-09 or 2026-09-10
      const isoMatch = notes.match(/\b(202\d)-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = parseInt(isoMatch[2], 10) - 1;
        const d = parseInt(isoMatch[3], 10);
        const schedule = getScheduleForSchool(lead.school);
        const periodId = matchPeriodId(lead.planning_period);
        const period = periodId ? schedule.find((p) => p.id === periodId) : schedule[2];
        const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);
        return new Date(y, m, d, sH || 9, sM || 0, 0, 0);
      }

      // Check for Month + Day: "Sep 9", "Sept 10", "September 10"
      const monthMatch = notes.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(202\d))?\b/i);
      if (monthMatch) {
        const monthMap: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
        };
        const m = monthMap[monthMatch[1].toLowerCase()] ?? now.getMonth();
        const d = parseInt(monthMatch[2], 10);
        const y = monthMatch[3] ? parseInt(monthMatch[3], 10) : now.getFullYear();
        const schedule = getScheduleForSchool(lead.school);
        const periodId = matchPeriodId(lead.planning_period);
        const period = periodId ? schedule.find((p) => p.id === periodId) : schedule[2];
        const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);
        return new Date(y, m, d, sH || 9, sM || 0, 0, 0);
      }

      // Check for weekday names: "Thursday", "Wednesday", "Friday"
      const weekdayMatch = notes.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday)\b/i);
      if (weekdayMatch) {
        const dayMap: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5,
        };
        const targetDay = dayMap[weekdayMatch[1].toLowerCase()];
        if (targetDay !== undefined) {
          const target = new Date(now);
          const currentDay = target.getDay();
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7; // Forward to next occurrence
          target.setDate(target.getDate() + diff);

          const schedule = getScheduleForSchool(lead.school);
          const periodId = matchPeriodId(lead.planning_period);
          const period = periodId ? schedule.find((p) => p.id === periodId) : schedule[2];
          const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);
          target.setHours(sH || 9, sM || 0, 0, 0);
          return target;
        }
      }
    }

    // 4. Default: Forward relative to now (Next School Day)
    return CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school, now);
  }

  /**
   * Resolves the start and end Date for a lead's scheduled sit-down
   */
  static getAppointmentWindow(lead: Lead, now: Date = new Date()): AppointmentTimeWindow | null {
    if (lead.last_disposition !== 'appointment_set' && !lead.appointment_scheduled_at) {
      return null;
    }

    // 1. Resolve appointment start date using extractor
    const start = this.extractAppointmentDateFromLead(lead, now);
    if (!start || isNaN(start.getTime())) return null;

    // 2. Resolve appointment window end date using Bell Schedules
    const schedule = getScheduleForSchool(lead.school);
    const periodId = matchPeriodId(lead.planning_period);
    const matchedPeriod = periodId ? schedule.find((p) => p.id === periodId) : null;

    const end = new Date(start);
    if (matchedPeriod && matchedPeriod.endTime) {
      const [endH, endM] = matchedPeriod.endTime.split(':').map(Number);
      // Explicitly lock end to the exact same calendar day as start in local time
      end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
      end.setHours(endH, endM, 0, 0);
      if (end.getTime() <= start.getTime()) {
        end.setTime(start.getTime() + 30 * 60000); // 30-minute fallback buffer
      }
    } else {
      end.setTime(start.getTime() + 30 * 60000); // 30-minute default duration
    }

    return { startDate: start, endDate: end };
  }

  /**
   * True if the appointment window has completely passed
   */
  static isAppointmentWindowEnded(lead: Lead, now: Date = new Date()): boolean {
    const window = this.getAppointmentWindow(lead, now);
    if (!window) return false;
    return now.getTime() >= window.endDate.getTime();
  }

  /**
   * Strict predicate for UPCOMING Confirmed Sit-Downs:
   * - Must have last_disposition === 'appointment_set'
   * - Must NOT be completed/dispositioned (checks outcome, completed_at, is_client, prospect_nurture drip)
   * - Window has NOT ended yet (endDate is in the future)
   */
  static isUpcomingAppointment(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (this.isAppointmentCompleted(lead)) return false;

    const window = this.getAppointmentWindow(lead, now);
    if (!window) return false;

    return window.endDate.getTime() > now.getTime();
  }

  /**
   * Checks if an appointment is scheduled on the exact same calendar day as `now`
   * in Eastern timezone (America/New_York) by default.
   */
  static isAppointmentToday(lead: Lead, now: Date = new Date(), timeZone: string = 'America/New_York'): boolean {
    const window = this.getAppointmentWindow(lead, now);
    if (!window) return false;

    const todayStr = this.formatDateKey(now, timeZone);
    const apptStr = this.formatDateKey(window.startDate, timeZone);
    return todayStr === apptStr;
  }

  /**
   * Strict predicate for UPCOMING Confirmed Sit-Downs TODAY:
   * - Must be an upcoming appointment (window has not ended yet, not completed/dispositioned)
   * - Must be scheduled for TODAY
   */
  static isUpcomingAppointmentToday(lead: Lead, now: Date = new Date(), timeZone: string = 'America/New_York'): boolean {
    if (!this.isUpcomingAppointment(lead, now)) return false;
    return this.isAppointmentToday(lead, now, timeZone);
  }

  static formatDateKey(d: Date, timeZone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  /**
   * Strict predicate for DISPOSITION NEEDED:
   * - Must have last_disposition === 'appointment_set'
   * - Must NOT be completed/dispositioned (checks outcome, completed_at, is_client, prospect_nurture drip)
   * - Must NOT be scheduled for the future (window start or end > now)
   * - Window HAS passed
   */
  static isDispoNeeded(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (this.isAppointmentCompleted(lead)) return false;

    const window = this.getAppointmentWindow(lead, now);
    if (!window) return false;

    // ABSOLUTE SANITY GUARD: If the window start or end is in the future,
    // it is physically impossible for disposition to be needed!
    if (window.startDate.getTime() > now.getTime() || window.endDate.getTime() > now.getTime()) {
      return false;
    }

    return now.getTime() >= window.endDate.getTime();
  }

  /**
   * Returns whether a sit-down appointment has already been concluded/dispositioned.
   * - If the lead is in an active appointment_set state without an explicit outcome, the appointment is NOT completed (even for existing clients!).
   * - If an explicit appointment_outcome or appointment_completed_at is present, it is completed.
   * - If the lead is a client and NOT currently in an active appointment_set state, their past conversion is completed.
   */
  static isAppointmentCompleted(lead: Lead): boolean {
    if (lead.last_disposition === 'appointment_set' && !lead.appointment_outcome && !lead.appointment_completed_at) {
      return false;
    }
    if (Boolean(lead.appointment_outcome || lead.appointment_completed_at)) {
      return true;
    }
    if (Boolean(lead.is_client)) {
      return true;
    }
    return false;
  }

  /**
   * True for any lead with an active, un-dispositioned confirmed sit-down.
   * Includes both upcoming sit-downs and sit-downs scheduled for today
   * awaiting wrap-up/disposition.
   */
  static isActiveAppointment(lead: Lead): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (this.isAppointmentCompleted(lead)) return false;
    return true;
  }

  /**
   * Resolves the effective appointment outcome:
   * Explicit outcome > 'converted' (if client and not actively in appointment_set)
   */
  static getEffectiveAppointmentOutcome(lead: Lead): AppointmentOutcome | null {
    if (lead.appointment_outcome) return lead.appointment_outcome;
    if (Boolean(lead.is_client) && lead.last_disposition !== 'appointment_set') return 'converted';
    return null;
  }

  /**
   * Predicate for SCHEDULED CALLBACK:
   * - Excludes leads that are completed/closed (is_client === true or last_disposition in ['appointment_set', 'connected', 'spoke', 'do_not_call', 'bad_number', 'other']).
   * - Requires that the lead has an explicit scheduled callback: last_disposition === 'callback_requested' or a valid follow_up_at timestamp.
   * - Crucially: Leads with !last_disposition || last_disposition === 'pending' (fresh uncontacted leads) are NEVER callbacks.
   */
  static isScheduledCallback(lead: Lead): boolean {
    if (!lead) return false;
    if (Boolean(lead.is_client)) return false;

    const dispo = lead.last_disposition;
    const EXCLUDED_DISPOSITIONS = [
      'appointment_set',
      'connected',
      'spoke',
      'do_not_call',
      'bad_number',
      'other',
    ];
    if (dispo && EXCLUDED_DISPOSITIONS.includes(dispo)) {
      return false;
    }

    // Crucially: Leads with !last_disposition || last_disposition === 'pending' (fresh uncontacted leads) are NEVER callbacks
    if (!dispo || dispo === 'pending') {
      return false;
    }

    const hasValidFollowUp = Boolean(
      lead.follow_up_at &&
      lead.follow_up_at.trim() &&
      !isNaN(new Date(lead.follow_up_at.trim()).getTime())
    );

    return dispo === 'callback_requested' || hasValidFollowUp;
  }

  /**
   * Predicate for SCHEDULED CALLBACK DUE TODAY:
   * - Must satisfy isScheduledCallback(lead).
   * - Checks whether follow_up_at is due today or overdue (followUpDateKey <= todayDateKey in timeZone).
   * - If follow_up_at is missing but last_disposition === 'callback_requested', treats as due today.
   * - Guarantees the callback remains due until a call is made and properly dispositioned away from callback_requested.
   */
  static isScheduledCallbackDueToday(
    lead: Lead,
    now: Date = new Date(),
    timeZone: string = 'America/New_York'
  ): boolean {
    if (!this.isScheduledCallback(lead)) return false;

    const hasValidFollowUp = Boolean(
      lead.follow_up_at &&
      lead.follow_up_at.trim() &&
      !isNaN(new Date(lead.follow_up_at.trim()).getTime())
    );

    if (hasValidFollowUp && lead.follow_up_at) {
      const raw = lead.follow_up_at.trim();
      const todayDateKey = this.formatDateKey(now, timeZone);
      const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      let followUpDateKey: string;
      if (dateOnlyMatch) {
        followUpDateKey = raw;
      } else {
        const followUpDate = new Date(raw);
        followUpDateKey = this.formatDateKey(followUpDate, timeZone);
      }

      return followUpDateKey <= todayDateKey;
    }

    // If follow_up_at is missing or invalid, but last_disposition === 'callback_requested', treats as due today
    if (lead.last_disposition === 'callback_requested') {
      return true;
    }

    return false;
  }

  /**
   * Returns leads matching isScheduledCallbackDueToday, sorted by follow_up_at ascending.
   */
  static getScheduledCallbacksDueToday(
    leads: Lead[],
    now: Date = new Date(),
    timeZone: string = 'America/New_York'
  ): Lead[] {
    if (!Array.isArray(leads)) return [];

    return leads
      .filter((l) => this.isScheduledCallbackDueToday(l, now, timeZone))
      .sort((a, b) => {
        const timeA = a.follow_up_at && !isNaN(new Date(a.follow_up_at).getTime())
          ? new Date(a.follow_up_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        const timeB = b.follow_up_at && !isNaN(new Date(b.follow_up_at).getTime())
          ? new Date(b.follow_up_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return (a.name || '').localeCompare(b.name || '');
      });
  }

  /**
   * Generates a display badge for a callback lead (e.g. ⏰ 10:15 AM or ⏰ Period 3)
   */
  static getCallbackTimeBadge(
    lead: Lead,
    now: Date = new Date()
  ): { label: string; isOverdue: boolean; isToday: boolean } {
    if (lead.follow_up_at && !isNaN(new Date(lead.follow_up_at).getTime())) {
      const followUp = new Date(lead.follow_up_at);
      const isOverdue = followUp.getTime() < now.getTime();
      const isToday = followUp.toDateString() === now.toDateString();
      const timeStr = followUp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      if (isOverdue) {
        return {
          label: `⏰ ${timeStr} (Overdue)`,
          isOverdue: true,
          isToday,
        };
      }
      if (lead.planning_period) {
        return {
          label: `⏰ ${timeStr} • P${lead.planning_period}`,
          isOverdue: false,
          isToday,
        };
      }
      return {
        label: `⏰ ${timeStr}`,
        isOverdue: false,
        isToday,
      };
    }

    if (lead.planning_period) {
      return {
        label: `⏰ Period ${lead.planning_period}`,
        isOverdue: false,
        isToday: true,
      };
    }

    return {
      label: '⏰ Callback Due',
      isOverdue: false,
      isToday: true,
    };
  }

  /**
   * Extracts a clean note/reason snippet for the callback
   */
  static getCallbackNoteSnippet(lead: Lead): string {
    if (!lead.notes || !lead.notes.trim()) {
      return 'Scheduled callback follow-up';
    }
    const cleanNotes = lead.notes.trim();
    const parsed = NotesService.parseNotes(cleanNotes);
    const cbEntry = parsed.find(
      (n) => n.text.toLowerCase().includes('callback') || n.text.toLowerCase().includes('follow')
    );
    if (cbEntry && cbEntry.text) {
      return cbEntry.text;
    }
    if (parsed.length > 0 && parsed[0].text) {
      return parsed[0].text;
    }
    return cleanNotes.replace(/^\[[^\]]+\]\s*/, '');
  }
}
