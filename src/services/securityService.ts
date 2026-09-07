/**
 * Field Privacy & PIN Protection Service for SnapDialer.
 * Secures educator records, pension details, and phone numbers when devices
 * are unattended during school campus visits.
 */

const PIN_ENABLED_KEY = 'snap_pin_enabled';
const PIN_HASH_KEY = 'snap_pin_hash';
const SESSION_LOCKED_KEY = 'snap_session_locked';
const LAST_ACTIVE_KEY = 'snap_last_active_timestamp';
const LOCKOUT_UNTIL_KEY = 'snap_pin_lockout_until';
const LOCKOUT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity

// Simple fast hash for 4-digit PIN
function hashPin(pin: string): string {
  let hash = 0;
  const str = `snap_salt_${pin}_secure`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return String(hash);
}

export class SecurityService {
  static isPinEnabled(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(PIN_ENABLED_KEY) === 'true';
    }
    return false;
  }

  static hasPinSet(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      return Boolean(localStorage.getItem(PIN_HASH_KEY));
    }
    return false;
  }

  static isPinConfigured(): boolean {
    return this.isPinEnabled() && this.hasPinSet();
  }

  static getLockoutUntil(): number {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem(LOCKOUT_UNTIL_KEY);
      return val ? parseInt(val, 10) : 0;
    }
    return 0;
  }

  static setLockoutUntil(untilMs: number): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(LOCKOUT_UNTIL_KEY, String(untilMs));
    }
  }

  static clearLockout(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(LOCKOUT_UNTIL_KEY);
    }
  }

  static setPin(pin: string): boolean {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return false;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(PIN_HASH_KEY, hashPin(pin));
      localStorage.setItem(PIN_ENABLED_KEY, 'true');
      localStorage.setItem(SESSION_LOCKED_KEY, 'false');
      this.clearLockout();
      return true;
    }
    return false;
  }

  static disablePin(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(PIN_ENABLED_KEY, 'false');
      localStorage.removeItem(SESSION_LOCKED_KEY);
      this.clearLockout();
    }
  }

  static verifyPin(pin: string): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(PIN_HASH_KEY);
      if (!stored) return false;
      const matched = stored === hashPin(pin);
      if (matched) {
        this.unlockSession();
      }
      return matched;
    }
    return false;
  }

  static isSessionLocked(): boolean {
    if (!this.isPinEnabled()) return false;
    if (typeof window !== 'undefined' && window.localStorage) {
      const explicitLocked = localStorage.getItem(SESSION_LOCKED_KEY) === 'true';
      if (explicitLocked) return true;

      const lastActive = localStorage.getItem(LAST_ACTIVE_KEY);
      if (lastActive) {
        const diff = Date.now() - parseInt(lastActive, 10);
        if (diff > LOCKOUT_TIMEOUT_MS) {
          this.lockSession();
          return true;
        }
      }
    }
    return false;
  }

  static lockSession(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SESSION_LOCKED_KEY, 'true');
    }
  }

  static unlockSession(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SESSION_LOCKED_KEY, 'false');
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    }
  }

  static recordActivity(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    }
  }
}
