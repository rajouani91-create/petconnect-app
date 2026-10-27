// Praxissuche: reine Hilfsfunktionen (Filter ↔ URL ↔ RPC, Zählen, Formate, Links). Ohne Supabase und React.
import type { MessageKey } from '../i18n';
import {
  PRACTICE_SERVICES,
  PRACTICE_TITLES,
  isPracticeSpecies,
  nameHintsSpecies,
  type PracticeService,
  type PracticeSpecies,
  type PracticeTitle,
} from './practiceCatalog';
import { DEFAULT_COUNTRY, isPracticeCountry, type PracticeCountry } from './practiceCountries';

export const RADII = [5, 10, 25, 50] as const;
export type Radius = (typeof RADII)[number];
export const DEFAULT_RADIUS: Radius = 10;
export const SEARCH_LIMIT = 100;

export type SortBy = 'distance' | 'name';

export interface PracticeFilters {
  /** Gewähltes Land (steht nur in der URL, wenn es nicht Deutschland ist) */
  country: PracticeCountry;
  /** Gewählter Ort: PLZ oder Ortsname (zum Wiederherstellen per geocode_place) */
  place: string;
  radius: Radius;
  species: PracticeSpecies | null;
  services: PracticeService[];
  titles: PracticeTitle[];
  q: string;
  openNow: boolean;
  sort: SortBy;
}

export const EMPTY_FILTERS: PracticeFilters = { country: DEFAULT_COUNTRY, place: '', radius: DEFAULT_RADIUS, species: null, services: [], titles: [], q: '', openNow: false, sort: 'distance' };

/** Sind Angebots-Filter gesetzt (Tierart, Leistung, Fachtitel)? */
export function hasOfferFilters(f: Pick<PracticeFilters, 'species' | 'services' | 'titles'>): boolean {
  return f.species !== null || f.services.length > 0 || f.titles.length > 0;
}

/** Filter + Mittelpunkt → Parameter für search_practices */
export function toRpcParams(f: PracticeFilters, center: { lat: number; lon: number }) {
  return {
    p_lat: center.lat,
    p_lon: center.lon,
    p_radius_km: f.radius,
    p_species: f.species,
    p_services: [...f.services].sort(),
    p_titles: [...f.titles].sort(),
    p_q: f.q.trim() || null,
    p_limit: SEARCH_LIMIT,
  };
}

/** Filter → URL-Parameter, z. B. ?plz=65428&r=10&tier=reptile&l=hibernation&t=reptiles (Standardwerte weggelassen) */
export function filtersToQuery(f: PracticeFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.country !== DEFAULT_COUNTRY) p.set('land', f.country);
  if (f.place.trim()) p.set('plz', f.place.trim());
  if (f.radius !== DEFAULT_RADIUS) p.set('r', String(f.radius));
  if (f.species) p.set('tier', f.species);
  for (const s of PRACTICE_SERVICES) if (f.services.includes(s)) p.append('l', s);
  for (const t of PRACTICE_TITLES) if (f.titles.includes(t)) p.append('t', t);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.openNow) p.set('offen', '1');
  if (f.sort === 'name') p.set('sort', 'name');
  return p;
}

/** URL-Parameter → Filter; Unbekanntes wird ignoriert, Mehrfachwerte entdoppelt */
export function queryToFilters(p: URLSearchParams): PracticeFilters {
  const r = Number(p.get('r'));
  const tier = p.get('tier');
  const land = p.get('land');
  return {
    country: isPracticeCountry(land) ? land : DEFAULT_COUNTRY,
    place: (p.get('plz') ?? '').trim().slice(0, 80),
    radius: (RADII as readonly number[]).includes(r) ? (r as Radius) : DEFAULT_RADIUS,
    species: isPracticeSpecies(tier) ? tier : null,
    services: PRACTICE_SERVICES.filter((s) => p.getAll('l').includes(s)),
    titles: PRACTICE_TITLES.filter((t) => p.getAll('t').includes(t)),
    q: (p.get('q') ?? '').slice(0, 80),
    openNow: p.get('offen') === '1',
    sort: p.get('sort') === 'name' ? 'name' : 'distance',
  };
}

export function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export interface PracticeLike {
  name: string;
  distance_km: number;
  has_profile: boolean;
  matches: boolean;
  registered: boolean;
  titles_verified: boolean;
  services: string[];
  species: string[];
  titles: string[];
}

/** Zählung: nur `matches`; ohne Angebots-Filter alle Praxen im Umkreis */
export function countMatches(rows: readonly PracticeLike[], offerFilters: boolean): number {
  return offerFilters ? rows.filter((r) => r.matches).length : rows.length;
}

/** „{n} Praxen passen“ / „1 Praxis passt“ / „Keine Praxis passt“ */
export function countKey(n: number): { key: MessageKey; n: number } {
  if (n === 0) return { key: 'psCount0', n };
  if (n === 1) return { key: 'psCount1', n };
  return { key: 'psCount', n };
}

const byName = (a: PracticeLike, b: PracticeLike) => a.name.localeCompare(b.name, 'de') || a.distance_km - b.distance_km;
const byDistance = (a: PracticeLike, b: PracticeLike) => a.distance_km - b.distance_km || a.name.localeCompare(b.name, 'de');

/** „Empfohlen (Entfernung)“: bei PetConnect zuerst, dann geprüfte Fachtitel, dann Entfernung */
export function byRecommended(a: PracticeLike, b: PracticeLike): number {
  return Number(b.registered) - Number(a.registered) || Number(b.titles_verified) - Number(a.titles_verified) || byDistance(a, b);
}

/**
 * Treffer und Praxen ohne Profil trennen.
 * Mit Angebots-Filtern: Treffer = matches; zweiter Abschnitt = Praxen ohne Profil (Angebot unbekannt).
 * Ohne Angebots-Filter: alle in einer Liste (`unknown` leer).
 * Im Abschnitt „Angebot unbekannt“ stehen Praxen, deren Name zur Tierart passt, weiter oben (`hinted`) –
 * sie bleiben aber Praxen mit unbekanntem Angebot, nie Treffer.
 */
export function splitResults<T extends PracticeLike>(
  rows: readonly T[],
  offerFilters: boolean,
  sort: SortBy,
  species: PracticeSpecies | null = null,
): { matches: T[]; unknown: T[]; hinted: Set<T> } {
  const main = sort === 'name' ? byName : byRecommended;
  const side = sort === 'name' ? byName : byDistance;
  if (!offerFilters) return { matches: [...rows].sort(main), unknown: [], hinted: new Set() };
  const unknown = rows.filter((r) => !r.has_profile);
  const hinted = new Set(unknown.filter((r) => nameHintsSpecies(r.name, species)));
  return {
    matches: rows.filter((r) => r.matches).sort(main),
    unknown: unknown.sort((a, b) => Number(hinted.has(b)) - Number(hinted.has(a)) || side(a, b)),
    hinted,
  };
}

// ---------- Leer-Zustände und Radius-Vorschlag ----------

/** Eine Zeile aus count_practices_by_radius */
export interface RadiusCount {
  radius_km: number;
  total: number;
  with_profile: number;
  matches: number;
}

export type EmptyState =
  /** Treffer vorhanden – nichts Besonderes anzeigen */
  | { kind: 'results' }
  /** Im größeren Umkreis gibt es echte Treffer */
  | { kind: 'expand'; radius: Radius; n: number }
  /** Praxen im Umkreis, aber keine hat Angaben zum Angebot */
  | { kind: 'noProfiles' }
  /** Es gibt Praxen mit Angebot, aber keine passt */
  | { kind: 'noMatch' }
  /** Bis 50 km gar keine Praxis */
  | { kind: 'nothing' }
  /** Namenssuche ohne Ergebnis; `radius` = nächste Stufe, in der es Praxen mit dem Namen gibt */
  | { kind: 'nameNone'; radius: Radius | null };

/**
 * Was zeigen wir, wenn im gewählten Umkreis nichts passt?
 * `shown` = Zahl der angezeigten Treffer (nach „Jetzt geöffnet“), `counts` = Ergebnis von count_practices_by_radius.
 * Ohne Zähler (noch nicht geladen/Fehler) gilt der einfache Hinweis „Keine Praxis passt“.
 */
export function emptyState(
  shown: number,
  counts: readonly RadiusCount[] | null,
  f: Pick<PracticeFilters, 'radius' | 'species' | 'services' | 'titles' | 'q' | 'openNow'>,
): EmptyState {
  if (shown > 0) return { kind: 'results' };
  if (!counts || counts.length === 0) return { kind: 'noMatch' };
  const at = (k: number) => counts.find((c) => c.radius_km === k) ?? { radius_km: k, total: 0, with_profile: 0, matches: 0 };
  const offer = hasOfferFilters(f);
  const here = at(f.radius);
  const larger = RADII.filter((r) => r > f.radius);
  // Nur „Jetzt geöffnet“ blendet aus: der Umkreis ist nicht das Problem
  if (f.openNow && (offer ? here.matches : here.total) > 0) return { kind: 'noMatch' };
  if (f.q.trim() && here.total === 0) return { kind: 'nameNone', radius: larger.find((r) => at(r).total > 0) ?? null };
  if (at(50).total === 0) return { kind: 'nothing' };
  if (!offer) {
    const r = larger.find((k) => at(k).total > 0);
    return r ? { kind: 'expand', radius: r, n: at(r).total } : { kind: 'noMatch' };
  }
  const r = larger.find((k) => at(k).matches > 0);
  if (r) return { kind: 'expand', radius: r, n: at(r).matches };
  if (RADII.every((k) => at(k).matches === 0) && at(50).with_profile === 0) return { kind: 'noProfiles' };
  return { kind: 'noMatch' };
}

/** „1 passende Praxis …“ / „{n} passende Praxen …“ */
export const expandCountKey = (n: number): MessageKey => (n === 1 ? 'psExpandN1' : 'psExpandN');

// ---------- Hervorhebung im Vorschlag ----------

/**
 * Text in Teile zerlegen, damit die getippte Stelle fett erscheint. Liefert nur Text –
 * gerendert wird über React (kein innerHTML), Eingaben wie „<script>“ bleiben Text.
 * Groß/Klein und Umlaute (ü = ue = u) werden toleriert, solange die Länge Zeichen für Zeichen passt.
 */
export function highlightParts(label: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text: label, hit: false }];
  const fold = (c: string) => simpleChar(c);
  const L = [...label].map(fold).join('');
  const Q = [...q].map(fold).join('');
  const i = L.indexOf(Q);
  if (i < 0 || L.length !== label.length) return [{ text: label, hit: false }];
  return [
    { text: label.slice(0, i), hit: false },
    { text: label.slice(i, i + q.length), hit: true },
    { text: label.slice(i + q.length), hit: false },
  ].filter((part) => part.text !== '');
}

/** Ein Zeichen vereinfachen (gleiche Länge): klein, ä → a, ö → o, ü → u, ß → s */
function simpleChar(c: string): string {
  const l = c.toLowerCase();
  if (l === 'ß') return 's';
  const base = l.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return base.length === 1 ? base : l;
}

/** „2,3 km“ / „unter 0,1 km“ */
export function formatKm(km: number, locale: string): string {
  if (km < 0.1) return `< ${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.1)} km`;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(km)} km`;
}

export function formatAddress(p: { street: string | null; housenumber: string | null; postcode: string | null; city: string | null }): string {
  const line1 = [p.street, p.housenumber].filter(Boolean).join(' ');
  const line2 = [p.postcode, p.city].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
}

const coord = (n: number) => (Math.round(n * 1e6) / 1e6).toString();

/** Routen-Links: OpenStreetMap, Google Maps, Apple Karten (nur auf Apple-Geräten anbieten) */
export function routeLinks(lat: number, lon: number, label: string) {
  const ll = `${coord(lat)},${coord(lon)}`;
  return {
    osm: `https://www.openstreetmap.org/directions?to=${ll}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    apple: `maps://?daddr=${ll}&q=${encodeURIComponent(label)}`,
  };
}

/** „Fehler melden“ bei OpenStreetMap an der Stelle der Praxis */
export function osmNoteLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/note/new#map=18/${coord(lat)}/${coord(lon)}`;
}

export function isAppleDevice(ua: string, platform = ''): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(ua) || /^(iPhone|iPad|MacIntel)$/.test(platform);
}

/** Webseite aus OSM: ohne Schema → https; nur http(s) zulassen */
export function safeWebsite(url: string | null): string | null {
  const u = url?.trim();
  if (!u) return null;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Fehler der Suche/Ortsabfrage → ein Text */
export const SEARCH_ERROR: MessageKey = 'psError';

// ---------- gemerkte Ortswahl (nur PLZ/Ort, keine Koordinaten) ----------

const PLACE_KEY = 'pc-practice-place';
const COUNTRY_KEY = 'pc-practice-country';

export function readLastCountry(): PracticeCountry | null {
  try {
    const v = localStorage.getItem(COUNTRY_KEY);
    return isPracticeCountry(v) ? v : null;
  } catch {
    return null;
  }
}
/** Zuletzt gewählter Ort, aber nur wenn er zum Land passt (Postleitzahlen gelten je Land) */
export function lastPlaceFor(country: PracticeCountry): string | null {
  return (readLastCountry() ?? DEFAULT_COUNTRY) === country ? readLastPlace() : null;
}
export function saveLastCountry(country: PracticeCountry): void {
  try {
    localStorage.setItem(COUNTRY_KEY, country);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function readLastPlace(): string | null {
  try {
    const v = localStorage.getItem(PLACE_KEY);
    return v && v.length <= 80 ? v : null;
  } catch {
    return null;
  }
}
export function saveLastPlace(place: string): void {
  try {
    localStorage.setItem(PLACE_KEY, place.slice(0, 80));
  } catch {
    /* Speicher nicht verfügbar */
  }
}
