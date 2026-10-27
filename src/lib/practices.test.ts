import { describe, expect, it } from 'vitest';
import OpeningHours from 'opening_hours';
import { DICTIONARIES, LANGUAGES, translate } from '../i18n';
import { CATALOG_KEYS, PRACTICE_SERVICES, PRACTICE_SPECIES, PRACTICE_TITLES, SERVICE_TEXT, SPECIES_TEXT, TITLE_TEXT } from './practiceCatalog';
import { applyOpenNow, openingInfo, type OhConstructor } from './openingHours';
import {
  EMPTY_FILTERS,
  countKey,
  countMatches,
  filtersToQuery,
  formatAddress,
  formatKm,
  hasOfferFilters,
  isAppleDevice,
  osmNoteLink,
  queryToFilters,
  routeLinks,
  safeWebsite,
  splitResults,
  toRpcParams,
  toggle,
  type PracticeFilters,
} from './practices';

const Oh = OpeningHours as unknown as OhConstructor;
const reptileSearch: PracticeFilters = { ...EMPTY_FILTERS, place: '65428', radius: 10, species: 'reptile', services: ['hibernation'], titles: ['reptiles'] };

describe('Filter → RPC-Parameter', () => {
  it('überträgt Mittelpunkt, Umkreis, Angebot und Namen', () => {
    expect(toRpcParams(reptileSearch, { lat: 49.99, lon: 8.41 })).toEqual({
      p_lat: 49.99, p_lon: 8.41, p_radius_km: 10, p_species: 'reptile', p_services: ['hibernation'], p_titles: ['reptiles'], p_q: null, p_limit: 100,
    });
    expect(toRpcParams({ ...EMPTY_FILTERS, q: '  Tierklinik ', services: ['surgery', 'dentistry'] }, { lat: 1, lon: 2 })).toMatchObject({ p_species: null, p_services: ['dentistry', 'surgery'], p_titles: [], p_q: 'Tierklinik' });
  });
  it('Angebots-Filter erkannt', () => {
    expect(hasOfferFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasOfferFilters({ ...EMPTY_FILTERS, species: 'cat' })).toBe(true);
    expect(hasOfferFilters({ ...EMPTY_FILTERS, titles: ['birds'] })).toBe(true);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
  });
});

describe('URL ↔ Filter', () => {
  it('Beispiel aus dem Auftrag', () => {
    expect(filtersToQuery(reptileSearch).toString()).toBe('plz=65428&tier=reptile&l=hibernation&t=reptiles');
    expect(queryToFilters(new URLSearchParams('plz=65428&r=10&tier=reptile&l=hibernation&t=reptiles'))).toEqual(reptileSearch);
  });
  it('hin und zurück mit allen Feldern', () => {
    const f: PracticeFilters = { country: 'DE', place: 'Mainz', radius: 25, species: 'horse', services: ['equine_mobile', 'imaging'], titles: ['horses', 'surgery'], q: 'Pferde', openNow: true, sort: 'name' };
    const back = queryToFilters(filtersToQuery(f));
    expect(back).toEqual({ ...f, services: ['imaging', 'equine_mobile'], titles: ['surgery', 'horses'] });
    expect(filtersToQuery(EMPTY_FILTERS).toString()).toBe('');
  });
  it('Unbekanntes wird ignoriert, Standardwerte greifen', () => {
    const f = queryToFilters(new URLSearchParams('r=7&tier=dino&l=surgery&l=surgery&l=zauberei&t=x&offen=ja&sort=preis'));
    expect(f).toEqual({ ...EMPTY_FILTERS, services: ['surgery'] });
  });
});

describe('Zählen und Listen', () => {
  const p = (name: string, d: number, has_profile: boolean, matches: boolean) => ({ name, distance_km: d, has_profile, matches, services: [], species: [], titles: [], registered: false, titles_verified: false });
  const rows = [p('Zoo', 3, true, true), p('Ader', 1, true, false), p('Berg', 2, false, false), p('Cäsar', 0.5, true, true)];
  it('nur matches zählen; ohne Angebots-Filter alle', () => {
    expect(countMatches(rows, true)).toBe(2);
    expect(countMatches(rows, false)).toBe(4);
  });
  it('Zähltext', () => {
    expect(translate('de', countKey(3).key, { n: 3 })).toBe('3 Praxen passen');
    expect(translate('de', countKey(1).key, { n: 1 })).toBe('1 Praxis passt');
    expect(translate('de', countKey(0).key, { n: 0 })).toBe('Keine Praxis passt');
  });
  it('Treffer und Praxen ohne Profil getrennt, sortiert nach Entfernung oder Name', () => {
    const s = splitResults(rows, true, 'distance');
    expect(s.matches.map((x) => x.name)).toEqual(['Cäsar', 'Zoo']);
    expect(s.unknown.map((x) => x.name)).toEqual(['Berg']);
    expect(splitResults(rows, false, 'distance').matches.map((x) => x.name)).toEqual(['Cäsar', 'Ader', 'Berg', 'Zoo']);
    expect(splitResults(rows, false, 'name').matches.map((x) => x.name)).toEqual(['Ader', 'Berg', 'Cäsar', 'Zoo']);
    expect(splitResults(rows, false, 'distance').unknown).toEqual([]);
  });
});

describe('Formate und Links', () => {
  it('Entfernung „2,3 km“', () => {
    expect(formatKm(2.3, 'de-DE')).toBe('2,3 km');
    expect(formatKm(12, 'de-DE')).toBe('12,0 km');
    expect(formatKm(0.04, 'de-DE')).toBe('< 0,1 km');
    expect(formatKm(2.3, 'en-GB')).toBe('2.3 km');
  });
  it('Adresse', () => {
    expect(formatAddress({ street: 'Hauptstraße', housenumber: '1', postcode: '65428', city: 'Rüsselsheim' })).toBe('Hauptstraße 1, 65428 Rüsselsheim');
    expect(formatAddress({ street: null, housenumber: null, postcode: '65428', city: null })).toBe('65428');
    expect(formatAddress({ street: null, housenumber: null, postcode: null, city: null })).toBe('');
  });
  it('Routen und „Fehler melden“', () => {
    const r = routeLinks(49.9912345678, 8.4123456789, 'Praxis & Co');
    expect(r.osm).toBe('https://www.openstreetmap.org/directions?to=49.991235,8.412346');
    expect(r.google).toBe('https://www.google.com/maps/dir/?api=1&destination=49.991235,8.412346');
    expect(r.apple).toBe('maps://?daddr=49.991235,8.412346&q=Praxis%20%26%20Co');
    expect(osmNoteLink(49.99, 8.41)).toBe('https://www.openstreetmap.org/note/new#map=18/49.99/8.41');
    expect(isAppleDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isAppleDevice('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe(false);
  });
  it('Webseite: Schema ergänzen, nur http(s)', () => {
    expect(safeWebsite('tierarzt-muster.de')).toBe('https://tierarzt-muster.de/');
    expect(safeWebsite('http://example.org/a')).toBe('http://example.org/a');
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(safeWebsite('')).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });
});

describe('Jetzt geöffnet', () => {
  // Freitag, 16.10.2026, 10:00 Uhr Ortszeit (Tests laufen mit TZ=Europe/Berlin)
  const fri10 = new Date(2026, 9, 16, 10, 0);
  const fri13 = new Date(2026, 9, 16, 13, 0);
  it('geöffnet, geschlossen, Zeiten heute', () => {
    const v = 'Mo-Fr 08:00-12:00,15:00-18:00; Sa 09:00-12:00';
    expect(openingInfo(Oh, v, fri10)).toMatchObject({ state: 'open', today: [['08:00', '12:00'], ['15:00', '18:00']] });
    expect(openingInfo(Oh, v, fri13).state).toBe('closed');
    expect(openingInfo(Oh, '24/7', fri13)).toMatchObject({ state: 'open', today: [['00:00', '24:00']], change: null });
    expect(openingInfo(Oh, 'Sa 09:00-12:00', fri10)).toMatchObject({ state: 'closed', today: [] });
  });
  it('ohne oder mit unlesbaren Zeiten: unbekannt', () => {
    const unknown = { state: 'unknown', today: null, change: null, comment: null };
    expect(openingInfo(Oh, null, fri10)).toEqual(unknown);
    expect(openingInfo(Oh, '', fri10)).toEqual(unknown);
    expect(openingInfo(Oh, 'Mo-Zz 99:00-ab', fri10)).toEqual(unknown); // ungültig: kein Fehler
    expect(openingInfo(Oh, 'nach Vereinbarung', fri10).state).toBe('unknown');
    expect(openingInfo(Oh, '"nach Vereinbarung"', fri10).state).toBe('unknown');
    expect(openingInfo(Oh, 'Mo-Fr 08:00-18:00; PH off', fri10).state).toBe('open');
  });
  it('Filter: geschlossene weg, unbekannte bleiben (getrennt)', () => {
    const rows = [{ id: 'a', oh: 'Mo-Fr 08:00-12:00' }, { id: 'b', oh: 'Sa 09:00-12:00' }, { id: 'c', oh: null }];
    const r = applyOpenNow(rows, (x) => openingInfo(Oh, x.oh, fri10), true);
    expect(r.shown.map((x) => x.id)).toEqual(['a']);
    expect(r.unknownTimes.map((x) => x.id)).toEqual(['c']);
    expect(applyOpenNow(rows, (x) => openingInfo(Oh, x.oh, fri10), false).shown).toHaveLength(3);
  });
});

describe('Katalog', () => {
  it('jede Kategorie vollständig und eindeutig', () => {
    expect(Object.keys(SPECIES_TEXT).sort()).toEqual([...PRACTICE_SPECIES].sort());
    expect(Object.keys(SERVICE_TEXT).sort()).toEqual([...PRACTICE_SERVICES].sort());
    expect(Object.keys(TITLE_TEXT).sort()).toEqual([...PRACTICE_TITLES].sort());
    expect(PRACTICE_SERVICES).toHaveLength(10);
    expect(PRACTICE_TITLES).toHaveLength(5);
    expect(PRACTICE_SPECIES).toHaveLength(7);
  });
  it('alle Schlüssel in allen Sprachen übersetzt', () => {
    for (const { code } of LANGUAGES) for (const k of CATALOG_KEYS) expect(DICTIONARIES[code][k], `${code}.${k}`).toBeTruthy();
    expect(translate('de', SERVICE_TEXT.hibernation)).toBe('Überwinterung (Winterstarre-Betreuung)');
    expect(translate('de', TITLE_TEXT.reptiles)).toBe('Fachtierarzt für Reptilien');
  });
});
