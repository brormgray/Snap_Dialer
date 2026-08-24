export type CallDisposition =
  | 'pending'
  | 'appointment_set'
  | 'connected'
  | 'spoke'
  | 'no_answer'
  | 'voicemail'
  | 'bad_number'
  | 'do_not_call'
  | 'callback_requested';

export interface Lead {
  id: string;
  list_id: string;
  name: string;
  phone: string;
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
  priority_tier: number; // 1 = Fresh/Hot (Default), 2 = Standard, 3 = Legacy/Archive
  cadence_step: number;
  last_attempt_at?: string | null;
  last_disposition?: CallDisposition | null;
  follow_up_at?: string | null;
  attempts_count: number;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
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

export interface SMSTemplate {
  id: string;
  title: string;
  body: string; // supports {{name}}, {{school}}, {{years_in_frs}}, {{meeting_pref}}, {{my_name}}, {{notes}}
}

export interface ExtractedLeadItem {
  id: string;
  name: string;
  phone: string;
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
}

export interface AppSettings {
  gemini_api_key?: string;
  user_name: string;
  auto_advance_seconds: number;
  auto_advance_enabled: boolean;
}
