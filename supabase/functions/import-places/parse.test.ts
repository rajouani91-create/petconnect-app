import { describe, expect, it } from 'vitest';
import { chunk, isCountry, parseGeonames } from './parse.ts';

const nl = ['NL\t1011\tAmsterdam\tNoord-Holland\tNH\tGemeente Amsterdam\t0363\t\t\t52.3702\t4.9\t5', 'NL\t1011AB\tAmsterdam\tNoord-Holland\tNH\t\t\t\t\t52.37\t4.9\t5', 'NL\t3511\tUtrecht\tUtrecht\tUT\t\t\t\t\t52.09\t5.12\t5'].join('\n');

describe('GeoNames-Datei lesen', () => {
  it('liest Zeilen, vereinheitlicht NL-PLZ und entfernt doppelte', () => {
    const rows = parseGeonames(nl, 'NL');
    expect(rows.map((r) => `${r.postcode} ${r.place}`)).toEqual(['1011 Amsterdam', '3511 Utrecht']);
    expect(rows[0]).toMatchObject({ country: 'NL', lat: 52.3702, lon: 4.9 });
  });
  it('französische PLZ mit mehreren Orten bleiben getrennt', () => {
    const fr = ['FR\t69003\tLyon 03\tAuvergne-Rhône-Alpes\t84\t\t\t\t\t45.76\t4.85\t5', 'FR\t69003\tLyon\tA\t84\t\t\t\t\t45.75\t4.84\t5'].join('\n');
    expect(parseGeonames(fr, 'FR')).toHaveLength(2);
  });
  it('überspringt Ungültiges und Zeilen anderer Länder', () => {
    const bad = ['FR\t6900\tZu kurz\t\t\t\t\t\t\t45\t4\t5', 'FR\t69003\t\t\t\t\t\t\t\t45\t4\t5', 'FR\t69003\tOrt\t\t\t\t\t\t\tabc\t4\t5', 'FR\t69003\tOrt\t\t\t\t\t\t\t95\t4\t5', 'DE\t65428\tRüsselsheim\t\t\t\t\t\t\t50\t8\t5', 'kaputt'].join('\n');
    expect(parseGeonames(bad, 'FR')).toEqual([]);
  });
  it('Länder und Pakete', () => {
    expect(isCountry('FR') && isCountry('NL') && isCountry('MA')).toBe(true);
    expect(isCountry('DE')).toBe(false);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
