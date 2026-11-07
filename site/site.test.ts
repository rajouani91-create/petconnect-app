import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { APP_BASE } from '../src/lib/appUrl';
import { APP_PATH, DEFAULT_LANG, LANGUAGES, ORIGIN } from './config';
import { CONTENT } from './content';
import { LEGAL_PATHS, generatedHeaders, generatedRedirects, render404, renderDeleteAccount, renderLanding, renderLegal, renderRobots, renderSitemap, sitemapPaths, type Assets } from './render';

const ASSETS: Assets = { css: '/site/site.test.css', script: '/site/forward.test.js', preload: ['/site/fonts/a.woff2'], img: { heute: '/site/img/heute.x.webp', erinnerungen: '/site/img/e.x.webp', tierakte: '/site/img/t.x.webp', assistent: '/site/img/a.x.webp' } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Alle Schlüsselpfade eines Objekts (Arrays: Länge und Elementform) */
function shape(v: unknown, prefix = ''): string[] {
  if (Array.isArray(v)) return [`${prefix}[]=${v.length}`, ...v.flatMap((x, i) => shape(x, `${prefix}[${i}]`))];
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => shape(x, `${prefix}.${k}`));
  return [prefix];
}

describe('Sprachen', () => {
  it('Jede Sprache hat Texte mit denselben Schlüsseln wie die Standardsprache', () => {
    const base = shape(CONTENT[DEFAULT_LANG]);
    const differing = LANGUAGES.filter((l) => JSON.stringify(shape(CONTENT[l.code])) !== JSON.stringify(base)).map((l) => l.code);
    expect(differing).toEqual([]);
  });

  it('Keine Sprache hat leere Texte (außer dem optionalen Rechtshinweis)', () => {
    const empty: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string' && v.trim() === '' && !path.endsWith('legalNote')) empty.push(path);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    };
    for (const l of LANGUAGES) walk(CONTENT[l.code], l.code);
    expect(empty).toEqual([]);
  });

  it('Pfade: eindeutig, mit Schrägstrichen, die Standardsprache liegt am Root', () => {
    expect(new Set(LANGUAGES.map((l) => l.path)).size).toBe(LANGUAGES.length);
    expect(LANGUAGES.every((l) => /^\/([a-z]{2}\/)?$/.test(l.path))).toBe(true);
    expect(LANGUAGES.find((l) => l.code === DEFAULT_LANG)?.path).toBe('/');
  });

  it('APP_PATH passt zu APP_BASE der App', () => {
    expect(APP_PATH).toBe(`${APP_BASE}/`);
  });
});

describe('Gestaltung und Aussagen der Landingpage', () => {
  for (const l of LANGUAGES) {
    const html = renderLanding(l.code, ASSETS);
    const c = CONTENT[l.code];

    it(`${l.code}: Galerie zeigt genau die vier echten App-Bilder, ohne Lazy-Loading und ohne Platzhalter`, () => {
      const items = c?.gallery.items ?? [];
      expect(items.map((g) => g.img).sort()).toEqual(['assistent', 'erinnerungen', 'heute', 'tierakte']);
      for (const src of Object.values(ASSETS.img)) expect(html).toContain(`src="${src}"`);
      expect(html).not.toContain('loading="lazy"');
      expect((html.match(/class="phone phone-sm"><img [^>]*>/g) ?? []).filter((t) => t.includes('decoding=')).length).toBe(0);
      expect(html).not.toMatch(/src=""/);
    });

    it(`${l.code}: Sprachumschalter zeigt alle Sprachen, die aktuelle ist markiert, die anderen führen zur richtigen Startseite`, () => {
      const current = LANGUAGES.filter((x) => x.code === l.code);
      const others = LANGUAGES.filter((x) => x.code !== l.code);
      for (const x of current) expect(html).toContain(`class="lang is-current" aria-current="true" lang="${x.hreflang}"`);
      for (const x of others) expect(html).toContain(`<a class="lang" href="${x.path}" hreflang="${x.hreflang}" lang="${x.hreflang}" aria-label="${x.label}">${x.code.toUpperCase()}</a>`);
      // Fußzeile: jede andere Sprache verlinkt, die aktuelle nicht
      for (const x of LANGUAGES.filter((y) => y.code !== l.code)) expect(html).toContain(`<li><a href="${x.path}" hreflang="${x.hreflang}"`);
    });

    it(`${l.code}: Marke überall PetConnect24, nie „PetConnect“ allein`, () => {
      const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      expect(visible.match(/PetConnect(?!24)/g)).toBeNull();
    });

    it(`${l.code}: KI-Abschnitt mit Hinweis auf fehlende Diagnose, Praxisabschnitt mit Kontakt und ehrlichem Stand`, () => {
      expect(html).toContain('id="ki"');
      expect(html).toContain('id="praxen"');
      expect(c?.ai.points.map((p) => p.text).join(' ')).toMatch(l.code === 'de' ? /keine Diagnosen/ : /does not diagnose/);
      expect(html).toMatch(/href="mailto:info@petconnect24\.com\?subject=[^"]+&amp;body=[^"]+"/);
      expect(c?.vets.status).toMatch(l.code === 'de' ? /noch nicht/ : /no separate access/);
    });

    it(`${l.code}: keine unbelegten Versprechen (Preise, „kostenlos“, Zertifizierungen, 100 %)`, () => {
      const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      expect(text).not.toMatch(/kostenlos|gratis|free of charge|\bfree\b|100 ?%|zertifiziert|certified|DSGVO-konform|GDPR[- ]compliant|Ende-zu-Ende|end-to-end|garantier|guarantee/i);
    });
  }
});

describe('Landingpage ohne JavaScript', () => {
  for (const l of LANGUAGES) {
    const html = renderLanding(l.code, ASSETS);

    it(`${l.code}: genau eine H1, lang, Canonical, Titel`, () => {
      expect(html.match(/<h1[ >]/g)?.length).toBe(1);
      expect(html).toContain(`<html lang="${l.hreflang}" dir="${l.dir}">`);
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${l.path}">`);
      expect(html).toMatch(/<title>[^<]{10,70}<\/title>/);
      expect(html).toMatch(/<meta name="description" content="[^"]{70,170}">/);
    });

    it(`${l.code}: hreflang für alle Sprachen und x-default, Open Graph, Twitter`, () => {
      for (const x of LANGUAGES) expect(html).toContain(`<link rel="alternate" hreflang="${x.hreflang}" href="${ORIGIN}${x.path}">`);
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`);
      for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:locale']) expect(html).toContain(`property="${k}"`);
      expect(html).toContain(`content="${ORIGIN}/og/og-${l.code}.png"`);
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
    });

    it(`${l.code}: alle Bilder haben alt-Text und Größe, nur eigene Dateien`, () => {
      const imgs = html.match(/<img [^>]*>/g) ?? [];
      expect(imgs.length).toBeGreaterThan(4);
      for (const i of imgs) {
        expect(i).toMatch(/ alt="/);
        expect(i).toMatch(/ width="\d+"/);
      }
      const body = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
      const external = (body.match(/(?:href|src)="(https?:\/\/[^"]+)"/g) ?? []).filter((x) => !x.includes(ORIGIN));
      expect(external).toEqual([]);
    });

    it(`${l.code}: Links zur App, Registrierung und Rechtsseiten`, () => {
      expect(html).toContain(`href="${APP_PATH}registrieren"`);
      expect(html).toContain(`href="${APP_PATH}login"`);
      for (const p of Object.values(LEGAL_PATHS)) expect(html).toContain(`href="${p}"`);
    });

    it(`${l.code}: strukturierte Daten sind gültiges JSON`, () => {
      const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
      const data = JSON.parse(m?.[1] ?? 'null') as { '@graph': { '@type': string }[] };
      expect(data['@graph'].map((x) => x['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']);
    });
  }
});

describe('Rechtsseiten, 404, Sitemap, robots', () => {
  it('Impressum und Datenschutz: Canonical am Root, indexierbar, Inhalt vorhanden', () => {
    const imp = renderLegal('imprint', 'Impressum', '<h2>Kontakt</h2>', ASSETS);
    expect(imp).toContain(`<link rel="canonical" href="${ORIGIN}/impressum">`);
    expect(imp).toContain('content="index,follow"');
    const priv = renderLegal('privacy', 'Datenschutzerklärung', '<p>x</p>', ASSETS);
    expect(priv).toContain(`href="${ORIGIN}/datenschutz"`);
  });

  it('Konto löschen: Anleitung, mailto, englischer Absatz, kein Formular', () => {
    const html = renderDeleteAccount(ASSETS);
    expect(html).toContain('mailto:support@petconnect24.com');
    expect(html).toContain('30 Tagen');
    expect(html).toContain('lang="en"');
    expect(html).not.toContain('<form');
  });

  it('404 ist nicht indexierbar', () => {
    expect(render404(ASSETS)).toContain('content="noindex"');
  });

  it('Sitemap enthält alle öffentlichen Seiten, aber nie die App oder Token-Links', () => {
    const xml = renderSitemap('2026-11-07');
    for (const p of sitemapPaths()) expect(xml).toContain(`<loc>${ORIGIN}${p}</loc>`);
    expect(xml).not.toContain('/app/');
    expect(xml).not.toContain('betreuung');
    expect(xml).not.toContain('einladung');
  });

  it('robots.txt verweist auf die Sitemap und sperrt nichts (noindex steht in den Kopfzeilen)', () => {
    const r = renderRobots();
    expect(r).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(r).not.toContain('Disallow: /');
  });

  it('Erzeugte Kopfzeilen: CSP ohne Fremdserver für alle Seiten, auch ohne/mit Schrägstrich', () => {
    const h = generatedHeaders();
    for (const p of ['/', '/en/', '/en', '/impressum', '/impressum/', '/datenschutz', '/konto-loeschen', '/404.html']) expect(h).toMatch(new RegExp(`^${p}\\n`, 'm'));
    expect(h).toContain("default-src 'none'");
    expect(h).toContain("frame-ancestors 'none'");
    expect(h).not.toMatch(/https?:\/\//);
  });

  it('Erzeugte Weiterleitungen liefern die statischen Seiten auch ohne Schrägstrich aus', () => {
    const r = generatedRedirects();
    expect(r).toMatch(/\/en\s+\/en\/index\.html\s+200/);
    expect(r).toMatch(/\/impressum\s+\/impressum\/index\.html\s+200/);
    expect(r).toMatch(/\/konto-loeschen\s+\/konto-loeschen\/index\.html\s+200/);
  });
});

describe('Netlify-Weiterleitungen (public/_redirects)', () => {
  const rules = read('../public/_redirects')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from = '', to = '', status = ''] = l.split(/\s+/);
      return { from, to, status: Number(status) };
    });

  it('Die App wird unter /app ausgeliefert', () => {
    expect(rules).toContainEqual({ from: '/app/*', to: '/app/index.html', status: 200 });
    expect(rules).toContainEqual({ from: '/app', to: '/app/', status: 301 });
  });

  it('Jede Route der App hat für ihre alte Root-Adresse eine Weiterleitung nach /app', () => {
    const app = read('../src/App.tsx');
    const routes = [...app.matchAll(/<Route\s+(?:index\s+)?path="([^"]+)"/g)].map((m) => m[1] ?? '').filter((p) => p && p !== '*');
    const publicAtRoot = new Set(['datenschutz', 'impressum', 'konto-loeschen']);
    const missing: string[] = [];
    for (const r of routes) {
      const seg = r.replace(/^\//, '').split('/');
      const first = seg[0] ?? '';
      if (publicAtRoot.has(first)) continue;
      const need = seg.length > 1 ? `/${first}/*` : `/${first}`;
      const rule = rules.find((x) => x.from === need);
      if (!rule || rule.status !== 302 && rule.status !== 301) missing.push(need);
    }
    expect(routes.length).toBeGreaterThan(20);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('Alle alten Adressen führen nach /app/…, Rechtsseiten bleiben am Root', () => {
    const legacy = rules.filter((r) => r.status === 301 || r.status === 302).filter((r) => r.from !== '/app');
    expect(legacy.length).toBeGreaterThan(10);
    for (const r of legacy) expect(r.to.startsWith('/app/')).toBe(true);
    for (const p of ['/impressum', '/datenschutz', '/konto-loeschen', '/.well-known/assetlinks.json']) expect(rules.find((r) => r.from === p)).toBeUndefined();
  });

  it('Betreuungs- und Einladungslinks behalten ihren Code', () => {
    expect(rules).toContainEqual({ from: '/betreuung/*', to: '/app/betreuung/:splat', status: 302 });
    expect(rules).toContainEqual({ from: '/einladung/*', to: '/app/einladung/:splat', status: 302 });
  });

  it('Es gibt keine Regel, die alles auf die App umbiegt (sonst würde auch die Landingpage überdeckt)', () => {
    expect(rules.find((r) => r.from === '/*')).toBeUndefined();
  });
});

describe('Weiterleitungs-Skript der Landingpage (site/forward.js)', () => {
  const source = read('./forward.js');

  function run(opts: { search?: string; hash?: string; storage?: Record<string, string>; standalone?: boolean; referrer?: string; throwing?: boolean }) {
    const replace = vi.fn<(u: string) => void>();
    const storage = opts.storage ?? {};
    const keys = Object.keys(storage);
    const localStorage = {
      get length(): number {
        if (opts.throwing) throw new Error('gesperrt');
        return keys.length;
      },
      key: (i: number) => keys[i] ?? null,
      getItem: (k: string) => storage[k] ?? null,
    };
    const window = {
      location: { search: opts.search ?? '', hash: opts.hash ?? '', replace },
      matchMedia: () => ({ matches: !!opts.standalone }),
      localStorage,
    };
    vm.runInNewContext(source, { window, document: { referrer: opts.referrer ?? '' }, JSON });
    return replace;
  }
  const session = { 'sb-abcdef-auth-token': JSON.stringify({ access_token: 'a', refresh_token: 'r', user: {} }) };
  const ID = '0b9a5e1c-3d2f-4a6b-8c7d-1e2f3a4b5c6d';

  it('Besucher ohne Sitzung sehen die Landingpage', () => {
    expect(run({})).not.toHaveBeenCalled();
    expect(run({ storage: { andere: '1', 'sb-x-auth-token': 'kaputt{' } })).not.toHaveBeenCalled();
  });

  it('Angemeldete Nutzer gehen in die App', () => {
    expect(run({ storage: session })).toHaveBeenCalledWith('/app/');
  });

  it('?keep=1 zeigt die Landingpage trotz Anmeldung', () => {
    expect(run({ storage: session, search: '?keep=1' })).not.toHaveBeenCalled();
  });

  it('Installierte App (Standalone) und Android-App (Referrer) gehen in die App', () => {
    expect(run({ standalone: true })).toHaveBeenCalledWith('/app/');
    expect(run({ referrer: 'android-app://com.petconnect24.app/' })).toHaveBeenCalledWith('/app/');
  });

  it('Alte Benachrichtigungs-Adressen behalten ihre Parameter', () => {
    expect(run({ search: `?gegeben=${ID}&zeit=09:00` })).toHaveBeenCalledWith(`/app/?gegeben=${ID}&zeit=09:00`);
    expect(run({ search: `?erledigt=${ID}` })).toHaveBeenCalledWith(`/app/?erledigt=${ID}`);
  });

  it('Rücksprung nach Anmeldung oder Passwort-Reset auf der Landingpage geht in die App (mit #-Teil)', () => {
    expect(run({ hash: '#access_token=x&refresh_token=y&type=recovery' })).toHaveBeenCalledWith('/app/#access_token=x&refresh_token=y&type=recovery');
    expect(run({ search: '?code=abc' })).toHaveBeenCalledWith('/app/?code=abc');
  });

  it('Gesperrter Speicher: kein Fehler, Landingpage bleibt', () => {
    expect(() => run({ throwing: true })).not.toThrow();
    expect(run({ throwing: true })).not.toHaveBeenCalled();
  });
});
