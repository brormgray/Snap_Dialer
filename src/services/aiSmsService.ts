import { Lead, CallLog, AppSettings } from '../types';
import { SettingsRepository } from '../db/settingsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { GeminiModelService } from './geminiModelService';

export class AiSmsService {
  /**
   * Generates a clean, warm, friendly yet professional personalized SMS message for Florida educators.
   * Draws directly from information on their scanned ValuTeachers report cards—particularly handwritten questions,
   * notes, planning periods, room numbers, and retirement interests—aimed at setting a comfortable in-person classroom sit-down.
   */
  static async generatePersuasiveSMS(
    lead: Lead,
    currentDisposition?: string,
    providedApiKey?: string,
    toneFocus?: 'meeting_confirmation' | 'unanswered_followup' | 'drop_bonus_focus' | 'planning_period'
  ): Promise<string> {
    const settings = await SettingsRepository.getSettings();
    const agentName = settings.user_name || 'Alex';
    let key = providedApiKey || settings.gemini_api_key;

    // If no API key, return a fully dynamic, complete tailored fallback
    if (!key || key.trim().length === 0) {
      return this.getSmartFallbackSMS(lead, agentName, toneFocus);
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

WRITING OBJECTIVES & GUIDELINES:
1. Warm, Friendly & Professional: Write as an approachable local retirement specialist visiting their campus.
2. Address Their Handwritten Notes: If the teacher wrote a specific question or note on their card ("${handwrittenQuestion}"), ALWAYS acknowledge it directly (e.g., "I saw your note asking about..." or "Regarding your question on...").
3. Clear Goal: Invite them for a relaxed, 15-20 minute sit-down in their classroom during their planning period (${lead.planning_period || 'planning period'}) or preferred time (${preferredTimes || 'this week'}) to walk through their personalized FRS numbers.
4. Seamlessly incorporate relevant details: Mention their years in FRS (${lead.years_in_frs || 'service'}), DROP calculation, 5% bonus, or 403(b) clarity naturally without sounding like a robotic form letter.
5. NEVER Cut Off / Complete Thought: The message MUST be complete, grammatically sound, and end with an easy-to-answer closing question.
6. Length: Concise mobile length (around 2 to 4 sentences).
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

    return this.getSmartFallbackSMS(lead, agentName, toneFocus);
  }

  /**
   * Generates a fully customized, professional fallback SMS if the AI API is unreachable.
   */
  private static getSmartFallbackSMS(
    lead: Lead,
    agentName: string = 'Alex',
    toneFocus?: string
  ): string {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const school = lead.school || 'your school';
    const planning = lead.planning_period || 'your planning period';
    const room = lead.room_number ? ` in Room ${lead.room_number}` : '';
    const hasQuestion = lead.custom_questions && lead.custom_questions.trim().length > 0;
    const hasNotes = lead.notes && lead.notes.trim().length > 0;
    const questionText = hasQuestion ? lead.custom_questions!.trim() : hasNotes ? lead.notes!.trim() : '';

    const prefSlot =
      lead.meeting_preferences && lead.meeting_preferences.length > 0
        ? lead.meeting_preferences[0].replace(/^[0-9]\.\s*/, '')
        : `during ${planning}`;

    // Case 1: Teacher wrote a specific handwritten note or question
    if (questionText) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your FRS Report Card from ${school} and saw your note regarding "${questionText}". I'll be on campus this week and would love to review your exact numbers—does ${prefSlot} work for a quick sit-down during ${planning}${room}?`;
    }

    // Case 2: High years of service / DROP focus
    if (lead.years_in_frs && parseInt(lead.years_in_frs, 10) >= 15) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your FRS Report Card from ${school} regarding your ${lead.years_in_frs} years of service and DROP options. I'll be visiting campus this week—does ${prefSlot} work for a quick sit-down during ${planning}${room}?`;
    }

    // Case 3: 5% Bonus or 403(b) focus
    if (toneFocus === 'drop_bonus_focus' || (lead.frs_interests && lead.frs_interests.some((i) => i.includes('Bonus') || i.includes('403')))) {
      return `Hi ${firstName}, this is ${agentName} with ValuTeachers. Following up on your FRS Report Card from ${school} regarding your 403(b) options and the 5% bonus. I'll be at the school this week—does ${prefSlot} work for a quick classroom sit-down during ${planning}${room}?`;
    }

    // Default friendly & professional sit-down invitation
    return `Hi ${firstName}, this is ${agentName} with ValuTeachers. I have your handwritten FRS Report Card from ${school} and wanted to help review your state pension and retirement options. I'll be on campus this week—does ${prefSlot} work for a quick sit-down during ${planning}${room}?`;
  }
}
