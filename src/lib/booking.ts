// Online-Buchung bei einer Praxis (Etappe P5c), Sicht der Halter:in.
// Die Praxis sieht Tiername, Tierart, Name, Terminart, Grund und freiwillig die Telefonnummer – die Tierakte nur mit „freigeben“.
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';

export interface BookingPractice { id: string; name: string; street: string | null; housenumber: string | null; postcode: string | null; city: string | null; phone: string | null; linked: boolean }
export interface BookingType { id: string; name: string; minutes: number }
export interface BookingPet { id: string; name: string; species: string; has_access: boolean }
export interface BookingOptions {
  practice: Omit<BookingPractice, 'linked'>;
  last_day: string;
  types: BookingType[];
  pets: BookingPet[];
}
export type BookingStatus = 'new' | 'confirmed' | 'cancelled_practice' | 'cancelled_owner' | 'attended' | 'no_show';
export interface OwnerBooking {
  appointment_id: string; status: BookingStatus; source: 'phone' | 'online'; practice_name: string; practice_phone: string | null;
  cancel_reason: string | null; cancel_note: string | null; can_cancel: boolean;
  /** Ausweichtermine nach Absage der Praxis (P5e) */
  alternatives?: string[] | null;
  /** Erinnerungen der Praxis in Stunden vorher, z. B. ['48', '2'] */
  reminders?: string[];
  /** Release C: selbst verschieben möglich (bis 24 Stunden vorher, höchstens 3-mal, Praxis bucht online) */
  can_move?: boolean;
  practice_id?: string;
  owner_note?: string | null;
  moved_from?: string | null;
  minutes?: number;
}
export interface OwnerWaitlistEntry {
  id: string; practice_id: string; practice_name: string; pet_id: string; pet_name: string; type_name: string;
  wish_day: string | null; status: 'waiting' | 'offered'; offered_at: string | null; can_take: boolean;
}

export const NOTE_MAX = 300;
export const PHONE_MAX = 40;

/** Stand eines Praxistermins in der Terminliste der Halter:in */
export const OWNER_STATUS_LABEL: Record<BookingStatus, MessageKey> = {
  new: 'obStRequested', confirmed: 'obStConfirmed', cancelled_practice: 'obStCancelledPractice', cancelled_owner: 'obStCancelledOwner',
  attended: 'bkStAttended', no_show: 'bkStNoShow',
};
export const OWNER_STATUS_TONE: Record<BookingStatus, string> = {
  new: 'pill-warn', confirmed: 'pill-ok', cancelled_practice: 'pill-crit', cancelled_owner: '', attended: '', no_show: 'pill-crit',
};

export function practiceAddress(p: Pick<BookingPractice, 'street' | 'housenumber' | 'postcode' | 'city'>): string {
  return [[p.street, p.housenumber].filter(Boolean).join(' '), [p.postcode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/** ISO-Tag plus n Tage (ohne Zeitzonenverschiebung) */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface BookingForm { petId: string; typeId: string; day: string; slot: string; note: string; phone: string; share: boolean }
export const emptyBookingForm = (day: string): BookingForm => ({ petId: '', typeId: '', day, slot: '', note: '', phone: '', share: false });

export function bookingFormErrors(v: BookingForm): Partial<Record<keyof BookingForm, MessageKey>> {
  const e: Partial<Record<keyof BookingForm, MessageKey>> = {};
  if (!v.petId) e.petId = 'obErrPet';
  if (!v.typeId) e.typeId = 'bkErrType';
  if (!v.slot) e.slot = 'obErrSlot';
  if (v.note.trim().length > NOTE_MAX) e.note = 'obErrLong';
  if (v.phone.trim().length > PHONE_MAX) e.phone = 'obErrLong';
  return e;
}

export function bookingPayload(practiceId: string, v: BookingForm, petHasAccess: boolean): Record<string, string | boolean | null> {
  return {
    practice_id: practiceId, pet_id: v.petId, type_id: v.typeId, starts_at: v.slot,
    note: v.note.trim() || null, phone: v.phone.trim() || null, share: !petHasAccess && v.share,
  };
}

const ERROR_KEYS: Record<string, MessageKey> = {
  booking_unavailable: 'obErrUnavailable', slot_taken: 'obErrTaken', time_invalid: 'obErrTaken', type_not_found: 'obErrUnavailable',
  pet_not_found: 'obErrPet', too_many_open: 'obErrTooManyOpen', too_many_requests: 'piErrTooMany', too_late: 'obErrTooLate',
  appointment_closed: 'obErrClosed', appointment_not_found: 'scErrGone', text_too_long: 'obErrLong',
  offer_expired: 'wlErrExpired', entry_not_found: 'scErrGone',
  reason_invalid: 'pe_generic', too_many_moves: 'obErrTooManyMoves',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function bookingOwnerErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Datenbank ----------

export async function bookingPractices(query: string): Promise<BookingPractice[]> {
  const { data, error } = await supabase.rpc('booking_practices', { p_query: query.trim() });
  if (error) throw error;
  return data ?? [];
}

export async function bookingOptions(practiceId: string): Promise<BookingOptions> {
  const { data, error } = await supabase.rpc('booking_options', { p_practice: practiceId });
  if (error) throw error;
  return data as unknown as BookingOptions;
}

export async function bookingFreeSlots(practiceId: string, typeId: string, day: string, days = 1): Promise<string[]> {
  const { data, error } = await supabase.rpc('booking_free_slots', { p_practice: practiceId, p_type: typeId, p_from: day, p_days: days });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function bookAtPractice(practiceId: string, v: BookingForm, petHasAccess: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('owner_book_appointment', { p: bookingPayload(practiceId, v, petHasAccess) as unknown as Json });
  if (error) throw error;
  return data as string;
}

export async function ownerPracticeBookings(): Promise<OwnerBooking[]> {
  const { data, error } = await supabase.rpc('owner_practice_bookings');
  if (error) throw error;
  return (data ?? []) as unknown as OwnerBooking[];
}

export async function cancelBooking(appointmentId: string, reason: string | null = null, note = ''): Promise<void> {
  const { error } = await supabase.rpc('owner_cancel_booking', { p_appointment: appointmentId, p_reason: reason, p_note: note.trim() || null });
  if (error) throw error;
}

// ---------- Verschieben durch die Halter:in (Release C) ----------

/** Freie Zeiten zum Verschieben (gleiche Dauer) ab einem Tag, höchstens 14 Tage */
export async function moveSlots(appointmentId: string, from: string, days = 14): Promise<string[]> {
  const { data, error } = await supabase.rpc('owner_move_slots', { p_appointment: appointmentId, p_from: from, p_days: days });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function moveBooking(appointmentId: string, slot: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('owner_move_booking', { p_appointment: appointmentId, p_slot: slot, p_note: note.trim() || null });
  if (error) throw error;
}

/** Freie Zeiten nach Tag (Europe/Berlin) gruppiert, Tage und Zeiten aufsteigend */
export function slotsByDay(slots: readonly string[], dayOf: (iso: string) => string): { day: string; slots: string[] }[] {
  const m = new Map<string, string[]>();
  for (const s of [...slots].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())) {
    const d = dayOf(s);
    const list = m.get(d);
    if (list) list.push(s); else m.set(d, [s]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, s]) => ({ day, slots: s }));
}

// ---------- Warteliste und Ausweichtermine (Etappe P5e) ----------

export async function joinWaitlist(practiceId: string, petId: string, typeId: string, wishDay: string | null): Promise<void> {
  const { error } = await supabase.rpc('waitlist_join', { p: { practice_id: practiceId, pet_id: petId, type_id: typeId, wish_day: wishDay } as unknown as Json });
  if (error) throw error;
}

export async function ownerWaitlist(): Promise<OwnerWaitlistEntry[]> {
  const { data, error } = await supabase.rpc('owner_waitlist');
  if (error) throw error;
  return (data ?? []) as OwnerWaitlistEntry[];
}

export async function leaveWaitlist(id: string): Promise<void> {
  const { error } = await supabase.rpc('waitlist_leave', { p_id: id });
  if (error) throw error;
}

/** Angebotenen Platz übernehmen; false = Platz inzwischen vergeben (Eintrag wartet wieder) */
export async function takeWaitlistOffer(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('waitlist_take', { p_id: id });
  if (error) throw error;
  return data !== null;
}

export async function takeAlternative(appointmentId: string, slot: string): Promise<void> {
  const { error } = await supabase.rpc('owner_take_alternative', { p_appointment: appointmentId, p_slot: slot });
  if (error) throw error;
}

// ---------- Praxissuche: Online-Buchung bei registrierten Praxen (Release C) ----------

export interface PracticeBookingInfo { directory_id: string; practice_id: string; online: boolean; next_slot: string | null }

/** Für Verzeichnis-IDs registrierter Praxen: online buchbar und nächster freier Termin */
export async function practiceBookingInfo(directoryIds: string[]): Promise<Map<string, PracticeBookingInfo>> {
  const ids = [...new Set(directoryIds)].slice(0, 50);
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc('practice_booking_info', { p_ids: ids });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.directory_id, r]));
}
