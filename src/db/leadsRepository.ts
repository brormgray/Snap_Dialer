import { getDatabase } from './database';
import { Lead, LeadList, CallDisposition, ExtractedLeadItem } from '../types';

export class LeadsRepository {
  static async createListWithLeads(
    title: string,
    imageUri: string | null,
    leads: ExtractedLeadItem[]
  ): Promise<LeadList> {
    const db = await getDatabase();
    const listId = 'list_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const validLeads = leads.filter((l) => l.name.trim() && l.phone.trim());

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO lists (id, title, source_image_uri, total_leads, completed_leads, connected_leads, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
        [listId, title, imageUri, validLeads.length, now, now]
      );

      for (const item of validLeads) {
        const leadId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await db.runAsync(
          `INSERT INTO leads (
            id, list_id, name, phone, school, email, age, planning_period, 
            room_number, years_in_frs, text_ok, frs_knowledge, frs_interests, 
            custom_questions, meeting_preferences, annual_salary, present_403b_contribution, 
            source_image_uri, company, notes, priority_tier, cadence_step, last_disposition, attempts_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 0, ?, ?)`,
          [
            leadId,
            listId,
            item.name.trim(),
            item.phone.trim(),
            item.school || 'VOL',
            item.email || null,
            item.age || null,
            item.planning_period || null,
            item.room_number || null,
            item.years_in_frs || null,
            item.text_ok !== undefined ? (item.text_ok ? 1 : 0) : 1,
            item.frs_knowledge || null,
            JSON.stringify(item.frs_interests || []),
            item.custom_questions || null,
            JSON.stringify(item.meeting_preferences || []),
            item.annual_salary || null,
            item.present_403b_contribution || null,
            item.source_image_uri || imageUri || null,
            item.company || 'ValuTeachers',
            item.notes || null,
            item.priority_tier || 1,
            now,
            now,
          ]
        );
      }
    });

    return {
      id: listId,
      title,
      source_image_uri: imageUri,
      total_leads: validLeads.length,
      completed_leads: 0,
      connected_leads: 0,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Adds a single educator lead directly to the pipeline with customizable list and priority tier
   */
  static async addSingleLead(
    item: ExtractedLeadItem,
    imageUri?: string | null
  ): Promise<Lead> {
    const db = await getDatabase();
    const leadId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    const targetListId = item.list_id || 'master_queue';
    const targetTier = item.priority_tier || 1;

    await db.runAsync(
      `INSERT INTO leads (
        id, list_id, name, phone, school, email, age, planning_period, 
        room_number, years_in_frs, text_ok, frs_knowledge, frs_interests, 
        custom_questions, meeting_preferences, annual_salary, present_403b_contribution, 
        source_image_uri, company, notes, priority_tier, cadence_step, last_disposition, attempts_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 0, ?, ?)`,
      [
        leadId,
        targetListId,
        item.name.trim(),
        item.phone.trim(),
        item.school || 'VOL',
        item.email || null,
        item.age || null,
        item.planning_period || null,
        item.room_number || null,
        item.years_in_frs || null,
        item.text_ok !== undefined ? (item.text_ok ? 1 : 0) : 1,
        item.frs_knowledge || null,
        JSON.stringify(item.frs_interests || []),
        item.custom_questions || null,
        JSON.stringify(item.meeting_preferences || []),
        item.annual_salary || null,
        item.present_403b_contribution || null,
        item.source_image_uri || imageUri || null,
        item.company || 'ValuTeachers',
        item.notes || null,
        targetTier,
        now,
        now,
      ]
    );

    const created = await this.getLeadById(leadId);
    return (
      created || {
        id: leadId,
        list_id: targetListId,
        name: item.name.trim(),
        phone: item.phone.trim(),
        school: item.school || 'VOL',
        email: item.email || null,
        age: item.age || null,
        planning_period: item.planning_period || null,
        room_number: item.room_number || null,
        years_in_frs: item.years_in_frs || null,
        text_ok: item.text_ok !== undefined ? item.text_ok : true,
        frs_knowledge: item.frs_knowledge || null,
        frs_interests: item.frs_interests || [],
        custom_questions: item.custom_questions || null,
        meeting_preferences: item.meeting_preferences || [],
        annual_salary: item.annual_salary || null,
        present_403b_contribution: item.present_403b_contribution || null,
        source_image_uri: imageUri || null,
        company: 'ValuTeachers',
        notes: item.notes || null,
        priority_tier: targetTier,
        cadence_step: 1,
        last_disposition: 'pending',
        attempts_count: 0,
        created_at: now,
        updated_at: now,
      }
    );
  }

  static async getAllLeads(): Promise<Lead[]> {
    const db = await getDatabase();
    const rawLeads = await db.getAllAsync<any>('SELECT * FROM leads ORDER BY created_at DESC');
    return rawLeads.map(this.hydrateLead);
  }

  static async getMasterDialingQueue(): Promise<Lead[]> {
    const db = await getDatabase();
    const rawLeads = await db.getAllAsync<any>(
      `SELECT * FROM leads 
       WHERE (last_disposition IS NULL OR last_disposition IN ('pending', 'no_answer', 'voicemail'))
       ORDER BY priority_tier ASC, attempts_count ASC, created_at ASC`
    );
    return rawLeads.map(this.hydrateLead);
  }

  static async deleteLead(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM leads WHERE id = ?', [id]);
  }

  static async recycleUnansweredLeads(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE leads 
       SET last_disposition = 'pending' 
       WHERE last_disposition IN ('no_answer', 'voicemail')`
    );
  }

  static async getAllLists(): Promise<LeadList[]> {
    const db = await getDatabase();
    return await db.getAllAsync<LeadList>('SELECT * FROM lists ORDER BY created_at DESC');
  }

  static async getListById(id: string): Promise<LeadList | null> {
    const db = await getDatabase();
    return await db.getFirstAsync<LeadList>('SELECT * FROM lists WHERE id = ?', [id]);
  }

  static async createNewNamedList(title: string): Promise<LeadList> {
    const db = await getDatabase();
    const listId = 'list_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO lists (id, title, source_image_uri, total_leads, completed_leads, connected_leads, created_at, updated_at)
       VALUES (?, ?, NULL, 0, 0, 0, ?, ?)`,
      [listId, title.trim(), now, now]
    );
    return {
      id: listId,
      title: title.trim(),
      total_leads: 0,
      completed_leads: 0,
      connected_leads: 0,
      created_at: now,
      updated_at: now,
    };
  }

  static async deleteList(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM lists WHERE id = ?', [id]);
  }

  static async getLeadsForList(listId: string): Promise<Lead[]> {
    const db = await getDatabase();
    const rawLeads = await db.getAllAsync<any>(
      'SELECT * FROM leads WHERE list_id = ? ORDER BY priority_tier ASC, created_at ASC',
      [listId]
    );
    return rawLeads.map(this.hydrateLead);
  }

  static async getLeadById(leadId: string): Promise<Lead | null> {
    const db = await getDatabase();
    const raw = await db.getFirstAsync<any>('SELECT * FROM leads WHERE id = ?', [leadId]);
    return raw ? this.hydrateLead(raw) : null;
  }

  static async getDialingQueueForList(listId?: string): Promise<Lead[]> {
    const db = await getDatabase();
    if (!listId || listId === 'all' || listId === 'master_queue') {
      return await this.getMasterDialingQueue();
    }
    const rawLeads = await db.getAllAsync<any>(
      `SELECT * FROM leads 
       WHERE list_id = ? 
         AND (last_disposition IS NULL OR last_disposition IN ('pending', 'no_answer', 'voicemail'))
       ORDER BY priority_tier ASC, attempts_count ASC, created_at ASC`,
      [listId]
    );
    return rawLeads.map(this.hydrateLead);
  }

  static async getAllSchools(): Promise<{ school: string; count: number }[]> {
    const all = await this.getAllLeads();
    const map = new Map<string, number>();
    for (const l of all) {
      const s = (l.school || 'VOL').trim();
      map.set(s, (map.get(s) || 0) + 1);
    }
    return Array.from(map.entries()).map(([school, count]) => ({ school, count }));
  }

  static async getDialingQueueForSchool(schoolName: string, listId?: string): Promise<Lead[]> {
    const all = await this.getDialingQueueForList(listId);
    if (!schoolName || schoolName === 'all') return all;
    return all.filter((l) => (l.school || 'VOL').toLowerCase().trim() === schoolName.toLowerCase().trim());
  }

  static async importLeadsBatch(leads: Partial<ExtractedLeadItem>[], targetListId: string = 'master_queue'): Promise<number> {
    let count = 0;
    for (const item of leads) {
      if (item.name && item.phone) {
        await this.addSingleLead({
          name: item.name,
          phone: item.phone,
          school: item.school || 'VOL',
          email: item.email,
          room_number: item.room_number,
          planning_period: item.planning_period,
          years_in_frs: item.years_in_frs,
          notes: item.notes,
          priority_tier: 1,
          list_id: targetListId,
          text_ok: true,
          isValid: true,
        });
        count++;
      }
    }
    return count;
  }

  static async updateLeadDisposition(
    leadId: string,
    disposition: CallDisposition,
    note?: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const lead = await db.getFirstAsync<Lead>('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) return;

    const newAttempts = (lead.attempts_count !== undefined && !isNaN(lead.attempts_count)) ? lead.attempts_count + 1 : 1;
    const newCadenceStep = (lead.cadence_step !== undefined && !isNaN(lead.cadence_step)) ? lead.cadence_step + 1 : 1;

    await db.withTransactionAsync(async () => {
      // Update lead
      await db.runAsync(
        `UPDATE leads 
         SET last_disposition = ?, 
             attempts_count = ?, 
             cadence_step = ?, 
             last_attempt_at = ?, 
             notes = COALESCE(?, notes),
             updated_at = ?
         WHERE id = ?`,
        [disposition, newAttempts, newCadenceStep, now, note || null, now, leadId]
      );

      // Recalculate list stats
      const stats = await db.getFirstAsync<{ total: number; completed: number; connected: number }>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call') THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set') THEN 1 ELSE 0 END) as connected
         FROM leads WHERE list_id = ?`,
        [lead.list_id]
      );

      if (stats) {
        await db.runAsync(
          `UPDATE lists 
           SET completed_leads = ?, connected_leads = ?, updated_at = ? 
           WHERE id = ?`,
          [stats.completed || 0, stats.connected || 0, now, lead.list_id]
        );
      }
    });
  }

  static async scheduleFollowUp(leadId: string, followUpDateISO: string, note?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE leads 
       SET follow_up_at = ?, 
           last_disposition = 'callback_requested', 
           notes = COALESCE(?, notes), 
           updated_at = ? 
       WHERE id = ?`,
      [followUpDateISO, note || null, now, leadId]
    );
  }

  static async getUpcomingFollowUps(): Promise<Lead[]> {
    const db = await getDatabase();
    const rawLeads = await db.getAllAsync<any>(
      `SELECT * FROM leads 
       WHERE follow_up_at IS NOT NULL 
       ORDER BY follow_up_at ASC`
    );
    return rawLeads.map(this.hydrateLead);
  }

  static async updateLeadPriority(leadId: string, priorityTier: number, listId?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    if (listId) {
      await db.runAsync(
        `UPDATE leads SET priority_tier = ?, list_id = ?, updated_at = ? WHERE id = ?`,
        [priorityTier, listId, now, leadId]
      );
    } else {
      await db.runAsync(
        `UPDATE leads SET priority_tier = ?, updated_at = ? WHERE id = ?`,
        [priorityTier, now, leadId]
      );
    }
  }

  static async getLeadCardPhoto(leadId: string): Promise<string | null> {
    try {
      const { dexieDb } = await import('./dexieDb');
      const photo = await dexieDb.getLeadPhoto(leadId);
      if (photo) return photo;
    } catch {}
    const lead = await this.getLeadById(leadId);
    return lead?.source_image_uri || null;
  }

  static async updateLeadNotes(leadId: string, notes: string | null): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?',
      [notes || null, now, leadId]
    );
  }

  static async saveLeadCardPhoto(leadId: string, photoUri: string): Promise<void> {
    try {
      const { dexieDb } = await import('./dexieDb');
      await dexieDb.saveLeadPhoto(leadId, photoUri);
    } catch {}
  }

  private static hydrateLead(raw: any): Lead {
    let interests: string[] = [];
    let preferences: string[] = [];

    if (typeof raw.frs_interests === 'string') {
      try {
        interests = JSON.parse(raw.frs_interests);
      } catch {}
    } else if (Array.isArray(raw.frs_interests)) {
      interests = raw.frs_interests;
    }

    if (typeof raw.meeting_preferences === 'string') {
      try {
        preferences = JSON.parse(raw.meeting_preferences);
      } catch {}
    } else if (Array.isArray(raw.meeting_preferences)) {
      preferences = raw.meeting_preferences;
    }

    return {
      ...raw,
      priority_tier: raw.priority_tier !== undefined && raw.priority_tier !== null ? Number(raw.priority_tier) : 1,
      text_ok: raw.text_ok === 1 || raw.text_ok === true,
      frs_interests: interests,
      meeting_preferences: preferences,
    };
  }
}
