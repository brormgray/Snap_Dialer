import { Platform, Linking, Share } from 'react-native';
import { Lead } from '../types';
import { getScheduleForSchool, matchPeriodId } from '../data/bellSchedules';

export interface CalendarEventPayload {
  title: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
  alarmMinutes?: number;
  contactName?: string;
  contactPhone?: string;
}

export class CalendarService {
  /**
   * Builds an RFC 5545 compliant .ics calendar event string
   */
  static generateIcsString(event: CalendarEventPayload): string {
    const formatDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const nowStr = formatDate(new Date());
    const startStr = formatDate(event.startDate);
    const endStr = formatDate(event.endDate);
    const uid = `snapdialer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}@snapdialer.app`;
    const alarmMins = event.alarmMinutes || 15;

    const cleanText = (str: string) =>
      str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SnapDialer//Retirement Scheduling Engine//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${cleanText(event.title)}`,
      `LOCATION:${cleanText(event.location)}`,
      `DESCRIPTION:${cleanText(event.description)}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmMins}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${cleanText(event.title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /**
   * Triggers download or direct opening of the .ics file (Apple Calendar / Outlook on iOS/Mac/PC)
   */
  static async downloadIcsFile(event: CalendarEventPayload): Promise<boolean> {
    try {
      const icsData = this.generateIcsString(event);
      const isFrs = !event.title.includes('Retirement Review');
      const prefix = isFrs ? 'FRS_SitDown' : 'Retirement_Review';
      const defaultContact = isFrs ? 'Educator' : 'Client';
      const filename = `${prefix}_${(event.contactName || defaultContact).replace(/\s+/g, '_')}.ics`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      }

      await Share.share({
        title: filename,
        message: icsData,
      });
      return true;
    } catch (e) {
      console.error('Failed to export .ics calendar file:', e);
      return false;
    }
  }

  /**
   * Generates Google Calendar web composer direct link
   */
  static getGoogleCalendarUrl(event: CalendarEventPayload): string {
    const formatGDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dates = `${formatGDate(event.startDate)}/${formatGDate(event.endDate)}`;
    const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

    const params = new URLSearchParams({
      text: event.title,
      dates: dates,
      location: event.location,
      details: event.description,
    });

    return `${base}&${params.toString()}`;
  }

  /**
   * Generates Microsoft Outlook Web / Office 365 composer direct link
   */
  static getOutlookCalendarUrl(event: CalendarEventPayload): string {
    const base = 'https://outlook.live.com/calendar/0/deeplink/compose';
    const params = new URLSearchParams({
      subject: event.title,
      startdt: event.startDate.toISOString(),
      enddt: event.endDate.toISOString(),
      location: event.location,
      body: event.description,
    });
    return `${base}?${params.toString()}`;
  }

  /**
   * Opens Google Calendar directly in browser or native calendar app
   */
  static openGoogleCalendar(event: CalendarEventPayload) {
    const url = this.getGoogleCalendarUrl(event);
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch((err) => console.warn('Could not open Google Calendar link:', err));
    }
  }

  /**
   * Opens Outlook Calendar directly in browser or native calendar app
   */
  static openOutlookCalendar(event: CalendarEventPayload) {
    const url = this.getOutlookCalendarUrl(event);
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch((err) => console.warn('Could not open Outlook link:', err));
    }
  }

  /**
   * Creates a pre-populated event payload for a ValuTeachers Educator
   */
  static buildEducatorEvent(
    lead: Lead,
    scheduledDate?: Date,
    durationMinutes: number = 20,
    customNotes?: string | null,
    meetingPurpose?: string | null
  ): CalendarEventPayload {
    const validStart = (scheduledDate instanceof Date && !isNaN(scheduledDate.getTime())) ? scheduledDate : new Date();
    const endDate = new Date(validStart.getTime() + durationMinutes * 60000);
    const isFrs = lead.is_frs !== false;
    const roomStr = lead.room_number ? `Room ${lead.room_number}` : (isFrs ? 'Classroom' : '');
    const schoolStr = lead.school || (isFrs ? 'Campus' : 'Office/Remote');
    const planningStr = isFrs && lead.planning_period ? ` (${lead.planning_period})` : '';

    const PURPOSE_MAP: Record<string, { label: string; desc: string }> = {
      annual_review: {
        label: 'Annual Client Review',
        desc: 'Annual Client Review & Portfolio Inspection',
      },
      product_enhancement: {
        label: 'Product Enhancement',
        desc: 'Product Enhancement & Benefits Upgrade',
      },
      frs_review: {
        label: 'FRS Pension & DROP Review',
        desc: 'FRS Pension & DROP Strategy Consultation',
      },
      policy_service: {
        label: 'Policy Service',
        desc: 'Policy Service & Beneficiary Review',
      },
      general_sitdown: {
        label: 'Sit-Down Consultation',
        desc: 'General Retirement & Financial Sit-Down Consultation',
      },
    };

    const purposeConfig = meetingPurpose ? PURPOSE_MAP[meetingPurpose] : undefined;
    const purposeLabel = purposeConfig ? purposeConfig.label : meetingPurpose;

    const title = purposeLabel
      ? `🎯 ${purposeLabel}: ${lead.name}${planningStr}`
      : isFrs
      ? `🎯 FRS Sit-Down: ${lead.name}${planningStr}`
      : `🎯 Retirement Review: ${lead.name}`;
    const location = roomStr ? `${schoolStr} • ${roomStr}` : schoolStr;

    const description = [
      purposeConfig
        ? `${purposeConfig.desc} with ${lead.name}`
        : purposeLabel
        ? `${purposeLabel} with ${lead.name}`
        : isFrs
        ? `FRS & Retirement Review with ${lead.name}`
        : `Retirement Strategy Review with ${lead.name}`,
      `Location: ${location}`,
      lead.planning_period ? `Best Window: ${lead.planning_period}` : null,
      `Phone: ${lead.phone}`,
      isFrs && lead.years_in_frs ? `Years in FRS: ${lead.years_in_frs}` : null,
      lead.frs_interests?.length ? `Focus Topics: ${lead.frs_interests.join(', ')}` : null,
      lead.custom_questions ? `Inquiries: "${lead.custom_questions}"` : null,
      customNotes ? `Appointment Notes: ${customNotes}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      title,
      description,
      location,
      startDate: validStart,
      endDate,
      alarmMinutes: 15,
      contactName: lead.name,
      contactPhone: lead.phone,
    };
  }

  /**
   * Calculates the next school-day occurrence of an educator's planning period relative to a reference date.
   * If the reference date is a weekday and the planning period hasn't ended yet as of that date/time,
   * schedules for that date. Otherwise, schedules for the next school day (skipping weekends).
   * 
   * @param referenceDate Optional anchor date for the calculation (defaults to new Date()).
   */
  static calculateNextPlanningDate(
    planningPeriod?: string | null,
    schoolName?: string | null,
    referenceDate: Date = new Date()
  ): Date {
    const ref = (referenceDate instanceof Date && !isNaN(referenceDate.getTime())) ? referenceDate : new Date();
    const schedule = getScheduleForSchool(schoolName);
    const periodId = matchPeriodId(planningPeriod);
    const period = schedule.find((p) => p.id === periodId) || schedule[2]; // Default to Period 3 if unknown

    const targetDate = new Date(ref);
    const [startHour, startMinute] = (period.startTime || '09:00').split(':').map(Number);
    targetDate.setHours(startHour || 9, startMinute || 0, 0, 0);

    const dayOfWeek = targetDate.getDay(); // 0 = Sun, 6 = Sat
    if (targetDate.getTime() <= ref.getTime() || dayOfWeek === 0 || dayOfWeek === 6) {
      targetDate.setDate(targetDate.getDate() + 1);
      while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    return targetDate;
  }
}
