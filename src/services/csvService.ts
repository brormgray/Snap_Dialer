import { Lead, ExtractedLeadItem } from '../types';

export class CsvService {
  /**
   * Escapes fields for CSV adherence (RFC 4180)
   */
  private static escapeCell(value: any): string {
    if (value === null || value === undefined) return '""';
    const stringVal = String(value).replace(/"/g, '""');
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
      this.escapeCell(l.priority_tier === 3 ? 'Legacy Archive (Tier 3)' : 'Fresh Priority (Tier 1)'),
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
   * Triggers client-side browser download of the CSV file
   */
  static downloadCsv(leads: Lead[], filenamePrefix: string = 'ValuTeachers_Pipeline'): boolean {
    try {
      const csvString = this.generateCsv(leads);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${filenamePrefix}_${dateStr}.csv`;

      if (typeof window !== 'undefined') {
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
      return false;
    } catch (e) {
      console.error('Failed to export CSV:', e);
      return false;
    }
  }

  /**
   * Flexible CSV Parser to import school staff rosters
   */
  static parseCsvToLeads(csvText: string): Partial<ExtractedLeadItem>[] {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    // Parse header row
    const headerLine = lines[0];
    const headers = this.parseCsvRow(headerLine).map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));

    // Map header indices
    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('teacher') || h.includes('educator'));
    const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('cell') || h.includes('mobile') || h.includes('tel'));
    const schoolIdx = headers.findIndex((h) => h.includes('school') || h.includes('campus') || h.includes('district'));
    const roomIdx = headers.findIndex((h) => h.includes('room') || h.includes('class'));
    const planningIdx = headers.findIndex((h) => h.includes('planning') || h.includes('period') || h.includes('time'));
    const yearsIdx = headers.findIndex((h) => h.includes('year') || h.includes('frs') || h.includes('tenure') || h.includes('service'));
    const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('mail'));
    const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment'));

    const results: Partial<ExtractedLeadItem>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvRow(lines[i]);
      const rawName = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
      const rawPhone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() : '';

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
          isValid: Boolean(rawName && rawPhone),
        });
      }
    }

    return results;
  }

  private static parseCsvRow(row: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
