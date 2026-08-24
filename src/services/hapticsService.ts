import { Platform } from 'react-native';

export class HapticsService {
  private static hapticsModule: any = null;

  private static async getModule() {
    if (this.hapticsModule) return this.hapticsModule;
    if (Platform.OS !== 'web') {
      try {
        // @ts-ignore
        this.hapticsModule = await import('expo-haptics');
      } catch (e) {
        // Fallback
      }
    }
    return this.hapticsModule;
  }

  /**
   * Light tap (used for UI buttons, tab changes, and countdown ticks)
   */
  static async tick() {
    try {
      const Haptics = await this.getModule();
      if (Haptics) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}
  }

  /**
   * Medium impact (used for initiating calls, sending texts)
   */
  static async medium() {
    try {
      const Haptics = await this.getModule();
      if (Haptics) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch {}
  }

  /**
   * Heavy impact / Warning (used for Bad Number, Disqualify)
   */
  static async heavy() {
    try {
      const Haptics = await this.getModule();
      if (Haptics) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
      }
    } catch {}
  }

  /**
   * Success notification (used for Connected / Qualified)
   */
  static async success() {
    try {
      const Haptics = await this.getModule();
      if (Haptics) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15, 30, 60]);
      }
    } catch {}
  }

  /**
   * Error notification
   */
  static async error() {
    try {
      const Haptics = await this.getModule();
      if (Haptics) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([50, 30, 50]);
      }
    } catch {}
  }
}
