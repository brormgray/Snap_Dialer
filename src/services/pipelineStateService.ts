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
    let start: Date;
    if (lead.appointment_scheduled_at) {
      start = new Date(lead.appointment_scheduled_at);
    } else if (lead.follow_up_at) {
      start = new Date(lead.follow_up_at);
    } else {
      // For leads without an explicit scheduled timestamp, anchor the planning date calculation
      // to when the appointment was actually booked rather than perpetually projecting forward from now
      const bookingTimestamp = lead.last_attempt_at || lead.updated_at || lead.created_at;
      const refDate = bookingTimestamp ? new Date(bookingTimestamp) : now;
      const validRefDate = !isNaN(refDate.getTime()) ? refDate : now;
      start = CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school, validRefDate);
    }

    if (isNaN(start.getTime())) return null;

    // 2. Resolve appointment window end date using Bell Schedules
    const schedule = getScheduleForSchool(lead.school);
    const periodId = matchPeriodId(lead.planning_period);
    const matchedPeriod = periodId ? schedule.find((p) => p.id === periodId) : null;

    const end = new Date(start);
    if (matchedPeriod && matchedPeriod.endTime) {
      const [endH, endM] = matchedPeriod.endTime.split(':').map(Number);
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
