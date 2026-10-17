// Praxissuche: reine Hilfsfunktionen (Filter ↔ URL ↔ RPC, Zählen, Formate, Links). Ohne Supabase und React.
import type { MessageKey } from '../i18n';
import {
  PRACTICE_SERVICES,
  PRACTICE_TITLES,
  isPracticeSpecies,
  type PracticeService,
  type PracticeSpecies,
  type PracticeTitle,
} from './practiceCatalog';

export const RADII = [5, 10, 25, 50] as const;
export type Radius = (typeof RADII)[number];
export const DEFAULT_RADIUS: Radius = 10;
export const SEARCH_LIMIT = 100;

export type SortBy = 'distance' | 'name';

export interface PracticeFilters {
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

export const EMPTY_FILTERS: PracticeFilters = { place: '', radius: DEFAULT_RADIUS, species: null, services: [], titles: [], q: '', openNow: false, sort: 'distance' };

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
  return {
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

/**
 * Treffer und Praxen ohne Profil trennen.
 * Mit Angebots-Filtern: Treffer = matches; zweiter Abschnitt = Praxen ohne Profil (Angebot unbekannt).
 * Ohne Angebots-Filter: alle in einer Liste (`unknown` leer).
 */
export function splitResults<T extends PracticeLike>(rows: readonly T[], offerFilters: boolean, sort: SortBy): { matches: T[]; unknown: T[] } {
  const by = (a: T, b: T) => (sort === 'name' ? a.name.localeCompare(b.name, 'de') || a.distance_km - b.distance_km : a.distance_km - b.distance_km || a.name.localeCompare(b.name, 'de'));
  if (!offerFilters) return { matches: [...rows].sort(by), unknown: [] };
  return { matches: rows.filter((r) => r.matches).sort(by), unknown: rows.filter((r) => !r.has_profile).sort(by) };
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
