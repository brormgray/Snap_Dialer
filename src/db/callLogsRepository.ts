import { getDatabase } from './database';
import { CallLog, CallDisposition } from '../types';

export class CallLogsRepository {
  static async logCall(params: {
    leadId: string;
    listId: string;
    durationSeconds: number;
    disposition: CallDisposition;
    note?: string;
    smsSent?: boolean;
    smsBody?: string;
  }): Promise<CallLog> {
    const db = await getDatabase();
    const id = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO call_logs (id, lead_id, list_id, timestamp, duration_seconds, disposition, note, sms_sent, sms_body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.leadId,
        params.listId,
        now,
        params.durationSeconds,
        params.disposition,
        params.note || null,
        params.smsSent ? 1 : 0,
        params.smsBody || null,
      ]
    );

    return {
      id,
      lead_id: params.leadId,
      list_id: params.listId,
      timestamp: now,
      duration_seconds: params.durationSeconds,
      disposition: params.disposition,
      note: params.note,
      sms_sent: !!params.smsSent,
      sms_body: params.smsBody,
    };
  }

  static async getLogsForLead(leadId: string): Promise<CallLog[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM call_logs WHERE lead_id = ? ORDER BY timestamp DESC',
      [leadId]
    );
    return rows.map((r) => ({
      ...r,
      sms_sent: r.sms_sent === 1 || r.sms_sent === true,
    }));
  }

  static async getAllCallLogs(): Promise<CallLog[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>('SELECT * FROM call_logs ORDER BY timestamp DESC');
    return rows.map((r) => ({
      ...r,
      sms_sent: r.sms_sent === 1 || r.sms_sent === true,
    }));
  }

  static async getAnalyticsSummary(): Promise<{
    totalDials: number;
    appointmentCount: number;
    connectedCount: number;
    noAnswerCount: number;
    voicemailCount: number;
    badNumberCount: number;
    smsSentCount: number;
  }> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>('SELECT * FROM call_logs');

    let totalDials = 0;
    let appointmentCount = 0;
    let connectedCount = 0;
    let noAnswerCount = 0;
    let voicemailCount = 0;
    let badNumberCount = 0;
    let smsSentCount = 0;

    for (const r of rows) {
      if (r.sms_sent === 1 || r.sms_sent === true) {
        smsSentCount++;
      }
      // Only count as an outbound call dial if it was a voice attempt, not a standalone SMS log
      const isStandaloneSms = (r.sms_sent === 1 || r.sms_sent === true) && Number(r.duration_seconds) === 0 && Boolean(r.note && (r.note.includes('Sent persuasive ValuTeachers SMS') || r.note.includes('SMS Only')));
      const isVoiceDial = !isStandaloneSms && Boolean(r.disposition);
      if (isVoiceDial) {
        totalDials++;
        if (r.disposition === 'appointment_set') {
          appointmentCount++;
        } else if (r.disposition === 'connected' || r.disposition === 'spoke') {
          connectedCount++;
        } else if (r.disposition === 'no_answer') {
          noAnswerCount++;
        } else if (r.disposition === 'voicemail') {
          voicemailCount++;
        } else if (r.disposition === 'bad_number') {
          badNumberCount++;
        }
      }
    }

    // Fallback: If no call_logs records yet, aggregate directly from leads dispositions & attempts
    if (totalDials === 0) {
      const leads = await db.getAllAsync<any>('SELECT * FROM leads');
      for (const l of leads) {
        if (l.attempts_count && l.attempts_count > 0) {
          totalDials += Number(l.attempts_count);
        } else if (l.last_disposition && l.last_disposition !== 'pending') {
          totalDials += 1;
        }

        if (l.last_disposition === 'appointment_set') {
          appointmentCount++;
        } else if (l.last_disposition === 'connected' || l.last_disposition === 'spoke') {
          connectedCount++;
        } else if (l.last_disposition === 'no_answer') {
          noAnswerCount++;
        } else if (l.last_disposition === 'voicemail') {
          voicemailCount++;
        } else if (l.last_disposition === 'bad_number') {
          badNumberCount++;
        }
      }
    }

    return {
      totalDials,
      appointmentCount,
      connectedCount,
      noAnswerCount,
      voicemailCount,
      badNumberCount,
      smsSentCount,
    };
  }

  static async getComprehensiveAnalytics(): Promise<{
    summary: {
      totalDials: number;
      appointmentCount: number;
      connectedCount: number;
      noAnswerCount: number;
      voicemailCount: number;
      badNumberCount: number;
      smsSentCount: number;
      dropInquiriesCount: number;
    };
    ratios: {
      contactRate: number;
      dialToApptRate: number;
      convToApptRate: number;
      dialsPerSitDown: number;
    };
    weekly: {
      dialsThisWeek: number;
      dialsLastWeek: number;
      apptsThisWeek: number;
      apptsLastWeek: number;
    };
    hourlyStats: {
      hour: number;
      label: string;
      dials: number;
      connected: number;
      contactRate: number;
    }[];
  }> {
    const db = await getDatabase();
    const [rows, leads] = await Promise.all([
      db.getAllAsync<any>('SELECT * FROM call_logs ORDER BY timestamp DESC'),
      db.getAllAsync<any>('SELECT * FROM leads'),
    ]);

    let totalDials = 0;
    let appointmentCount = 0;
    let connectedCount = 0;
    let noAnswerCount = 0;
    let voicemailCount = 0;
    let badNumberCount = 0;
    let smsSentCount = 0;

    // Time boundaries for weekly cohorts
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
    const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);

    let dialsThisWeek = 0;
    let dialsLastWeek = 0;
    let apptsThisWeek = 0;
    let apptsLastWeek = 0;

    // Hourly buckets: 7 AM to 6 PM (7 through 18)
    const hourlyMap = new Map<number, { dials: number; connected: number }>();
    for (let h = 7; h <= 18; h++) {
      hourlyMap.set(h, { dials: 0, connected: 0 });
    }

    for (const r of rows) {
      if (r.sms_sent === 1 || r.sms_sent === true) {
        smsSentCount++;
      }
      const isStandaloneSms = (r.sms_sent === 1 || r.sms_sent === true) && Number(r.duration_seconds) === 0 && Boolean(r.note && (r.note.includes('Sent persuasive ValuTeachers SMS') || r.note.includes('SMS Only')));
      const isVoiceDial = !isStandaloneSms && Boolean(r.disposition);
      if (isVoiceDial) {
        totalDials++;
        const isAppt = r.disposition === 'appointment_set';
        const isSpoke = r.disposition === 'connected' || r.disposition === 'spoke';

        if (isAppt) appointmentCount++;
        else if (isSpoke) connectedCount++;
        else if (r.disposition === 'no_answer') noAnswerCount++;
        else if (r.disposition === 'voicemail') voicemailCount++;
        else if (r.disposition === 'bad_number') badNumberCount++;

        // Weekly attribution
        const logDate = r.timestamp ? new Date(r.timestamp) : null;
        if (logDate && !isNaN(logDate.getTime())) {
          if (logDate >= startOfThisWeek) {
            dialsThisWeek++;
            if (isAppt) apptsThisWeek++;
          } else if (logDate >= startOfLastWeek && logDate < startOfThisWeek) {
            dialsLastWeek++;
            if (isAppt) apptsLastWeek++;
          }

          // Hourly attribution
          const hour = logDate.getHours();
          if (hourlyMap.has(hour)) {
            const hStats = hourlyMap.get(hour)!;
            hStats.dials++;
            if (isAppt || isSpoke) hStats.connected++;
          }
        }
      }
    }

    // Fallback: If no call_logs records yet, aggregate directly from leads
    if (totalDials === 0) {
      for (const l of leads) {
        if (l.attempts_count && l.attempts_count > 0) {
          totalDials += Number(l.attempts_count);
        } else if (l.last_disposition && l.last_disposition !== 'pending') {
          totalDials += 1;
        }

        if (l.last_disposition === 'appointment_set') {
          appointmentCount++;
          apptsThisWeek++;
        } else if (l.last_disposition === 'connected' || l.last_disposition === 'spoke') {
          connectedCount++;
        } else if (l.last_disposition === 'no_answer') {
          noAnswerCount++;
        } else if (l.last_disposition === 'voicemail') {
          voicemailCount++;
        } else if (l.last_disposition === 'bad_number') {
          badNumberCount++;
        }
      }
      dialsThisWeek = totalDials;
    }

    // Count pension / DROP inquiries among leads
    let dropInquiriesCount = 0;
    for (const l of leads) {
      const interests = Array.isArray(l.frs_interests) ? l.frs_interests : [];
      const hasDropInterest = interests.some((i: string) => /drop|pension|retirement|estimate/i.test(i));
      const hasDropQuestion = l.custom_questions && /drop|pension|retire|estimate/i.test(l.custom_questions);
      if (hasDropInterest || hasDropQuestion || (l.years_in_frs && Number(l.years_in_frs) >= 20)) {
        dropInquiriesCount++;
      }
    }

    // Calculate conversion velocity ratios
    const contactRate = totalDials > 0 ? Math.round(((appointmentCount + connectedCount) / totalDials) * 100) : 0;
    const dialToApptRate = totalDials > 0 ? Math.round((appointmentCount / totalDials) * 100) : 0;
    const conversations = appointmentCount + connectedCount;
    const convToApptRate = conversations > 0 ? Math.round((appointmentCount / conversations) * 100) : 0;
    const dialsPerSitDown = appointmentCount > 0 ? Math.round((totalDials / appointmentCount) * 10) / 10 : 0;

    // Build sorted hourly stats array
    const hourlyStats = Array.from(hourlyMap.entries()).map(([hour, data]) => {
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      return {
        hour,
        label: `${displayHour} ${ampm}`,
        dials: data.dials,
        connected: data.connected,
        contactRate: data.dials > 0 ? Math.round((data.connected / data.dials) * 100) : 0,
      };
    });

    return {
      summary: {
        totalDials,
        appointmentCount,
        connectedCount,
        noAnswerCount,
        voicemailCount,
        badNumberCount,
        smsSentCount,
        dropInquiriesCount,
      },
      ratios: {
        contactRate,
        dialToApptRate,
        convToApptRate,
        dialsPerSitDown,
      },
      weekly: {
        dialsThisWeek,
        dialsLastWeek,
        apptsThisWeek,
        apptsLastWeek,
      },
      hourlyStats,
    };
  }
}
