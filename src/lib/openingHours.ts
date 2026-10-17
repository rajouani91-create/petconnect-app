// Öffnungszeiten aus OpenStreetMap (opening_hours-Syntax) auswerten.
// Bibliothek: opening_hours (LGPL-3.0, https://github.com/opening-hours/opening_hours.js), nur bei Bedarf geladen.

/** open = geöffnet, closing = geöffnet, schließt in weniger als 45 Minuten */
export type OpenState = 'open' | 'closing' | 'closed' | 'unknown';

export interface OpeningInfo {
  state: OpenState;
  /** Zeitspannen heute, z. B. [["08:00","12:00"],["15:00","18:00"]]; null = unbekannt */
  today: [string, string][] | null;
  /** Geöffnet: Schluss (null = rund um die Uhr). Geschlossen: nächste Öffnung (null = nicht in den nächsten 7 Tagen) */
  change: Date | null;
  /** Kommentar aus den Zeiten, z. B. „nur Notfälle“ */
  comment: string | null;
}

/** Minimale Schnittstelle der Bibliothek (für Tests austauschbar) */
export interface OhInstance {
  getState(date?: Date): boolean;
  getUnknown(date?: Date): boolean;
  getComment(date?: Date): string | undefined;
  getNextChange(date?: Date, maxdate?: Date): Date | undefined;
  getOpenIntervals(from: Date, to: Date): [Date, Date, boolean, string | undefined][];
}
export type OhConstructor = new (value: string, nominatim?: unknown, conf?: unknown) => OhInstance;

export const CLOSING_SOON_MIN = 45;
export const DEFAULT_STATE = 'Hessen';

/**
 * Bundesland aus der PLZ (Leitregion, erste zwei Ziffern) – nur für Feiertage („PH“).
 * Die PLZ-Gebiete folgen nicht genau den Landesgrenzen; im Zweifel Hessen.
 */
const STATE_BY_PREFIX: [number, number, string][] = [
  [1, 2, 'Sachsen'], [3, 3, 'Brandenburg'], [4, 4, 'Sachsen'], [6, 6, 'Sachsen-Anhalt'], [7, 7, 'Thüringen'], [8, 9, 'Sachsen'],
  [10, 13, 'Berlin'], [14, 16, 'Brandenburg'], [17, 19, 'Mecklenburg-Vorpommern'], [20, 22, 'Hamburg'], [23, 25, 'Schleswig-Holstein'],
  [26, 27, 'Niedersachsen'], [28, 28, 'Bremen'], [29, 31, 'Niedersachsen'], [32, 33, 'Nordrhein-Westfalen'], [34, 36, 'Hessen'],
  [37, 38, 'Niedersachsen'], [39, 39, 'Sachsen-Anhalt'], [40, 48, 'Nordrhein-Westfalen'], [49, 49, 'Niedersachsen'],
  [50, 53, 'Nordrhein-Westfalen'], [54, 56, 'Rheinland-Pfalz'], [57, 59, 'Nordrhein-Westfalen'], [60, 65, 'Hessen'], [66, 66, 'Saarland'],
  [67, 67, 'Rheinland-Pfalz'], [68, 79, 'Baden-Württemberg'], [80, 87, 'Bayern'], [88, 89, 'Baden-Württemberg'], [90, 97, 'Bayern'], [98, 99, 'Thüringen'],
];
export function stateFromPostcode(postcode: string | null | undefined): string {
  const m = /^(\d{2})\d{3}$/.exec(postcode?.trim() ?? '');
  if (!m) return DEFAULT_STATE;
  const n = Number(m[1]);
  return STATE_BY_PREFIX.find(([a, b]) => n >= a && n <= b)?.[2] ?? DEFAULT_STATE;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const UNKNOWN: OpeningInfo = { state: 'unknown', today: null, change: null, comment: null };

/**
 * Zustand jetzt, Zeiten heute, nächster Wechsel und Kommentar. Ohne Angabe oder bei nicht lesbarer Angabe:
 * „unbekannt“ – nie ein Fehler. Lokale Zeit des Geräts; Feiertage nach Bundesland (aus der PLZ).
 */
export function openingInfo(Oh: OhConstructor, value: string | null | undefined, now: Date, postcode?: string | null): OpeningInfo {
  const v = value?.trim();
  if (!v) return UNKNOWN;
  try {
    const nominatim = { lat: 51.16, lon: 10.45, address: { country_code: 'de', state: stateFromPostcode(postcode) } };
    const oh = new Oh(v, nominatim, { mode: 0, locale: 'de' });
    const comment = oh.getComment(now)?.trim() || null;
    if (oh.getUnknown(now)) return { ...UNKNOWN, comment };
    const open = oh.getState(now);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const today = oh.getOpenIntervals(start, end).map(([a, b]) => [hhmm(a), b.getTime() >= end.getTime() ? '24:00' : hhmm(b)] as [string, string]);
    const week = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const change = oh.getNextChange(now, week) ?? null;
    if (!open) return { state: 'closed', today, change, comment };
    const soon = change !== null && change.getTime() - now.getTime() < CLOSING_SOON_MIN * 60 * 1000;
    return { state: soon ? 'closing' : 'open', today, change, comment };
  } catch {
    return UNKNOWN;
  }
}

/** Text für das Badge (immer Text, Farbe nur zusätzlich) */
export type OpeningText =
  | { key: 'psOpenUntil' | 'psClosingSoon' | 'psOpensToday'; x: string }
  | { key: 'psOpensDay'; x: string; day: Date }
  | { key: 'psOpen247' | 'psClosedNow' | 'psHoursUnknown' };

export function openingText(info: OpeningInfo, now: Date): OpeningText {
  const c = info.change;
  switch (info.state) {
    case 'unknown':
      return { key: 'psHoursUnknown' };
    case 'open':
      return c ? { key: 'psOpenUntil', x: hhmm(c) } : { key: 'psOpen247' };
    case 'closing':
      return { key: 'psClosingSoon', x: hhmm(c!) };
    case 'closed': {
      if (!c) return { key: 'psClosedNow' };
      const sameDay = c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth() && c.getDate() === now.getDate();
      return sameDay ? { key: 'psOpensToday', x: hhmm(c) } : { key: 'psOpensDay', x: hhmm(c), day: c };
    }
  }
}

/** „Jetzt geöffnet“ zählt „schließt bald“ mit */
export const isOpen = (s: OpenState) => s === 'open' || s === 'closing';

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
    if (isOpen(s)) shown.push(r);
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
