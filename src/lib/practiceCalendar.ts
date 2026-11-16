// Kalender und Tagesplan der Praxis (Etappe P5d). Reine Rechenfunktionen ohne Datenbank.
// Tage sind ISO-Daten (YYYY-MM-DD) in Europe/Berlin, Zeiten „HH:MM“ Wanduhrzeit.
import { addDays } from './booking';
import type { Absence, DayHours } from './practiceSchedule';
import { dayOf, timeOf, type PracticeAppointment } from './practiceAppointments';

export type CalView = 'day' | 'week' | 'month';
export const CAL_VIEWS: CalView[] = ['day', 'week', 'month'];

export const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** ISO-Wochentag 1 (Mo) … 7 (So) */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
export const weekStart = (day: string): string => addDays(day, 1 - isoWeekday(day));
export const weekDays = (day: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));

/** Kalenderwoche nach ISO 8601 */
export function isoWeek(day: string): number {
  const thu = new Date(`${addDays(day, 4 - isoWeekday(day))}T12:00:00Z`);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / 86400000 / 7) + 1;
}

/** Kalenderblatt eines Monats: volle Wochen Mo–So */
export function monthGrid(day: string): string[][] {
  const first = `${day.slice(0, 7)}-01`;
  const weeks: string[][] = [];
  let d = weekStart(first);
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    d = addDays(d, 7);
  } while (d.slice(0, 7) === day.slice(0, 7));
  return weeks;
}

export function shiftAnchor(day: string, view: CalView, dir: -1 | 1): string {
  if (view === 'day') return addDays(day, dir);
  if (view === 'week') return addDays(day, 7 * dir);
  const [y, m] = day.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + dir, 1, 12));
  return t.toISOString().slice(0, 10);
}

export type DayStatus = { kind: 'open'; opens: string; closes: string; breakFrom: string | null; breakTo: string | null } | { kind: 'closed' } | { kind: 'absence'; reason: string | null };

export function dayStatus(day: string, hours: readonly DayHours[], absences: readonly Absence[]): DayStatus {
  const ab = absences.find((a) => day >= a.from && day <= a.to);
  if (ab) return { kind: 'absence', reason: ab.reason };
  const h = hours.find((x) => x.weekday === isoWeekday(day));
  if (!h || !h.open) return { kind: 'closed' };
  return { kind: 'open', opens: h.opens, closes: h.closes, breakFrom: h.break_from, breakTo: h.break_to };
}

/** Minuten Sprechzeit an einem Tag (ohne Pause) */
export function openMinutes(s: DayStatus): number {
  if (s.kind !== 'open') return 0;
  const brk = s.breakFrom && s.breakTo ? Math.max(0, toMin(s.breakTo) - toMin(s.breakFrom)) : 0;
  return Math.max(0, toMin(s.closes) - toMin(s.opens) - brk);
}

/** Zeilen der Tagesansicht (Raster in Minuten) von Beginn bis Ende der Sprechzeit; Pausenzeilen markiert */
export function dayRows(s: DayStatus, step = 30): { time: string; pause: boolean }[] {
  if (s.kind !== 'open') return [];
  const rows: { time: string; pause: boolean }[] = [];
  for (let m = toMin(s.opens); m < toMin(s.closes); m += step) {
    const pause = !!(s.breakFrom && s.breakTo && m >= toMin(s.breakFrom) && m < toMin(s.breakTo));
    rows.push({ time: toHHMM(m), pause });
  }
  return rows;
}

/** Im Kalender sichtbar: alles außer abgesagten Terminen */
export const isVisible = (a: PracticeAppointment) => a.status !== 'cancelled_practice' && a.status !== 'cancelled_owner';
/** Verschiebbar: neu oder bestätigt und noch nicht begonnen */
export const isMovable = (a: PracticeAppointment, now: Date) => (a.status === 'new' || a.status === 'confirmed') && new Date(a.starts_at) > now;
/** Abgeschlossen: abgesagt, erschienen oder nicht erschienen */
export const isClosed = (a: PracticeAppointment) => !(a.status === 'new' || a.status === 'confirmed');

export function onDay(rows: readonly PracticeAppointment[], day: string): PracticeAppointment[] {
  return rows.filter((a) => isVisible(a) && dayOf(a.starts_at) === day).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
}

/** Termine, die in einer Zeile [time, time+step) beginnen */
export function inRow(items: readonly PracticeAppointment[], time: string, step = 30): PracticeAppointment[] {
  const m = toMin(time);
  return items.filter((a) => { const s = toMin(timeOf(a.starts_at)); return s >= m && s < m + step; });
}
/** Ist die Zeile durch einen früher begonnenen Termin belegt? */
export function rowCovered(items: readonly PracticeAppointment[], time: string): boolean {
  const m = toMin(time);
  return items.some((a) => { const s = toMin(timeOf(a.starts_at)); return s < m && s + a.minutes > m; });
}

/** Gleichzeitige Termine in Gruppen (für die Darstellung nebeneinander) */
export function overlapGroups(items: readonly PracticeAppointment[]): PracticeAppointment[][] {
  const sorted = [...items].sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  const groups: PracticeAppointment[][] = [];
  let end = -1;
  for (const a of sorted) {
    const s = new Date(a.starts_at).getTime();
    const e = s + a.minutes * 60000;
    const last = groups[groups.length - 1];
    if (last && s < end) { last.push(a); end = Math.max(end, e); } else { groups.push([a]); end = e; }
  }
  return groups;
}

/** Auslastung: belegte Minuten / Minuten Sprechzeit (0–1, gedeckelt) */
export function capacity(day: string, s: DayStatus, rows: readonly PracticeAppointment[]): number | null {
  const open = openMinutes(s);
  if (!open) return null;
  const used = onDay(rows, day).reduce((n, a) => n + a.minutes, 0);
  return Math.min(1, used / open);
}

/** Ausfallquote der letzten 30 Tage: nicht erschienen / (erschienen + nicht erschienen) */
export function noShowRate(rows: readonly PracticeAppointment[], now: Date): { rate: number | null; noShow: number; total: number } {
  const from = now.getTime() - 30 * 86400000;
  const done = rows.filter((a) => (a.status === 'attended' || a.status === 'no_show') && new Date(a.starts_at).getTime() >= from && new Date(a.starts_at) <= now);
  const noShow = done.filter((a) => a.status === 'no_show').length;
  return { rate: done.length ? noShow / done.length : null, noShow, total: done.length };
}

/** Freie Zeit, die der gewünschten Uhrzeit am nächsten liegt */
export function nearestSlot(slots: readonly string[], wantHHMM: string): string | null {
  const w = toMin(wantHHMM);
  let best: string | null = null;
  let diff = Infinity;
  for (const s of slots) {
    const d = Math.abs(toMin(timeOf(s)) - w);
    if (d < diff) { diff = d; best = s; }
  }
  return best;
}

/** Nächste freie Zeit davor (dir -1) oder danach (dir 1) am selben Tag */
export function stepSlot(slots: readonly string[], currentIso: string, dir: -1 | 1): string | null {
  const cur = new Date(currentIso).getTime();
  const sorted = [...slots].sort();
  if (dir === 1) return sorted.find((s) => new Date(s).getTime() > cur) ?? null;
  return sorted.toReversed().find((s) => new Date(s).getTime() < cur) ?? null;
}
