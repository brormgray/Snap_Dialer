import type { SMSTemplate, DripCategory } from '../types';

/**
 * Track A: Non-Closed Prospect Nurture Cadence (FRS / Educator Track)
 * Hybrid Weaved Cadence:
 * - Sprint (24-48h): Eliminate paperwork friction, summarize sit-down, zero-effort next step.
 * - Bridge (Weeks 2-6): Interleave direct asks, zero-ask FRS statutory insights, and school community goodwill.
 * - Monthly Indefinite: Alternates between zero-ask legislative insights, community goodwill, and strategic appointment asks.
 */
export const NURTURE_DRIP_TEMPLATES: SMSTemplate[] = [
  // Step 0: Sprint Phase (24-48h post-appointment) - Meeting Summary & Next Step
  {
    id: 'tpl_nurture_sprint_24h',
    title: 'Sprint 24h - Meeting Summary & Next Step',
    stage: 'sprint',
    phase_label: 'Sprint (24-48h)',
    suggested_delay_days: 1,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me at {{school}}! Did the numbers we put together make sense, or did any questions pop up when you reflected on it?',
  },
  // Step 1: Sprint Phase (48-72h later) - Paperwork Roadblock Buster
  {
    id: 'tpl_nurture_sprint_48h',
    title: 'Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    phase_label: 'Sprint (48-72h)',
    suggested_delay_days: 2,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your FRS & 403(b) paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  // Step 2: Bridge Phase (Week 2 / +7d) - Zero-Ask Pure FRS Insight: SB 7024 DROP 8-Year Expansion
  {
    id: 'tpl_nurture_zero_ask_sb7024',
    title: 'Bridge Wk 2 - SB 7024 DROP 8-Year Expansion (Zero-Ask)',
    stage: 'bridge',
    phase_label: 'Bridge (Week 2)',
    suggested_delay_days: 7,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick heads up for your FRS records: Florida SB 7024 expanded DROP participation to 8 full years for teachers and removed the old 12-month sign-up deadline. No reply needed—just wanted to make sure you had the updated state policy in your files! - {{my_name}} with {{company}}',
  },
  // Step 3: Bridge Phase (Week 3 / +7d) - Paycheck Cycle & 403(b) Opportunity Cost
  {
    id: 'tpl_nurture_bridge_wk3',
    title: 'Bridge Wk 3 - Paycheck Cycle & Opportunity Cost',
    stage: 'bridge',
    phase_label: 'Bridge (Week 3)',
    suggested_delay_days: 7,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a district payroll deduction cutoff often delays compound growth more than people realize. Let's make sure your 403(b) allocation is locked in before this month's payroll cutoff—can we touch base in {{room_number}} this week?",
  },
  // Step 4: Bridge Phase (Week 4 / +7d) - Zero-Ask School & Community Goodwill: Teacher Encouragement
  {
    id: 'tpl_nurture_zero_ask_school_encouragement',
    title: 'Bridge Wk 4 - Educator & Classroom Appreciation (Zero-Ask)',
    stage: 'bridge',
    phase_label: 'Bridge (Week 4)',
    suggested_delay_days: 7,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, knowing how demanding this time of the school year gets for teachers at {{school}}, just wanted to send a quick note of encouragement. Thank you for everything you do for our students and school community every day! - {{my_name}} with {{company}}',
  },
  // Step 5: Bridge Phase (Week 6 / +14d) - Permission to Pause & Semester Reset
  {
    id: 'tpl_nurture_bridge_wk6',
    title: 'Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    phase_label: 'Bridge (Week 6)',
    suggested_delay_days: 14,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, I know how busy things get at school. Should we hit pause on your retirement review until next term, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  // Step 6: Monthly Authority (Month 2 / +18d -> ~Day 60) - Zero-Ask FRS Insight: One-Time Second Election
  {
    id: 'tpl_nurture_zero_ask_second_election',
    title: 'Month 2 - One-Time Second Election Insight (Zero-Ask)',
    stage: 'monthly',
    phase_label: 'Monthly (Month 2)',
    suggested_delay_days: 30,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} here. Many educators don\'t realize Florida gives teachers a one-time "Second Election" to switch between the Pension and Investment plans if your career horizon changes. Just sharing a quick insight as you plan your school year. Have a wonderful week at {{school}}!',
  },
  // Step 7: Monthly Authority (Month 3 / +30d) - 0% Downside Floor & Market Volatility Reassurance
  {
    id: 'tpl_nurture_month3_floor',
    title: 'Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    phase_label: 'Monthly (Month 3)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: educator retirement annuities feature a guaranteed 0% downside floor with growth tied to market gains. PS: Happy to compare your current savings options anytime during {{planning_period}}!',
  },
  // Step 8: Monthly Authority (Month 4 / +30d) - Zero-Ask School Community: Mid-Month District Payroll Heads-Up
  {
    id: 'tpl_nurture_zero_ask_payroll_cutoff',
    title: 'Month 4 - District Mid-Month Payroll Heads-Up (Zero-Ask)',
    stage: 'monthly',
    phase_label: 'Monthly (Month 4)',
    suggested_delay_days: 30,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick friendly heads-up: district payroll cutoffs for any pre-tax benefit adjustments happen mid-month. Hope you have a restful Friday and an even better weekend at {{school}}! - {{my_name}}',
  },
  // Step 9: Monthly Authority (Month 5 / +30d) - Open Enrollment & Longevity Milestones
  {
    id: 'tpl_nurture_month5_milestones',
    title: 'Month 5 - Open Enrollment & Longevity Milestones',
    stage: 'monthly',
    phase_label: 'Monthly (Month 5)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} checking in! As school calendar deadlines approach, it's a great time to ensure your FRS DROP date, beneficiary designations, and supplemental plans align. PS: Can stop by {{school}} this week if you need a quick review!",
  },
  // Step 10: Monthly Indefinite Looping Template - Seasonal Check-in
  {
    id: 'tpl_nurture_month6_seasonal',
    title: 'Monthly - FRS Retirement Roadmap Check-in',
    stage: 'monthly',
    phase_label: 'Monthly (Indefinite)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, hope all is well at {{school}}! Reaching out with your seasonal FRS retirement check-in. Whether you are 2 years or 20 years from retirement, small tweaks make a massive difference. PS: When you have 10 minutes free during planning, let's catch up!",
  },
];

/**
 * Non-FRS Prospect Nurture Cadence
 * Tailored for private clients and non-educators:
 * - Hybrid Weaved Cadence (direct appointment asks, pure financial insights, and client goodwill).
 * - General retirement planning, 401(k)/IRA rollovers, 0% downside protection.
 * - No school, district, planning period, classroom, or FRS/DROP terminology.
 */
export const NON_FRS_NURTURE_DRIP_TEMPLATES: SMSTemplate[] = [
  // Step 0: Sprint Phase (24-48h post-appointment)
  {
    id: 'tpl_non_frs_nurture_sprint_24h',
    title: 'Non-FRS Sprint 24h - Meeting Summary & Next Step',
    stage: 'sprint',
    phase_label: 'Sprint (24-48h)',
    suggested_delay_days: 1,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me! Did the numbers and retirement options we discussed make sense, or did any questions pop up when you reflected on it?',
  },
  // Step 1: Sprint Phase (48-72h later)
  {
    id: 'tpl_non_frs_nurture_sprint_48h',
    title: 'Non-FRS Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    phase_label: 'Sprint (48-72h)',
    suggested_delay_days: 2,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your retirement rollover or savings paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  // Step 2: Bridge Phase (Week 2 / +7d) - Zero-Ask Insight: Social Security 40% Replacement Gap
  {
    id: 'tpl_non_frs_zero_ask_ss_gap',
    title: 'Non-FRS Bridge Wk 2 - Social Security Income Gap (Zero-Ask)',
    stage: 'bridge',
    phase_label: 'Bridge (Week 2)',
    suggested_delay_days: 7,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick financial insight: Social Security is designed to replace only about 40% of pre-retirement earnings, making personal tax-sheltered reserves essential. No reply needed—just wanted to share this for your records! Have a wonderful week ahead.',
  },
  // Step 3: Bridge Phase (Week 3 / +7d) - Compound Growth & Cutoff
  {
    id: 'tpl_non_frs_nurture_bridge_wk3',
    title: 'Non-FRS Bridge Wk 3 - Compound Growth & Cutoff',
    stage: 'bridge',
    phase_label: 'Bridge (Week 3)',
    suggested_delay_days: 7,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a contribution cycle or rollover window often delays compound growth more than people realize. Let's make sure your retirement allocation is set up—can we touch base for 10 minutes this week?",
  },
  // Step 4: Bridge Phase (Week 4 / +7d) - Zero-Ask Client Goodwill: Appreciation & Encouragement
  {
    id: 'tpl_non_frs_zero_ask_encouragement',
    title: 'Non-FRS Bridge Wk 4 - Client Appreciation (Zero-Ask)',
    stage: 'bridge',
    phase_label: 'Bridge (Week 4)',
    suggested_delay_days: 7,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, knowing how busy modern schedules get, just wanted to send a quick note wishing you a wonderful and productive week! Thank you for the opportunity to assist with your financial goals. - {{my_name}} with {{company}}',
  },
  // Step 5: Bridge Phase (Week 6 / +14d) - Permission to Pause
  {
    id: 'tpl_non_frs_nurture_bridge_wk6',
    title: 'Non-FRS Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    phase_label: 'Bridge (Week 6)',
    suggested_delay_days: 14,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, I know how busy life gets. Should we hit pause on your retirement review for now, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  // Step 6: Monthly Authority (Month 2 / +18d -> ~Day 60) - Zero-Ask Insight: Pre-Tax Take-Home Math
  {
    id: 'tpl_non_frs_zero_ask_tax_compound',
    title: 'Non-FRS Month 2 - Pre-Tax Compounding Math (Zero-Ask)',
    stage: 'monthly',
    phase_label: 'Monthly (Month 2)',
    suggested_delay_days: 30,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick retirement math thought: voluntary pre-tax contributions reduce your current taxable income dollar-for-dollar, meaning saving $100/mo typically only reduces take-home pay by around $75 depending on your bracket. Just sharing a quick insight for your files! - {{my_name}}',
  },
  // Step 7: Monthly Authority (Month 3 / +30d) - 0% Downside Floor & Market Volatility
  {
    id: 'tpl_non_frs_nurture_month3_floor',
    title: 'Non-FRS Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    phase_label: 'Monthly (Month 3)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: retirement fixed-indexed annuities feature a guaranteed 0% downside floor with growth tied to index gains. PS: Happy to compare your current savings options anytime!',
  },
  // Step 8: Monthly Authority (Month 4 / +30d) - Zero-Ask Client Goodwill: Weekend & Seasonal Greeting
  {
    id: 'tpl_non_frs_zero_ask_weekend_goodwill',
    title: 'Non-FRS Month 4 - Weekend Recharge Greeting (Zero-Ask)',
    stage: 'monthly',
    phase_label: 'Monthly (Month 4)',
    suggested_delay_days: 30,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick friendly note wishing you a restful and relaxing weekend ahead! Hope you take some time to recharge with family and friends. - {{my_name}} with {{company}}',
  },
  // Step 9: Monthly Authority (Month 5 / +30d) - Account & Beneficiary Alignment
  {
    id: 'tpl_non_frs_nurture_month5_milestones',
    title: 'Non-FRS Month 5 - Account & Beneficiary Alignment',
    stage: 'monthly',
    phase_label: 'Monthly (Month 5)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} checking in! It's a great time to ensure your retirement accounts, beneficiary designations, and rollover options align with your goals. PS: Let me know if you'd like a quick 10-minute review this week!",
  },
  // Step 10: Monthly Indefinite Looping Template
  {
    id: 'tpl_non_frs_nurture_month6_seasonal',
    title: 'Non-FRS Monthly - Retirement Roadmap Check-in',
    stage: 'monthly',
    phase_label: 'Monthly (Indefinite)',
    suggested_delay_days: 30,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, hope all is well! Reaching out with your seasonal retirement roadmap check-in. Whether you are 2 years or 20 years from retirement, small compound tweaks make a massive difference. PS: When you have 10 minutes free, let's catch up!",
  },
];

/**
 * ============================================================================
 * STANDALONE CATEGORY TEMPLATE BANKS (FOR 1-TAP IN-MODAL CATEGORY SWAPPING)
 * ============================================================================
 */

/**
 * Bank 1: Zero-Ask Pure FRS & Legislative Insights
 * Builds deep advisory credibility and authority without demanding appointments.
 */
export const ZERO_ASK_FRS_INSIGHT_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_za_frs_sb7024',
    title: 'SB 7024 DROP 8-Year Expansion',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick heads up for your FRS records: Florida SB 7024 expanded DROP participation to 8 full years for teachers and removed the old 12-month sign-up deadline. No reply needed—just wanted to make sure you had the updated state policy in your files! - {{my_name}} with {{company}}',
  },
  {
    id: 'tpl_za_frs_second_election',
    title: 'One-Time Second Election Insight',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} here. Many educators don\'t realize Florida gives teachers a one-time "Second Election" to switch between the Pension and Investment plans if your career horizon changes. Just sharing a quick insight as you plan your school year. Have a wonderful week at {{school}}!',
  },
  {
    id: 'tpl_za_frs_pretax_math',
    title: 'Pre-Tax 403(b) Paycheck Math ($100 for $75)',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick retirement math thought: because voluntary 403(b) contributions are deducted pre-tax, putting away $100/mo typically only reduces your take-home pay by about $75 depending on your bracket. Just a quick nugget for your financial peace of mind! - {{my_name}}',
  },
  {
    id: 'tpl_za_frs_downside_floor',
    title: 'Guaranteed 0% Downside Floor Reassurance',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, with all the conflicting news about markets lately, a quick reminder that educator-specific fixed-indexed options have a guaranteed 0% downside floor—meaning market drops never touch your principal or locked-in gains. No reply needed—just wanted you to have peace of mind for your files! Hope your classes are going smoothly today at {{school}}.',
  },
  {
    id: 'tpl_za_frs_sick_leave',
    title: 'Terminal Sick Leave Tax-Shelter Rollover',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick FRS tip: rolling accumulated terminal sick leave into an approved tax-sheltered vehicle upon retirement prevents thousands in lost taxes compared to a cash payout. No reply needed—just wanted you to have this in your records! - {{my_name}}',
  },
  {
    id: 'tpl_za_frs_drop_tax',
    title: 'DROP Lump Sum 20% Tax Withholding Trap',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick FRS heads-up: cashing out DROP funds directly triggers an automatic 20% federal tax withholding, but rolling into an educator IRA or 403(b) protects 100% of your lump sum. Just a helpful tip for your retirement files! Have a great week at {{school}}.',
  },
  {
    id: 'tpl_za_frs_multiplier',
    title: 'Pension Multiplier Formula Insight',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick FRS formula reminder: under the Pension Plan, 25 years at 1.6% replaces 40% of your average final compensation, leaving a 60% income gap. Just sharing so you have clear clarity on how state benefits compound over time!',
  },
];

/**
 * Bank 2: Zero-Ask School & Community Goodwill
 * Fosters warm personal rapport, expresses teacher appreciation, and reinforces community solidarity.
 */
export const ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_za_school_encouragement',
    title: 'Educator & Classroom Appreciation',
    stage: 'bridge',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, knowing how demanding this time of the school year gets for teachers at {{school}}, just wanted to send a quick note of encouragement. Thank you for everything you do for our students and school community every day! - {{my_name}} with {{company}}',
  },
  {
    id: 'tpl_za_school_payroll_cutoff',
    title: 'District Mid-Month Payroll Heads-Up',
    stage: 'monthly',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick friendly heads-up: district payroll cutoffs for any pre-tax benefit adjustments happen mid-month. Hope you have a restful Friday and an even better weekend at {{school}}! - {{my_name}}',
  },
  {
    id: 'tpl_za_school_testing_season',
    title: 'Testing Season & Semester Encouragement',
    stage: 'bridge',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, hope testing season is treating you well at {{school}}! Know that your hard work and dedication to your students do not go unnoticed. Wishing you a calm and steady week ahead! - {{my_name}}',
  },
  {
    id: 'tpl_za_school_back_to_school',
    title: 'New Semester & Post-Break Reset',
    stage: 'monthly',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, hope you had a rejuvenating break! Wishing you a smooth and energized semester at {{school}}. If you ever need anything district-related, I am always in your corner. Have a wonderful week back!',
  },
  {
    id: 'tpl_za_school_weekend',
    title: 'Restful Weekend & Teacher Gratitude',
    stage: 'bridge',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, happy Friday! Reaching out to wish you a well-deserved, restful weekend after a full week in {{room_number}} at {{school}}. Thank you for being such an impactful educator! - {{my_name}}',
  },
];

/**
 * Bank 3: Direct Appointment Asks (FRS Track)
 * High-conversion appointment-seeking messages.
 */
export const DIRECT_ASK_NURTURE_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_nurture_sprint_24h',
    title: 'Sprint 24h - Meeting Summary & Next Step',
    stage: 'sprint',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me at {{school}}! Did the numbers we put together make sense, or did any questions pop up when you reflected on it?',
  },
  {
    id: 'tpl_nurture_sprint_48h',
    title: 'Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your FRS & 403(b) paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  {
    id: 'tpl_nurture_bridge_wk3',
    title: 'Bridge Wk 3 - Paycheck Cycle & Opportunity Cost',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a district payroll deduction cutoff often delays compound growth more than people realize. Let's make sure your 403(b) allocation is locked in before this month's payroll cutoff—can we touch base in {{room_number}} this week?",
  },
  {
    id: 'tpl_nurture_bridge_wk6',
    title: 'Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, I know how busy things get at school. Should we hit pause on your retirement review until next term, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  {
    id: 'tpl_nurture_month3_floor',
    title: 'Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: educator retirement annuities feature a guaranteed 0% downside floor with growth tied to market gains. PS: Happy to compare your current savings options anytime during {{planning_period}}!',
  },
  {
    id: 'tpl_nurture_month5_milestones',
    title: 'Month 5 - Open Enrollment & Longevity Milestones',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} checking in! As school calendar deadlines approach, it's a great time to ensure your FRS DROP date, beneficiary designations, and supplemental plans align. PS: Can stop by {{school}} this week if you need a quick review!",
  },
  {
    id: 'tpl_nurture_month6_seasonal',
    title: 'Monthly - FRS Retirement Roadmap Check-in',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, hope all is well at {{school}}! Reaching out with your seasonal FRS retirement check-in. Whether you are 2 years or 20 years from retirement, small tweaks make a massive difference. PS: When you have 10 minutes free during planning, let's catch up!",
  },
];

/**
 * Bank 4: Zero-Ask Pure Financial Insights (Non-FRS Track)
 */
export const ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_za_non_frs_ss_gap',
    title: 'Social Security 40% Replacement Gap',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick financial insight: Social Security is designed to replace only about 40% of pre-retirement earnings, making personal tax-sheltered reserves essential. No reply needed—just wanted to share this for your records! Have a wonderful week ahead.',
  },
  {
    id: 'tpl_za_non_frs_tax_compound',
    title: 'Pre-Tax Compounding Math ($100 for $75)',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick retirement math thought: voluntary pre-tax contributions reduce your current taxable income dollar-for-dollar, meaning saving $100/mo typically only reduces take-home pay by around $75 depending on your bracket. Just sharing a quick insight for your files! - {{my_name}}',
  },
  {
    id: 'tpl_za_non_frs_downside_floor',
    title: '0% Downside Floor Annuity Protection',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, with market volatility making headlines, a quick reminder that fixed-indexed retirement annuities come with a guaranteed 0% downside floor—your principal and locked-in interest gains are never subject to market losses. Hope you have a great week!',
  },
  {
    id: 'tpl_za_non_frs_rule_of_72',
    title: 'Rule of 72 & Compound Delay',
    stage: 'monthly',
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick financial nugget: the "Rule of 72" shows that at a 7% return, your money doubles approximately every 10 years. That means starting just 5 years earlier can double your eventual retirement nest egg. Just food for thought for your retirement files!',
  },
];

/**
 * Bank 5: Zero-Ask Client Goodwill (Non-FRS Track)
 */
export const ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_za_non_frs_appreciation',
    title: 'Client Appreciation & Gratitude',
    stage: 'bridge',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, knowing how busy modern schedules get, just wanted to send a quick note wishing you a wonderful and productive week! Thank you for the opportunity to assist with your financial goals. - {{my_name}} with {{company}}',
  },
  {
    id: 'tpl_za_non_frs_weekend',
    title: 'Weekend Recharge Greeting',
    stage: 'monthly',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, quick friendly note wishing you a restful and relaxing weekend ahead! Hope you take some time to recharge with family and friends. - {{my_name}} with {{company}}',
  },
  {
    id: 'tpl_za_non_frs_seasonal',
    title: 'Seasonal Reset & Personal Wishes',
    stage: 'monthly',
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, hope the season is treating you well! Reaching out with warm thoughts and wishing you peace, good health, and continued success. If you ever have general financial questions, I am always in your corner. - {{my_name}}',
  },
];

/**
 * Bank 6: Direct Appointment Asks (Non-FRS Track)
 */
export const DIRECT_ASK_NON_FRS_NURTURE_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_non_frs_nurture_sprint_24h',
    title: 'Non-FRS Sprint 24h - Meeting Summary & Next Step',
    stage: 'sprint',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me! Did the numbers and retirement options we discussed make sense, or did any questions pop up when you reflected on it?',
  },
  {
    id: 'tpl_non_frs_nurture_sprint_48h',
    title: 'Non-FRS Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your retirement rollover or savings paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  {
    id: 'tpl_non_frs_nurture_bridge_wk2',
    title: 'Non-FRS Bridge Wk 2 - Downside Protection Proof',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. A client I worked with recently had the exact same question about protecting their savings from market losses while keeping upside potential. Would 10 mins work to look at bridging that gap?',
  },
  {
    id: 'tpl_non_frs_nurture_bridge_wk3',
    title: 'Non-FRS Bridge Wk 3 - Compound Growth & Cutoff',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a contribution cycle or rollover window often delays compound growth more than people realize. Let's make sure your retirement allocation is set up—can we touch base for 10 minutes this week?",
  },
  {
    id: 'tpl_non_frs_nurture_bridge_wk6',
    title: 'Non-FRS Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, I know how busy life gets. Should we hit pause on your retirement review for now, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  {
    id: 'tpl_non_frs_nurture_month3_floor',
    title: 'Non-FRS Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: retirement fixed-indexed annuities feature a guaranteed 0% downside floor with growth tied to index gains. PS: Happy to compare your current savings options anytime!',
  },
  {
    id: 'tpl_non_frs_nurture_month5_milestones',
    title: 'Non-FRS Month 5 - Account & Beneficiary Alignment',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, {{my_name}} checking in! It's a great time to ensure your retirement accounts, beneficiary designations, and rollover options align with your goals. PS: Let me know if you'd like a quick 10-minute review this week!",
  },
  {
    id: 'tpl_non_frs_nurture_month6_seasonal',
    title: 'Non-FRS Monthly - Retirement Roadmap Check-in',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, hope all is well! Reaching out with your seasonal retirement roadmap check-in. Whether you are 2 years or 20 years from retirement, small compound tweaks make a massive difference. PS: When you have 10 minutes free, let's catch up!",
  },
];

/**
 * Legacy templates kept for backward-compatibility with previously seeded databases.
 */
export const LEGACY_NURTURE_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_nurture_day7_multiplier',
    title: 'Day 7 - Pension Multiplier Gap',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Quick reminder: under FRS Pension, 25 years at 1.6% replaces only 40% of your income. Would 10 mins during your planning period at {{school}} work to look at bridging that gap?',
  },
  {
    id: 'tpl_nurture_day21_drop_inflation',
    title: 'Day 21 - DROP & Inflation Awareness',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, {{my_name}} here. With FRS post-2011 service having 0% cost-of-living adjustments, planning your DROP window early is critical. When can we do a 15-min sit-down during planning in {{room_number}}?',
  },
  {
    id: 'tpl_nurture_day45_tax_catchup',
    title: 'Day 45 - 403(b) Tax Deductions',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Did you know contributing to a voluntary 403(b) lowers your taxable income on your paycheck? Let me know if you want to run your take-home pay numbers this week.',
  },
  {
    id: 'tpl_nurture_day90_semester_checkin',
    title: 'Day 90 - Semester Check-in',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, hope your semester at {{school}} is going well! Just checking in on your FRS retirement timeline. I will be on campus this week—let me know if you'd like a quick 10-min update during {{planning_period}}!",
  },
  {
    id: 'tpl_non_frs_nurture_bridge_wk4',
    title: 'Non-FRS Bridge Wk 4 - 9-Word Reset',
    stage: 'bridge',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, are you still looking to optimize your retirement and savings options this year? - {{my_name}}, {{company}}',
  },
  {
    id: 'tpl_non_frs_nurture_month2_ss_gap',
    title: 'Non-FRS Month 2 - Social Security Income Gap',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick retirement planning fact: relying solely on Social Security replaces only about 40% of pre-retirement earnings. PS: If your timeline or income changed, we can recalculate your optimal target in a 5-min check-in!',
  },
  {
    id: 'tpl_non_frs_nurture_month4_tax',
    title: 'Non-FRS Month 4 - Tax Advantages & Growth',
    stage: 'monthly',
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, did you know voluntary tax-advantaged retirement contributions can significantly reduce your current taxable income? PS: Let me know if you want to run your take-home pay and savings numbers before next month!',
  },
];

/**
 * Track B: Client Servicing, Hygiene & Outside Asset Discovery Cadence (FRS Track)
 * Transforms customer service into a referral and asset-consolidation engine.
 */
export const CLIENT_REVIEW_DRIP_TEMPLATES: SMSTemplate[] = [
  // Step 0: Day 30 - First Paycheck Deduction Verification
  {
    id: 'tpl_client_day30_paycheck',
    title: 'Day 30 - First Paycheck Deduction Check',
    stage: 'client',
    phase_label: 'Onboarding (Day 30)',
    suggested_delay_days: 30,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Just checking in to make sure your first {{product}} deduction is showing up accurately on your district pay stub. Everything look good on your end?',
  },
  // Step 1: Day 90 - Policy Reassurance & 0% Floor
  {
    id: 'tpl_client_day90_touchpoint',
    title: 'Day 90 - Client Policy Peace of Mind',
    stage: 'client',
    phase_label: 'Policy Hygiene (Day 90)',
    suggested_delay_days: 60,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} checking in! Just verifying that your {{product}} deduction is running smoothly. Your funds are protected by the 0% downside guarantee. Let me know if any questions have come up!',
  },
  // Step 2: Day 180 - Mid-Year & Spouse 401(k) / Outside Asset Discovery
  {
    id: 'tpl_client_day180_market_update',
    title: 'Day 180 - Mid-Year & Outside Asset Check',
    stage: 'client',
    phase_label: 'Cross-Sell (Day 180)',
    suggested_delay_days: 90,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: "Hi {{first_name}}, {{my_name}} here with a mid-year check-in! Did you know we also review outside IRAs, former employer accounts, or spouse 401(k)s at no cost for our clients? Let me know if you'd like a quick second set of eyes!",
  },
  // Step 3: Anniversary -90d - Beneficiary & Hygiene Audit
  {
    id: 'tpl_client_anniv90_beneficiary',
    title: 'Anniversary -90d - Beneficiary & Account Hygiene',
    stage: 'client',
    phase_label: 'Servicing (Anniv -90d)',
    suggested_delay_days: 90,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up in about 3 months! Now is a great time to verify that your beneficiaries and contact details are completely up to date. Let me know if you need to make any changes.',
  },
  // Step 4: Anniversary -30d - Annual Review Invitation
  {
    id: 'tpl_client_anniv30_invitation',
    title: 'Anniversary -30d - Annual Review Invitation',
    stage: 'client',
    phase_label: 'Annual Review (Anniv -30d)',
    suggested_delay_days: 60,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up on {{anniversary_date}}! It is time for our brief annual review to examine your gains and ensure your plan matches your FRS milestones. When is a good time to meet during your planning period at {{school}}?',
  },
  // Step 5: Anniversary -7d - Urgent Review Reminder
  {
    id: 'tpl_client_anniv7_reminder',
    title: 'Anniversary -7d - Urgent Review Reminder',
    stage: 'client',
    phase_label: 'Final Reminder (Anniv -7d)',
    suggested_delay_days: 23,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, urgent reminder from {{my_name}}: your annual review is due by {{anniversary_date}}. Let's take 15 mins during your planning period this week in {{room_number}} to finalize your review!",
  },
];

/**
 * Non-FRS Client Servicing, Hygiene & Outside Asset Discovery Cadence
 * Tailored for private clients (no school or district pay stub references).
 */
export const NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES: SMSTemplate[] = [
  // Step 0: Day 30 - First Contribution / Transfer Verification
  {
    id: 'tpl_non_frs_client_day30_contribution',
    title: 'Non-FRS Day 30 - First Contribution Check',
    stage: 'client',
    phase_label: 'Onboarding (Day 30)',
    suggested_delay_days: 30,
    drip_category: 'school_community',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Just checking in to make sure your first {{product}} contribution or transfer is running smoothly. Everything look good on your end?',
  },
  // Step 1: Day 90 - Policy Reassurance & 0% Floor
  {
    id: 'tpl_non_frs_client_day90_touchpoint',
    title: 'Non-FRS Day 90 - Policy Peace of Mind',
    stage: 'client',
    phase_label: 'Policy Hygiene (Day 90)',
    suggested_delay_days: 60,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, {{my_name}} checking in! Just verifying that your {{product}} is running smoothly. Your funds are protected by the 0% downside guarantee. Let me know if any questions have come up!',
  },
  // Step 2: Day 180 - Mid-Year & Outside Asset Check
  {
    id: 'tpl_non_frs_client_day180_market_update',
    title: 'Non-FRS Day 180 - Mid-Year & Outside Asset Check',
    stage: 'client',
    phase_label: 'Cross-Sell (Day 180)',
    suggested_delay_days: 90,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: "Hi {{first_name}}, {{my_name}} here with a mid-year check-in! Did you know we also review outside IRAs, former employer 401(k)s, or spouse accounts at no cost for our clients? Let me know if you'd like a quick second set of eyes!",
  },
  // Step 3: Anniversary -90d - Beneficiary & Hygiene Audit
  {
    id: 'tpl_non_frs_client_anniv90_beneficiary',
    title: 'Non-FRS Anniversary -90d - Beneficiary Audit',
    stage: 'client',
    phase_label: 'Servicing (Anniv -90d)',
    suggested_delay_days: 90,
    drip_category: 'pure_insight',
    is_zero_ask: true,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up in about 3 months! Now is a great time to verify that your beneficiaries and contact details are completely up to date. Let me know if you need to make any changes.',
  },
  // Step 4: Anniversary -30d - Annual Review Invitation
  {
    id: 'tpl_non_frs_client_anniv30_invitation',
    title: 'Non-FRS Anniversary -30d - Annual Review Invitation',
    stage: 'client',
    phase_label: 'Annual Review (Anniv -30d)',
    suggested_delay_days: 60,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up on {{anniversary_date}}! It is time for our brief annual review to examine your gains and ensure your plan matches your retirement goals. When is a good time for a quick review?',
  },
  // Step 5: Anniversary -7d - Urgent Review Reminder
  {
    id: 'tpl_non_frs_client_anniv7_reminder',
    title: 'Non-FRS Anniversary -7d - Urgent Review Reminder',
    stage: 'client',
    phase_label: 'Final Reminder (Anniv -7d)',
    suggested_delay_days: 23,
    drip_category: 'action_appointment',
    is_zero_ask: false,
    body: "Hi {{first_name}}, reminder from {{my_name}}: your annual policy review is due by {{anniversary_date}}. Let's take 15 mins this week to review your accumulated gains and lock them in!",
  },
];

/**
 * Helper to retrieve templates by category and prospect type
 */
export function getTemplatesByCategory(category: DripCategory, isFrs: boolean = true): SMSTemplate[] {
  if (isFrs) {
    if (category === 'pure_insight') return ZERO_ASK_FRS_INSIGHT_TEMPLATES;
    if (category === 'school_community') return ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES;
    return DIRECT_ASK_NURTURE_TEMPLATES;
  } else {
    if (category === 'pure_insight') return ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES;
    if (category === 'school_community') return ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES;
    return DIRECT_ASK_NON_FRS_NURTURE_TEMPLATES;
  }
}

/**
 * Returns the best alternative template for a given step and category
 */
export function getAlternativeTemplate(category: DripCategory, currentStep: number, isFrs: boolean = true): SMSTemplate {
  const bank = getTemplatesByCategory(category, isFrs);
  const index = Math.abs(currentStep) % bank.length;
  return bank[index] || bank[0];
}

/**
 * Global template lookup by ID
 */
export function getDripTemplateById(id: string): SMSTemplate | undefined {
  return ALL_DRIP_TEMPLATES.find((t) => t.id === id);
}

const RAW_ALL_DRIP_TEMPLATES: SMSTemplate[] = [
  ...NURTURE_DRIP_TEMPLATES,
  ...NON_FRS_NURTURE_DRIP_TEMPLATES,
  ...CLIENT_REVIEW_DRIP_TEMPLATES,
  ...NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES,
  ...ZERO_ASK_FRS_INSIGHT_TEMPLATES,
  ...ZERO_ASK_SCHOOL_COMMUNITY_TEMPLATES,
  ...ZERO_ASK_NON_FRS_INSIGHT_TEMPLATES,
  ...ZERO_ASK_NON_FRS_COMMUNITY_TEMPLATES,
  ...DIRECT_ASK_NURTURE_TEMPLATES,
  ...DIRECT_ASK_NON_FRS_NURTURE_TEMPLATES,
  ...LEGACY_NURTURE_TEMPLATES,
];

// Deduplicate preserving first occurrence
const seenTemplateIds = new Set<string>();
export const ALL_DRIP_TEMPLATES: SMSTemplate[] = RAW_ALL_DRIP_TEMPLATES.filter((tpl) => {
  if (seenTemplateIds.has(tpl.id)) return false;
  seenTemplateIds.add(tpl.id);
  return true;
});
