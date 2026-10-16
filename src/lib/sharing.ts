// Gemeinsam betreuen: reine Hilfsfunktionen (ohne Supabase), damit sie testbar sind.
import type { MessageKey } from '../i18n';

export type MemberRole = 'owner' | 'carer';
export type InviteStatus = 'open' | 'used' | 'expired' | 'member';

const PENDING_KEY = 'pc-pending-invite';
/** Die Datenbank erzeugt 64 Hex-Zeichen; etwas großzügiger prüfen, aber nur harmlose Zeichen zulassen. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isTokenShape(token: string | undefined | null): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Einladungslink, z. B. https://app.example/einladung/abc… */
export function inviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/einladung/${encodeURIComponent(token)}`;
}

/** Pfad /einladung/:token → token, sonst null. */
export function tokenFromPath(pathname: string): string | null {
  const m = /^\/einladung\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  let token: string;
  try {
    token = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return isTokenShape(token) ? token : null;
}

/** Fehlertext aus accept_pet_invite (error.message) → Übersetzungsschlüssel. */
export function inviteErrorKey(message: string | undefined): MessageKey {
  switch (message) {
    case 'invite_not_found':
      return 'invInvalid';
    case 'invite_used':
      return 'invUsed';
    case 'invite_expired':
      return 'invExpired';
    case 'not_authenticated':
      return 'invNeedLogin';
    default:
      return 'errGeneric';
  }
}

/** Status aus invite_preview → Text; unbekannte Werte gelten als ungültig. */
export function inviteStatusKey(status: string | undefined): 'open' | 'member' | MessageKey {
  if (status === 'open' || status === 'member') return status;
  if (status === 'used') return 'invUsed';
  if (status === 'expired') return 'invExpired';
  return 'invInvalid';
}

/**
 * Wer hat abgehakt? Name der anderen Person, sonst null.
 * Eigene Häkchen (oder unbekannte Person ohne Namen) ergeben kein „von“.
 */
export function doneByName(
  doneBy: string | undefined,
  myId: string | null | undefined,
  names: ReadonlyMap<string, string>,
): string | null {
  if (!doneBy || doneBy === myId) return null;
  const name = names.get(doneBy)?.trim();
  return name ? name : null;
}

/** Offene Einladungen: noch nicht angenommen und noch nicht abgelaufen. */
export function isOpenInvite(inv: { accepted_at: string | null; expires_at: string }, now: Date = new Date()): boolean {
  return inv.accepted_at === null && new Date(inv.expires_at).getTime() > now.getTime();
}

// ---------- gemerkte Einladung (vor der Anmeldung) ----------

export function readPendingInvite(): string | null {
  try {
    const v = localStorage.getItem(PENDING_KEY);
    return isTokenShape(v) ? v : null;
  } catch {
    return null;
  }
}

export function savePendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_KEY, token);
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* Speicher nicht verfügbar */
  }
}
