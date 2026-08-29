export interface ProspectTimeInfo {
  areaCode: string;
  state: string;
  timeZoneName: string;
  localTimeFormatted: string;
  isSafeToCall: boolean;
  warningMessage?: string;
}

// Area code to State & TimeZone offset lookup map
const AREA_CODE_MAP: { [code: string]: { state: string; tz: string } } = {
  // Eastern (America/New_York)
  '201': { state: 'NJ', tz: 'America/New_York' },
  '203': { state: 'CT', tz: 'America/New_York' },
  '212': { state: 'NY', tz: 'America/New_York' },
  '215': { state: 'PA', tz: 'America/New_York' },
  '216': { state: 'OH', tz: 'America/New_York' },
  '239': { state: 'FL', tz: 'America/New_York' },
  '240': { state: 'MD', tz: 'America/New_York' },
  '305': { state: 'FL', tz: 'America/New_York' },
  '321': { state: 'FL', tz: 'America/New_York' },
  '347': { state: 'NY', tz: 'America/New_York' },
  '352': { state: 'FL', tz: 'America/New_York' },
  '386': { state: 'FL', tz: 'America/New_York' },
  '404': { state: 'GA', tz: 'America/New_York' },
  '407': { state: 'FL', tz: 'America/New_York' },
  '410': { state: 'MD', tz: 'America/New_York' },
  '516': { state: 'NY', tz: 'America/New_York' },
  '518': { state: 'NY', tz: 'America/New_York' },
  '561': { state: 'FL', tz: 'America/New_York' },
  '617': { state: 'MA', tz: 'America/New_York' },
  '646': { state: 'NY', tz: 'America/New_York' },
  '689': { state: 'FL', tz: 'America/New_York' },
  '704': { state: 'NC', tz: 'America/New_York' },
  '718': { state: 'NY', tz: 'America/New_York' },
  '770': { state: 'GA', tz: 'America/New_York' },
  '772': { state: 'FL', tz: 'America/New_York' },
  '786': { state: 'FL', tz: 'America/New_York' },
  '813': { state: 'FL', tz: 'America/New_York' },
  '845': { state: 'NY', tz: 'America/New_York' },
  '850': { state: 'FL', tz: 'America/New_York' },
  '856': { state: 'NJ', tz: 'America/New_York' },
  '863': { state: 'FL', tz: 'America/New_York' },
  '904': { state: 'FL', tz: 'America/New_York' },
  '908': { state: 'NJ', tz: 'America/New_York' },
  '914': { state: 'NY', tz: 'America/New_York' },
  '917': { state: 'NY', tz: 'America/New_York' },
  '954': { state: 'FL', tz: 'America/New_York' },
  '973': { state: 'NJ', tz: 'America/New_York' },

  // Central (America/Chicago)
  '214': { state: 'TX', tz: 'America/Chicago' },
  '281': { state: 'TX', tz: 'America/Chicago' },
  '312': { state: 'IL', tz: 'America/Chicago' },
  '314': { state: 'MO', tz: 'America/Chicago' },
  '469': { state: 'TX', tz: 'America/Chicago' },
  '512': { state: 'TX', tz: 'America/Chicago' },
  '615': { state: 'TN', tz: 'America/Chicago' },
  '708': { state: 'IL', tz: 'America/Chicago' },
  '713': { state: 'TX', tz: 'America/Chicago' },
  '773': { state: 'IL', tz: 'America/Chicago' },
  '817': { state: 'TX', tz: 'America/Chicago' },
  '832': { state: 'TX', tz: 'America/Chicago' },
  '972': { state: 'TX', tz: 'America/Chicago' },

  // Mountain (America/Denver)
  '303': { state: 'CO', tz: 'America/Denver' },
  '480': { state: 'AZ', tz: 'America/Phoenix' },
  '505': { state: 'NM', tz: 'America/Denver' },
  '602': { state: 'AZ', tz: 'America/Phoenix' },
  '623': { state: 'AZ', tz: 'America/Phoenix' },
  '719': { state: 'CO', tz: 'America/Denver' },
  '720': { state: 'CO', tz: 'America/Denver' },
  '801': { state: 'UT', tz: 'America/Denver' },
  '970': { state: 'CO', tz: 'America/Denver' },

  // Pacific (America/Los_Angeles)
  '206': { state: 'WA', tz: 'America/Los_Angeles' },
  '209': { state: 'CA', tz: 'America/Los_Angeles' },
  '213': { state: 'CA', tz: 'America/Los_Angeles' },
  '253': { state: 'WA', tz: 'America/Los_Angeles' },
  '310': { state: 'CA', tz: 'America/Los_Angeles' },
  '323': { state: 'CA', tz: 'America/Los_Angeles' },
  '408': { state: 'CA', tz: 'America/Los_Angeles' },
  '415': { state: 'CA', tz: 'America/Los_Angeles' },
  '425': { state: 'WA', tz: 'America/Los_Angeles' },
  '503': { state: 'OR', tz: 'America/Los_Angeles' },
  '510': { state: 'CA', tz: 'America/Los_Angeles' },
  '562': { state: 'CA', tz: 'America/Los_Angeles' },
  '619': { state: 'CA', tz: 'America/Los_Angeles' },
  '626': { state: 'CA', tz: 'America/Los_Angeles' },
  '650': { state: 'CA', tz: 'America/Los_Angeles' },
  '702': { state: 'NV', tz: 'America/Los_Angeles' },
  '714': { state: 'CA', tz: 'America/Los_Angeles' },
  '760': { state: 'CA', tz: 'America/Los_Angeles' },
  '818': { state: 'CA', tz: 'America/Los_Angeles' },
  '858': { state: 'CA', tz: 'America/Los_Angeles' },
  '916': { state: 'CA', tz: 'America/Los_Angeles' },
  '925': { state: 'CA', tz: 'America/Los_Angeles' },
  '949': { state: 'CA', tz: 'America/Los_Angeles' },
  '971': { state: 'OR', tz: 'America/Los_Angeles' },
};

export class TimeZoneService {
  /**
   * Resolves area code, state, and calculates prospect local time and calling compliance safety
   */
  static getProspectTimeInfo(phone: string): ProspectTimeInfo {
    const digits = phone.replace(/\D/g, '');
    let areaCode = '';

    if (digits.length === 10) {
      areaCode = digits.substring(0, 3);
    } else if (digits.length === 11 && digits.startsWith('1')) {
      areaCode = digits.substring(1, 4);
    }

    const mapping = AREA_CODE_MAP[areaCode] || { state: 'US', tz: 'America/New_York' };

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: mapping.tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      });

      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: mapping.tz,
        hour: 'numeric',
        hourCycle: 'h23',
      });

      const localTimeFormatted = formatter.format(now);
      const localHour = parseInt(hourFormatter.format(now), 10);

      // Safe window under Florida FTSA § 501.059 & TCPA: 8:00 AM (8) to 8:00 PM (19:59)
      const isSafeToCall = localHour >= 8 && localHour < 20;
      let warningMessage: string | undefined;

      if (localHour < 8) {
        warningMessage = `Early morning (${localTimeFormatted})`;
      } else if (localHour >= 20) {
        warningMessage = `Late evening (${localTimeFormatted})`;
      }

      const tzAbbr = this.getTimeZoneAbbr(mapping.tz);

      return {
        areaCode: areaCode || 'N/A',
        state: mapping.state,
        timeZoneName: tzAbbr,
        localTimeFormatted,
        isSafeToCall,
        warningMessage,
      };
    } catch {
      return {
        areaCode: areaCode || 'N/A',
        state: mapping.state,
        timeZoneName: 'EST',
        localTimeFormatted: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        isSafeToCall: true,
      };
    }
  }

  private static getTimeZoneAbbr(tz: string): string {
    if (tz.includes('New_York')) return 'EST';
    if (tz.includes('Chicago')) return 'CST';
    if (tz.includes('Denver')) return 'MST';
    if (tz.includes('Phoenix')) return 'MST';
    if (tz.includes('Los_Angeles')) return 'PST';
    return 'EST';
  }
}
