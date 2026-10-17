// Katalog der Praxissuche: Tierarten, Leistungen, Fachtierarzt-Bezeichnungen.
// Die Schlüssel stehen so in der Datenbank (practice_profiles); Anzeige über i18n.
// Neue Einträge hier ergänzen und den Text in allen Sprachdateien anlegen (der Test prüft das).
import type { MessageKey } from '../i18n';

export const PRACTICE_SPECIES = ['dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse'] as const;
export type PracticeSpecies = (typeof PRACTICE_SPECIES)[number];

export const PRACTICE_SERVICES = ['surgery', 'dentistry', 'imaging', 'ct_mri', 'blood_bank', 'hibernation', 'home_visits', 'emergency_24h', 'physio', 'equine_mobile'] as const;
export type PracticeService = (typeof PRACTICE_SERVICES)[number];

export const PRACTICE_TITLES = ['small_animals', 'surgery', 'reptiles', 'birds', 'horses'] as const;
export type PracticeTitle = (typeof PRACTICE_TITLES)[number];

/** Tierarten-Texte: dieselben wie bei „Welches Tier?“ in der Tierakte */
export const SPECIES_TEXT: Record<PracticeSpecies, MessageKey> = {
  dog: 'dog',
  cat: 'cat',
  rabbit: 'rabbit',
  guinea: 'guinea',
  bird: 'bird',
  reptile: 'reptile',
  horse: 'horse',
};

export const SERVICE_TEXT: Record<PracticeService, MessageKey> = {
  surgery: 'svcOp',
  dentistry: 'svcDent',
  imaging: 'svcImg',
  ct_mri: 'svcCt',
  blood_bank: 'svcBlood',
  hibernation: 'svcHib',
  home_visits: 'svcHouse',
  emergency_24h: 'svcEr',
  physio: 'svcPhysio',
  equine_mobile: 'svcRide',
};

export const TITLE_TEXT: Record<PracticeTitle, MessageKey> = {
  small_animals: 'fSmall',
  surgery: 'fSurg',
  reptiles: 'fRept',
  birds: 'fBird',
  horses: 'fHorse',
};

export const isPracticeSpecies = (v: unknown): v is PracticeSpecies => typeof v === 'string' && (PRACTICE_SPECIES as readonly string[]).includes(v);
export const isPracticeService = (v: unknown): v is PracticeService => typeof v === 'string' && (PRACTICE_SERVICES as readonly string[]).includes(v);
export const isPracticeTitle = (v: unknown): v is PracticeTitle => typeof v === 'string' && (PRACTICE_TITLES as readonly string[]).includes(v);

/** Alle Übersetzungsschlüssel des Katalogs (für den Vollständigkeitstest) */
export const CATALOG_KEYS: MessageKey[] = [...Object.values(SPECIES_TEXT), ...Object.values(SERVICE_TEXT), ...Object.values(TITLE_TEXT)];

/**
 * Schlüsselwörter im Praxisnamen je Tierart (klein, ohne Umlaute). Nur für Praxen OHNE Profil:
 * Sie dürfen damit im Abschnitt „Angebot unbekannt“ weiter oben stehen – nie als Treffer.
 */
export const SPECIES_NAME_HINTS: Record<PracticeSpecies, readonly string[]> = {
  dog: ['hund'],
  cat: ['katze'],
  rabbit: ['kaninchen', 'kleinsauger', 'nager'],
  guinea: ['meerschwein', 'kleinsauger', 'nager'],
  bird: ['vogel', 'exoten', 'aviar'],
  reptile: ['exoten', 'reptil', 'herpeto'],
  horse: ['pferd', 'pferde', 'equi'],
};

/** Name vereinfachen: klein, ohne Akzente, ä/ae → a, ö/oe → o, ü/ue → u, ß → s */
export function simpleName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 's')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/** Deutet der Praxisname auf die Tierart hin? (z. B. „Exotenpraxis“ → Reptil) */
export function nameHintsSpecies(name: string, species: PracticeSpecies | null): boolean {
  if (!species) return false;
  const n = simpleName(name);
  return SPECIES_NAME_HINTS[species].some((w) => n.includes(w));
}
