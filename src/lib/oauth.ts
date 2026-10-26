/** Merkt die Sprache der Anmeldeseite über die Weiterleitung zu Google hinweg. */
export const OAUTH_LANG_KEY = 'pc.oauth.lang';

/** Ein neues Konto gilt nur kurz nach der Anlage als neu. */
export const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

export function rememberOauthLang(lang: string): void {
  try {
    localStorage.setItem(OAUTH_LANG_KEY, lang);
  } catch {
    // Speicher gesperrt: dann gilt die Standardsprache.
  }
}

/** Liest die gemerkte Sprache und löscht sie sofort wieder. */
export function takeOauthLang(): string | null {
  try {
    const v = localStorage.getItem(OAUTH_LANG_KEY);
    if (v) localStorage.removeItem(OAUTH_LANG_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Soll die gemerkte Sprache auf das Profil übertragen werden? Nur bei frisch angelegten Konten mit abweichender Sprache. */
export function shouldAdoptLang(profileLang: string, createdAt: string, stored: string | null, now: number = Date.now()): boolean {
  if (!stored || stored === profileLang) return false;
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && now - created < NEW_ACCOUNT_WINDOW_MS;
}
