import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit-Tests rechnen mit lokaler Zeit wie auf dem Gerät: feste Zeitzone, damit sie überall gleich laufen.
process.env.TZ = 'Europe/Berlin';

/** Die App liegt unter /app/ (Datei app/index.html). Unterseiten wie /app/login liefern im Entwicklungs- und Vorschau-Server
 *  ebenfalls diese Datei – auf Netlify erledigt das die Regel „/app/* → /app/index.html“. */
function appFallback(): Plugin {
  const rewrite = (req: { url?: string }) => {
    const url = req.url ?? '';
    const path = url.split('?')[0] ?? '';
    const isAsset = /\.[a-z0-9]+$/i.test(path) || path.startsWith('/app/@') || path.startsWith('/app/src/') || path.startsWith('/app/node_modules/') || path.startsWith('/app/assets/');
    if ((path === '/app' || path.startsWith('/app/')) && !isAsset) req.url = '/app/index.html' + url.slice(path.length);
  };
  return {
    name: 'petconnect-app-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => (rewrite(req), next()));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => (rewrite(req), next()));
    },
  };
}

export default defineConfig({
  plugins: [react(), appFallback()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    // App-Dateien unter /app/assets/ (dist/app/assets); Landingpage, Rechtsseiten und public/ liegen im Wurzelverzeichnis von dist.
    assetsDir: 'app/assets',
    rollupOptions: { input: 'app/index.html' },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts', 'site/**/*.test.ts'],
    environment: 'node',
    // Platzhalter, damit Tests ohne .env.local laufen (z. B. in CI). Es werden keine Netzwerkaufrufe ausgeführt.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_placeholder',
    },
  },
});
