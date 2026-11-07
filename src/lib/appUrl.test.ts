import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_BASE, appUrl } from './appUrl';

const ORIGIN = 'https://petconnect24.com';

describe('appUrl', () => {
  it('Die App liegt unter /app', () => {
    expect(APP_BASE).toBe('/app');
  });

  it('Start der App: .../app/ (passt zum Supabase-Eintrag /app/**)', () => {
    expect(appUrl('/', ORIGIN)).toBe(`${ORIGIN}/app/`);
    expect(appUrl('', ORIGIN)).toBe(`${ORIGIN}/app/`);
  });

  it('Passwort-Reset-Ziel', () => {
    expect(appUrl('/passwort-neu', ORIGIN)).toBe(`${ORIGIN}/app/passwort-neu`);
    expect(appUrl('passwort-neu', ORIGIN)).toBe(`${ORIGIN}/app/passwort-neu`);
  });

  it('APP_BASE ist ein Pfad ohne Schrägstrich am Ende', () => {
    const base: string = APP_BASE;
    expect(base === '' || /^\/[a-z0-9-]+$/.test(base)).toBe(true);
  });

  it('APP_BASE stimmt mit dem Service Worker überein', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const m = /^const APP_BASE = '([^']*)';/m.exec(sw);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(APP_BASE);
  });

  it('Router-Basis, Vite-Ausgabe und Manifest passen zusammen', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8')) as {
      start_url: string;
      scope: string;
      shortcuts: { url: string }[];
    };
    expect(manifest.start_url).toBe(`${APP_BASE}/`);
    expect(manifest.scope).toBe(`${APP_BASE}/`);
    for (const s of manifest.shortcuts) expect(s.url.startsWith(`${APP_BASE}/`)).toBe(true);
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(vite).toContain(`assetsDir: '${APP_BASE.slice(1)}/assets'`);
  });
});
