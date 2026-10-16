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

const memoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(key);
  }
  return memoryStore.get(key) ?? null;
}

function setStorageItem(key: string, val: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(key, val);
  } else {
    memoryStore.set(key, val);
  }
}

function removeStorageItem(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(key);
  } else {
    memoryStore.delete(key);
  }
}

export class SecurityService {
  static isPinEnabled(): boolean {
    return getStorageItem(PIN_ENABLED_KEY) === 'true';
  }

  static hasPinSet(): boolean {
    return Boolean(getStorageItem(PIN_HASH_KEY));
  }

  static isPinConfigured(): boolean {
    return this.isPinEnabled() && this.hasPinSet();
  }

  static getLockoutUntil(): number {
    const val = getStorageItem(LOCKOUT_UNTIL_KEY);
    return val ? parseInt(val, 10) : 0;
  }

  static setLockoutUntil(untilMs: number): void {
    setStorageItem(LOCKOUT_UNTIL_KEY, String(untilMs));
  }

  static clearLockout(): void {
    removeStorageItem(LOCKOUT_UNTIL_KEY);
  }

  static setPin(pin: string): boolean {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return false;
    }
    setStorageItem(PIN_HASH_KEY, hashPin(pin));
    setStorageItem(PIN_ENABLED_KEY, 'true');
    setStorageItem(SESSION_LOCKED_KEY, 'false');
    setStorageItem(LAST_ACTIVE_KEY, String(Date.now()));
    this.clearLockout();
    return true;
  }

  static disablePin(): void {
    setStorageItem(PIN_ENABLED_KEY, 'false');
    removeStorageItem(SESSION_LOCKED_KEY);
    this.clearLockout();
  }

  static verifyPin(pin: string): boolean {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) return false;
    const stored = getStorageItem(PIN_HASH_KEY);
    if (!stored) return false;
    const candidate = hashPin(pin);
    const len = Math.max(stored.length, candidate.length);
    let diff = stored.length ^ candidate.length;
    for (let i = 0; i < len; i++) {
      const a = i < stored.length ? stored.charCodeAt(i) : 0;
      const b = i < candidate.length ? candidate.charCodeAt(i) : 0;
      diff |= a ^ b;
    }
    const matched = diff === 0;
    if (matched) {
      this.unlockSession();
    }
    return matched;
  }

  static isSessionLocked(): boolean {
    if (!this.isPinConfigured()) return false;
    const explicitLocked = getStorageItem(SESSION_LOCKED_KEY) === 'true';
    if (explicitLocked) return true;

    const lastActive = getStorageItem(LAST_ACTIVE_KEY);
    if (lastActive) {
      const diff = Date.now() - parseInt(lastActive, 10);
      if (diff > LOCKOUT_TIMEOUT_MS) {
        this.lockSession();
        return true;
      }
    }
    return false;
  }

  static lockSession(): void {
    setStorageItem(SESSION_LOCKED_KEY, 'true');
  }

  static unlockSession(): void {
    setStorageItem(SESSION_LOCKED_KEY, 'false');
    setStorageItem(LAST_ACTIVE_KEY, String(Date.now()));
  }

  static recordActivity(): void {
    setStorageItem(LAST_ACTIVE_KEY, String(Date.now()));
  }
}
