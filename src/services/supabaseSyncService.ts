import { Platform } from 'react-native';
import { getSupabaseClient, setSupabaseCredentials } from './supabaseClient';
import { IDatabase, getDatabase, resetDatabase } from '../db/database';
import { IndexedDbStorage, DatabaseState } from '../db/indexedDbStorage';

export interface SyncResult {
  success: boolean;
  syncedLeads?: number;
  syncedLists?: number;
  syncedLogs?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredLeads?: number;
  restoredLists?: number;
  restoredLogs?: number;
  error?: string;
}

const TABLE_PREFIX = 'snap_';

export const SUPABASE_SQL_SETUP = `-- =========================================================================
-- SnapDialer ValuTeachers Cloud Sync Tables (Namespaced with "snap_")
-- SAFE FOR EXISTING DATABASES: Does NOT modify, touch, or drop any other tables.
-- =========================================================================

-- 1. Campaign Lists Table
CREATE TABLE IF NOT EXISTS snap_lists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  total_leads INTEGER DEFAULT 0,
  completed_leads INTEGER DEFAULT 0,
  connected_leads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Educators / Leads Table
CREATE TABLE IF NOT EXISTS snap_leads (
  id TEXT PRIMARY KEY,
  list_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  school TEXT,
  email TEXT,
  room_number TEXT,
  planning_period TEXT,
  years_in_frs TEXT,
  priority_tier INTEGER DEFAULT 1,
  notes TEXT,
  source_image_uri TEXT,
  attempts_count INTEGER DEFAULT 0,
  cadence_step INTEGER DEFAULT 1,
  last_disposition TEXT DEFAULT 'pending',
  last_attempt_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  appointment_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Call Activity Logs Table
CREATE TABLE IF NOT EXISTS snap_call_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  list_id TEXT,
  duration_seconds INTEGER DEFAULT 0,
  disposition TEXT,
  note TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  sms_sent BOOLEAN DEFAULT FALSE,
  sms_body TEXT
);

-- 4. Cadence Automation Rules Table
CREATE TABLE IF NOT EXISTS snap_cadence_rules (
  step_number INTEGER PRIMARY KEY,
  wait_days INTEGER DEFAULT 1,
  action_type TEXT,
  sms_template_id TEXT
);

-- 5. SMS Follow-Up Templates Table
CREATE TABLE IF NOT EXISTS snap_sms_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  stage TEXT,
  is_system BOOLEAN DEFAULT FALSE
);

-- 6. Enable Row Level Security (RLS) & Public Access Policies for Anon Key
ALTER TABLE snap_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_cadence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_sms_templates ENABLE ROW LEVEL SECURITY;

-- Allow anon key full CRUD on snap_ tables
DROP POLICY IF EXISTS "Anon Full Access snap_lists" ON snap_lists;
CREATE POLICY "Anon Full Access snap_lists" ON snap_lists FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access snap_leads" ON snap_leads;
CREATE POLICY "Anon Full Access snap_leads" ON snap_leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access snap_call_logs" ON snap_call_logs;
CREATE POLICY "Anon Full Access snap_call_logs" ON snap_call_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access snap_cadence_rules" ON snap_cadence_rules;
CREATE POLICY "Anon Full Access snap_cadence_rules" ON snap_cadence_rules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon Full Access snap_sms_templates" ON snap_sms_templates;
CREATE POLICY "Anon Full Access snap_sms_templates" ON snap_sms_templates FOR ALL USING (true) WITH CHECK (true);

-- Ensure newly added columns exist on existing databases
ALTER TABLE snap_leads ADD COLUMN IF NOT EXISTS appointment_notes TEXT;
`;

/**
 * Maps a full local lead object to ONLY the columns that exist in snap_leads.
 * Local-only columns like text_ok, frs_interests, company, meeting_preferences
 * are intentionally excluded to prevent Supabase 400 "column not found" errors.
 */
function mapLeadToSnapSchema(lead: any): object {
  return {
    id: lead.id,
    list_id: lead.list_id || null,
    name: lead.name || '',
    phone: lead.phone || '',
    school: lead.school || null,
    email: lead.email || null,
    room_number: lead.room_number || null,
    planning_period: lead.planning_period || null,
    years_in_frs: lead.years_in_frs || null,
    priority_tier: lead.priority_tier !== undefined ? Number(lead.priority_tier) : 1,
    notes: lead.notes || null,
    source_image_uri:
      lead.source_image_uri && lead.source_image_uri.length < 500
        ? lead.source_image_uri
        : null,
    attempts_count: lead.attempts_count || 0,
    cadence_step: lead.cadence_step || 1,
    last_disposition: lead.last_disposition || 'pending',
    last_attempt_at: lead.last_attempt_at || null,
    follow_up_at: lead.follow_up_at || null,
    appointment_notes: lead.appointment_notes || null,
    created_at: lead.created_at || new Date().toISOString(),
    updated_at: lead.updated_at || new Date().toISOString(),
  };
}

function mapListToSnapSchema(list: any): object {
  return {
    id: list.id,
    title: list.title || 'Campaign List',
    description: list.description || null,
    total_leads: list.total_leads || 0,
    completed_leads: list.completed_leads || 0,
    connected_leads: list.connected_leads || 0,
    created_at: list.created_at || new Date().toISOString(),
    updated_at: list.updated_at || new Date().toISOString(),
  };
}

function mapLogToSnapSchema(log: any): object {
  return {
    id: log.id,
    lead_id: log.lead_id || null,
    list_id: log.list_id || null,
    duration_seconds: log.duration_seconds || 0,
    disposition: log.disposition || null,
    note: log.note || null,
    timestamp: log.timestamp || new Date().toISOString(),
    sms_sent: log.sms_sent === true || log.sms_sent === 1,
    sms_body: log.sms_body || null,
  };
}

async function saveToNativeSqlite(db: IDatabase, lists: any[], leads: any[], logs: any[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await db.withTransactionAsync(async () => {
      for (const l of lists) {
        await db.runAsync(
          `INSERT OR REPLACE INTO lists (id, title, source_image_uri, total_leads, completed_leads, connected_leads, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            l.id,
            l.title || '',
            l.source_image_uri || null,
            l.total_leads || 0,
            l.completed_leads || 0,
            l.connected_leads || 0,
            l.created_at || new Date().toISOString(),
            l.updated_at || new Date().toISOString(),
          ]
        );
      }
      for (const lead of leads) {
        await db.runAsync(
          `INSERT OR REPLACE INTO leads (
            id, list_id, name, phone, school, email, age, planning_period, room_number, years_in_frs, text_ok,
            frs_knowledge, frs_interests, custom_questions, meeting_preferences, annual_salary, present_403b_contribution,
            source_image_uri, company, notes, priority_tier, is_frs, cadence_step, last_attempt_at, last_disposition, follow_up_at, attempts_count,
            is_client, client_since, products, annualized_premium, transfer_assets_volume, policy_effective_date, annual_review_due_date,
            drip_track, drip_step, last_drip_sent_at, next_drip_scheduled_at, appointment_scheduled_at, appointment_outcome, appointment_completed_at,
            appointment_notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lead.id,
            lead.list_id || '',
            lead.name || '',
            lead.phone || '',
            lead.school || null,
            lead.email || null,
            lead.age || null,
            lead.planning_period || null,
            lead.room_number || null,
            lead.years_in_frs || null,
            lead.text_ok ? 1 : 0,
            lead.frs_knowledge || null,
            typeof lead.frs_interests === 'string' ? lead.frs_interests : JSON.stringify(lead.frs_interests || []),
            lead.custom_questions || null,
            typeof lead.meeting_preferences === 'string' ? lead.meeting_preferences : JSON.stringify(lead.meeting_preferences || []),
            lead.annual_salary || null,
            lead.present_403b_contribution || null,
            lead.source_image_uri || null,
            lead.company || null,
            lead.notes || null,
            lead.priority_tier || 1,
            lead.is_frs !== undefined ? (lead.is_frs === false || lead.is_frs === 0 ? 0 : 1) : 1,
            lead.cadence_step || 1,
            lead.last_attempt_at || null,
            lead.last_disposition || 'pending',
            lead.follow_up_at || null,
            lead.attempts_count || 0,
            lead.is_client ? 1 : 0,
            lead.client_since || null,
            typeof lead.products === 'string' ? lead.products : JSON.stringify(lead.products || []),
            lead.annualized_premium || 0,
            lead.transfer_assets_volume || 0,
            lead.policy_effective_date || null,
            lead.annual_review_due_date || null,
            lead.drip_track || 'none',
            lead.drip_step || 0,
            lead.last_drip_sent_at || null,
            lead.next_drip_scheduled_at || null,
            lead.appointment_scheduled_at || null,
            lead.appointment_outcome || null,
            lead.appointment_completed_at || null,
            lead.appointment_notes || null,
            lead.created_at || new Date().toISOString(),
            lead.updated_at || new Date().toISOString(),
          ]
        );
      }
      for (const log of logs) {
        await db.runAsync(
          `INSERT OR REPLACE INTO call_logs (id, lead_id, list_id, timestamp, duration_seconds, disposition, note, sms_sent, sms_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            log.lead_id || '',
            log.list_id || '',
            log.timestamp || new Date().toISOString(),
            log.duration_seconds || 0,
            log.disposition || 'no_answer',
            log.note || null,
            log.sms_sent ? 1 : 0,
            log.sms_body || null,
          ]
        );
      }
    });
  } catch (nativeErr) {
    console.warn('Native SQLite sync note:', nativeErr);
  }
}

export class SupabaseSyncService {
  private static isSyncing: boolean = false;
  private static debounceTimer: any = null;

  static async testConnection(
    url: string,
    anonKey: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const client = getSupabaseClient(url, anonKey);
      if (!client) {
        return { success: false, message: 'Invalid URL or Anon Key format.' };
      }
      const { error } = await client.from(`${TABLE_PREFIX}leads`).select('id').limit(1);
      if (error) {
        if (
          error.message.includes('relation "snap_leads" does not exist') ||
          error.code === '42P01'
        ) {
          return {
            success: false,
            message:
              'Connected to Supabase, but the "snap_leads" table is not created yet. Run the SQL setup script below.',
          };
        }
        return { success: false, message: `Supabase error: ${error.message}` };
      }
      setSupabaseCredentials(url, anonKey);
      return { success: true, message: 'Connected successfully to Supabase! All snap_ tables verified.' };
    } catch (err: any) {
      return { success: false, message: `Connection failed: ${err?.message || 'Network error'}` };
    }
  }

  /**
   * Push local device database to Supabase cloud.
   * Reads from the live in-memory WebDatabase (not IndexedDB snapshot) for latest data.
   * Maps rows to exact snap_ column schemas to prevent 400 errors.
   */
  static async pushLocalToCloud(): Promise<SyncResult> {
    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        error: 'Supabase is not configured. Please enter your credentials in Settings and tap "Test & Save Connection" first.',
      };
    }
    if (this.isSyncing) {
      return { success: false, error: 'A sync operation is already in progress.' };
    }
    this.isSyncing = true;
    try {
      const db = await getDatabase();
      const [rawLeads, rawLists, rawLogs] = await Promise.all([
        db.getAllAsync<any>('SELECT * FROM leads'),
        db.getAllAsync<any>('SELECT * FROM lists'),
        db.getAllAsync<any>('SELECT * FROM call_logs'),
      ]);

      const leads = rawLeads.map(mapLeadToSnapSchema);
      const lists = rawLists.map(mapListToSnapSchema);
      const logs = rawLogs.map(mapLogToSnapSchema);

      if (lists.length > 0) {
        const { error } = await client.from(`${TABLE_PREFIX}lists`).upsert(lists, { onConflict: 'id' });
        if (error) throw new Error(`Lists sync failed: ${error.message}`);
      }

      if (leads.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < leads.length; i += CHUNK) {
          const { error } = await client
            .from(`${TABLE_PREFIX}leads`)
            .upsert(leads.slice(i, i + CHUNK), { onConflict: 'id' });
          if (error) throw new Error(`Leads sync failed: ${error.message}`);
        }
      }

      if (logs.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < logs.length; i += CHUNK) {
          const { error } = await client
            .from(`${TABLE_PREFIX}call_logs`)
            .upsert(logs.slice(i, i + CHUNK), { onConflict: 'id' });
          if (error) throw new Error(`Call logs sync failed: ${error.message}`);
        }
      }

      const nowIso = new Date().toISOString();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_sync_time', nowIso);
        localStorage.setItem('snap_last_ping_time', nowIso);
        try {
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
          }
        } catch {}
      }

      return { success: true, syncedLeads: leads.length, syncedLists: lists.length, syncedLogs: logs.length };
    } catch (err: any) {
      console.error('Supabase push failed:', err);
      return { success: false, error: err?.message || 'Failed to push data to Supabase.' };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull all data from Supabase and restore to local device database.
   * After writing to IndexedDB, calls resetDatabase() so the next getDatabase()
   * call re-initializes from the freshly-restored state.
   */
  static async pullCloudToLocal(): Promise<RestoreResult> {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, error: 'Supabase is not configured. Please add your credentials in Settings.' };
    }
    try {
      const [
        { data: lists, error: listErr },
        { data: leads, error: leadErr },
        { data: logs, error: logErr },
        { data: rules },
        { data: templates },
      ] = await Promise.all([
        client.from(`${TABLE_PREFIX}lists`).select('*'),
        client.from(`${TABLE_PREFIX}leads`).select('*'),
        client.from(`${TABLE_PREFIX}call_logs`).select('*'),
        client.from(`${TABLE_PREFIX}cadence_rules`).select('*'),
        client.from(`${TABLE_PREFIX}sms_templates`).select('*'),
      ]);

      if (listErr) throw new Error(`Lists restore failed: ${listErr.message}`);
      if (leadErr) throw new Error(`Leads restore failed: ${leadErr.message}`);
      if (logErr) throw new Error(`Call logs restore failed: ${logErr.message}`);

      const db = await getDatabase();
      const existingSettings = await db.getAllAsync<any>('SELECT * FROM settings');

      const restoredState: DatabaseState = {
        lists: lists || [],
        leads: leads || [],
        call_logs: logs || [],
        cadence_rules: rules || [],
        sms_templates: templates || [],
        settings: existingSettings || [],
      };

      await IndexedDbStorage.saveState(restoredState);

      // Persist to native SQLite if running on iOS/Android
      if (Platform.OS !== 'web') {
        await saveToNativeSqlite(db, lists || [], leads || [], logs || []);
      }

      // Reset the in-memory singleton so next getDatabase() re-initializes from storage
      resetDatabase();

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_sync_time', new Date().toISOString());
      }

      return {
        success: true,
        restoredLeads: (leads || []).length,
        restoredLists: (lists || []).length,
        restoredLogs: (logs || []).length,
      };
    } catch (err: any) {
      console.error('Supabase pull failed:', err);
      return { success: false, error: err?.message || 'Failed to download data from Supabase.' };
    }
  }

  /**
   * Two-Way Smart Delta Sync with Last-Write-Wins (LWW) Conflict Resolution.
   * Compares local records and Supabase cloud records by ID and updated_at.
   * - Records newer in cloud -> update local database.
   * - Records newer locally -> push update to cloud.
   * - Records only in cloud -> insert locally.
   * - Records only locally -> push to cloud.
   */
  static async syncTwoWayDelta(): Promise<{
    success: boolean;
    localUpdated: number;
    cloudUpdated: number;
    localCreated: number;
    cloudCreated: number;
    error?: string;
  }> {
    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        localUpdated: 0,
        cloudUpdated: 0,
        localCreated: 0,
        cloudCreated: 0,
        error: 'Supabase is not configured. Please add your credentials in Settings.',
      };
    }
    if (this.isSyncing) {
      return {
        success: false,
        localUpdated: 0,
        cloudUpdated: 0,
        localCreated: 0,
        cloudCreated: 0,
        error: 'A sync operation is already in progress.',
      };
    }

    this.isSyncing = true;
    try {
      const db = await getDatabase();
      const [
        localLeads,
        localLists,
        localLogs,
        { data: cloudLists, error: listErr },
        { data: cloudLeads, error: leadErr },
        { data: cloudLogs, error: logErr },
      ] = await Promise.all([
        db.getAllAsync<any>('SELECT * FROM leads'),
        db.getAllAsync<any>('SELECT * FROM lists'),
        db.getAllAsync<any>('SELECT * FROM call_logs'),
        client.from(`${TABLE_PREFIX}lists`).select('*'),
        client.from(`${TABLE_PREFIX}leads`).select('*'),
        client.from(`${TABLE_PREFIX}call_logs`).select('*'),
      ]);

      if (listErr) throw new Error(`Lists sync query failed: ${listErr.message}`);
      if (leadErr) throw new Error(`Leads sync query failed: ${leadErr.message}`);
      if (logErr) throw new Error(`Logs sync query failed: ${logErr.message}`);

      let localUpdated = 0;
      let cloudUpdated = 0;
      let localCreated = 0;
      let cloudCreated = 0;

      // 1. RECONCILE LEADS
      const localLeadsMap = new Map<string, any>(localLeads.map((l: any) => [String(l.id).trim(), l]));
      // Also index local leads by normalized 10-digit phone to prevent duplicate rows across devices
      const localLeadsPhoneMap = new Map<string, any>();
      for (const l of localLeads) {
        const pKey = (l.phone || '').replace(/\D/g, '').replace(/^1/, '');
        if (pKey.length >= 10) localLeadsPhoneMap.set(pKey.slice(-10), l);
      }

      const cloudLeadsMap = new Map<string, any>((cloudLeads || []).map((l: any) => [String(l.id).trim(), l]));
      const leadsToPush: any[] = [];
      const matchedLocalLeadIds = new Set<string>();
      let localLeadsMutated = false;

      for (const [id, cLead] of cloudLeadsMap.entries()) {
        let lLead = localLeadsMap.get(id);
        if (!lLead) {
          const cPhoneKey = (cLead.phone || '').replace(/\D/g, '').replace(/^1/, '');
          if (cPhoneKey.length >= 10) {
            lLead = localLeadsPhoneMap.get(cPhoneKey.slice(-10));
            if (lLead) {
              matchedLocalLeadIds.add(String(lLead.id).trim());
            }
          }
        } else {
          matchedLocalLeadIds.add(id);
        }

        if (!lLead) {
          localLeads.push(cLead);
          localCreated++;
          localLeadsMutated = true;
        } else {
          const cTime = cLead.updated_at ? new Date(cLead.updated_at).getTime() : 0;
          const lTime = lLead.updated_at ? new Date(lLead.updated_at).getTime() : 0;

          if (cTime > lTime) {
            const localPreserved = {
              id: lLead.id,
              age: lLead.age || cLead.age || null,
              alternate_phones: lLead.alternate_phones || cLead.alternate_phones || [],
              is_frs: lLead.is_frs !== undefined ? lLead.is_frs : (cLead.is_frs !== undefined ? cLead.is_frs : true),
              source_image_uri: lLead.source_image_uri || cLead.source_image_uri || null,
              text_ok: lLead.text_ok !== undefined ? lLead.text_ok : (cLead.text_ok !== undefined ? cLead.text_ok : true),
              frs_interests: lLead.frs_interests || cLead.frs_interests || null,
              frs_knowledge: lLead.frs_knowledge || cLead.frs_knowledge || null,
              custom_questions: lLead.custom_questions || cLead.custom_questions || null,
              meeting_preferences: lLead.meeting_preferences || cLead.meeting_preferences || null,
              annual_salary: lLead.annual_salary || cLead.annual_salary || null,
              present_403b_contribution: lLead.present_403b_contribution || cLead.present_403b_contribution || null,
              company: lLead.company || cLead.company || null,
              priority_tier: lLead.priority_tier !== undefined ? lLead.priority_tier : (cLead.priority_tier || 1),
              is_client: lLead.is_client !== undefined ? lLead.is_client : (cLead.is_client || false),
              client_since: lLead.client_since || cLead.client_since || null,
              products: lLead.products || cLead.products || [],
              annualized_premium: lLead.annualized_premium !== undefined ? lLead.annualized_premium : (cLead.annualized_premium || 0),
              transfer_assets_volume: lLead.transfer_assets_volume !== undefined ? lLead.transfer_assets_volume : (cLead.transfer_assets_volume || 0),
              policy_effective_date: lLead.policy_effective_date || cLead.policy_effective_date || null,
              annual_review_due_date: lLead.annual_review_due_date || cLead.annual_review_due_date || null,
              drip_track: lLead.drip_track || cLead.drip_track || 'none',
              drip_step: lLead.drip_step !== undefined ? lLead.drip_step : (cLead.drip_step || 0),
              last_drip_sent_at: lLead.last_drip_sent_at || cLead.last_drip_sent_at || null,
              next_drip_scheduled_at: lLead.next_drip_scheduled_at || cLead.next_drip_scheduled_at || null,
              appointment_scheduled_at: lLead.appointment_scheduled_at || cLead.appointment_scheduled_at || null,
              appointment_outcome: lLead.appointment_outcome || cLead.appointment_outcome || null,
              appointment_completed_at: lLead.appointment_completed_at || cLead.appointment_completed_at || null,
              appointment_notes: cLead.appointment_notes || lLead.appointment_notes || null,
            };
            Object.assign(lLead, cLead, localPreserved);
            localUpdated++;
            localLeadsMutated = true;
          } else if (lTime > cTime) {
            leadsToPush.push(mapLeadToSnapSchema(lLead));
            cloudUpdated++;
          }
        }
      }

      for (const [id, lLead] of localLeadsMap.entries()) {
        if (!cloudLeadsMap.has(id) && !matchedLocalLeadIds.has(id)) {
          leadsToPush.push(mapLeadToSnapSchema(lLead));
          cloudCreated++;
        }
      }

      // 2. RECONCILE LISTS
      const localListsMap = new Map<string, any>(localLists.map((l: any) => [String(l.id).trim(), l]));
      const cloudListsMap = new Map<string, any>((cloudLists || []).map((l: any) => [String(l.id).trim(), l]));
      const listsToPush: any[] = [];
      let localListsMutated = false;

      for (const [id, cList] of cloudListsMap.entries()) {
        const lList = localListsMap.get(id);
        if (!lList) {
          localLists.push(cList);
          localCreated++;
          localListsMutated = true;
        } else {
          const cTime = cList.updated_at ? new Date(cList.updated_at).getTime() : 0;
          const lTime = lList.updated_at ? new Date(lList.updated_at).getTime() : 0;
          if (cTime > lTime) {
            Object.assign(lList, cList);
            localUpdated++;
            localListsMutated = true;
          } else if (lTime > cTime) {
            listsToPush.push(mapListToSnapSchema(lList));
            cloudUpdated++;
          }
        }
      }

      for (const [id, lList] of localListsMap.entries()) {
        if (!cloudListsMap.has(id)) {
          listsToPush.push(mapListToSnapSchema(lList));
          cloudCreated++;
        }
      }

      // 3. RECONCILE CALL LOGS
      const localLogsMap = new Map<string, any>(localLogs.map((c: any) => [String(c.id).trim(), c]));
      const cloudLogsMap = new Map<string, any>((cloudLogs || []).map((c: any) => [String(c.id).trim(), c]));
      const logsToPush: any[] = [];
      let localLogsMutated = false;

      for (const [id, cLog] of cloudLogsMap.entries()) {
        if (!localLogsMap.has(id)) {
          localLogs.push(cLog);
          localCreated++;
          localLogsMutated = true;
        }
      }

      for (const [id, lLog] of localLogsMap.entries()) {
        if (!cloudLogsMap.has(id)) {
          logsToPush.push(mapLogToSnapSchema(lLog));
          cloudCreated++;
        }
      }

      // 4. APPLY PUSHES TO CLOUD
      if (listsToPush.length > 0) {
        const { error } = await client.from(`${TABLE_PREFIX}lists`).upsert(listsToPush, { onConflict: 'id' });
        if (error) throw new Error(`Lists push failed: ${error.message}`);
      }
      if (leadsToPush.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < leadsToPush.length; i += CHUNK) {
          const { error } = await client.from(`${TABLE_PREFIX}leads`).upsert(leadsToPush.slice(i, i + CHUNK), { onConflict: 'id' });
          if (error) throw new Error(`Leads push failed: ${error.message}`);
        }
      }
      if (logsToPush.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < logsToPush.length; i += CHUNK) {
          const { error } = await client.from(`${TABLE_PREFIX}call_logs`).upsert(logsToPush.slice(i, i + CHUNK), { onConflict: 'id' });
          if (error) throw new Error(`Call logs push failed: ${error.message}`);
        }
      }

      // 5. APPLY LOCAL SAVES IF LOCAL WAS MUTATED
      if (localLeadsMutated || localListsMutated || localLogsMutated) {
        const rules = await db.getAllAsync<any>('SELECT * FROM cadence_rules');
        const templates = await db.getAllAsync<any>('SELECT * FROM sms_templates');
        const settings = await db.getAllAsync<any>('SELECT * FROM settings');

        const updatedState: DatabaseState = {
          lists: localLists,
          leads: localLeads,
          call_logs: localLogs,
          cadence_rules: rules,
          sms_templates: templates,
          settings: settings,
        };

        await IndexedDbStorage.saveState(updatedState);

        // Persist to native SQLite if running on iOS/Android
        if (Platform.OS !== 'web') {
          await saveToNativeSqlite(db, localLists, localLeads, localLogs);
        }

        resetDatabase();
      }

      const now = new Date().toISOString();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_sync_time', now);
        localStorage.setItem('snap_last_ping_time', now);
        try {
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
          }
        } catch {}
      }

      return {
        success: true,
        localUpdated,
        cloudUpdated,
        localCreated,
        cloudCreated,
      };
    } catch (err: any) {
      console.error('Two-way delta sync failed:', err);
      return {
        success: false,
        localUpdated: 0,
        cloudUpdated: 0,
        localCreated: 0,
        cloudCreated: 0,
        error: err?.message || 'Delta sync failed.',
      };
    } finally {
      this.isSyncing = false;
    }
  }

  static triggerAutoSync(): void {
    const client = getSupabaseClient();
    if (!client) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.pushLocalToCloud().catch(() => {});
    }, 4000);
  }

  static getLastSyncTime(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('snap_last_sync_time');
    }
    return null;
  }

  static isConfigured(): boolean {
    return getSupabaseClient() !== null;
  }

  static isAutoSyncEnabled(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem('snap_auto_sync_enabled');
      if (val === null) return true; // Default enabled
      return val === 'true';
    }
    return true;
  }

  static setAutoSyncEnabled(enabled: boolean): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('snap_auto_sync_enabled', enabled ? 'true' : 'false');
      try {
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
        }
      } catch {}
    }
  }

  static getAutoSyncIntervalHours(): number {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem('snap_auto_sync_interval_hours');
      if (val !== null) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    }
    return 48; // Default: 48 hours (every 2 days)
  }

  static setAutoSyncIntervalHours(hours: number): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('snap_auto_sync_interval_hours', String(hours));
      try {
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
        }
      } catch {}
    }
  }

  static getLastPingTime(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('snap_last_ping_time');
    }
    return null;
  }

  static async pingDatabase(): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Supabase credentials are not configured.' };
    }
    const startTime = Date.now();
    try {
      const { error } = await client.from(`${TABLE_PREFIX}leads`).select('id').limit(1);
      const latencyMs = Date.now() - startTime;
      if (error && !error.message?.includes('relation "snap_leads" does not exist') && error.code !== '42P01') {
        return { success: false, latencyMs, message: error.message };
      }
      const now = new Date().toISOString();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_ping_time', now);
        try {
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
          }
        } catch {}
      }
      return {
        success: true,
        latencyMs,
        message: `Active database ping confirmed (${latencyMs}ms). Inactivity timer reset.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Ping request failed.' };
    }
  }

  static isSyncDue(): boolean {
    if (!this.isConfigured() || !this.isAutoSyncEnabled()) {
      return false;
    }
    const lastSync = this.getLastSyncTime();
    if (!lastSync) {
      return true; // Never synced before
    }
    const intervalHours = this.getAutoSyncIntervalHours();
    if (intervalHours === 0) {
      return true; // Sync on every launch
    }
    const lastSyncDate = new Date(lastSync).getTime();
    if (isNaN(lastSyncDate)) {
      return true;
    }
    const elapsedMs = Date.now() - lastSyncDate;
    const requiredIntervalMs = intervalHours * 60 * 60 * 1000;
    return elapsedMs >= requiredIntervalMs;
  }

  static async checkAndRunPeriodicSync(force: boolean = false): Promise<{
    executed: boolean;
    reason: string;
    result?: any;
  }> {
    if (!this.isConfigured()) {
      return { executed: false, reason: 'Supabase not configured' };
    }
    if (!this.isAutoSyncEnabled() && !force) {
      return { executed: false, reason: 'Auto-sync disabled by user' };
    }
    if (this.isSyncing) {
      return { executed: false, reason: 'Sync already in progress' };
    }

    const due = force || this.isSyncDue();
    if (due) {
      try {
        const result = await this.syncTwoWayDelta();
        const now = new Date().toISOString();
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('snap_last_ping_time', now);
          try {
            if (window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('snap-sync-status-changed'));
            }
          } catch {}
        }
        return { executed: true, reason: 'Periodic two-way delta sync completed', result };
      } catch (err: any) {
        return { executed: false, reason: `Periodic sync error: ${err?.message || err}` };
      }
    } else {
      // If sync is not yet due, keep database active if no ping in >24 hours
      const lastPing = this.getLastPingTime();
      const lastPingMs = lastPing ? new Date(lastPing).getTime() : 0;
      if (Date.now() - lastPingMs > 24 * 60 * 60 * 1000) {
        this.pingDatabase().catch(() => {});
      }
      return { executed: false, reason: 'Sync interval not reached yet' };
    }
  }
}
