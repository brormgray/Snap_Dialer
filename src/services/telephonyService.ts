import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { Lead, SMSTemplate } from '../types';
import { DateTimeAwareService } from './dateTimeAwareService';

export class TelephonyService {
  /**
   * Cleans a raw phone string into standard dialable digits
   */
  static sanitizePhoneNumber(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Triggers a zero-cost native cellular call via OS URL scheme (tel:)
   */
  static async makeCall(phone: string): Promise<boolean> {
    const cleanNumber = this.sanitizePhoneNumber(phone);
    if (!cleanNumber) return false;

    const url = `tel:${cleanNumber}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try {
            document.body.removeChild(link);
          } catch {}
        }, 150);
        return true;
      } catch (e) {
        console.warn('Web tel link click error, trying location.href fallback:', e);
        try {
          window.location.href = url;
          return true;
        } catch (err) {
          console.warn('Web tel location.href error:', err);
        }
      }
    }

    try {
      await Linking.openURL(url);
      return true;
    } catch (e) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
          return true;
        }
      } catch {}
      return false;
    }
  }

  /**
   * Prepares and opens the native SMS app with a pre-filled message template ($0 cost)
   */
  static async sendSMS(phone: string, messageBody: string): Promise<boolean> {
    const cleanNumber = this.sanitizePhoneNumber(phone);
    if (!cleanNumber) return false;

    // Detect iOS on native and on Web (Safari / PWA / iPad / iPhone)
    const isIOS =
      Platform.OS === 'ios' ||
      (typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)));

    const separator = isIOS ? '&' : '?';
    const encodedBody = encodeURIComponent(messageBody);
    const url = `sms:${cleanNumber}${separator}body=${encodedBody}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try {
            document.body.removeChild(link);
          } catch {}
        }, 150);
        return true;
      } catch (e) {
        console.warn('Web SMS link click error, trying location.href fallback:', e);
        try {
          window.location.href = url;
          return true;
        } catch (err) {
          console.warn('Web SMS location.href error:', err);
        }
      }
    }

    try {
      await Linking.openURL(url);
      return true;
    } catch (e) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
          return true;
        }
      } catch {}
      return false;
    }
  }

  /**
   * Semantic alias for makeCall
   */
  static async dialNumber(phone: string): Promise<boolean> {
    return this.makeCall(phone);
  }

  /**
   * Replaces dynamic tokens ({{name}}, {{school}}, {{planning_period}}, {{room_number}}, {{years_in_frs}}, {{meeting_pref}}, {{my_name}}, {{appointment_date}}, {{appointment_time}}, {{appointment_relative}}, {{appointment_day}}, {{appointment_datetime}}) with lead info
   */
  static interpolateTemplate(
    template: SMSTemplate,
    lead: Lead,
    myName: string = 'Alex',
    refDate: Date = new Date()
  ): string {
    const primaryMeetingPref =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : 'during your planning period';

    const planningPeriodText = lead.planning_period || 'your planning period';
    const roomText = lead.room_number
      ? (/^room\b/i.test(lead.room_number.trim()) ? lead.room_number.trim() : `Room ${lead.room_number.trim()}`)
      : 'your classroom';

    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const lastName = lead.name && lead.name.split(' ').length > 1 ? lead.name.split(' ').slice(1).join(' ') : '';

    const PRODUCT_MAP: Record<string, string> = {
      flow_annuity: '403(b) Flow Annuity',
      annuity_transfer: 'Annuity Transfer-In',
      life_insurance: 'Life Insurance plan',
      investments: 'ValuTeachers retirement plan',
    };
    let productLabel = 'ValuTeachers retirement plan';
    if (lead.products && lead.products.length > 0) {
      productLabel = lead.products.map((p) => PRODUCT_MAP[p] || p).join(' & ');
    }

    let formattedAnniversary = 'your policy anniversary';
    const targetDateStr = lead.annual_review_due_date || lead.policy_effective_date;
    if (targetDateStr) {
      try {
        const normalized = targetDateStr.length === 10 ? `${targetDateStr}T12:00:00` : targetDateStr;
        const d = new Date(normalized);
        if (!isNaN(d.getTime())) {
          formattedAnniversary = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        }
      } catch {}
    }

    // Time & Date Aware tokens
    const apptTokens = DateTimeAwareService.getAppointmentTokens(lead, refDate);

    return template.body
      .replace(/{{name}}/gi, () => firstName)
      .replace(/{{first_name}}/gi, () => firstName)
      .replace(/{{last_name}}/gi, () => lastName)
      .replace(/{{full_name}}/gi, () => lead.name || 'there')
      .replace(/{{school}}/gi, () => lead.school || 'your school')
      .replace(/{{planning_period}}/gi, () => planningPeriodText)
      .replace(/{{room_number}}/gi, () => roomText)
      .replace(/{{years_in_frs}}/gi, () => (lead.years_in_frs ? `${lead.years_in_frs} years` : 'your time'))
      .replace(/{{meeting_pref}}/gi, () => primaryMeetingPref)
      .replace(/{{company}}/gi, () => lead.company || 'ValuTeachers')
      .replace(/{{note}}/gi, () => lead.notes || '')
      .replace(/{{notes}}/gi, () => lead.notes || '')
      .replace(/{{product}}/gi, () => productLabel)
      .replace(/{{anniversary_date}}/gi, () => formattedAnniversary)
      .replace(/{{appointment_date}}/gi, () => apptTokens.appointmentDate)
      .replace(/{{appointment_time}}/gi, () => apptTokens.appointmentTime)
      .replace(/{{appointment_relative}}/gi, () => apptTokens.appointmentRelative)
      .replace(/{{appointment_day}}/gi, () => apptTokens.appointmentDay)
      .replace(/{{appointment_datetime}}/gi, () => apptTokens.appointmentDatetime)
      .replace(/{{time_window}}/gi, () => apptTokens.appointmentRelative)
      .replace(/{{relative_time}}/gi, () => apptTokens.appointmentRelative)
      .replace(/{{my_name}}/gi, () => myName);
  }
}
