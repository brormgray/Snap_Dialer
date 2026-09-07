import { SMSTemplate } from '../types';

export const NURTURE_DRIP_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_nurture_day7_multiplier',
    title: 'Day 7 - Pension Multiplier Gap',
    body: 'Hi {{first_name}}, this is {{my_name}} with ValuTeachers. Quick reminder: under FRS Pension, 25 years at 1.6% replaces only 40% of your income. Would 10 mins during your planning period at {{school}} work to look at bridging that gap?',
  },
  {
    id: 'tpl_nurture_day21_drop_inflation',
    title: 'Day 21 - DROP & Inflation Awareness',
    body: 'Hi {{first_name}}, {{my_name}} here. With FRS post-2011 service having 0% cost-of-living adjustments, planning your DROP window early is critical. When can we do a 15-min sit-down during planning in {{room_number}}?',
  },
  {
    id: 'tpl_nurture_day45_tax_catchup',
    title: 'Day 45 - 403(b) Tax Deductions',
    body: 'Hi {{first_name}}, {{my_name}} with ValuTeachers! Did you know contributing to a voluntary 403(b) lowers your taxable income on your paycheck? Let me know if you want to run your take-home pay numbers this week.',
  },
  {
    id: 'tpl_nurture_day90_semester_checkin',
    title: 'Day 90 - Semester Check-in',
    body: "Hi {{first_name}}, hope your semester at {{school}} is going well! Just checking in on your FRS retirement timeline. I will be on campus this week—let me know if you'd like a quick 10-min update during {{planning_period}}!",
  },
];

export const CLIENT_REVIEW_DRIP_TEMPLATES: SMSTemplate[] = [
  {
    id: 'tpl_client_day90_touchpoint',
    title: 'Day 90 - Client Paycheck Check-in',
    body: 'Hi {{first_name}}, {{my_name}} checking in! Just verifying that your {{product}} deduction is reflecting smoothly on your district pay stub. Everything look good, or do you have any questions for me?',
  },
  {
    id: 'tpl_client_day180_market_update',
    title: 'Day 180 - Mid-Year Policy Update',
    body: 'Hi {{first_name}}, {{my_name}} here with a mid-year check-in! Your {{product}} continues to protect your principal with a 0% downside floor. Let me know if your retirement goals or beneficiaries need any updating.',
  },
  {
    id: 'tpl_client_anniv30_invitation',
    title: 'Anniversary -30d - Annual Review Invitation',
    body: 'Hi {{first_name}}, your {{product}} anniversary is coming up on {{anniversary_date}}! It is time for our brief annual review to examine your gains and ensure your plan matches your FRS milestones. When is a good time to meet during your planning period at {{school}}?',
  },
  {
    id: 'tpl_client_anniv7_reminder',
    title: 'Anniversary -7d - Urgent Review Reminder',
    body: "Hi {{first_name}}, urgent reminder from {{my_name}}: your annual review is due by {{anniversary_date}}. Let's take 15 mins during your planning period this week in {{room_number}} to finalize your review!",
  },
];

export const ALL_DRIP_TEMPLATES: SMSTemplate[] = [
  ...NURTURE_DRIP_TEMPLATES,
  ...CLIENT_REVIEW_DRIP_TEMPLATES,
];
