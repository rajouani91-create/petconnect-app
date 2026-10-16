// Fachliche Wertebereiche, identisch mit den CHECK-Constraints der Datenbank.

export const SPECIES = ['dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse', 'other'] as const;
export type Species = (typeof SPECIES)[number];

export const KINDS = ['walk', 'feed', 'med', 'litter', 'cage', 'terra', 'muck', 'own'] as const;
export type Kind = (typeof KINDS)[number];

export const REPEATS = ['daily', 'weekdays', 'weekends'] as const;
export type Repeat = (typeof REPEATS)[number];

export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export function isSpecies(v: string): v is Species {
  return (SPECIES as readonly string[]).includes(v);
}
export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}
export function isRepeat(v: string): v is Repeat {
  return (REPEATS as readonly string[]).includes(v);
}
