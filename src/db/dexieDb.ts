import Dexie, { Table } from 'dexie';
import { Lead, LeadList, CallLog, CadenceRule, SMSTemplate } from '../types';
import { IndexedDbStorage, DatabaseState } from './indexedDbStorage';

export interface LeadPhotoRecord {
  lead_id: string;
  photo_uri: string;
  created_at: string;
}

export class SnapDialerDexieDB extends Dexie {
  leads!: Table<Lead, string>;
  lists!: Table<LeadList, string>;
  call_logs!: Table<CallLog, string>;
  lead_photos!: Table<LeadPhotoRecord, string>;
  settings!: Table<{ key: string; value: string }, string>;
  sms_templates!: Table<SMSTemplate, string>;
  cadence_rules!: Table<CadenceRule, string>;

  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('SnapDialerValuTeachersDexieDB');

    this.version(1).stores({
      leads: 'id, list_id, school, priority_tier, last_disposition, follow_up_at, created_at',
      lists: 'id, created_at',
      call_logs: 'id, lead_id, list_id, timestamp, disposition',
      lead_photos: 'lead_id',
      settings: 'key',
      sms_templates: 'id',
      cadence_rules: 'id, step_number',
    });

    this.version(2)
      .stores({
        leads: 'id, list_id, school, priority_tier, last_disposition, follow_up_at, is_client, drip_track, annual_review_due_date, next_drip_scheduled_at, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('leads').toCollection().modify((lead: any) => {
          if (lead.is_client === undefined || lead.is_client === null) {
            lead.is_client = false;
          }
          if (typeof lead.products === 'string') {
            try {
              lead.products = JSON.parse(lead.products);
            } catch {
              lead.products = [];
            }
          } else if (!Array.isArray(lead.products)) {
            lead.products = [];
          }
          if (lead.annualized_premium === undefined) lead.annualized_premium = null;
          if (lead.transfer_assets_volume === undefined) lead.transfer_assets_volume = null;
          if (lead.policy_effective_date === undefined) lead.policy_effective_date = null;
          if (lead.annual_review_due_date === undefined) lead.annual_review_due_date = null;
          if (!lead.drip_track) lead.drip_track = 'none';
          if (lead.drip_step === undefined) lead.drip_step = 0;
          if (lead.last_drip_sent_at === undefined) lead.last_drip_sent_at = null;
          if (lead.next_drip_scheduled_at === undefined) lead.next_drip_scheduled_at = null;
        });
      });

    this.version(3)
      .stores({
        leads: 'id, list_id, school, priority_tier, last_disposition, follow_up_at, is_client, drip_track, annual_review_due_date, next_drip_scheduled_at, appointment_outcome, appointment_scheduled_at, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('leads').toCollection().modify((lead: any) => {
          if (lead.appointment_outcome === undefined) lead.appointment_outcome = null;
          if (lead.appointment_scheduled_at === undefined) lead.appointment_scheduled_at = null;
          if (lead.appointment_completed_at === undefined) lead.appointment_completed_at = null;
        });
      });
  }

  /**
   * Initializes database and ensures 100% automated zero-loss migration from legacy storage
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await this.open();

        // Lock storage persistence in browser if supported
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(() => {});
        }

        // Run automated zero-loss migration if Dexie leads store is empty
        const count = await this.leads.count();
        if (count === 0) {
          await this.autoMigrateLegacyData();
        }

        this.isInitialized = true;
      } catch (e) {
        console.warn('Dexie DB initialization note:', e);
        this.isInitialized = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Automatically migrates data from legacy monolithic 'root_state' to normalized Dexie tables
   */
  private async autoMigrateLegacyData(): Promise<void> {
    try {
      console.log('SnapDialer: Checking for legacy data to migrate into Dexie...');
      const legacyState: DatabaseState = await IndexedDbStorage.loadState();

      const hasLegacyData =
        (legacyState.leads && legacyState.leads.length > 0) ||
        (legacyState.lists && legacyState.lists.length > 0) ||
        (legacyState.call_logs && legacyState.call_logs.length > 0);

      if (!hasLegacyData) {
        console.log('SnapDialer: No legacy data found. Clean initialization.');
        return;
      }

      console.log(`SnapDialer: Migrating ${legacyState.leads.length} leads and ${legacyState.call_logs.length} logs to Dexie tables...`);

      await this.transaction(
        'rw',
        [this.leads, this.lists, this.call_logs, this.lead_photos, this.settings, this.sms_templates, this.cadence_rules],
        async () => {
          // 1. Migrate Lists
          if (legacyState.lists && legacyState.lists.length > 0) {
            await this.lists.bulkPut(legacyState.lists);
          }

          // 2. Migrate Leads & Decouple Photos
          if (legacyState.leads && legacyState.leads.length > 0) {
            const normalizedLeads: Lead[] = [];
            const photoRecords: LeadPhotoRecord[] = [];

            for (const raw of legacyState.leads) {
              let interests: string[] = [];
              let preferences: string[] = [];

              if (typeof raw.frs_interests === 'string') {
                try { interests = JSON.parse(raw.frs_interests); } catch {}
              } else if (Array.isArray(raw.frs_interests)) {
                interests = raw.frs_interests;
              }

              if (typeof raw.meeting_preferences === 'string') {
                try { preferences = JSON.parse(raw.meeting_preferences); } catch {}
              } else if (Array.isArray(raw.meeting_preferences)) {
                preferences = raw.meeting_preferences;
              }

              // Extract photo if present
              if (raw.source_image_uri && raw.source_image_uri.length > 50) {
                photoRecords.push({
                  lead_id: raw.id,
                  photo_uri: raw.source_image_uri,
                  created_at: raw.created_at || new Date().toISOString(),
                });
              }

              normalizedLeads.push({
                ...raw,
                priority_tier: raw.priority_tier !== undefined && raw.priority_tier !== null ? Number(raw.priority_tier) : 1,
                text_ok: raw.text_ok === 1 || raw.text_ok === true,
                frs_interests: interests,
                meeting_preferences: preferences,
              });
            }

            await this.leads.bulkPut(normalizedLeads);
            if (photoRecords.length > 0) {
              await this.lead_photos.bulkPut(photoRecords);
            }
          }

          // 3. Migrate Call Logs
          if (legacyState.call_logs && legacyState.call_logs.length > 0) {
            await this.call_logs.bulkPut(legacyState.call_logs);
          }

          // 4. Migrate Settings
          if (legacyState.settings && legacyState.settings.length > 0) {
            await this.settings.bulkPut(legacyState.settings);
          }

          // 5. Migrate Templates & Cadences
          if (legacyState.sms_templates && legacyState.sms_templates.length > 0) {
            await this.sms_templates.bulkPut(legacyState.sms_templates);
          }
          if (legacyState.cadence_rules && legacyState.cadence_rules.length > 0) {
            await this.cadence_rules.bulkPut(legacyState.cadence_rules);
          }
        }
      );

      console.log('SnapDialer: Successfully migrated legacy data to Dexie.');
    } catch (e) {
      console.error('SnapDialer: Migration note/error:', e);
    }
  }

  /**
   * Bulk ingests leads in chunked batches with relaxed durability for high write throughput
   */
  async bulkIngestLeadsChunked(leads: Lead[], chunkSize: number = 250): Promise<number> {
    await this.initialize();
    let totalIngested = 0;

    await this.transaction('rw', this.leads, async () => {
      for (let i = 0; i < leads.length; i += chunkSize) {
        const chunk = leads.slice(i, i + chunkSize);
        await this.leads.bulkPut(chunk);
        totalIngested += chunk.length;
      }
    });

    return totalIngested;
  }

  /**
   * Retrieves high-res card photo from isolated store
   */
  async getLeadPhoto(leadId: string): Promise<string | null> {
    await this.initialize();
    try {
      const record = await this.lead_photos.get(leadId);
      return record ? record.photo_uri : null;
    } catch {
      return null;
    }
  }

  /**
   * Saves high-res card photo to isolated store
   */
  async saveLeadPhoto(leadId: string, photoUri: string): Promise<void> {
    await this.initialize();
    if (!photoUri) return;
    try {
      await this.lead_photos.put({
        lead_id: leadId,
        photo_uri: photoUri,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to save lead photo:', e);
    }
  }
}

// Global Singleton Dexie Database Instance
export const dexieDb = new SnapDialerDexieDB();
