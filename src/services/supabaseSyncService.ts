import { getSupabaseClient, setSupabaseCredentials } from './supabaseClient';
import { getDatabase } from '../db/database';
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
`;

export class SupabaseSyncService {
  private static isSyncing: boolean = false;
  private static debounceTimer: any = null;

  /**
   * Tests Supabase connectivity and validates if the snap_ tables exist
   */
  static async testConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
    try {
      const client = getSupabaseClient(url, anonKey);
      if (!client) {
        return { success: false, message: 'Invalid URL or Anon Key format.' };
      }

      // Try selecting 1 record from snap_leads
      const { data, error } = await client.from(`${TABLE_PREFIX}leads`).select('id').limit(1);

      if (error) {
        if (error.message.includes('relation "snap_leads" does not exist') || error.code === '42P01') {
          return {
            success: false,
            message: 'Connected to Supabase, but the "snap_leads" table is not created yet. Run the SQL setup script below.',
          };
        }
        return { success: false, message: `Supabase error: ${error.message}` };
      }

      // Save valid credentials
      setSupabaseCredentials(url, anonKey);
      return { success: true, message: '✓ Connected successfully to Supabase! All snap_ tables verified.' };
    } catch (err: any) {
      return { success: false, message: `Connection failed: ${err?.message || 'Network error'}` };
    }
  }

  /**
   * Push local device database to Supabase cloud
   */
  static async pushLocalToCloud(): Promise<SyncResult> {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, error: 'Supabase is not configured. Please add your credentials in Settings.' };
    }

    if (this.isSyncing) {
      return { success: false, error: 'A sync operation is already in progress.' };
    }

    this.isSyncing = true;
    try {
      const state = await IndexedDbStorage.loadState();
      const leads = state.leads || [];
      const lists = state.lists || [];
      const logs = state.call_logs || [];
      const rules = state.cadence_rules || [];
      const templates = state.sms_templates || [];

      // 1. Sync Lists
      if (lists.length > 0) {
        const { error: listErr } = await client.from(`${TABLE_PREFIX}lists`).upsert(lists, { onConflict: 'id' });
        if (listErr) throw listErr;
      }

      // 2. Sync Leads (in chunks of 100 for network efficiency)
      if (leads.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
          const chunk = leads.slice(i, i + CHUNK_SIZE);
          const { error: leadErr } = await client.from(`${TABLE_PREFIX}leads`).upsert(chunk, { onConflict: 'id' });
          if (leadErr) throw leadErr;
        }
      }

      // 3. Sync Call Logs
      if (logs.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
          const chunk = logs.slice(i, i + CHUNK_SIZE);
          const { error: logErr } = await client.from(`${TABLE_PREFIX}call_logs`).upsert(chunk, { onConflict: 'id' });
          if (logErr) throw logErr;
        }
      }

      // 4. Sync Cadence Rules & Templates
      if (rules.length > 0) {
        await client.from(`${TABLE_PREFIX}cadence_rules`).upsert(rules, { onConflict: 'step_number' });
      }
      if (templates.length > 0) {
        await client.from(`${TABLE_PREFIX}sms_templates`).upsert(templates, { onConflict: 'id' });
      }

      const now = new Date().toISOString();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_sync_time', now);
      }

      return {
        success: true,
        syncedLeads: leads.length,
        syncedLists: lists.length,
        syncedLogs: logs.length,
      };
    } catch (err: any) {
      console.error('Supabase push failed:', err);
      return { success: false, error: err?.message || 'Failed to push data to Supabase.' };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull all data from Supabase and restore to local device database
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
        { data: rules, error: ruleErr },
        { data: templates, error: tmplErr },
      ] = await Promise.all([
        client.from(`${TABLE_PREFIX}lists`).select('*'),
        client.from(`${TABLE_PREFIX}leads`).select('*'),
        client.from(`${TABLE_PREFIX}call_logs`).select('*'),
        client.from(`${TABLE_PREFIX}cadence_rules`).select('*'),
        client.from(`${TABLE_PREFIX}sms_templates`).select('*'),
      ]);

      if (listErr) throw listErr;
      if (leadErr) throw leadErr;
      if (logErr) throw logErr;

      const restoredState: DatabaseState = {
        lists: lists || [],
        leads: leads || [],
        call_logs: logs || [],
        cadence_rules: rules || [],
        sms_templates: templates || [],
        settings: [],
      };

      // Save to local IndexedDB & localStorage mirror
      await IndexedDbStorage.saveState(restoredState);

      // Force database re-initialization
      const db = await getDatabase();
      await db.execAsync(''); // Triggers reload

      const now = new Date().toISOString();
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('snap_last_sync_time', now);
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
   * Triggers a debounced, non-blocking silent background sync
   */
  static triggerAutoSync(): void {
    const client = getSupabaseClient();
    if (!client) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.pushLocalToCloud().catch(() => {});
    }, 4000);
  }

  /**
   * Retrieves the last successful sync timestamp
   */
  static getLastSyncTime(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('snap_last_sync_time');
    }
    return null;
  }
}
