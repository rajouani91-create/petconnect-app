import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_BASE, appUrl } from './appUrl';

const ORIGIN = 'https://petconnect24.com';

describe('appUrl', () => {
  it('Start der App: bisheriges Verhalten (nur Origin) solange APP_BASE leer ist', () => {
    const expected = APP_BASE === '' ? ORIGIN : `${ORIGIN}${APP_BASE}/`;
    expect(appUrl('/', ORIGIN)).toBe(expected);
  });

  it('Passwort-Reset-Ziel', () => {
    expect(appUrl('/passwort-neu', ORIGIN)).toBe(`${ORIGIN}${APP_BASE}/passwort-neu`);
    expect(appUrl('passwort-neu', ORIGIN)).toBe(`${ORIGIN}${APP_BASE}/passwort-neu`);
  });

  it('leerer Pfad zählt als Start der App', () => {
    expect(appUrl('', ORIGIN)).toBe(appUrl('/', ORIGIN));
  });

  it('APP_BASE ist leer oder ein Pfad ohne Schrägstrich am Ende', () => {
    expect(APP_BASE === '' || /^\/[a-z0-9-]+$/.test(APP_BASE)).toBe(true);
  });

  it('APP_BASE stimmt mit dem Service Worker überein', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const m = /^const APP_BASE = '([^']*)';/m.exec(sw);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(APP_BASE);
  });
});
