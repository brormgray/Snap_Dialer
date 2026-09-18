import { Lead, SMSTemplate, DripTrack, DripStage } from '../types';
import {
  NURTURE_DRIP_TEMPLATES,
  NON_FRS_NURTURE_DRIP_TEMPLATES,
  CLIENT_REVIEW_DRIP_TEMPLATES,
  NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES,
} from '../data/dripTemplates';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { TelephonyService } from './telephonyService';

export interface DueDripItem {
  lead: Lead;
  template: SMSTemplate;
  formattedMessage: string;
  stepNumber: number;
  track: DripTrack;
  stage?: DripStage;
  stageLabel?: string;
  suggestedNextDate?: string | null;
}

export class DripDispatcherService {
  /**
   * Resolves the stage and human-readable label for any step in the cadence
   */
  static getStageForStep(track: DripTrack, step: number): { stage: DripStage; label: string } {
    if (track === 'prospect_nurture') {
      if (step <= 1) return { stage: 'sprint', label: step === 0 ? 'Sprint (24h)' : 'Sprint (48h)' };
      if (step <= 5) return { stage: 'bridge', label: `Bridge (Week ${step === 2 ? 2 : step === 3 ? 3 : step === 4 ? 4 : 6})` };
      return { stage: 'monthly', label: `Monthly Value (Month ${Math.min(step - 4, 6)}+)` };
    }
    if (track === 'client_annual_review') {
      if (step === 0) return { stage: 'client', label: 'Onboarding (Day 30)' };
      if (step === 1) return { stage: 'client', label: 'Policy Hygiene (Day 90)' };
      if (step === 2) return { stage: 'client', label: 'Cross-Sell (Day 180)' };
      if (step === 3) return { stage: 'client', label: 'Servicing (Anniv -90d)' };
      if (step === 4) return { stage: 'client', label: 'Annual Review (Anniv -30d)' };
      return { stage: 'client', label: 'Final Reminder (Anniv -7d)' };
    }
    return { stage: 'monthly', label: 'Cadence' };
  }

  /**
   * Selects the appropriate template for a lead given their track, step, and FRS status.
   * For prospect nurture, steps 10+ cycle through the monthly authority pool indefinitely.
   * For client review, steps roll over for annual servicing.
   */
  static getTemplateForLead(lead: Lead): SMSTemplate | null {
    const track = lead.drip_track;
    const step = Number(lead.drip_step) || 0;
    const isFrs = lead.is_frs !== false;

    if (track === 'prospect_nurture') {
      const templates = isFrs ? NURTURE_DRIP_TEMPLATES : NON_FRS_NURTURE_DRIP_TEMPLATES;
      if (step < templates.length) {
        return templates[step] || null;
      }
      // Indefinite Monthly Cycling: Cycle through the monthly authority templates (indices 6 to length - 1)
      const monthlyStartIndex = 6;
      const monthlyPool = templates.slice(monthlyStartIndex);
      if (monthlyPool.length > 0) {
        const cycleIndex = (step - monthlyStartIndex) % monthlyPool.length;
        return monthlyPool[cycleIndex] || null;
      }
      return templates[templates.length - 1] || null;
    }

    if (track === 'client_annual_review') {
      const templates = isFrs ? CLIENT_REVIEW_DRIP_TEMPLATES : NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES;
      if (step < templates.length) {
        return templates[step] || null;
      }
      // Annual reset cycle for ongoing servicing
      const cycleIndex = step % templates.length;
      return templates[cycleIndex] || null;
    }

    return null;
  }

  /**
   * Calculates the next drip scheduled date (YYYY-MM-DD)
   * Implements the psychological decay curve:
   * - Step 0 -> 1: +2 days (Sprint 48-72h)
   * - Step 1 -> 2: +7 days (Week 2 Bridge)
   * - Step 2 -> 3: +7 days (Week 3 Bridge)
   * - Step 3 -> 4: +7 days (Week 4 Bridge)
   * - Step 4 -> 5: +14 days (Week 6 Bridge)
   * - Step 5 -> 6: +18 days (Month 2 / ~Day 60)
   * - Step 6+: +30 days (Monthly indefinitely)
   */
  static calculateNextDripDate(
    track: DripTrack,
    nextStep: number,
    baseDateStr?: string | null,
    anniversaryStr?: string | null,
    refDate: Date = new Date()
  ): string | null {
    if (track === 'prospect_nurture') {
      const delaysByNextStep: Record<number, number> = {
        1: 2,   // Sprint step 1: 48h later
        2: 7,   // Bridge week 2: +7d
        3: 7,   // Bridge week 3: +7d
        4: 7,   // Bridge week 4: +7d
        5: 14,  // Bridge week 6: +14d
        6: 18,  // Month 2: +18d (~Day 60)
      };
      const delayDays = delaysByNextStep[nextStep] ?? 30; // Step 7+ is 30 days indefinitely
      const nextDate = new Date(refDate.getTime() + delayDays * 86400000);
      return nextDate.toISOString().slice(0, 10);
    }

    if (track === 'client_annual_review') {
      // Step 0 -> Day 30, Step 1 -> Day 90 (+60d), Step 2 -> Day 180 (+90d)
      if (nextStep === 1) {
        const nextDate = new Date(refDate.getTime() + 60 * 86400000);
        return nextDate.toISOString().slice(0, 10);
      }
      if (nextStep === 2) {
        const nextDate = new Date(refDate.getTime() + 90 * 86400000);
        return nextDate.toISOString().slice(0, 10);
      }
      // Step 3 -> Anniversary -90d
      if (nextStep === 3 && anniversaryStr) {
        const annivDate = new Date(anniversaryStr);
        if (!isNaN(annivDate.getTime())) {
          const minus90 = new Date(annivDate.getTime() - 90 * 86400000);
          if (minus90.getTime() > refDate.getTime()) {
            return minus90.toISOString().slice(0, 10);
          }
        }
        const fallback = new Date(refDate.getTime() + 90 * 86400000);
        return fallback.toISOString().slice(0, 10);
      }
      // Step 4 -> Anniversary -30d
      if (nextStep === 4 && anniversaryStr) {
        const annivDate = new Date(anniversaryStr);
        if (!isNaN(annivDate.getTime())) {
          const minus30 = new Date(annivDate.getTime() - 30 * 86400000);
          if (minus30.getTime() > refDate.getTime()) {
            return minus30.toISOString().slice(0, 10);
          }
        }
        const fallback = new Date(refDate.getTime() + 60 * 86400000);
        return fallback.toISOString().slice(0, 10);
      }
      // Step 5 -> Anniversary -7d
      if (nextStep === 5 && anniversaryStr) {
        const annivDate = new Date(anniversaryStr);
        if (!isNaN(annivDate.getTime())) {
          const minus7 = new Date(annivDate.getTime() - 7 * 86400000);
          if (minus7.getTime() > refDate.getTime()) {
            return minus7.toISOString().slice(0, 10);
          }
        }
        const fallback = new Date(refDate.getTime() + 23 * 86400000);
        return fallback.toISOString().slice(0, 10);
      }
      // After cycle completes, schedule for next year's 30-day onboarding/check-in
      const nextYear = new Date(refDate.getTime() + 90 * 86400000);
      return nextYear.toISOString().slice(0, 10);
    }

    return null;
  }

  /**
   * Filters and returns all leads with drips due today or overdue.
   * Auto-resolves track for leads marked nurture_drip or clients with missing drip_track.
   */
  static getDueDrips(leads: Lead[], advisorName: string = 'Alex'): DueDripItem[] {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueItems: DueDripItem[] = [];

    for (const lead of leads) {
      // Determine effective track
      let effectiveTrack: DripTrack = lead.drip_track || 'none';
      if (effectiveTrack === 'none' || !effectiveTrack) {
        if (lead.appointment_outcome === 'nurture_drip') {
          effectiveTrack = 'prospect_nurture';
        } else if (lead.is_client && lead.drip_track !== 'none') {
          effectiveTrack = 'client_annual_review';
        }
      }

      if (effectiveTrack === 'none') continue;
      if (lead.last_disposition === 'do_not_call' || lead.last_disposition === 'bad_number') continue;
      if (lead.text_ok === false) continue;
      if (!lead.phone || lead.phone.replace(/\D/g, '').length < 7) continue;

      let isDue = false;
      const scheduledStr = lead.next_drip_scheduled_at;
      const currentStep = Number(lead.drip_step) || 0;

      if (scheduledStr) {
        const scheduledDatePart = scheduledStr.slice(0, 10);
        if (scheduledDatePart <= todayStr) {
          isDue = true;
        }
      } else {
        // Not yet explicitly scheduled: assess based on enrollment/completion date
        if (currentStep === 0) {
          const baseDateStr = lead.is_client
            ? lead.client_since || lead.policy_effective_date || lead.created_at
            : lead.appointment_completed_at || lead.created_at;
          if (baseDateStr) {
            const baseDate = new Date(baseDateStr);
            const daysSince = Math.floor((Date.now() - baseDate.getTime()) / 86400000);
            // Sprint starts 1 day (24h) after sit-down; client onboarding starts at 30 days
            const threshold = effectiveTrack === 'prospect_nurture' ? 1 : 30;
            if (daysSince >= threshold) {
              isDue = true;
            }
          } else {
            isDue = true;
          }
        }
      }

      if (isDue) {
        const syntheticLead: Lead = {
          ...lead,
          drip_track: effectiveTrack,
          drip_step: currentStep,
        };
        const template = this.getTemplateForLead(syntheticLead);
        if (template) {
          const formattedMessage = TelephonyService.interpolateTemplate(template, syntheticLead, advisorName);
          const stageInfo = this.getStageForStep(effectiveTrack, currentStep);
          const suggestedNextDate = this.calculateNextDripDate(
            effectiveTrack,
            currentStep + 1,
            lead.policy_effective_date || lead.created_at,
            lead.annual_review_due_date
          );

          dueItems.push({
            lead: syntheticLead,
            template,
            formattedMessage,
            stepNumber: currentStep,
            track: effectiveTrack,
            stage: template.stage || stageInfo.stage,
            stageLabel: template.phase_label || stageInfo.label,
            suggestedNextDate,
          });
        }
      }
    }

    return dueItems;
  }

  /**
   * Assesses existing prospects and clients in the database and initializes their drip
   * schedules if they are not already set. Ensures no existing data is deleted or harmed.
   */
  static async assessAndBackfillLeads(leads: Lead[]): Promise<{ updatedCount: number }> {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let updatedCount = 0;

    for (const lead of leads) {
      if (lead.last_disposition === 'do_not_call' || lead.last_disposition === 'bad_number') continue;
      if (lead.text_ok === false) continue;

      let shouldUpdate = false;
      let targetTrack = lead.drip_track;
      let targetStep = lead.drip_step !== undefined && lead.drip_step !== null ? lead.drip_step : 0;
      let targetNextScheduled = lead.next_drip_scheduled_at;

      // Rule 1: Non-closed sit-down outcome without active track
      if (lead.appointment_outcome === 'nurture_drip' && (!targetTrack || targetTrack === 'none')) {
        targetTrack = 'prospect_nurture';
        targetStep = 0;
        shouldUpdate = true;
      }

      // Rule 2: Active track with missing next_drip_scheduled_at
      if (targetTrack && targetTrack !== 'none' && !targetNextScheduled) {
        const baseDateStr = lead.is_client
          ? lead.client_since || lead.policy_effective_date || lead.created_at
          : lead.appointment_completed_at || lead.created_at;

        if (baseDateStr) {
          const baseDate = new Date(baseDateStr);
          const daysElapsed = Math.max(0, Math.floor((today.getTime() - baseDate.getTime()) / 86400000));

          if (targetTrack === 'prospect_nurture') {
            if (daysElapsed <= 2) {
              targetStep = 0;
              targetNextScheduled = new Date(baseDate.getTime() + 1 * 86400000).toISOString().slice(0, 10);
            } else if (daysElapsed <= 5) {
              targetStep = 1;
              targetNextScheduled = todayStr;
            } else if (daysElapsed <= 12) {
              targetStep = 2;
              targetNextScheduled = todayStr;
            } else if (daysElapsed <= 19) {
              targetStep = 3;
              targetNextScheduled = todayStr;
            } else if (daysElapsed <= 26) {
              targetStep = 4;
              targetNextScheduled = todayStr;
            } else if (daysElapsed <= 45) {
              targetStep = 5;
              targetNextScheduled = todayStr;
            } else {
              targetStep = 6;
              targetNextScheduled = todayStr;
            }
          } else if (targetTrack === 'client_annual_review') {
            if (daysElapsed < 30) {
              targetStep = 0;
              targetNextScheduled = new Date(baseDate.getTime() + 30 * 86400000).toISOString().slice(0, 10);
            } else if (daysElapsed < 90) {
              targetStep = 1;
              targetNextScheduled = todayStr;
            } else if (daysElapsed < 180) {
              targetStep = 2;
              targetNextScheduled = todayStr;
            } else {
              targetStep = 3;
              targetNextScheduled = todayStr;
            }
          }
        } else {
          targetNextScheduled = todayStr;
        }
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        await LeadsRepository.updateLeadDetails({
          ...lead,
          drip_track: targetTrack,
          drip_step: targetStep,
          next_drip_scheduled_at: targetNextScheduled,
        });
        updatedCount++;
      }
    }

    return { updatedCount };
  }

  /**
   * Records SMS dispatch, advances drip step, schedules next touchpoint,
   * and records the exact dispatched SMS body in call logs.
   */
  static async recordDripDispatched(
    lead: Lead,
    template: SMSTemplate,
    customBody?: string,
    advisorName: string = 'Alex'
  ): Promise<void> {
    const currentStep = lead.drip_step || 0;
    const nextStep = currentStep + 1;
    const todayISO = new Date().toISOString();

    const nextScheduled = this.calculateNextDripDate(
      lead.drip_track || 'none',
      nextStep,
      lead.policy_effective_date || lead.created_at,
      lead.annual_review_due_date
    );

    // Update lead in DB
    await LeadsRepository.updateLeadDetails({
      ...lead,
      drip_step: nextStep,
      last_drip_sent_at: todayISO,
      next_drip_scheduled_at: nextScheduled,
    });

    const formattedDefault = TelephonyService.interpolateTemplate(template, lead, advisorName);
    const finalSmsBody = customBody && customBody.trim().length > 0
      ? customBody.trim()
      : formattedDefault;

    // Record call log with sms_sent = true and the actual text sent
    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id || 'master_queue',
      disposition: 'drip_sent',
      durationSeconds: 0,
      smsSent: true,
      note: `[Drip Sent] ${template.title}`,
      smsBody: finalSmsBody,
    });
  }
}

