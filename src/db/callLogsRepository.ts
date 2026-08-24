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
      sms_sent: r.sms_sent === 1,
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
    const result = await db.getFirstAsync<any>(`
      SELECT 
        COUNT(*) as totalDials,
        SUM(CASE WHEN disposition IN ('appointment_set', 'connected') THEN 1 ELSE 0 END) as appointmentCount,
        SUM(CASE WHEN disposition IN ('connected', 'spoke') THEN 1 ELSE 0 END) as connectedCount,
        SUM(CASE WHEN disposition = 'no_answer' THEN 1 ELSE 0 END) as noAnswerCount,
        SUM(CASE WHEN disposition = 'voicemail' THEN 1 ELSE 0 END) as voicemailCount,
        SUM(CASE WHEN disposition = 'bad_number' THEN 1 ELSE 0 END) as badNumberCount,
        SUM(CASE WHEN sms_sent = 1 THEN 1 ELSE 0 END) as smsSentCount
      FROM call_logs
    `);

    return {
      totalDials: result?.totalDials || 0,
      appointmentCount: result?.appointmentCount || 0,
      connectedCount: result?.connectedCount || 0,
      noAnswerCount: result?.noAnswerCount || 0,
      voicemailCount: result?.voicemailCount || 0,
      badNumberCount: result?.badNumberCount || 0,
      smsSentCount: result?.smsSentCount || 0,
    };
  }
}
