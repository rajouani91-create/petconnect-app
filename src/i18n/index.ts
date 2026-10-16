// Kleine eigene i18n-Lösung. Fehlende Schlüssel fallen auf Deutsch zurück und erzeugen eine Konsolen-Warnung.
import { de, type MessageKey, type Messages } from './de';
import { en } from './en';
import { fr } from './fr';
import { ar } from './ar';
import { nl } from './nl';
import { es } from './es';
import { ru } from './ru';
import { tr } from './tr';
import { sv } from './sv';
import { da } from './da';
import { no } from './no';
import { TIME_ZONE } from '../lib/time';

export type { MessageKey } from './de';

export const LANGUAGES = [
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'ar', name: 'العربية', locale: 'ar-u-nu-latn' },
  { code: 'nl', name: 'Nederlands', locale: 'nl-NL' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
  { code: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { code: 'sv', name: 'Svenska', locale: 'sv-SE' },
  { code: 'da', name: 'Dansk', locale: 'da-DK' },
  { code: 'no', name: 'Norsk', locale: 'nb-NO' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANG: Lang = 'de';

export const DICTIONARIES: Record<Lang, Messages> = { de, en, fr, ar, nl, es, ru, tr, sv, da, no };

export type Vars = Record<string, string | number>;

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGUAGES.some((l) => l.code === v);
}

export function localeOf(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)?.locale ?? 'de-DE';
}

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

type Warn = (message: string) => void;

/**
 * Übersetzt einen Schlüssel. Reihenfolge: gewählte Sprache → Deutsch → Schlüssel selbst.
 * `dicts` und `warn` sind für Tests austauschbar.
 */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Vars,
  dicts: Record<Lang, Messages> = DICTIONARIES,
  warn: Warn = (m) => console.warn(m),
): string {
  const own = dicts[lang][key];
  if (own !== undefined) return interpolate(own, vars);
  const fallback = dicts.de[key];
  warn(`[i18n] Fehlender Schlüssel "${key}" für Sprache "${lang}"${fallback === undefined ? '' : ', nutze Deutsch'}.`);
  return interpolate(fallback ?? key, vars);
}

let current: Lang = DEFAULT_LANG;

export function getLang(): Lang {
  return current;
}
export function setCurrentLang(lang: Lang): void {
  current = lang;
}

/** Übersetzt in der aktuell gewählten Sprache. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(current, key, vars);
}

/** Erste passende Sprache aus der Browser-Einstellung, sonst Deutsch. */
export function detectBrowserLang(preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] ?? '';
    const code = base === 'nb' || base === 'nn' ? 'no' : base;
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}

export function formatDate(date: Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: TIME_ZONE, ...opts }).format(date);
}

/** "07:30" → lokal formatierte Uhrzeit, z. B. "07:30" oder "7:30 AM". */
export function formatTime(hhmm: string, lang: Lang): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0));
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** ISO-Datum "YYYY-MM-DD" lokal formatiert, ohne Zeitzonenverschiebung. */
export function formatIsoDate(iso: string, lang: Lang): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, d ?? 1)),
  );
}

/** ISO-Datum "YYYY-MM-DD" kurz, im Deutschen TT.MM.JJJJ. */
export function formatIsoDateShort(iso: string, lang: Lang): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, d ?? 1)),
  );
}
