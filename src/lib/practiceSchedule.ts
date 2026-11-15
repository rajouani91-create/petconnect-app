// Termin-Einstellungen der Praxis (Etappe P5a): Sprechzeiten, Terminarten, Abwesenheiten, Buchungsfenster.
// Alle im Team lesen; ändern darf nur die Praxisleitung (prüft die Datenbank).
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';
import { isIsoDate } from './record';

export interface DayHours { weekday: number; open: boolean; opens: string; closes: string; break_from: string | null; break_to: string | null }
export interface AppointmentType { id: string; name: string; minutes: number; online: boolean }
export interface Absence { id: string; from: string; to: string; reason: string | null }
export interface PracticeSchedule { can_edit: boolean; weeks_ahead: number; hours: DayHours[]; types: AppointmentType[]; absences: Absence[] }

export const MINUTES = [10, 15, 20, 30, 45, 60] as const;
export const WEEKS_AHEAD = [4, 8, 12] as const;
export const TYPE_NAME_MAX = 60;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fehler eines Tages: Zeiten gültig, „von“ vor „bis“, Pause vollständig und innerhalb der Sprechzeit. Geschlossene Tage werden nicht geprüft. */
export function dayError(d: DayHours): MessageKey | null {
  if (!d.open) return null;
  if (!HHMM.test(d.opens) || !HHMM.test(d.closes)) return 'scErrTime';
  if (d.opens >= d.closes) return 'scErrOrder';
  const bf = d.break_from ?? '';
  const bt = d.break_to ?? '';
  if (!bf && !bt) return null;
  if (!HHMM.test(bf) || !HHMM.test(bt)) return 'scErrBreak';
  if (!(d.opens < bf && bf < bt && bt < d.closes)) return 'scErrBreak';
  return null;
}

/** Für die Datenbank: geschlossene Tage behalten gültige Zeiten, leere Pause wird null */
export function hoursPayload(hours: readonly DayHours[]): DayHours[] {
  return hours.map((d) => {
    const valid = HHMM.test(d.opens) && HHMM.test(d.closes) && d.opens < d.closes;
    const brk = d.open && !!d.break_from && !!d.break_to;
    return {
      weekday: d.weekday, open: d.open,
      opens: d.open || valid ? d.opens : '08:00', closes: d.open || valid ? d.closes : '18:00',
      break_from: brk ? d.break_from : null, break_to: brk ? d.break_to : null,
    };
  });
}

/** Kurztext eines Tages, z. B. „08:00–12:00, 14:00–18:00“ */
export function dayText(d: DayHours, closed: string): string {
  if (!d.open) return closed;
  return d.break_from && d.break_to ? `${d.opens}–${d.break_from}, ${d.break_to}–${d.closes}` : `${d.opens}–${d.closes}`;
}

/** Name des Wochentags (1 = Montag) in der Sprache der Oberfläche */
export function weekdayName(weekday: number, locale: string, style: 'long' | 'short' = 'long'): string {
  // 5. Januar 2026 ist ein Montag
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + weekday)));
}

export function absenceError(from: string, to: string, today: string): MessageKey | null {
  if (!from || !isIsoDate(from)) return 'scErrAbsFrom';
  const end = to || from;
  if (!isIsoDate(end) || end < from) return 'scErrAbsOrder';
  if (end < today) return 'scErrAbsPast';
  return null;
}

const ERROR_KEYS: Record<string, MessageKey> = {
  forbidden: 'scErrLead', practice_pending: 'pe_forbidden', practice_suspended: 'pe_forbidden', hours_order: 'scErrOrder', break_invalid: 'scErrBreak',
  time_invalid: 'scErrTime', hours_invalid: 'scErrTime', type_exists: 'scErrTypeExists', last_type: 'scErrLastType', too_many_types: 'scErrTooMany',
  name_invalid: 'scErrTypeName', minutes_invalid: 'scErrTypeName', type_not_found: 'scErrGone', absence_not_found: 'scErrGone', absence_invalid: 'scErrAbsOrder',
  too_many_absences: 'scErrTooMany',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function scheduleErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Datenbank ----------

export async function practiceSchedule(): Promise<PracticeSchedule> {
  const { data, error } = await supabase.rpc('practice_schedule');
  if (error) throw error;
  return data as unknown as PracticeSchedule;
}

export async function saveHours(hours: readonly DayHours[]): Promise<void> {
  const { error } = await supabase.rpc('practice_save_hours', { p_hours: hoursPayload(hours) as unknown as Json });
  if (error) throw error;
}

export async function saveAppointmentType(id: string | null, name: string, minutes: number, online: boolean): Promise<void> {
  const { error } = await supabase.rpc('practice_save_appointment_type', { p_id: id as string, p_name: name.trim(), p_minutes: minutes, p_online: online });
  if (error) throw error;
}

export async function removeAppointmentType(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_remove_appointment_type', { p_id: id });
  if (error) throw error;
}

export async function addAbsence(from: string, to: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('practice_add_absence', { p_from: from, p_to: to || from, p_reason: reason.trim() });
  if (error) throw error;
}

export async function removeAbsence(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_remove_absence', { p_id: id });
  if (error) throw error;
}

export async function setBookingWindow(weeks: number): Promise<void> {
  const { error } = await supabase.rpc('practice_set_booking_window', { p_weeks: weeks });
  if (error) throw error;
}
