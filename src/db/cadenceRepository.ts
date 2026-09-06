import { getDatabase } from './database';
import { CadenceRule, SMSTemplate } from '../types';

export class CadenceRepository {
  static async getAllRules(): Promise<CadenceRule[]> {
    const db = await getDatabase();
    return await db.getAllAsync<CadenceRule>(
      'SELECT * FROM cadence_rules ORDER BY step_number ASC'
    );
  }

  static async getRuleForStep(stepNumber: number): Promise<CadenceRule | null> {
    const db = await getDatabase();
    return await db.getFirstAsync<CadenceRule>(
      'SELECT * FROM cadence_rules WHERE step_number = ?',
      [stepNumber]
    );
  }

  static async updateRule(
    id: string,
    actionType: 'call_only' | 'call_and_sms' | 'sms_only',
    smsTemplateId?: string | null
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE cadence_rules SET action_type = ?, sms_template_id = ? WHERE id = ?',
      [actionType, smsTemplateId || null, id]
    );
  }

  static async getAllTemplates(): Promise<SMSTemplate[]> {
    const db = await getDatabase();
    return await db.getAllAsync<SMSTemplate>('SELECT * FROM sms_templates ORDER BY id ASC');
  }

  static async getTemplateById(id: string): Promise<SMSTemplate | null> {
    const db = await getDatabase();
    return await db.getFirstAsync<SMSTemplate>(
      'SELECT * FROM sms_templates WHERE id = ?',
      [id]
    );
  }

  static async saveTemplate(template: SMSTemplate): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO sms_templates (id, title, body) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body`,
      [template.id, template.title, template.body]
    );
  }

  static async seedDripTemplatesIfMissing(): Promise<void> {
    const db = await getDatabase();
    const { ALL_DRIP_TEMPLATES } = await import('../data/dripTemplates');
    for (const tpl of ALL_DRIP_TEMPLATES) {
      const existing = await db.getFirstAsync<SMSTemplate>(
        'SELECT * FROM sms_templates WHERE id = ?',
        [tpl.id]
      );
      if (!existing) {
        await this.saveTemplate(tpl);
      }
    }
  }
}
