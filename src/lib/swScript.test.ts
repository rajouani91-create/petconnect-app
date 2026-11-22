// Prüft public/sw.js ohne Browser: das Skript läuft in einer kleinen Nachbildung von „self“.
// Jeder Test läuft zweimal: mit APP_BASE '' (heute) und mit '/app' (nach dem Umzug).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://petconnect24.com';
const MED = '0b9a5e1c-3d2f-4a6b-8c7d-1e2f3a4b5c6d';
const ROUTINE = '1c0b6f2d-4e3a-4b7c-9d8e-2f3a4b5c6d7e';

type Listener = (event: Record<string, unknown>) => void;

function load(base: string) {
  const source = SOURCE.replace(/^const APP_BASE = '[^']*';/m, `const APP_BASE = '${base}';`);
  const listeners: Record<string, Listener> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const windows: { url: string; navigate: (u: string) => unknown; focus: () => unknown }[] = [];
  const self = {
    location: { origin: ORIGIN },
    navigator: { language: 'de-DE' },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => Promise.resolve(),
  };
  // Speicher und Netz nachgebildet: nichts davon trifft eine echte Adresse
  const store = { match: () => Promise.resolve(undefined), put: () => Promise.resolve(), addAll: () => Promise.resolve() };
  const caches = { open: () => Promise.resolve(store), match: () => Promise.resolve(undefined), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
  const fetch = () => Promise.resolve(new Response('', { status: 200 }));
  const ctx = vm.createContext({ self, caches, fetch, URL, URLSearchParams, Intl, Response, console });
  vm.runInContext(source, ctx);
  const get = <T>(expr: string) => vm.runInContext(expr, ctx) as T;
  const fire = (type: string, event: Record<string, unknown>) => {
    const fn = listeners[type];
    if (!fn) throw new Error(`Kein Listener für ${type}`);
    fn(event);
  };
  const firstShown = () => {
    const entry = shown[0];
    if (!entry) throw new Error('Keine Benachrichtigung angezeigt');
    return entry;
  };
  return { fire, firstShown, opened, windows, get };
}

async function click(sw: ReturnType<typeof load>, data: unknown, action = '') {
  let pending: Promise<unknown> = Promise.resolve();
  sw.fire('notificationclick', {
    notification: { close: () => undefined, data },
    action,
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
}

function navigate(sw: ReturnType<typeof load>, path: string, mode = 'navigate') {
  const respondWith = vi.fn<(p: unknown) => void>();
  sw.fire('fetch', { request: { method: 'GET', url: ORIGIN + path, mode }, respondWith });
  return respondWith;
}

for (const base of ['', '/app']) {
  describe(`sw.js mit APP_BASE '${base}'`, () => {
    const home = `${base}/`;

    it('Startseite, Shell und Asset-Pfad folgen APP_BASE', () => {
      const sw = load(base);
      expect(sw.get('APP_HOME')).toBe(home);
      expect(sw.get('SHELL_URL')).toBe(`${base}/index.html`);
      expect(sw.get('ASSET_PREFIX')).toBe(`${base}/assets/`);
      expect(sw.get('TODAY_URL')).toBe(home);
    });

    it('Push mit Medikament: Knopf „Gegeben“ öffnet die Startseite der App mit Bestätigung', () => {
      const sw = load(base);
      sw.fire('push', {
        data: { json: () => ({ title: 'Medikament', body: 'x', url: '/erinnerungen', tag: `medication-${MED}-2026-01-15T08:00:00.000Z` }) },
        waitUntil: () => undefined,
      });
      const options = sw.firstShown().options as { data: { url: string; actionUrl: string }; actions: { action: string }[] };
      expect(options.data.actionUrl).toBe(`${home}?gegeben=${MED}&zeit=09:00`);
      expect(options.data.url).toBe(`${base}/erinnerungen`);
      expect(options.actions.map((a) => a.action)).toEqual(['give']);
    });

    it('Push mit Alltagspunkt: Knopf „Erledigt“', () => {
      const sw = load(base);
      sw.fire('push', {
        data: { json: () => ({ title: 'Alltag', tag: `routine-${ROUTINE}-2026-01-15T08:00:00.000Z` }) },
        waitUntil: () => undefined,
      });
      const options = sw.firstShown().options as { data: { url: string; actionUrl: string } };
      expect(options.data.actionUrl).toBe(`${home}?erledigt=${ROUTINE}`);
      expect(options.data.url).toBe(home);
    });

    it('Push mit Ziel: Antippen öffnet genau dieses Ziel (z. B. die Rechnung)', async () => {
      const sw = load(base);
      sw.fire('push', {
        data: { json: () => ({ title: 'Neue Rechnung', body: 'x', url: '/mehr/rechnungen/abc?x=1#k', tag: 'invoice-1-2' }) },
        waitUntil: () => undefined,
      });
      const options = sw.firstShown().options as { data: unknown; actions?: unknown };
      expect(options.actions).toBeUndefined();
      await click(sw, options.data);
      expect(sw.opened).toEqual([`${ORIGIN}${base}/mehr/rechnungen/abc?x=1#k`]);
    });

    it('Push mit Medikament: Antippen ohne Knopf öffnet das Ziel, Knopf die Bestätigung', async () => {
      const sw = load(base);
      sw.fire('push', {
        data: { json: () => ({ title: 'Medikament', url: '/erinnerungen', tag: `medication-${MED}-2026-01-15T08:00:00.000Z` }) },
        waitUntil: () => undefined,
      });
      const data = sw.firstShown().options.data;
      await click(sw, data);
      await click(sw, data, 'give');
      expect(sw.opened).toEqual([`${ORIGIN}${base}/erinnerungen`, `${ORIGIN}${home}?gegeben=${MED}&zeit=09:00`]);
    });

    it('Ziel auf fremder Origin wird verworfen', () => {
      const sw = load(base);
      sw.fire('push', { data: { json: () => ({ title: 'x', url: 'https://evil.example/mehr' }) }, waitUntil: () => undefined });
      expect((sw.firstShown().options as { data: { url: string } }).data.url).toBe(home);
    });

    it('Push ohne lesbare Nachricht: neutrale Meldung, Ziel = Startseite der App', () => {
      const sw = load(base);
      sw.fire('push', { data: null, waitUntil: () => undefined });
      expect(sw.firstShown().title).toContain('PetConnect');
      expect((sw.firstShown().options as { data: { url: string } }).data.url).toBe(home);
    });

    it('safeUrl: fremde Origin und Unsinn führen zur Startseite der App', () => {
      const sw = load(base);
      const safe = (u: unknown) => sw.get<(x: unknown) => string>('safeUrl')(u);
      expect(safe('https://evil.example/x')).toBe(home);
      expect(safe(undefined)).toBe(home);
      expect(safe(42)).toBe(home);
    });

    it('safeUrl: alte Adresse „/?gegeben=…“ aus bereits angezeigten Benachrichtigungen bleibt nutzbar', () => {
      const sw = load(base);
      const safe = sw.get<(x: unknown) => string>('safeUrl');
      expect(safe(`/?gegeben=${MED}&zeit=09:00`)).toBe(`${home}?gegeben=${MED}&zeit=09:00`);
      expect(safe(`/?erledigt=${ROUTINE}`)).toBe(`${home}?erledigt=${ROUTINE}`);
      expect(safe('/')).toBe(home);
      expect(safe('/termine?termin=1')).toBe(`${base}/termine?termin=1`);
      expect(safe(`${base}/termine`)).toBe(`${base}/termine`);
    });

    it('Klick auf die Benachrichtigung öffnet ein Fenster in der App (Aktion mit alter Adresse)', async () => {
      const sw = load(base);
      await click(sw, { url: `/?erledigt=${ROUTINE}` }, 'done');
      expect(sw.opened).toEqual([`${ORIGIN}${home}?erledigt=${ROUTINE}`]);
    });

    it('Klick ohne Aktion führt zur Startseite der App', async () => {
      const sw = load(base);
      await click(sw, { url: `/?erledigt=${ROUTINE}` });
      expect(sw.opened).toEqual([`${ORIGIN}${home}`]);
    });

    it('Vorhandenes App-Fenster wird wiederverwendet', async () => {
      const sw = load(base);
      const appWin = { url: `${ORIGIN}${base}/tiere`, navigate: vi.fn<(u: string) => Promise<undefined>>(() => Promise.resolve(undefined)), focus: vi.fn<() => Promise<void>>(() => Promise.resolve()) };
      sw.windows.push(appWin);
      await click(sw, { url: home }, 'give');
      expect(appWin.navigate).toHaveBeenCalledWith(`${ORIGIN}${home}`);
      expect(sw.opened).toEqual([]);
    });

    it('Seiten der App werden bearbeitet (Netz zuerst, offline App-Shell)', () => {
      const sw = load(base);
      expect(navigate(sw, `${base}/tiere`)).toHaveBeenCalledTimes(1);
      expect(navigate(sw, home)).toHaveBeenCalledTimes(1);
    });

    it('Der Worker selbst und fremde Origins bleiben unberührt', () => {
      const sw = load(base);
      expect(navigate(sw, '/sw.js')).not.toHaveBeenCalled();
      const respondWith = vi.fn<(p: unknown) => void>();
      sw.fire('fetch', { request: { method: 'GET', url: 'https://x.supabase.co/rest/v1/pets', mode: 'cors' }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
      const post = vi.fn<(p: unknown) => void>();
      sw.fire('fetch', { request: { method: 'POST', url: `${ORIGIN}${home}`, mode: 'cors' }, respondWith: post });
      expect(post).not.toHaveBeenCalled();
    });

    it('Assets und Icons werden zwischengespeichert', () => {
      const sw = load(base);
      expect(navigate(sw, `${base}/assets/index-abc.js`, 'no-cors')).toHaveBeenCalledTimes(1);
      expect(navigate(sw, '/icons/icon-192.png', 'no-cors')).toHaveBeenCalledTimes(1);
    });
  });
}

describe('sw.js mit APP_BASE /app: Seiten außerhalb der App', () => {
  it('Landing, Rechtsseiten und Sitter-Links werden nicht angefasst', () => {
    const sw = load('/app');
    const handled = ['/', '/en/', '/impressum', '/datenschutz', '/konto-loeschen', '/betreuung/abc', '/.well-known/assetlinks.json'].filter(
      (p) => navigate(sw, p).mock.calls.length > 0,
    );
    expect(handled).toEqual([]);
  });

  it('Bilder der Landing werden nicht zwischengespeichert', () => {
    const sw = load('/app');
    expect(navigate(sw, '/landing/hero.png', 'no-cors')).not.toHaveBeenCalled();
  });

  it('/application ist nicht „in der App“', () => {
    const sw = load('/app');
    expect(sw.get<(p: string) => boolean>('inApp')('/application')).toBe(false);
    expect(sw.get<(p: string) => boolean>('inApp')('/app')).toBe(true);
    expect(sw.get<(p: string) => boolean>('inApp')('/app/login')).toBe(true);
  });

  it('Ein offenes Landing-Fenster wird bei Klick nicht übernommen', async () => {
    const sw = load('/app');
    const landing = { url: `${ORIGIN}/`, navigate: vi.fn<(u: string) => unknown>(), focus: vi.fn<() => unknown>() };
    sw.windows.push(landing);
    await click(sw, { url: '/app/' }, 'give');
    expect(landing.navigate).not.toHaveBeenCalled();
    expect(sw.opened).toEqual([`${ORIGIN}/app/`]);
  });
});
