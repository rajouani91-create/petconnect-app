// Länder der Praxissuche. Die Schlüssel stehen so in der Datenbank (practices.country, geo_places.country).
import type { Lang, MessageKey } from '../i18n';

/** Alle Länder, für die der Code vorbereitet ist */
export const PRACTICE_COUNTRIES = ['DE', 'AT', 'CH', 'FR', 'NL', 'MA'] as const;
export type PracticeCountry = (typeof PRACTICE_COUNTRIES)[number];

/** Länder, die in der Auswahl erscheinen. Marokko folgt, sobald die Datenlage geprüft ist. */
export const ENABLED_COUNTRIES: readonly PracticeCountry[] = ['DE', 'AT', 'CH', 'FR', 'NL'];

export const DEFAULT_COUNTRY: PracticeCountry = 'DE';

export const COUNTRY_TEXT: Record<PracticeCountry, MessageKey> = {
  DE: 'psCountryDE',
  AT: 'psCountryAT',
  CH: 'psCountryCH',
  FR: 'psCountryFR',
  NL: 'psCountryNL',
  MA: 'psCountryMA',
};

export const isPracticeCountry = (v: unknown): v is PracticeCountry => typeof v === 'string' && (PRACTICE_COUNTRIES as readonly string[]).includes(v);

/** Land aus der Sprache der App vorschlagen (nur wenn es angeboten wird); sonst Deutschland */
export function countryForLang(lang: Lang): PracticeCountry {
  const guess: PracticeCountry = lang === 'fr' ? 'FR' : lang === 'nl' ? 'NL' : lang === 'ar' ? 'MA' : DEFAULT_COUNTRY;
  return ENABLED_COUNTRIES.includes(guess) ? guess : DEFAULT_COUNTRY;
}

/** Wie viele Ziffern hat die vollständige Postleitzahl im Land? (NL: vier Ziffern, danach optional zwei Buchstaben) */
export const POSTCODE_DIGITS: Record<PracticeCountry, 4 | 5> = { DE: 5, AT: 4, CH: 4, FR: 5, NL: 4, MA: 5 };

/** Eingabe als vollständige Postleitzahl erkannt? DE/FR/MA: 5 Ziffern; AT/CH: 4 Ziffern; NL: „3511“ oder „3511 AB“ → „3511“. */
export function fullPostcode(q: string, country: PracticeCountry): string | null {
  const s = q.trim();
  if (country === 'NL') {
    const m = /^(\d{4})(?:\s?[A-Za-z]{2})?$/.exec(s);
    return m ? m[1]! : null;
  }
  return (POSTCODE_DIGITS[country] === 4 ? /^\d{4}$/ : /^\d{5}$/).test(s) ? s : null;
}

/** Land für Feiertage („PH“) in den Öffnungszeiten; Kleinbuchstaben wie bei der Bibliothek */
export const holidayCountry = (c: PracticeCountry): string => c.toLowerCase();

/** Ungefähre Landesmitte, nur für die Bibliothek der Öffnungszeiten (Zeitzone, Feiertage) */
export const COUNTRY_CENTER: Record<PracticeCountry, { lat: number; lon: number }> = {
  DE: { lat: 51.16, lon: 10.45 },
  AT: { lat: 47.5, lon: 14.5 },
  CH: { lat: 46.8, lon: 8.2 },
  FR: { lat: 46.6, lon: 2.4 },
  NL: { lat: 52.2, lon: 5.3 },
  MA: { lat: 32.0, lon: -6.0 },
};
