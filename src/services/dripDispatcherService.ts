import { Lead, SMSTemplate, DripTrack } from '../types';
import { NURTURE_DRIP_TEMPLATES, CLIENT_REVIEW_DRIP_TEMPLATES } from '../data/dripTemplates';
import { LeadsRepository } from '../db/leadsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { TelephonyService } from './telephonyService';

export interface DueDripItem {
  lead: Lead;
  template: SMSTemplate;
  formattedMessage: string;
  stepNumber: number;
  track: DripTrack;
}

export class DripDispatcherService {
  /**
   * Returns the corresponding SMSTemplate for a lead's current drip track and step
   */
  static getTemplateForLead(lead: Lead): SMSTemplate | null {
    const track = lead.drip_track;
    const step = Number(lead.drip_step) || 0;

    if (track === 'prospect_nurture') {
      const idx = Math.min(step, NURTURE_DRIP_TEMPLATES.length - 1);
      return NURTURE_DRIP_TEMPLATES[idx] || null;
    }

    if (track === 'client_annual_review') {
      const idx = Math.min(step, CLIENT_REVIEW_DRIP_TEMPLATES.length - 1);
      return CLIENT_REVIEW_DRIP_TEMPLATES[idx] || null;
    }

    return null;
  }

  /**
   * Calculates the next drip scheduled date (YYYY-MM-DD)
   */
  static calculateNextDripDate(
    track: DripTrack,
    nextStep: number,
    baseDateStr?: string | null,
    anniversaryStr?: string | null
  ): string | null {
    const today = new Date();

    if (track === 'prospect_nurture') {
      // Step 0 -> Day 7, Step 1 -> Day 21 (14d later), Step 2 -> Day 45 (24d later), Step 3 -> Day 90 (45d later)
      const dayDelays = [7, 14, 24, 45];
      const delayDays = dayDelays[nextStep] !== undefined ? dayDelays[nextStep] : 90;
      const nextDate = new Date(today.getTime() + delayDays * 86400000);
      return nextDate.toISOString().slice(0, 10);
    }

    if (track === 'client_annual_review') {
      // Step 0 -> Day 90, Step 1 -> Day 180 (90d later), Step 2 -> Anniv -30d, Step 3 -> Anniv -7d
      if (nextStep === 1) {
        const nextDate = new Date(today.getTime() + 90 * 86400000);
        return nextDate.toISOString().slice(0, 10);
      }
      if (nextStep === 2 && anniversaryStr) {
        const annivDate = new Date(anniversaryStr);
        if (!isNaN(annivDate.getTime())) {
          const minus30 = new Date(annivDate.getTime() - 30 * 86400000);
          return minus30.toISOString().slice(0, 10);
        }
      }
      if (nextStep === 3 && anniversaryStr) {
        const annivDate = new Date(anniversaryStr);
        if (!isNaN(annivDate.getTime())) {
          const minus7 = new Date(annivDate.getTime() - 7 * 86400000);
          return minus7.toISOString().slice(0, 10);
        }
      }
      // After cycle completes, schedule for next year's 90-day check-in
      const nextYear = new Date(today.getTime() + 90 * 86400000);
      return nextYear.toISOString().slice(0, 10);
    }

    return null;
  }

  /**
   * Filters and returns all leads with drips due today or overdue
   */
  static getDueDrips(leads: Lead[], advisorName: string = 'Alex'): DueDripItem[] {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueItems: DueDripItem[] = [];

    for (const lead of leads) {
      if (!lead.drip_track || lead.drip_track === 'none') continue;
      if (lead.last_disposition === 'do_not_call' || lead.last_disposition === 'bad_number') continue;
      if (lead.text_ok === false) continue;
      if (!lead.phone || lead.phone.replace(/\D/g, '').length < 7) continue;

      let isDue = false;
      const scheduledStr = lead.next_drip_scheduled_at;

      if (scheduledStr) {
        const scheduledDatePart = scheduledStr.slice(0, 10);
        if (scheduledDatePart <= todayStr) {
          isDue = true;
        }
      } else {
        // Not yet explicitly scheduled: initialize based on enrollment
        if ((lead.drip_step || 0) === 0) {
          const baseDateStr = lead.is_client
            ? lead.client_since || lead.policy_effective_date || lead.created_at
            : lead.created_at;
          if (baseDateStr) {
            const baseDate = new Date(baseDateStr);
            const daysSince = Math.floor((Date.now() - baseDate.getTime()) / 86400000);
            const threshold = lead.drip_track === 'prospect_nurture' ? 7 : 90;
            if (daysSince >= threshold) {
              isDue = true;
            }
          } else {
            isDue = true;
          }
        }
      }

      if (isDue) {
        const template = this.getTemplateForLead(lead);
        if (template) {
          const formattedMessage = TelephonyService.interpolateTemplate(template, lead, advisorName);
          dueItems.push({
            lead,
            template,
            formattedMessage,
            stepNumber: lead.drip_step || 0,
            track: lead.drip_track,
          });
        }
      }
    }

    return dueItems;
  }

  /**
   * Records SMS dispatch, advances drip step, and schedules next touchpoint
   */
  static async recordDripDispatched(lead: Lead, template: SMSTemplate): Promise<void> {
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

    // Record call log with sms_sent = true and standalone disposition
    await CallLogsRepository.logCall({
      leadId: lead.id,
      listId: lead.list_id || 'master_queue',
      disposition: 'drip_sent',
      durationSeconds: 0,
      smsSent: true,
      note: `[Drip Sent] ${template.title}`,
      smsBody: template.body,
    });
  }
}
