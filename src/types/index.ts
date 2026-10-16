export type CallDisposition =
  | 'pending'
  | 'appointment_set'
  | 'connected'
  | 'spoke'
  | 'no_answer'
  | 'voicemail'
  | 'bad_number'
  | 'do_not_call'
  | 'callback_requested'
  | 'sms_sent'
  | 'drip_sent'
  | 'other';

export type ClientProduct =
  | 'flow_annuity'       // 403(b) / 457(b) ongoing payroll deduction annuity
  | 'annuity_transfer'   // Lump-sum pension DROP rollover / traditional IRA transfer
  | 'life_insurance'     // Term, Whole Life, or Indexed Universal Life
  | 'investments';       // Advisory accounts, mutual funds, or brokerage

export type DripTrack =
  | 'prospect_nurture'      // Periodic educational touchpoints for non-closing prospects
  | 'client_annual_review'  // Post-conversion policy servicing and anniversary review cadence
  | 'none';

export type AppointmentOutcome =
  | 'converted'             // Met and converted into client
  | 'nurture_drip'          // Met, did not buy yet, enrolled in Track A prospect drip
  | 'rescheduled'           // Sit-down postponed to a new confirmed time
  | 'no_show'               // Educator was unavailable / not in classroom
  | 'declined';             // Met or called, decided not to proceed

export interface Lead {
  id: string;
  list_id: string;
  name: string;
  phone: string;
  alternate_phones?: string[] | null; // Secondary / alternate numbers to try (desk, alternate mobile, previous intake)
  email?: string | null;
  school?: string | null; // School name or district (e.g. VOL, Volusia County)
  age?: string | null; // Age or DOB
  planning_period?: string | null; // Teacher's planning period
  room_number?: string | null; // Classroom room number
  years_in_frs?: string | null; // # of years working in Florida Retirement System
  text_ok?: boolean | null; // Text Ok? Y/N
  frs_knowledge?: string | null; // 'Not very much' | 'I know a little' | 'Very well'
  frs_interests?: string[] | null; // Checked items: DROP, 403b, Guaranteed 5% bonus, Life insurance, etc.
  custom_questions?: string | null; // "I have a question about: ..."
  meeting_preferences?: string[] | null; // 1st, 2nd, 3rd preferred meeting times (e.g. Mon 1-2 PM)
  annual_salary?: string | null;
  present_403b_contribution?: string | null;
  source_image_uri?: string | null;
  company?: string | null;
  notes?: string | null;
  priority_tier: number; // 1 = Fresh/Hot (Default), 2 = Standard, 3 = Legacy/Archive
  cadence_step: number;
  last_attempt_at?: string | null;
  last_disposition?: CallDisposition | null;
  follow_up_at?: string | null;
  attempts_count: number;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;

  // --- Client Conversion & Production Fields ---
  is_client?: boolean;
  is_frs?: boolean; // Defaults to true (FRS educator/client). If false, non-FRS prospect/client
  client_since?: string | null;
  products?: ClientProduct[] | null;
  annualized_premium?: number | null; // Ongoing flow annual premium in USD
  transfer_assets_volume?: number | null; // Lump sum rollover / transfer asset volume in USD
  policy_effective_date?: string | null; // YYYY-MM-DD
  annual_review_due_date?: string | null; // YYYY-MM-DD

  // --- Automated Drip Tracking Fields ---
  drip_track?: DripTrack | null;
  drip_step?: number;
  last_drip_sent_at?: string | null;
  next_drip_scheduled_at?: string | null;

  // --- Post-Appointment Sit-Down Lifecycle Fields ---
  appointment_scheduled_at?: string | null; // ISO 8601 string of confirmed sit-down
  appointment_outcome?: AppointmentOutcome | null; // Post-appointment disposition outcome
  appointment_completed_at?: string | null; // ISO 8601 timestamp of when dispo was recorded
  appointment_notes?: string | null; // Dedicated appointment purpose, agenda, or location notes
}

export interface LeadList {
  id: string;
  title: string;
  source_image_uri?: string | null;
  total_leads: number;
  completed_leads: number;
  connected_leads: number;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  lead_id: string;
  list_id: string;
  timestamp: string;
  duration_seconds: number;
  disposition: CallDisposition;
  note?: string;
  sms_sent: boolean;
  sms_body?: string;
}

export interface CadenceRule {
  id: string;
  step_number: number;
  condition_disposition: CallDisposition | 'any_unconnected';
  action_type: 'call_only' | 'call_and_sms' | 'sms_only';
  sms_template_id?: string | null;
  delay_hours: number;
}

export type DripStage = 'sprint' | 'bridge' | 'monthly' | 'client';

export type DripCategory = 'action_appointment' | 'pure_insight' | 'school_community';

export interface SMSTemplate {
  id: string;
  title: string;
  body: string; // supports {{name}}, {{first_name}}, {{school}}, {{years_in_frs}}, {{meeting_pref}}, {{my_name}}, {{company}}, {{notes}}, {{room_number}}, {{planning_period}}, {{product}}, {{anniversary_date}}
  stage?: DripStage;
  phase_label?: string;
  suggested_delay_days?: number;
  drip_category?: DripCategory;
  is_zero_ask?: boolean;
}

export interface ExtractedLeadItem {
  id?: string;
  name: string;
  phone: string;
  alternate_phones?: string[];
  email?: string;
  school?: string;
  age?: string;
  planning_period?: string;
  room_number?: string;
  years_in_frs?: string;
  text_ok?: boolean;
  frs_knowledge?: string;
  frs_interests?: string[];
  custom_questions?: string;
  meeting_preferences?: string[];
  annual_salary?: string;
  present_403b_contribution?: string;
  source_image_uri?: string | null;
  company?: string;
  notes?: string;
  priority_tier?: number; // 1 = Fresh/Hot (Default), 3 = Legacy/Archive
  list_id?: string;
  isDuplicate?: boolean;
  isValid: boolean;

  // Optional client & drip fields
  is_client?: boolean;
  is_frs?: boolean;
  client_since?: string | null;
  products?: ClientProduct[];
  annualized_premium?: number | null;
  transfer_assets_volume?: number | null;
  policy_effective_date?: string | null;
  annual_review_due_date?: string | null;
  drip_track?: DripTrack | null;
  drip_step?: number;
  last_drip_sent_at?: string | null;
  next_drip_scheduled_at?: string | null;

  // Optional post-appointment lifecycle fields
  appointment_scheduled_at?: string | null;
  appointment_outcome?: AppointmentOutcome | null;
  appointment_completed_at?: string | null;
}

export interface ClientConversionPayload {
  products: ClientProduct[];
  annualized_premium?: number | null;
  transfer_assets_volume?: number | null;
  policy_effective_date?: string | null;
  annual_review_due_date?: string | null;
  notes?: string | null;
  drip_track?: DripTrack | null;
}

export interface ClientProductionKPIs {
  totalClients: number;
  totalAnnualizedPremium: number;       // In USD
  totalTransferVolume: number;          // In USD
  averagePremiumPerClient: number;      // Across all clients in USD
  averagePremiumPerActiveFlow: number;  // Across clients with annualized_premium > 0 in USD
  clientsDueForReviewCount: number;
  activeDripsCount: number;
  productDistribution: Record<ClientProduct, number>;
}

export interface AppSettings {
  gemini_api_key?: string;
  user_name: string;
  agency_name?: string; // Agency / RIA / Company represented (e.g. "ValuTeachers"), used dynamically in messaging
  auto_advance_seconds: number;
  auto_advance_enabled: boolean;
}
