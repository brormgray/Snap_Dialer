import { Lead } from '../types';

export type FrsTopicKey =
  | 'drop_expansion'         // SB 7024: 8-year DROP expansion & elimination of 12-mo cliff
  | 'drop_tax_trap'          // 20% mandatory federal withholding on direct cashouts vs rollover
  | 'pension_gap'            // 1.6% AFC formula & the 40-60% income replacement gap
  | 'pretax_takehome'        // Pre-tax 403(b) effect on take-home pay ($100 saved only costs ~$75)
  | 'second_election'        // 1-time switch window between Pension Plan and Investment Plan
  | 'downside_floor'         // 0% floor protection against market drops with upside participation
  | 'sick_leave_rollover'    // Terminal sick leave pay tax-sheltering into 403(b)/Bencor
  | 'student_loan_idr'       // Pre-tax contributions lowering AGI for student loan IDR/SAVE plans
  | 'his_subsidy'            // Health Insurance Subsidy ($7.50/mo per service year up to $225/mo)
  | 'vesting_milestone';     // 8-year vesting cliff under Tier 2

export type CareerPhase = 'early' | 'mid' | 'drop_zone' | 'retirement' | 'all';

export interface FrsWisdomSeed {
  key: FrsTopicKey;
  title: string;
  shortLabel: string; // for UI badge/chip e.g. "8-Yr DROP Math"
  targetCareerPhase: CareerPhase;
  minYearsInFrs?: number;
  maxYearsInFrs?: number;
  applicableInterests: string[]; // matching lead.frs_interests
  factualInsight: string; // concise high-value factual explanation for Gemini context
  samplePhrasing: string; // natural phrasing for fallback SMS and AI guidelines
  category: 'drop' | 'pension' | 'tax' | 'growth' | 'exit';
}

export const FRS_WISDOM_BANK: FrsWisdomSeed[] = [
  {
    key: 'drop_expansion',
    title: 'SB 7024 8-Year DROP Expansion',
    shortLabel: '8-Yr DROP Expansion',
    targetCareerPhase: 'drop_zone',
    minYearsInFrs: 18,
    applicableInterests: ['DROP', 'DROP extension', 'Retirement date', '5% bonus', 'Guaranteed interest'],
    factualInsight:
      'Florida Senate Bill 7024 (SB 7024) expanded DROP participation from 60 months (5 years) to 96 months (8 years) for instructional personnel and eliminated the restrictive 12-month election cliff. DROP deposits earn 3% compound annual interest. The extra 3 years can add $75,000 to $120,000+ to an educator’s guaranteed tax-deferred lump sum.',
    samplePhrasing:
      'Under the 2023 SB 7024 reform, DROP is now 8 years instead of 5 for teachers, and that extra 3 years can add over $80k to your guaranteed lump sum.',
    category: 'drop',
  },
  {
    key: 'drop_tax_trap',
    title: 'DROP 20% Mandatory IRS Withholding Trap',
    shortLabel: 'DROP Tax Trap',
    targetCareerPhase: 'drop_zone',
    minYearsInFrs: 20,
    applicableInterests: ['DROP', 'Rollover', 'Taxes', 'Payout'],
    factualInsight:
      'Taking a direct cash distribution from your FRS DROP lump sum triggers an automatic 20% mandatory federal tax withholding by the state. Rolling DROP funds into a specialized educator annuity or IRA preserves 100% of the balance and prevents a massive tax spike.',
    samplePhrasing:
      'Cashing out a DROP payout triggers an automatic 20% federal tax withholding, but rolling it into an educator-specific vehicle protects 100% of your lump sum.',
    category: 'tax',
  },
  {
    key: 'pension_gap',
    title: '1.6% Pension Formula & The Income Gap',
    shortLabel: '1.6% Pension Gap',
    targetCareerPhase: 'mid',
    minYearsInFrs: 8,
    maxYearsInFrs: 25,
    applicableInterests: ['Pension', 'FRS Pension calculations', 'Retirement review', 'Take-home pay'],
    factualInsight:
      'Under the FRS Pension Plan formula (Years of Service x 1.6% x Average Final Compensation), 25 years of service replaces only 40% of pre-retirement salary (30 years replaces 48%). Educators rely on supplemental 403(b)/annuity growth to bridge the remaining 52% to 60% income gap.',
    samplePhrasing:
      'Under the state pension formula (1.6% per year), 20 to 25 years in FRS replaces only 32% to 40% of your salary. Bridging that 60% gap is why supplemental plans are so critical.',
    category: 'pension',
  },
  {
    key: 'pretax_takehome',
    title: 'Pre-Tax 403(b) Take-Home Advantage',
    shortLabel: 'Take-Home Math',
    targetCareerPhase: 'all',
    applicableInterests: ['403b', 'Take-home pay', 'Budget', 'Saving for retirement review'],
    factualInsight:
      'Because voluntary 403(b) contributions are deducted pre-tax from gross salary, every $100 put into retirement only reduces net take-home pay by approximately $75 to $80 depending on the tax bracket, while compounding at 100% for the educator.',
    samplePhrasing:
      'Because 403(b) contributions are pre-tax, putting away $100/mo typically only reduces your paycheck take-home by about $75.',
    category: 'tax',
  },
  {
    key: 'second_election',
    title: 'The One-Time Second Election',
    shortLabel: '2nd Election Switch',
    targetCareerPhase: 'mid',
    minYearsInFrs: 5,
    maxYearsInFrs: 18,
    applicableInterests: ['Investment vs Pension', 'Second Election', 'Switch plan', 'FRS options'],
    factualInsight:
      'Florida law grants every FRS employee a one-time "Second Election" to switch between the Pension Plan and the Investment Plan at any point in their active career. If an educator’s career longevity or market outlook changes, timing this switch correctly can unlock significant retirement wealth.',
    samplePhrasing:
      'Florida gives educators a one-time "Second Election" to switch between the Pension and Investment plans if your career horizon changes.',
    category: 'pension',
  },
  {
    key: 'downside_floor',
    title: '0% Downside Floor with Market Upside',
    shortLabel: '0% Downside Floor',
    targetCareerPhase: 'all',
    applicableInterests: ['Downside protection', '0% floor', 'Market volatility', 'Guaranteed interest', '5% bonus'],
    factualInsight:
      'Educator fixed-indexed annuities lock in annual market index gains with a guaranteed 0% floor against market losses. In market downturns, the balance never drops; when the market recovers, gains compound from the high-water mark.',
    samplePhrasing:
      'Educator retirement annuities feature a guaranteed 0% floor—you participate in market upside, but your balance is 100% protected against market drops.',
    category: 'growth',
  },
  {
    key: 'sick_leave_rollover',
    title: 'Terminal Sick Leave Tax Shelter',
    shortLabel: 'Sick Leave Tax Rollover',
    targetCareerPhase: 'retirement',
    minYearsInFrs: 15,
    applicableInterests: ['Sick leave', 'Terminal pay', 'DROP exit', 'Retirement paperwork'],
    factualInsight:
      'Upon retirement or DROP exit, Florida school districts pay out accumulated unused sick leave. If taken as cash on a final paycheck, it is heavily taxed by FICA and ordinary income tax. Rolling it into an approved tax-sheltered vehicle (such as a 403b/457 or Bencor special pay plan) saves thousands in taxes.',
    samplePhrasing:
      'Accumulated sick days are a major asset at retirement: rolling terminal pay into a tax-sheltered vehicle instead of a cash payout prevents a huge tax hit.',
    category: 'exit',
  },
  {
    key: 'student_loan_idr',
    title: 'Pre-Tax AGI Reduction for Student Loans',
    shortLabel: 'Student Loan AGI Benefit',
    targetCareerPhase: 'early',
    minYearsInFrs: 1,
    maxYearsInFrs: 10,
    applicableInterests: ['Student loans', '403b', 'Pre-tax', 'Budget'],
    factualInsight:
      'Voluntary pre-tax 403(b) contributions reduce an educator’s Adjusted Gross Income (AGI) on their federal return. For educators on Income-Driven Repayment (IDR/SAVE/PSLF), lowering AGI directly lowers their monthly required student loan payments.',
    samplePhrasing:
      'Pre-tax 403(b) contributions lower your Adjusted Gross Income, which can directly reduce your monthly student loan payments under federal repayment plans.',
    category: 'tax',
  },
  {
    key: 'his_subsidy',
    title: 'Health Insurance Subsidy (HIS)',
    shortLabel: 'Health Subsidy (HIS)',
    targetCareerPhase: 'drop_zone',
    minYearsInFrs: 20,
    applicableInterests: ['Health insurance', 'HIS', 'Retirement benefits', 'Medicare'],
    factualInsight:
      'The FRS Health Insurance Subsidy (HIS) provides retirees $7.50 per month for each year of creditable service (up to a maximum of $225/month for 30 years) to offset retiree healthcare or Medicare premiums.',
    samplePhrasing:
      'The state’s Health Insurance Subsidy provides up to $225/mo ($7.50 per year of service) toward healthcare, but pairing it with supplemental savings is key to covering modern medical costs.',
    category: 'exit',
  },
  {
    key: 'vesting_milestone',
    title: 'Tier 2 8-Year Vesting Milestone',
    shortLabel: '8-Yr Vesting Milestone',
    targetCareerPhase: 'early',
    minYearsInFrs: 1,
    maxYearsInFrs: 8,
    applicableInterests: ['Vesting', 'Years in FRS', 'Pension Plan', 'First-time retirement review'],
    factualInsight:
      'Educators enrolled in FRS on or after July 1, 2011 (Tier 2) require 8 full years of creditable service to vest in the Pension Plan. Reaching this milestone guarantees lifetime monthly retirement benefits.',
    samplePhrasing:
      'Reaching your 8-year vesting milestone in FRS locks in lifetime pension benefits, and starting supplemental savings early unlocks compounding growth.',
    category: 'pension',
  },
];

export class FrsKnowledgeBank {
  /**
   * Returns all available FRS wisdom seeds
   */
  static getAllSeeds(): FrsWisdomSeed[] {
    return FRS_WISDOM_BANK;
  }

  /**
   * Resolves the numeric years of service from string representations (e.g. "18", "18 years", "24+", "5-10")
   */
  static parseYearsInFrs(rawYears?: string | null): number | null {
    if (!rawYears) return null;
    const match = rawYears.match(/\d+/);
    if (!match) return null;
    const val = parseInt(match[0], 10);
    return isNaN(val) ? null : val;
  }

  /**
   * Determines career phase based on years in FRS
   */
  static getCareerPhase(years: number | null): CareerPhase {
    if (years === null) return 'mid';
    if (years < 8) return 'early';
    if (years < 20) return 'mid';
    if (years < 30) return 'drop_zone';
    return 'retirement';
  }

  /**
   * Intelligently selects the best FRS wisdom seed for a lead.
   * Prioritizes:
   * 1. Explicit topic override if provided
   * 2. Handwritten questions and checked interests on Report Card
   * 3. Specific years in FRS & career phase
   * 4. Safe high-value default (e.g. 1.6% Pension Gap or Pre-tax take-home)
   */
  static recommendWisdomSeed(lead: Lead, preferredTopicKey?: FrsTopicKey): FrsWisdomSeed {
    // 1. Explicit override
    if (preferredTopicKey) {
      const found = FRS_WISDOM_BANK.find((s) => s.key === preferredTopicKey);
      if (found) return found;
    }

    const years = this.parseYearsInFrs(lead.years_in_frs);
    const phase = this.getCareerPhase(years);
    const interests = (lead.frs_interests || []).map((i) => i.toLowerCase());
    const handwritten = (lead.custom_questions || '').toLowerCase();
    const notes = (lead.appointment_notes || lead.notes || '').toLowerCase();

    // 2. High-priority keyword matches from Report Card
    const combinedText = `${interests.join(' ')} ${handwritten} ${notes}`;

    // DROP check (especially if 18+ years or explicitly mentioned)
    if (combinedText.includes('drop') || (years !== null && years >= 20)) {
      if (combinedText.includes('tax') || combinedText.includes('withholding') || combinedText.includes('payout')) {
        return FRS_WISDOM_BANK.find((s) => s.key === 'drop_tax_trap')!;
      }
      return FRS_WISDOM_BANK.find((s) => s.key === 'drop_expansion')!;
    }

    // Sick leave / terminal pay check
    if (combinedText.includes('sick') || combinedText.includes('terminal')) {
      return FRS_WISDOM_BANK.find((s) => s.key === 'sick_leave_rollover')!;
    }

    // Student loans check
    if (combinedText.includes('student loan') || combinedText.includes('pslf') || combinedText.includes('debt')) {
      return FRS_WISDOM_BANK.find((s) => s.key === 'student_loan_idr')!;
    }

    // Downside / volatility / crash check
    if (
      combinedText.includes('floor') ||
      combinedText.includes('loss') ||
      combinedText.includes('crash') ||
      combinedText.includes('safe') ||
      combinedText.includes('risk')
    ) {
      return FRS_WISDOM_BANK.find((s) => s.key === 'downside_floor')!;
    }

    // Second election check
    if (combinedText.includes('second election') || combinedText.includes('switch plan') || combinedText.includes('investment plan')) {
      return FRS_WISDOM_BANK.find((s) => s.key === 'second_election')!;
    }

    // 3. Phase-based selection if no specific keyword triggered
    if (phase === 'drop_zone' || phase === 'retirement') {
      return FRS_WISDOM_BANK.find((s) => s.key === 'drop_expansion')!;
    }

    if (phase === 'early') {
      if (years !== null && years <= 4) {
        return FRS_WISDOM_BANK.find((s) => s.key === 'vesting_milestone')!;
      }
      return FRS_WISDOM_BANK.find((s) => s.key === 'pretax_takehome')!;
    }

    // Mid career default: 1.6% pension formula gap
    return FRS_WISDOM_BANK.find((s) => s.key === 'pension_gap') || FRS_WISDOM_BANK[0];
  }
}
