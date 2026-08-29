import { CadenceRepository } from '../db/cadenceRepository';
import { Lead, CallDisposition, SMSTemplate } from '../types';

export interface CadenceActionResult {
  shouldPromptSMS: boolean;
  template?: SMSTemplate;
  nextStepNumber: number;
}

export class CadenceEngine {
  /**
   * Evaluates if a disposition at the current attempt triggers an automated SMS prompt
   */
  static async evaluateCadence(
    lead: Lead,
    disposition: CallDisposition
  ): Promise<CadenceActionResult> {
    const currentStep = lead.attempts_count + 1;

    // Check SMS consent compliance (TCPA / Florida standard)
    if (lead.text_ok === false || lead.text_ok === (0 as any)) {
      return {
        shouldPromptSMS: false,
        nextStepNumber: currentStep + 1,
      };
    }

    const rule = await CadenceRepository.getRuleForStep(currentStep);

    if (!rule) {
      return {
        shouldPromptSMS: false,
        nextStepNumber: currentStep + 1,
      };
    }

    const isUnanswered =
      disposition === 'no_answer' || disposition === 'voicemail';

    const matchesCondition =
      rule.condition_disposition === disposition ||
      (rule.condition_disposition === 'any_unconnected' && isUnanswered) ||
      (rule.condition_disposition === 'no_answer' && isUnanswered);

    if (
      matchesCondition &&
      (rule.action_type === 'call_and_sms' || rule.action_type === 'sms_only') &&
      rule.sms_template_id
    ) {
      const template = await CadenceRepository.getTemplateById(rule.sms_template_id);
      return {
        shouldPromptSMS: !!template,
        template: template || undefined,
        nextStepNumber: currentStep + 1,
      };
    }

    return {
      shouldPromptSMS: false,
      nextStepNumber: currentStep + 1,
    };
  }
}
