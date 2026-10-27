import { getDatabase } from './database';
import {
  Lead,
  LeadList,
  CallDisposition,
  ExtractedLeadItem,
  ClientProduct,
  DripTrack,
  ClientConversionPayload,
  AppointmentOutcome,
} from '../types';
import { PipelineStateService } from '../services/pipelineStateService';
import { NotesService } from '../services/notesService';
import { DeduplicationService } from '../services/deduplicationService';

export function normalizePhoneKey(phone?: string | null): string {
  return DeduplicationService.normalizePhoneDigits(phone);
}

export function isValidDialablePhone(phone?: string | null): boolean {
  const digits = normalizePhoneKey(phone);
  return digits.length >= 10;
}

export interface DeduplicationResult {
  totalBefore: number;
  totalAfter: number;
  duplicatesRemoved: number;
  uniqueEducators: number;
}

export interface RecordDispoPayload {
  outcome: AppointmentOutcome;
  notes?: string;
  // If converted to client:
  isClient?: boolean;
  products?: ClientProduct[];
  annualizedPremium?: number;
  transferAssetsVolume?: number;
  policyEffectiveDate?: string;
  annualReviewDueDate?: string;
  // If rescheduled:
  newScheduledDate?: string;
  newPlanningPeriod?: string;
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

    const validLeads = leads.filter((l) => l.name.trim() && isValidDialablePhone(l.phone));

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
            source_image_uri, company, notes, priority_tier, is_frs, cadence_step, last_disposition, attempts_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 0, ?, ?)`,
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
            item.company || null,
            item.notes || null,
            item.priority_tier || 1,
            item.is_frs !== undefined ? (item.is_frs ? 1 : 0) : 1,
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
   * Unified single ingestion gateway for all lead intake (Scanner, CSV, API, Manual).
   * Validates 10-digit phone requirement and automatically performs safe upsert/merge.
   */
  static async ingestLead(
    item: ExtractedLeadItem,
    imageUri?: string | null
  ): Promise<Lead> {
    return this.addSingleLead(item, imageUri);
  }

  /**
   * Adds a single educator lead directly to the pipeline with customizable list and priority tier.
   * Leverages DeduplicationService multi-signal detection (exact phone, 1-digit OCR typo variance,
   * name + school similarity, email) and executes non-destructive deep merging so ZERO existing data is lost.
   */
  static async addSingleLead(
    item: ExtractedLeadItem,
    imageUri?: string | null
  ): Promise<Lead> {
    const db = await getDatabase();
    const targetPhoneKey = normalizePhoneKey(item.phone);

    if (targetPhoneKey.length < 10) {
      throw new Error(`A valid 10-digit phone number is required to add "${item.name}".`);
    }

    // Check across all existing pipeline leads for multi-signal duplicate match
    const all = await this.getAllLeads();
    const { match: existing } = DeduplicationService.findDuplicateInList(
      {
        name: item.name,
        phone: item.phone,
        school: item.school,
        email: item.email,
      },
      all
    );

    if (existing) {
      // Execute deep non-destructive record consolidation
      const merged = DeduplicationService.mergeRecords(existing, item, imageUri);

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
           is_client = ?,
           is_frs = ?,
           client_since = ?,
           products = ?,
           annualized_premium = ?,
           transfer_assets_volume = ?,
           policy_effective_date = ?,
           annual_review_due_date = ?,
           drip_track = ?,
           drip_step = ?,
           next_drip_scheduled_at = ?,
           appointment_scheduled_at = ?,
           appointment_outcome = ?,
           appointment_completed_at = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          merged.notes || null,
          merged.attempts_count || 0,
          merged.last_disposition || 'pending',
          merged.last_attempt_at || null,
          merged.follow_up_at || null,
          merged.source_image_uri || null,
          merged.room_number || null,
          merged.planning_period || null,
          merged.email || null,
          merged.years_in_frs || null,
          merged.frs_knowledge || null,
          merged.custom_questions || null,
          JSON.stringify(merged.frs_interests || []),
          JSON.stringify(merged.meeting_preferences || []),
          merged.is_client ? 1 : 0,
          merged.is_frs !== false ? 1 : 0,
          merged.client_since || null,
          JSON.stringify(merged.products || []),
          merged.annualized_premium ?? null,
          merged.transfer_assets_volume ?? null,
          merged.policy_effective_date || null,
          merged.annual_review_due_date || null,
          merged.drip_track || 'none',
          merged.drip_step || 0,
          merged.next_drip_scheduled_at || null,
          merged.appointment_scheduled_at || null,
          merged.appointment_outcome || null,
          merged.appointment_completed_at || null,
          new Date().toISOString(),
          existing.id,
        ]
      );

      // Ensure phone and alternate_phones are synced to existing lead
      existing.phone = merged.phone;
      existing.alternate_phones = merged.alternate_phones;
      try {
        const { dexieDb } = await import('./dexieDb');
        await dexieDb.leads.put(existing);
      } catch {}

      // If school, phone, or alternate_phones were updated, persist via updateLeadDetails
      try {
        await this.updateLeadDetails({
          id: existing.id,
          name: merged.name,
          phone: merged.phone,
          school: merged.school,
          alternate_phones: merged.alternate_phones,
        });
      } catch {}

      if (imageUri && imageUri.length > 50) {
        try {
          const { dexieDb } = await import('./dexieDb');
          await dexieDb.saveLeadPhoto(existing.id, imageUri);
        } catch {}
      }
      return (await this.getLeadById(existing.id)) || merged;
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
        source_image_uri, company, notes, priority_tier, is_frs, cadence_step, last_disposition, attempts_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', 0, ?, ?)`,
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
        item.company || null,
        item.notes || null,
        targetTier,
        item.is_frs !== undefined ? (item.is_frs ? 1 : 0) : 1,
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
        company: item.company || null,
        notes: item.notes || null,
        priority_tier: targetTier,
        is_frs: item.is_frs !== undefined ? item.is_frs : true,
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

  /**
   * Automatically recycles unanswered and voicemail leads from previous calendar weeks
   * back to 'pending' on weekly reset (Sunday 00:00:00 onwards).
   */
  static async autoRecyclePreviousWeeksUnanswered(now: Date = new Date()): Promise<number> {
    const db = await getDatabase();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekISO = startOfWeek.toISOString();
    const nowISO = now.toISOString();

    const result = await db.runAsync(
      `UPDATE leads 
       SET last_disposition = 'pending',
           updated_at = ?
       WHERE last_disposition IN ('no_answer', 'voicemail')
         AND COALESCE(last_attempt_at, updated_at, created_at) < ?`,
      [nowISO, startOfWeekISO]
    );

    return result?.changes || 0;
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
    const db = await getDatabase();
    let count = 0;
    await db.withTransactionAsync(async () => {
      for (const item of leads) {
        if (item.name && item.phone && isValidDialablePhone(item.phone)) {
          try {
            await this.addSingleLead({
              name: item.name,
              phone: item.phone,
              school: item.school || 'VOL',
              email: item.email,
              age: item.age,
              room_number: item.room_number,
              planning_period: item.planning_period,
              years_in_frs: item.years_in_frs,
              frs_knowledge: item.frs_knowledge,
              frs_interests: item.frs_interests,
              custom_questions: item.custom_questions,
              meeting_preferences: item.meeting_preferences,
              annual_salary: item.annual_salary,
              present_403b_contribution: item.present_403b_contribution,
              company: item.company,
              notes: item.notes,
              priority_tier: item.priority_tier || 1,
              list_id: item.list_id || targetListId,
              text_ok: item.text_ok !== undefined ? item.text_ok : true,
              is_frs: item.is_frs !== undefined ? item.is_frs : true,
              isValid: true,
            });
            count++;
          } catch (err) {
            console.warn(`[importLeadsBatch] Skipped ${item.name}:`, err);
          }
        }
      }
    });
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
      if (disposition === 'callback_requested' || disposition === 'appointment_set') {
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
      } else {
        await db.runAsync(
          `UPDATE leads 
           SET last_disposition = ?, 
               attempts_count = ?, 
               cadence_step = ?, 
               last_attempt_at = ?, 
               follow_up_at = NULL,
               notes = COALESCE(?, notes),
               updated_at = ?
           WHERE id = ?`,
          [disposition, newAttempts, newCadenceStep, now, note || null, now, leadId]
        );
      }

      // Recalculate list stats
      const stats = await db.getFirstAsync<{ total: number; completed: number; connected: number }>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call', 'other') THEN 1 ELSE 0 END) as completed,
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

    const currentLead = await this.getLeadById(leadId);
    let mergedNotes: string | null = null;
    if (note && note.trim().length > 0) {
      mergedNotes = NotesService.addNote(currentLead?.notes, note.trim());
    }

    await db.runAsync(
      `UPDATE leads 
       SET follow_up_at = ?, 
           last_disposition = 'callback_requested', 
           notes = COALESCE(?, notes), 
           updated_at = ? 
       WHERE id = ?`,
      [followUpDateISO, mergedNotes, now, leadId]
    );

    if (currentLead?.list_id) {
      const stats = await db.getFirstAsync<{ total: number; completed: number; connected: number }>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call', 'other') THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set') THEN 1 ELSE 0 END) as connected
         FROM leads WHERE list_id = ?`,
        [currentLead.list_id]
      );
      if (stats) {
        await db.runAsync(
          `UPDATE lists 
           SET completed_leads = ?, connected_leads = ?, updated_at = ? 
           WHERE id = ?`,
          [stats.completed || 0, stats.connected || 0, now, currentLead.list_id]
        );
      }
    }
  }

  static async clearFollowUp(leadId: string, completionNote?: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    let mergedNotes: string | null = null;
    if (completionNote && completionNote.trim().length > 0) {
      const currentLead = await this.getLeadById(leadId);
      mergedNotes = NotesService.addNote(currentLead?.notes, completionNote.trim());
    }

    await db.runAsync(
      `UPDATE leads 
       SET follow_up_at = NULL, 
           last_disposition = CASE WHEN last_disposition = 'callback_requested' THEN 'pending' ELSE last_disposition END,
           notes = COALESCE(?, notes),
           updated_at = ? 
       WHERE id = ?`,
      [mergedNotes, now, leadId]
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

  /**
   * Adds an alternate / secondary phone number to an educator lead
   */
  static async addAlternatePhone(leadId: string, rawPhone: string): Promise<Lead> {
    const cleanDigits = DeduplicationService.normalizePhoneDigits(rawPhone);
    if (cleanDigits.length < 7) {
      throw new Error('A valid phone number (at least 7 digits) is required.');
    }
    const lead = await this.getLeadById(leadId);
    if (!lead) throw new Error('Educator lead not found.');

    const primaryDigits = DeduplicationService.normalizePhoneDigits(lead.phone);
    if (cleanDigits === primaryDigits) {
      throw new Error('This number is already the primary phone for this educator.');
    }

    const currentAlts = (lead.alternate_phones || []).filter((p) => {
      return DeduplicationService.normalizePhoneDigits(p) !== cleanDigits;
    });

    currentAlts.push(rawPhone.trim());
    lead.alternate_phones = currentAlts;

    const auditNote = `[Added Alternate Phone: ${rawPhone.trim()}]`;
    let updatedNotes = (lead.notes || '').trim();
    if (!updatedNotes.includes(auditNote)) {
      updatedNotes = updatedNotes ? `${updatedNotes}\n\n${auditNote}` : auditNote;
      lead.notes = updatedNotes;
    }

    await this.updateLeadDetails({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      school: lead.school,
      notes: lead.notes,
      alternate_phones: currentAlts,
    });

    return (await this.getLeadById(leadId)) || lead;
  }

  /**
   * Removes an alternate phone number from an educator lead
   */
  static async removeAlternatePhone(leadId: string, phoneToRemove: string): Promise<Lead> {
    const removeDigits = DeduplicationService.normalizePhoneDigits(phoneToRemove);
    const lead = await this.getLeadById(leadId);
    if (!lead) throw new Error('Educator lead not found.');

    const updatedAlts = (lead.alternate_phones || []).filter((p) => {
      return DeduplicationService.normalizePhoneDigits(p) !== removeDigits;
    });

    lead.alternate_phones = updatedAlts;

    await this.updateLeadDetails({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      school: lead.school,
      alternate_phones: updatedAlts,
    });

    return (await this.getLeadById(leadId)) || lead;
  }

  /**
   * Promotes an alternate phone number to be the primary callable line,
   * demoting the old primary line into the alternate phones list.
   */
  static async promoteAlternateToPrimary(leadId: string, newPrimaryPhone: string): Promise<Lead> {
    const newDigits = DeduplicationService.normalizePhoneDigits(newPrimaryPhone);
    if (newDigits.length < 10) {
      throw new Error('A valid 10-digit phone number is required for primary cellular dialing.');
    }
    const lead = await this.getLeadById(leadId);
    if (!lead) throw new Error('Educator lead not found.');

    const oldPrimary = lead.phone;
    const oldDigits = DeduplicationService.normalizePhoneDigits(oldPrimary);

    const updatedAlts = (lead.alternate_phones || []).filter((p) => {
      return DeduplicationService.normalizePhoneDigits(p) !== newDigits;
    });
    if (oldDigits.length >= 7 && oldDigits !== newDigits) {
      updatedAlts.push(oldPrimary);
    }

    lead.phone = newPrimaryPhone.trim();
    lead.alternate_phones = updatedAlts;

    const auditNote = `[Phone Promoted to Primary: ${newPrimaryPhone.trim()}] Former primary (${oldPrimary}) saved as alternate.`;
    let updatedNotes = (lead.notes || '').trim();
    if (!updatedNotes.includes(auditNote)) {
      updatedNotes = updatedNotes ? `${updatedNotes}\n\n${auditNote}` : auditNote;
      lead.notes = updatedNotes;
    }

    await this.updateLeadDetails({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      school: lead.school,
      notes: lead.notes,
      alternate_phones: updatedAlts,
    });

    return (await this.getLeadById(leadId)) || lead;
  }

  static async updateLeadDetails(leadData: {
    id: string;
    name: string;
    phone: string;
    alternate_phones?: string[] | null;
    school?: string | null;
    email?: string | null;
    room_number?: string | null;
    planning_period?: string | null;
    years_in_frs?: string | null;
    notes?: string | null;
    priority_tier?: number;
    list_id?: string;
    is_client?: boolean;
    is_frs?: boolean;
    client_since?: string | null;
    products?: ClientProduct[] | null;
    annualized_premium?: number | null;
    transfer_assets_volume?: number | null;
    policy_effective_date?: string | null;
    annual_review_due_date?: string | null;
    drip_track?: DripTrack | null;
    drip_step?: number;
    last_drip_sent_at?: string | null;
    next_drip_scheduled_at?: string | null;
    appointment_scheduled_at?: string | null;
    appointment_outcome?: AppointmentOutcome | null;
    appointment_completed_at?: string | null;
    last_disposition?: CallDisposition | null;
  }): Promise<void> {
    const targetPhoneKey = normalizePhoneKey(leadData.phone);
    if (targetPhoneKey.length < 10) {
      throw new Error('A valid 10-digit phone number is required to save educator details.');
    }

    const all = await this.getAllLeads();
    const collision = all.find(
      (l) => l.id !== leadData.id && normalizePhoneKey(l.phone) === targetPhoneKey
    );
    if (collision) {
      throw new Error(
        `Phone number (${leadData.phone}) is already assigned to "${collision.name}" (${collision.school || 'VOL'}). Cannot assign duplicate phone numbers.`
      );
    }

    const current = all.find((l) => l.id === leadData.id);
    const db = await getDatabase();
    const now = new Date().toISOString();

    const isClient = leadData.is_client !== undefined ? (leadData.is_client ? 1 : 0) : (current?.is_client ? 1 : 0);
    const isFrs = leadData.is_frs !== undefined ? (leadData.is_frs ? 1 : 0) : (current?.is_frs !== false ? 1 : 0);
    const clientSince = leadData.client_since !== undefined ? leadData.client_since : (current?.client_since || (isClient ? now : null));
    const products = leadData.products !== undefined ? JSON.stringify(leadData.products || []) : JSON.stringify(current?.products || []);
    const annualizedPremium = leadData.annualized_premium !== undefined ? leadData.annualized_premium : (current?.annualized_premium || null);
    const transferAssets = leadData.transfer_assets_volume !== undefined ? leadData.transfer_assets_volume : (current?.transfer_assets_volume || null);
    const policyEffectiveDate = leadData.policy_effective_date !== undefined ? leadData.policy_effective_date : (current?.policy_effective_date || null);
    const annualReviewDueDate = leadData.annual_review_due_date !== undefined ? leadData.annual_review_due_date : (current?.annual_review_due_date || null);
    const dripTrack = leadData.drip_track !== undefined ? leadData.drip_track : (current?.drip_track || 'none');
    const dripStep = leadData.drip_step !== undefined ? leadData.drip_step : (current?.drip_step || 0);
    const lastDripSent = leadData.last_drip_sent_at !== undefined ? leadData.last_drip_sent_at : (current?.last_drip_sent_at || null);
    const nextDripAt = leadData.next_drip_scheduled_at !== undefined ? leadData.next_drip_scheduled_at : (current?.next_drip_scheduled_at || null);
    const apptScheduledAt = leadData.appointment_scheduled_at !== undefined ? leadData.appointment_scheduled_at : (current?.appointment_scheduled_at || null);
    let apptOutcome = leadData.appointment_outcome !== undefined ? leadData.appointment_outcome : (current?.appointment_outcome || null);
    let apptCompletedAt = leadData.appointment_completed_at !== undefined ? leadData.appointment_completed_at : (current?.appointment_completed_at || null);
    let finalDispo = leadData.last_disposition !== undefined ? leadData.last_disposition : (current?.last_disposition || 'pending');

    // Normalization: converting to client resolves appointment ONLY IF an appointment was NOT scheduled or currently pending
    const hasActiveAppt = (finalDispo === 'appointment_set' || Boolean(apptScheduledAt)) && !leadData.appointment_completed_at && !current?.appointment_completed_at;
    if (isClient && !hasActiveAppt) {
      if (!apptOutcome) {
        apptOutcome = 'converted';
      }
      if (!apptCompletedAt) {
        apptCompletedAt = now;
      }
      if (finalDispo === 'appointment_set') {
        finalDispo = 'connected';
      }
    }

    await db.runAsync(
      `UPDATE leads 
       SET name = ?, phone = ?, school = ?, email = ?, room_number = ?, planning_period = ?, years_in_frs = ?, notes = ?, priority_tier = ?, list_id = ?,
           is_client = ?, is_frs = ?, client_since = ?, products = ?, annualized_premium = ?, transfer_assets_volume = ?, policy_effective_date = ?, annual_review_due_date = ?,
           drip_track = ?, drip_step = ?, last_drip_sent_at = ?, next_drip_scheduled_at = ?,
           appointment_scheduled_at = ?, appointment_outcome = ?, appointment_completed_at = ?, last_disposition = ?, updated_at = ? 
       WHERE id = ?`,
      [
        leadData.name !== undefined ? leadData.name.trim() : (current?.name || ''),
        leadData.phone !== undefined ? leadData.phone.trim() : (current?.phone || ''),
        leadData.school !== undefined ? (leadData.school?.trim() || 'VOL') : (current?.school || 'VOL'),
        leadData.email !== undefined ? (leadData.email?.trim() || null) : (current?.email || null),
        leadData.room_number !== undefined ? (leadData.room_number?.trim() || null) : (current?.room_number || null),
        leadData.planning_period !== undefined ? (leadData.planning_period?.trim() || null) : (current?.planning_period || null),
        leadData.years_in_frs !== undefined ? (leadData.years_in_frs?.trim() || null) : (current?.years_in_frs || null),
        leadData.notes !== undefined ? leadData.notes : (current?.notes || null),
        leadData.priority_tier !== undefined ? Number(leadData.priority_tier) : (current?.priority_tier ?? 1),
        leadData.list_id !== undefined ? leadData.list_id : (current?.list_id || 'master_queue'),
        isClient,
        isFrs,
        clientSince,
        products,
        annualizedPremium,
        transferAssets,
        policyEffectiveDate,
        annualReviewDueDate,
        dripTrack,
        dripStep,
        lastDripSent,
        nextDripAt,
        apptScheduledAt,
        apptOutcome,
        apptCompletedAt,
        finalDispo,
        now,
        leadData.id,
      ]
    );

    if (leadData.alternate_phones !== undefined) {
      await db.runAsync(
        'UPDATE leads SET alternate_phones = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(leadData.alternate_phones || []), now, leadData.id]
      );
    }
  }

  /**
   * Locks in a confirmed sit-down appointment date/time
   */
  static async scheduleAppointment(
    leadId: string,
    scheduledDateISO: string,
    note?: string,
    appointmentNotes?: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const currentLead = await this.getLeadById(leadId);
    await db.runAsync(
      `UPDATE leads 
       SET appointment_scheduled_at = ?,
           follow_up_at = NULL,
           appointment_outcome = NULL,
           appointment_completed_at = NULL,
           last_disposition = 'appointment_set',
           notes = COALESCE(?, notes),
           appointment_notes = COALESCE(?, appointment_notes),
           updated_at = ?
       WHERE id = ?`,
      [scheduledDateISO, note || null, appointmentNotes || null, now, leadId]
    );

    if (currentLead?.list_id) {
      const stats = await db.getFirstAsync<{ total: number; completed: number; connected: number }>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set', 'bad_number', 'do_not_call', 'other') THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN last_disposition IN ('connected', 'spoke', 'appointment_set') THEN 1 ELSE 0 END) as connected
         FROM leads WHERE list_id = ?`,
        [currentLead.list_id]
      );
      if (stats) {
        await db.runAsync(
          `UPDATE lists 
           SET completed_leads = ?, connected_leads = ?, updated_at = ? 
           WHERE id = ?`,
          [stats.completed || 0, stats.connected || 0, now, currentLead.list_id]
        );
      }
    }
  }

  /**
   * Records the definitive post-appointment outcome for a sit-down
   */
  static async recordAppointmentDisposition(
    leadId: string,
    payload: RecordDispoPayload
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    if (payload.outcome === 'converted') {
      await this.convertLeadToClient(leadId, {
        products: payload.products || ['flow_annuity'],
        annualized_premium: payload.annualizedPremium || 0,
        transfer_assets_volume: payload.transferAssetsVolume || 0,
        policy_effective_date: payload.policyEffectiveDate || now.split('T')[0],
        annual_review_due_date: payload.annualReviewDueDate,
        notes: payload.notes || 'Converted to client after sit-down.',
        drip_track: 'client_annual_review',
      });
      await db.runAsync(
        `UPDATE leads 
         SET appointment_outcome = 'converted', 
             appointment_completed_at = ?, 
             updated_at = ? 
         WHERE id = ?`,
        [now, now, leadId]
      );
    } else if (payload.outcome === 'nurture_drip') {
      // Sprint Touch 0 scheduled 24-48 hours (+1 day) after sit-down wrap up
      const nextDate = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
      await db.runAsync(
        `UPDATE leads 
         SET appointment_outcome = 'nurture_drip', 
             appointment_completed_at = ?, 
             last_disposition = 'connected', 
             drip_track = 'prospect_nurture', 
             drip_step = 0, 
             next_drip_scheduled_at = ?, 
             notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || '\n\n', '') || ? ELSE notes END,
             updated_at = ? 
         WHERE id = ?`,
        [now, nextDate, payload.notes || null, payload.notes || null, now, leadId]
      );
    } else if (payload.outcome === 'rescheduled') {
      if (payload.newScheduledDate) {
        await db.runAsync(
          `UPDATE leads 
           SET appointment_scheduled_at = ?, 
               appointment_outcome = NULL, 
               appointment_completed_at = NULL, 
               last_disposition = 'appointment_set', 
               planning_period = COALESCE(?, planning_period),
               notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || '\n\n', '') || ? ELSE notes END,
               updated_at = ? 
           WHERE id = ?`,
          [payload.newScheduledDate, payload.newPlanningPeriod || null, payload.notes || null, payload.notes || null, now, leadId]
        );
      } else {
        await this.scheduleFollowUp(
          leadId,
          new Date(Date.now() + 24 * 3600000).toISOString(),
          payload.notes || 'Sit-down rescheduled for phone follow-up'
        );
      }
    } else if (payload.outcome === 'no_show') {
      await db.runAsync(
        `UPDATE leads 
         SET appointment_outcome = 'no_show', 
             appointment_completed_at = ?, 
             last_disposition = 'no_answer', 
             follow_up_at = NULL,
             notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || '\n\n', '') || ? ELSE notes END,
             updated_at = ? 
         WHERE id = ?`,
        [now, payload.notes || 'Sit-down no-show / educator unavailable.', payload.notes || 'Sit-down no-show / educator unavailable.', now, leadId]
      );
    } else if (payload.outcome === 'declined') {
      await db.runAsync(
        `UPDATE leads 
         SET appointment_outcome = 'declined', 
             appointment_completed_at = ?, 
             last_disposition = 'spoke', 
             follow_up_at = NULL,
             notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || '\n\n', '') || ? ELSE notes END,
             updated_at = ? 
         WHERE id = ?`,
        [now, payload.notes || 'Educator declined to proceed with FRS options.', payload.notes || 'Educator declined to proceed with FRS options.', now, leadId]
      );
    }
  }

  /**
   * Converts an educator to an active client with policy details and sets up annual review
   */
  static async convertLeadToClient(leadId: string, payload: ClientConversionPayload): Promise<Lead> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const effectiveDate = payload.policy_effective_date || now.split('T')[0];

    // Default annual review to 1 year after effective date if not explicitly specified
    let reviewDueDate = payload.annual_review_due_date;
    if (!reviewDueDate) {
      const d = new Date(effectiveDate);
      d.setFullYear(d.getFullYear() + 1);
      reviewDueDate = d.toISOString().split('T')[0];
    }

    const dripTrack: DripTrack = payload.drip_track || 'client_annual_review';
    const dripStep = 0;
    const dripDate = new Date(effectiveDate);
    dripDate.setDate(dripDate.getDate() + 90); // Step 1: 90 days post-effective check-in
    const nextDripAt = dripDate.toISOString();

    await db.runAsync(
      `UPDATE leads SET
         is_client = 1,
         client_since = COALESCE(client_since, ?),
         products = ?,
         annualized_premium = ?,
         transfer_assets_volume = ?,
         policy_effective_date = ?,
         annual_review_due_date = ?,
         drip_track = ?,
         drip_step = ?,
         next_drip_scheduled_at = ?,
         appointment_outcome = 'converted',
         appointment_completed_at = COALESCE(appointment_completed_at, ?),
         last_disposition = CASE WHEN last_disposition = 'appointment_set' THEN 'connected' ELSE last_disposition END,
         notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || '\n\n', '') || ? ELSE notes END,
         updated_at = ?
       WHERE id = ?`,
      [
        now,
        JSON.stringify(payload.products || []),
        payload.annualized_premium || 0,
        payload.transfer_assets_volume || 0,
        effectiveDate,
        reviewDueDate,
        dripTrack,
        dripStep,
        nextDripAt,
        now,
        payload.notes || null,
        payload.notes || null,
        now,
        leadId,
      ]
    );

    const updated = await this.getLeadById(leadId);
    return updated!;
  }

  /**
   * Returns all converted clients
   */
  static async getAllClients(): Promise<Lead[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM leads WHERE is_client = 1 ORDER BY client_since DESC'
    );
    return rows.map(this.hydrateLead);
  }

  /**
   * Scans call logs and educator dossier notes to recover converted client status
   * following cloud restores or catastrophic hardware transitions.
   */
  static async recoverClientsFromHistory(): Promise<{ recoveredCount: number; leadNames: string[] }> {
    const db = await getDatabase();
    const [leads, logs] = await Promise.all([
      db.getAllAsync<any>('SELECT * FROM leads'),
      db.getAllAsync<any>('SELECT * FROM call_logs'),
    ]);

    const logsByLeadId = new Map<string, any[]>();
    for (const log of logs) {
      if (!log || !log.lead_id) continue;
      const lid = String(log.lead_id).trim();
      const bucket = logsByLeadId.get(lid);
      if (bucket) bucket.push(log);
      else logsByLeadId.set(lid, [log]);
    }

    let recoveredCount = 0;
    const leadNames: string[] = [];
    const now = new Date().toISOString();

    for (const raw of leads) {
      const isCurrentlyClient = raw.is_client === 1 || raw.is_client === true || raw.is_client === 'true';
      if (isCurrentlyClient) continue;

      const lid = String(raw.id).trim();
      const leadLogs = logsByLeadId.get(lid) || [];

      const convertedLog = leadLogs.find(
        (l) => l.disposition === 'appt_converted' ||
               (typeof l.note === 'string' && (l.note.includes('Converted to client') || l.note.includes('appt_converted')))
      );

      const hasConvertedNote = typeof raw.notes === 'string' && (
        raw.notes.includes('[Sit-Down Wrap-Up] Converted to client') ||
        raw.notes.includes('Converted to client after sit-down')
      );

      const hasConvertedOutcome = raw.appointment_outcome === 'converted';

      if (convertedLog || hasConvertedNote || hasConvertedOutcome) {
        const clientSince = convertedLog?.timestamp || raw.client_since || raw.appointment_completed_at || raw.updated_at || raw.created_at || now;

        // Try to extract AP if written into notes, e.g. "$3,600 AP" or "$500/mo"
        let recoveredAP = raw.annualized_premium || 0;
        if (!recoveredAP && typeof raw.notes === 'string') {
          const matchAP = raw.notes.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*(?:AP|annualized\s*premium|annually|\/year|\/yr)/i);
          if (matchAP) {
            const num = parseFloat(matchAP[1].replace(/,/g, ''));
            if (!isNaN(num)) recoveredAP = num;
          }
        }

        await db.runAsync(
          `UPDATE leads SET
             is_client = 1,
             client_since = COALESCE(client_since, ?),
             appointment_outcome = 'converted',
             appointment_completed_at = COALESCE(appointment_completed_at, ?),
             annualized_premium = CASE WHEN annualized_premium IS NULL OR annualized_premium = 0 THEN ? ELSE annualized_premium END,
             drip_track = CASE WHEN drip_track IS NULL OR drip_track = 'none' THEN 'client_annual_review' ELSE drip_track END,
             last_disposition = CASE WHEN last_disposition = 'appointment_set' THEN 'connected' ELSE last_disposition END,
             updated_at = ?
           WHERE id = ?`,
          [clientSince, clientSince, recoveredAP, now, raw.id]
        );

        recoveredCount++;
        leadNames.push(raw.name || 'Educator');
      }
    }

    return { recoveredCount, leadNames };
  }

  /**
   * Retrieves clients whose annual review is due within the specified lookahead window (default: 30 days)
   */
  static async getClientsDueForAnnualReview(daysAhead: number = 30): Promise<Lead[]> {
    const all = await this.getAllClients();
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(now.getDate() + daysAhead);

    const maxISO = maxDate.toISOString().split('T')[0];
    return all.filter((c) => {
      if (!c.annual_review_due_date) return false;
      return c.annual_review_due_date <= maxISO;
    }).sort((a, b) => (a.annual_review_due_date || '').localeCompare(b.annual_review_due_date || ''));
  }

  /**
   * Advances a lead's automated drip step and reschedules the next touchpoint
   */
  static async advanceDripStep(leadId: string, nextStep: number, nextScheduledISO?: string | null): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE leads SET
         drip_step = ?,
         last_drip_sent_at = ?,
         next_drip_scheduled_at = ?,
         updated_at = ?
       WHERE id = ?`,
      [nextStep, now, nextScheduledISO || null, now, leadId]
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

    // Cluster duplicate leads using multi-signal similarity matching (phone, OCR typo tolerance, name + school, email)
    const duplicateGroups = DeduplicationService.clusterDuplicateLeads(allLeads);

    let duplicatesRemoved = 0;

    await db.withTransactionAsync(async () => {
      for (const group of duplicateGroups) {
        if (group.length <= 1) continue;

        // Rank the group to pick the "master / keeper" lead:
        // Prioritize:
        // 1. Converted client (highest value relationship)
        // 2. Confirmed appointment
        // 3. Connected / spoke disposition
        // 4. Highest attempts count
        // 5. Most detailed notes length
        // 6. Earlier created_at
        group.sort((a, b) => {
          const isClientA = a.is_client ? 1 : 0;
          const isClientB = b.is_client ? 1 : 0;
          if (isClientA !== isClientB) return isClientB - isClientA;

          if (isClientA === 1 && isClientB === 1) {
            const premA = Number(a.annualized_premium) || 0;
            const premB = Number(b.annualized_premium) || 0;
            if (premA !== premB) return premB - premA;
            const assetA = Number(a.transfer_assets_volume) || 0;
            const assetB = Number(b.transfer_assets_volume) || 0;
            if (assetA !== assetB) return assetB - assetA;
          }

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

        let isClient = Boolean(master.is_client);
        let isFrs = master.is_frs !== false;
        let clientSince = master.client_since;
        let annualizedPremium = Number(master.annualized_premium) || null;
        let transferVolume = Number(master.transfer_assets_volume) || null;
        let policyEffectiveDate = master.policy_effective_date;
        let annualReviewDueDate = master.annual_review_due_date;
        let dripTrack = master.drip_track || 'none';
        let dripStep = Number(master.drip_step) || 0;
        let nextDripScheduledAt = master.next_drip_scheduled_at;
        let appointmentScheduledAt = master.appointment_scheduled_at;
        let appointmentOutcome = master.appointment_outcome;
        let appointmentCompletedAt = master.appointment_completed_at;
        const productsSet = new Set<string>(master.products || []);

        const interestsSet = new Set<string>(master.frs_interests || []);
        const prefSet = new Set<string>(master.meeting_preferences || []);

        for (const dup of duplicates) {
          duplicatesRemoved++;

          if (dup.is_frs === false) {
            isFrs = false;
          }

          // Merge client and policy details
          if (dup.is_client) {
            isClient = true;
            if (!clientSince || (dup.client_since && new Date(dup.client_since) < new Date(clientSince))) {
              clientSince = dup.client_since;
            }
          }
          if (dup.annualized_premium && (annualizedPremium === null || Number(dup.annualized_premium) > annualizedPremium)) {
            annualizedPremium = Number(dup.annualized_premium);
          }
          if (dup.transfer_assets_volume && (transferVolume === null || Number(dup.transfer_assets_volume) > transferVolume)) {
            transferVolume = Number(dup.transfer_assets_volume);
          }
          if (!policyEffectiveDate && dup.policy_effective_date) policyEffectiveDate = dup.policy_effective_date;
          if (!annualReviewDueDate && dup.annual_review_due_date) annualReviewDueDate = dup.annual_review_due_date;
          if (dup.products && Array.isArray(dup.products)) {
            dup.products.forEach((item) => productsSet.add(item));
          }
          if ((!dripTrack || dripTrack === 'none') && dup.drip_track && dup.drip_track !== 'none') {
            dripTrack = dup.drip_track;
            dripStep = dup.drip_step || 0;
            nextDripScheduledAt = dup.next_drip_scheduled_at;
          }

          // Merge appointment lifecycle details
          if (!appointmentScheduledAt && dup.appointment_scheduled_at) {
            appointmentScheduledAt = dup.appointment_scheduled_at;
          } else if (dup.appointment_scheduled_at && appointmentScheduledAt && new Date(dup.appointment_scheduled_at) > new Date(appointmentScheduledAt)) {
            appointmentScheduledAt = dup.appointment_scheduled_at;
          }
          if (!appointmentOutcome && dup.appointment_outcome) {
            appointmentOutcome = dup.appointment_outcome;
            appointmentCompletedAt = dup.appointment_completed_at;
          }

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

          // Arbitrate phone numbers between master and duplicate
          const phoneArb = DeduplicationService.arbitratePhoneNumbers(
            {
              phone: master.phone,
              alternate_phones: master.alternate_phones,
              last_disposition: bestDisposition,
              attempts_count: highestAttempts,
              is_client: isClient,
              appointment_scheduled_at: appointmentScheduledAt,
            },
            dup
          );
          master.phone = phoneArb.primaryPhone;
          master.alternate_phones = phoneArb.alternatePhones;
          if (phoneArb.revivedFromBadNumber) {
            bestDisposition = 'pending';
          }
          for (const audit of phoneArb.auditNotes) {
            if (!mergedNotes.includes(audit)) {
              mergedNotes = mergedNotes ? `${mergedNotes}\n\n${audit}` : audit;
            }
          }

          // Migrate lead card photo if master has none
          try {
            const { dexieDb } = await import('./dexieDb');
            const dupPhoto = await dexieDb.getLeadPhoto(dup.id);
            if (dupPhoto) {
              const masterPhoto = await dexieDb.getLeadPhoto(master.id);
              if (!masterPhoto) {
                await dexieDb.saveLeadPhoto(master.id, dupPhoto);
              }
              await dexieDb.lead_photos.delete(dup.id);
            }
          } catch {}

          // Re-link call logs belonging to duplicate to the master lead
          await db.runAsync('UPDATE call_logs SET lead_id = ? WHERE lead_id = ?', [master.id, dup.id]);
          // Delete duplicate
          await db.runAsync('DELETE FROM leads WHERE id = ?', [dup.id]);
        }

        // If master had generic 'VOL' school but a duplicate had a specific campus, update master school
        if (master.school === 'VOL' && duplicates.some((d) => d.school && d.school !== 'VOL')) {
          const betterSchool = duplicates.find((d) => d.school && d.school !== 'VOL')?.school;
          if (betterSchool) {
            master.school = betterSchool;
          }
        }

        // Sync master phone, school, and alternate_phones
        try {
          await this.updateLeadDetails({
            id: master.id,
            name: master.name,
            phone: master.phone,
            school: master.school,
            alternate_phones: master.alternate_phones,
          });
        } catch {}

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
             is_client = ?,
             is_frs = ?,
             client_since = ?,
             products = ?,
             annualized_premium = ?,
             transfer_assets_volume = ?,
             policy_effective_date = ?,
             annual_review_due_date = ?,
             drip_track = ?,
             drip_step = ?,
             next_drip_scheduled_at = ?,
             appointment_scheduled_at = ?,
             appointment_outcome = ?,
             appointment_completed_at = ?,
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
            isClient ? 1 : 0,
            isFrs ? 1 : 0,
            clientSince || null,
            JSON.stringify(Array.from(productsSet)),
            annualizedPremium,
            transferVolume,
            policyEffectiveDate || null,
            annualReviewDueDate || null,
            dripTrack,
            dripStep,
            nextDripScheduledAt || null,
            appointmentScheduledAt || null,
            appointmentOutcome || null,
            appointmentCompletedAt || null,
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
    let products: ClientProduct[] = [];
    let alternatePhones: string[] = [];

    if (typeof raw.alternate_phones === 'string') {
      try {
        const parsed = JSON.parse(raw.alternate_phones);
        if (Array.isArray(parsed)) alternatePhones = parsed.filter(Boolean);
      } catch {}
    } else if (Array.isArray(raw.alternate_phones)) {
      alternatePhones = raw.alternate_phones.filter(Boolean);
    }

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

    if (Array.isArray(raw.products)) {
      products = raw.products.filter(Boolean);
    } else if (typeof raw.products === 'string') {
      const trimmed = raw.products.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) products = parsed.filter(Boolean);
        } catch {}
      } else if (trimmed.length > 0) {
        products = trimmed.split(',').map((p: string) => p.trim()).filter(Boolean) as any;
      }
    }

    const hasConvertedWrapUpNote = typeof raw.notes === 'string' && (
      raw.notes.includes('[Sit-Down Wrap-Up] Converted to client') ||
      raw.notes.includes('Converted to client after sit-down')
    );
    const isExplicitClient = raw.is_client === 1 || raw.is_client === true || raw.is_client === 'true';
    const isClient = isExplicitClient || hasConvertedWrapUpNote || raw.appointment_outcome === 'converted';
    const isFrs = raw.is_frs === undefined || raw.is_frs === null || raw.is_frs === 1 || raw.is_frs === true || raw.is_frs === 'true';
    const dripTrack = raw.drip_track || 'none';
    let apptOutcome = raw.appointment_outcome || null;
    let apptCompletedAt = raw.appointment_completed_at || null;
    let lastDisp = raw.last_disposition || 'pending';
    let needsHealing = !isExplicitClient && isClient;

    // Auto-healing rule 1: If client is true but appointment_outcome is null or disposition is still appointment_set
    if (isClient) {
      // Protect legitimate active/upcoming appointments scheduled with existing clients
      const hasActiveAppointment = lastDisp === 'appointment_set' && Boolean(raw.appointment_scheduled_at);
      if (!hasActiveAppointment) {
        if (!apptOutcome) {
          apptOutcome = 'converted';
          apptCompletedAt = apptCompletedAt || raw.client_since || raw.updated_at || raw.created_at || new Date().toISOString();
          needsHealing = true;
        }
        if (lastDisp === 'appointment_set') {
          lastDisp = 'connected';
          needsHealing = true;
        }
      }
    }

    // Auto-healing rule 2: Protect & recover legitimate nurture_drip post-appointment wrap-ups
    const hasNurtureWrapUpNote = typeof raw.notes === 'string' && raw.notes.includes('[Sit-Down Wrap-Up] Enrolled in FRS Prospect Nurture Drip');
    const isProspectDripWrapUp = apptOutcome === 'nurture_drip' || hasNurtureWrapUpNote || (dripTrack === 'prospect_nurture' && Boolean(raw.appointment_scheduled_at));

    if (isProspectDripWrapUp) {
      if (apptOutcome !== 'nurture_drip') {
        apptOutcome = 'nurture_drip';
        needsHealing = true;
      }
      if (!apptCompletedAt) {
        apptCompletedAt = raw.updated_at || raw.created_at || new Date().toISOString();
        needsHealing = true;
      }
      if (lastDisp === 'appointment_set') {
        lastDisp = 'connected';
        needsHealing = true;
      }
      if (!raw.next_drip_scheduled_at) {
        raw.next_drip_scheduled_at = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        needsHealing = true;
      }
    }

    // Auto-healing rule 3: If active appointment_set but appointment_scheduled_at is missing
    let apptScheduledAt = raw.appointment_scheduled_at || null;
    if (lastDisp === 'appointment_set' && !apptOutcome && !apptCompletedAt && !apptScheduledAt) {
      const healed = PipelineStateService.extractAppointmentDateFromLead(raw, new Date());
      apptScheduledAt = healed.toISOString();
      needsHealing = true;
    }

    // Auto-healing rule 4: Defensive follow_up_at sanitization and recovery
    let followUpAt = raw.follow_up_at || null;
    if (followUpAt) {
      const parsed = new Date(followUpAt);
      const isInvalid = isNaN(parsed.getTime());
      const isCompletionString = typeof followUpAt === 'string' && (
        followUpAt.includes('[Callback Completed]') ||
        followUpAt.includes('Follow-up marked complete')
      );

      if (isInvalid || isCompletionString) {
        followUpAt = null;
        if (lastDisp === 'callback_requested') {
          lastDisp = 'pending';
        }
        needsHealing = true;
      }
    }

    // In-memory normalization without spawning hundreds of concurrent background writes on every read
    if (needsHealing) {
      raw.appointment_outcome = apptOutcome;
      raw.appointment_completed_at = apptCompletedAt;
      raw.last_disposition = lastDisp;
      raw.appointment_scheduled_at = apptScheduledAt;
      raw.follow_up_at = followUpAt;
    }

    return {
      ...raw,
      alternate_phones: alternatePhones,
      follow_up_at: followUpAt,
      priority_tier: raw.priority_tier !== undefined && raw.priority_tier !== null ? Number(raw.priority_tier) : 1,
      cadence_step: raw.cadence_step !== undefined && raw.cadence_step !== null ? Number(raw.cadence_step) : 1,
      attempts_count: raw.attempts_count !== undefined && raw.attempts_count !== null ? Number(raw.attempts_count) : 0,
      text_ok: raw.text_ok === 1 || raw.text_ok === true,
      last_disposition: lastDisp,
      frs_interests: interests,
      meeting_preferences: preferences,

      // Client Conversion Hydration
      is_client: isClient,
      is_frs: isFrs,
      client_since: raw.client_since || (isClient ? (apptCompletedAt || raw.updated_at || raw.created_at || null) : null),
      products,
      annualized_premium: (() => {
        const parsed = raw.annualized_premium !== undefined && raw.annualized_premium !== null && !isNaN(Number(raw.annualized_premium))
          ? Number(raw.annualized_premium)
          : null;
        if (isClient && (!parsed || parsed === 0) && typeof raw.notes === 'string') {
          const matchAP = raw.notes.match(/\$([0-9,]+(?:\.[0-9]{2})?)\s*(?:AP|annualized\s*premium|annually|\/year|\/yr)/i);
          if (matchAP) {
            const num = parseFloat(matchAP[1].replace(/,/g, ''));
            if (!isNaN(num) && num > 0) return num;
          }
        }
        return parsed;
      })(),
      transfer_assets_volume:
        raw.transfer_assets_volume !== undefined && raw.transfer_assets_volume !== null && !isNaN(Number(raw.transfer_assets_volume))
          ? Number(raw.transfer_assets_volume)
          : null,
      policy_effective_date: raw.policy_effective_date || null,
      annual_review_due_date: raw.annual_review_due_date || null,

      // Drip Tracking Hydration
      drip_track: dripTrack,
      drip_step:
        raw.drip_step !== undefined && raw.drip_step !== null && !isNaN(Number(raw.drip_step))
          ? Number(raw.drip_step)
          : 0,
      last_drip_sent_at: raw.last_drip_sent_at || null,
      next_drip_scheduled_at: raw.next_drip_scheduled_at || null,

      // Post-Appointment Sit-Down Lifecycle Hydration
      appointment_scheduled_at: raw.appointment_scheduled_at || null,
      appointment_outcome: apptOutcome,
      appointment_completed_at: apptCompletedAt,
      appointment_notes: raw.appointment_notes || null,
    };
  }
}
