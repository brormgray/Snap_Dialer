export interface LeadLike {
  id?: string;
  name?: string;
  school?: string | null;
  room_number?: string | null;
  planning_period?: string | null;
  appointment_scheduled_at?: string | null;
  follow_up_at?: string | null;
  last_disposition?: string | null;
  notes?: string | null;
  meeting_preferences?: string[] | null;
  [key: string]: any;
}

export type RelativeDateCategory =
  | 'today_future'
  | 'today_past'
  | 'tomorrow'
  | 'yesterday'
  | 'this_week'
  | 'next_week'
  | 'future_date'
  | 'past_date';

export interface RelativeTimeInfo {
  targetDate: Date;
  refDate: Date;
  category: RelativeDateCategory;
  isToday: boolean;
  isTomorrow: boolean;
  isPast: boolean;
  dateStr: string;           // e.g. "Thu, Sep 17"
  timeStr: string;           // e.g. "2:15 PM"
  shortRelative: string;     // e.g. "later today", "tomorrow", "this Friday", "next Tuesday"
  fullRelativePhrase: string;// e.g. "later today at 2:15 PM", "tomorrow at 10:15 AM", "this Friday at 1:15 PM"
  dayLabel: string;          // e.g. "today", "tomorrow", "Friday", "Sep 22"
}

export class DateTimeAwareService {
  /**
   * Default time zone for Florida public school districts
   */
  static readonly DEFAULT_TIMEZONE = 'America/New_York';

  /**
   * Returns a normalized YYYY-MM-DD string in the target timezone
   */
  static formatDateKey(date: Date, timeZone: string = this.DEFAULT_TIMEZONE): string {
    const valid = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(valid);
    } catch {
      return valid.toISOString().slice(0, 10);
    }
  }

  /**
   * Returns a clean localized time string (e.g., "1:15 PM")
   */
  static formatTime(date: Date, timeZone: string = this.DEFAULT_TIMEZONE): string {
    const valid = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(valid);
    } catch {
      return valid.toLocaleTimeString();
    }
  }

  /**
   * Returns a clean localized date string (e.g., "Thu, Sep 17")
   */
  static formatDate(date: Date, timeZone: string = this.DEFAULT_TIMEZONE): string {
    const valid = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(valid);
    } catch {
      return valid.toLocaleDateString();
    }
  }

  /**
   * Resolves the appointment Date from a Lead (using appointment_scheduled_at, follow_up_at, or notes)
   */
  static resolveAppointmentDate(lead: LeadLike, refDate: Date = new Date()): Date | null {
    if (lead.appointment_scheduled_at && lead.appointment_scheduled_at.trim()) {
      const parsed = new Date(lead.appointment_scheduled_at.trim());
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (lead.follow_up_at && lead.follow_up_at.trim()) {
      const parsed = new Date(lead.follow_up_at.trim());
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (lead.notes) {
      const isoMatch = lead.notes.match(/\b(202\d)-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = parseInt(isoMatch[2], 10) - 1;
        const d = parseInt(isoMatch[3], 10);
        return new Date(y, m, d, 10, 0, 0, 0);
      }
    }
    return null;
  }

  /**
   * Evaluates the relative relationship between a target appointment date and the current moment
   */
  static getRelativeTimeInfo(
    targetDateInput: Date | string,
    refDateInput: Date | string = new Date(),
    timeZone: string = this.DEFAULT_TIMEZONE
  ): RelativeTimeInfo {
    const targetDate = typeof targetDateInput === 'string' ? new Date(targetDateInput) : targetDateInput;
    const refDate = typeof refDateInput === 'string' ? new Date(refDateInput) : refDateInput;

    const validTarget = !isNaN(targetDate.getTime()) ? targetDate : new Date();
    const validRef = !isNaN(refDate.getTime()) ? refDate : new Date();

    const targetKey = this.formatDateKey(validTarget, timeZone);
    const refKey = this.formatDateKey(validRef, timeZone);

    const timeStr = this.formatTime(validTarget, timeZone);
    const dateStr = this.formatDate(validTarget, timeZone);

    const targetDayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(validTarget);
    const targetMonthDay = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(validTarget);

    // Compute day difference based on calendar dates (UTC midnight of each date key)
    const [tY, tM, tD] = targetKey.split('-').map(Number);
    const [rY, rM, rD] = refKey.split('-').map(Number);
    const targetMidnight = Date.UTC(tY, tM - 1, tD);
    const refMidnight = Date.UTC(rY, rM - 1, rD);
    const diffCalendarDays = Math.round((targetMidnight - refMidnight) / 86400000);

    const isPastExact = validTarget.getTime() < validRef.getTime();

    // 1. Same Day (Today)
    if (diffCalendarDays === 0) {
      if (!isPastExact) {
        // Target is later today
        const targetHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(validTarget), 10);
        const refHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(validRef), 10);
        
        let relativeDesc = 'later today';
        if (targetHour >= 12 && refHour < 12) {
          relativeDesc = 'this afternoon';
        } else if (targetHour < 12) {
          relativeDesc = 'this morning';
        }

        return {
          targetDate: validTarget,
          refDate: validRef,
          category: 'today_future',
          isToday: true,
          isTomorrow: false,
          isPast: false,
          dateStr,
          timeStr,
          shortRelative: relativeDesc,
          fullRelativePhrase: `${relativeDesc} at ${timeStr}`,
          dayLabel: 'today',
        };
      } else {
        // Target occurred earlier today
        return {
          targetDate: validTarget,
          refDate: validRef,
          category: 'today_past',
          isToday: true,
          isTomorrow: false,
          isPast: true,
          dateStr,
          timeStr,
          shortRelative: 'earlier today',
          fullRelativePhrase: `earlier today at ${timeStr}`,
          dayLabel: 'today',
        };
      }
    }

    // 2. Tomorrow (+1 calendar day)
    if (diffCalendarDays === 1) {
      return {
        targetDate: validTarget,
        refDate: validRef,
        category: 'tomorrow',
        isToday: false,
        isTomorrow: true,
        isPast: false,
        dateStr,
        timeStr,
        shortRelative: 'tomorrow',
        fullRelativePhrase: `tomorrow at ${timeStr}`,
        dayLabel: 'tomorrow',
      };
    }

    // 3. Yesterday (-1 calendar day)
    if (diffCalendarDays === -1) {
      return {
        targetDate: validTarget,
        refDate: validRef,
        category: 'yesterday',
        isToday: false,
        isTomorrow: false,
        isPast: true,
        dateStr,
        timeStr,
        shortRelative: 'yesterday',
        fullRelativePhrase: `yesterday at ${timeStr}`,
        dayLabel: 'yesterday',
      };
    }

    // 4. Future: 2 to 6 days
    if (diffCalendarDays >= 2 && diffCalendarDays <= 6) {
      // Check if target is within the same Monday-Sunday work cycle or next week
      // Get day of week (0=Sun, 1=Mon, ..., 6=Sat)
      const refDow = new Date(rY, rM - 1, rD).getDay();
      const targetDow = new Date(tY, tM - 1, tD).getDay();

      // If target DOW is greater than ref DOW and ref isn't Sunday, it's later "this week"
      const isLaterThisWeek = refDow >= 1 && refDow < 5 && targetDow > refDow && diffCalendarDays <= (5 - refDow);

      if (isLaterThisWeek) {
        return {
          targetDate: validTarget,
          refDate: validRef,
          category: 'this_week',
          isToday: false,
          isTomorrow: false,
          isPast: false,
          dateStr,
          timeStr,
          shortRelative: `this ${targetDayName}`,
          fullRelativePhrase: `this ${targetDayName} at ${timeStr}`,
          dayLabel: targetDayName,
        };
      } else {
        // Spills into next week
        return {
          targetDate: validTarget,
          refDate: validRef,
          category: 'next_week',
          isToday: false,
          isTomorrow: false,
          isPast: false,
          dateStr,
          timeStr,
          shortRelative: `next ${targetDayName}`,
          fullRelativePhrase: `next ${targetDayName} (${targetMonthDay}) at ${timeStr}`,
          dayLabel: `next ${targetDayName}`,
        };
      }
    }

    // 5. Future: 7+ days
    if (diffCalendarDays > 6) {
      return {
        targetDate: validTarget,
        refDate: validRef,
        category: 'future_date',
        isToday: false,
        isTomorrow: false,
        isPast: false,
        dateStr,
        timeStr,
        shortRelative: `on ${targetMonthDay}`,
        fullRelativePhrase: `on ${targetDayName}, ${targetMonthDay} at ${timeStr}`,
        dayLabel: `${targetMonthDay}`,
      };
    }

    // 6. Past (< -1 calendar days)
    return {
      targetDate: validTarget,
      refDate: validRef,
      category: 'past_date',
      isToday: false,
      isTomorrow: false,
      isPast: true,
      dateStr,
      timeStr,
      shortRelative: `on ${targetDayName}`,
      fullRelativePhrase: `on ${targetDayName}, ${targetMonthDay} at ${timeStr}`,
      dayLabel: targetDayName,
    };
  }

  /**
   * Returns a contextual school-day outreach timeframe when NO appointment has been booked yet.
   * Prevents suggesting "this week" on a Friday afternoon or "tomorrow" on a Friday/weekend.
   */
  static getSuggestedOutreachTimeframe(refDate: Date = new Date(), timeZone: string = this.DEFAULT_TIMEZONE): {
    timeframePhrase: string; // e.g. "this week", "early next week", "tomorrow"
    planningSuggestion: string; // e.g. "during your planning period this week", "early next week during planning"
  } {
    const dow = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(refDate);
    const hour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(refDate), 10);

    // Friday after lunch or late Friday
    if (dow === 'Fri') {
      if (hour >= 12) {
        return {
          timeframePhrase: 'early next week',
          planningSuggestion: 'early next week during your planning period',
        };
      }
      return {
        timeframePhrase: 'today or Monday',
        planningSuggestion: 'today or Monday during your planning period',
      };
    }

    // Weekend
    if (dow === 'Sat' || dow === 'Sun') {
      return {
        timeframePhrase: 'this coming week',
        planningSuggestion: 'this week during your planning period',
      };
    }

    // Thursday afternoon
    if (dow === 'Thu' && hour >= 13) {
      return {
        timeframePhrase: 'tomorrow or early next week',
        planningSuggestion: 'tomorrow or Monday during planning',
      };
    }

    // Monday through Wednesday / Thursday morning
    return {
      timeframePhrase: 'this week',
      planningSuggestion: 'this week during your planning period',
    };
  }

  /**
   * Extracts clean replacement tokens for appointment and temporal text composition
   */
  static getAppointmentTokens(
    lead: LeadLike,
    refDate: Date = new Date(),
    timeZone: string = this.DEFAULT_TIMEZONE
  ): {
    appointmentDate: string;
    appointmentTime: string;
    appointmentRelative: string;
    appointmentDay: string;
    appointmentDatetime: string;
    hasAppointment: boolean;
    relativeInfo: RelativeTimeInfo | null;
  } {
    const apptDate = this.resolveAppointmentDate(lead, refDate);
    if (!apptDate) {
      const outreach = this.getSuggestedOutreachTimeframe(refDate, timeZone);
      return {
        appointmentDate: 'soon',
        appointmentTime: 'during your planning period',
        appointmentRelative: outreach.timeframePhrase,
        appointmentDay: outreach.timeframePhrase,
        appointmentDatetime: outreach.planningSuggestion,
        hasAppointment: false,
        relativeInfo: null,
      };
    }

    const rel = this.getRelativeTimeInfo(apptDate, refDate, timeZone);
    return {
      appointmentDate: rel.dateStr,
      appointmentTime: rel.timeStr,
      appointmentRelative: rel.shortRelative,
      appointmentDay: rel.dayLabel,
      appointmentDatetime: rel.fullRelativePhrase,
      hasAppointment: true,
      relativeInfo: rel,
    };
  }
}
