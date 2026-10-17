// Öffnungszeiten aus OpenStreetMap (opening_hours-Syntax) auswerten.
// Bibliothek: opening_hours (LGPL-3.0, https://github.com/opening-hours/opening_hours.js), nur bei Bedarf geladen.

export type OpenState = 'open' | 'closed' | 'unknown';

export interface OpeningInfo {
  state: OpenState;
  /** Zeitspannen heute, z. B. [["08:00","12:00"],["15:00","18:00"]]; null = unbekannt */
  today: [string, string][] | null;
}

/** Minimale Schnittstelle der Bibliothek (für Tests austauschbar) */
export interface OhInstance {
  getState(date?: Date): boolean;
  getUnknown(date?: Date): boolean;
  getOpenIntervals(from: Date, to: Date): [Date, Date, boolean, string | undefined][];
}
export type OhConstructor = new (value: string, nominatim?: unknown, conf?: unknown) => OhInstance;

/** Deutschland als Region (für Feiertage „PH“ in den Öffnungszeiten) */
const NOMINATIM_DE = { lat: 51.16, lon: 10.45, address: { country_code: 'de', state: '' } };

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Zustand jetzt und Zeiten heute. Ohne Angabe oder bei nicht lesbarer Angabe: „unbekannt“.
 * Lokale Zeit des Geräts.
 */
export function openingInfo(Oh: OhConstructor, value: string | null | undefined, now: Date): OpeningInfo {
  const v = value?.trim();
  if (!v) return { state: 'unknown', today: null };
  let oh: OhInstance;
  try {
    oh = new Oh(v, NOMINATIM_DE, { mode: 0, locale: 'de' });
  } catch {
    return { state: 'unknown', today: null };
  }
  try {
    const state: OpenState = oh.getUnknown(now) ? 'unknown' : oh.getState(now) ? 'open' : 'closed';
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const today = oh.getOpenIntervals(start, end).map(([a, b]) => [hhmm(a), b.getTime() >= end.getTime() ? '24:00' : hhmm(b)] as [string, string]);
    return { state, today };
  } catch {
    return { state: 'unknown', today: null };
  }
}

/**
 * „Jetzt geöffnet“: geöffnete zuerst, Praxen ohne (lesbare) Zeiten bleiben sichtbar und kommen ans Ende.
 * Geschlossene werden ausgeblendet.
 */
export function applyOpenNow<T>(rows: readonly T[], info: (r: T) => OpeningInfo, openNow: boolean): { shown: T[]; unknownTimes: T[] } {
  if (!openNow) return { shown: [...rows], unknownTimes: [] };
  const shown: T[] = [];
  const unknownTimes: T[] = [];
  for (const r of rows) {
    const s = info(r).state;
    if (s === 'open') shown.push(r);
    else if (s === 'unknown') unknownTimes.push(r);
  }
  return { shown, unknownTimes };
}

let loading: Promise<OhConstructor> | null = null;
/** Bibliothek erst laden, wenn sie gebraucht wird (hält die Startseite klein) */
export function loadOpeningHours(): Promise<OhConstructor> {
  loading ??= import('opening_hours').then((m) => (m as unknown as { default: OhConstructor }).default);
  return loading;
}
