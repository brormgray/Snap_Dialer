import { Lead } from '../types';
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
      start = CalendarService.calculateNextPlanningDate(lead.planning_period, lead.school);
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
   * - Must NOT have an appointment_outcome or appointment_completed_at
   * - Window has NOT ended yet
   */
  static isUpcomingAppointment(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return !this.isAppointmentWindowEnded(lead, now);
  }

  /**
   * Strict predicate for DISPOSITION NEEDED:
   * - Must have last_disposition === 'appointment_set'
   * - Must NOT have an appointment_outcome or appointment_completed_at
   * - Window HAS passed
   */
  static isDispoNeeded(lead: Lead, now: Date = new Date()): boolean {
    if (lead.last_disposition !== 'appointment_set') return false;
    if (lead.appointment_outcome || lead.appointment_completed_at) return false;
    return this.isAppointmentWindowEnded(lead, now);
  }

  /**
   * Returns whether a sit-down appointment has already been concluded/dispositioned
   */
  static isAppointmentCompleted(lead: Lead): boolean {
    return Boolean(lead.appointment_outcome || lead.appointment_completed_at);
  }
}
