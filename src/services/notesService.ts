export interface NoteEntry {
  id: string;
  timestamp: string;
  text: string;
  raw: string;
}

export const EDUCATOR_QUICK_TAGS = [
  'Prefers planning period sit-down',
  'Interested in 5% bonus / DROP',
  'Needs 403(b) review',
  'Retiring in 1-2 years',
  'Spouse in FRS',
  'Left voicemail • Follow up via text',
  'Requested callback next week',
  'No solicitation during class time',
];

export class NotesService {
  /**
   * Formats a local timestamp string e.g. "Aug 28, 12:45 PM"
   */
  static formatTimestamp(date: Date = new Date()): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
  }

  /**
   * Parses raw string notes into individual structured NoteEntry items.
   * Handles both formatted timestamped entries and legacy unformatted notes.
   */
  static parseNotes(rawNotes?: string | null): NoteEntry[] {
    if (!rawNotes || rawNotes.trim().length === 0) {
      return [];
    }

    const clean = rawNotes.trim();

    // Check if the notes contain timestamp bracket markers: [MMM DD, H:MM AM/PM]
    const timestampRegex = /\[([A-Za-z]{3}\s+\d{1,2}(?:,\s*\d{4})?,?\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\]\s*/g;

    const matches = Array.from(clean.matchAll(timestampRegex));

    if (matches.length > 0) {
      const entries: NoteEntry[] = [];
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const timestamp = match[1];
        const startIndex = match.index! + match[0].length;
        const endIndex = i + 1 < matches.length ? matches[i + 1].index! : clean.length;
        const text = clean.substring(startIndex, endIndex).trim();

        if (text.length > 0) {
          entries.push({
            id: `note_${i}_${timestamp.replace(/[^a-zA-Z0-9]/g, '')}`,
            timestamp,
            text,
            raw: `[${timestamp}] ${text}`,
          });
        }
      }
      return entries;
    }

    // Fallback: If no timestamp brackets found, split by double newlines or lines
    const lines = clean.split(/\n\s*\n|\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    return lines.map((line, idx) => ({
      id: `note_legacy_${idx}`,
      timestamp: 'Note',
      text: line,
      raw: line,
    }));
  }

  /**
   * Appends a new note with a formatted timestamp and returns the updated combined string.
   */
  static addNote(rawNotes: string | null | undefined, newText: string): string {
    const trimmed = newText.trim();
    if (!trimmed) return rawNotes || '';

    const timestamp = this.formatTimestamp(new Date());
    const newEntry = `[${timestamp}] ${trimmed}`;

    if (!rawNotes || rawNotes.trim().length === 0) {
      return newEntry;
    }

    // Prepend newest note to the top for chronological readability
    return `${newEntry}\n\n${rawNotes.trim()}`;
  }

  /**
   * Edits the content of an existing note entry by ID.
   */
  static editNote(rawNotes: string | null | undefined, noteId: string, updatedText: string): string {
    const trimmed = updatedText.trim();
    const entries = this.parseNotes(rawNotes);
    const targetIdx = entries.findIndex((e) => e.id === noteId);

    if (targetIdx < 0) return rawNotes || '';

    if (trimmed.length === 0) {
      // If edited to empty, delete the note
      return this.deleteNote(rawNotes, noteId);
    }

    // Update the note's text while updating timestamp to reflect edit time
    const newTimestamp = this.formatTimestamp(new Date());
    entries[targetIdx] = {
      ...entries[targetIdx],
      timestamp: newTimestamp,
      text: trimmed,
      raw: `[${newTimestamp}] ${trimmed}`,
    };

    return entries.map((e) => `[${e.timestamp}] ${e.text}`).join('\n\n');
  }

  /**
   * Deletes a specific note entry by ID and returns the updated combined string.
   */
  static deleteNote(rawNotes: string | null | undefined, noteId: string): string {
    const entries = this.parseNotes(rawNotes);
    const remaining = entries.filter((e) => e.id !== noteId);

    if (remaining.length === 0) {
      return '';
    }

    return remaining.map((e) => (e.timestamp !== 'Note' ? `[${e.timestamp}] ${e.text}` : e.text)).join('\n\n');
  }
}
