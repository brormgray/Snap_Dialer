import { Platform } from 'react-native';
import { IndexedDbStorage, DatabaseState } from './indexedDbStorage';
import { dexieDb } from './dexieDb';
import { ALL_DRIP_TEMPLATES } from '../data/dripTemplates';

export interface IDatabase {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
  runAsync(sql: string, params?: any[]): Promise<any>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

// Multi-Gigabyte High-Capacity Web Database Implementation (Dexie.js + IndexedDB)
class WebDatabase implements IDatabase {
  private lists: any[] = [];
  private leads: any[] = [];
  private call_logs: any[] = [];
  private cadence_rules: any[] = [];
  private sms_templates: any[] = [];
  private settings: { key: string; value: string }[] = [];
  private isInitialized: boolean = false;
  private inTransaction: boolean = false;

  constructor() {}

  async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      // 1. Primary atomic load from IndexedDbStorage
      const state = await IndexedDbStorage.loadState();
      this.lists = state.lists || [];
      this.leads = state.leads || [];
      this.call_logs = state.call_logs || [];
      this.cadence_rules = state.cadence_rules || [];
      this.sms_templates = state.sms_templates || [];
      this.settings = state.settings || [];

      // 2. Secondary check against Dexie if IndexedDb was completely blank
      if (this.leads.length === 0) {
        try {
          await dexieDb.initialize();
          const [leads, lists, logs, settings, rules, templates] = await Promise.all([
            dexieDb.leads.toArray(),
            dexieDb.lists.toArray(),
            dexieDb.call_logs.toArray(),
            dexieDb.settings.toArray(),
            dexieDb.cadence_rules.toArray(),
            dexieDb.sms_templates.toArray(),
          ]);
          if (leads.length > 0) this.leads = leads;
          if (lists.length > 0) this.lists = lists;
          if (logs.length > 0) this.call_logs = logs;
          if (settings.length > 0) this.settings = settings;
          if (rules.length > 0) this.cadence_rules = rules;
          if (templates.length > 0) this.sms_templates = templates;
        } catch (dexErr) {
          console.warn('Dexie secondary init note:', dexErr);
        }
      }

      // 3. Disaster Recovery: If local storage is completely blank, try pulling from Supabase Cloud
      if (this.leads.length === 0) {
        try {
          const { SupabaseSyncService } = await import('../services/supabaseSyncService');
          const recovery = await SupabaseSyncService.pullCloudToLocal();
          if (recovery.success && recovery.restoredLeads && recovery.restoredLeads > 0) {
            const recoveredState = await IndexedDbStorage.loadState();
            this.lists = recoveredState.lists || [];
            this.leads = recoveredState.leads || [];
            this.call_logs = recoveredState.call_logs || [];
            this.cadence_rules = recoveredState.cadence_rules || [];
            this.sms_templates = recoveredState.sms_templates || [];
          }
        } catch (cloudErr) {
          // Non-fatal
        }
      }
      this.isInitialized = true;
    } catch (e) {
      console.warn('WebDatabase init fallback:', e);
      const state = await IndexedDbStorage.loadState();
      this.lists = state.lists || [];
      this.leads = state.leads || [];
      this.call_logs = state.call_logs || [];
      this.cadence_rules = state.cadence_rules || [];
      this.sms_templates = state.sms_templates || [];
      this.settings = state.settings || [];
      this.isInitialized = true;
    }
  }

  private async saveToStorage(): Promise<void> {
    const state: DatabaseState = {
      lists: this.lists,
      leads: this.leads,
      call_logs: this.call_logs,
      cadence_rules: this.cadence_rules,
      sms_templates: this.sms_templates,
      settings: this.settings,
    };

    // Await primary atomic persistence to IndexedDB and localStorage mirror
    try {
      await IndexedDbStorage.saveState(state);
    } catch (err) {
      console.error('IndexedDbStorage saveState error:', err);
    }

    // Secondary async sync to Dexie table stores (upsert without destructive table wipes)
    try {
      if (this.leads.length > 0) dexieDb.leads.bulkPut(this.leads).catch(() => {});
      if (this.lists.length > 0) dexieDb.lists.bulkPut(this.lists).catch(() => {});
      if (this.call_logs.length > 0) dexieDb.call_logs.bulkPut(this.call_logs).catch(() => {});
      if (this.settings.length > 0) dexieDb.settings.bulkPut(this.settings).catch(() => {});
      if (this.sms_templates.length > 0) dexieDb.sms_templates.bulkPut(this.sms_templates).catch(() => {});
      if (this.cadence_rules.length > 0) dexieDb.cadence_rules.bulkPut(this.cadence_rules).catch(() => {});
    } catch (e) {
      // Non-fatal
    }

    // Silent background push to Supabase Cloud if configured
    try {
      const { SupabaseSyncService } = await import('../services/supabaseSyncService');
      SupabaseSyncService.triggerAutoSync();
    } catch (e) {
      // Non-fatal
    }
  }

  async execAsync(sql: string): Promise<void> {}

  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    if (this.inTransaction) {
      // Nested transaction support: simply execute without re-triggering save
      await fn();
      return;
    }

    const snapshot = {
      leads: JSON.parse(JSON.stringify(this.leads)),
      lists: JSON.parse(JSON.stringify(this.lists)),
      call_logs: JSON.parse(JSON.stringify(this.call_logs)),
      sms_templates: JSON.parse(JSON.stringify(this.sms_templates)),
      cadence_rules: JSON.parse(JSON.stringify(this.cadence_rules)),
      settings: JSON.parse(JSON.stringify(this.settings)),
    };

    this.inTransaction = true;
    try {
      await fn();
      this.inTransaction = false;
      await this.saveToStorage();
    } catch (err) {
      this.inTransaction = false;
      this.leads = snapshot.leads;
      this.lists = snapshot.lists;
      this.call_logs = snapshot.call_logs;
      this.sms_templates = snapshot.sms_templates;
      this.cadence_rules = snapshot.cadence_rules;
      this.settings = snapshot.settings;
      throw err;
    }
  }

  async getAllAsync<T>(sql: string, params: any[] = []): Promise<T[]> {
    const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    if (s.includes('from settings')) {
      return [...this.settings] as any;
    }
    if (s.includes('from lists')) {
      const sorted = [...this.lists];
      if (s.includes('order by created_at desc')) {
        sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      return sorted as any;
    }
    if (s.includes('from leads')) {
      let filtered = [...this.leads];
      if (s.includes('where list_id = ?')) {
        const listId = params[0];
        filtered = filtered.filter((l) => l.list_id === listId);
      }
      if (s.includes("last_disposition != 'do_not_call'") || s.includes("last_disposition <> 'do_not_call'")) {
        filtered = filtered.filter((l) => l.last_disposition !== 'do_not_call');
      } else if (s.includes("in ('pending', 'no_answer', 'voicemail')")) {
        filtered = filtered.filter(
          (l) => !l.last_disposition || ['pending', 'no_answer', 'voicemail'].includes(l.last_disposition)
        );
      }
      if (s.includes('follow_up_at is not null')) {
        filtered = filtered.filter((l) => !!l.follow_up_at);
      }
      if (s.includes('where is_client = 1') || s.includes('where is_client = true')) {
        filtered = filtered.filter((l) => l.is_client === true || l.is_client === 1 || String(l.is_client) === 'true');
      }
      if (s.includes('order by')) {
        if (s.includes('client_since desc')) {
          filtered.sort((a, b) => (b.client_since || '').localeCompare(a.client_since || ''));
        } else if (s.includes('priority_tier asc, created_at asc')) {
          filtered.sort((a, b) => {
            const tierA = a.priority_tier !== undefined ? Number(a.priority_tier) : 1;
            const tierB = b.priority_tier !== undefined ? Number(b.priority_tier) : 1;
            if (tierA !== tierB) return tierA - tierB;
            return (a.created_at || '').localeCompare(b.created_at || '');
          });
        } else if (s.includes('priority_tier') || s.includes('attempts_count')) {
          filtered.sort((a, b) => {
            const tierA = a.priority_tier !== undefined ? Number(a.priority_tier) : 1;
            const tierB = b.priority_tier !== undefined ? Number(b.priority_tier) : 1;
            if (tierA !== tierB) return tierA - tierB;
            const attA = a.attempts_count || 0;
            const attB = b.attempts_count || 0;
            if (attA !== attB) return attA - attB;
            const lastA = a.last_attempt_at || '';
            const lastB = b.last_attempt_at || '';
            if (lastA !== lastB) return lastA.localeCompare(lastB);
            return (a.created_at || '').localeCompare(b.created_at || '');
          });
        } else if (s.includes('follow_up_at asc')) {
          filtered.sort((a, b) => (a.follow_up_at || '').localeCompare(b.follow_up_at || ''));
        } else if (s.includes('created_at desc')) {
          filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        }
      }
      return filtered as any;
    }

    if (s.includes('from call_logs')) {
      let logs = [...this.call_logs];
      if (s.includes('where lead_id = ?')) {
        logs = logs.filter((c) => c.lead_id === params[0]);
      }
      if (s.includes('order by timestamp desc')) {
        logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      }
      return logs as any;
    }
    if (s.includes('from cadence_rules')) {
      return [...this.cadence_rules] as any;
    }
    if (s.includes('from sms_templates')) {
      return [...this.sms_templates] as any;
    }
    return [];
  }

  async getFirstAsync<T>(sql: string, params: any[] = []): Promise<T | null> {
    const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    if (s.includes('from sms_templates')) {
      if (s.includes('count(*)')) {
        return { count: this.sms_templates.length } as any;
      }
      if (s.includes('where id = ?')) {
        const match = this.sms_templates.find((t) => t.id === params[0]);
        return (match || null) as any;
      }
      return (this.sms_templates[0] || null) as any;
    }
    if (s.includes('from cadence_rules')) {
      if (s.includes('where step_number = ?')) {
        const match = this.cadence_rules.find((r) => r.step_number === params[0]);
        return (match || null) as any;
      }
      if (s.includes('where id = ?')) {
        const match = this.cadence_rules.find((r) => r.id === params[0]);
        return (match || null) as any;
      }
      return (this.cadence_rules[0] || null) as any;
    }
    if (s.includes('from call_logs')) {
      if (s.includes('count(*)') || s.includes('sum(')) {
        let totalDials = this.call_logs.length;
        let appointmentCount = 0;
        let connectedCount = 0;
        let noAnswerCount = 0;
        let voicemailCount = 0;
        let badNumberCount = 0;
        let smsSentCount = 0;

        for (const log of this.call_logs) {
          const disp = log.disposition;
          if (disp === 'appointment_set') {
            appointmentCount++;
          }
          if (disp === 'connected' || disp === 'spoke') {
            connectedCount++;
          }
          if (disp === 'no_answer') {
            noAnswerCount++;
          }
          if (disp === 'voicemail') {
            voicemailCount++;
          }
          if (disp === 'bad_number') {
            badNumberCount++;
          }
          if (log.sms_sent === 1 || log.sms_sent === true) {
            smsSentCount++;
          }
        }

        return {
          totalDials,
          appointmentCount,
          connectedCount,
          noAnswerCount,
          voicemailCount,
          badNumberCount,
          smsSentCount,
        } as any;
      }
      return (this.call_logs[0] || null) as any;
    }
    if (s.includes('from leads')) {
      if (s.includes('where id = ?')) {
        const match = this.leads.find((l) => l.id === params[0]);
        return (match || null) as any;
      }
      if (s.includes('where list_id = ?') && (s.includes('count(*)') || s.includes('sum('))) {
        const listLeads = this.leads.filter((l) => l.list_id === params[0]);
        const total = listLeads.length;
        const completed = listLeads.filter((l) =>
          ['connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call'].includes(l.last_disposition || '')
        ).length;
        const connected = listLeads.filter((l) =>
          ['connected', 'spoke', 'appointment_set'].includes(l.last_disposition || '')
        ).length;
        return { total, completed, connected } as any;
      }
      if (s.includes('count(*)')) {
        return { count: this.leads.length } as any;
      }
      return (this.leads[0] || null) as any;
    }
    if (s.includes('from lists where id = ?')) {
      const match = this.lists.find((l) => l.id === params[0]);
      return (match || null) as any;
    }
    if (s.includes('from settings where key = ?')) {
      const match = this.settings.find((st) => st.key === params[0]);
      return (match || null) as any;
    }
    return null;
  }

  async runAsync(sql: string, params: any[] = []): Promise<any> {
    const s = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    if (s.includes('insert into lists') || s.includes('insert or replace into lists')) {
      let listId = params[0];
      let title = params[1] || 'Campaign List';
      let sourceImageUri: string | null = null;
      let totalLeads = 0;
      let completedLeads = 0;
      let connectedLeads = 0;
      let createdAt = new Date().toISOString();
      let updatedAt = new Date().toISOString();

      if (params.length === 4) {
        // [id, title, created_at, updated_at]
        createdAt = params[2] || createdAt;
        updatedAt = params[3] || updatedAt;
      } else if (params.length === 6) {
        // [id, title, source_image_uri, total_leads, created_at, updated_at]
        sourceImageUri = params[2] || null;
        totalLeads = Number(params[3]) || 0;
        createdAt = params[4] || createdAt;
        updatedAt = params[5] || updatedAt;
      } else if (params.length >= 8) {
        // [id, title, source_image_uri, total_leads, completed_leads, connected_leads, created_at, updated_at]
        sourceImageUri = params[2] || null;
        totalLeads = Number(params[3]) || 0;
        completedLeads = Number(params[4]) || 0;
        connectedLeads = Number(params[5]) || 0;
        createdAt = params[6] || createdAt;
        updatedAt = params[7] || updatedAt;
      }

      const listObj = {
        id: listId,
        title,
        source_image_uri: sourceImageUri,
        total_leads: totalLeads,
        completed_leads: completedLeads,
        connected_leads: connectedLeads,
        created_at: createdAt,
        updated_at: updatedAt,
      };

      const existingIdx = this.lists.findIndex((l) => l.id === listId);
      if (existingIdx >= 0) {
        this.lists[existingIdx] = { ...this.lists[existingIdx], ...listObj };
      } else {
        this.lists.push(listObj);
      }
    } else if (s.includes('insert into leads') || s.includes('insert or replace into leads')) {
      let interests: string[] = [];
      let preferences: string[] = [];
      try {
        interests = typeof params[12] === 'string' ? JSON.parse(params[12] || '[]') : Array.isArray(params[12]) ? params[12] : [];
      } catch {
        interests = [];
      }
      try {
        preferences = typeof params[14] === 'string' ? JSON.parse(params[14] || '[]') : Array.isArray(params[14]) ? params[14] : [];
      } catch {
        preferences = [];
      }

      // Check if this is a full-field restore insert (26 params with explicit cadence/disposition/attempts)
      const isFullRestore = params.length >= 26;
      const cadenceStep = isFullRestore && params[21] !== undefined ? Number(params[21]) : 1;
      const lastDisp = isFullRestore && params[22] ? params[22] : 'pending';
      const attemptsCount = isFullRestore && params[23] !== undefined ? Number(params[23]) : 0;
      const createdAt = (isFullRestore ? params[24] : params[21]) || new Date().toISOString();
      const updatedAt = (isFullRestore ? params[25] : params[22]) || new Date().toISOString();
      const leadId = params[0] || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const leadObj = {
        id: leadId,
        list_id: params[1] || 'master_queue',
        name: params[2] || '',
        phone: params[3] || '',
        school: params[4] || 'VOL',
        email: params[5] || null,
        age: params[6] || null,
        planning_period: params[7] || null,
        room_number: params[8] || null,
        years_in_frs: params[9] || null,
        text_ok: params[10] !== undefined ? (params[10] === 1 || params[10] === true) : true,
        frs_knowledge: params[11] || null,
        frs_interests: interests,
        custom_questions: params[13] || null,
        meeting_preferences: preferences,
        annual_salary: params[15] || null,
        present_403b_contribution: params[16] || null,
        source_image_uri: params[17] || null,
        company: params[18] || 'ValuTeachers',
        notes: params[19] !== undefined ? params[19] : null,
        priority_tier: params[20] !== undefined && params[20] !== null ? Number(params[20]) : 1,
        cadence_step: cadenceStep,
        last_disposition: lastDisp,
        attempts_count: attemptsCount,
        is_client: params[26] !== undefined ? (params[26] === 1 || params[26] === true) : false,
        products: [],
        annualized_premium: 0,
        transfer_assets_volume: 0,
        appointment_outcome: null,
        appointment_scheduled_at: null,
        appointment_completed_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      };

      const existingIdx = this.leads.findIndex((l) => l.id === leadId);
      if (existingIdx >= 0) {
        this.leads[existingIdx] = { ...this.leads[existingIdx], ...leadObj };
      } else {
        this.leads.push(leadObj);
      }
    } else if (s.includes('insert into call_logs') || s.includes('insert or replace into call_logs')) {
      const logId = params[0] || `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logObj = {
        id: logId,
        lead_id: params[1],
        list_id: params[2],
        timestamp: params[3] || new Date().toISOString(),
        duration_seconds: Number(params[4]) || 0,
        disposition: params[5],
        note: params[6] || null,
        sms_sent: params[7] === 1 || params[7] === true,
        sms_body: params[8] || null,
      };
      const existingIdx = this.call_logs.findIndex((c) => c.id === logId);
      if (existingIdx >= 0) {
        this.call_logs[existingIdx] = logObj;
      } else {
        this.call_logs.push(logObj);
      }
    } else if (s.includes('insert into sms_templates') || s.includes('insert or replace into sms_templates')) {
      const existingIdx = this.sms_templates.findIndex((t) => t.id === params[0]);
      if (existingIdx >= 0) {
        this.sms_templates[existingIdx] = { id: params[0], title: params[1], body: params[2] };
      } else {
        this.sms_templates.push({ id: params[0], title: params[1], body: params[2] });
      }
    } else if (s.includes('insert into cadence_rules') || s.includes('insert or replace into cadence_rules')) {
      const existingIdx = this.cadence_rules.findIndex((r) => r.id === params[0]);
      const ruleObj = {
        id: params[0],
        step_number: params[1],
        condition_disposition: params[2],
        action_type: params[3],
        sms_template_id: params[4],
        delay_hours: params[5],
      };
      if (existingIdx >= 0) {
        this.cadence_rules[existingIdx] = ruleObj;
      } else {
        this.cadence_rules.push(ruleObj);
      }
    } else if (s.includes("set last_disposition = 'pending'") || s.includes("where last_disposition in ('no_answer', 'voicemail')")) {
      for (const lead of this.leads) {
        if (['no_answer', 'voicemail'].includes(lead.last_disposition)) {
          lead.last_disposition = 'pending';
        }
      }
    } else if (s.includes('update call_logs set lead_id = ? where lead_id = ?')) {
      const newLeadId = params[0];
      const oldLeadId = params[1];
      for (const log of this.call_logs) {
        if (String(log.lead_id).trim() === String(oldLeadId).trim()) {
          log.lead_id = newLeadId;
        }
      }
      try {
        dexieDb.call_logs.where('lead_id').equals(oldLeadId).modify({ lead_id: newLeadId }).catch(() => {});
      } catch {}
    } else if (s.includes('update cadence_rules set')) {
      const ruleId = params[params.length - 1];
      const rule = this.cadence_rules.find((r) => r.id === ruleId);
      if (rule) {
        rule.action_type = params[0];
        rule.sms_template_id = params[1];
      }
    } else if (s.includes('update leads set') || (s.includes('update leads') && s.includes('set'))) {
      const leadId = params[params.length - 1];
      const lead = this.leads.find((l) => String(l.id).trim() === String(leadId).trim());
      if (lead) {
        if (s.includes('notes = ?') && s.includes('attempts_count = ?') && s.includes('last_disposition = ?') && s.includes('room_number = ?')) {
          if (s.includes('meeting_preferences = ?') && s.includes('is_client = ?') && s.includes('annualized_premium = ?')) {
            lead.notes = params[0] || null;
            lead.attempts_count = Number(params[1]) || 0;
            lead.last_disposition = params[2] || 'pending';
            lead.last_attempt_at = params[3] || null;
            lead.follow_up_at = params[4] || null;
            lead.source_image_uri = params[5] || null;
            lead.room_number = params[6] || null;
            lead.planning_period = params[7] || null;
            lead.email = params[8] || null;
            lead.years_in_frs = params[9] || null;
            lead.frs_knowledge = params[10] || null;
            lead.custom_questions = params[11] || null;
            try {
              lead.frs_interests = typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || []);
            } catch { lead.frs_interests = []; }
            try {
              lead.meeting_preferences = typeof params[13] === 'string' ? JSON.parse(params[13]) : (params[13] || []);
            } catch { lead.meeting_preferences = []; }
            lead.is_client = params[14] === 1 || params[14] === true;
            lead.client_since = params[15] || null;
            try {
              lead.products = typeof params[16] === 'string' ? JSON.parse(params[16]) : (params[16] || []);
            } catch { lead.products = []; }
            lead.annualized_premium = params[17] !== undefined && params[17] !== null ? Number(params[17]) : null;
            lead.transfer_assets_volume = params[18] !== undefined && params[18] !== null ? Number(params[18]) : null;
            lead.policy_effective_date = params[19] || null;
            lead.annual_review_due_date = params[20] || null;
            lead.drip_track = params[21] || 'none';
            lead.drip_step = params[22] !== undefined ? Number(params[22]) : 0;
            lead.next_drip_scheduled_at = params[23] || null;
            lead.appointment_scheduled_at = params[24] || null;
            lead.appointment_outcome = params[25] || null;
            lead.appointment_completed_at = params[26] || null;
            lead.updated_at = params[27] || new Date().toISOString();
          } else {
            lead.notes = params[0] || null;
            lead.attempts_count = Number(params[1]) || 0;
            lead.last_disposition = params[2] || 'pending';
            lead.last_attempt_at = params[3] || null;
            lead.follow_up_at = params[4] || null;
            lead.source_image_uri = params[5] || null;
            lead.room_number = params[6] || null;
            lead.planning_period = params[7] || null;
            lead.email = params[8] || null;
            lead.years_in_frs = params[9] || null;
            lead.frs_knowledge = params[10] || null;
            lead.custom_questions = params[11] || null;
            try {
              lead.frs_interests = typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || []);
            } catch { lead.frs_interests = []; }
            try {
              lead.meeting_preferences = typeof params[13] === 'string' ? JSON.parse(params[13]) : (params[13] || []);
            } catch { lead.meeting_preferences = []; }
            lead.updated_at = params[14] || new Date().toISOString();
          }
        } else if (s.includes("last_disposition = 'callback_requested'") || (s.includes('follow_up_at = ?') && !s.includes('appointment_scheduled_at'))) {
          lead.follow_up_at = params[0];
          lead.last_disposition = 'callback_requested';
          if (params[1] !== undefined && params[1] !== null) lead.notes = params[1];
          lead.updated_at = params[2] || new Date().toISOString();
        } else if (s.includes('follow_up_at = null') || s.includes('follow_up_at=null')) {
          lead.follow_up_at = null;
          if (lead.last_disposition === 'callback_requested') {
            lead.last_disposition = 'pending';
          }
          if (params[0] !== undefined && params[0] !== null) lead.notes = params[0];
          lead.updated_at = params[1] || new Date().toISOString();
        } else if (s.includes('name = ?')) {
          lead.name = params[0];
          lead.phone = params[1];
          lead.school = params[2];
          if (s.includes('room_number = ?')) {
            lead.email = params[3] || null;
            lead.room_number = params[4] || null;
            lead.planning_period = params[5] || null;
            lead.years_in_frs = params[6] || null;
            if (params[7] !== undefined) lead.notes = params[7] || null;
            if (params[8] !== undefined) lead.priority_tier = Number(params[8]);
            if (params[9]) lead.list_id = params[9];
            if (s.includes('is_client = ?')) {
              lead.is_client = params[10] === 1 || params[10] === true;
              lead.client_since = params[11] || lead.client_since || null;
              try {
                lead.products = typeof params[12] === 'string' ? JSON.parse(params[12]) : (params[12] || []);
              } catch { lead.products = []; }
              lead.annualized_premium = params[13] !== undefined && params[13] !== null ? Number(params[13]) : null;
              lead.transfer_assets_volume = params[14] !== undefined && params[14] !== null ? Number(params[14]) : null;
              lead.policy_effective_date = params[15] || null;
              lead.annual_review_due_date = params[16] || null;
              lead.drip_track = params[17] || 'none';
              lead.drip_step = params[18] !== undefined ? Number(params[18]) : 0;
              lead.last_drip_sent_at = params[19] || null;
              lead.next_drip_scheduled_at = params[20] || null;
              if (s.includes('appointment_scheduled_at = ?')) {
                lead.appointment_scheduled_at = params[21] || null;
                lead.appointment_outcome = params[22] || null;
                lead.appointment_completed_at = params[23] || null;
                if (s.includes('last_disposition = ?')) {
                  lead.last_disposition = params[24] || lead.last_disposition || 'pending';
                  lead.updated_at = params[25] || new Date().toISOString();
                } else {
                  lead.updated_at = params[24] || new Date().toISOString();
                }
              } else {
                lead.updated_at = params[21] || new Date().toISOString();
              }
              if (lead.is_client) {
                if (!lead.appointment_outcome) lead.appointment_outcome = 'converted';
                if (!lead.appointment_completed_at) lead.appointment_completed_at = new Date().toISOString();
                if (lead.last_disposition === 'appointment_set') lead.last_disposition = 'connected';
              }
            } else {
              lead.updated_at = params[10] || new Date().toISOString();
            }
          } else if (s.includes('email = ?')) {
            lead.email = params[3] || null;
            lead.planning_period = params[4] || null;
            lead.years_in_frs = params[5] || null;
            if (params[6] !== undefined) lead.notes = params[6] || null;
            if (params[7] !== undefined) lead.priority_tier = Number(params[7]);
            if (params[8]) lead.list_id = params[8];
            lead.updated_at = params[9] || new Date().toISOString();
          } else {
            lead.planning_period = params[3] || null;
            lead.years_in_frs = params[4] || null;
            if (params[5] !== undefined) lead.notes = params[5] || null;
            if (params[6] !== undefined) lead.priority_tier = Number(params[6]);
            if (params[7]) lead.list_id = params[7];
            lead.updated_at = params[8] || new Date().toISOString();
          }
        } else if (s.includes('is_client = 1') || s.includes('is_client = ?') || s.includes('is_client=')) {
          const isDirectConvert = s.includes('is_client = 1');
          const offset = isDirectConvert ? 0 : 1;
          lead.is_client = true;
          lead.client_since = params[offset] || lead.client_since || new Date().toISOString();
          if (isDirectConvert) {
            lead.appointment_outcome = 'converted';
            lead.appointment_completed_at = params[9] || lead.appointment_completed_at || new Date().toISOString();
            if (lead.last_disposition === 'appointment_set') lead.last_disposition = 'connected';
          }
          try {
            lead.products = typeof params[offset + 1] === 'string' ? JSON.parse(params[offset + 1]) : (params[offset + 1] || []);
          } catch { lead.products = []; }
          lead.annualized_premium = params[offset + 2] !== undefined && params[offset + 2] !== null ? Number(params[offset + 2]) : null;
          lead.transfer_assets_volume = params[offset + 3] !== undefined && params[offset + 3] !== null ? Number(params[offset + 3]) : null;
          lead.policy_effective_date = params[offset + 4] || null;
          lead.annual_review_due_date = params[offset + 5] || null;
          lead.drip_track = params[offset + 6] || 'none';
          lead.drip_step = params[offset + 7] !== undefined ? Number(params[offset + 7]) : 0;
          lead.next_drip_scheduled_at = params[offset + 8] || null;
          if (isDirectConvert) {
            if (params[10]) {
              lead.notes = lead.notes ? `${lead.notes}\n\n${params[10]}` : params[10];
            }
          } else if (params[offset + 9] && s.includes('notes = ?')) {
            lead.notes = params[offset + 9];
          }
          lead.updated_at = params[params.length - 2] || new Date().toISOString();
        } else if (s.includes('appointment_outcome') || s.includes('appointment_scheduled_at')) {
          if (s.includes("appointment_outcome = 'converted'")) {
            lead.appointment_outcome = 'converted';
            lead.appointment_completed_at = params[0] || new Date().toISOString();
            lead.updated_at = params[1] || new Date().toISOString();
          } else if (s.includes("appointment_outcome = 'nurture_drip'")) {
            lead.appointment_outcome = 'nurture_drip';
            lead.appointment_completed_at = params[0] || new Date().toISOString();
            lead.last_disposition = 'connected';
            lead.drip_track = 'prospect_nurture';
            lead.drip_step = 0;
            lead.next_drip_scheduled_at = params[1] || null;
            if (params[2]) lead.notes = lead.notes ? `${lead.notes}\n\n${params[2]}` : params[2];
            lead.updated_at = params[4] || new Date().toISOString();
          } else if (s.includes("appointment_outcome = 'no_show'") || s.includes("outcome = 'declined'")) {
            lead.appointment_outcome = s.includes('no_show') ? 'no_show' : 'declined';
            lead.appointment_completed_at = params[0] || new Date().toISOString();
            lead.last_disposition = s.includes('no_show') ? 'no_answer' : 'spoke';
            if (params[1]) lead.notes = lead.notes ? `${lead.notes}\n\n${params[1]}` : params[1];
            lead.updated_at = params[params.length - 2] || new Date().toISOString();
          } else if (s.includes('appointment_outcome = ?')) {
            lead.appointment_outcome = params[0];
            lead.appointment_completed_at = params[1] || new Date().toISOString();
            if (s.includes('last_disposition = ?')) {
              lead.last_disposition = params[2];
            }
            lead.updated_at = params[params.length - 2] || new Date().toISOString();
          } else if (s.includes('appointment_scheduled_at = ?')) {
            lead.appointment_scheduled_at = params[0];
            lead.appointment_outcome = null;
            lead.appointment_completed_at = null;
            lead.last_disposition = 'appointment_set';
            if (s.includes('follow_up_at = ?')) {
              lead.follow_up_at = params[1];
              if (params[2]) lead.notes = params[2];
            } else if (s.includes('planning_period = coalesce(?, planning_period)')) {
              if (params[1]) lead.planning_period = params[1];
              if (params[2]) lead.notes = lead.notes ? `${lead.notes}\n\n${params[2]}` : params[2];
            } else if (s.includes('notes = coalesce(?, notes)')) {
              if (params[1]) lead.notes = params[1];
            } else if (params[1]) {
              lead.notes = lead.notes ? `${lead.notes}\n\n${params[1]}` : params[1];
            }
            lead.updated_at = params[params.length - 2] || new Date().toISOString();
          }
        } else if (s.includes('drip_step = ?') || s.includes('last_drip_sent_at = ?')) {
          lead.drip_step = Number(params[0]) || 0;
          lead.last_drip_sent_at = params[1] || null;
          lead.next_drip_scheduled_at = params[2] || null;
          lead.updated_at = params[3] || new Date().toISOString();
        } else if (s.includes('priority_tier = ?') && s.includes('list_id = ?')) {
          lead.priority_tier = Number(params[0]);
          lead.list_id = params[1];
          lead.updated_at = params[2] || new Date().toISOString();
        } else if (s.includes('priority_tier = ?')) {
          lead.priority_tier = Number(params[0]);
          lead.updated_at = params[1] || new Date().toISOString();
        } else if (s.includes('notes = ?') && s.includes('updated_at = ?') && params.length === 3) {
          lead.notes = params[0] || null;
          lead.updated_at = params[1] || new Date().toISOString();
        } else {
          lead.last_disposition = params[0];
          lead.attempts_count = params[1];
          lead.cadence_step = params[2];
          lead.last_attempt_at = params[3];
          if (params[4] !== undefined && params[4] !== null) lead.notes = params[4];
          lead.updated_at = params[5] || new Date().toISOString();
        }
      } else {
        console.warn(`[WebDatabase] update leads set: leadId '${leadId}' not found in active in-memory leads array (${this.leads.length} total)`);
      }
    } else if (s.includes('update lists set') || (s.includes('update lists') && s.includes('set'))) {
      const listId = params[params.length - 1];
      const list = this.lists.find((l) => String(l.id).trim() === String(listId).trim());
      if (list) {
        list.completed_leads = params[0];
        list.connected_leads = params[1];
        list.updated_at = params[2];
      }
    } else if (s.includes('insert into settings') || s.includes('insert or replace into settings')) {
      const existingIdx = this.settings.findIndex((st) => st.key === params[0]);
      if (existingIdx >= 0) {
        this.settings[existingIdx] = { key: params[0], value: params[1] };
      } else {
        this.settings.push({ key: params[0], value: params[1] });
      }
    } else if (s.includes('delete from leads where id = ?')) {
      const leadId = params[0];
      this.leads = this.leads.filter((l) => l.id !== leadId);
      this.call_logs = this.call_logs.filter((c) => c.lead_id !== leadId);
      try {
        dexieDb.leads.delete(leadId).catch(() => {});
        dexieDb.call_logs.where('lead_id').equals(leadId).delete().catch(() => {});
        dexieDb.lead_photos.where('lead_id').equals(leadId).delete().catch(() => {});
      } catch {}
    } else if (s.includes('delete from leads')) {
      this.leads = [];
      this.call_logs = [];
      try {
        dexieDb.leads.clear().catch(() => {});
        dexieDb.call_logs.clear().catch(() => {});
        dexieDb.lead_photos.clear().catch(() => {});
      } catch {}
    } else if (s.includes('delete from lists where id = ?')) {
      const listId = params[0];
      const deletedLeadIds = this.leads.filter((l) => l.list_id === listId).map((l) => l.id);
      this.lists = this.lists.filter((l) => l.id !== listId);
      this.leads = this.leads.filter((l) => l.list_id !== listId);
      this.call_logs = this.call_logs.filter((c) => c.list_id !== listId);
      try {
        dexieDb.lists.delete(listId).catch(() => {});
        dexieDb.leads.where('list_id').equals(listId).delete().catch(() => {});
        dexieDb.call_logs.where('list_id').equals(listId).delete().catch(() => {});
        for (const lid of deletedLeadIds) {
          dexieDb.lead_photos.where('lead_id').equals(lid).delete().catch(() => {});
        }
      } catch {}
    } else if (s.includes('delete from lists')) {
      this.lists = [];
      try {
        dexieDb.lists.clear().catch(() => {});
      } catch {}
    } else if (s.includes('delete from call_logs')) {
      this.call_logs = [];
      try {
        dexieDb.call_logs.clear().catch(() => {});
      } catch {}
    }
    if (!this.inTransaction) {
      await this.saveToStorage();
    }
    return { changes: 1 };
  }
}

let dbInstance: IDatabase | null = null;
let dbInitPromise: Promise<IDatabase> | null = null;

/**
 * Clears the in-memory singleton so the next call to getDatabase() will
 * rebuild from the freshly-written IndexedDB state (used after cloud restore).
 */
export function resetDatabase(): void {
  dbInstance = null;
  dbInitPromise = null;
}

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    if (Platform.OS === 'web') {
      const webDb = new WebDatabase();
      await webDb.init();
      await initWebDefaults(webDb);
      dbInstance = webDb;
      return dbInstance;
    }

    // Native iOS and Android
    const SQLite = await import('expo-sqlite');
    const nativeDb = await SQLite.openDatabaseAsync('snap_dialer_valuteachers.db');
    await initNativeDatabase(nativeDb);
    dbInstance = nativeDb as unknown as IDatabase;
    return dbInstance;
  })();

  return dbInitPromise;
}

async function initWebDefaults(db: WebDatabase) {
  const templates = await db.getAllAsync('SELECT * FROM sms_templates');
  if (templates.length === 0) {
    await db.runAsync('INSERT INTO sms_templates', [
      'tpl_just_called',
      'No Answer - Just Called Follow-up',
      'Hi {{name}}, this is {{my_name}} with ValuTeachers! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!',
    ]);
    await db.runAsync('INSERT INTO sms_templates', [
      'tpl_frs_meeting',
      'Planning Period Sit-Down Confirmation',
      'Hi {{name}}, this is {{my_name}} with ValuTeachers. I have your FRS Report Card from {{school}} and will be on campus this week. Does {{meeting_pref}} still work for a sit-down during your planning period in your room to review your FRS & 403(b) options?',
    ]);
    await db.runAsync('INSERT INTO sms_templates', [
      'tpl_frs_planning',
      'Planning Period Follow-up',
      'Hi {{name}}, {{my_name}} with ValuTeachers! Tried catching you regarding your FRS analysis. I will be visiting {{school}} this week—would doing a sit-down during your planning period work for you?',
    ]);
    await db.runAsync('INSERT INTO sms_templates', [
      'tpl_frs_drop',
      'D.R.O.P. & Pension Sit-Down',
      'Hi {{name}}, this is {{my_name}} with ValuTeachers. Regarding your {{years_in_frs}} years in FRS and your report card request, when this week can we do a sit-down during your planning period to review your DROP timeline and bonus options?',
    ]);

    await db.runAsync('INSERT INTO cadence_rules', ['cad_1', 1, 'no_answer', 'call_and_sms', 'tpl_just_called', 2]);
    await db.runAsync('INSERT INTO cadence_rules', ['cad_2', 2, 'no_answer', 'call_and_sms', 'tpl_frs_meeting', 24]);
    await db.runAsync('INSERT INTO cadence_rules', ['cad_3', 3, 'no_answer', 'call_and_sms', 'tpl_frs_planning', 48]);
  } else {
    // Ensure tpl_just_called exists and cad_1 is enabled for call_and_sms
    const hasJustCalled = templates.some((t: any) => t.id === 'tpl_just_called');
    if (!hasJustCalled) {
      await db.runAsync('INSERT INTO sms_templates', [
        'tpl_just_called',
        'No Answer - Just Called Follow-up',
        'Hi {{name}}, this is {{my_name}} with ValuTeachers! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!',
      ]);
    }
    const cad1 = await db.getFirstAsync<any>('SELECT * FROM cadence_rules WHERE id = ?', ['cad_1']);
    if (cad1 && (cad1.action_type === 'call_only' || !cad1.sms_template_id)) {
      await db.runAsync('UPDATE cadence_rules SET action_type = ?, sms_template_id = ? WHERE id = ?', [
        'call_and_sms',
        'tpl_just_called',
        'cad_1',
      ]);
    }
  }

  // Ensure the 8 FRS Educational Drip templates exist
  const currentTemplates = await db.getAllAsync<any>('SELECT * FROM sms_templates');
  for (const tpl of ALL_DRIP_TEMPLATES) {
    const hasTpl = currentTemplates.some((t: any) => t.id === tpl.id);
    if (!hasTpl) {
      await db.runAsync('INSERT INTO sms_templates', [tpl.id, tpl.title, tpl.body]);
    }
  }
}

async function initNativeDatabase(db: any): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source_image_uri TEXT,
      total_leads INTEGER DEFAULT 0,
      completed_leads INTEGER DEFAULT 0,
      connected_leads INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      school TEXT,
      email TEXT,
      age TEXT,
      planning_period TEXT,
      room_number TEXT,
      years_in_frs TEXT,
      text_ok INTEGER DEFAULT 1,
      frs_knowledge TEXT,
      frs_interests TEXT,
      custom_questions TEXT,
      meeting_preferences TEXT,
      annual_salary TEXT,
      present_403b_contribution TEXT,
      source_image_uri TEXT,
      company TEXT,
      notes TEXT,
      priority_tier INTEGER DEFAULT 1,
      cadence_step INTEGER DEFAULT 1,
      last_attempt_at TEXT,
      last_disposition TEXT DEFAULT 'pending',
      follow_up_at TEXT,
      attempts_count INTEGER DEFAULT 0,
      is_client INTEGER DEFAULT 0,
      client_since TEXT,
      products TEXT,
      annualized_premium REAL DEFAULT 0,
      transfer_assets_volume REAL DEFAULT 0,
      policy_effective_date TEXT,
      annual_review_due_date TEXT,
      drip_track TEXT DEFAULT 'none',
      drip_step INTEGER DEFAULT 0,
      last_drip_sent_at TEXT,
      next_drip_scheduled_at TEXT,
      appointment_scheduled_at TEXT,
      appointment_outcome TEXT,
      appointment_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY NOT NULL,
      lead_id TEXT NOT NULL,
      list_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      disposition TEXT NOT NULL,
      note TEXT,
      sms_sent INTEGER DEFAULT 0,
      sms_body TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cadence_rules (
      id TEXT PRIMARY KEY NOT NULL,
      step_number INTEGER NOT NULL,
      condition_disposition TEXT NOT NULL,
      action_type TEXT NOT NULL,
      sms_template_id TEXT,
      delay_hours INTEGER DEFAULT 24
    );

    CREATE TABLE IF NOT EXISTS sms_templates (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_leads_list_id ON leads(list_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(last_disposition);
    CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority_tier);
    CREATE INDEX IF NOT EXISTS idx_leads_is_client ON leads(is_client);
    CREATE INDEX IF NOT EXISTS idx_leads_drip ON leads(drip_track, next_drip_scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_leads_annual_review ON leads(annual_review_due_date);
    CREATE INDEX IF NOT EXISTS idx_leads_appointment_lifecycle ON leads(last_disposition, appointment_outcome, appointment_scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
  `);

  const columnsToAdd = [
    'priority_tier INTEGER DEFAULT 1',
    'room_number TEXT',
    'email TEXT',
    'planning_period TEXT',
    'years_in_frs TEXT',
    'school TEXT',
    'age TEXT',
    'text_ok INTEGER DEFAULT 1',
    'frs_knowledge TEXT',
    'frs_interests TEXT',
    'custom_questions TEXT',
    'meeting_preferences TEXT',
    'annual_salary TEXT',
    'present_403b_contribution TEXT',
    'source_image_uri TEXT',
    'company TEXT',
    'notes TEXT',
    'cadence_step INTEGER DEFAULT 1',
    'last_attempt_at TEXT',
    'last_disposition TEXT DEFAULT "pending"',
    'follow_up_at TEXT',
    'attempts_count INTEGER DEFAULT 0',
    'is_client INTEGER DEFAULT 0',
    'client_since TEXT',
    'products TEXT',
    'annualized_premium REAL DEFAULT 0',
    'transfer_assets_volume REAL DEFAULT 0',
    'policy_effective_date TEXT',
    'annual_review_due_date TEXT',
    'drip_track TEXT DEFAULT "none"',
    'drip_step INTEGER DEFAULT 0',
    'last_drip_sent_at TEXT',
    'next_drip_scheduled_at TEXT',
    'appointment_scheduled_at TEXT',
    'appointment_outcome TEXT',
    'appointment_completed_at TEXT',
  ];
  for (const col of columnsToAdd) {
    try {
      await db.execAsync(`ALTER TABLE leads ADD COLUMN ${col};`);
    } catch (e) {
      // Column already exists
    }
  }

  const templateCount = await db.getFirstAsync('SELECT COUNT(*) as count FROM sms_templates');
  if (!templateCount || templateCount.count === 0) {
    await db.runAsync(
      `INSERT INTO sms_templates (id, title, body) VALUES 
       ('tpl_just_called', 'No Answer - Just Called Follow-up', 'Hi {{name}}, this is {{my_name}} with ValuTeachers! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!'),
       ('tpl_frs_meeting', 'Planning Period Sit-Down Confirmation', 'Hi {{name}}, this is {{my_name}} with ValuTeachers. I have your FRS Report Card from {{school}} and will be on campus this week. Does {{meeting_pref}} still work for a sit-down during your planning period in your room to review your FRS & 403(b) options?'),
       ('tpl_frs_planning', 'Planning Period Follow-up', 'Hi {{name}}, {{my_name}} with ValuTeachers! Tried catching you regarding your FRS analysis. I will be visiting {{school}} this week—would doing a sit-down during your planning period work for you?'),
       ('tpl_frs_drop', 'D.R.O.P. & Pension Sit-Down', 'Hi {{name}}, this is {{my_name}} with ValuTeachers. Regarding your {{years_in_frs}} years in FRS and your report card request, when this week can we do a sit-down during your planning period to review your DROP timeline and bonus options?')`
    );

    await db.runAsync(
      `INSERT INTO cadence_rules (id, step_number, condition_disposition, action_type, sms_template_id, delay_hours) VALUES
       ('cad_1', 1, 'no_answer', 'call_and_sms', 'tpl_just_called', 2),
       ('cad_2', 2, 'no_answer', 'call_and_sms', 'tpl_frs_meeting', 24),
       ('cad_3', 3, 'no_answer', 'call_and_sms', 'tpl_frs_planning', 48)`
    );
  } else {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO sms_templates (id, title, body) VALUES 
         ('tpl_just_called', 'No Answer - Just Called Follow-up', 'Hi {{name}}, this is {{my_name}} with ValuTeachers! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!')`
      );
      await db.runAsync(
        `UPDATE cadence_rules SET action_type = 'call_and_sms', sms_template_id = 'tpl_just_called' WHERE id = 'cad_1' AND (action_type = 'call_only' OR sms_template_id IS NULL)`
      );
    } catch (e) {
      // Ignore if table not ready
    }
  }

  // Seed the 8 FRS Educational Drip templates in native SQLite
  for (const tpl of ALL_DRIP_TEMPLATES) {
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO sms_templates (id, title, body) VALUES (?, ?, ?)`,
        [tpl.id, tpl.title, tpl.body]
      );
    } catch (e) {}
  }
}
