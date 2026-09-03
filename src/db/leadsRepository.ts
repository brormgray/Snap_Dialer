import { getDatabase } from './database';
import { Lead, LeadList, CallDisposition, ExtractedLeadItem } from '../types';

export function normalizePhoneKey(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

export interface DeduplicationResult {
  totalBefore: number;
  totalAfter: number;
  duplicatesRemoved: number;
  uniqueEducators: number;
}

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
    const targetPhoneKey = normalizePhoneKey(item.phone);

    // If an educator with this phone number already exists, update and merge rather than duplicate
    if (targetPhoneKey.length >= 7) {
      const all = await this.getAllLeads();
      const existing = all.find((l) => normalizePhoneKey(l.phone) === targetPhoneKey);
      if (existing) {
        let mergedNotes = existing.notes || '';
        if (item.notes && item.notes.trim()) {
          if (!mergedNotes.includes(item.notes.trim())) {
            mergedNotes = mergedNotes ? `${mergedNotes}\n\n${item.notes.trim()}` : item.notes.trim();
          }
        }
        await this.updateLeadDetails({
          id: existing.id,
          name: item.name.trim() || existing.name,
          phone: item.phone.trim() || existing.phone,
          school: item.school || existing.school,
          email: item.email || existing.email,
          room_number: item.room_number || existing.room_number,
          planning_period: item.planning_period || existing.planning_period,
          years_in_frs: item.years_in_frs || existing.years_in_frs,
          notes: mergedNotes || null,
          priority_tier: existing.priority_tier,
          list_id: existing.list_id,
        });
        if (imageUri && imageUri.length > 50) {
          try {
            const { dexieDb } = await import('./dexieDb');
            await dexieDb.saveLeadPhoto(existing.id, imageUri);
          } catch {}
        }
        return (await this.getLeadById(existing.id)) || existing;
      }
    }

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

    if (imageUri && imageUri.length > 50) {
      try {
        const { dexieDb } = await import('./dexieDb');
        await dexieDb.saveLeadPhoto(leadId, imageUri);
      } catch (e) {
        // Non-fatal, image remains safely referenced
      }
    }

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
       WHERE (last_disposition IS NULL OR last_disposition != 'do_not_call')
       ORDER BY priority_tier ASC, created_at ASC`
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
         AND (last_disposition IS NULL OR last_disposition != 'do_not_call')
       ORDER BY priority_tier ASC, created_at ASC`,
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

  static async updateLeadDetails(leadData: {
    id: string;
    name: string;
    phone: string;
    school?: string | null;
    email?: string | null;
    room_number?: string | null;
    planning_period?: string | null;
    years_in_frs?: string | null;
    notes?: string | null;
    priority_tier?: number;
    list_id?: string;
  }): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?, updated_at = ? 
       WHERE id = ?`,
      [
        leadData.name.trim(),
        leadData.phone.trim(),
        leadData.school?.trim() || 'VOL',
        leadData.email?.trim() || null,
        leadData.room_number?.trim() || null,
        leadData.planning_period?.trim() || null,
        leadData.years_in_frs?.trim() || null,
        leadData.notes || null,
        leadData.priority_tier !== undefined ? Number(leadData.priority_tier) : 1,
        leadData.list_id || 'master_queue',
        now,
        leadData.id,
      ]
    );
  }

  /**
   * Consolidates duplicate educator records across the pipeline.
   * Matches primarily on normalized 10-digit phone numbers (with name + school fallback).
   * Merges notes, call history, appointment dispositions, and fields into master records,
   * re-pointing all associated call logs so ZERO historical data is lost.
   */
  static async deduplicateLeads(): Promise<DeduplicationResult> {
    const db = await getDatabase();
    const allLeads = await this.getAllLeads();
    const totalBefore = allLeads.length;

    if (totalBefore <= 1) {
      return {
        totalBefore,
        totalAfter: totalBefore,
        duplicatesRemoved: 0,
        uniqueEducators: totalBefore,
      };
    }

    // Group leads by normalized key
    const groups = new Map<string, Lead[]>();
    for (const lead of allLeads) {
      const phoneKey = normalizePhoneKey(lead.phone);
      const key =
        phoneKey.length >= 7
          ? `phone_${phoneKey}`
          : `name_${lead.name.toLowerCase().trim()}_${(lead.school || 'VOL').toLowerCase().trim()}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(lead);
    }

    let duplicatesRemoved = 0;

    await db.withTransactionAsync(async () => {
      for (const [key, group] of groups.entries()) {
        if (group.length <= 1) continue;

        // Rank the group to pick the "master / keeper" lead:
        // Prioritize:
        // 1. Confirmed appointment
        // 2. Connected / spoke disposition
        // 3. Highest attempts count
        // 4. Most detailed notes length
        // 5. Earlier created_at
        group.sort((a, b) => {
          const isApptA = a.last_disposition === 'appointment_set' ? 1 : 0;
          const isApptB = b.last_disposition === 'appointment_set' ? 1 : 0;
          if (isApptA !== isApptB) return isApptB - isApptA;

          const isConnectedA = ['connected', 'spoke'].includes(a.last_disposition || '') ? 1 : 0;
          const isConnectedB = ['connected', 'spoke'].includes(b.last_disposition || '') ? 1 : 0;
          if (isConnectedA !== isConnectedB) return isConnectedB - isConnectedA;

          const attemptsA = Number(a.attempts_count) || 0;
          const attemptsB = Number(b.attempts_count) || 0;
          if (attemptsA !== attemptsB) return attemptsB - attemptsA;

          const notesLenA = (a.notes || '').length;
          const notesLenB = (b.notes || '').length;
          if (notesLenA !== notesLenB) return notesLenB - notesLenA;

          return (a.created_at || '').localeCompare(b.created_at || '');
        });

        const master = group[0];
        const duplicates = group.slice(1);

        let mergedNotes = master.notes || '';
        let highestAttempts = Number(master.attempts_count) || 0;
        let bestDisposition = master.last_disposition || 'pending';
        let bestLastAttemptAt = master.last_attempt_at;
        let bestFollowUpAt = master.follow_up_at;
        let photoUri = master.source_image_uri;
        let roomNumber = master.room_number;
        let planningPeriod = master.planning_period;
        let email = master.email;
        let yearsInFrs = master.years_in_frs;
        let frsKnowledge = master.frs_knowledge;
        let customQuestions = master.custom_questions;

        const interestsSet = new Set<string>(master.frs_interests || []);
        const prefSet = new Set<string>(master.meeting_preferences || []);

        for (const dup of duplicates) {
          duplicatesRemoved++;

          // Merge notes
          if (dup.notes && dup.notes.trim().length > 0) {
            if (!mergedNotes.includes(dup.notes.trim())) {
              mergedNotes = mergedNotes ? `${mergedNotes}\n\n${dup.notes.trim()}` : dup.notes.trim();
            }
          }

          // Merge attempts count
          if (dup.attempts_count && dup.attempts_count > highestAttempts) {
            highestAttempts = dup.attempts_count;
          }

          // Merge disposition priority
          if (dup.last_disposition === 'appointment_set') {
            bestDisposition = 'appointment_set';
          } else if (bestDisposition !== 'appointment_set' && ['connected', 'spoke'].includes(dup.last_disposition || '')) {
            bestDisposition = dup.last_disposition!;
          } else if (bestDisposition === 'pending' && dup.last_disposition && dup.last_disposition !== 'pending') {
            bestDisposition = dup.last_disposition;
          }

          if (dup.last_attempt_at && (!bestLastAttemptAt || new Date(dup.last_attempt_at) > new Date(bestLastAttemptAt))) {
            bestLastAttemptAt = dup.last_attempt_at;
          }
          if (dup.follow_up_at && (!bestFollowUpAt || new Date(dup.follow_up_at) > new Date(bestFollowUpAt))) {
            bestFollowUpAt = dup.follow_up_at;
          }

          if (!photoUri && dup.source_image_uri) photoUri = dup.source_image_uri;
          if (!roomNumber && dup.room_number) roomNumber = dup.room_number;
          if (!planningPeriod && dup.planning_period) planningPeriod = dup.planning_period;
          if (!email && dup.email) email = dup.email;
          if (!yearsInFrs && dup.years_in_frs) yearsInFrs = dup.years_in_frs;
          if (!frsKnowledge && dup.frs_knowledge) frsKnowledge = dup.frs_knowledge;
          if (!customQuestions && dup.custom_questions) customQuestions = dup.custom_questions;

          if (dup.frs_interests) {
            dup.frs_interests.forEach((item) => interestsSet.add(item));
          }
          if (dup.meeting_preferences) {
            dup.meeting_preferences.forEach((item) => prefSet.add(item));
          }

          // Re-link call logs belonging to duplicate to the master lead
          await db.runAsync('UPDATE call_logs SET lead_id = ? WHERE lead_id = ?', [master.id, dup.id]);
          // Delete duplicate
          await db.runAsync('DELETE FROM leads WHERE id = ?', [dup.id]);
        }

        // Update master lead with all consolidated attributes
        await db.runAsync(
          `UPDATE leads SET
             notes = ?,
             attempts_count = ?,
             last_disposition = ?,
             last_attempt_at = ?,
             follow_up_at = ?,
             source_image_uri = ?,
             room_number = ?,
             planning_period = ?,
             email = ?,
             years_in_frs = ?,
             frs_knowledge = ?,
             custom_questions = ?,
             frs_interests = ?,
             meeting_preferences = ?,
             updated_at = ?
           WHERE id = ?`,
          [
            mergedNotes || null,
            highestAttempts,
            bestDisposition,
            bestLastAttemptAt || null,
            bestFollowUpAt || null,
            photoUri || null,
            roomNumber || null,
            planningPeriod || null,
            email || null,
            yearsInFrs || null,
            frsKnowledge || null,
            customQuestions || null,
            JSON.stringify(Array.from(interestsSet)),
            JSON.stringify(Array.from(prefSet)),
            new Date().toISOString(),
            master.id,
          ]
        );
      }
    });

    const finalLeads = await this.getAllLeads();
    return {
      totalBefore,
      totalAfter: finalLeads.length,
      duplicatesRemoved,
      uniqueEducators: finalLeads.length,
    };
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
