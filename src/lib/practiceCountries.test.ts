import { describe, expect, it } from 'vitest';
import OpeningHours from 'opening_hours';
import { COUNTRY_TEXT, DEFAULT_COUNTRY, ENABLED_COUNTRIES, PRACTICE_COUNTRIES, countryForLang, fullPostcode, isPracticeCountry } from './practiceCountries';
import { EMPTY_FILTERS, filtersToQuery, queryToFilters, type PracticeFilters } from './practices';
import { openingInfo, type OhConstructor } from './openingHours';
import { DICTIONARIES, LANGUAGES, translate } from '../i18n';

const Oh = OpeningHours as unknown as OhConstructor;

describe('Länder der Praxissuche', () => {
  it('Standard ist Deutschland; Marokko ist vorbereitet, aber noch nicht wählbar', () => {
    expect(DEFAULT_COUNTRY).toBe('DE');
    expect(ENABLED_COUNTRIES).toEqual(['DE', 'AT', 'CH', 'FR', 'NL']);
    expect(PRACTICE_COUNTRIES).toContain('MA');
    expect(isPracticeCountry('FR') && isPracticeCountry('AT') && isPracticeCountry('CH') && !isPracticeCountry('XX') && !isPracticeCountry(null)).toBe(true);
  });
  it('Land aus der Sprache vorschlagen', () => {
    expect(countryForLang('fr')).toBe('FR');
    expect(countryForLang('nl')).toBe('NL');
    expect(countryForLang('de')).toBe('DE');
    expect(countryForLang('en')).toBe('DE');
    expect(countryForLang('ar')).toBe('DE'); // MA noch nicht angeboten
  });
  it('vollständige Postleitzahl je Land', () => {
    expect(fullPostcode('65428', 'DE')).toBe('65428');
    expect(fullPostcode('69003', 'FR')).toBe('69003');
    expect(fullPostcode('6542', 'DE')).toBeNull();
    expect(fullPostcode('1010', 'AT')).toBe('1010');
    expect(fullPostcode('8001', 'CH')).toBe('8001');
    expect(fullPostcode('80011', 'CH')).toBeNull();
    expect(fullPostcode('8001 AB', 'CH')).toBeNull();
    expect(fullPostcode('3511', 'NL')).toBe('3511');
    expect(fullPostcode('3511 AB', 'NL')).toBe('3511');
    expect(fullPostcode('3511ab', 'NL')).toBe('3511');
    expect(fullPostcode('35111', 'NL')).toBeNull();
    expect(fullPostcode('Utrecht', 'NL')).toBeNull();
  });
  it('jedes Land hat einen Text in allen Sprachen', () => {
    for (const l of LANGUAGES) for (const c of PRACTICE_COUNTRIES) expect(DICTIONARIES[l.code][COUNTRY_TEXT[c]]).toBeTruthy();
    expect(translate('nl', 'psCountryNL')).toBe('Nederland');
  });
});

describe('Land in der URL', () => {
  it('Deutschland steht nicht in der URL, andere Länder schon', () => {
    expect(filtersToQuery(EMPTY_FILTERS).toString()).toBe('');
    const nl: PracticeFilters = { ...EMPTY_FILTERS, country: 'NL', place: '3511' };
    expect(filtersToQuery(nl).toString()).toBe('land=NL&plz=3511');
    expect(queryToFilters(new URLSearchParams('land=NL&plz=3511'))).toEqual(nl);
  });
  it('unbekanntes Land → Deutschland', () => {
    expect(queryToFilters(new URLSearchParams('land=XX')).country).toBe('DE');
  });
});

describe('Öffnungszeiten je Land', () => {
  const noon = new Date(2026, 9, 27, 12, 0); // Dienstag
  it('„Mo–Fr 08:00–18:00“ funktioniert in jedem Land', () => {
    for (const c of PRACTICE_COUNTRIES) expect(openingInfo(Oh, 'Mo-Fr 08:00-18:00', noon, null, c).state).toBe('open');
  });
  it('Feiertag: in Frankreich zählt der 11. November, in Deutschland nicht', () => {
    const nov11 = new Date(2026, 10, 11, 12, 0); // Mittwoch, Waffenstillstand
    expect(openingInfo(Oh, 'Mo-Fr 08:00-18:00; PH off', nov11, '65428', 'DE').state).toBe('open');
    expect(openingInfo(Oh, 'Mo-Fr 08:00-18:00; PH off', nov11, null, 'FR').state).toBe('closed');
  });
});
