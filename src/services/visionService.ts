import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { ExtractedLeadItem } from '../types';
import { SettingsRepository } from '../db/settingsRepository';
import { DocumentScannerService } from './documentScannerService';
import { GeminiModelService } from './geminiModelService';

export class VisionService {
  /**
   * Sanitizes phone number string to standard (XXX) XXX-XXXX or E.164
   */
  static cleanPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return raw.trim();
  }

  /**
   * On-device image optimization: Resizes large high-res camera photos (8MB-12MB)
   * to optimal OCR dimensions (max width 1600px, 0.75 JPEG quality, <250KB).
   */
  private static async optimizeImageForOCR(imageUri: string): Promise<string> {
    return await DocumentScannerService.downsampleAndCompress(imageUri);
  }

  /**
   * Extracts ValuTeachers & FRS lead contacts from an image using Gemini 2.5 Flash API
   */
  static async extractLeadsFromImage(
    imageUri: string,
    providedApiKey?: string
  ): Promise<ExtractedLeadItem[]> {
    let key = providedApiKey;
    if (!key || key.trim().length === 0) {
      const settings = await SettingsRepository.getSettings();
      key = settings.gemini_api_key;
    }

    if (!key || key.trim().length === 0) {
      throw new Error(
        'Gemini API Key missing. Please go to Settings (gear icon in the top right) and enter your free Gemini API Key from Google AI Studio to extract lead sheets.'
      );
    }

    return await this.extractWithGemini(imageUri, key.trim());
  }

  /**
   * Specialized ValuTeachers & Florida Retirement System (FRS) Vision AI Pipeline
   */
  private static async extractWithGemini(
    rawImageUri: string,
    apiKey: string
  ): Promise<ExtractedLeadItem[]> {
    const optimizedUri = await this.optimizeImageForOCR(rawImageUri);
    let base64Image = '';

    if (optimizedUri.startsWith('data:')) {
      base64Image = optimizedUri.split(',')[1] || '';
    } else if (Platform.OS === 'web') {
      const response = await fetch(optimizedUri);
      const blob = await response.blob();
      base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      base64Image = await FileSystem.readAsStringAsync(optimizedUri, {
        encoding: 'base64',
      });
    }

    if (!base64Image || base64Image.trim().length === 0) {
      throw new Error('Failed to read image data for OCR processing.');
    }

    const candidateModels = await GeminiModelService.getActiveModels(apiKey);
    let lastError: any = null;

    for (const model of candidateModels) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout guard

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const systemPrompt = `You are a high-speed ValuTeachers and Florida Retirement System (FRS) card parser.
Your task is to analyze photos of ValuTeachers Report Cards or National Life Group / ValuTeachers Retirement Analysis Sheets.
Accurately extract:
- Name (Teacher / Employee)
- Cell / Phone Number
- School / District (e.g. VOL, Volusia County, High School, etc.)
- Email (e.g. school email like jradona@volusia.k12.fl.us)
- Age or DOB
- Planning Period and Room Number (if filled)
- # Years working in Florida Retirement System (FRS)
- Text Ok? (check if Y is circled)
- FRS Understanding level (check whether 'Not very much', 'I know a little', or 'Very well' is circled)
- Checked Needs/Questions (e.g. 403b, DROP, 5% bonus / guaranteed interest, permanent life insurance, saving for retirement review)
- Questions written in 'I have a question about:'
- Best day/time preferences to meet in order (e.g. 1. Mon 1-2 PM, 2. Wed 1-2 PM, 3. Fri 1-2 PM)
- Annual Salary and Present 403b Contribution (if on card)
Never output conversational text. Output pure JSON adhering to the schema.`;

        const requestBody = {
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              parts: [
                { text: 'Extract ValuTeachers FRS card.' },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING', description: 'Teacher Full Name' },
                  phone: { type: 'STRING', description: 'Cell Phone Number' },
                  school: { type: 'STRING', description: 'School or District abbreviation/name' },
                  email: { type: 'STRING', description: 'Email address' },
                  age: { type: 'STRING', description: 'Age or DOB' },
                  planning_period: { type: 'STRING', description: 'Planning period' },
                  room_number: { type: 'STRING', description: 'Room number' },
                  years_in_frs: { type: 'STRING', description: 'Years in Florida Retirement System' },
                  text_ok: { type: 'BOOLEAN', description: 'True if Y circled for Text Ok' },
                  frs_knowledge: { type: 'STRING', description: 'Not very much | I know a little | Very well' },
                  frs_interests: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'List of all checked interests or questions from the card',
                  },
                  custom_questions: { type: 'STRING', description: 'Question written in I have a question about' },
                  meeting_preferences: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'List of preferred meeting days and times',
                  },
                  annual_salary: { type: 'STRING', description: 'Annual salary if present' },
                  present_403b_contribution: { type: 'STRING', description: 'Present 403b/457 contribution if present' },
                  notes: { type: 'STRING', description: 'Any extra notes' },
                },
                required: ['name', 'phone'],
              },
            },
            temperature: 0.0,
            maxOutputTokens: 2048,
          },
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          // Detect 429 Quota Exhausted / Rate Limit
          if (
            response.status === 429 ||
            err.includes('RESOURCE_EXHAUSTED') ||
            err.includes('quota') ||
            err.includes('QuotaExceeded')
          ) {
            throw new Error(
              'QUOTA_EXHAUSTED: Gemini API quota or free credits exhausted. Check your API key in Settings, or enter card details manually below.'
            );
          }
          throw new Error(`API ${model} status ${response.status}: ${err}`);
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response from vision model');

        let jsonStr = rawText.trim();
        const firstBracket = jsonStr.indexOf('[');
        const lastBracket = jsonStr.lastIndexOf(']');
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
        } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        } else {
          jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        }
        const parsedRaw: any = JSON.parse(jsonStr);
        const parsed: any[] = Array.isArray(parsedRaw)
          ? parsedRaw
          : (parsedRaw && typeof parsedRaw === 'object' ? [parsedRaw] : []);
        const seenNumbers = new Set<string>();

        return parsed.map((item, index) => {
          const cleaned = this.cleanPhone(item.phone || '');
          const isDup = seenNumbers.has(cleaned);
          seenNumbers.add(cleaned);

          return {
            id: `ext_${Date.now()}_${index}`,
            name: item.name || '',
            phone: cleaned,
            school: item.school || 'VOL',
            email: item.email || '',
            age: item.age || '',
            planning_period: item.planning_period || '',
            room_number: item.room_number || '',
            years_in_frs: item.years_in_frs || '',
            text_ok: item.text_ok !== false,
            frs_knowledge: item.frs_knowledge || 'I know a little',
            frs_interests: item.frs_interests || [],
            custom_questions: item.custom_questions || '',
            meeting_preferences: item.meeting_preferences || [],
            annual_salary: item.annual_salary || '',
            present_403b_contribution: item.present_403b_contribution || '',
            company: 'ValuTeachers',
            notes: item.notes || '',
            isDuplicate: isDup,
            isValid: Boolean((item.name || '').trim().length > 0 && cleaned.length >= 7),
          };
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        console.warn(`Vision model ${model} attempt failed:`, err?.message);

        // Immediate circuit breaker: Stop retrying subsequent models if quota is exhausted
        if (err?.message?.includes('QUOTA_EXHAUSTED')) {
          break;
        }
        if (err?.name === 'AbortError') {
          lastError = new Error(
            `TIMEOUT: Card analysis timed out after 15 seconds. Please check your connection or enter details manually below.`
          );
          continue;
        }
      }
    }

    throw lastError || new Error('Could not analyze card with Gemini Vision.');
  }

  /**
   * 100% Offline On-Device Text Extractor for ValuTeachers
   */
  public static parseUnstructuredText(rawText: string): ExtractedLeadItem[] {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const leads: ExtractedLeadItem[] = [];
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(phoneRegex);

      if (match) {
        const rawPhone = match[0];
        const cleanedPhone = this.cleanPhone(rawPhone);
        const emailMatch = line.match(emailRegex);
        const email = emailMatch ? emailMatch[0] : undefined;

        let remaining = line.replace(rawPhone, '').replace(email || '', '').trim();
        remaining = remaining.replace(/^[-–:,|\t]+|[-–:,|\t]+$/g, '').trim();

        const tokens = remaining.split(/[\t,|•]/).map((t) => t.trim()).filter(Boolean);
        const name = tokens[0] || `Educator #${leads.length + 1}`;
        const school = tokens.length > 1 ? tokens[1] : 'VOL';
        const notes = tokens.slice(2).join(', ');

        leads.push({
          id: `offline_${Date.now()}_${i}`,
          name: name.replace(/[0-9]/g, '').trim() || 'Educator',
          phone: cleanedPhone,
          school,
          email,
          years_in_frs: '5+',
          frs_knowledge: 'I know a little',
          frs_interests: ['Florida State Retirement and/or 403b Plans', 'Guaranteed 5% Bonus'],
          meeting_preferences: ['Mon 1-2 PM', 'Wed 1-2 PM'],
          company: 'ValuTeachers',
          notes,
          isValid: true,
        });
      }
    }

    return leads;
  }
}
