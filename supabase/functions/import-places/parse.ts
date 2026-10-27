/* GeoNames-Postleitzahlen (Tabulator-Datei) → Zeilen für public.place_index.
   Spalten: 0 Land, 1 PLZ, 2 Ort, 3–8 Verwaltungsangaben, 9 Breite, 10 Länge, 11 Genauigkeit.
   Quelle: GeoNames (geonames.org), Lizenz CC BY 4.0. */

export type Country = 'FR' | 'NL' | 'MA';
export const COUNTRIES: readonly Country[] = ['FR', 'NL', 'MA'];

export interface PlaceRow {
  country: Country;
  postcode: string;
  place: string;
  lat: number;
  lon: number;
  rank: number;
}

const POSTCODE: Record<Country, RegExp> = { FR: /^\d{5}$/, NL: /^\d{4}$/, MA: /^\d{5}$/ };

export const isCountry = (v: unknown): v is Country => typeof v === 'string' && (COUNTRIES as readonly string[]).includes(v);

/** Ungültige Zeilen werden übersprungen; doppelte (PLZ, Ort) entfallen. NL: aus „1011AB“ wird „1011“. */
export function parseGeonames(text: string, country: Country): PlaceRow[] {
  const seen = new Set<string>();
  const rows: PlaceRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split('\t');
    if (c.length < 11 || c[0] !== country) continue;
    let postcode = (c[1] ?? '').replace(/\s+/g, '').toUpperCase();
    if (country === 'NL') postcode = postcode.slice(0, 4);
    const place = (c[2] ?? '').trim().slice(0, 120);
    const lat = Number(c[9]);
    const lon = Number(c[10]);
    if (!POSTCODE[country].test(postcode) || !place || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const key = `${postcode}|${place}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ country, postcode, place, lat, lon, rank: 0 });
  }
  return rows;
}

/** In Stücke teilen (Upsert in Paketen) */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
