import { Lead, CallLog } from '../types';
import { SettingsRepository } from '../db/settingsRepository';
import { CallLogsRepository } from '../db/callLogsRepository';
import { GeminiModelService } from './geminiModelService';
import { DateTimeAwareService, RelativeTimeInfo } from './dateTimeAwareService';
import { FrsKnowledgeBank, FrsWisdomSeed, FrsTopicKey } from '../data/frsKnowledgeBank';

export type SmsToneFocus =
  | 'meeting_confirmation'
  | 'unanswered_followup'
  | 'drop_bonus_focus'
  | 'planning_period'
  | 'address_question'
  | 'drip_sprint'
  | 'sprint_summary'
  | 'sprint_roadblock'
  | 'drip_bridge'
  | 'bridge_proof'
  | 'bridge_reset'
  | 'bridge_pause'
  | 'drip_monthly'
  | 'monthly_insight'
  | 'drip_client'
  | 'client_check'
  | 'annual_review'
  | (string & {});

export class AiSmsService {
  /**
   * Generates a clean, warm, friendly yet professional personalized SMS message for Florida educators.
   * Fully time-and-date aware: accurately distinguishes appointments scheduled for today vs tomorrow vs later this week,
   * ensuring that texts never erroneously claim 'later this week' for appointments occurring today.
   * Enriched with FRS Wisdom Seeding and Conversation Thread Continuity.
   */
  static async generatePersuasiveSMS(
    lead: Lead,
    currentDisposition?: string,
    providedApiKey?: string,
    toneFocus?: SmsToneFocus,
    refDate: Date = new Date(),
    frsTopicKey?: FrsTopicKey
  ): Promise<string> {
    const settings = await SettingsRepository.getSettings();
    const agentName = settings.user_name || 'Alex';
    const agencyName = (lead.company || settings.agency_name || '').trim();
    let key = providedApiKey || settings.gemini_api_key;

    // If no API key, return a fully dynamic, complete tailored fallback
    if (!key || key.trim().length === 0) {
      return this.getSmartFallbackSMS(lead, agentName, toneFocus, refDate, agencyName, frsTopicKey);
    }

    try {
      const history = await CallLogsRepository.getLogsForLead(lead.id);

      const historySummary = history
        .slice(0, 3)
        .map(
          (h) =>
            `- Outreach on ${new Date(h.timestamp).toLocaleDateString()}: "${h.disposition}"${
              h.note ? ` (Note: ${h.note})` : ''
            }${h.sms_body ? ` [Sent SMS: "${h.sms_body}"]` : ''}`
        )
        .join('\n');

      // Thread Continuity Extraction
      const previousSms = history.find((h) => h.sms_body && h.sms_body.trim().length > 0);
      const lastLog = history[0];
      const wrapUpNotes = lead.appointment_notes || lastLog?.note || '';

      let threadContinuitySection = '';
      if (previousSms?.sms_body || wrapUpNotes || lead.appointment_outcome) {
        threadContinuitySection = `
CONVERSATION & THREAD CONTINUITY CONTEXT:
- Previous SMS Sent: ${previousSms?.sms_body ? `"${previousSms.sms_body}"` : 'None yet'}
- Last Outreach / Sit-Down Outcome: "${lead.appointment_outcome || lastLog?.disposition || currentDisposition || 'Outreach'}"
- Wrap-up / Interaction Notes: "${wrapUpNotes || 'None'}"
- Thread Continuity Directives:
  * You are following up on this ongoing dialogue. Speak warmly and continuously, never like a stranger or cold spam bot.
  * If a previous SMS is noted, subtly advance the conversation without repeating the exact text.
  * If wrap-up notes indicate a topic or hesitation (e.g. spouse review, busy schedule, DROP date question), acknowledge it with reassurance.
`;
      }

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
- Suggested Contact Window: ${suggestedOutreach.timeframePhrase} (${suggestedOutreach.planningSuggestion})
- Directive: Suggest "${suggestedOutreach.timeframePhrase}". Do NOT propose "this week" or "tomorrow" if today is Friday or the weekend.
`;
      }

      let dripDirectives = '';
      if (toneFocus === 'drip_sprint' || toneFocus === 'sprint_summary' || toneFocus === 'sprint_roadblock') {
        dripDirectives = `
DRIP SPRINT DIRECTIVES (24-48h POST-APPOINTMENT FOLLOW-UP):
- Goal: Reduce friction and paperwork terror. Summarize what was discussed in the sit-down.
- Keep the next step effortless. Ask a single low-commitment question (e.g. "Did the numbers make sense, or did any questions pop up?") or offer to run down transfer paperwork for them.
- Do NOT re-sell the entire plan.
`;
      } else if (toneFocus === 'drip_bridge' || toneFocus === 'bridge_proof' || toneFocus === 'bridge_reset' || toneFocus === 'bridge_pause') {
        dripDirectives = `
DRIP BRIDGE DIRECTIVES (WEEKS 2-6 POST-APPOINTMENT CADENCE):
- Goal: Overcome status-quo inertia without being pushy or nagging.
- Use social proof, highlight the compound cost of delay, use a short 9-word reset ("Are you still looking to optimize your retirement options this year?"), or offer permission to pause.
- Keep it concise, friendly, and low-pressure.
`;
      } else if (toneFocus === 'drip_monthly' || toneFocus === 'monthly_insight') {
        dripDirectives = `
DRIP MONTHLY AUTHORITY DIRECTIVES (LONG-TERM VALUE):
- Goal: Build compounding trust and authority.
- High-value educational insight (market downside protection 0% floor, pre-tax savings, or retirement milestones).
- Subtle P.S. pivot: Conclude with a warm, low-key P.S. offering to recalculate their numbers or catch up.
`;
      } else if (toneFocus === 'drip_client' || toneFocus === 'client_check' || toneFocus === 'annual_review') {
        dripDirectives = `
CLIENT RETENTION & SERVICING DIRECTIVES:
- Goal: Policy hygiene, peace of mind, and uncovering outside/spouse assets.
- Confirm payroll or monthly savings deduction is smooth, remind them of 0% floor security, check beneficiaries, or offer to review an outside account / spouse 401(k) at no charge.
`;
      }

      const isFrs = lead.is_frs !== false;
      const agencyIntro = agencyName ? ` with ${agencyName}` : '';
      const repLabel = agencyName ? `${agentName} (${agencyName})` : agentName;

      const roleDirective = isFrs
        ? `You are a warm, professional, and consultative educational retirement advisor${agencyIntro} in Florida.
You are writing a personalized SMS text message to a Florida public school teacher who requested an in-person retirement planning session.`
        : `You are a warm, professional, and consultative retirement advisor${agencyIntro}.
You are writing a personalized SMS text message to a private client or prospect requesting a retirement planning consultation.`;

      const wisdomSeed = isFrs
        ? FrsKnowledgeBank.recommendWisdomSeed(lead, frsTopicKey)
        : null;

      const cleanYears = lead.years_in_frs
        ? String(lead.years_in_frs).trim().replace(/\s*years?(?:\s+of\s+service)?$/i, '')
        : '';
      const cleanRoom = lead.room_number
        ? String(lead.room_number).trim().replace(/^room\s+/i, '')
        : '';

      const frsWisdomSection = wisdomSeed
        ? `
FRS WISDOM & VALUE SEED (CRITICAL DIRECTIVE):
- Featured FRS Topic: ${wisdomSeed.title} (${wisdomSeed.shortLabel})
- FRS Law / Formula Fact: "${wisdomSeed.factualInsight}"
- Key Phrasing Guide: "${wisdomSeed.samplePhrasing}"
- Value Seeding Directive: Subtly weave in this high-value FRS insight. Frame it consultatively as a helpful tip or insight tailored to their ${
            cleanYears ? `${cleanYears} years of service` : 'retirement timeline'
          }. Plant seeds of trust, authority, and confidence.
`
        : '';

      const recipientDetails = isFrs
        ? `EDUCATOR DETAILS (FROM SCANNED REPORT CARD):
- Educator Name: ${lead.name}
- School / Campus: ${lead.school || 'your school'}
- Classroom / Room #: ${cleanRoom ? `Room ${cleanRoom}` : 'Classroom'}
- Planning Period / Time: ${lead.planning_period || 'planning period'}
- Years in Florida Retirement System (FRS): ${cleanYears ? `${cleanYears} years` : 'Not specified'}
- FRS Knowledge Level: "${lead.frs_knowledge || 'Moderate'}"
- Current Annual Salary: ${lead.annual_salary ? `$${lead.annual_salary.replace(/^\$/, '')}` : 'Not listed'}
- Present 403(b) Contribution: ${lead.present_403b_contribution ? `$${lead.present_403b_contribution.replace(/^\$/, '')}` : 'None listed'}
- Specific Needs / Topics Checked: ${interests || 'FRS Pension calculations, DROP, and 403(b) review'}
- Handwritten Question / Note on Card: ${handwrittenQuestion ? `"${handwrittenQuestion}"` : 'None'}
- Special File Notes: ${agentNotes ? `"${agentNotes}"` : 'None'}
- Requested Availability: ${preferredTimes || 'During planning period or after school'}`
        : `PROSPECT / CLIENT DETAILS:
- Client Name: ${lead.name}
- Current Salary / Contribution: ${lead.annual_salary || lead.present_403b_contribution || 'Not specified'}
- Special Notes / Interests: ${handwrittenQuestion || agentNotes || 'Retirement review, 401(k)/IRA rollover, or downside protection'}
- Requested Availability: ${preferredTimes || 'Flexible'}`;

      const frsConstraint = isFrs
        ? `4. Seamlessly incorporate relevant details: Mention their years in FRS (${cleanYears || 'service'}), DROP calculation, 5% bonus, or 403(b) clarity naturally without sounding like a robotic form letter.`
        : `4. CRITICAL NON-FRS RULE: The recipient is a Non-FRS individual. Do NOT mention Florida Retirement System (FRS), state pension multiplier, DROP, classroom room numbers, or school districts. Focus on general retirement analysis, 401(k)/IRA reviews, rollovers, 0% downside floor annuities, or tax advantages.`;

      const prompt = `
${roleDirective}

${recipientDetails}
- Call Status: ${currentDisposition || 'Outreach'}
- Contact History:
${historySummary || 'First outreach.'}
- Representative Name: ${repLabel}
${toneFocus ? `- Tone / Focus Preference: ${toneFocus.replace(/_/g, ' ')}` : ''}
${temporalPromptSection}
${threadContinuitySection}
${frsWisdomSection}
${dripDirectives}

WRITING OBJECTIVES & GUIDELINES:
1. Warm, Friendly & Professional: Approachable, high-trust retirement specialist.
2. Address Their Notes: If the client wrote a specific question or note ("${handwrittenQuestion}"), acknowledge it naturally.
3. Accurate Goal & Time Awareness:
   - If confirming an upcoming appointment: Confirm their exact sit-down window (${
     hasAppt && relInfo ? relInfo.fullRelativePhrase : 'scheduled consultation'
   }).
   - If proposing a new sit-down: Invite them for a relaxed 15-20 minute review ${suggestedOutreach.timeframePhrase}.
${frsConstraint}
5. NEVER Cut Off / Complete Thought: The message MUST be complete, grammatically sound, and end cleanly.
6. Length: Concise mobile length (around 2 to 3 sentences).
7. Format: Output ONLY the plain SMS text. Do NOT include quotation marks, markdown bolding, or intro/outro explanations.
`;

      const candidateModels = await GeminiModelService.getActiveModels(key);

      for (const model of candidateModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
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
              clearTimeout(timeoutId);
              return text
                .replace(/^["']|["']$/g, '')
                .replace(/[ \t]{2,}/g, ' ')
                .replace(/\s+([.,!?:;])/g, '$1')
                .trim();
            }
          }
        } catch {
          // Attempt next model
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (e) {
      console.warn('AI SMS generation failed, using intelligent fallback:', e);
    }

    return this.getSmartFallbackSMS(lead, agentName, toneFocus, refDate, agencyName, frsTopicKey);
  }

  /**
   * Generates a fully customized, professional fallback SMS if the AI API is unreachable.
   * Completely time-and-date aware for today, tomorrow, this week, or future appointments.
   * Dynamically seeds FRS wisdom and report card context.
   */
  static getSmartFallbackSMS(
    lead: Lead,
    agentName: string = 'Alex',
    toneFocus?: string,
    refDate: Date = new Date(),
    agencyName?: string,
    frsTopicKey?: FrsTopicKey
  ): string {
    const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
    const school = lead.school || 'your school';
    const planning = lead.planning_period ? ` during ${lead.planning_period}` : ' during your planning period';
    const cleanRoomStr = lead.room_number ? String(lead.room_number).trim().replace(/^room\s+/i, '') : '';
    const room = cleanRoomStr ? ` in Room ${cleanRoomStr}` : '';
    const cleanYearsStr = lead.years_in_frs
      ? String(lead.years_in_frs).trim().replace(/\s*years?(?:\s+of\s+service)?$/i, '')
      : '';
    const hasQuestion = lead.custom_questions && lead.custom_questions.trim().length > 0;
    const hasNotes = lead.notes && lead.notes.trim().length > 0;
    const questionText = hasQuestion ? lead.custom_questions!.trim() : hasNotes ? lead.notes!.trim() : '';

    const company = (lead.company || agencyName || '').trim();
    const withCompany = company ? ` with ${company}` : '';
    const atCompany = company ? `, ${company}` : '';
    const isFrs = lead.is_frs !== false;

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
      if (isFrs) {
        if (rel.isToday && !rel.isPast) {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Looking forward to our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your FRS numbers! See you soon.`;
        }
        if (rel.isTomorrow) {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Confirming our sit-down tomorrow at ${rel.timeStr}${room}${planning} to review your state pension and DROP numbers. Looking forward to connecting!`;
        }
        if (rel.category === 'this_week') {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Confirming our sit-down ${rel.shortRelative} at ${rel.timeStr}${room}${planning} to review your personalized FRS report. Looking forward to meeting!`;
        }
        if (rel.category === 'next_week' || rel.category === 'future_date') {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Confirming our sit-down on ${rel.fullRelativePhrase}${room}${planning} to review your FRS options. Looking forward to connecting!`;
        }
        if (rel.isPast) {
          return `Hi ${firstName}, this is ${agentName}${withCompany} following up on our sit-down ${rel.shortRelative}${room}. Thank you for your time reviewing your FRS options—please reach out if you have any questions!`;
        }
      } else {
        if (rel.isToday && !rel.isPast) {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Looking forward to our sit-down ${rel.shortRelative} at ${rel.timeStr} to review your retirement options! See you soon.`;
        }
        if (rel.isTomorrow) {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Confirming our sit-down tomorrow at ${rel.timeStr} to review your retirement accounts and savings roadmap. Looking forward to connecting!`;
        }
        if (rel.category === 'this_week' || rel.category === 'next_week' || rel.category === 'future_date') {
          return `Hi ${firstName}, this is ${agentName}${withCompany}. Confirming our sit-down on ${rel.fullRelativePhrase} to review your retirement options. Looking forward to connecting!`;
        }
        if (rel.isPast) {
          return `Hi ${firstName}, this is ${agentName}${withCompany} following up on our meeting. Thank you for your time reviewing your retirement options—please reach out if any questions come up!`;
        }
      }
    }

    // Drip Cadence Fallback Cases
    if (toneFocus === 'drip_sprint' || toneFocus === 'sprint_summary') {
      return isFrs
        ? `Hi ${firstName}, this is ${agentName}${withCompany}. Thank you for taking time to sit down with me at ${school}! Did the numbers we put together make sense, or did any questions pop up when you reflected on it?`
        : `Hi ${firstName}, this is ${agentName}${withCompany}. Thank you for taking time to sit down with me! Did the numbers and retirement options we discussed make sense, or did any questions pop up when you reflected on it?`;
    }
    if (toneFocus === 'sprint_roadblock') {
      return isFrs
        ? `Hi ${firstName}, ${agentName} here. Usually the hardest part of finalizing your FRS & 403(b) paperwork is tracking down old statements or logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!`
        : `Hi ${firstName}, ${agentName} here. Usually the hardest part of finalizing your retirement rollover or savings paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!`;
    }
    if (toneFocus === 'drip_bridge' || toneFocus === 'bridge_proof') {
      return isFrs
        ? `Hi ${firstName}, this is ${agentName}${withCompany}. A teacher I worked with recently at ${school} had the exact same question about protecting their DROP funds. Would 10 mins during planning work to look at bridging that gap?`
        : `Hi ${firstName}, this is ${agentName}${withCompany}. A client I worked with recently had the exact same question about protecting their savings from market losses while keeping upside potential. Would 10 mins work to look at bridging that gap?`;
    }
    if (toneFocus === 'bridge_reset') {
      return isFrs
        ? `Hi ${firstName}, are you still looking to optimize your FRS pension & retirement options this semester? - ${agentName}${atCompany}`
        : `Hi ${firstName}, are you still looking to optimize your retirement and savings options this year? - ${agentName}${atCompany}`;
    }
    if (toneFocus === 'bridge_pause') {
      return isFrs
        ? `Hi ${firstName}, I know how busy things get at school. Should we hit pause on your retirement review until next term, or did you still want to get this off your plate this month? - ${agentName}`
        : `Hi ${firstName}, I know how busy life gets. Should we hit pause on your retirement review for now, or did you still want to get this off your plate this month? - ${agentName}`;
    }
    if (toneFocus === 'drip_monthly' || toneFocus === 'monthly_insight') {
      if (isFrs) {
        if (frsTopicKey === 'drop_expansion') {
          return `Hi ${firstName}, ${agentName}${withCompany}. Quick FRS update: under SB 7024, DROP is now 8 years instead of 5 for teachers—that extra 3 years can add $80k+ to your guaranteed lump sum. PS: Happy to compare your 5 vs 8-year numbers during ${lead.planning_period || 'planning'}!`;
        }
        if (frsTopicKey === 'sick_leave_rollover') {
          return `Hi ${firstName}, ${agentName}${withCompany}. Quick FRS tip: rolling terminal sick leave into an approved tax-sheltered vehicle upon retirement prevents thousands in lost taxes compared to a cash payout. PS: Can review your numbers anytime during ${lead.planning_period || 'planning'}!`;
        }
        if (frsTopicKey === 'pretax_takehome') {
          return `Hi ${firstName}, ${agentName}${withCompany}. Quick paycheck tip: because 403(b) contributions are pre-tax, putting $100/mo into retirement typically only reduces your take-home pay by about $75. PS: Happy to run your take-home numbers during ${lead.planning_period || 'planning'}!`;
        }
        if (frsTopicKey === 'downside_floor') {
          return `Hi ${firstName}, with market swings in the headlines, a quick reminder: educator retirement annuities feature a guaranteed 0% downside floor with growth tied to market gains. PS: Happy to compare your current savings options anytime during ${lead.planning_period || 'planning'}!`;
        }
        if (frsTopicKey === 'second_election') {
          return `Hi ${firstName}, ${agentName}${withCompany}. Did you know Florida gives educators a one-time "Second Election" to switch between the Pension and Investment plans if your career horizon changes? PS: Happy to review your options during ${lead.planning_period || 'planning'}!`;
        }
        if (frsTopicKey === 'drop_tax_trap') {
          return `Hi ${firstName}, ${agentName}${withCompany}. Quick FRS heads-up: cashing out DROP funds triggers an automatic 20% federal tax withholding, but rolling into an educator vehicle protects 100% of your lump sum. PS: Let's catch up during ${lead.planning_period || 'planning'}!`;
        }
        return `Hi ${firstName}, ${agentName}${withCompany}. Quick reminder: under FRS Pension, 25 years at 1.6% replaces only 40% of your income. PS: Let me know if you want to recalculate your take-home pay during ${lead.planning_period || 'planning'}!`;
      }
      return `Hi ${firstName}, ${agentName}${withCompany}. Quick retirement fact: relying solely on Social Security replaces only about 40% of pre-retirement earnings. PS: Let me know if you want to recalculate your optimal target in a 5-min check-in!`;
    }
    if (toneFocus === 'drip_client' || toneFocus === 'client_check') {
      return isFrs
        ? `Hi ${firstName}, ${agentName} checking in! Just verifying that your retirement deductions are running smoothly on your district pay stub. Let me know if you'd like a quick review of any outside or spouse accounts as well!`
        : `Hi ${firstName}, ${agentName} checking in! Just verifying that your retirement contributions or transfers are running smoothly. Let me know if you'd like a quick review of any outside or spouse accounts as well!`;
    }
    if (toneFocus === 'annual_review') {
      return isFrs
        ? `Hi ${firstName}, this is ${agentName}${withCompany}. Your policy anniversary is approaching—it's time for our annual review to examine your gains and align with your FRS milestones. When is a good time during your planning period at ${school} to meet?`
        : `Hi ${firstName}, this is ${agentName}${withCompany}. Your policy anniversary is approaching—it's time for our annual review to examine your gains and ensure your plan matches your retirement goals. When is a good time for a quick review?`;
    }

    const hasExplicitMeetingPref = Boolean(lead.meeting_preferences && lead.meeting_preferences.length > 0);
    const prefSlot = hasExplicitMeetingPref
      ? lead.meeting_preferences![0].replace(/^[0-9]\.\s*/, '')
      : `during ${lead.planning_period || 'planning'}`;
    const sitDownSuffix = hasExplicitMeetingPref && !prefSlot.toLowerCase().includes('period') && !prefSlot.toLowerCase().includes('planning')
      ? `${planning}${room}`
      : `${room}`;

    const outreachPhrase = suggestedOutreach.timeframePhrase; // e.g. "this week", "early next week"

    if (toneFocus === 'unanswered_followup') {
      if (!isFrs) {
        return `Hi ${firstName}, this is ${agentName}${withCompany}! I just tried giving you a quick call regarding your retirement planning and rollover options. Feel free to call me back, or let me know if a quick 15-minute consultation works for you ${outreachPhrase}!`;
      }
      return `Hi ${firstName}, this is ${agentName}${withCompany}! I just tried giving you a quick call regarding your FRS Report Card from ${school}. Feel free to call me back, or text me a good time ${prefSlot} to connect!`;
    }

    if (!isFrs) {
      if (questionText) {
        return `Hi ${firstName}, this is ${agentName}${withCompany}. Following up on your note regarding "${questionText}". Would a quick 15-minute call or sit-down work for you ${outreachPhrase}?`;
      }
      return `Hi ${firstName}, this is ${agentName}${withCompany}. Following up on your request regarding retirement planning and rollover options. Would a quick 15-minute consultation work for you ${outreachPhrase}?`;
    }

    // Case 1: Teacher wrote a specific handwritten note or question
    if (questionText) {
      return `Hi ${firstName}, this is ${agentName}${withCompany}. I have your FRS Report Card from ${school} and saw your note regarding "${questionText}". I'll be on campus ${outreachPhrase} and would love to review your exact numbers—does ${prefSlot} work for a quick sit-down${sitDownSuffix}?`;
    }

    // Case 2: High years of service / DROP focus
    if (cleanYearsStr && parseInt(cleanYearsStr, 10) >= 15) {
      return `Hi ${firstName}, this is ${agentName}${withCompany}. I have your FRS Report Card from ${school} regarding your ${cleanYearsStr} years of service and DROP options. I'll be visiting campus ${outreachPhrase}—does ${prefSlot} work for a quick sit-down${sitDownSuffix}?`;
    }

    // Case 3: 5% Bonus or 403(b) focus
    if (
      toneFocus === 'drop_bonus_focus' ||
      (lead.frs_interests && lead.frs_interests.some((i) => i.includes('Bonus') || i.includes('403')))
    ) {
      return `Hi ${firstName}, this is ${agentName}${withCompany}. Following up on your FRS Report Card from ${school} regarding your 403(b) options and the 5% bonus. I'll be at the school ${outreachPhrase}—does ${prefSlot} work for a quick classroom sit-down${sitDownSuffix}?`;
    }

    // Default friendly & professional sit-down invitation
    return `Hi ${firstName}, this is ${agentName}${withCompany}. I have your handwritten FRS Report Card from ${school} and wanted to help review your state pension and retirement options. I'll be on campus ${outreachPhrase}—does ${prefSlot} work for a quick sit-down${sitDownSuffix}?`;
  }
}
