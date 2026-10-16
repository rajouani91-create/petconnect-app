import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit-Tests rechnen mit lokaler Zeit wie auf dem Gerät: feste Zeitzone, damit sie überall gleich laufen.
process.env.TZ = 'Europe/Berlin';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
