// Reine Zeit- und Fälligkeitslogik. Alle Angaben beziehen sich auf die Zeitzone Europe/Berlin.
import type { Repeat } from './domain';

export const TIME_ZONE = 'Europe/Berlin';
/** So lange nach der geplanten Uhrzeit gilt ein offener Eintrag noch als „Jetzt“. */
export const NOW_WINDOW_MIN = 30;

export interface ZonedNow {
  /** Kalenderdatum YYYY-MM-DD */
  readonly date: string;
  /** Minuten seit Mitternacht */
  readonly minutes: number;
  /** 0 = Sonntag … 6 = Samstag */
  readonly weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedNow(now: Date, timeZone: string = TIME_ZONE): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** "07:00:00" oder "7:00" → "07:00" */
export function toHHMM(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) throw new Error(`Ungültige Uhrzeit: ${time}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Ungültige Uhrzeit: ${time}`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function toMinutes(time: string): number {
  const [h, m] = toHHMM(time).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export function occursOn(repeat: Repeat | string, weekday: number): boolean {
  switch (repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return !isWeekend(weekday);
    case 'weekends':
      return isWeekend(weekday);
    default:
      return false;
  }
}

export interface Schedulable {
  readonly id: string;
  readonly time_of_day: string;
  readonly repeat: string;
}

/** Alle Einträge, die am angegebenen Wochentag anfallen, nach Uhrzeit sortiert. */
export function itemsForDay<T extends Schedulable>(items: readonly T[], weekday: number): T[] {
  return items.filter((i) => occursOn(i.repeat, weekday)).sort((a, b) => toMinutes(a.time_of_day) - toMinutes(b.time_of_day));
}

export type NextDue<T> =
  | { readonly item: T; readonly state: 'now'; readonly overdueMin: number }
  | { readonly item: T; readonly state: 'upcoming'; readonly inMin: number };

/**
 * Nächster fälliger, noch offener Eintrag von heute.
 * Bis zu NOW_WINDOW_MIN Minuten überfällige Einträge gelten als „Jetzt“, ältere werden übersprungen.
 */
export function nextDue<T extends Schedulable>(items: readonly T[], doneIds: ReadonlySet<string>, now: ZonedNow): NextDue<T> | null {
  for (const item of itemsForDay(items, now.weekday)) {
    if (doneIds.has(item.id)) continue;
    const diff = toMinutes(item.time_of_day) - now.minutes;
    const overdue = now.minutes - toMinutes(item.time_of_day);
    if (overdue >= 0 && overdue <= NOW_WINDOW_MIN) return { item, state: 'now', overdueMin: overdue };
    if (diff > 0) return { item, state: 'upcoming', inMin: diff };
  }
  return null;
}

/** Zerlegt eine Minutenzahl in Stunden und Minuten (für „in 1 Std. 5 Min.“). */
export function splitMinutes(total: number): { h: number; m: number } {
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Minuten bis zum nächsten Wechsel der Minute – für sparsames Neuzeichnen. */
export function msToNextMinute(now: Date): number {
  return 60_000 - (now.getTime() % 60_000);
}
