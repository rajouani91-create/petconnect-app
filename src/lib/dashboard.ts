/** Antwort der Datenbankfunktion staff_dashboard: nur Zahlen, nur für Admin. */
export interface DashboardData {
  generated_at: string;
  users: { total: number; new_7d: number; new_30d: number; active_7d: number; active_30d: number; with_pets: number; locked: number };
  pets: { total: number; new_7d: number; shared: number; by_species: Record<string, number> };
  records: Record<RecordKey, number>;
  sharing: { members: number; invites: number; invites_accepted: number; sitter_links: number; favorites: number };
  push: { subscriptions: number; sent_7d: number };
  ai: { requests_24h: number; users_24h: number; hourly: { h: string; n: number }[] };
  tickets: { open: number; in_progress: number; closed: number };
  series: DayPoint[];
}
export interface DayPoint {
  d: string;
  signups: number;
  pets: number;
  interactions: number;
}
export type SeriesKey = 'signups' | 'pets' | 'interactions';

/** Antwort von staff_dashboard_practice: Praxen und Benachrichtigungen, nur Zahlen und Summen. */
export interface PracticeDashboardData {
  generated_at: string;
  accounts: { active: number; pending: number; suspended: number; staff: number };
  patients: { total: number; pets: number; code: number; request: number };
  appointments: {
    total: number; online: number; phone: number; upcoming: number; new: number; confirmed: number; attended: number; no_show: number;
    cancelled_owner: number; cancelled_practice: number; moved_by_owner: number; waitlist: number; recalls: number;
  };
  entries: { finding: number; vital: number; medication: number; vaccination: number; voided: number };
  invoices: { count: number; drafts: number; gross: number | string; paid: number | string; open: number | string; cancellations: number };
  inquiries: { total: number; open: number; offered: number; booked: number; declined: number; wished: number; messages: number; replied_h: number | string | null };
  notifications: { total: number; last_7d: number; read: number; by_category: Record<string, number>; quick_actions: number; devices: number };
  series: { d: string; practice: number; notifications: number }[];
}

/** Euro-Betrag (Datenbank liefert numeric teils als Text) */
export function euro(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(Number.isFinite(n) ? n : 0);
}

/** Antwortzeit der Praxis lesbar: Minuten, Stunden oder Tage */
export function hoursText(h: number | string | null | undefined): string {
  if (h === null || h === undefined || h === '') return '–';
  const n = Number(h);
  if (!Number.isFinite(n)) return '–';
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} Min.`;
  if (n < 48) return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n)} Std.`;
  return `${Math.round(n / 24)} Tage`;
}

const NOTIF_CAT: Record<string, string> = {
  care: 'Alltag/Pflege', feeding: 'Füttern', medication: 'Medikamente', appointment: 'Termine', message: 'Nachrichten',
  practice: 'Praxis', vaccination: 'Impfungen', system: 'System',
};
export function notifCategoryName(key: string): string {
  return NOTIF_CAT[key] ?? key;
}
export type RecordKey =
  | 'routine_items' | 'routine_done' | 'weights' | 'vaccinations' | 'documents' | 'appointments'
  | 'reminders' | 'medications' | 'doses_given' | 'lab_values' | 'insurances' | 'claims';

/** Summe der letzten n Tage einer Reihe. */
export function sumLast(series: DayPoint[], key: SeriesKey, n: number): number {
  return series.slice(-n).reduce((a, p) => a + p[key], 0);
}

/** Laufende Gesamtzahl: Startwert (Stand vor dem ersten Tag) plus Summe der Tageswerte. Index 0 ist der Startwert selbst. */
export function cumulative(daily: number[], base: number): number[] {
  const out = [base];
  for (const v of daily) out.push(out[out.length - 1]! + v);
  return out;
}

/** Wachstum in Prozent zwischen zwei Ständen; ohne Vergleichswert (0) null. */
export function growthPct(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

/** Anteil in Prozent, ganzzahlig; bei Nenner 0 → 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Rundet den Höchstwert auf eine „schöne“ Achsenobergrenze (mindestens min). */
export function niceMax(max: number, min = 4): number {
  if (max <= min) return min;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

export interface Pt {
  x: number;
  y: number;
}
/** Punkte einer Reihe im Zeichenbereich (Breite w, Höhe h, Rand pad); y wächst nach unten. */
export function toPoints(values: number[], w: number, h: number, pad: { l: number; r: number; t: number; b: number }, max: number): Pt[] {
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const step = values.length > 1 ? iw / (values.length - 1) : 0;
  return values.map((v, i) => ({ x: pad.l + i * step, y: pad.t + ih - (max > 0 ? (v / max) * ih : 0) }));
}

export function linePath(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export function areaPath(pts: Pt[], baseY: number): string {
  if (pts.length === 0) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${linePath(pts)} L${last.x.toFixed(1)} ${baseY.toFixed(1)} L${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

const SPECIES: Record<string, string> = {
  dog: 'Hunde', cat: 'Katzen', horse: 'Pferde', bird: 'Vögel', rabbit: 'Kaninchen', guinea: 'Meerschweinchen', reptile: 'Reptilien', other: 'Andere',
};
export function speciesName(key: string): string {
  return SPECIES[key] ?? key;
}

export const RECORD_LABELS: Record<RecordKey, string> = {
  routine_items: 'Routine-Einträge',
  routine_done: 'Routine erledigt',
  doses_given: 'Medikamenten-Gaben',
  weights: 'Gewichtseinträge',
  appointments: 'Termine',
  vaccinations: 'Impfungen',
  medications: 'Medikamente',
  reminders: 'Erinnerungen',
  documents: 'Dokumente',
  lab_values: 'Laborwerte',
  insurances: 'Versicherungen',
  claims: 'Schadensfälle',
};

/** Einträge absteigend nach Anzahl. */
export function sortedRecords(r: Record<RecordKey, number>): { key: RecordKey; label: string; n: number }[] {
  return (Object.keys(RECORD_LABELS) as RecordKey[])
    .map((key) => ({ key, label: RECORD_LABELS[key], n: r[key] ?? 0 }))
    .sort((a, b) => b.n - a.n);
}

/** Ganzzahl mit deutschem Tausenderpunkt. */
export function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE').format(Math.round(n));
}

/** Antwort der Datenbankfunktion staff_activity: letzte 24 Stunden, nur Arten und Zeiten. */
export interface ActivityData {
  generated_at: string;
  logins: number;
  ai: number;
  by_kind: Record<string, number>;
  hourly: { h: string; n: number; push: number; ai: number }[];
  recent: { kind: string; at: string }[];
}

const ACTIVITY: Record<string, string> = {
  signup: 'Neues Konto', pet: 'Neues Tier', routine_done: 'Routine abgehakt', routine_item: 'Routine angelegt',
  weight: 'Gewicht eingetragen', vaccination: 'Impfung eingetragen', appointment: 'Termin angelegt', reminder: 'Erinnerung angelegt',
  medication: 'Medikament angelegt', document: 'Dokument hochgeladen', lab_value: 'Laborwert eingetragen', dose_given: 'Medikament gegeben',
  invite: 'Einladung erstellt', invite_accepted: 'Einladung angenommen', sitter_link: 'Sitter-Link erstellt',
  favorite: 'Praxis als Favorit', ticket: 'Neues Ticket', push: 'Push-Nachricht gesendet',
};
/** Lesbarer Name einer Ereignisart; Unbekanntes bleibt sichtbar statt zu verschwinden. */
export function activityName(kind: string): string {
  return ACTIVITY[kind] ?? kind;
}

/** Ereignisarten nach Anzahl (absteigend), danach alphabetisch. */
export function sortedActivity(by: Record<string, number>): { key: string; label: string; n: number }[] {
  return Object.entries(by)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({ key, label: activityName(key), n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'de'));
}
