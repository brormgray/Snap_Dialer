import { Lead, AppointmentOutcome } from '../types';
import { getScheduleForSchool, matchPeriodId } from '../data/bellSchedules';
import { CalendarService } from './calendarService';

export interface AppointmentTimeWindow {
  startDate: Date;
  endDate: Date;
}

export class PipelineStateService {
  /**
   * Resolves the start and end Date for a lead's scheduled sit-down
   */
  static getAppointmentWindow(lead: Lead, now: Date = new Date()): AppointmentTimeWindow | null {
    if (lead.last_disposition !== 'appointment_set' && !lead.appointment_scheduled_at) {
      return null;
    }

    // 1. Resolve appointment start date
    let start: Date | null = null;
    if (lead.appointment_scheduled_at) {
      const raw = lead.appointment_scheduled_at.trim();
      const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const hasExplicitNonMidnightTime = /T(?!00:00:00(\.000)?(Z|[+-]\d{2}:\d{2})?$)\d{2}:\d{2}/.test(raw);

      if (dateOnlyMatch && !hasExplicitNonMidnightTime) {
        // Parse calendar year, month (0-indexed), and day in local time to prevent UTC midnight shift
        const y = parseInt(dateOnlyMatch[1], 10);
        const m = parseInt(dateOnlyMatch[2], 10) - 1;
        const d = parseInt(dateOnlyMatch[3], 10);

        const schedule = getScheduleForSchool(lead.school);
        const periodId = matchPeriodId(lead.planning_period);
        const period = periodId ? schedule.find((p) => p.id === periodId) : schedule[2];
        const [sH, sM] = (period?.startTime || '09:00').split(':').map(Number);

        start = new Date(y, m, d, sH || 9, sM || 0, 0, 0);
      } else {
        start = new Date(raw);
      }
    } else if (lead.follow_up_at) {
      start = new Date(lead.follow_up_at);
    } else {
      // For leads without an explicit scheduled timestamp, anchor the planning date calculation
      // forward from now if booked within the last 24h, or from bookingTimestamp if older
      const bookingTimestamp = lead.last_attempt_at || lead.updated_at || lead.created_at;
      const refDate = bookingTimestamp ? new Date(bookingTimestamp) : now;
      const validRef = !isNaN(refDate.getTime()) ? refDate : now;
      const isBookedRecently = Math.abs(now.getTime() - validRef.getTime()) < 24 * 3600000;
      const anchor = isBookedRecently ? now : validRef;
      start = CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school, anchor);
    }

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
   * - Window has NOT ended yet
   */
  static isUpcomingAppointment(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (this.isAppointmentCompleted(lead)) return false;
    return !this.isAppointmentWindowEnded(lead, now);
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

  private static formatDateKey(d: Date, timeZone: string): string {
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
   * - Window HAS passed
   */
  static isDispoNeeded(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (this.isAppointmentCompleted(lead)) return false;
    return this.isAppointmentWindowEnded(lead, now);
  }

  /**
   * Returns whether a sit-down appointment has already been concluded/dispositioned.
   * If lead.is_client is true or lead.drip_track is 'prospect_nurture', the sit-down
   * is automatically treated as completed/dispositioned.
   */
  static isAppointmentCompleted(lead: Lead): boolean {
    if (Boolean(lead.is_client) || lead.drip_track === 'prospect_nurture') {
      return true;
    }
    return Boolean(lead.appointment_outcome || lead.appointment_completed_at);
  }

  /**
   * Resolves the effective appointment outcome:
   * Explicit outcome > 'converted' (if client) > 'nurture_drip' (if prospect nurture)
   */
  static getEffectiveAppointmentOutcome(lead: Lead): AppointmentOutcome | null {
    if (lead.appointment_outcome) return lead.appointment_outcome;
    if (Boolean(lead.is_client)) return 'converted';
    if (lead.drip_track === 'prospect_nurture') return 'nurture_drip';
    return null;
  }
}
