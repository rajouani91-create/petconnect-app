// Anfragen (Etappe P6): Halter:innen schreiben einer Praxis mit Freigabe; die Praxis antwortet, bietet Termine an oder schließt ab.
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';

export const TOPICS = ['question', 'prescription', 'symptoms'] as const;
export type Topic = (typeof TOPICS)[number];
export const URGENCIES = ['normal', 'soon', 'emergency'] as const;
export type Urgency = (typeof URGENCIES)[number];
export type InquiryStatus = 'open' | 'answered' | 'done';

export const TOPIC_LABEL: Record<Topic, MessageKey> = { question: 'iqTopicQuestion', prescription: 'iqTopicPrescription', symptoms: 'iqTopicSymptoms' };
export const URGENCY_LABEL: Record<Urgency, MessageKey> = { emergency: 'iqUrgEmergency', soon: 'iqUrgSoon', normal: 'iqUrgNormal' };
export const URGENCY_TONE: Record<Urgency, string> = { emergency: 'pill-crit', soon: 'pill-warn', normal: '' };
export const STATUS_LABEL: Record<InquiryStatus, MessageKey> = { open: 'iqStOpen', answered: 'iqStAnswered', done: 'iqStDone' };
export const STATUS_TONE: Record<InquiryStatus, string> = { open: 'pill-warn', answered: 'pill-ok', done: '' };
export const MESSAGE_MAX = 1000;
export const MAX_OFFER = 3;

export interface PracticeInquiry {
  id: string; pet_id: string; has_access: boolean; pet_label: string; owner_label: string; topic: Topic; urgency: Urgency; message: string;
  status: InquiryStatus; reply: string | null; replied_at: string | null; replied_by_name: string | null;
  offered_slots: string[] | null; offered_type_name: string | null; booked_appointment_id: string | null; created_at: string;
  /** Auftrag 13: Nachricht der Praxis (origin 'practice') mit Antwort der Halter:in */
  origin?: 'owner' | 'practice'; owner_reply?: string | null; owner_replied_at?: string | null; sent_by_name?: string | null;
}
export interface OwnerInquiry {
  id: string; pet_id: string; pet_name: string; practice_name: string; practice_phone: string | null; topic: Topic; urgency: Urgency; message: string;
  status: InquiryStatus; reply: string | null; replied_at: string | null; offered_slots: string[] | null; offered_type_name: string | null;
  can_edit: boolean; created_at: string;
  origin?: 'owner' | 'practice'; owner_reply?: string | null; owner_replied_at?: string | null; sent_by_name?: string | null;
}
export interface InquiryTarget { pet_id: string; pet_name: string; practice_id: string; practice_name: string; practice_phone: string | null }

const RANK: Record<Urgency, number> = { emergency: 0, soon: 1, normal: 2 };
/** Offene zuerst, darin nach Dringlichkeit, dann älteste zuerst */
export function sortInquiries<T extends Pick<PracticeInquiry, 'status' | 'urgency' | 'created_at'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    Number(a.status === 'done') - Number(b.status === 'done') || RANK[a.urgency] - RANK[b.urgency] || a.created_at.localeCompare(b.created_at));
}
export const openCount = (rows: readonly Pick<PracticeInquiry, 'status'>[]) => rows.filter((r) => r.status === 'open').length;

export interface InquiryForm { target: string; topic: Topic | ''; urgency: Urgency; message: string }
export const emptyInquiry = (target = ''): InquiryForm => ({ target, topic: '', urgency: 'normal', message: '' });
/** target = `${pet_id}|${practice_id}` */
export const targetKey = (t: Pick<InquiryTarget, 'pet_id' | 'practice_id'>) => `${t.pet_id}|${t.practice_id}`;

export function inquiryErrors(v: InquiryForm): Partial<Record<keyof InquiryForm, MessageKey>> {
  const e: Partial<Record<keyof InquiryForm, MessageKey>> = {};
  if (!v.target) e.target = 'iqErrTarget';
  if (!v.topic) e.topic = 'iqErrTopic';
  const m = v.message.trim();
  if (!m) e.message = 'iqErrMessage';
  else if (m.length > MESSAGE_MAX) e.message = 'obErrLong';
  return e;
}

const ERROR_KEYS: Record<string, MessageKey> = {
  pet_not_found: 'iqErrNoAccess', status_invalid: 'pe_generic', text_invalid: 'iqErrMessage', too_many_requests: 'iqErrTooMany',
  offer_expired: 'iqErrExpired', slot_taken: 'obErrTaken', slot_conflict: 'obErrTaken', entry_not_found: 'scErrGone', patient_not_found: 'iqErrNoAccess',
  type_not_found: 'bkErrType', time_invalid: 'bkErrTime', forbidden: 'pe_forbidden',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function inquiryErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Praxis ----------

export async function practiceInquiries(): Promise<PracticeInquiry[]> {
  const { data, error } = await supabase.rpc('practice_inquiries');
  if (error) throw error;
  return (data ?? []) as unknown as PracticeInquiry[];
}
export async function replyInquiry(id: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('practice_reply_inquiry', { p_id: id, p_text: text.trim() });
  if (error) throw error;
}
export async function offerInquiry(id: string, typeId: string, slots: string[]): Promise<void> {
  const { error } = await supabase.rpc('practice_offer_inquiry', { p_id: id, p_type_id: typeId, p_slots: slots });
  if (error) throw error;
}
/** Nachricht an die Halter:innen eines Patienten mit Freigabe */
export async function sendPracticeMessage(petId: string, text: string): Promise<string> {
  const { data, error } = await supabase.rpc('practice_send_message', { p_pet: petId, p_text: text.trim() });
  if (error) throw error;
  return data;
}
export async function closeInquiry(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_close_inquiry', { p_id: id });
  if (error) throw error;
}

// ---------- Halter:in ----------

export async function inquiryTargets(): Promise<InquiryTarget[]> {
  const { data, error } = await supabase.rpc('owner_inquiry_targets');
  if (error) throw error;
  return data ?? [];
}
export async function sendInquiry(v: InquiryForm): Promise<string> {
  const [pet_id, practice_id] = v.target.split('|');
  const { data, error } = await supabase.rpc('owner_send_inquiry', { p: { pet_id, practice_id, topic: v.topic, urgency: v.urgency, message: v.message.trim() } as unknown as Json });
  if (error) throw error;
  return data;
}
export async function ownerInquiries(): Promise<OwnerInquiry[]> {
  const { data, error } = await supabase.rpc('owner_inquiries');
  if (error) throw error;
  return (data ?? []) as unknown as OwnerInquiry[];
}
export async function takeInquirySlot(id: string, slot: string): Promise<string> {
  const { data, error } = await supabase.rpc('owner_take_inquiry_slot', { p_id: id, p_slot: slot });
  if (error) throw error;
  return data;
}
/** Antwort der Halter:in auf eine Nachricht der Praxis */
export async function replyPracticeMessage(id: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('owner_reply_message', { p_id: id, p_text: text.trim() });
  if (error) throw error;
}
export async function closeOwnerInquiry(id: string): Promise<void> {
  const { error } = await supabase.rpc('owner_close_inquiry', { p_id: id });
  if (error) throw error;
}
