// Einstellungen der öffentlichen Seiten (Landingpage, Rechtsseiten). Hier wird festgelegt, welche Sprachen es gibt.
//
// Neue Sprache hinzufügen (später bis zu 11):
//   1. site/content/<code>.json anlegen (gleiche Schlüssel wie de.json; der Typcheck meldet fehlende Schlüssel)
//   2. in site/content/index.ts importieren
//   3. unten in LANGUAGES eintragen (Pfad "/<code>/"), bei Arabisch dir: 'rtl' und passende Schrift in site/site.css ergänzen
// Alles andere (hreflang, Sitemap, Sprachumschalter, Kopfzeilen, Weiterleitungsregeln) entsteht daraus automatisch.

export const ORIGIN = 'https://petconnect24.com';
/** Adresse der App (muss zu APP_BASE in src/lib/appUrl.ts passen; site/site.test.ts prüft das) */
export const APP_PATH = '/app/';
export const CONTACT_EMAIL = 'info@petconnect24.com';
export const DELETE_EMAIL = 'support@petconnect24.com';

export interface SiteLanguage {
  code: string;
  /** Pfad der Landingpage in dieser Sprache, mit Schrägstrich am Anfang und Ende */
  path: string;
  /** Wert für hreflang und das lang-Attribut */
  hreflang: string;
  /** Open-Graph-Gebietsschema */
  locale: string;
  dir: 'ltr' | 'rtl';
  /** Eigenname der Sprache für den Umschalter */
  label: string;
}

export const LANGUAGES: SiteLanguage[] = [
  { code: 'de', path: '/', hreflang: 'de', locale: 'de_DE', dir: 'ltr', label: 'Deutsch' },
  { code: 'en', path: '/en/', hreflang: 'en', locale: 'en_GB', dir: 'ltr', label: 'English' },
];

/** Sprache für x-default und die Rechtsseiten */
export const DEFAULT_LANG = 'de';
