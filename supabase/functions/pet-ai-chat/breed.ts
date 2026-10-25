/* Rassendaten aus The Dog API / The Cat API (nur Hund und Katze). Mit Zwischenspeicher und Zeitlimit. Fehler brechen den Chat nie ab. */

export interface BreedFacts {
  name: string;
  origin: string | null;
  group: string | null;
  temperament: string | null;
  lifeSpan: string | null;
  weight: string | null;
  height: string | null;
  description: string | null;
}
export type BreedStatus = 'none' | 'ok' | 'not_found' | 'unavailable';
export interface BreedResult {
  status: BreedStatus;
  facts: BreedFacts | null;
}

interface RawBreed {
  name?: string;
  alt_names?: string | null;
  origin?: string | null;
  breed_group?: string | null;
  temperament?: string | null;
  life_span?: string | null;
  weight?: { metric?: string | null } | null;
  height?: { metric?: string | null } | null;
  description?: string | null;
}

const TTL_OK = 24 * 3600 * 1000;
const TTL_MISS = 3600 * 1000;
const cache = new Map<string, { at: number; result: BreedResult }>();
export function clearBreedCache(): void {
  cache.clear();
}

function norm(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cut(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t || null;
}

export function pickBreed(list: RawBreed[], wanted: string): RawBreed | null {
  const w = norm(wanted);
  const exact = list.find((b) => b.name && norm(b.name) === w);
  if (exact) return exact;
  const alt = list.find((b) => (b.alt_names ?? '').split(',').some((a) => norm(a) === w));
  if (alt) return alt;
  // Mehrdeutige Treffer (z. B. „Shepherd“) werden nicht geraten.
  return list.length === 1 ? list[0]! : null;
}

export function toFacts(b: RawBreed): BreedFacts {
  return {
    name: b.name ?? '',
    origin: cut(b.origin, 60),
    group: cut(b.breed_group, 40),
    temperament: cut(b.temperament, 200),
    lifeSpan: cut(b.life_span, 20),
    weight: cut(b.weight?.metric, 60),
    height: cut(b.height?.metric, 60),
    description: cut(b.description, 400),
  };
}

export interface BreedOptions {
  dogKey?: string;
  catKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export async function fetchBreed(species: string, breed: string | null, o: BreedOptions = {}): Promise<BreedResult> {
  if ((species !== 'dog' && species !== 'cat') || !breed) return { status: 'none', facts: null };
  const name = breed.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 3) return { status: 'not_found', facts: null };
  const now = (o.now ?? Date.now)();
  const key = `${species}:${norm(name)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.result.status === 'ok' ? TTL_OK : TTL_MISS)) return hit.result;

  const base = species === 'dog' ? 'https://api.thedogapi.com/v1/breeds/search' : 'https://api.thecatapi.com/v1/breeds/search';
  const apiKey = species === 'dog' ? o.dogKey : o.catKey;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 4000);
  try {
    const res = await (o.fetchImpl ?? fetch)(`${base}?q=${encodeURIComponent(name)}`, {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: 'unavailable', facts: null }; // nicht zwischenspeichern: beim nächsten Mal neu versuchen
    const list = (await res.json()) as RawBreed[];
    const found = Array.isArray(list) ? pickBreed(list, name) : null;
    const result: BreedResult = found ? { status: 'ok', facts: toFacts(found) } : { status: 'not_found', facts: null };
    cache.set(key, { at: now, result });
    return result;
  } catch {
    return { status: 'unavailable', facts: null };
  } finally {
    clearTimeout(timer);
  }
}
