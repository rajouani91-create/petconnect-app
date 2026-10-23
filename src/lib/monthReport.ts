// Monatsübersicht: reine Zählungen und Verläufe, ohne React und ohne Supabase.
// Alle Datumsangaben sind Kalendertage (YYYY-MM-DD) in Europe/Berlin.
import { TIME_ZONE } from './time';

export interface MonthRange {
  /** Erster Tag YYYY-MM-DD */
  readonly first: string;
  /** Letzter Tag YYYY-MM-DD */
  readonly last: string;
  readonly days: number;
}

export interface MedInput {
  readonly id: string;
  readonly name: string;
  readonly frequency: string;
  readonly remind: boolean;
  readonly times: readonly string[];
  readonly starts_on: string;
  readonly ends_on: string | null;
  readonly stopped_on: string | null;
}

export interface DoseInput {
  readonly medication_id: string;
  readonly scheduled_on: string;
  readonly scheduled_time: string;
}

export interface ReminderInput {
  readonly due_on: string;
  readonly done_at: string | null;
}

export interface ApptInput {
  readonly starts_at: string;
  readonly status: string;
}

export interface WeightInput {
  readonly measured_on: string;
  readonly kg: number;
}

export interface MedCount {
  readonly id: string;
  readonly name: string;
  readonly planned: number;
  readonly done: number;
  readonly missed: number;
}

export interface WeightSummary {
  readonly count: number;
  readonly startDate: string | null;
  readonly startKg: number | null;
  readonly endDate: string | null;
  readonly endKg: number | null;
  /** Differenz Ende minus Anfang, nur bei zwei oder mehr Messungen */
  readonly diffKg: number | null;
}

export interface MonthReport {
  readonly range: MonthRange;
  readonly medications: readonly MedCount[];
  readonly medTotals: { readonly planned: number; readonly done: number; readonly missed: number };
  readonly reminders: { readonly done: number; readonly overdue: number; readonly open: number };
  readonly appointments: { readonly planned: number; readonly done: number; readonly cancelled: number };
  readonly weight: WeightSummary;
}

/** Monatsgrenzen für Jahr und Monat (1–12) */
export function monthRange(year: number, month: number): MonthRange {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${String(days).padStart(2, '0')}`, days };
}

/** Kalendertag eines Zeitpunkts in Europe/Berlin */
export function berlinDay(iso: string, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** HH:MM aus „08:00“ oder „08:00:00“ */
const hhmm = (time: string): string => time.slice(0, 5);

const inRange = (day: string, r: MonthRange): boolean => day >= r.first && day <= r.last;

/** Letzter Tag einer Gabe, inklusive (wie in medication.ts) */
function lastDay(m: Pick<MedInput, 'ends_on' | 'stopped_on'>): string | null {
  if (m.stopped_on && (!m.ends_on || m.stopped_on < m.ends_on)) return m.stopped_on;
  return m.ends_on;
}

/** Alle Tage YYYY-MM-DD von a bis b (inklusive), leer wenn a > b */
function daysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${b}T00:00:00Z`);
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= end; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function medicationCounts(
  meds: readonly MedInput[],
  doses: readonly DoseInput[],
  range: MonthRange,
  today: string,
): MedCount[] {
  const given = new Set(doses.map((d) => `${d.medication_id}|${d.scheduled_on}|${hhmm(d.scheduled_time)}`));
  return meds.map((m) => {
    let planned = 0;
    let done = 0;
    let missed = 0;
    if (m.remind && m.frequency !== 'as_needed') {
      const from = m.starts_on > range.first ? m.starts_on : range.first;
      const end = lastDay(m);
      const to = end && end < range.last ? end : range.last;
      for (const day of from <= to ? daysBetween(from, to) : []) {
        for (const time of m.times.map(hhmm)) {
          planned += 1;
          if (given.has(`${m.id}|${day}|${time}`)) done += 1;
          else if (day < today) missed += 1;
        }
      }
    }
    return { id: m.id, name: m.name, planned, done, missed };
  });
}

export function reminderCounts(reminders: readonly ReminderInput[], range: MonthRange, today: string) {
  let done = 0;
  let overdue = 0;
  let open = 0;
  for (const r of reminders) {
    if (!inRange(r.due_on, range)) continue;
    if (r.done_at) done += 1;
    else if (r.due_on < today) overdue += 1;
    else open += 1;
  }
  return { done, overdue, open };
}

export function appointmentCounts(appts: readonly ApptInput[], range: MonthRange) {
  let planned = 0;
  let done = 0;
  let cancelled = 0;
  for (const a of appts) {
    if (!inRange(berlinDay(a.starts_at), range)) continue;
    if (a.status === 'done') done += 1;
    else if (a.status === 'cancelled') cancelled += 1;
    else planned += 1;
  }
  return { planned, done, cancelled };
}

export function weightSummary(weights: readonly WeightInput[], range: MonthRange): WeightSummary {
  const inMonth = weights.filter((w) => inRange(w.measured_on, range)).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const first = inMonth[0];
  const last = inMonth[inMonth.length - 1];
  if (!first || !last) return { count: 0, startDate: null, startKg: null, endDate: null, endKg: null, diffKg: null };
  const diff = inMonth.length >= 2 ? Math.round((last.kg - first.kg) * 100) / 100 : null;
  return {
    count: inMonth.length,
    startDate: first.measured_on,
    startKg: first.kg,
    endDate: last.measured_on,
    endKg: last.kg,
    diffKg: diff,
  };
}

export function buildMonthReport(
  input: {
    meds: readonly MedInput[];
    doses: readonly DoseInput[];
    reminders: readonly ReminderInput[];
    appointments: readonly ApptInput[];
    weights: readonly WeightInput[];
  },
  year: number,
  month: number,
  today: string,
): MonthReport {
  const range = monthRange(year, month);
  const medications = medicationCounts(input.meds, input.doses, range, today);
  const medTotals = medications.reduce(
    (acc, m) => ({ planned: acc.planned + m.planned, done: acc.done + m.done, missed: acc.missed + m.missed }),
    { planned: 0, done: 0, missed: 0 },
  );
  return {
    range,
    medications,
    medTotals,
    reminders: reminderCounts(input.reminders, range, today),
    appointments: appointmentCounts(input.appointments, range),
    weight: weightSummary(input.weights, range),
  };
}
