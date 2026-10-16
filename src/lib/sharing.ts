// Familie & Mithalter:innen: reine Hilfsfunktionen (ohne Supabase), damit sie testbar sind.
import type { MessageKey } from '../i18n';

export type MemberRole = 'owner' | 'carer' | 'viewer';
/** Stufen, die man vergeben kann */
export type GrantRole = Exclude<MemberRole, 'owner'>;
export const GRANT_ROLES: readonly GrantRole[] = ['carer', 'viewer'];

const PENDING_KEY = 'pc-pending-invite';
/** Die Datenbank erzeugt 64 Hex-Zeichen; etwas großzügiger prüfen, aber nur harmlose Zeichen zulassen. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
/** Höchstens so viele weitere Personen je Haupthalter:in (Mitglieder + offene Einladungen) */
export const MAX_PEOPLE = 5;
export const INVITEE_NAME_MAX = 60;

// ---------- Rechte ----------

export function toRole(v: string | null | undefined): MemberRole {
  return v === 'owner' || v === 'carer' ? v : 'viewer';
}

export function isGrantRole(v: unknown): v is GrantRole {
  return v === 'carer' || v === 'viewer';
}

/** Darf Tierakte, Tagesplan, Häkchen und Foto ändern? */
export function canEdit(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'carer';
}

export const ROLE_LABEL: Record<MemberRole, MessageKey> = {
  owner: 'roleOwner',
  carer: 'roleCarer',
  viewer: 'roleViewer',
};

export const ROLE_HINT: Record<GrantRole, MessageKey> = {
  carer: 'roleCarerX',
  viewer: 'roleViewerX',
};

// ---------- Einladungslink ----------

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

// ---------- Fehler und Status ----------

/** Fehlertext aus create_pet_invite / accept_pet_invite (error.message) → Übersetzungsschlüssel. */
export function inviteErrorKey(message: string | undefined): MessageKey {
  switch (message) {
    case 'invite_not_found':
      return 'invInvalid';
    case 'invite_used':
      return 'invUsed';
    case 'invite_expired':
      return 'invExpired';
    case 'invite_own':
      return 'invOwn';
    case 'not_authenticated':
      return 'invNeedLogin';
    case 'invite_name':
      return 'hhErrName';
    case 'invite_role':
      return 'hhErrRole';
    case 'invite_no_pets':
      return 'hhErrPets';
    case 'invite_not_owner':
      return 'hhErrNotOwner';
    case 'invite_duplicate':
      return 'hhErrDup';
    case 'invite_max':
      return 'hhErrMax';
    default:
      return 'errGeneric';
  }
}

/** Status aus invite_preview → 'open' | 'member' oder Text; unbekannt, leer oder fehlend gilt als ungültig. */
export function inviteStatusKey(status: string | undefined): 'open' | 'member' | MessageKey {
  if (status === 'open' || status === 'member') return status;
  if (status === 'used') return 'invUsed';
  if (status === 'expired') return 'invExpired';
  return 'invInvalid';
}

// ---------- Vorschau (JSON aus invite_preview) ----------

export interface PreviewPet {
  name: string;
  species: string;
  species_other: string | null;
}
export interface InvitePreview {
  inviter_name: string | null;
  invitee_name: string;
  role: GrantRole;
  expires_at: string;
  pets: PreviewPet[];
  status: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Unbekanntes JSON sicher in eine Vorschau umwandeln; null, wenn es nicht passt. */
export function parsePreview(json: unknown): InvitePreview | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const status = str(o.status);
  if (!status) return null;
  const pets = Array.isArray(o.pets)
    ? o.pets.flatMap((p): PreviewPet[] => {
        if (!p || typeof p !== 'object') return [];
        const r = p as Record<string, unknown>;
        const name = str(r.name);
        return name ? [{ name, species: str(r.species) ?? 'other', species_other: str(r.species_other) }] : [];
      })
    : [];
  return {
    inviter_name: str(o.inviter_name),
    invitee_name: str(o.invitee_name) ?? '',
    role: isGrantRole(o.role) ? o.role : 'viewer',
    expires_at: str(o.expires_at) ?? '',
    pets,
    status,
  };
}

// ---------- Personen gruppieren ----------

export interface Membership {
  pet_id: string;
  user_id: string;
  role: string;
}

export interface Person {
  userId: string;
  name: string;
  /** gemeinsame Stufe, oder null, wenn sie je Tier verschieden ist */
  role: GrantRole | null;
  pets: { petId: string; name: string; role: GrantRole }[];
}

/**
 * Personen bei meinen Tieren (ich bin Besitzer), gruppiert nach Person, nach Name sortiert.
 * Mich selbst und Besitzer-Zeilen lässt sie weg; Tiere in der Reihenfolge von `myPets`.
 */
export function groupPeople(
  rows: readonly Membership[],
  myId: string,
  myPets: readonly { id: string; name: string }[],
  names: ReadonlyMap<string, string>,
): Person[] {
  const petIndex = new Map(myPets.map((p, i) => [p.id, i]));
  const byUser = new Map<string, Person>();
  for (const r of rows) {
    if (r.user_id === myId || !isGrantRole(r.role)) continue;
    const idx = petIndex.get(r.pet_id);
    if (idx === undefined) continue;
    let p = byUser.get(r.user_id);
    if (!p) {
      p = { userId: r.user_id, name: names.get(r.user_id)?.trim() ?? '', role: null, pets: [] };
      byUser.set(r.user_id, p);
    }
    p.pets.push({ petId: r.pet_id, name: myPets[idx]!.name, role: r.role });
  }
  const people = [...byUser.values()];
  for (const p of people) {
    p.pets.sort((a, b) => (petIndex.get(a.petId) ?? 0) - (petIndex.get(b.petId) ?? 0));
    const roles = new Set(p.pets.map((x) => x.role));
    p.role = roles.size === 1 ? p.pets[0]!.role : null;
  }
  return people.sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
}

/** „Luna, Mio“ */
export function joinNames(names: readonly string[]): string {
  return names.join(', ');
}

// ---------- erledigt von ----------

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
