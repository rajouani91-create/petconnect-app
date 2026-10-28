// Zeitleiste der Tierakte: reine Zusammenstellung aus vorhandenen Daten, ohne React und ohne Supabase.
// Datumsangaben sind Kalendertage YYYY-MM-DD (Europe/Berlin).

export type TimelineKind = 'vaccination' | 'document' | 'medication' | 'weight';

export const TIMELINE_KINDS: readonly TimelineKind[] = ['vaccination', 'document', 'medication', 'weight'];

export interface TimelineEntry {
  readonly id: string;
  readonly kind: TimelineKind;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly title: string;
  /** Zusatz, z. B. Menge oder Gewicht */
  readonly detail: string | null;
}

export interface TimelineSources {
  readonly vaccinations: readonly { id: string; name: string; given_on: string | null }[];
  readonly documents: readonly { id: string; title: string; category: string; doc_date: string | null }[];
  readonly doses: readonly { id: string; medication_name: string; scheduled_on: string }[];
  readonly weights: readonly { id: string; kg: number; measured_on: string }[];
}

/** Alle Einträge, neueste zuerst. Einträge ohne Datum entfallen. */
export function buildTimeline(src: TimelineSources, filter: readonly TimelineKind[] = TIMELINE_KINDS, locale = 'de-DE'): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  if (filter.includes('vaccination')) {
    for (const v of src.vaccinations) {
      if (v.given_on) out.push({ id: `v-${v.id}`, kind: 'vaccination', date: v.given_on, title: v.name, detail: null });
    }
  }
  if (filter.includes('document')) {
    for (const d of src.documents) {
      if (d.doc_date) out.push({ id: `d-${d.id}`, kind: 'document', date: d.doc_date, title: d.title, detail: d.category });
    }
  }
  if (filter.includes('medication')) {
    for (const m of src.doses) out.push({ id: `m-${m.id}`, kind: 'medication', date: m.scheduled_on, title: m.medication_name, detail: null });
  }
  if (filter.includes('weight')) {
    for (const w of src.weights) out.push({ id: `w-${w.id}`, kind: 'weight', date: w.measured_on, title: `${w.kg.toLocaleString(locale, { maximumFractionDigits: 2 })} kg`, detail: null });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
