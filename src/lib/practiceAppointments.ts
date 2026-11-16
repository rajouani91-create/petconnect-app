// Termine der Praxis (Etappe P5b): telefonisch eintragen, verschieben, absagen, erschienen / nicht erschienen.
// Zeiten sind Wanduhrzeiten in Europe/Berlin; in der Datenbank stehen Zeitpunkte (timestamptz).
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';
import { berlinHHMM, berlinInstant } from './medication';
import { berlinDay } from './monthReport';
import { isIsoDate } from './record';

export type ApptStatus = 'new' | 'confirmed' | 'cancelled_practice' | 'cancelled_owner' | 'attended' | 'no_show';
export interface PracticeAppointment {
  id: string; pet_id: string | null; has_access: boolean; pet_label: string; owner_label: string; phone: string | null;
  type_id: string | null; type_name: string; starts_at: string; minutes: number; status: ApptStatus; source: 'phone' | 'online';
  new_client: boolean; note: string | null; cancel_reason: CancelReason | null; cancel_note: string | null; overridden: boolean;
  created_by_name: string; created_at: string;
}

export const STATUS_LABEL: Record<ApptStatus, MessageKey> = {
  new: 'bkStNew', confirmed: 'bkStConfirmed', cancelled_practice: 'bkStCancelledPractice', cancelled_owner: 'bkStCancelledOwner',
  attended: 'bkStAttended', no_show: 'bkStNoShow',
};
export const STATUS_TONE: Record<ApptStatus, string> = {
  new: 'pill-warn', confirmed: 'pill-ok', cancelled_practice: 'pill-crit', cancelled_owner: 'pill-crit', attended: '', no_show: 'pill-crit',
};

export const CANCEL_REASONS = ['vet_ill', 'emergency', 'closed', 'double', 'other'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export const CANCEL_LABEL: Record<CancelReason, MessageKey> = {
  vet_ill: 'bkReasonIll', emergency: 'bkReasonEmergency', closed: 'bkReasonClosed', double: 'bkReasonDouble', other: 'rcReasonOther',
};

// ---------- Zeit ----------

/** Wanduhrzeit (Tag + HH:MM, Europe/Berlin) → ISO-Zeitpunkt */
export const toInstant = (day: string, hhmm: string): string => new Date(berlinInstant(day, hhmm)).toISOString();
export const dayOf = (iso: string): string => berlinDay(iso);
export const timeOf = (iso: string): string => berlinHHMM(iso);
export const endOf = (a: Pick<PracticeAppointment, 'starts_at' | 'minutes'>): string => new Date(new Date(a.starts_at).getTime() + a.minutes * 60000).toISOString();

// ---------- Filter ----------

export type Filter = 'new' | 'confirmed' | 'open' | 'cancelled' | 'all';
export const FILTERS: Filter[] = ['new', 'confirmed', 'open', 'cancelled', 'all'];
export const FILTER_LABEL: Record<Filter, MessageKey> = { new: 'bkFNew', confirmed: 'bkFConfirmed', open: 'bkFOpen', cancelled: 'bkFCancelled', all: 'hsAll' };

/** „Zu klären“: bestätigt, Termin hat begonnen, aber weder erschienen noch nicht erschienen vermerkt */
export const isOpen = (a: PracticeAppointment, now: Date) => a.status === 'confirmed' && new Date(a.starts_at) <= now;

export function matches(a: PracticeAppointment, f: Filter, now: Date): boolean {
  switch (f) {
    case 'new': return a.status === 'new';
    case 'confirmed': return a.status === 'confirmed' && new Date(a.starts_at) > now;
    case 'open': return isOpen(a, now);
    case 'cancelled': return a.status === 'cancelled_practice' || a.status === 'cancelled_owner';
    default: return true;
  }
}

/** Liste nach Filter; „Alle“ und „Abgesagt“ zeigen nur die letzten 60 Tage und die Zukunft (das liefert die Datenbank) */
export function filterAppointments(rows: readonly PracticeAppointment[], f: Filter, now: Date): PracticeAppointment[] {
  return rows.filter((a) => matches(a, f, now));
}

export function counts(rows: readonly PracticeAppointment[], now: Date): Record<Filter, number> {
  const c = { new: 0, confirmed: 0, open: 0, cancelled: 0, all: rows.length } as Record<Filter, number>;
  for (const a of rows) for (const f of ['new', 'confirmed', 'open', 'cancelled'] as const) if (matches(a, f, now)) c[f]++;
  return c;
}

/** Nach Kalendertag gruppiert, Tage aufsteigend */
export function byDay(rows: readonly PracticeAppointment[]): { day: string; items: PracticeAppointment[] }[] {
  const map = new Map<string, PracticeAppointment[]>();
  for (const a of [...rows].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    const d = dayOf(a.starts_at);
    map.set(d, [...(map.get(d) ?? []), a]);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}

// ---------- Warnungen ----------

export type ClosedReason = 'absence' | 'closed_day' | 'outside_hours' | 'break';
export interface Warnings { closed: ClosedReason | null; absence: string | null; overlaps: { pet: string; owner: string; starts_at: string; minutes: number }[] }
export const CLOSED_LABEL: Record<ClosedReason, MessageKey> = { absence: 'bkWAbsence', closed_day: 'bkWClosedDay', outside_hours: 'bkWOutside', break: 'bkWBreak' };
export const hasWarnings = (w: Warnings) => w.closed !== null || w.overlaps.length > 0;

// ---------- Eingabe ----------

export interface BookForm {
  mode: 'patient' | 'free';
  petId: string; petName: string; ownerName: string; phone: string;
  typeId: string; day: string; time: string; newClient: boolean; note: string;
}
export const emptyBook = (day: string, typeId = ''): BookForm => ({ mode: 'patient', petId: '', petName: '', ownerName: '', phone: '', typeId, day, time: '', newClient: false, note: '' });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function bookErrors(v: BookForm, today: string, nowHHMM: string): Partial<Record<keyof BookForm, MessageKey>> {
  const e: Partial<Record<keyof BookForm, MessageKey>> = {};
  if (v.mode === 'patient' && !v.petId) e.petId = 'bkErrPatient';
  if (v.mode === 'free') {
    if (!v.petName.trim()) e.petName = 'piErrPet';
    if (!v.ownerName.trim()) e.ownerName = 'piErrOwner';
  }
  if (!v.typeId) e.typeId = 'bkErrType';
  Object.assign(e, whenErrors(v.day, v.time, today, nowHHMM));
  return e;
}

/** Tag und Uhrzeit: gültig und nicht in der Vergangenheit */
export function whenErrors(day: string, time: string, today: string, nowHHMM: string): { day?: MessageKey; time?: MessageKey } {
  if (!day || !isIsoDate(day)) return { day: 'errDateRequired' };
  if (day < today) return { day: 'bkErrPast' };
  if (!HHMM.test(time)) return { time: 'bkErrTime' };
  if (day === today && time < nowHHMM) return { time: 'bkErrPast' };
  return {};
}

export function bookPayload(v: BookForm): Record<string, string | boolean | null> {
  const base = { type_id: v.typeId, starts_at: toInstant(v.day, v.time), new_client: v.newClient, note: v.note.trim() || null };
  return v.mode === 'patient'
    ? { ...base, pet_id: v.petId }
    : { ...base, pet_name: v.petName.trim(), owner_name: v.ownerName.trim(), phone: v.phone.trim() || null };
}

// ---------- Fehler ----------

const ERROR_KEYS: Record<string, MessageKey> = {
  slot_conflict: 'bkErrConflict', appointment_not_found: 'scErrGone', appointment_closed: 'bkErrClosed', type_not_found: 'bkErrType', patient_not_found: 'ptNotFound',
  time_invalid: 'bkErrTime', no_change: 'rcErrNoChange', reason_required: 'rcErrReason', note_required: 'rcErrNote', pet_name_invalid: 'piErrPet', name_invalid: 'piErrOwner',
  forbidden: 'pe_forbidden', practice_pending: 'pe_forbidden', practice_suspended: 'pe_forbidden', too_many_requests: 'piErrTooMany',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function bookingErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Datenbank ----------

export async function practiceAppointments(): Promise<PracticeAppointment[]> {
  const { data, error } = await supabase.rpc('practice_appointments');
  if (error) throw error;
  return (data ?? []) as unknown as PracticeAppointment[];
}

export async function checkSlot(startsAt: string, minutes: number, exclude?: string): Promise<Warnings> {
  const { data, error } = await supabase.rpc('practice_appointment_check', { p_starts_at: startsAt, p_minutes: minutes, ...(exclude ? { p_exclude: exclude } : {}) });
  if (error) throw error;
  const w = (data ?? {}) as Partial<Warnings>;
  return { closed: w.closed ?? null, absence: w.absence ?? null, overlaps: w.overlaps ?? [] };
}

export async function freeSlots(minutes: number, from: string, days = 1, limit = 40, exclude?: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('practice_free_slots', { p_minutes: minutes, p_from: from, p_days: days, p_limit: limit, ...(exclude ? { p_exclude: exclude } : {}) });
  if (error) throw error;
  return (data ?? []) as unknown as string[];
}

export async function bookAppointment(v: BookForm, force: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('practice_book_appointment', { p: bookPayload(v) as unknown as Json, p_force: force });
  if (error) throw error;
  return data as string;
}

export async function moveAppointment(id: string, startsAt: string, force: boolean): Promise<void> {
  const { error } = await supabase.rpc('practice_move_appointment', { p_id: id, p_starts_at: startsAt, p_force: force });
  if (error) throw error;
}

export async function cancelAppointment(id: string, reason: CancelReason, note: string): Promise<void> {
  const { error } = await supabase.rpc('practice_cancel_appointment', { p_id: id, p_reason: reason, p_note: note.trim() });
  if (error) throw error;
}

export async function markAppointment(id: string, attended: boolean): Promise<void> {
  const { error } = await supabase.rpc('practice_mark_appointment', { p_id: id, p_attended: attended });
  if (error) throw error;
}

export async function confirmAppointment(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_confirm_appointment', { p_id: id });
  if (error) throw error;
}
