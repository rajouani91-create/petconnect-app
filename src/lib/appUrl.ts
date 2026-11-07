// Zentrale Adressen der App. Die App läuft unter „/app/“ (die Startseite „/“ ist die öffentliche Landingpage).
// APP_BASE ist ein Pfad wie '/app' (ohne Schrägstrich am Ende); '' wäre die Wurzel.
// Wichtig: Derselbe Wert steht in public/sw.js (APP_BASE) – ein Test stellt sicher, dass beide übereinstimmen.

export const APP_BASE = '/app';

/** Pfad innerhalb der App → vollständige Adresse (für Rücksprünge aus Anmelde-, Bestätigungs- und Reset-Mails). */
export function appUrl(path = '/', origin: string = window.location.origin): string {
  const clean = path === '' || path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  // Heutiges Verhalten bleibt byte-genau erhalten: Start der App = reine Origin ohne Schrägstrich
  if (clean === '/') return APP_BASE ? `${origin}${APP_BASE}/` : origin;
  return `${origin}${APP_BASE}${clean}`;
}
