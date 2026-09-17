import { Lead, CallLog } from '../types';
import { SettingsRepository } from '../db/settingsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { GeminiModelService } from './geminiModelService';
import { DateTimeAwareService, RelativeTimeInfo } from './dateTimeAwareService';

export class AiSmsService {
  /**
   * Generates a clean, warm, friendly yet professional personalized SMS message for Florida educators.
   * Fully time-and-date aware: accurately distinguishes appointments scheduled for today vs tomorrow vs later this week,
   * ensuring that texts never erroneously claim 'later this week' for appointments occurring today.
   */
  static async generatePersuasiveSMS(
    lead: Lead,
    currentDisposition?: string,
    providedApiKey?: string,
    toneFocus?: 'meeting_confirmation' | 'unanswered_followup' | 'drop_bonus_focus' | 'planning_period' | 'address_question',
    refDate: Date = new Date()
  ): Promise<string> {
    const settings = await SettingsRepository.getSettings();
    const agentName = settings.user_name || 'Alex';
    let key = providedApiKey || settings.gemini_api_key;

    // If no API key, return a fully dynamic, complete tailored fallback
    if (!key || key.trim().length === 0) {
      return this.getSmartFallbackSMS(lead, agentName, toneFocus, refDate);
    }

    try {
      const history = await CallLogsRepository.getLogsForLead(lead.id);

      const historySummary = history
        .slice(0, 3)
        .map(
          (h) =>
            `- Outreach on ${new Date(h.timestamp).toLocaleDateString()}: "${h.disposition}"${
              h.note ? ` (Note: ${h.note})` : ''
            }`
        )
        .join('\n');

      const preferredTimes = (lead.meeting_preferences || []).join(', ') || '';
      const interests = (lead.frs_interests || []).join(', ') || '';
      const handwrittenQuestion = lead.custom_questions ? lead.custom_questions.trim() : '';
      const agentNotes = lead.notes ? lead.notes.trim() : '';

      // Time & Date Awareness calculations
      const apptTokens = DateTimeAwareService.getAppointmentTokens(lead, refDate);
      const hasAppt = apptTokens.hasAppointment;
      const relInfo = apptTokens.relativeInfo;

      const nowFormatted = `${DateTimeAwareService.formatDate(refDate)} at ${DateTimeAwareService.formatTime(refDate)}`;
      const suggestedOutreach = DateTimeAwareService.getSuggestedOutreachTimeframe(refDate);

      let temporalPromptSection = '';
      if (hasAppt && relInfo) {
        temporalPromptSection = `
SCHEDULED APPOINTMENT & TEMPORAL CONTEXT:
- Current Local Date & Time: ${nowFormatted}
- Scheduled Appointment: ${relInfo.fullRelativePhrase} (${relInfo.dateStr})
- Relative Timing: ${relInfo.shortRelative.toUpperCase()}
- Is Scheduled For Today: ${relInfo.isToday ? 'YES (TODAY)' : 'NO'}
- Is Scheduled For Tomorrow: ${relInfo.isTomorrow ? 'YES (TOMORROW)' : 'NO'}
- Is Past / Already Occurred: ${relInfo.isPast ? 'YES' : 'NO'}
- Effective Tone/Focus: ${toneFocus || (relInfo.isPast ? 'appointment_followup' : 'meeting_confirmation')}

CRITICAL TEMPORAL DIRECTIVES (MANDATORY):
1. ACCURATE RELATIVE TIME PHRASING:
   ${
     relInfo.isToday && !relInfo.isPast
       ? `* The appointment is scheduled for LATER TODAY (${relInfo.timeStr}). You MUST refer to it as "later today", "this afternoon", or "today at ${relInfo.timeStr}". You MUST NEVER say "later this week", "this week", "tomorrow", or "next week" under any circumstances.`
       : relInfo.isTomorrow
       ? `* The appointment is scheduled for TOMORROW (${relInfo.timeStr}). You MUST refer to it as "tomorrow at ${relInfo.timeStr}" or "tomorrow morning/afternoon". You MUST NEVER say "this week", "later this week", or "today".`
       : relInfo.category === 'this_week'
       ? `* The appointment is scheduled for later this week on ${relInfo.dayLabel}. You MUST refer to it as "this ${relInfo.dayLabel} at ${relInfo.timeStr}".`
       : relInfo.category === 'next_week'
       ? `* The appointment is scheduled for NEXT WEEK on ${relInfo.dayLabel}. You MUST refer to it as "next ${relInfo.dayLabel} at ${relInfo.timeStr}".`
       : relInfo.isPast
       ? `* The appointment already took place ${relInfo.shortRelative}. Write a courteous follow-up thanking them for meeting.`
       : `* The appointment is scheduled for ${relInfo.fullRelativePhrase}.`
   }
2. Never contradict the scheduled appointment time.
`;
      } else {
        temporalPromptSection = `
OUTREACH TEMPORAL CONTEXT:
- Current Local Date & Time: ${nowFormatted}
- Suggested School-Day Window: ${suggestedOutreach.timeframePhrase} (${suggestedOutreach.planningSuggestion})
- Directive: When inviting the educator to meet, suggest "${suggestedOutreach.timeframePhrase}" or their planning period. Do NOT propose "this week" or "tomorrow" if today is Friday or the weekend.
`;
      }

      const prompt = `
You are a warm, professional, and consultative educational retirement advisor for ValuTeachers in Florida.
You are writing a personalized SMS text message to a Florida public school teacher who filled out a handwritten ValuTeachers Report Card requesting an in-person planning session.

EDUCATOR DETAILS (FROM SCANNED REPORT CARD):
- Educator Name: ${lead.name}
- School / Campus: ${lead.school || 'your school'}
- Classroom / Room #: ${lead.room_number ? `Room ${lead.room_number}` : 'Classroom'}
- Planning Period / Time: ${lead.planning_period || 'planning period'}
- Years in Florida Retirement System (FRS): ${lead.years_in_frs ? `${lead.years_in_frs} years` : 'Not specified'}
- FRS Knowledge Level: "${lead.frs_knowledge || 'Moderate'}"
- Specific Needs / Topics Checked: ${interests || 'FRS Pension calculations, DROP, and 403(b) review'}
- Handwritten Question / Note on Card: ${handwrittenQuestion ? `"${handwrittenQuestion}"` : 'None'}
- Special File Notes: ${agentNotes ? `"${agentNotes}"` : 'None'}
- Teacher's Requested Availability: ${preferredTimes || 'During planning period or after school'}
- Call Status: ${currentDisposition || 'Outreach'}
- Contact History:
${historySummary || 'First outreach.'}
- ValuTeachers Representative Name: ${agentName}
${toneFocus ? `- Tone / Focus Preference: ${toneFocus.replace('_', ' ')}` : ''}
${temporalPromptSection}

WRITING OBJECTIVES & GUIDELINES:
1. Warm, Friendly & Professional: Approachable Florida educational retirement specialist visiting their campus.
2. Address Their Handwritten Notes: If the teacher wrote a specific question or note on their card ("${handwrittenQuestion}"), acknowledge it naturally.
3. Accurate Goal & Time Awareness:
   - If confirming an upcoming appointment: Confirm their exact sit-down window (${
     hasAppt && relInfo ? relInfo.fullRelativePhrase : 'during their planning period'
   }) in their room (${lead.room_number ? `Room ${lead.room_number}` : 'classroom'}) to review their personalized FRS numbers.
   - If proposing a new sit-down: Invite them for a relaxed 20-30 minute classroom sit-down during their planning period (${
     lead.planning_period || 'planning period'
   }) ${suggestedOutreach.timeframePhrase}.
4. Seamlessly incorporate relevant details: Mention their years in FRS (${lead.years_in_frs || 'service'}), DROP calculation, 5% bonus, or 403(b) clarity naturally without sounding like a robotic form letter.
5. NEVER Cut Off / Complete Thought: The message MUST be complete, grammatically sound, and end cleanly.
6. Length: Concise mobile length (around 2 to 3 sentences).
7. Format: Output ONLY the plain SMS text. Do NOT include quotation marks, markdown bolding, or intro/outro explanations.
`;

      const candidateModels = await GeminiModelService.getActiveModels(key);

      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 600,
              },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text && text.length > 20) {
              return text.replace(/^["']|["']$/g, '').trim();
            }
          }
        } catch {
          // Attempt next model
        }
      }
    } catch (e) {
      console.warn('AI SMS generation failed, using intelligent fallback:', e);
    }

    return this.getSmartFallbackSMS(lead, agentName, toneFocus, refDate);
  }

  /**
   * Generates a fully customized, professional fallback SMS if the AI API is unreachable.
   * Completely time-and-date aware for today, tomorrow, this week, or future appointments.
   */
  static getSmartFallbackSMS(
    lead: Lead,
    agentName: string = 'Alex',
    toneFocus?: string,
    refDate: Date = new Date()
  ): string {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const school = lead.school || 'your school';
    const planning = lead.planning_period ? ` during ${lead.planning_period}` : ' during your planning period';
    const room = lead.room_number ? ` in Room ${lead.room_number}` : '';
    const hasQuestion = lead.custom_questions && lead.custom_questions.trim().length > 0;
    const hasNotes = lead.notes && lead.notes.trim().length > 0;
    const questionText = hasQuestion ? lead.custom_questions!.trim() : hasNotes ? lead.notes!.trim() : '';

    const apptTokens = DateTimeAwareService.getAppointmentTokens(lead, refDate);
    const hasAppt = apptTokens.hasAppointment;
    const rel = apptTokens.relativeInfo;
    const suggestedOutreach = DateTimeAwareService.getSuggestedOutreachTimeframe(refDate);

    // Case 0: Meeting Confirmation or Appt Scheduled
    const isApptConfirmation =
      toneFocus === 'meeting_confirmation' ||
      lead.last_disposition === 'appointment_set' ||
      (hasAppt && toneFocus !== 'unanswered_followup' && toneFocus !== 'drop_bonus_focus' && toneFocus !== 'address_question');

    if (isApptConfirmation && rel) {
      if (rel.isToday && !rel.isPast) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Looking forward to our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your FRS numbers! See you soon.`;
      }
      if (rel.isTomorrow) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down tomorrow at ${rel.timeStr}${room}${planning} to review your state pension and DROP numbers. Looking forward to connecting!`;
      }
      if (rel.category === 'this_week') {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your personalized FRS report. Looking forward to meeting!`;
      }
      if (rel.category === 'next_week' || rel.category === 'future_date') {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Confirming our sit-down on ${rel.fullRelativePhrase}${room}${planning} to review your FRS options. Looking forward to connecting!`;
      }
      if (rel.isPast) {
        return `Hi ${firstName}, this is ${agentName} with ValuTeachers following up on our sit-down ${rel.shortRelative}${room}. Thank you for your time reviewing your FRS options—please reach out if you have any questions!`;
      }
    }

    const prefSlot =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : `during ${lead.planning_period || 'planning'}`;

    const outreachPhrase = suggestedOutreach.timeframePhrase; // e.g. "this week", "early next week"

    // Case 1: Teacher wrote a specific handwritten note or question
    if (questionText) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your FRS Report Card from ${school} and saw your note regarding "${questionText}". I'll be on campus ${outreachPhrase} and would love to review your exact numbers—does ${prefSlot} work for a quick sit-down${planning}${room}?`;
    }

    // Case 2: High years of service / DROP focus
    if (lead.years_in_frs && parseInt(lead.years_in_frs, 10) >= 15) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your FRS Report Card from ${school} regarding your ${lead.years_in_frs} years of service and DROP options. I'll be visiting campus ${outreachPhrase}—does ${prefSlot} work for a quick sit-down${planning}${room}?`;
    }

    // Case 3: 5% Bonus or 403(b) focus
    if (
      toneFocus === 'drop_bonus_focus' ||
      (lead.frs_interests && lead.frs_interests.some((i) => i.includes('Bonus') || i.includes('403')))
    ) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Following up on your FRS Report Card from ${school} regarding your 403(b) options and the 5% bonus. I'll be at the school ${outreachPhrase}—does ${prefSlot} work for a quick classroom sit-down${planning}${room}?`;
    }

    // Default friendly & professional sit-down invitation
    return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your handwritten FRS Report Card from ${school} and wanted to help review your state pension and retirement options. I'll be on campus ${outreachPhrase}—does ${prefSlot} work for a quick sit-down${planning}${room}?`;
  }
}
