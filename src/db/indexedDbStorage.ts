/**
 * High-Capacity IndexedDB Storage Driver for Web Browsers
 * Solves the 5MB browser localStorage limit and provides multi-gigabyte, crash-proof persistence
 * for ValuTeachers leads, photos, call records, and notes.
 */

const DB_NAME = 'SnapDialerValuTeachersDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const LEGACY_STORAGE_KEY = 'snap_dialer_valuteachers_data';

import { PipelineStateService } from '../services/pipelineStateService';

export interface DatabaseState {
  lists: any[];
  leads: any[];
  call_logs: any[];
  cadence_rules: any[];
  sms_templates: any[];
  settings: { key: string; value: string }[];
}

export class IndexedDbStorage {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens or initializes the IndexedDB database connection
   */
  private static async getDb(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB not supported in current environment.');
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
          const db = event.target.result as IDBDatabase;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = (event: any) => {
          const db = event.target.result as IDBDatabase;

          // Request persistent storage if supported by browser
          if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => {});
          }

          resolve(db);
        };

        request.onerror = (event: any) => {
          console.error('IndexedDB open error:', event.target.error);
          reject(event.target.error);
        };
      });
    }

    return this.dbPromise;
  }

  /**
   * Loads the full database state from IndexedDB (with automatic migration from legacy localStorage)
   */
  static async loadState(): Promise<DatabaseState> {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return this.loadFromLocalStorageFallback();
      }

      const db = await this.getDb();
      const stored = await new Promise<DatabaseState | null>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get('root_state');

          request.onsuccess = () => {
            resolve(request.result || null);
          };

          request.onerror = () => {
            reject(request.error);
          };
        } catch (e) {
          reject(e);
        }
      });

      if (stored) {
        return this.normalizeState(stored);
      }

      // Check if we have legacy data in localStorage to migrate
      const legacyState = this.loadFromLocalStorageFallback();
      if (legacyState.leads.length > 0 || legacyState.lists.length > 0) {
        await this.saveState(legacyState);
        return legacyState;
      }

      return {
        lists: [],
        leads: [],
        call_logs: [],
        cadence_rules: [],
        sms_templates: [],
        settings: [],
      };
    } catch (e) {
      console.warn('IndexedDB load failed, using localStorage fallback:', e);
      return this.loadFromLocalStorageFallback();
    }
  }

  /**
   * Persists the entire database state to IndexedDB
   */
  static async saveState(state: DatabaseState): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        this.saveToLocalStorageFallback(state);
        return;
      }

      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(state, 'root_state');

          request.onsuccess = () => {
            resolve();
          };

          request.onerror = () => {
            reject(request.error);
          };
        } catch (e) {
          reject(e);
        }
      });

      // Also keep a lightweight mirror in localStorage (without large base64 images) as a secondary backup
      this.saveToLocalStorageFallback(state, true);
    } catch (e) {
      console.error('IndexedDB save failed:', e);
      this.saveToLocalStorageFallback(state, true);
    }
  }

  /**
   * Normalizes fields for backwards compatibility
   */
  private static normalizeState(raw: any): DatabaseState {
    const leads = (Array.isArray(raw?.leads) ? raw.leads : []).map((l: any) => {
      let products: string[] = [];
      if (Array.isArray(l.products)) {
        products = l.products.filter(Boolean);
      } else if (typeof l.products === 'string' && l.products.trim().startsWith('[')) {
        try { products = JSON.parse(l.products); } catch { products = []; }
      } else if (typeof l.products === 'string' && l.products.trim().length > 0) {
        products = l.products.split(',').map((p: string) => p.trim()).filter(Boolean);
      }

      let interests: string[] = [];
      if (Array.isArray(l.frs_interests)) {
        interests = l.frs_interests;
      } else if (typeof l.frs_interests === 'string') {
        try { interests = JSON.parse(l.frs_interests); } catch { interests = []; }
      }

      let preferences: string[] = [];
      if (Array.isArray(l.meeting_preferences)) {
        preferences = l.meeting_preferences;
      } else if (typeof l.meeting_preferences === 'string') {
        try { preferences = JSON.parse(l.meeting_preferences); } catch { preferences = []; }
      }

      let alternatePhones: string[] = [];
      if (Array.isArray(l.alternate_phones)) {
        alternatePhones = l.alternate_phones.filter(Boolean);
      } else if (typeof l.alternate_phones === 'string' && l.alternate_phones.trim().startsWith('[')) {
        try { alternatePhones = JSON.parse(l.alternate_phones).filter(Boolean); } catch { alternatePhones = []; }
      }

      const isClient = l.is_client === 1 || l.is_client === true || l.is_client === 'true';
      const isFrs = l.is_frs === undefined || l.is_frs === null || l.is_frs === 1 || l.is_frs === true || l.is_frs === 'true';
      const textOk = l.text_ok === undefined || l.text_ok === null ? true : (l.text_ok === 1 || l.text_ok === true || l.text_ok === 'true');
      let apptOutcome = l.appointment_outcome || null;
      let apptCompletedAt = l.appointment_completed_at || null;
      let lastDispo = l.last_disposition || 'pending';

      // Auto-heal appointment lifecycle state on load
      const hasActiveAppointment = lastDispo === 'appointment_set' && Boolean(l.appointment_scheduled_at);

      if (isClient && !hasActiveAppointment) {
        if (!apptOutcome) apptOutcome = 'converted';
        if (!apptCompletedAt && l.client_since) apptCompletedAt = l.client_since;
        if (lastDispo === 'appointment_set') lastDispo = 'connected';
      } else if (
        !isClient && (
          apptOutcome === 'nurture_drip' ||
          (typeof l.notes === 'string' && l.notes.includes('[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip')) ||
          (l.drip_track === 'prospect_nurture' && Boolean(l.appointment_scheduled_at))
        )
      ) {
        if (apptOutcome !== 'nurture_drip') apptOutcome = 'nurture_drip';
        if (!apptCompletedAt) apptCompletedAt = l.updated_at || l.created_at || new Date().toISOString();
        if (lastDispo === 'appointment_set') lastDispo = 'connected';
      }

      let apptScheduledAt = l.appointment_scheduled_at || null;
      if (lastDispo === 'appointment_set' && !apptOutcome && !apptCompletedAt && !apptScheduledAt) {
        const healed = PipelineStateService.extractAppointmentDateFromLead(l, new Date());
        apptScheduledAt = healed.toISOString();
      }

      let followUpAt = l.follow_up_at || null;
      if (followUpAt) {
        const parsed = new Date(followUpAt);
        const isInvalid = isNaN(parsed.getTime());
        const isCompletionString = typeof followUpAt === 'string' && (
          followUpAt.includes('[Callback Completed]') ||
          followUpAt.includes('Follow-up marked complete')
        );
        if (isInvalid || isCompletionString) {
          followUpAt = null;
          if (lastDispo === 'callback_requested') {
            lastDispo = 'pending';
          }
        }
      }

      return {
        ...l,
        alternate_phones: alternatePhones,
        frs_interests: interests,
        meeting_preferences: preferences,
        text_ok: textOk,
        is_frs: isFrs,
        priority_tier: l.priority_tier !== undefined && l.priority_tier !== null ? Number(l.priority_tier) : 1,
        list_id: l.list_id || 'master_queue',
        follow_up_at: followUpAt,
        attempts_count: l.attempts_count || 0,
        cadence_step: l.cadence_step || 1,

        // Client Conversion Defaults
        is_client: isClient,
        client_since: l.client_since || null,
        products,
        annualized_premium:
          l.annualized_premium !== undefined && l.annualized_premium !== null && !isNaN(Number(l.annualized_premium))
            ? Number(l.annualized_premium)
            : null,
        transfer_assets_volume:
          l.transfer_assets_volume !== undefined && l.transfer_assets_volume !== null && !isNaN(Number(l.transfer_assets_volume))
            ? Number(l.transfer_assets_volume)
            : null,
        policy_effective_date: l.policy_effective_date || null,
        annual_review_due_date: l.annual_review_due_date || null,

        // Drip Tracking Defaults
        drip_track: l.drip_track || 'none',
        drip_step:
          l.drip_step !== undefined && l.drip_step !== null && !isNaN(Number(l.drip_step))
            ? Number(l.drip_step)
            : 0,
        last_drip_sent_at: l.last_drip_sent_at || null,
        next_drip_scheduled_at: l.next_drip_scheduled_at || null,

        // Post-Appointment Sit-Down Lifecycle Defaults
        appointment_scheduled_at: apptScheduledAt,
        appointment_outcome: apptOutcome,
        appointment_completed_at: apptCompletedAt,
        appointment_notes: l.appointment_notes || null,
        last_disposition: lastDispo,
      };
    });

    return {
      lists: Array.isArray(raw?.lists) ? raw.lists : [],
      leads,
      call_logs: Array.isArray(raw?.call_logs) ? raw.call_logs : [],
      cadence_rules: Array.isArray(raw?.cadence_rules) ? raw.cadence_rules : [],
      sms_templates: Array.isArray(raw?.sms_templates) ? raw.sms_templates : [],
      settings: Array.isArray(raw?.settings) ? raw.settings : [],
    };
  }

  private static loadFromLocalStorageFallback(): DatabaseState {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return this.normalizeState(parsed);
        }
      }
    } catch (e) {
      console.warn('localStorage fallback load failed:', e);
    }

    return {
      lists: [],
      leads: [],
      call_logs: [],
      cadence_rules: [],
      sms_templates: [],
      settings: [],
    };
  }

  private static saveToLocalStorageFallback(state: DatabaseState, stripHeavyImages: boolean = false) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        let payload = state;
        if (stripHeavyImages) {
          // Strip massive base64 strings so localStorage never exceeds 5MB
          payload = {
            ...state,
            leads: state.leads.map((l) => ({
              ...l,
              source_image_uri: (l.source_image_uri && l.source_image_uri.length > 200) ? 'stored_in_indexeddb' : l.source_image_uri,
            })),
          };
        }
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      // If localStorage is full, IndexedDB has already saved the complete dataset.
    }
  }
}
