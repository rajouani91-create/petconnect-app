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
export type RecordKey =
  | 'routine_items' | 'routine_done' | 'weights' | 'vaccinations' | 'documents' | 'appointments'
  | 'reminders' | 'medications' | 'doses_given' | 'lab_values' | 'insurances' | 'claims';

/** Summe der letzten n Tage einer Reihe. */
export function sumLast(series: DayPoint[], key: SeriesKey, n: number): number {
  return series.slice(-n).reduce((a, p) => a + p[key], 0);
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
