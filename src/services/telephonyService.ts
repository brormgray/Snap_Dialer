import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { Lead, SMSTemplate } from '../types';

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
        window.location.href = url;
        return true;
      } catch (e) {
        console.warn('Web tel navigation error:', e);
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
        window.location.href = url;
        return true;
      } catch (e) {
        console.warn('Web SMS location.href error:', e);
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
   * Replaces dynamic tokens ({{name}}, {{school}}, {{planning_period}}, {{room_number}}, {{years_in_frs}}, {{meeting_pref}}, {{my_name}}) with lead info
   */
  static interpolateTemplate(template: SMSTemplate, lead: Lead, myName: string = 'Alex'): string {
    const primaryMeetingPref =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : 'during your planning period';

    const planningPeriodText = lead.planning_period || 'your planning period';
    const roomText = lead.room_number ? `Room ${lead.room_number}` : 'your classroom';

    return template.body
      .replace(/{{name}}/gi, lead.name ? lead.name.split(' ')[0] : 'there')
      .replace(/{{full_name}}/gi, lead.name || 'there')
      .replace(/{{school}}/gi, lead.school || 'your school')
      .replace(/{{planning_period}}/gi, planningPeriodText)
      .replace(/{{room_number}}/gi, roomText)
      .replace(/{{years_in_frs}}/gi, lead.years_in_frs ? `${lead.years_in_frs} years` : 'your time')
      .replace(/{{meeting_pref}}/gi, primaryMeetingPref)
      .replace(/{{company}}/gi, lead.company || 'ValuTeachers')
      .replace(/{{my_name}}/gi, myName);
  }
}
