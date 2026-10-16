import { Platform, Share } from 'react-native';
import { Lead, ExtractedLeadItem } from '../types';

export class CsvService {
  /**
   * Escapes fields for CSV adherence (RFC 4180)
   */
  private static escapeCell(value: any): string {
    if (value === null || value === undefined) return '""';
    let stringVal = String(value).replace(/"/g, '""');
    if (/^[\s]*[=+\-@\t\r]/.test(stringVal)) {
      stringVal = `'${stringVal}`;
    }
    return `"${stringVal}"`;
  }

  /**
   * Exports an array of Lead records to an Excel-compatible CSV string
   */
  static generateCsv(leads: Lead[]): string {
    const headers = [
      'Educator Name',
      'Phone Number',
      'School / Campus',
      'Room Number',
      'Planning Period',
      'Years in FRS',
      'Priority Tier',
      'Disposition Status',
      'Attempts Count',
      'Follow-Up Date',
      'Last Attempt Date',
      'Interests / Checked Needs',
      'Handwritten Inquiries',
      'Notes',
      'Email',
    ];

    const formatDateSafe = (d: any) => {
      if (!d) return '';
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
    };

    const rows = leads.map((l) => [
      this.escapeCell(l.name),
      this.escapeCell(l.phone),
      this.escapeCell(l.school || 'VOL'),
      this.escapeCell(l.room_number || ''),
      this.escapeCell(l.planning_period || ''),
      this.escapeCell(l.years_in_frs || ''),
      this.escapeCell(
        l.priority_tier === 3
          ? 'Legacy Archive (Tier 3)'
          : l.priority_tier === 2
          ? 'Standard (Tier 2)'
          : 'Fresh Priority (Tier 1)'
      ),
      this.escapeCell(l.last_disposition || 'pending'),
      this.escapeCell(l.attempts_count || 0),
      this.escapeCell(formatDateSafe(l.follow_up_at)),
      this.escapeCell(formatDateSafe(l.last_attempt_at)),
      this.escapeCell((l.frs_interests || []).join('; ')),
      this.escapeCell(l.custom_questions || ''),
      this.escapeCell(l.notes || ''),
      this.escapeCell(l.email || ''),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }

  /**
   * Triggers client-side browser download or native mobile share of the CSV file
   */
  static async downloadCsv(leads: Lead[], filenamePrefix: string = 'SnapDialer_Pipeline'): Promise<boolean> {
    try {
      const csvString = this.generateCsv(leads);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${filenamePrefix}_${dateStr}.csv`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' }); // \ufeff for Excel UTF-8 BOM
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
        message: csvString,
      });
      return true;
    } catch (e) {
      console.error('Failed to export CSV:', e);
      return false;
    }
  }

  /**
   * Flexible, RFC 4180 compliant CSV Parser to import school staff rosters,
   * supporting multi-line quoted fields, escaped quotes, and automated column detection.
   */
  static parseCsvToLeads(csvText: string): Partial<ExtractedLeadItem>[] {
    const allRows = this.parseAllCsvRows(csvText);
    if (allRows.length < 2) return [];

    // Parse header row
    const headers = allRows[0].map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));

    // Map header indices
    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('teacher') || h.includes('educator'));
    const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('cell') || h.includes('mobile') || h.includes('tel'));
    const schoolIdx = headers.findIndex((h) => h.includes('school') || h.includes('campus') || h.includes('district'));
    const roomIdx = headers.findIndex((h) => h.includes('room') || h.includes('class'));
    const planningIdx = headers.findIndex(
      (h) => h.includes('planning') || h.includes('period') || (h.includes('prep') && !h.includes('report'))
    );
    const yearsIdx = headers.findIndex((h) => h.includes('year') || h.includes('frs') || h.includes('tenure') || h.includes('service'));
    const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('mail'));
    const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment'));

    const results: Partial<ExtractedLeadItem>[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const cols = allRows[i];
      const rawName = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
      const rawPhone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() : '';
      const digitsOnly = rawPhone ? rawPhone.replace(/\D/g, '') : '';
      const normalizedDigits = digitsOnly.length === 11 && digitsOnly.startsWith('1') ? digitsOnly.slice(1) : digitsOnly;

      if (rawName || rawPhone) {
        results.push({
          name: rawName || 'Educator',
          phone: rawPhone || '',
          school: schoolIdx >= 0 && cols[schoolIdx] ? cols[schoolIdx].trim() : 'VOL',
          room_number: roomIdx >= 0 && cols[roomIdx] ? cols[roomIdx].trim() : undefined,
          planning_period: planningIdx >= 0 && cols[planningIdx] ? cols[planningIdx].trim() : undefined,
          years_in_frs: yearsIdx >= 0 && cols[yearsIdx] ? cols[yearsIdx].trim() : undefined,
          email: emailIdx >= 0 && cols[emailIdx] ? cols[emailIdx].trim() : undefined,
          notes: notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx].trim() : undefined,
          isValid: Boolean(rawName && normalizedDigits.length >= 10),
        });
      }
    }

    return results;
  }

  /**
   * Full-text state-machine parser that correctly handles multi-line fields within quotes
   */
  private static parseAllCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }
}
