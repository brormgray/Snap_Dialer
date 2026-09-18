export interface ObjectionCard {
  id: string;
  category: string;
  objection: string;
  quickRebuttal: string;
  verbatimScript: string;
  psychologyNote: string;
}

export const FRS_OBJECTIONS: ObjectionCard[] = [
  {
    id: 'already_have_advisor',
    category: 'Relationship',
    objection: '“I already have a financial advisor / I have someone for that.”',
    quickRebuttal: 'Acknowledge outside advisor, clarify you specialize exclusively in their state FRS Pension & DROP calculation.',
    verbatimScript:
      '“That is wonderful! Most educators we work with have an outside advisor for their general savings. My role is strictly to calculate your Florida Retirement System state pension numbers, your DROP timeline, and how your benefits integrate with your retirement goals. We don’t replace your outside advisor—we provide the official analysis so you have total clarity. I will be on campus Thursday during your planning period—can I pop into your room for 10 minutes just to hand you your numbers?”',
    psychologyNote: 'Teachers think you want to manage their 401(k). Differentiate yourself as the state pension specialist.',
  },
  {
    id: 'too_busy_no_time',
    category: 'Time',
    objection: '“I’m way too busy right now / I don’t have time for this.”',
    quickRebuttal: 'Meet them where they are: in their classroom, during their exact planning period, zero prep required.',
    verbatimScript:
      '“I completely understand—Florida teachers are carrying heavier workloads than ever. That is exactly why I come directly to your classroom during your planning period. You don’t have to drive anywhere or prepare anything. It takes literally 15 minutes right at your desk, and you will walk away knowing your exact retirement date and payout. I see on your card you have Period 3 planning—does Thursday work for a quick 10-minute sit-down?”',
    psychologyNote: 'Lower the energy barrier. Emphasize that you do 100% of the heavy lifting at their desk.',
  },
  {
    id: 'only_few_years_in',
    category: 'Tenure',
    objection: '“I’m only in my 2nd/3rd year, I don’t need to worry about retirement yet.”',
    quickRebuttal: 'Explain the 8-year vesting cliff and early compound bonus incentives.',
    verbatimScript:
      '“Actually, years 1 through 5 are the most critical time to set this up! In the Florida Retirement System, your vesting timeline and the special 5% guaranteed bonus structures lock in early. Setting up even a modest supplemental plan now gives you tens of thousands more in compound growth compared to waiting until year 15. Let’s do a quick 10-minute check in your room this week so you understand how your pension is currently accumulating.”',
    psychologyNote: 'Younger teachers think pensions are for 55+. Frame early planning as maximizing their free state bonuses.',
  },
  {
    id: 'what_is_drop',
    category: 'Pension Context',
    objection: '“What exactly is DROP? I don’t know if I qualify.”',
    quickRebuttal: 'Break down Deferred Retirement Option Program simply as a lump-sum state payout.',
    verbatimScript:
      '“DROP stands for the Deferred Retirement Option Program. Once you reach retirement eligibility in Florida, the state allows you to continue teaching for up to 8 years while depositing your monthly pension check into an interest-bearing account. Many educators walk away with a $200,000 to $400,000 lump sum at retirement. When I visit your classroom this week, I will calculate your exact DROP eligibility date based on your service years.”',
    psychologyNote: 'DROP is the #1 curiosity trigger for Florida educators. Use it to lock in the meeting.',
  },
  {
    id: 'are_you_district',
    category: 'Authority',
    objection: '“Are you with the school district or the union?”',
    quickRebuttal: 'Clarify approved payroll vendor and independent FRS educational specialist.',
    verbatimScript:
      '“We are an approved educational retirement partner serving public school districts and professionals. We specialize in providing independent, objective retirement and pension education that people often don’t receive in standard orientations. I have your review card request right here—I’m reaching out to give you the personalized breakdown you requested.”',
    psychologyNote: 'Reassure them of your legitimate campus presence and cite their original requested card.',
  },
  {
    id: 'send_email_instead',
    category: 'Deflection',
    objection: '“Can you just email me the information?”',
    quickRebuttal: 'Explain that FRS pension formulas are personalized and cannot be conveyed in a generic email.',
    verbatimScript:
      '“I wish I could just email a generic sheet! But because your FRS pension formula depends on your exact hire date, accrued service years, AFC (Average Final Compensation), and DROP timeline, every calculation is 100% unique to you. It takes just 10 minutes in your room for me to show you your personalized numbers on my tablet. Would morning planning or afternoon planning be easier for you this week?”',
    psychologyNote: 'Never agree to just email without securing a sit-down slot; generic emails get deleted.',
  },
];

