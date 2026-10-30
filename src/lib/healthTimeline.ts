// Gesundheits-Verlauf: alle eigenen Einträge eines Tieres in einer Liste nach Monaten. Reine Funktionen (testbar).

export const TIMELINE_KINDS = ['vaccination', 'weight', 'vital', 'lab', 'document', 'medication'] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_FILTERS = ['all', 'vacc', 'values', 'meds', 'docs'] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

const FILTER_KINDS: Record<Exclude<TimelineFilter, 'all'>, readonly TimelineKind[]> = {
  vacc: ['vaccination'],
  values: ['weight', 'vital', 'lab'],
  meds: ['medication'],
  docs: ['document'],
};

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** Kalendertag YYYY-MM-DD */
  date: string;
  /** Zeitpunkt zur Sortierung innerhalb eines Tages (ISO) */
  at: string;
  title: string;
  detail: string;
  /** Ziel in der Tierakte (Reiter) */
  target: 'weight' | 'vitals' | 'vacc' | 'docs' | 'lab' | 'meds';
}

export function filterEntries(entries: readonly TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  if (filter === 'all') return [...entries];
  const kinds = FILTER_KINDS[filter];
  return entries.filter((e) => kinds.includes(e.kind));
}

/** Neueste zuerst (Tag, dann Zeitpunkt, dann Id für eine stabile Reihenfolge) */
export function sortEntries(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export interface MonthGroup {
  /** YYYY-MM */
  month: string;
  entries: TimelineEntry[];
}

/** Bereits sortierte Einträge nach Monat bündeln */
export function groupByMonth(sorted: readonly TimelineEntry[]): MonthGroup[] {
  const out: MonthGroup[] = [];
  for (const e of sorted) {
    const month = e.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) last.entries.push(e);
    else out.push({ month, entries: [e] });
  }
  return out;
}

/** Laborwerte vom selben Tag zu einem Eintrag zusammenfassen */
export function labDays<T extends { measured_on: string; created_at: string }>(rows: readonly T[]): { date: string; at: string; count: number }[] {
  const map = new Map<string, { date: string; at: string; count: number }>();
  for (const r of rows) {
    const cur = map.get(r.measured_on);
    if (cur) {
      cur.count += 1;
      if (r.created_at > cur.at) cur.at = r.created_at;
    } else map.set(r.measured_on, { date: r.measured_on, at: r.created_at, count: 1 });
  }
  return [...map.values()];
}
