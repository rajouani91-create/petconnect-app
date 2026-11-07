// Schreibt die öffentlichen Seiten nach dist/ (nach dem Vite-Build der App). Aufruf über scripts/build-site.mjs.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImprintBody, PrivacyBody } from '../src/pages/legalContent';
import { LANGUAGES } from './config';
import {
  generatedHeaders,
  generatedRedirects,
  LEGAL_PATHS,
  render404,
  renderDeleteAccount,
  renderLanding,
  renderLegal,
  renderRobots,
  renderSitemap,
  type Assets,
} from './render';

const hash = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex').slice(0, 10);

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

/** Datei mit Hash im Namen nach dist/site/<unterordner> legen; gibt die Adresse zurück */
function emit(dist: string, sub: string, src: string, name: string): string {
  const buf = readFileSync(src);
  const dot = name.lastIndexOf('.');
  const hashed = `${name.slice(0, dot)}.${hash(buf)}${name.slice(dot)}`;
  mkdirSync(join(dist, 'site', sub), { recursive: true });
  writeFileSync(join(dist, 'site', sub, hashed), buf);
  return `/site/${sub ? `${sub}/` : ''}${hashed}`;
}

export function buildSite(root: string, dist: string): { pages: string[] } {
  if (!existsSync(join(dist, 'app', 'index.html'))) throw new Error('dist/app/index.html fehlt – zuerst "vite build" ausführen.');
  const site = join(root, 'site');

  // Schriften, Skript, Bilder, Stil (Hash im Namen → lange zwischenspeicherbar)
  const fontUrls: Record<string, string> = {};
  for (const f of readdirSync(join(site, 'fonts'))) fontUrls[f] = emit(dist, 'fonts', join(site, 'fonts', f), f);
  let css = readFileSync(join(site, 'site.css'), 'utf8');
  css = css.replace(/@font\/([\w.-]+)/g, (_m, name: string) => {
    const u = fontUrls[name];
    if (!u) throw new Error(`Schrift fehlt in site/fonts: ${name}`);
    return u;
  });
  const cssUrl = `/site/site.${hash(css)}.css`;
  write(join(dist, cssUrl), css);
  const scriptUrl = emit(dist, '', join(site, 'forward.js'), 'forward.js');
  const img: Record<string, string> = {};
  for (const f of readdirSync(join(site, 'img'))) img[f.replace(/\.webp$/, '')] = emit(dist, 'img', join(site, 'img', f), f);
  const assets: Assets = {
    css: cssUrl,
    script: scriptUrl,
    preload: [fontUrls['figtree-400-2.woff2'] ?? '', fontUrls['bricolage-grotesque-700-1.woff2'] ?? ''].filter(Boolean),
    img,
  };

  // Landingpages je Sprache
  const pages: string[] = [];
  for (const l of LANGUAGES) {
    const file = join(dist, l.path, 'index.html');
    write(file, renderLanding(l.code, assets));
    pages.push(l.path);
  }

  // Rechtsseiten (gleiche Texte wie in der App: src/pages/legalContent.tsx)
  write(join(dist, LEGAL_PATHS.imprint, 'index.html'), renderLegal('imprint', 'Impressum', renderToStaticMarkup(createElement(ImprintBody)), assets));
  write(join(dist, LEGAL_PATHS.privacy, 'index.html'), renderLegal('privacy', 'Datenschutzerklärung', renderToStaticMarkup(createElement(PrivacyBody)), assets));
  write(join(dist, LEGAL_PATHS.deleteAccount, 'index.html'), renderDeleteAccount(assets));
  write(join(dist, '404.html'), render404(assets));

  // Vorschaubilder für soziale Netzwerke
  if (existsSync(join(site, 'og'))) cpSync(join(site, 'og'), join(dist, 'og'), { recursive: true });

  // SEO und Hosting
  write(join(dist, 'sitemap.xml'), renderSitemap(new Date().toISOString().slice(0, 10)));
  write(join(dist, 'robots.txt'), renderRobots());
  appendFileSync(join(dist, '_headers'), generatedHeaders());
  appendFileSync(join(dist, '_redirects'), generatedRedirects());

  return { pages: [...pages, LEGAL_PATHS.imprint, LEGAL_PATHS.privacy, LEGAL_PATHS.deleteAccount, '/404.html'] };
}
