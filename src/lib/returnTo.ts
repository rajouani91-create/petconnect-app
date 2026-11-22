// Rücksprung nach der Anmeldung (z. B. nach Antippen einer Benachrichtigung ohne Sitzung).
// Pfad, Suche und Sprungmarke bleiben erhalten; zusätzlich im sessionStorage, damit es auch eine Anmeldung
// über Google oder einen E-Mail-Link übersteht (dabei geht der Verlaufs-Zustand verloren).

const KEY = 'pc-return-to';

/** Nur Pfade der eigenen App („/…“, nicht „//…“, keine Anmeldeseiten) */
export function safeReturn(v: unknown): string | null {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return null;
  if (/^\/(login|registrieren|passwort)/.test(v)) return null;
  return v.slice(0, 500);
}

export function rememberReturn(path: string): void {
  const p = safeReturn(path);
  if (!p) return;
  try {
    sessionStorage.setItem(KEY, p);
  } catch {
    // privater Modus o. Ä.: dann nur über den Verlaufs-Zustand
  }
}

/** Gemerkten Rücksprung lesen (gelöscht wird er, sobald die Seite angemeldet erreicht ist) */
export function peekReturn(): string | null {
  try {
    return safeReturn(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearReturn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nichts zu tun
  }
}
