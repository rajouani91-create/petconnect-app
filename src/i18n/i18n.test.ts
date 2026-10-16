import { describe, expect, it, vi } from 'vitest';
import { DICTIONARIES, LANGUAGES, detectBrowserLang, dirOf, interpolate, translate, type Lang } from './index';
import { de, type Messages } from './de';

describe('translate', () => {
  it('übersetzt in die gewählte Sprache mit Platzhaltern', () => {
    expect(translate('de', 'gpIn', { m: 25 })).toBe('in 25 Min.');
    expect(translate('en', 'helloName', { name: 'Ahmed' })).toBe('Hello, Ahmed');
  });

  it('fehlender Schlüssel: fällt auf Deutsch zurück und warnt in der Konsole', () => {
    const dicts = { ...DICTIONARIES, fr: { ...DICTIONARIES.fr, gpNow: undefined } as Messages };
    const warn = vi.fn<(message: string) => void>();
    expect(translate('fr', 'gpNow', undefined, dicts, warn)).toBe('Jetzt');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain('gpNow');
  });

  it('Standard-Warnung geht an console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dicts = { ...DICTIONARIES, nl: {} };
    expect(translate('nl', 'regDone', undefined, dicts)).toBe(de.regDone);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('auch Deutsch fehlt: Schlüssel selbst, ohne Absturz', () => {
    const warn = vi.fn<(message: string) => void>();
    const dicts = { ...DICTIONARIES, de: {}, en: {} } as Record<Lang, Messages>;
    expect(translate('en', 'gpNow', undefined, dicts, warn)).toBe('gpNow');
  });

  it('keine Warnung, wenn der Schlüssel vorhanden ist', () => {
    const warn = vi.fn<(message: string) => void>();
    translate('ar', 'gpNow', undefined, DICTIONARIES, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('Wörterbücher', () => {
  it('alle 11 Sprachen sind vorhanden', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['de', 'en', 'fr', 'ar', 'nl', 'es', 'ru', 'tr', 'sv', 'da', 'no']);
  });

  it('jede Sprache enthält alle deutschen Schlüssel und dieselben Platzhalter', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const { code } of LANGUAGES) {
      const dict = DICTIONARIES[code];
      for (const key of Object.keys(de) as (keyof typeof de)[]) {
        const text = dict[key];
        expect(text, `${code}.${key}`).toBeTypeOf('string');
        expect(vars(text ?? ''), `${code}.${key}`).toEqual(vars(de[key]));
      }
    }
  });

  it('Deutsch in der Sie-Form (kein „du“/„dein“)', () => {
    for (const text of Object.values(de)) expect(text).not.toMatch(/\b(du|dein|deine|dich|dir)\b/i);
  });
});

describe('Hilfsfunktionen', () => {
  it('interpolate lässt unbekannte Platzhalter stehen', () => {
    expect(interpolate('{a} und {b}', { a: 1 })).toBe('1 und {b}');
  });
  it('Arabisch wird von rechts nach links gesetzt', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('de')).toBe('ltr');
  });
  it('Browsersprache erkennen, inkl. Norwegisch (nb/nn) und Rückfall auf Deutsch', () => {
    expect(detectBrowserLang(['fr-CH', 'de'])).toBe('fr');
    expect(detectBrowserLang(['nb-NO'])).toBe('no');
    expect(detectBrowserLang(['pt-BR', 'ja'])).toBe('de');
    expect(detectBrowserLang([])).toBe('de');
  });
});
