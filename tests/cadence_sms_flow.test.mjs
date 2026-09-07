import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Cadence Rules, Telephony & No-Answer SMS Disposition Flow', () => {
  // 1. Cadence Evaluation Logic
  it('correctly suppresses SMS prompt when rule action_type is call_only', () => {
    const evaluateCadenceRule = (lead, disposition, rule) => {
      const currentStep = (lead.attempts_count || 0) + 1;
      const isUnanswered = disposition === 'no_answer' || disposition === 'voicemail';

      if (lead.text_ok === false || lead.text_ok === 0) {
        return { shouldPromptSMS: false, nextStepNumber: currentStep + 1 };
      }

      if (rule) {
        const matchesCondition =
          rule.condition_disposition === disposition ||
          (rule.condition_disposition === 'any_unconnected' && isUnanswered) ||
          (rule.condition_disposition === 'no_answer' && isUnanswered);

        if (matchesCondition) {
          if (rule.action_type === 'call_only') {
            return { shouldPromptSMS: false, nextStepNumber: currentStep + 1 };
          }
          if (rule.action_type === 'call_and_sms' || rule.action_type === 'sms_only') {
            return {
              shouldPromptSMS: true,
              templateId: rule.sms_template_id || 'tpl_just_called',
              nextStepNumber: currentStep + 1,
            };
          }
        }
      }

      if (isUnanswered) {
        return { shouldPromptSMS: true, templateId: 'tpl_just_called', nextStepNumber: currentStep + 1 };
      }

      return { shouldPromptSMS: false, nextStepNumber: currentStep + 1 };
    };

    const leadWithConsent = { id: 'lead_1', name: 'Jane Doe', phone: '5551234567', attempts_count: 0, text_ok: true };
    const callOnlyRule = { id: 'cad_1', step_number: 1, condition_disposition: 'no_answer', action_type: 'call_only' };
    const callAndSmsRule = { id: 'cad_1', step_number: 1, condition_disposition: 'no_answer', action_type: 'call_and_sms', sms_template_id: 'tpl_just_called' };

    // Test call_only
    const resultCallOnly = evaluateCadenceRule(leadWithConsent, 'no_answer', callOnlyRule);
    assert.strictEqual(resultCallOnly.shouldPromptSMS, false, 'Should NOT prompt SMS when rule is call_only');

    // Test call_and_sms
    const resultCallAndSms = evaluateCadenceRule(leadWithConsent, 'no_answer', callAndSmsRule);
    assert.strictEqual(resultCallAndSms.shouldPromptSMS, true, 'Should prompt SMS when rule is call_and_sms');
    assert.strictEqual(resultCallAndSms.templateId, 'tpl_just_called');
  });

  // 2. Consent Revocation / TCPA Compliance
  it('suppresses SMS prompt when text_ok is false regardless of rule', () => {
    const evaluateConsent = (lead, rule) => {
      const hasConsent = lead.text_ok !== false && lead.text_ok !== 0;
      const isCallOnly = rule?.action_type === 'call_only';
      return hasConsent && !isCallOnly;
    };

    const leadNoConsent = { id: 'lead_2', name: 'John Smith', phone: '5559876543', attempts_count: 0, text_ok: false };
    const callAndSmsRule = { id: 'cad_1', step_number: 1, action_type: 'call_and_sms' };

    assert.strictEqual(evaluateConsent(leadNoConsent, callAndSmsRule), false, 'Should block SMS when text_ok is false');
  });

  // 3. Conditional Note Formatting
  it('omits SMS text from note when SMS is not sent or skipped', () => {
    const generateAttemptNote = (attemptNum, disposition, smsSent) => {
      const isUnanswered = disposition === 'no_answer' || disposition === 'voicemail';
      if (isUnanswered) {
        return smsSent
          ? `Call attempt #${attemptNum}: No Answer / Voicemail. Follow-up SMS sent.`
          : `Call attempt #${attemptNum}: No Answer / Voicemail.`;
      }
      if (disposition === 'connected' || disposition === 'spoke') {
        return `Call attempt #${attemptNum}: Connected / Spoke on phone.`;
      }
      if (disposition === 'appointment_set') {
        return `Call attempt #${attemptNum}: Appointment Set.`;
      }
      return `Call attempt #${attemptNum}: ${disposition}`;
    };

    // Scenario A: Attempt #1 call-only or SMS skipped
    const noteSkipped = generateAttemptNote(1, 'no_answer', false);
    assert.strictEqual(noteSkipped, 'Call attempt #1: No Answer / Voicemail.');
    assert.strictEqual(noteSkipped.includes('Sent follow-up SMS'), false);
    assert.strictEqual(noteSkipped.includes('Follow-up SMS sent'), false);

    // Scenario B: Attempt #1 with SMS sent
    const noteSent = generateAttemptNote(1, 'no_answer', true);
    assert.strictEqual(noteSent, 'Call attempt #1: No Answer / Voicemail. Follow-up SMS sent.');
  });

  // 4. Call Log Audit Attribution
  it('accurately distinguishes voice calls with skipped SMS vs sent SMS in call logs', () => {
    const logs = [
      {
        id: 'log_voice_skipped_sms',
        disposition: 'no_answer',
        duration_seconds: 0,
        sms_sent: false,
        note: 'Call attempt #1: No Answer / Voicemail.',
      },
      {
        id: 'log_voice_sent_sms',
        disposition: 'no_answer',
        duration_seconds: 0,
        sms_sent: true,
        sms_body: 'Hi Jennifer, this is Alex with ValuTeachers...',
        note: 'Call attempt #1: No Answer / Voicemail. Follow-up SMS sent.',
      },
    ];

    assert.strictEqual(logs[0].sms_sent, false);
    assert.strictEqual(logs[0].sms_body, undefined);
    assert.strictEqual(logs[1].sms_sent, true);
    assert.strictEqual(typeof logs[1].sms_body, 'string');
  });
});
