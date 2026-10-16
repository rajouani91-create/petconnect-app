// Termine und Erinnerungen: reine Hilfsfunktionen (ohne Supabase und React), damit sie testbar sind.
// Zeiten werden in der Zeitzone des Geräts angezeigt; „heute“ ist das lokale Datum.
import type { MessageKey } from '../i18n';
import { daysBetween, isIsoDate } from './record';

// ---------- Datum und Uhrzeit (lokal) ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokales Datum YYYY-MM-DD */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lokale Uhrzeit HH:MM */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function isTime(v: string): boolean {
  return TIME_RE.test(v);
}

/** Lokales Datum + Uhrzeit → Zeitpunkt (ISO mit Z). Ungültig → null. */
export function toInstant(date: string, time: string): string | null {
  if (!isIsoDate(date) || !isTime(time)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** „Di., 03.11.2026, 10:00“ – Wochentag kurz, Datum zweistellig, Uhrzeit */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatTimeOnly(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** „Di., 03.11.2026“ für ein Datum ohne Uhrzeit */
export function formatDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Text kürzen (für Notizen in Listen), an Wortgrenze, mit „…“ */
export function shorten(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

// ---------- Termine ----------

export const APPT_KINDS = ['vet', 'vaccination', 'grooming', 'training', 'other'] as const;
export type ApptKind = (typeof APPT_KINDS)[number];
export const APPT_STATUS = ['planned', 'done', 'cancelled'] as const;
export type ApptStatus = (typeof APPT_STATUS)[number];
export const APPT_TITLE_MAX = 120;
export const APPT_LOCATION_MAX = 200;
export const NOTE_MAX = 1000;

export const APPT_KIND_LABEL: Record<ApptKind, MessageKey> = {
  vet: 'apKindVet',
  vaccination: 'apKindVacc',
  grooming: 'apKindGroom',
  training: 'apKindTraining',
  other: 'apKindOther',
};
export const APPT_STATUS_LABEL: Record<ApptStatus, MessageKey> = {
  planned: 'apStPlanned',
  done: 'apStDone',
  cancelled: 'apStCancelled',
};

export function isApptKind(v: unknown): v is ApptKind {
  return typeof v === 'string' && (APPT_KINDS as readonly string[]).includes(v);
}
export function isApptStatus(v: unknown): v is ApptStatus {
  return typeof v === 'string' && (APPT_STATUS as readonly string[]).includes(v);
}

export interface ApptFormValues {
  petId: string;
  title: string;
  kind: ApptKind;
  date: string;
  start: string;
  end: string;
  location: string;
  note: string;
}
export type ApptErrors = Partial<Record<keyof ApptFormValues, MessageKey>>;

export function validateAppointment(v: ApptFormValues): ApptErrors {
  const e: ApptErrors = {};
  if (!v.petId) e.petId = 'apErrPet';
  const title = v.title.trim();
  if (!title) e.title = 'apErrTitle';
  else if (title.length > APPT_TITLE_MAX) e.title = 'apErrTitleLong';
  if (!v.date) e.date = 'errDateRequired';
  else if (!isIsoDate(v.date)) e.date = 'errDate';
  if (!v.start) e.start = 'apErrStart';
  else if (!isTime(v.start)) e.start = 'apErrTime';
  if (v.end) {
    if (!isTime(v.end)) e.end = 'apErrTime';
    else if (isTime(v.start) && v.end <= v.start) e.end = 'apErrEnd';
  }
  if (v.location.length > APPT_LOCATION_MAX) e.location = 'apErrLocation';
  if (v.note.length > NOTE_MAX) e.note = 'errNoteLong';
  return e;
}

export interface ApptLike {
  starts_at: string;
  status: string;
}

/** Nächste Termine: geplant, ab heute (lokal), aufsteigend. Übrige: vergangen oder abgeschlossen, neueste zuerst. */
export function splitAppointments<T extends ApptLike>(rows: readonly T[], today: string): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const r of rows) {
    if (r.status === 'planned' && localDate(new Date(r.starts_at)) >= today) upcoming.push(r);
    else past.push(r);
  }
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  past.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}

// ---------- Erinnerungen ----------

export const REM_KINDS = ['deworming', 'flea_tick', 'medication', 'vaccination', 'checkup', 'grooming', 'other'] as const;
export type RemKind = (typeof REM_KINDS)[number];
export const REM_KIND_LABEL: Record<RemKind, MessageKey> = {
  deworming: 'rmKindDeworm',
  flea_tick: 'rmKindFlea',
  medication: 'rmKindMed',
  vaccination: 'rmKindVacc',
  checkup: 'rmKindCheck',
  grooming: 'rmKindGroom',
  other: 'rmKindOther',
};
export function isRemKind(v: unknown): v is RemKind {
  return typeof v === 'string' && (REM_KINDS as readonly string[]).includes(v);
}

/** Auswahl der Wiederholung; „eigene“ = freie Anzahl Tage. Keine medizinischen Voreinstellungen je Art. */
export const REPEAT_CHOICES = ['once', 'weekly', 'monthly', 'quarterly', 'halfyear', 'yearly', 'custom'] as const;
export type RepeatChoice = (typeof REPEAT_CHOICES)[number];
const REPEAT_DAYS: Record<Exclude<RepeatChoice, 'once' | 'custom'>, number> = { weekly: 7, monthly: 30, quarterly: 90, halfyear: 182, yearly: 365 };
export const REPEAT_LABEL: Record<RepeatChoice, MessageKey> = {
  once: 'rmRepOnce',
  weekly: 'rmRepWeekly',
  monthly: 'rmRepMonthly',
  quarterly: 'rmRepQuarterly',
  halfyear: 'rmRepHalfyear',
  yearly: 'rmRepYearly',
  custom: 'rmRepCustom',
};
export const REPEAT_MAX_DAYS = 3650;

export function isRepeatChoice(v: unknown): v is RepeatChoice {
  return typeof v === 'string' && (REPEAT_CHOICES as readonly string[]).includes(v);
}

export type RepeatResult = { ok: true; days: number | null } | { ok: false; error: MessageKey };

/** Auswahl → repeat_days (null = einmalig). Eigene Anzahl: ganze Zahl 1–3650. */
export function repeatToDays(choice: RepeatChoice, custom: string): RepeatResult {
  if (choice === 'once') return { ok: true, days: null };
  if (choice !== 'custom') return { ok: true, days: REPEAT_DAYS[choice] };
  const s = custom.trim();
  if (!/^\d+$/.test(s)) return { ok: false, error: 'rmErrDays' };
  const n = Number(s);
  if (n < 1 || n > REPEAT_MAX_DAYS) return { ok: false, error: 'rmErrDays' };
  return { ok: true, days: n };
}

/** repeat_days → Auswahl (für das Ändern-Formular) */
export function daysToRepeat(days: number | null): { choice: RepeatChoice; custom: string } {
  if (days === null) return { choice: 'once', custom: '' };
  const hit = (Object.entries(REPEAT_DAYS) as [RepeatChoice, number][]).find(([, n]) => n === days);
  return hit ? { choice: hit[0], custom: '' } : { choice: 'custom', custom: String(days) };
}

export type RemGroup = 'overdue' | 'today' | 'soon' | 'later';
export const REM_SOON_DAYS = 30;

/** Überfällig (< heute), Heute, Nächste 30 Tage (1–30), Später (> 30) */
export function reminderGroup(dueOn: string, today: string): RemGroup {
  const d = daysBetween(today, dueOn);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= REM_SOON_DAYS) return 'soon';
  return 'later';
}

/** Status in Worten: Schlüssel + Anzahl Tage */
export function reminderStatus(dueOn: string, today: string): { key: MessageKey; n: number } {
  const d = daysBetween(today, dueOn);
  if (d < 0) return { key: d === -1 ? 'rmOverdue1' : 'rmOverdueN', n: -d };
  if (d === 0) return { key: 'rmToday', n: 0 };
  return { key: d === 1 ? 'rmIn1' : 'rmInN', n: d };
}

export interface RemLike {
  id: string;
  due_on: string;
  repeat_days: number | null;
  done_at: string | null;
  title: string;
}

/** Offene Erinnerungen in Gruppen (aufsteigend nach Fälligkeit) und erledigte einmalige (neueste zuerst) */
export function groupReminders<T extends RemLike>(rows: readonly T[], today: string): Record<RemGroup | 'done', T[]> {
  const out: Record<RemGroup | 'done', T[]> = { overdue: [], today: [], soon: [], later: [], done: [] };
  for (const r of rows) {
    if (r.repeat_days === null && r.done_at) out.done.push(r);
    else out[reminderGroup(r.due_on, today)].push(r);
  }
  const byDue = (a: T, b: T) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title);
  for (const g of ['overdue', 'today', 'soon', 'later'] as const) out[g].sort(byDue);
  out.done.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  return out;
}

export interface RemFormValues {
  petId: string;
  title: string;
  kind: RemKind;
  dueOn: string;
  repeat: RepeatChoice;
  customDays: string;
  note: string;
}
export type RemErrors = Partial<Record<keyof RemFormValues, MessageKey>>;

export function validateReminder(v: RemFormValues): RemErrors {
  const e: RemErrors = {};
  if (!v.petId) e.petId = 'apErrPet';
  const title = v.title.trim();
  if (!title) e.title = 'rmErrTitle';
  else if (title.length > APPT_TITLE_MAX) e.title = 'apErrTitleLong';
  if (!v.dueOn) e.dueOn = 'errDateRequired';
  else if (!isIsoDate(v.dueOn)) e.dueOn = 'errDate';
  const r = repeatToDays(v.repeat, v.customDays);
  if (!r.ok) e.customDays = r.error;
  if (v.note.length > NOTE_MAX) e.note = 'errNoteLong';
  return e;
}

/** „Erledigt am“: nicht in der Zukunft (Datenbank erlaubt höchstens 1 Tag Uhr-Abweichung) */
export function doneOnError(v: string, today: string): MessageKey | undefined {
  if (!v) return 'errDateRequired';
  if (!isIsoDate(v)) return 'errDate';
  if (v > today) return 'errFuture';
  return undefined;
}

/** Fehlertext aus complete_reminder → Schlüssel */
export function completeErrorKey(message: string | undefined): MessageKey {
  switch (message) {
    case 'reminder_future':
      return 'errFuture';
    case 'reminder_not_found':
      return 'rmErrNotFound';
    case 'reminder_not_allowed':
      return 'errRights';
    default:
      return 'errGeneric';
  }
}

// ---------- Abgeleitete Erinnerungen aus der Tierakte ----------

export const VACC_LOOKAHEAD_DAYS = 60;

export interface DerivedVacc {
  id: string;
  petId: string;
  name: string;
  validUntil: string;
  group: RemGroup;
}

/**
 * Impfungen mit „gültig bis“ in den nächsten 60 Tagen oder schon abgelaufen → nur Anzeige.
 * Ohne Datum oder später: keine Erinnerung.
 */
export function derivedVaccReminders(
  rows: readonly { id: string; pet_id: string; name: string; valid_until: string | null }[],
  today: string,
): DerivedVacc[] {
  return rows
    .filter((v): v is typeof v & { valid_until: string } => !!v.valid_until && isIsoDate(v.valid_until) && daysBetween(today, v.valid_until) <= VACC_LOOKAHEAD_DAYS)
    .map((v) => ({ id: v.id, petId: v.pet_id, name: v.name, validUntil: v.valid_until, group: reminderGroup(v.valid_until, today) }))
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.name.localeCompare(b.name));
}
