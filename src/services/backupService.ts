import { Share, Alert, Platform } from 'react-native';
import { getDatabase } from '../db/database';
import { LeadsRepository } from '../db/leadsRepository';
import { SettingsRepository } from '../db/settingsRepository';
import { CadenceRepository } from '../db/cadenceRepository';

export interface RestoreResult {
  success: boolean;
  leadCount: number;
  message: string;
}

export class BackupService {
  /**
   * Generates a complete database snapshot payload.
   */
  static async generateBackupPayload(): Promise<any> {
    const db = await getDatabase();
    const lists = await LeadsRepository.getAllLists();
    const leads = await db.getAllAsync('SELECT * FROM leads');
    const callLogs = await db.getAllAsync('SELECT * FROM call_logs');
    const cadenceRules = await CadenceRepository.getAllRules();
    const smsTemplates = await CadenceRepository.getAllTemplates();
    const settings = await SettingsRepository.getSettings();

    return {
      appName: 'SnapDialer',
      target: 'SnapDialer Pipeline',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      leadCount: leads.length,
      data: {
        lists,
        leads,
        callLogs,
        cadenceRules,
        smsTemplates,
        settings,
      },
    };
  }

  /**
   * Exports full backup to local storage, Files app, iCloud Drive, Google Drive, or email share.
   */
  static async exportFullBackup(): Promise<boolean> {
    try {
      const payload = await this.generateBackupPayload();
      const jsonString = JSON.stringify(payload, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `SnapDialer_Backup_${dateStr}.json`;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const file = new File([blob], filename, { type: 'application/json' });

        // If Web Share API with files is supported (e.g. mobile Safari / Chrome)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'SnapDialer Backup',
              text: `SnapDialer Database Backup (${payload.leadCount} leads) - ${dateStr}`,
              files: [file],
            });
            return true;
          } catch (shareErr: any) {
            if (shareErr?.name === 'AbortError') return true; // User cancelled share modal
          }
        }

        // Fallback: Trigger direct file download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      }

      await Share.share({
        title: filename,
        message: jsonString,
      });

      return true;
    } catch (e) {
      console.error('Backup export failed:', e);
      Alert.alert('Backup Error', 'Failed to generate cloud backup snapshot.');
      return false;
    }
  }

  /**
   * Triggers a file browser picker (iCloud Drive, Google Drive, OneDrive, Files app, or local filesystem)
   * to select and restore a .json backup file.
   */
  static async importBackupFromFile(overwrite: boolean = false): Promise<RestoreResult> {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return new Promise<RestoreResult>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) {
            resolve({ success: false, leadCount: 0, message: 'No file selected.' });
            return;
          }

          const reader = new FileReader();
          reader.onload = async (event: any) => {
            try {
              const content = event.target.result;
              const result = await BackupService.restoreBackupFromJson(content, overwrite);
              resolve(result);
            } catch (err: any) {
              resolve({
                success: false,
                leadCount: 0,
                message: err?.message || 'Failed to parse selected backup file.',
              });
            }
          };

          reader.onerror = () => {
            resolve({ success: false, leadCount: 0, message: 'Error reading backup file.' });
          };

          reader.readAsText(file);
        };

        input.click();
      });
    }

    return {
      success: false,
      leadCount: 0,
      message: 'File picker is currently available via the web browser/PWA interface.',
    };
  }

  /**
   * Restores a backup from a JSON string with Merge or Overwrite behavior.
   */
  static async restoreBackupFromJson(
    jsonString: string,
    overwrite: boolean = false
  ): Promise<RestoreResult> {
    try {
      const parsed = JSON.parse(jsonString);
      const backupData = parsed.data || parsed;

      const leadsToImport = Array.isArray(backupData.leads) ? backupData.leads : [];
      const listsToImport = Array.isArray(backupData.lists) ? backupData.lists : [];
      const callLogsToImport = Array.isArray(backupData.callLogs || backupData.call_logs)
        ? backupData.callLogs || backupData.call_logs
        : [];
      const smsTemplatesToImport = Array.isArray(backupData.smsTemplates || backupData.sms_templates)
        ? backupData.smsTemplates || backupData.sms_templates
        : [];
      const cadenceRulesToImport = Array.isArray(backupData.cadenceRules || backupData.cadence_rules)
        ? backupData.cadenceRules || backupData.cadence_rules
        : [];
      const settingsToImport = Array.isArray(backupData.settings) ? backupData.settings : [];

      if (leadsToImport.length === 0 && listsToImport.length === 0) {
        return {
          success: false,
          leadCount: 0,
          message: 'The selected backup file did not contain any valid lead records.',
        };
      }

      // Direct Web Storage Synchronization for PWA
      if (typeof window !== 'undefined' && window.localStorage) {
        let existingData: any = {};
        const saved = localStorage.getItem('snap_dialer_valuteachers_data');
        if (saved && !overwrite) {
          try {
            existingData = JSON.parse(saved);
          } catch {
            existingData = {};
          }
        }

        const existingLeads = Array.isArray(existingData.leads) ? existingData.leads : [];
        const existingLists = Array.isArray(existingData.lists) ? existingData.lists : [];
        const existingLogs = Array.isArray(existingData.call_logs) ? existingData.call_logs : [];
        const existingTemplates = Array.isArray(existingData.sms_templates) ? existingData.sms_templates : [];
        const existingRules = Array.isArray(existingData.cadence_rules) ? existingData.cadence_rules : [];
        const existingSettings = Array.isArray(existingData.settings) ? existingData.settings : [];

        // Merge or replace
        const mergedLeads = overwrite ? [...leadsToImport] : [...existingLeads];
        if (!overwrite) {
          for (const newLead of leadsToImport) {
            const idx = mergedLeads.findIndex((l: any) => l.id === newLead.id || (l.phone && l.phone === newLead.phone));
            if (idx >= 0) {
              mergedLeads[idx] = { ...mergedLeads[idx], ...newLead };
            } else {
              mergedLeads.push(newLead);
            }
          }
        }

        const mergedLists = overwrite ? [...listsToImport] : [...existingLists];
        if (!overwrite) {
          for (const newList of listsToImport) {
            const idx = mergedLists.findIndex((l: any) => l.id === newList.id);
            if (idx >= 0) {
              mergedLists[idx] = { ...mergedLists[idx], ...newList };
            } else {
              mergedLists.push(newList);
            }
          }
        }

        const mergedLogs = overwrite ? [...callLogsToImport] : [...existingLogs, ...callLogsToImport];
        const mergedTemplates = overwrite ? [...smsTemplatesToImport] : (smsTemplatesToImport.length > 0 ? smsTemplatesToImport : existingTemplates);
        const mergedRules = overwrite ? [...cadenceRulesToImport] : (cadenceRulesToImport.length > 0 ? cadenceRulesToImport : existingRules);
        const mergedSettings = overwrite ? [...settingsToImport] : (settingsToImport.length > 0 ? settingsToImport : existingSettings);

        localStorage.setItem(
          'snap_dialer_valuteachers_data',
          JSON.stringify({
            lists: mergedLists,
            leads: mergedLeads,
            call_logs: mergedLogs,
            cadence_rules: mergedRules,
            sms_templates: mergedTemplates,
            settings: mergedSettings,
          })
        );
      }

      // Sync with active Database instance
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        if (overwrite) {
          await db.runAsync('DELETE FROM leads');
          await db.runAsync('DELETE FROM lists');
          await db.runAsync('DELETE FROM call_logs');
        }

        // Restore Lists
        for (const lst of listsToImport) {
          await db.runAsync(
            `INSERT OR REPLACE INTO lists (id, title, source_image_uri, total_leads, completed_leads, connected_leads, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              lst.id,
              lst.title || 'Imported List',
              lst.source_image_uri || null,
              lst.total_leads || 0,
              lst.completed_leads || 0,
              lst.connected_leads || 0,
              lst.created_at || new Date().toISOString(),
              lst.updated_at || new Date().toISOString(),
            ]
          );
        }

        // Restore Leads
        for (const lead of leadsToImport) {
          const leadId = lead.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await db.runAsync(
            `INSERT OR REPLACE INTO leads (
              id, list_id, name, phone, school, email, age, planning_period,
              room_number, years_in_frs, text_ok, frs_knowledge, frs_interests,
              custom_questions, meeting_preferences, annual_salary, present_403b_contribution,
              source_image_uri, company, notes, priority_tier, cadence_step, last_disposition, attempts_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              leadId,
              lead.list_id || 'master_queue',
              lead.name || 'Educator',
              lead.phone || '',
              lead.school || 'VOL',
              lead.email || null,
              lead.age || null,
              lead.planning_period || null,
              lead.room_number || null,
              lead.years_in_frs || null,
              lead.text_ok !== undefined ? (lead.text_ok ? 1 : 0) : 1,
              lead.frs_knowledge || null,
              typeof lead.frs_interests === 'string' ? lead.frs_interests : JSON.stringify(lead.frs_interests || []),
              lead.custom_questions || null,
              typeof lead.meeting_preferences === 'string' ? lead.meeting_preferences : JSON.stringify(lead.meeting_preferences || []),
              lead.annual_salary || null,
              lead.present_403b_contribution || null,
              lead.source_image_uri || null,
              lead.company || null,
              lead.notes || null,
              lead.priority_tier !== undefined && lead.priority_tier !== null ? Number(lead.priority_tier) : 1,
              lead.cadence_step || 1,
              lead.last_disposition || 'pending',
              lead.attempts_count || 0,
              lead.created_at || new Date().toISOString(),
              lead.updated_at || new Date().toISOString(),
            ]
          );
        }

        // Restore Call Logs
        for (const log of callLogsToImport) {
          await db.runAsync(
            `INSERT OR REPLACE INTO call_logs (id, lead_id, list_id, timestamp, duration_seconds, disposition, note, sms_sent, sms_body)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              log.id || `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              log.lead_id,
              log.list_id || 'master_queue',
              log.timestamp || new Date().toISOString(),
              log.duration_seconds || 0,
              log.disposition || 'no_answer',
              log.note || null,
              log.sms_sent ? 1 : 0,
              log.sms_body || null,
            ]
          );
        }
      });

      return {
        success: true,
        leadCount: leadsToImport.length,
        message: `Successfully restored ${leadsToImport.length} educator lead${leadsToImport.length > 1 ? 's' : ''}.`,
      };
    } catch (e: any) {
      console.error('Restore failed:', e);
      return {
        success: false,
        leadCount: 0,
        message: e?.message || 'Invalid or unreadable backup JSON.',
      };
    }
  }
}
