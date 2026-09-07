import { CadenceRepository } from '../db/cadenceRepository';
import { Lead, CallDisposition, SMSTemplate } from '../types';

export interface CadenceActionResult {
  shouldPromptSMS: boolean;
  template?: SMSTemplate;
  nextStepNumber: number;
}

const DEFAULT_JUST_CALLED_TEMPLATE: SMSTemplate = {
  id: 'tpl_just_called',
  title: 'No Answer - Just Called Follow-up',
  body: 'Hi {{name}}, this is {{my_name}} with ValuTeachers! I just tried giving you a quick call regarding your FRS Report Card from {{school}}. Feel free to call me back, or text me a good time during your planning period to connect!',
};

export class CadenceEngine {
  /**
   * Evaluates if a disposition at the current attempt triggers an automated SMS prompt
   */
  static async evaluateCadence(
    lead: Lead,
    disposition: CallDisposition
  ): Promise<CadenceActionResult> {
    const currentStep = (lead.attempts_count || 0) + 1;

    // Check SMS consent compliance (TCPA / Florida standard)
    if (lead.text_ok === false || lead.text_ok === (0 as any)) {
      return {
        shouldPromptSMS: false,
        nextStepNumber: currentStep + 1,
      };
    }

    const isUnanswered =
      disposition === 'no_answer' || disposition === 'voicemail';

    const rule = await CadenceRepository.getRuleForStep(currentStep);

    if (rule) {
      const matchesCondition =
        rule.condition_disposition === disposition ||
        (rule.condition_disposition === 'any_unconnected' && isUnanswered) ||
        (rule.condition_disposition === 'no_answer' && isUnanswered);

      if (matchesCondition) {
        if (rule.action_type === 'call_only') {
          return {
            shouldPromptSMS: false,
            nextStepNumber: currentStep + 1,
          };
        }

        if (rule.action_type === 'call_and_sms' || rule.action_type === 'sms_only') {
          let template: SMSTemplate | null = null;
          if (rule.sms_template_id) {
            template = await CadenceRepository.getTemplateById(rule.sms_template_id);
          }
          if (!template) {
            template = (await CadenceRepository.getTemplateById('tpl_just_called')) ||
                       (await CadenceRepository.getTemplateById('tpl_frs_meeting')) ||
                       DEFAULT_JUST_CALLED_TEMPLATE;
          }

          return {
            shouldPromptSMS: true,
            template: template || DEFAULT_JUST_CALLED_TEMPLATE,
            nextStepNumber: currentStep + 1,
          };
        }
      }
    }

    // Default behavior for No Answer / Voicemail: Always prompt follow-up SMS
    if (isUnanswered) {
      const template = (await CadenceRepository.getTemplateById('tpl_just_called')) ||
                       (await CadenceRepository.getTemplateById('tpl_frs_meeting')) ||
                       DEFAULT_JUST_CALLED_TEMPLATE;
      return {
        shouldPromptSMS: true,
        template,
        nextStepNumber: currentStep + 1,
      };
    }

    return {
      shouldPromptSMS: false,
      nextStepNumber: currentStep + 1,
    };
  }
}
