import { SMSTemplate } from '../types';

/**
 * Track A: Non-Closed Prospect Nurture Cadence (FRS / Educator Track)
 * Structured around decision psychology:
 * - Sprint (24-48h): Eliminate paperwork friction, summarize sit-down, zero-effort next step.
 * - Bridge (Weeks 2-6): Address status-quo inertia, peer proof, compound cost of delay, 9-word reset.
 * - Monthly Indefinite: Educational authority with subtle P.S. pivot back to completing their plan.
 */
export const NURTURE_DRIP_TEMPLATES: SMSTemplate[] = [
  // Step 0: Sprint Phase (24-48h post-appointment)
  {
    id: 'tpl_nurture_sprint_24h',
    title: 'Sprint 24h - Meeting Summary & Next Step',
    stage: 'sprint',
    phase_label: 'Sprint (24-48h)',
    suggested_delay_days: 1,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me at {{school}}! Did the numbers we put together make sense, or did any questions pop up when you reflected on it?',
  },
  // Step 1: Sprint Phase (48-72h later)
  {
    id: 'tpl_nurture_sprint_48h',
    title: 'Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    phase_label: 'Sprint (48-72h)',
    suggested_delay_days: 2,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your FRS & 403(b) paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  // Step 2: Bridge Phase (Week 2 / +7d)
  {
    id: 'tpl_nurture_bridge_wk2',
    title: 'Bridge Wk 2 - Peer Social Proof',
    stage: 'bridge',
    phase_label: 'Bridge (Week 2)',
    suggested_delay_days: 7,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. A teacher I worked with recently at {{school}} had the exact same concern about protecting their DROP funds while maintaining take-home pay. Would 10 mins during planning work to look at bridging that gap?',
  },
  // Step 3: Bridge Phase (Week 3 / +7d)
  {
    id: 'tpl_nurture_bridge_wk3',
    title: 'Bridge Wk 3 - Paycheck Cycle & Opportunity Cost',
    stage: 'bridge',
    phase_label: 'Bridge (Week 3)',
    suggested_delay_days: 7,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a district payroll deduction cutoff often delays compound growth more than people realize. Let's make sure your 403(b) allocation is locked in before this month's payroll cutoff—can we touch base in Room {{room_number}} this week?",
  },
  // Step 4: Bridge Phase (Week 4 / +7d)
  {
    id: 'tpl_nurture_bridge_wk4',
    title: 'Bridge Wk 4 - 9-Word Reset',
    stage: 'bridge',
    phase_label: 'Bridge (Week 4)',
    suggested_delay_days: 7,
    body: 'Hi {{first_name}}, are you still looking to optimize your FRS pension & retirement options this semester? - {{my_name}}, {{company}}',
  },
  // Step 5: Bridge Phase (Week 6 / +14d)
  {
    id: 'tpl_nurture_bridge_wk6',
    title: 'Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    phase_label: 'Bridge (Week 6)',
    suggested_delay_days: 14,
    body: 'Hi {{first_name}}, I know how busy things get at school. Should we hit pause on your retirement review until next term, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  // Step 6: Monthly Authority (Month 2 / +18d -> ~Day 60)
  {
    id: 'tpl_nurture_month2_multiplier',
    title: 'Month 2 - Pension Multiplier & Sick Leave',
    stage: 'monthly',
    phase_label: 'Monthly (Month 2)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick retirement fact: under FRS Pension, each year earns 1.6%, meaning 25 years replaces only 40% of income. PS: If your years in FRS or salary changed, we can recalculate your optimal take-home in a 5-min check-in!',
  },
  // Step 7: Monthly Authority (Month 3 / +30d)
  {
    id: 'tpl_nurture_month3_floor',
    title: 'Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    phase_label: 'Monthly (Month 3)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: educator retirement annuities feature a guaranteed 0% downside floor with growth tied to market gains. PS: Happy to compare your current savings options anytime during {{planning_period}}!',
  },
  // Step 8: Monthly Authority (Month 4 / +30d)
  {
    id: 'tpl_nurture_month4_tax',
    title: 'Month 4 - Tax Deductions & Take-Home Pay',
    stage: 'monthly',
    phase_label: 'Monthly (Month 4)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, did you know voluntary pre-tax 403(b) contributions reduce your taxable income on your W-2 and can lower income-driven student loan payments? PS: Let me know if you want to run your take-home numbers before next payday!',
  },
  // Step 9: Monthly Authority (Month 5 / +30d)
  {
    id: 'tpl_nurture_month5_milestones',
    title: 'Month 5 - Open Enrollment & Longevity Milestones',
    stage: 'monthly',
    phase_label: 'Monthly (Month 5)',
    suggested_delay_days: 30,
    body: "Hi {{first_name}}, {{my_name}} checking in! As school calendar deadlines approach, it's a great time to ensure your FRS DROP date, beneficiary designations, and supplemental plans align. PS: Can stop by {{school}} this week if you need a quick review!",
  },
  // Step 10: Monthly Indefinite Looping Template
  {
    id: 'tpl_nurture_month6_seasonal',
    title: 'Monthly - FRS Retirement Roadmap Check-in',
    stage: 'monthly',
    phase_label: 'Monthly (Indefinite)',
    suggested_delay_days: 30,
    body: "Hi {{first_name}}, hope all is well at {{school}}! Reaching out with your seasonal FRS retirement check-in. Whether you are 2 years or 20 years from retirement, small tweaks make a massive difference. PS: When you have 10 minutes free during planning, let's catch up!",
  },
];

/**
 * Non-FRS Prospect Nurture Cadence
 * Tailored for private clients and non-educators:
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
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Thank you for taking time to sit down with me! Did the numbers and retirement options we discussed make sense, or did any questions pop up when you reflected on it?',
  },
  // Step 1: Sprint Phase (48-72h later)
  {
    id: 'tpl_non_frs_nurture_sprint_48h',
    title: 'Non-FRS Sprint 48h - Paperwork Roadblock Buster',
    stage: 'sprint',
    phase_label: 'Sprint (48-72h)',
    suggested_delay_days: 2,
    body: "Hi {{first_name}}, {{my_name}} here. Usually the hardest part of finalizing your retirement rollover or savings paperwork is tracking down old statements or custodian logins. If that's holding things up, send me what you have and I can run down the transfer paperwork on my side!",
  },
  // Step 2: Bridge Phase (Week 2 / +7d)
  {
    id: 'tpl_non_frs_nurture_bridge_wk2',
    title: 'Non-FRS Bridge Wk 2 - Downside Protection Proof',
    stage: 'bridge',
    phase_label: 'Bridge (Week 2)',
    suggested_delay_days: 7,
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. A client I worked with recently had the exact same question about protecting their savings from market losses while keeping upside potential. Would 10 mins work to look at bridging that gap?',
  },
  // Step 3: Bridge Phase (Week 3 / +7d)
  {
    id: 'tpl_non_frs_nurture_bridge_wk3',
    title: 'Non-FRS Bridge Wk 3 - Compound Growth & Cutoff',
    stage: 'bridge',
    phase_label: 'Bridge (Week 3)',
    suggested_delay_days: 7,
    body: "Hi {{first_name}}, {{my_name}} here with a quick note. Missing a contribution cycle or rollover window often delays compound growth more than people realize. Let's make sure your retirement allocation is set up—can we touch base for 10 minutes this week?",
  },
  // Step 4: Bridge Phase (Week 4 / +7d)
  {
    id: 'tpl_non_frs_nurture_bridge_wk4',
    title: 'Non-FRS Bridge Wk 4 - 9-Word Reset',
    stage: 'bridge',
    phase_label: 'Bridge (Week 4)',
    suggested_delay_days: 7,
    body: 'Hi {{first_name}}, are you still looking to optimize your retirement and savings options this year? - {{my_name}}, {{company}}',
  },
  // Step 5: Bridge Phase (Week 6 / +14d)
  {
    id: 'tpl_non_frs_nurture_bridge_wk6',
    title: 'Non-FRS Bridge Wk 6 - Permission to Pause',
    stage: 'bridge',
    phase_label: 'Bridge (Week 6)',
    suggested_delay_days: 14,
    body: 'Hi {{first_name}}, I know how busy life gets. Should we hit pause on your retirement review for now, or did you still want to get this off your plate this month? - {{my_name}}',
  },
  // Step 6: Monthly Authority (Month 2 / +18d -> ~Day 60)
  {
    id: 'tpl_non_frs_nurture_month2_ss_gap',
    title: 'Non-FRS Month 2 - Social Security Income Gap',
    stage: 'monthly',
    phase_label: 'Monthly (Month 2)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}. Quick retirement planning fact: relying solely on Social Security replaces only about 40% of pre-retirement earnings. PS: If your timeline or income changed, we can recalculate your optimal target in a 5-min check-in!',
  },
  // Step 7: Monthly Authority (Month 3 / +30d)
  {
    id: 'tpl_non_frs_nurture_month3_floor',
    title: 'Non-FRS Month 3 - 0% Downside Floor & Market Volatility',
    stage: 'monthly',
    phase_label: 'Monthly (Month 3)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, with market swings in the headlines, a quick reminder: retirement fixed-indexed annuities feature a guaranteed 0% downside floor with growth tied to index gains. PS: Happy to compare your current savings options anytime!',
  },
  // Step 8: Monthly Authority (Month 4 / +30d)
  {
    id: 'tpl_non_frs_nurture_month4_tax',
    title: 'Non-FRS Month 4 - Tax Advantages & Growth',
    stage: 'monthly',
    phase_label: 'Monthly (Month 4)',
    suggested_delay_days: 30,
    body: 'Hi {{first_name}}, did you know voluntary tax-advantaged retirement contributions can significantly reduce your current taxable income? PS: Let me know if you want to run your take-home pay and savings numbers before next month!',
  },
  // Step 9: Monthly Authority (Month 5 / +30d)
  {
    id: 'tpl_non_frs_nurture_month5_milestones',
    title: 'Non-FRS Month 5 - Account & Beneficiary Alignment',
    stage: 'monthly',
    phase_label: 'Monthly (Month 5)',
    suggested_delay_days: 30,
    body: "Hi {{first_name}}, {{my_name}} checking in! It's a great time to ensure your retirement accounts, beneficiary designations, and rollover options align with your goals. PS: Let me know if you'd like a quick 10-minute review this week!",
  },
  // Step 10: Monthly Indefinite Looping Template
  {
    id: 'tpl_non_frs_nurture_month6_seasonal',
    title: 'Non-FRS Monthly - Retirement Roadmap Check-in',
    stage: 'monthly',
    phase_label: 'Monthly (Indefinite)',
    suggested_delay_days: 30,
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
    body: 'Hi {{first_name}}, this is {{my_name}} with {{company}}. Quick reminder: under FRS Pension, 25 years at 1.6% replaces only 40% of your income. Would 10 mins during your planning period at {{school}} work to look at bridging that gap?',
  },
  {
    id: 'tpl_nurture_day21_drop_inflation',
    title: 'Day 21 - DROP & Inflation Awareness',
    stage: 'bridge',
    body: 'Hi {{first_name}}, {{my_name}} here. With FRS post-2011 service having 0% cost-of-living adjustments, planning your DROP window early is critical. When can we do a 15-min sit-down during planning in {{room_number}}?',
  },
  {
    id: 'tpl_nurture_day45_tax_catchup',
    title: 'Day 45 - 403(b) Tax Deductions',
    stage: 'bridge',
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Did you know contributing to a voluntary 403(b) lowers your taxable income on your paycheck? Let me know if you want to run your take-home pay numbers this week.',
  },
  {
    id: 'tpl_nurture_day90_semester_checkin',
    title: 'Day 90 - Semester Check-in',
    stage: 'monthly',
    body: "Hi {{first_name}}, hope your semester at {{school}} is going well! Just checking in on your FRS retirement timeline. I will be on campus this week—let me know if you'd like a quick 10-min update during {{planning_period}}!",
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
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Just checking in to make sure your first {{product}} deduction is showing up accurately on your district pay stub. Everything look good on your end?',
  },
  // Step 1: Day 90 - Policy Reassurance & 0% Floor
  {
    id: 'tpl_client_day90_touchpoint',
    title: 'Day 90 - Client Policy Peace of Mind',
    stage: 'client',
    phase_label: 'Policy Hygiene (Day 90)',
    suggested_delay_days: 60,
    body: 'Hi {{first_name}}, {{my_name}} checking in! Just verifying that your {{product}} deduction is running smoothly. Your funds are protected by the 0% downside guarantee. Let me know if any questions have come up!',
  },
  // Step 2: Day 180 - Mid-Year & Spouse 401(k) / Outside Asset Discovery
  {
    id: 'tpl_client_day180_market_update',
    title: 'Day 180 - Mid-Year & Outside Asset Check',
    stage: 'client',
    phase_label: 'Cross-Sell (Day 180)',
    suggested_delay_days: 90,
    body: "Hi {{first_name}}, {{my_name}} here with a mid-year check-in! Did you know we also review outside IRAs, former employer accounts, or spouse 401(k)s at no cost for our clients? Let me know if you'd like a quick second set of eyes!",
  },
  // Step 3: Anniversary -90d - Beneficiary & Hygiene Audit
  {
    id: 'tpl_client_anniv90_beneficiary',
    title: 'Anniversary -90d - Beneficiary & Account Hygiene',
    stage: 'client',
    phase_label: 'Servicing (Anniv -90d)',
    suggested_delay_days: 90,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up in about 3 months! Now is a great time to verify that your beneficiaries and contact details are completely up to date. Let me know if you need to make any changes.',
  },
  // Step 4: Anniversary -30d - Annual Review Invitation
  {
    id: 'tpl_client_anniv30_invitation',
    title: 'Anniversary -30d - Annual Review Invitation',
    stage: 'client',
    phase_label: 'Annual Review (Anniv -30d)',
    suggested_delay_days: 60,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up on {{anniversary_date}}! It is time for our brief annual review to examine your gains and ensure your plan matches your FRS milestones. When is a good time to meet during your planning period at {{school}}?',
  },
  // Step 5: Anniversary -7d - Urgent Review Reminder
  {
    id: 'tpl_client_anniv7_reminder',
    title: 'Anniversary -7d - Urgent Review Reminder',
    stage: 'client',
    phase_label: 'Final Reminder (Anniv -7d)',
    suggested_delay_days: 23,
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
    body: 'Hi {{first_name}}, {{my_name}} with {{company}}! Just checking in to make sure your first {{product}} contribution or transfer is running smoothly. Everything look good on your end?',
  },
  // Step 1: Day 90 - Policy Reassurance & 0% Floor
  {
    id: 'tpl_non_frs_client_day90_touchpoint',
    title: 'Non-FRS Day 90 - Policy Peace of Mind',
    stage: 'client',
    phase_label: 'Policy Hygiene (Day 90)',
    suggested_delay_days: 60,
    body: 'Hi {{first_name}}, {{my_name}} checking in! Just verifying that your {{product}} is running smoothly. Your funds are protected by the 0% downside guarantee. Let me know if any questions have come up!',
  },
  // Step 2: Day 180 - Mid-Year & Outside Asset Check
  {
    id: 'tpl_non_frs_client_day180_market_update',
    title: 'Non-FRS Day 180 - Mid-Year & Outside Asset Check',
    stage: 'client',
    phase_label: 'Cross-Sell (Day 180)',
    suggested_delay_days: 90,
    body: "Hi {{first_name}}, {{my_name}} here with a mid-year check-in! Did you know we also review outside IRAs, former employer 401(k)s, or spouse accounts at no cost for our clients? Let me know if you'd like a quick second set of eyes!",
  },
  // Step 3: Anniversary -90d - Beneficiary & Hygiene Audit
  {
    id: 'tpl_non_frs_client_anniv90_beneficiary',
    title: 'Non-FRS Anniversary -90d - Beneficiary Audit',
    stage: 'client',
    phase_label: 'Servicing (Anniv -90d)',
    suggested_delay_days: 90,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up in about 3 months! Now is a great time to verify that your beneficiaries and contact details are completely up to date. Let me know if you need to make any changes.',
  },
  // Step 4: Anniversary -30d - Annual Review Invitation
  {
    id: 'tpl_non_frs_client_anniv30_invitation',
    title: 'Non-FRS Anniversary -30d - Annual Review Invitation',
    stage: 'client',
    phase_label: 'Annual Review (Anniv -30d)',
    suggested_delay_days: 60,
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up on {{anniversary_date}}! It is time for our brief annual review to examine your gains and ensure your plan matches your retirement goals. When is a good time for a quick review?',
  },
  // Step 5: Anniversary -7d - Urgent Review Reminder
  {
    id: 'tpl_non_frs_client_anniv7_reminder',
    title: 'Non-FRS Anniversary -7d - Urgent Review Reminder',
    stage: 'client',
    phase_label: 'Final Reminder (Anniv -7d)',
    suggested_delay_days: 23,
    body: "Hi {{first_name}}, reminder from {{my_name}}: your annual policy review is due by {{anniversary_date}}. Let's take 15 mins this week to review your accumulated gains and lock them in!",
  },
];

export const ALL_DRIP_TEMPLATES: SMSTemplate[] = [
  ...NURTURE_DRIP_TEMPLATES,
  ...NON_FRS_NURTURE_DRIP_TEMPLATES,
  ...CLIENT_REVIEW_DRIP_TEMPLATES,
  ...NON_FRS_CLIENT_REVIEW_DRIP_TEMPLATES,
  ...LEGACY_NURTURE_TEMPLATES,
];
