import type { Kind, Repeat, Species } from './domain';

export interface TemplateEntry {
  readonly kind: Kind;
  /** Uhrzeit im Format HH:MM */
  readonly time: string;
  readonly repeat: Repeat;
}

const d = (kind: Kind, time: string): TemplateEntry => ({ kind, time, repeat: 'daily' });
const we = (kind: Kind, time: string): TemplateEntry => ({ kind, time, repeat: 'weekends' });

const SMALL_PET: readonly TemplateEntry[] = [d('feed', '07:30'), d('feed', '18:00'), we('cage', '10:00')];

const TEMPLATES: Record<Species, readonly TemplateEntry[]> = {
  dog: [d('walk', '07:00'), d('feed', '07:30'), d('walk', '12:30'), d('walk', '18:00'), d('feed', '18:30'), d('walk', '21:30')],
  cat: [d('feed', '07:00'), d('feed', '18:30'), d('litter', '20:00')],
  rabbit: SMALL_PET,
  guinea: SMALL_PET,
  bird: [d('feed', '08:00'), we('cage', '10:00')],
  reptile: [d('terra', '09:00')],
  horse: [d('feed', '07:00'), d('muck', '08:00'), d('feed', '18:00')],
  other: [],
};

/** Vorgeschlagener Tagesplan je Tierart. Vorschlag, noch nicht tierärztlich geprüft. */
export function templateFor(species: Species): TemplateEntry[] {
  return TEMPLATES[species].map((e) => ({ ...e }));
}
