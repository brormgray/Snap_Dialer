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
      const isVoiceDial = !r.sms_sent || Number(r.duration_seconds) > 0 || (r.note && r.note !== 'Sent persuasive ValuTeachers SMS');
      if (isVoiceDial && r.disposition) {
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
}
