import { getDatabase } from './database';
import { AppSettings } from '../types';

export class SettingsRepository {
  private static defaultSettings: AppSettings = {
    gemini_api_key: '',
    user_name: 'Alex',
    agency_name: 'ValuTeachers',
    auto_advance_seconds: 3,
    auto_advance_enabled: true,
  };

  static async getSettings(): Promise<AppSettings> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );

    if (!rows || rows.length === 0) {
      return this.defaultSettings;
    }

    const settings: AppSettings = { ...this.defaultSettings };
    for (const row of rows) {
      if (row.key === 'gemini_api_key') settings.gemini_api_key = row.value;
      if (row.key === 'user_name') settings.user_name = row.value;
      if (row.key === 'agency_name') settings.agency_name = row.value;
      if (row.key === 'auto_advance_seconds') settings.auto_advance_seconds = parseInt(row.value, 10) || 3;
      if (row.key === 'auto_advance_enabled') settings.auto_advance_enabled = row.value === '1' || row.value === 'true' || (row.value as any) === true;
    }
    return settings;
  }

  static async saveSetting(key: keyof AppSettings, value: any): Promise<void> {
    const db = await getDatabase();
    const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, stringVal]
    );
  }
}
