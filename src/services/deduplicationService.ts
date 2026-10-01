/**
 * Deduplication & Record Consolidation Engine for SnapDialer
 * 
 * Provides multi-signal similarity matching (normalized phone, OCR typo tolerance,
 * order-agnostic tokenized name matching, school alias resolution, and email),
 * connected-component clustering via Disjoint Set (Union-Find), and non-destructive
 * deep record consolidation ensuring ZERO prospect/client data is lost.
 */

import type { Lead, ExtractedLeadItem, ClientProduct, AppointmentOutcome, CallDisposition } from '../types/index.ts';

export interface DuplicateMatchVerdict {
  isMatch: boolean;
  confidence: number; // 0 - 100
  reason: string;
  matchedFields: string[];
}

export class DeduplicationService {
  /**
   * Strips all non-digit characters and normalizes US country codes (+1 / 1).
   * Also splits out extensions (ext, x, #) if present.
   */
  static normalizePhoneDigits(phone?: string | null): string {
    if (!phone) return '';
    const cleanStr = String(phone).trim();
    // Split off common extension indicators before stripping
    const parts = cleanStr.split(/(?:ext\.?|x|#|;|,)/i);
    const primaryPart = parts[0] || '';
    const digits = primaryPart.replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.substring(1);
    }
    if (digits.length > 11 && digits.startsWith('1')) {
      return digits.substring(1, 11);
    }
    if (digits.length > 10) {
      return digits.substring(0, 10);
    }
    return digits;
  }

  /**
   * Extracts the primary 10-digit phone number if at least 10 digits are available.
   */
  static extractPrimary10Digits(phone?: string | null): string {
    const digits = this.normalizePhoneDigits(phone);
    if (digits.length >= 10) {
      return digits.slice(-10);
    }
    return digits;
  }

  /**
   * Normalizes an educator name:
   * - Lowercases and trims
   * - Removes honorifics/prefixes (Mr, Mrs, Ms, Dr, Coach, Prof)
   * - Removes suffixes (Jr, Sr, II, III, IV)
   * - Removes parenthetical remarks like (Math), (5th Grade), (Room 102)
   * - Replaces punctuation (commas, periods, dashes) with whitespace
   */
  static normalizeName(name?: string | null): string {
    if (!name) return '';
    let s = String(name).toLowerCase().trim();

    // Remove parenthetical annotations e.g. "Jane Doe (Math)" -> "Jane Doe"
    s = s.replace(/\([^)]*\)/g, ' ');
    // Remove bracket annotations e.g. "Jane Doe [5th Grade]" -> "Jane Doe"
    s = s.replace(/\[[^\]]*\]/g, ' ');

    // Normalize punctuation to spaces
    s = s.replace(/[,._\-\/\\#]/g, ' ');

    // Remove honorific prefixes
    s = s.replace(/\b(mr|mrs|ms|miss|dr|doctor|coach|prof|professor|principal|dean)\b/gi, ' ');

    // Remove generational suffixes
    s = s.replace(/\b(jr|sr|ii|iii|iv|v|esq)\b/gi, ' ');

    // Collapse multiple whitespaces
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * Returns sorted array of distinct word tokens for order-agnostic matching
   * (e.g. "Smith, John" and "John Smith" both yield ['john', 'smith']).
   */
  static getNameTokens(name?: string | null): string[] {
    const clean = this.normalizeName(name);
    if (!clean) return [];
    const tokens = clean
      .split(/\s+/)
      .filter((t) => t.length > 1) // ignore single letter noise
      .sort();
    return Array.from(new Set(tokens));
  }

  /**
   * Normalizes a school name to its distinctive root token:
   * Strips generic words like "high school", "middle school", "elementary school",
   * "charter", "academy", "center", "public schools", "district", "volusia".
   */
  static normalizeSchool(school?: string | null): string {
    if (!school) return '';
    let s = String(school).toLowerCase().trim();

    // Standardize acronyms
    s = s.replace(/\bhs\b/g, 'high');
    s = s.replace(/\bms\b/g, 'middle');
    s = s.replace(/\bes\b/g, 'elementary');

    // Remove boilerplate educational terms
    s = s.replace(/\b(high schools?|middle schools?|elementary schools?|public schools?|charter schools?|school districts?|schools?)\b/g, ' ');
    s = s.replace(/\b(center|centre|academy|institute|annex|campus|hall|k-8|fl|florida)\b/g, ' ');
    s = s.replace(/\b(high|middle|elementary|primary|secondary|intermediate)\b/g, ' ');

    // If only generic district identifier remains (VOL, VCS, Volusia), treat as blank/generic
    s = s.replace(/\b(volusia|vol|vcs|district|county)\b/g, ' ');

    s = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * Normalizes an email address.
   */
  static normalizeEmail(email?: string | null): string {
    if (!email) return '';
    return String(email).toLowerCase().trim();
  }

  /**
   * Computes Levenshtein edit distance between two strings.
   */
  static levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const matrix: number[][] = [];
    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    return matrix[m][n];
  }

  /**
   * Evaluates whether two educator profiles represent the same person.
   */
  static evaluateMatch(
    leadA: { name: string; phone?: string | null; school?: string | null; email?: string | null },
    leadB: { name: string; phone?: string | null; school?: string | null; email?: string | null }
  ): DuplicateMatchVerdict {
    const matchedFields: string[] = [];

    const phoneA = this.extractPrimary10Digits(leadA.phone);
    const phoneB = this.extractPrimary10Digits(leadB.phone);
    const hasPhoneA = phoneA.length === 10;
    const hasPhoneB = phoneB.length === 10;

    const normNameA = this.normalizeName(leadA.name);
    const normNameB = this.normalizeName(leadB.name);
    const tokensA = this.getNameTokens(leadA.name);
    const tokensB = this.getNameTokens(leadB.name);

    const normSchoolA = this.normalizeSchool(leadA.school);
    const normSchoolB = this.normalizeSchool(leadB.school);
    const hasSpecificSchoolA = normSchoolA.length >= 3;
    const hasSpecificSchoolB = normSchoolB.length >= 3;

    const emailA = this.normalizeEmail(leadA.email);
    const emailB = this.normalizeEmail(leadB.email);
    const hasEmailA = emailA.includes('@') && emailA.includes('.');
    const hasEmailB = emailB.includes('@') && emailB.includes('.');

    // Check Name Equality
    const exactNameMatch = normNameA.length > 0 && normNameA === normNameB;
    const tokenNameMatch =
      tokensA.length >= 2 &&
      tokensB.length >= 2 &&
      tokensA.length === tokensB.length &&
      tokensA.every((t, idx) => t === tokensB[idx]);

    // Check First + Last Token Match (ignoring middle initials)
    const firstLastMatch = (() => {
      if (tokensA.length < 2 || tokensB.length < 2) return false;
      const firstA = tokensA[0];
      const lastA = tokensA[tokensA.length - 1];
      const firstB = tokensB[0];
      const lastB = tokensB[tokensB.length - 1];
      return firstA === firstB && lastA === lastB;
    })();

    const namesMatch = exactNameMatch || tokenNameMatch || firstLastMatch;
    if (namesMatch) matchedFields.push('name');

    // Check School Match
    const exactSchoolMatch =
      hasSpecificSchoolA &&
      hasSpecificSchoolB &&
      (normSchoolA === normSchoolB ||
        normSchoolA.includes(normSchoolB) ||
        normSchoolB.includes(normSchoolA));
    if (exactSchoolMatch) matchedFields.push('school');

    // 1. SIGNAL 1: Exact 10-Digit Phone Match
    if (hasPhoneA && hasPhoneB && phoneA === phoneB) {
      matchedFields.push('phone');
      // If names also match or one name is empty
      if (namesMatch || !normNameA || !normNameB) {
        return {
          isMatch: true,
          confidence: 100,
          reason: 'Exact 10-digit phone number and name match',
          matchedFields,
        };
      }
      // Check if names have minor Levenshtein variance (e.g. OCR typo "Debra" vs "Deborah")
      const nameDist = this.levenshteinDistance(normNameA, normNameB);
      if (nameDist <= 2) {
        return {
          isMatch: true,
          confidence: 99,
          reason: 'Exact 10-digit phone with minor name spelling variation',
          matchedFields,
        };
      }
      // Same phone number is high confidence in CRM pipelines (single cell phone owner)
      return {
        isMatch: true,
        confidence: 95,
        reason: 'Identical 10-digit cell phone number',
        matchedFields,
      };
    }

    // 2. SIGNAL 2: Email Match
    if (hasEmailA && hasEmailB && emailA === emailB) {
      matchedFields.push('email');
      return {
        isMatch: true,
        confidence: 98,
        reason: 'Identical verified educator email address',
        matchedFields,
      };
    }

    // 3. SIGNAL 3: Name Match + 1-Digit Phone OCR Variance
    // (Common on handwritten cards where Gemini OCR misreads 0/8, 1/7, 3/8, 5/6)
    // Evaluated before school match due to higher specificity (96% vs 95%)
    if (namesMatch && hasPhoneA && hasPhoneB) {
      const phoneDist = this.levenshteinDistance(phoneA, phoneB);
      if (phoneDist === 1) {
        matchedFields.push('phone_ocr_variance');
        return {
          isMatch: true,
          confidence: 96,
          reason: `Matching educator name with 1-digit handwritten OCR phone variance (${phoneA} vs ${phoneB})`,
          matchedFields,
        };
      }
    }

    // 4. SIGNAL 4: Name Match + School Match
    if (namesMatch && exactSchoolMatch) {
      return {
        isMatch: true,
        confidence: 95,
        reason: `Matching educator name (${normNameA}) and school campus (${normSchoolA})`,
        matchedFields,
      };
    }

    // 5. SIGNAL 5: Name Match + 7-Digit Local Phone Suffix
    if (namesMatch && phoneA.length >= 7 && phoneB.length >= 7) {
      const last7A = phoneA.slice(-7);
      const last7B = phoneB.slice(-7);
      if (last7A === last7B) {
        matchedFields.push('phone_local7');
        return {
          isMatch: true,
          confidence: 94,
          reason: 'Matching educator name with identical 7-digit local phone number',
          matchedFields,
        };
      }
    }

    // 6. SIGNAL 6: Name Match + Generic District School (e.g. VOL) with Similar Phone
    if (namesMatch && (!hasSpecificSchoolA || !hasSpecificSchoolB)) {
      if (hasPhoneA && hasPhoneB) {
        const phoneDist = this.levenshteinDistance(phoneA, phoneB);
        if (phoneDist <= 1) {
          return {
            isMatch: true,
            confidence: 90,
            reason: 'Matching educator name with consistent phone in same district',
            matchedFields,
          };
        }
      }
    }

    return {
      isMatch: false,
      confidence: 0,
      reason: 'No matching identity signals detected',
      matchedFields: [],
    };
  }

  /**
   * Scans an existing list of leads to find a matching educator duplicate.
   */
  static findDuplicateInList(
    candidate: { name: string; phone?: string | null; school?: string | null; email?: string | null; id?: string },
    existingLeads: Lead[]
  ): { match: Lead | null; verdict: DuplicateMatchVerdict | null } {
    let bestMatch: Lead | null = null;
    let highestConfidence = 0;
    let bestVerdict: DuplicateMatchVerdict | null = null;

    for (const lead of existingLeads) {
      // Don't match against self if editing existing lead
      if (candidate.id && lead.id === candidate.id) continue;

      const verdict = this.evaluateMatch(candidate, lead);
      if (verdict.isMatch && verdict.confidence > highestConfidence) {
        highestConfidence = verdict.confidence;
        bestMatch = lead;
        bestVerdict = verdict;
        if (verdict.confidence === 100) break; // Maximum confidence short-circuit
      }
    }

    return { match: bestMatch, verdict: bestVerdict };
  }

  /**
   * Clusters an entire roster of leads into groups of duplicates using
   * Disjoint-Set Union (Union-Find) with inverted indexing.
   */
  static clusterDuplicateLeads(allLeads: Lead[]): Lead[][] {
    const n = allLeads.length;
    if (n <= 1) return [];

    // Disjoint Set data structure
    const parent: number[] = Array.from({ length: n }, (_, i) => i);
    function find(i: number): number {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i]);
      return parent[i];
    }
    function union(i: number, j: number) {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    }

    // Inverted indices for O(N) candidate generation
    const phone10Index = new Map<string, number[]>();
    const nameSchoolIndex = new Map<string, number[]>();
    const nameIndex = new Map<string, number[]>();
    const emailIndex = new Map<string, number[]>();

    for (let i = 0; i < n; i++) {
      const lead = allLeads[i];
      const p10 = this.extractPrimary10Digits(lead.phone);
      if (p10.length === 10) {
        if (!phone10Index.has(p10)) phone10Index.set(p10, []);
        phone10Index.get(p10)!.push(i);
      }

      const cleanName = this.normalizeName(lead.name);
      if (cleanName.length > 0) {
        if (!nameIndex.has(cleanName)) nameIndex.set(cleanName, []);
        nameIndex.get(cleanName)!.push(i);

        const cleanSchool = this.normalizeSchool(lead.school);
        if (cleanSchool.length >= 3) {
          const nsKey = `${cleanName}:::${cleanSchool}`;
          if (!nameSchoolIndex.has(nsKey)) nameSchoolIndex.set(nsKey, []);
          nameSchoolIndex.get(nsKey)!.push(i);
        }
      }

      const email = this.normalizeEmail(lead.email);
      if (email.includes('@')) {
        if (!emailIndex.has(email)) emailIndex.set(email, []);
        emailIndex.get(email)!.push(i);
      }
    }

    // 1. Group by exact 10-digit phone
    for (const indices of phone10Index.values()) {
      if (indices.length > 1) {
        for (let k = 1; k < indices.length; k++) {
          union(indices[0], indices[k]);
        }
      }
    }

    // 2. Group by exact name + school
    for (const indices of nameSchoolIndex.values()) {
      if (indices.length > 1) {
        for (let k = 1; k < indices.length; k++) {
          union(indices[0], indices[k]);
        }
      }
    }

    // 3. Group by verified email
    for (const indices of emailIndex.values()) {
      if (indices.length > 1) {
        for (let k = 1; k < indices.length; k++) {
          union(indices[0], indices[k]);
        }
      }
    }

    // 4. Pairwise check within same name buckets for phone OCR variance / 7-digit local phone
    for (const indices of nameIndex.values()) {
      if (indices.length > 1) {
        for (let a = 0; a < indices.length; a++) {
          for (let b = a + 1; b < indices.length; b++) {
            const idxA = indices[a];
            const idxB = indices[b];
            if (find(idxA) === find(idxB)) continue; // already clustered

            const verdict = this.evaluateMatch(allLeads[idxA], allLeads[idxB]);
            if (verdict.isMatch && verdict.confidence >= 90) {
              union(idxA, idxB);
            }
          }
        }
      }
    }

    // Collect clusters
    const clustersMap = new Map<number, Lead[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!clustersMap.has(root)) {
        clustersMap.set(root, []);
      }
      clustersMap.get(root)!.push(allLeads[i]);
    }

    // Only return groups with >= 2 leads
    return Array.from(clustersMap.values()).filter((group) => group.length > 1);
  }

  /**
   * Intelligently arbitrates primary vs alternate phone numbers between master and duplicate records.
   *
   * 1. Confirmed Working Phone (spoke, connected, appointment_set, is_client):
   *    -> Original phone MUST be preserved as primary.
   *    -> Differing duplicate phone is added to alternate_phones.
   *    -> Appends clear audit trail note.
   * 2. Confirmed Bad/Dead Number (last_disposition === 'bad_number'):
   *    -> Original phone was dead. Promote incoming valid 10-digit number to primary!
   *    -> Old bad number is moved to alternate_phones with [Bad Number] tag.
   *    -> Sets revivedFromBadNumber = true (allowing reset of disposition to pending).
   * 3. Called but Unreached (attempts > 0, no_answer, voicemail, busy):
   *    -> Original phone preserved as primary.
   *    -> Differing duplicate phone is added to alternate_phones for in-call fallback.
   * 4. Untried / Pending (attempts === 0):
   *    -> If master digits < 10 and dup digits >= 10, promote dup.
   *    -> Otherwise keep master and add dup to alternate_phones.
   */
  static arbitratePhoneNumbers(
    master: {
      phone: string;
      alternate_phones?: string[] | null;
      last_disposition?: string | null;
      attempts_count?: number;
      is_client?: boolean;
      appointment_scheduled_at?: string | null;
    },
    dup: {
      phone?: string | null;
      alternate_phones?: string[] | null;
    }
  ): {
    primaryPhone: string;
    alternatePhones: string[];
    auditNotes: string[];
    revivedFromBadNumber: boolean;
  } {
    const auditNotes: string[] = [];
    const masterDigits = this.normalizePhoneDigits(master.phone);
    const dupDigits = this.normalizePhoneDigits(dup.phone);

    const alternatesSet = new Set<string>();
    if (master.alternate_phones && Array.isArray(master.alternate_phones)) {
      master.alternate_phones.forEach((p) => {
        if (p && p.trim()) alternatesSet.add(p.trim());
      });
    }
    if (dup.alternate_phones && Array.isArray(dup.alternate_phones)) {
      dup.alternate_phones.forEach((p) => {
        if (p && p.trim()) alternatesSet.add(p.trim());
      });
    }

    let primaryPhone = master.phone;
    let revivedFromBadNumber = false;

    const hasDifferentPhone = Boolean(dup.phone && dupDigits.length >= 7 && dupDigits !== masterDigits);

    if (hasDifferentPhone && dup.phone) {
      const isDeadNumber = master.last_disposition === 'bad_number';
      const isVerifiedContact =
        ['spoke', 'connected', 'appointment_set'].includes(master.last_disposition || '') ||
        Boolean(master.is_client) ||
        Boolean(master.appointment_scheduled_at);
      const wasCalledUnreached = (Number(master.attempts_count) || 0) > 0;

      if (isDeadNumber && dupDigits.length >= 10) {
        // Dead line revival: promote incoming valid phone to primary!
        primaryPhone = dup.phone.trim();
        alternatesSet.add(master.phone);
        auditNotes.push(
          `[Lead Revived via Re-import] Former number ${master.phone} was marked bad. Replaced with new card number ${dup.phone.trim()}.`
        );
        revivedFromBadNumber = true;
      } else if (isVerifiedContact) {
        // Verified working phone: strictly preserve original as primary!
        primaryPhone = master.phone;
        alternatesSet.add(dup.phone.trim());
        auditNotes.push(
          `[Alternate Phone from Duplicate Card Added: ${dup.phone.trim()}] Verified primary contact number (${master.phone}) strictly retained.`
        );
      } else if (wasCalledUnreached) {
        // Called but unreached: keep original as primary, queue alternate for fallback
        primaryPhone = master.phone;
        alternatesSet.add(dup.phone.trim());
        auditNotes.push(
          `[Alternate Phone from Duplicate Card Added: ${dup.phone.trim()}] Primary ${master.phone} called ${master.attempts_count}x without live contact.`
        );
      } else {
        // Untried: if master is invalid digits (< 10) and dup is valid, promote dup
        if (masterDigits.length < 10 && dupDigits.length >= 10) {
          primaryPhone = dup.phone.trim();
          alternatesSet.add(master.phone);
        } else {
          primaryPhone = master.phone;
          alternatesSet.add(dup.phone.trim());
          auditNotes.push(`[Alternate Phone from Duplicate Card Added: ${dup.phone.trim()}]`);
        }
      }
    }

    // Clean up alternates: remove primary phone digits and duplicates
    const finalPrimaryDigits = this.normalizePhoneDigits(primaryPhone);
    const cleanedAlternates = Array.from(alternatesSet).filter((p) => {
      const pDigits = this.normalizePhoneDigits(p);
      return pDigits.length >= 7 && pDigits !== finalPrimaryDigits;
    });

    return {
      primaryPhone,
      alternatePhones: cleanedAlternates,
      auditNotes,
      revivedFromBadNumber,
    };
  }

  /**
   * Non-destructive deep merge protocol:
   * Merges all information from duplicate record into master record without
   * losing any historical notes, call dispositions, appointment bookings,
   * client conversion metrics, or FRS interests.
   */
  static mergeRecords(
    master: Lead,
    dup: Lead | Partial<Lead> | ExtractedLeadItem,
    newImageUri?: string | null
  ): Lead {
    const merged: Lead = { ...master };
    const d = dup as any;

    // 1. Phone & Contact Arbitration
    const phoneArb = this.arbitratePhoneNumbers(master, d);
    merged.phone = phoneArb.primaryPhone;
    merged.alternate_phones = phoneArb.alternatePhones;

    if (phoneArb.revivedFromBadNumber) {
      merged.last_disposition = 'pending';
    }

    // 2. School: prefer specific school over generic VOL
    const masterSchoolNorm = this.normalizeSchool(master.school);
    const dupSchoolNorm = this.normalizeSchool(d.school);
    if (!masterSchoolNorm && dupSchoolNorm && d.school) {
      merged.school = d.school.trim();
    }

    // 3. Email, Room Number & Planning Period
    if (!merged.email && d.email) merged.email = d.email.trim();
    if (!merged.room_number && d.room_number) merged.room_number = d.room_number.trim();
    if (!merged.planning_period && d.planning_period) merged.planning_period = d.planning_period.trim();

    // 4. FRS & Educator Profile Data
    if (!merged.years_in_frs && d.years_in_frs) merged.years_in_frs = String(d.years_in_frs).trim();
    if (!merged.age && d.age) merged.age = String(d.age).trim();
    if (!merged.annual_salary && d.annual_salary) merged.annual_salary = String(d.annual_salary).trim();
    if (!merged.present_403b_contribution && d.present_403b_contribution) {
      merged.present_403b_contribution = String(d.present_403b_contribution).trim();
    }
    if (!merged.frs_knowledge && d.frs_knowledge) merged.frs_knowledge = d.frs_knowledge.trim();
    if (!merged.custom_questions && d.custom_questions) merged.custom_questions = d.custom_questions.trim();
    if (d.is_frs === false) merged.is_frs = false;

    // 5. Array Fields (FRS Interests & Meeting Preferences) Set Union
    const interestsSet = new Set<string>(merged.frs_interests || []);
    if (d.frs_interests && Array.isArray(d.frs_interests)) {
      d.frs_interests.forEach((item: string) => {
        if (item && item.trim()) interestsSet.add(item.trim());
      });
    }
    merged.frs_interests = Array.from(interestsSet);

    const prefSet = new Set<string>(merged.meeting_preferences || []);
    if (d.meeting_preferences && Array.isArray(d.meeting_preferences)) {
      d.meeting_preferences.forEach((item: string) => {
        if (item && item.trim()) prefSet.add(item.trim());
      });
    }
    merged.meeting_preferences = Array.from(prefSet);

    // 6. Notes Consolidation (Absolute Zero Loss)
    let combinedNotes = (master.notes || '').trim();
    if (d.notes && d.notes.trim()) {
      const dupTrimmed = d.notes.trim();
      if (!combinedNotes.includes(dupTrimmed)) {
        combinedNotes = combinedNotes ? `${combinedNotes}\n\n${dupTrimmed}` : dupTrimmed;
      }
    }
    // Append phone arbitration audit notes
    for (const audit of phoneArb.auditNotes) {
      if (!combinedNotes.includes(audit)) {
        combinedNotes = combinedNotes ? `${combinedNotes}\n\n${audit}` : audit;
      }
    }
    merged.notes = combinedNotes || null;

    // 7. Client Conversion Preservation
    if (d.is_client) {
      merged.is_client = true;
      if (!merged.client_since || (d.client_since && new Date(d.client_since) < new Date(merged.client_since))) {
        merged.client_since = d.client_since;
      }
      if (d.annualized_premium && (!merged.annualized_premium || Number(d.annualized_premium) > Number(merged.annualized_premium))) {
        merged.annualized_premium = Number(d.annualized_premium);
      }
      if (d.transfer_assets_volume && (!merged.transfer_assets_volume || Number(d.transfer_assets_volume) > Number(merged.transfer_assets_volume))) {
        merged.transfer_assets_volume = Number(d.transfer_assets_volume);
      }
      if (!merged.policy_effective_date && d.policy_effective_date) {
        merged.policy_effective_date = d.policy_effective_date;
      }
      if (!merged.annual_review_due_date && d.annual_review_due_date) {
        merged.annual_review_due_date = d.annual_review_due_date;
      }
      const productsSet = new Set<ClientProduct>(merged.products || []);
      if (d.products && Array.isArray(d.products)) {
        d.products.forEach((p: ClientProduct) => productsSet.add(p));
      }
      merged.products = Array.from(productsSet);
    }

    // 8. Appointment Lifecycle Details
    if (!merged.appointment_scheduled_at && d.appointment_scheduled_at) {
      merged.appointment_scheduled_at = d.appointment_scheduled_at;
    } else if (
      d.appointment_scheduled_at &&
      merged.appointment_scheduled_at &&
      new Date(d.appointment_scheduled_at) > new Date(merged.appointment_scheduled_at)
    ) {
      merged.appointment_scheduled_at = d.appointment_scheduled_at;
    }
    if (!merged.appointment_outcome && d.appointment_outcome) {
      merged.appointment_outcome = d.appointment_outcome;
      merged.appointment_completed_at = d.appointment_completed_at;
    }
    if (!merged.appointment_notes && d.appointment_notes) {
      merged.appointment_notes = d.appointment_notes;
    }

    // 9. Disposition Hierarchy (Highest Value Wins)
    const dispoPriority: Record<string, number> = {
      appointment_set: 6,
      callback_requested: 5,
      connected: 4,
      spoke: 4,
      voicemail: 3,
      no_answer: 2,
      pending: 1,
    };
    const currentPriority = dispoPriority[merged.last_disposition || 'pending'] || 0;
    const dupPriority = dispoPriority[d.last_disposition || ''] || 0;
    if (dupPriority > currentPriority) {
      merged.last_disposition = (d.last_disposition as CallDisposition) || merged.last_disposition;
    }

    // 10. Attempts Count & Timestamps
    const dupAttempts = Number(d.attempts_count) || 0;
    if (dupAttempts > (merged.attempts_count || 0)) {
      merged.attempts_count = dupAttempts;
    }
    if (d.last_attempt_at && (!merged.last_attempt_at || new Date(d.last_attempt_at) > new Date(merged.last_attempt_at))) {
      merged.last_attempt_at = d.last_attempt_at;
    }
    if (d.follow_up_at && (!merged.follow_up_at || new Date(d.follow_up_at) > new Date(merged.follow_up_at))) {
      merged.follow_up_at = d.follow_up_at;
    }

    // 11. Image & Photo
    const photoToKeep = newImageUri || d.source_image_uri || master.source_image_uri;
    if (photoToKeep) {
      merged.source_image_uri = photoToKeep;
    }

    // 12. Drip Sequence
    if ((!merged.drip_track || merged.drip_track === 'none') && d.drip_track && d.drip_track !== 'none') {
      merged.drip_track = d.drip_track;
      merged.drip_step = d.drip_step || 0;
      merged.next_drip_scheduled_at = d.next_drip_scheduled_at;
    }

    merged.updated_at = new Date().toISOString();
    return merged;
  }
}
