// Erzeugt Landingpage, Rechtsseiten, Sitemap und robots.txt nach dist/ (läuft nach "vite build").
// Die TypeScript-Quellen unter site/ und src/pages/legalContent.tsx lädt der Vite-Server im SSR-Modus – ohne Zusatzwerkzeuge.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, configFile: false, plugins: [] });
try {
  const { buildSite } = await server.ssrLoadModule('/site/build.ts');
  const { pages } = buildSite(root, `${root}dist`);
  process.stdout.write(`Öffentliche Seiten erzeugt: ${pages.join(', ')}\n`);
} finally {
  await server.close();
}
