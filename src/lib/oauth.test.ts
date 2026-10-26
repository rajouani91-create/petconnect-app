import { describe, expect, it } from 'vitest';
import { shouldAdoptLang } from './oauth';

const now = Date.parse('2026-10-26T12:00:00Z');

describe('shouldAdoptLang', () => {
  it('übernimmt die Sprache bei einem frischen Konto', () => {
    expect(shouldAdoptLang('de', '2026-10-26T11:58:00Z', 'fr', now)).toBe(true);
  });
  it('ändert ein älteres Konto nicht', () => {
    expect(shouldAdoptLang('de', '2026-10-20T11:58:00Z', 'fr', now)).toBe(false);
  });
  it('tut nichts ohne gemerkte oder bei gleicher Sprache', () => {
    expect(shouldAdoptLang('de', '2026-10-26T11:58:00Z', null, now)).toBe(false);
    expect(shouldAdoptLang('fr', '2026-10-26T11:58:00Z', 'fr', now)).toBe(false);
  });
  it('kommt mit ungültigem Datum klar', () => {
    expect(shouldAdoptLang('de', 'kaputt', 'fr', now)).toBe(false);
  });
});
