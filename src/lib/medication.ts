// Medikation: reine Logik (Texte, Status, Validierung, heutige Gaben). Ohne Supabase und React.
// Wichtig: Die App berechnet, prüft oder empfiehlt KEINE Dosierungen – sie speichert nur, was die Praxis verordnet hat.
import type { MessageKey } from '../i18n';
import { TIME_ZONE, toHHMM, zonedNow } from './time';

export const MED_UNITS = ['tablet', 'capsule', 'ml', 'drop', 'pipette', 'puff', 'sachet', 'g', 'mg', 'application'] as const;
export type MedUnit = (typeof MED_UNITS)[number];
export const INTAKE_HINTS = ['none', 'with_food', 'empty_stomach'] as const;
export type IntakeHint = (typeof INTAKE_HINTS)[number];
/** Auswahl „Wie oft?“: 1–4× täglich oder bei Bedarf */
export const FREQ_CHOICES = ['1', '2', '3', '4', 'as_needed'] as const;
export type FreqChoice = (typeof FREQ_CHOICES)[number];

export const MED_NAME_MAX = 80;
export const MED_TEXT_MAX = 200;
export const MED_BY_MAX = 120;
export const AMOUNT_MAX = 1000;
/** „endet bald“: höchstens so viele Tage bis zum Ende */
export const ENDING_SOON_DAYS = 7;
/** „jetzt fällig“: ab der Uhrzeit so viele Minuten lang, danach „überfällig“ */
export const DUE_WINDOW_MIN = 60;
/** Beendete Medikamente in der Gesundheitsakte: so viele Monate zurück */
export const RECORD_ENDED_MONTHS = 12;

/** Vorbelegte Uhrzeiten je Häufigkeit */
export const DEFAULT_TIMES: Record<1 | 2 | 3 | 4, string[]> = {
  1: ['08:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '14:00', '20:00'],
  4: ['07:00', '12:00', '17:00', '22:00'],
};

/** Zählbare Einheiten haben Einzahl und Mehrzahl, Maßeinheiten nur einen Text */
const UNIT_TEXT: Record<MedUnit, { one: MessageKey; many: MessageKey }> = {
  tablet: { one: 'u_tab1', many: 'u_tabN' },
  capsule: { one: 'u_cap1', many: 'u_capN' },
  ml: { one: 'u_ml', many: 'u_ml' },
  drop: { one: 'u_drop1', many: 'u_dropN' },
  pipette: { one: 'u_pip1', many: 'u_pipN' },
  puff: { one: 'u_puff1', many: 'u_puffN' },
  sachet: { one: 'u_sach1', many: 'u_sachN' },
  g: { one: 'u_g', many: 'u_g' },
  mg: { one: 'u_mg', many: 'u_mg' },
  application: { one: 'u_app1', many: 'u_appN' },
};
export const HINT_TEXT: Record<IntakeHint, MessageKey> = { none: 'omHNone', with_food: 'omHFood', empty_stomach: 'omHEmpty' };

export const isMedUnit = (v: unknown): v is MedUnit => typeof v === 'string' && (MED_UNITS as readonly string[]).includes(v);
export const isIntakeHint = (v: unknown): v is IntakeHint => typeof v === 'string' && (INTAKE_HINTS as readonly string[]).includes(v);

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Mindestangaben für Texte (Zeile aus pet_medications oder aus sitter_view) */
export interface MedLike {
  name: string;
  amount: number;
  unit: string;
  frequency: string;
  times: readonly string[];
  intake_hint: string;
  note: string | null;
}

/** Menge im Sprachformat, z. B. „0,5“ (de) / „0.5“ (en), höchstens 2 Nachkommastellen */
export function formatAmount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

/** Einheit passend zur Menge: Einzahl nur bei genau 1 („1 Tablette“, „0,5 Tabletten“, „2 Tabletten“) */
export function unitText(unit: string, amount: number, t: T): string {
  if (!isMedUnit(unit)) return unit;
  const u = UNIT_TEXT[unit];
  return t(amount === 1 ? u.one : u.many);
}

/** Einheiten-Auswahl im Formular: Mehrzahl als Bezeichnung (bei Maßeinheiten das Kürzel) */
export const unitOptionText = (unit: MedUnit, t: T) => t(UNIT_TEXT[unit].many);

/** „08:00:00“ → „08:00“; Liste sortiert */
export function shortTimes(times: readonly string[]): string[] {
  return times.map((x) => toHHMM(x)).sort();
}

/** „0,5 ml“ */
export function amountText(m: Pick<MedLike, 'amount' | 'unit'>, t: T, locale: string): string {
  const a = Number(m.amount);
  return `${formatAmount(a, locale)} ${unitText(m.unit, a, t)}`;
}

/**
 * Dosierungszeile, z. B. „0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter“.
 * Nur Anzeige der Angaben – keine Umrechnung, keine Bewertung.
 */
export function doseText(m: MedLike, t: T, locale: string, withNote = true): string {
  const parts = [amountText(m, t, locale)];
  if (m.frequency === 'as_needed') parts.push(t('omPrn'));
  else {
    const ts = shortTimes(m.times);
    parts.push(`${t('omDaily', { n: ts.length })}${ts.length ? ` (${t('gpAt', { t: ts.join(', ') })})` : ''}`);
  }
  if (m.intake_hint === 'with_food' || m.intake_hint === 'empty_stomach') parts.push(t(HINT_TEXT[m.intake_hint]));
  const note = m.note?.trim();
  if (withNote && note) parts.push(note);
  return parts.join(' · ');
}

// ---------- Status ----------

export type MedStatus = 'longterm' | 'active' | 'ending' | 'ended';
export const MED_STATUS_LABEL: Record<MedStatus, MessageKey> = { longterm: 'mdLong', active: 'mdActive', ending: 'mdSoon', ended: 'mdEnded' };

export interface MedPeriod {
  starts_on: string;
  ends_on: string | null;
  stopped_on: string | null;
}

const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 864e5;

/** Letzter Tag der Gabe (vorzeitig beendet oder geplantes Ende), null = Dauermedikation */
export function lastDay(m: MedPeriod): string | null {
  if (m.stopped_on && (!m.ends_on || m.stopped_on < m.ends_on)) return m.stopped_on;
  return m.ends_on;
}

/**
 * „beendet“: vorzeitig beendet (ab dem Tag des Beendens) oder Ende vorbei.
 * „endet bald“: Ende in höchstens 7 Tagen. Ohne Ende: „Dauermedikation“. Sonst „laufend“.
 */
export function medStatus(m: MedPeriod, today: string): MedStatus {
  if (m.stopped_on && m.stopped_on <= today) return 'ended';
  if (m.ends_on && m.ends_on < today) return 'ended';
  if (!m.ends_on) return 'longterm';
  return dayNum(m.ends_on) - dayNum(today) <= ENDING_SOON_DAYS ? 'ending' : 'active';
}

/** Läuft heute (begonnen und nicht beendet) */
export const isRunning = (m: MedPeriod, today: string) => m.starts_on <= today && medStatus(m, today) !== 'ended';

/** Laufende (und geplante) nach Beginn, beendete getrennt – zuletzt beendete zuerst */
export function splitMeds<M extends MedPeriod & { name: string }>(rows: readonly M[], today: string): { current: M[]; ended: M[] } {
  const current = rows.filter((m) => medStatus(m, today) !== 'ended').sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.name.localeCompare(b.name));
  const ended = rows.filter((m) => medStatus(m, today) === 'ended').sort((a, b) => (lastDay(b) ?? '').localeCompare(lastDay(a) ?? '') || a.name.localeCompare(b.name));
  return { current, ended };
}

/** Gesundheitsakte: laufende, darunter beendete der letzten 12 Monate */
export function recordMeds<M extends MedPeriod & { name: string }>(rows: readonly M[], today: string): { current: M[]; ended: M[] } {
  const { current, ended } = splitMeds(rows, today);
  const [y, mo, d] = today.split('-').map(Number) as [number, number, number];
  const since = new Date(Date.UTC(y, mo - 1 - RECORD_ENDED_MONTHS, d)).toISOString().slice(0, 10);
  return { current, ended: ended.filter((m) => (lastDay(m) ?? today) >= since) };
}

// ---------- Formular ----------

export interface MedFormValues {
  name: string;
  amount: string;
  unit: MedUnit;
  freq: FreqChoice;
  /** Immer 4 Felder; genutzt werden so viele wie die Häufigkeit sagt */
  times: string[];
  hint: IntakeHint;
  note: string;
  reason: string;
  prescribedBy: string;
  startsOn: string;
  endsOn: string;
  remind: boolean;
}

export type MedErrorKey = 'omErrName' | 'omErrAmt' | 'omErrTime' | 'omErrDup' | 'omErrStart' | 'mdBad';
export interface MedErrors {
  name?: MedErrorKey;
  amount?: MedErrorKey;
  times?: (MedErrorKey | undefined)[];
  startsOn?: MedErrorKey;
  endsOn?: MedErrorKey;
}

export const timesCount = (freq: FreqChoice): number => (freq === 'as_needed' ? 0 : Number(freq));

/** Uhrzeiten bei Wechsel der Häufigkeit: Vorbelegung der neuen Anzahl */
export function timesFor(freq: FreqChoice): string[] {
  const n = timesCount(freq);
  const d = n ? DEFAULT_TIMES[n as 1 | 2 | 3 | 4] : [];
  return [0, 1, 2, 3].map((i) => d[i] ?? '');
}

/**
 * Menge pro Gabe: Zahl > 0 und ≤ 1000, Komma oder Punkt, höchstens 2 Nachkommastellen.
 * „1“, „0,5“, „0.25“ gültig; „0“, „-1“, „1,234“, „abc“ ungültig → null.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return n > 0 && n <= AMOUNT_MAX ? n : null;
}

export function emptyMedForm(today: string, vetName: string | null): MedFormValues {
  return { name: '', amount: '', unit: 'tablet', freq: '1', times: timesFor('1'), hint: 'none', note: '', reason: '', prescribedBy: vetName?.trim().slice(0, MED_BY_MAX) ?? '', startsOn: today, endsOn: '', remind: true };
}

export interface MedRowLike extends MedLike, MedPeriod {
  reason: string | null;
  prescribed_by: string | null;
  remind: boolean;
}

export function medToForm(m: MedRowLike, locale: string): MedFormValues {
  const ts = shortTimes(m.times);
  const freq: FreqChoice = m.frequency === 'as_needed' ? 'as_needed' : (String(Math.min(Math.max(ts.length, 1), 4)) as FreqChoice);
  return {
    name: m.name,
    amount: formatAmount(Number(m.amount), locale).replace(/\s/g, ''),
    unit: isMedUnit(m.unit) ? m.unit : 'tablet',
    freq,
    times: [0, 1, 2, 3].map((i) => ts[i] ?? ''),
    hint: isIntakeHint(m.intake_hint) ? m.intake_hint : 'none',
    note: m.note ?? '',
    reason: m.reason ?? '',
    prescribedBy: m.prescribed_by ?? '',
    startsOn: m.starts_on,
    endsOn: m.ends_on ?? '',
    remind: m.remind,
  };
}

export function validateMed(v: MedFormValues): MedErrors {
  const e: MedErrors = {};
  if (!v.name.trim()) e.name = 'omErrName';
  if (parseAmount(v.amount) === null) e.amount = 'omErrAmt';
  const n = timesCount(v.freq);
  const times: (MedErrorKey | undefined)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const x = (v.times[i] ?? '').trim();
    if (!/^\d{2}:\d{2}$/.test(x)) times[i] = 'omErrTime';
    else if (seen.has(x)) times[i] = 'omErrDup';
    seen.add(x);
  }
  if (times.some(Boolean)) e.times = times;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.startsOn)) e.startsOn = 'omErrStart';
  else if (v.endsOn && v.endsOn < v.startsOn) e.endsOn = 'mdBad';
  return e;
}

/** Reihenfolge der Felder für „Fokus auf das erste fehlerhafte Feld“ */
export function firstError(e: MedErrors): string | null {
  if (e.name) return 'name';
  if (e.amount) return 'amount';
  const ti = e.times?.findIndex(Boolean) ?? -1;
  if (ti >= 0) return `time-${ti}`;
  if (e.startsOn) return 'startsOn';
  if (e.endsOn) return 'endsOn';
  return null;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Formular → Spalten (Uhrzeiten als HH:MM; bei Bedarf keine Uhrzeiten) */
export function formToMed(v: MedFormValues) {
  const n = timesCount(v.freq);
  return {
    name: v.name.trim().slice(0, MED_NAME_MAX),
    amount: parseAmount(v.amount) ?? 0,
    unit: v.unit,
    frequency: v.freq === 'as_needed' ? 'as_needed' : 'daily',
    times: v.times.slice(0, n).map((x) => x.trim()).sort(),
    intake_hint: v.hint,
    note: orNull(v.note.slice(0, MED_TEXT_MAX)),
    reason: orNull(v.reason.slice(0, MED_TEXT_MAX)),
    prescribed_by: orNull(v.prescribedBy.slice(0, MED_BY_MAX)),
    starts_on: v.startsOn,
    ends_on: v.endsOn || null,
    remind: v.remind,
  };
}

// ---------- Heutige Gaben ----------

export interface MedForToday extends MedPeriod {
  id: string;
  pet_id: string;
  frequency: string;
  times: readonly string[];
  remind: boolean;
}

export interface PlannedDose<M> {
  med: M;
  /** HH:MM */
  time: string;
}

/** Heutige Gaben: täglich, mit Erinnerung, heute im Zeitraum und nicht beendet – nach Uhrzeit */
export function dosesForDay<M extends MedForToday>(meds: readonly M[], day: string, petName: (petId: string) => string = () => ''): PlannedDose<M>[] {
  const out: PlannedDose<M>[] = [];
  for (const m of meds) {
    if (m.frequency !== 'daily' || !m.remind || !isRunning(m, day)) continue;
    if (m.ends_on && m.ends_on < day) continue;
    for (const time of shortTimes(m.times)) out.push({ med: m, time });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || petName(a.med.pet_id).localeCompare(petName(b.med.pet_id)));
}

/** Zeitpunkt (ms) einer Wanduhrzeit in Europe/Berlin; bei der Zeitumstellung fehlende Zeiten rücken vor */
export function berlinInstant(day: string, hhmm: string, timeZone = TIME_ZONE): number {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const [h, mi] = toHHMM(hhmm).split(':').map(Number) as [number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (ms: number) => {
    const z = zonedNow(new Date(ms), timeZone);
    const [zy, zm, zd] = z.date.split('-').map(Number) as [number, number, number];
    return Date.UTC(zy, zm - 1, zd, Math.floor(z.minutes / 60), z.minutes % 60) - Math.floor(ms / 60000) * 60000;
  };
  const first = asUtc - offset(asUtc);
  const second = asUtc - offset(first);
  return second;
}

export interface GivenDose {
  given_by: string;
  given_at: string;
}

export type DoseState =
  | { kind: 'open' }
  | { kind: 'due' }
  | { kind: 'overdue'; min: number }
  | { kind: 'given'; by: string; at: string };

/**
 * Zustand einer heutigen Gabe: „offen“ (vor der Uhrzeit), „jetzt fällig“ (bis 60 Min. danach),
 * „überfällig seit {n} Min.“, „gegeben“. Rechnet mit echter Zeit (auch über Zeitumstellung und Mitternacht).
 */
export function doseState(day: string, time: string, now: Date, given?: GivenDose | null): DoseState {
  if (given) return { kind: 'given', by: given.given_by, at: given.given_at };
  const min = Math.floor((now.getTime() - berlinInstant(day, time)) / 60000);
  if (min < 0) return { kind: 'open' };
  if (min <= DUE_WINDOW_MIN) return { kind: 'due' };
  return { kind: 'overdue', min };
}

/** Schlüssel einer geplanten Gabe */
export const doseKey = (medId: string, day: string, time: string) => `${medId}|${day}|${toHHMM(time)}`;

/** Nächste offene Gabe (überfällige und fällige zuerst, sonst die nächste geplante) */
export function nextOpenDose<M extends MedForToday>(planned: readonly PlannedDose<M>[], given: ReadonlyMap<string, GivenDose>, day: string): PlannedDose<M> | null {
  return planned.find((p) => !given.has(doseKey(p.med.id, day, p.time))) ?? null;
}

/** Uhrzeit HH:MM eines Zeitstempels in Europe/Berlin */
export function berlinHHMM(iso: string): string {
  const m = zonedNow(new Date(iso)).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
