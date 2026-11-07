// Erzeugt das HTML der öffentlichen Seiten (Landingpage je Sprache, Impressum, Datenschutz, Konto löschen, 404),
// Sitemap und robots.txt. Reine Funktionen ohne Dateizugriff: scripts/build-site.mjs schreibt die Ergebnisse nach dist/.

import { APP_PATH, CONTACT_EMAIL, DEFAULT_LANG, DELETE_EMAIL, LANGUAGES, ORIGIN, type SiteLanguage } from './config';
import { CONTENT, type LandingContent } from './content';
import type { IconName } from './content/types';

export interface Assets {
  css: string;
  script: string;
  /** Schriften zum Vorladen */
  preload: string[];
  img: Record<string, string>;
}

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Content-Security-Policy der öffentlichen Seiten: nur eigene Dateien, keine Fremdserver */
export const PUBLIC_CSP =
  "default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const ICONS: Record<IconName, string> = {
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 11v5M9.5 13.5h5"/>',
  alert: '<path d="M12 3 2.5 19.5h19L12 3Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2A5 5 0 0 1 21 19.5"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16Z"/>',
};

const icon = (name: IconName): string =>
  `<svg class="ico" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const url = (path: string): string => `${ORIGIN}${path}`;

function langOf(code: string): SiteLanguage {
  const l = LANGUAGES.find((x) => x.code === code);
  if (!l) throw new Error(`Unbekannte Sprache: ${code}`);
  return l;
}

function contentOf(code: string): LandingContent {
  const c = CONTENT[code];
  if (!c) throw new Error(`Texte fehlen für Sprache: ${code}`);
  return c;
}

/** Pfad der Landingpage einer Sprache; Rechtsseiten gibt es nur einmal (Deutsch) */
export const LEGAL_PATHS = { imprint: '/impressum', privacy: '/datenschutz', deleteAccount: '/konto-loeschen' } as const;

function headCommon(opts: { assets: Assets; lang: SiteLanguage; title: string; description: string; canonical: string; robots?: string; extra?: string }): string {
  const { assets, lang, title, description, canonical, robots, extra } = opts;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#1f5c4d" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121a17" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
${assets.preload.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')}
<link rel="stylesheet" href="${assets.css}">
${extra ?? ''}<meta property="og:site_name" content="PetConnect24">
<meta property="og:locale" content="${lang.locale}">`;
}

/** Hinweis an die Seite: wer angemeldet ist oder aus der App kommt, geht direkt in die App (site/forward.js) */
const forwardScript = (assets: Assets): string => `<script src="${assets.script}"></script>`;

function header(c: LandingContent, lang: SiteLanguage, mode: 'landing' | 'plain'): string {
  const home = lang.path;
  // Beide Sprachen sichtbar: die aktuelle markiert, die andere als Link auf die Startseite dieser Sprache
  const switcher = LANGUAGES.map((l) =>
    l.code === lang.code
      ? `<span class="lang is-current" aria-current="true" lang="${l.hreflang}"><span class="sr">${esc(l.label)}</span><span aria-hidden="true">${l.code.toUpperCase()}</span></span>`
      : `<a class="lang" href="${l.path}" hreflang="${l.hreflang}" lang="${l.hreflang}" aria-label="${esc(l.label)}">${l.code.toUpperCase()}</a>`,
  ).join('');
  const links =
    mode === 'landing'
      ? `<nav class="nav" aria-label="${esc(c.nav.features)}"><a href="#funktionen">${esc(c.nav.features)}</a><a href="#ki">${esc(c.nav.ai)}</a><a href="#praxen">${esc(c.nav.vets)}</a><a href="#faq">${esc(c.nav.faq)}</a></nav>`
      : '';
  return `<header class="top${mode === 'landing' ? ' top--landing' : ''}"><div class="wrap top-in">
<a class="brand" href="${home}" aria-label="${esc(c.nav.home)}"><img src="/icon.svg" width="32" height="32" alt=""><span>PetConnect24</span></a>
${links}
<div class="top-right">
<span class="langs" role="group" aria-label="${esc(c.nav.language)}">${switcher}</span>
<a class="btn btn-ghost" href="${APP_PATH}login">${esc(c.nav.login)}</a>
</div></div></header>`;
}

function footer(c: LandingContent, lang: SiteLanguage): string {
  const note = c.footer.legalNote ? `<p class="muted small">${esc(c.footer.legalNote)}</p>` : '';
  return `<footer class="foot"><div class="wrap">
<p class="foot-brand"><strong>PetConnect24</strong><br><span class="muted">${esc(c.footer.tagline)}</span></p>
<ul class="foot-links">
<li><a href="${LEGAL_PATHS.imprint}">${esc(c.footer.imprint)}</a></li>
<li><a href="${LEGAL_PATHS.privacy}">${esc(c.footer.privacy)}</a></li>
<li><a href="${LEGAL_PATHS.deleteAccount}">${esc(c.footer.deleteAccount)}</a></li>
<li><a href="mailto:${CONTACT_EMAIL}">${esc(c.footer.contact)}</a></li>
${LANGUAGES.map((l) => (l.code === lang.code ? `<li><span class="muted" lang="${l.hreflang}" aria-current="true">${esc(l.label)}</span></li>` : `<li><a href="${l.path}" hreflang="${l.hreflang}" lang="${l.hreflang}">${esc(l.label)}</a></li>`)).join('\n')}
</ul>
${note}
<p class="muted small">${esc(c.footer.disclaimer)}</p>
</div></footer>`;
}

export function landingPath(code: string): string {
  return langOf(code).path;
}

export function renderLanding(code: string, assets: Assets): string {
  const lang = langOf(code);
  const c = contentOf(code);
  const canonical = url(lang.path);
  const alternates = [
    ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path)}">`),
    `<link rel="alternate" hreflang="x-default" href="${url(langOf(DEFAULT_LANG).path)}">`,
  ].join('\n');
  const ogImage = url(`/og/og-${code}.png`);
  const social = `<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(c.meta.ogAlt)}">
${LANGUAGES.filter((l) => l.code !== code)
  .map((l) => `<meta property="og:locale:alternate" content="${l.locale}">`)
  .join('\n')}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.meta.title)}">
<meta name="twitter:description" content="${esc(c.meta.description)}">
<meta name="twitter:image" content="${ogImage}">
`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'PetConnect24',
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/icons/icon-512.png`,
        email: CONTACT_EMAIL,
      },
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        url: `${ORIGIN}/`,
        name: 'PetConnect24',
        publisher: { '@id': `${ORIGIN}/#organization` },
        inLanguage: LANGUAGES.map((l) => l.hreflang),
      },
      {
        '@type': 'SoftwareApplication',
        name: 'PetConnect24',
        url: canonical,
        description: c.meta.appDescription,
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Web',
        inLanguage: lang.hreflang,
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
      {
        '@type': 'FAQPage',
        mainEntity: c.faq.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };
  const jsonldTag = `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`;
  const img = (key: string) => assets.img[key] ?? '';
  const features = c.features.items
    .map((f) => `<li class="card feature">${icon(f.icon)}<h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></li>`)
    .join('\n');
  const steps = c.how.steps.map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('\n');
  const gallery = c.gallery.items
    .map(
      (g) =>
        // Bewusst ohne loading="lazy" und ohne decoding="async": Die Bilder sind klein (je unter 60 KB) und sollen nie als leerer Rahmen erscheinen
        `<li><figure><div class="phone phone-sm"><img src="${img(g.img)}" width="540" height="1200" alt="${esc(g.alt)}"></div><figcaption>${esc(g.caption)}</figcaption></figure></li>`,
    )
    .join('\n');
  const trust = c.trust.items.map((t) => `<li><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></li>`).join('\n');
  const aiPoints = c.ai.points.map((p) => `<li><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('\n');
  const vetBenefits = c.vets.benefits.map((b) => `<li><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></li>`).join('\n');
  const faq = c.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n');
  const mailVets = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(c.vets.mailSubject)}&body=${encodeURIComponent(c.vets.mailBody)}`;

  return `<!doctype html>
<html lang="${lang.hreflang}" dir="${lang.dir}">
<head>
${headCommon({ assets, lang, title: c.meta.title, description: c.meta.description, canonical, extra: `${alternates}\n${social}` })}
${forwardScript(assets)}
${jsonldTag}
</head>
<body>
<a class="skip" href="#inhalt">${esc(c.skip)}</a>
${header(c, lang, 'landing')}
<main id="inhalt">
<section class="hero"><div class="wrap hero-in">
<div class="hero-text">
<p class="eyebrow">${esc(c.hero.eyebrow)}</p>
<h1>${esc(c.hero.title)}</h1>
<p class="lead">${esc(c.hero.sub)}</p>
<p class="cta-row"><a class="btn btn-primary" href="${APP_PATH}registrieren">${esc(c.hero.cta)}</a><a class="btn btn-ghost" href="${APP_PATH}login">${esc(c.hero.ctaSecondary)}</a></p>
<p class="muted small">${esc(c.hero.note)}</p>
</div>
<div class="hero-art"><div class="phone"><img src="${img('heute')}" width="540" height="1200" fetchpriority="high" decoding="async" alt="${esc(c.hero.imageAlt)}"></div></div>
</div></section>

<section id="funktionen" class="section"><div class="wrap">
<h2>${esc(c.features.title)}</h2>
<p class="lead narrow">${esc(c.features.intro)}</p>
<ul class="grid">
${features}
</ul>
</div></section>

<section class="section section-alt"><div class="wrap">
<h2>${esc(c.gallery.title)}</h2>
<ul class="shots">
${gallery}
</ul>
<p class="muted small">${esc(c.gallery.note)}</p>
</div></section>

<section id="ki" class="section"><div class="wrap ai">
<div class="ai-intro">
<p class="eyebrow">${esc(c.ai.eyebrow)}</p>
<h2>${esc(c.ai.title)}</h2>
<p class="lead">${esc(c.ai.text)}</p>
<p class="callout">${esc(c.ai.note)}</p>
</div>
<ul class="ai-points">
${aiPoints}
</ul>
</div></section>

<section id="ablauf" class="section section-alt"><div class="wrap">
<h2>${esc(c.how.title)}</h2>
<ol class="steps">
${steps}
</ol>
</div></section>

<section id="praxen" class="section"><div class="wrap vets">
<div class="vets-intro">
<p class="eyebrow">${esc(c.vets.eyebrow)}</p>
<h2>${esc(c.vets.title)}</h2>
<p class="lead">${esc(c.vets.text)}</p>
<div class="vets-cta"><a class="btn btn-primary btn-lg" href="${esc(mailVets)}">${esc(c.vets.cta)}</a><p class="vets-cta-mail"><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p class="muted small">${esc(c.vets.ctaNote)}</p></div>
</div>
<div class="vets-body">
<ul class="vets-benefits">
${vetBenefits}
</ul>
<p class="callout">${esc(c.vets.status)}</p>
</div>
</div></section>

<section class="section trust"><div class="wrap">
<h2>${esc(c.trust.title)}</h2>
<ul class="trust-grid">
${trust}
</ul>
<p class="trust-note">${esc(c.trust.note)}</p>
<p class="trust-links"><a href="${LEGAL_PATHS.privacy}">${esc(c.trust.link)}</a><a href="${LEGAL_PATHS.deleteAccount}">${esc(c.trust.deleteLink)}</a></p>
</div></section>

<section id="faq" class="section section-alt"><div class="wrap narrow-col">
<h2>${esc(c.faq.title)}</h2>
${faq}
</div></section>

<section class="section final"><div class="wrap">
<h2>${esc(c.final.title)}</h2>
<p class="lead">${esc(c.final.text)}</p>
<p class="cta-row center"><a class="btn btn-primary" href="${APP_PATH}registrieren">${esc(c.final.cta)}</a></p>
</div></section>
</main>
${footer(c, lang)}
</body>
</html>
`;
}

function plainPage(opts: { assets: Assets; title: string; description: string; path: string; robots: string; body: string; withForward?: boolean }): string {
  const lang = langOf(DEFAULT_LANG);
  const c = contentOf(DEFAULT_LANG);
  return `<!doctype html>
<html lang="de" dir="ltr">
<head>
${headCommon({ assets: opts.assets, lang, title: opts.title, description: opts.description, canonical: url(opts.path), robots: opts.robots })}
</head>
<body>
<a class="skip" href="#inhalt">${esc(c.skip)}</a>
${header(c, lang, 'plain')}
<main id="inhalt" class="wrap doc">
${opts.body}
</main>
${footer(c, lang)}
</body>
</html>
`;
}

export function renderLegal(kind: 'imprint' | 'privacy', title: string, bodyHtml: string, assets: Assets): string {
  const description = kind === 'imprint' ? 'Impressum von PetConnect24: Angaben gemäß § 5 DDG und Kontakt.' : 'Datenschutzerklärung von PetConnect24: welche Daten verarbeitet werden, wo sie liegen und welche Rechte Sie haben.';
  return plainPage({
    assets,
    title: `${title} – PetConnect24`,
    description,
    path: LEGAL_PATHS[kind],
    robots: 'index,follow',
    body: `<article class="legal" lang="de"><h1>${esc(title)}</h1>\n${bodyHtml}</article>`,
  });
}

export function renderDeleteAccount(assets: Assets): string {
  const subject = 'Kontolöschung / Account Deletion Request – PetConnect24';
  const body =
    'Hallo PetConnect24-Team,\n\nIch bitte um die Löschung meines Kontos und aller damit verbundenen Daten.\n\nE-Mail-Adresse meines Kontos: \n\nBitte bestätigen Sie die Löschung.\n\nMit freundlichen Grüßen';
  const mailto = `mailto:${DELETE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return plainPage({
    assets,
    title: 'Konto löschen – PetConnect24',
    description: 'So löschen Sie Ihr PetConnect24-Konto und alle damit verbundenen Daten. Delete your PetConnect24 account.',
    path: LEGAL_PATHS.deleteAccount,
    robots: 'index,follow',
    body: `<article class="legal" lang="de">
<h1>Konto löschen</h1>
<p class="muted">Delete account</p>
<h2>So geht es</h2>
<ol>
<li>In der App: <strong>Mehr → Konto → Konto löschen</strong>.</li>
<li>Oder per E-Mail: Senden Sie uns eine Nachricht von der E-Mail-Adresse Ihres Kontos an <a href="mailto:${DELETE_EMAIL}">${DELETE_EMAIL}</a>.</li>
</ol>
<p><a class="btn btn-primary" href="${esc(mailto)}">Löschanfrage per E-Mail vorbereiten</a></p>
<h2>Was wird gelöscht?</h2>
<ul>
<li>Ihr Benutzerkonto und Ihre Anmeldedaten</li>
<li>alle Tierprofile und Gesundheitsdaten</li>
<li>alle Medikamenten- und Impfeinträge</li>
<li>alle Termine und Erinnerungen</li>
<li>alle weiteren persönlichen Daten</li>
</ul>
<p>Die Löschung erfolgt innerhalb von <strong>30 Tagen</strong> nach Ihrer Anfrage. Aus technischen Gründen können einige Daten bis zu 90 Tage in Sicherungskopien verbleiben.</p>
<h2 lang="en">Delete your account</h2>
<p lang="en">In the app, go to <strong>More → Account → Delete account</strong>, or email <a href="mailto:${DELETE_EMAIL}">${DELETE_EMAIL}</a> from the address of your account. We delete your account, pet profiles, health data, medication and vaccination entries, appointments, reminders and all other personal data within 30 days. Some data can remain in backups for up to 90 days.</p>
<p>Weitere Informationen: <a href="${LEGAL_PATHS.privacy}">Datenschutzerklärung</a></p>
</article>`,
  });
}

export function render404(assets: Assets): string {
  return plainPage({
    assets,
    title: 'Seite nicht gefunden – PetConnect24',
    description: 'Diese Seite gibt es nicht.',
    path: '/404.html',
    robots: 'noindex',
    body: `<article class="legal"><h1>Seite nicht gefunden</h1><p>Die Adresse stimmt nicht oder die Seite wurde verschoben.</p><p><a class="btn btn-primary" href="/">Zur Startseite</a> <a class="btn btn-ghost" href="${APP_PATH}">Zur App</a></p><p lang="en" class="muted">Page not found.</p></article>`,
  });
}

export function sitemapPaths(): string[] {
  return [...LANGUAGES.map((l) => l.path), LEGAL_PATHS.imprint, LEGAL_PATHS.privacy, LEGAL_PATHS.deleteAccount];
}

export function renderSitemap(lastmod: string): string {
  const alt = LANGUAGES.map((l) => `<xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${url(l.path)}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${url(langOf(DEFAULT_LANG).path)}"/>`;
  const entries = sitemapPaths().map((p) => {
    const isLanding = LANGUAGES.some((l) => l.path === p);
    return `<url><loc>${url(p)}</loc><lastmod>${lastmod}</lastmod>${isLanding ? alt : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

export function renderRobots(): string {
  // Bewusst kein „Disallow“ für /app/ oder /betreuung/: Diese Seiten tragen „noindex“ (Header). Eine Sperre würde das verdecken.
  return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

/** Zeilen für public/_headers: Sicherheits- und Cache-Header der erzeugten Seiten */
export function generatedHeaders(): string {
  const base = [...LANGUAGES.map((l) => l.path), LEGAL_PATHS.imprint, LEGAL_PATHS.privacy, LEGAL_PATHS.deleteAccount];
  // Netlify ordnet Kopfzeilen der aufgerufenen Adresse zu: auch die Schreibweise ohne bzw. mit Schrägstrich am Ende abdecken
  const variants = base.flatMap((p) => (p === '/' ? [p] : p.endsWith('/') ? [p, p.slice(0, -1)] : [p, `${p}/`]));
  const pages = [...variants, '/404.html'];
  const block = (path: string) =>
    `${path}\n  Cache-Control: public, max-age=0, must-revalidate\n  Content-Security-Policy: ${PUBLIC_CSP}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n`;
  return `\n# --- automatisch erzeugt (scripts/build-site.mjs) ---\n${pages.map(block).join('\n')}\n/og/*\n  Cache-Control: public, max-age=86400\n`;
}

/** Zeilen für public/_redirects: die statischen Seiten auch ohne Schrägstrich am Ende ausliefern */
export function generatedRedirects(): string {
  const rules = [...LANGUAGES.map((l) => l.path).filter((p) => p !== '/'), LEGAL_PATHS.imprint, LEGAL_PATHS.privacy, LEGAL_PATHS.deleteAccount].map((p) => {
    const dir = p.replace(/\/$/, '');
    return `${dir.padEnd(22)}${dir}/index.html`.padEnd(54) + ' 200';
  });
  return `\n# --- automatisch erzeugt (scripts/build-site.mjs) ---\n${rules.join('\n')}\n`;
}
