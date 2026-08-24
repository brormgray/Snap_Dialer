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

    // iOS and Android SMS URL separator
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const encodedBody = encodeURIComponent(messageBody);
    const url = `sms:${cleanNumber}${separator}body=${encodedBody}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.href = url;
        return true;
      } catch (e) {
        console.warn('Web SMS navigation error:', e);
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
   * Replaces dynamic tokens ({{name}}, {{school}}, {{years_in_frs}}, {{meeting_pref}}, {{my_name}}) with lead info
   */
  static interpolateTemplate(template: SMSTemplate, lead: Lead, myName: string = 'Alex'): string {
    const primaryMeetingPref =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : 'during your planning period';

    return template.body
      .replace(/{{name}}/g, lead.name ? lead.name.split(' ')[0] : 'there')
      .replace(/{{full_name}}/g, lead.name || 'there')
      .replace(/{{school}}/g, lead.school || 'your school')
      .replace(/{{years_in_frs}}/g, lead.years_in_frs ? `${lead.years_in_frs} years` : 'your time')
      .replace(/{{meeting_pref}}/g, primaryMeetingPref)
      .replace(/{{company}}/g, lead.company || 'ValuTeachers')
      .replace(/{{my_name}}/g, myName);
  }
}
