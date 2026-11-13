// Praxis-Konto (Etappe P1): Kontoart, Praxisprofil, Team und Einladungen.
// Rechte prüft die Datenbank (Funktionen practice_*); hier stehen Aufrufe und reine Hilfsfunktionen.
import type { MessageKey } from '../i18n';
import { supabase } from './supabase';
import type { Json } from './database.types';
import {
  PRACTICE_FEATURES, PRACTICE_SERVICES, PRACTICE_SPECIES, PRACTICE_TITLES, SERVICE_NEEDS_SPECIES, TEAM_LANGUAGES, isPracticeFeature, isPracticeService, isPracticeSpecies,
  isPracticeTitle, isTeamLanguage, type PracticeFeature, type PracticeService, type PracticeSpecies, type PracticeTitle, type TeamLanguage,
} from './practiceCatalog';

/** Antworten des Angebots-Fragebogens – dieselben Werte, nach denen Halter:innen in der Praxissuche filtern. */
export interface PracticeOffer {
  species: PracticeSpecies[];
  services: PracticeService[];
  titles: PracticeTitle[];
  languages: TeamLanguage[];
  features: PracticeFeature[];
}

export const EMPTY_OFFER: PracticeOffer = { species: [], services: [], titles: [], languages: [], features: [] };

/** Tierart an- oder abwählen; Leistungen, die nur zu dieser Tierart passen (Folgefragen), fallen beim Abwählen weg. */
export function toggleSpecies(o: PracticeOffer, s: PracticeSpecies): PracticeOffer {
  if (o.species.includes(s)) {
    return { ...o, species: o.species.filter((x) => x !== s), services: o.services.filter((v) => SERVICE_NEEDS_SPECIES[v] !== s) };
  }
  return { ...o, species: PRACTICE_SPECIES.filter((x) => x === s || o.species.includes(x)) };
}

/** Wird diese Leistung gefragt? Folgefragen nur, wenn die passende Tierart gewählt ist. */
export function serviceAsked(o: Pick<PracticeOffer, 'species'>, v: PracticeService): boolean {
  const need = SERVICE_NEEDS_SPECIES[v];
  return !need || o.species.includes(need);
}

/** Wert in einer Liste setzen oder entfernen, Reihenfolge wie im Katalog */
export function setIn<T extends string>(catalog: readonly T[], list: readonly T[], v: T, on: boolean): T[] {
  return catalog.filter((x) => (x === v ? on : list.includes(x)));
}

/** Leerer Fragebogen? (dann ist die Praxis in der Suche „Angebot unbekannt“) */
export const offerIsEmpty = (o: PracticeOffer) => o.species.length + o.services.length + o.titles.length + o.languages.length + o.features.length === 0;

export { PRACTICE_FEATURES, PRACTICE_SERVICES, PRACTICE_SPECIES, PRACTICE_TITLES, TEAM_LANGUAGES };

export const STAFF_ROLES = ['lead', 'vet', 'team'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABEL: Record<StaffRole, MessageKey> = { lead: 'pr_lead', vet: 'pr_vet', team: 'pr_team' };
export const STAFF_ROLE_HINT: Record<StaffRole, MessageKey> = { lead: 'pr_leadHint', vet: 'pr_vetHint', team: 'pr_teamHint' };

export type PracticeStatus = 'pending' | 'active' | 'suspended';

export interface PracticeAccount {
  id: string;
  directory_id: string | null;
  name: string;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  hours_text: string | null;
  offer: PracticeOffer;
  /** vom Betreiber geprüfte Fachtitel */
  verified_titles: PracticeTitle[];
  titles_verified: boolean;
  package: string;
  status: PracticeStatus;
  created_at: string;
  approved_at: string | null;
}

export interface PracticeMe {
  kind: 'owner' | 'practice';
  role: StaffRole | null;
  practice: PracticeAccount | null;
  /** offene Einladung an die eigene Adresse */
  invite: { practice_name: string; role: StaffRole; expired: boolean } | null;
}

export const OWNER_ME: PracticeMe = { kind: 'owner', role: null, practice: null, invite: null };

const isRole = (v: unknown): v is StaffRole => typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);
const listOf = <T>(v: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(v) ? [...new Set(v.filter(ok))] : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Antwort von practice_me prüfen und in feste Typen bringen. Unbekanntes → Halter-Konto. */
export function parseMe(raw: unknown): PracticeMe {
  if (!raw || typeof raw !== 'object') return OWNER_ME;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === 'practice' ? 'practice' : 'owner';
  const p = r.practice && typeof r.practice === 'object' ? (r.practice as Record<string, unknown>) : null;
  const inv = r.invite && typeof r.invite === 'object' ? (r.invite as Record<string, unknown>) : null;
  const status: PracticeStatus = p?.status === 'active' || p?.status === 'suspended' ? p.status : 'pending';
  return {
    kind,
    role: isRole(r.role) ? r.role : null,
    practice: p && typeof p.id === 'string' && typeof p.name === 'string'
      ? {
          id: p.id,
          directory_id: str(p.directory_id),
          name: p.name,
          street: str(p.street),
          housenumber: str(p.housenumber),
          postcode: str(p.postcode),
          city: str(p.city),
          country: str(p.country) ?? 'DE',
          phone: str(p.phone),
          email: str(p.email),
          website: str(p.website),
          hours_text: str(p.hours_text),
          offer: {
            species: PRACTICE_SPECIES.filter((x) => listOf(p.species, isPracticeSpecies).includes(x)),
            services: PRACTICE_SERVICES.filter((x) => listOf(p.services, isPracticeService).includes(x)),
            titles: PRACTICE_TITLES.filter((x) => listOf(p.titles, isPracticeTitle).includes(x)),
            languages: TEAM_LANGUAGES.filter((x) => listOf(p.languages, isTeamLanguage).includes(x)),
            features: PRACTICE_FEATURES.filter((x) => listOf(p.features, isPracticeFeature).includes(x)),
          },
          verified_titles: PRACTICE_TITLES.filter((x) => listOf(p.verified_titles, isPracticeTitle).includes(x)),
          titles_verified: p.titles_verified === true,
          package: str(p.package) ?? 'basis',
          status,
          created_at: typeof p.created_at === 'string' ? p.created_at : '',
          approved_at: str(p.approved_at),
        }
      : null,
    invite: inv && typeof inv.practice_name === 'string' && isRole(inv.role)
      ? { practice_name: inv.practice_name, role: inv.role, expired: inv.expired === true }
      : null,
  };
}

/** „Mainstraße 12a“ → Straße und Hausnummer (Hausnummer = letzter Teil, wenn er mit einer Ziffer beginnt). */
export function splitStreet(v: string): { street: string; housenumber: string } {
  const s = v.trim().replace(/\s+/g, ' ');
  const m = /^(.*\D)\s+(\d[\w\s/-]{0,9})$/u.exec(s);
  return m ? { street: m[1]!.trim(), housenumber: m[2]!.trim() } : { street: s, housenumber: '' };
}

/** „65428 Rüsselsheim“ → PLZ und Ort (PLZ = führende Ziffernfolge, auch „1010“ oder „NL-1012“ nicht). */
export function splitZipCity(v: string): { postcode: string; city: string } {
  const s = v.trim().replace(/\s+/g, ' ');
  const m = /^(\d{4} ?[A-Z]{2}(?=\s)|\d{4,5}|\d{3} ?\d{2})\s+(.+)$/u.exec(s);
  return m ? { postcode: m[1]!.trim(), city: m[2]!.trim() } : { postcode: '', city: s };
}

export const joinStreet = (street: string | null, no: string | null) => [street, no].filter(Boolean).join(' ');
export const joinZipCity = (zip: string | null, city: string | null) => [zip, city].filter(Boolean).join(' ');

/** Formular der Praxisangaben (wie im Prototyp: Straße+Nr. und PLZ+Ort je ein Feld). */
export interface PracticeForm {
  name: string;
  streetLine: string;
  zipCity: string;
  phone: string;
  email: string;
  website: string;
  hours: string;
}

export const EMPTY_FORM: PracticeForm = { name: '', streetLine: '', zipCity: '', phone: '', email: '', website: '', hours: '' };

export const FORM_MAX = { name: 120, streetLine: 140, zipCity: 92, phone: 40, email: 200, website: 200, hours: 300 } as const;

export function formFromPractice(p: Pick<PracticeAccount, 'name' | 'street' | 'housenumber' | 'postcode' | 'city' | 'phone' | 'email' | 'website' | 'hours_text'>): PracticeForm {
  return {
    name: p.name,
    streetLine: joinStreet(p.street, p.housenumber),
    zipCity: joinZipCity(p.postcode, p.city),
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: p.website ?? '',
    hours: p.hours_text ?? '',
  };
}

export type FormField = 'name' | 'email';

/** Pflicht ist nur der Name (wie im Prototyp); E-Mail wird geprüft, wenn angegeben. */
export function formErrors(f: PracticeForm): Partial<Record<FormField, MessageKey>> {
  const e: Partial<Record<FormField, MessageKey>> = {};
  const n = f.name.trim();
  if (!n) e.name = 'err_required';
  else if (n.length < 2) e.name = 'pf_nameShort';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'err_email';
  return e;
}

/** Formular und Fragebogen → Daten für practice_register / practice_update_profile */
export function formToPayload(f: PracticeForm, offer: PracticeOffer, country = 'DE'): Record<string, Json> {
  const st = splitStreet(f.streetLine);
  const zc = splitZipCity(f.zipCity);
  return {
    name: f.name.trim(),
    street: st.street,
    housenumber: st.housenumber,
    postcode: zc.postcode,
    city: zc.city,
    country,
    phone: f.phone.trim(),
    email: f.email.trim(),
    website: f.website.trim(),
    hours_text: f.hours.trim(),
    species: PRACTICE_SPECIES.filter((x) => offer.species.includes(x)),
    // Folgefragen ohne passende Tierart nicht speichern
    services: PRACTICE_SERVICES.filter((x) => offer.services.includes(x) && serviceAsked(offer, x)),
    titles: PRACTICE_TITLES.filter((x) => offer.titles.includes(x)),
    languages: TEAM_LANGUAGES.filter((x) => offer.languages.includes(x)),
    features: PRACTICE_FEATURES.filter((x) => offer.features.includes(x)),
  };
}

export interface DirectoryHit {
  id: string;
  name: string;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  opening_hours: string | null;
}

/** Verzeichniseintrag → Formular (Name, Adresse, Telefon, E-Mail, Website; Öffnungszeiten im OSM-Format als Vorschlag) */
export function formFromDirectory(h: DirectoryHit): PracticeForm {
  return {
    ...EMPTY_FORM,
    name: h.name,
    streetLine: joinStreet(h.street, h.housenumber),
    zipCity: joinZipCity(h.postcode, h.city),
    phone: h.phone ?? '',
    email: h.email ?? '',
    website: h.website ?? '',
    hours: h.opening_hours ?? '',
  };
}

/** Fehlercode aus Datenbank oder Edge Function → Meldung */
export function practiceErrorKey(code: string | undefined | null): MessageKey {
  switch (code) {
    case 'directory_taken':
      return 'pe_directoryTaken';
    case 'already_member':
      return 'pe_alreadyMember';
    case 'invite_exists':
      return 'pe_inviteExists';
    case 'account_exists':
      return 'pe_accountExists';
    case 'already_confirmed':
      return 'pe_alreadyConfirmed';
    case 'last_lead':
      return 'pe_lastLead';
    case 'invite_not_found':
      return 'pe_inviteNotFound';
    case 'invite_expired':
      return 'pe_inviteExpired';
    case 'email_invalid':
      return 'err_email';
    case 'name_invalid':
      return 'pf_nameShort';
    case 'offer_invalid':
      return 'pe_generic';
    case 'practice_suspended':
      return 'pp_suspended';
    case 'file_too_big':
      return 'pv_tooBig';
    case 'file_type':
      return 'pv_type';
    case 'forbidden':
      return 'pe_forbidden';
    case 'mail_failed':
      return 'pe_mailFailed';
    default:
      return 'pe_generic';
  }
}

/** Fehlercode aus einem Supabase-Fehler lesen (Meldung der Datenbankfunktion). */
export function errorCode(e: unknown): string | null {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && /^[a-z_]+$/.test(m) ? m : null;
}

// ---------- Aufrufe ----------

export async function practiceMe(): Promise<PracticeMe> {
  const { data, error } = await supabase.rpc('practice_me');
  if (error) throw error;
  return parseMe(data);
}

export async function searchDirectory(q: string, country = 'DE'): Promise<DirectoryHit[]> {
  const { data, error } = await supabase.rpc('practice_directory_search', { p_q: q.trim(), p_country: country });
  if (error) throw error;
  return data ?? [];
}

export async function registerPractice(directoryId: string | null, form: PracticeForm, offer: PracticeOffer): Promise<string> {
  const { data, error } = await supabase.rpc('practice_register', { p_directory_id: directoryId, p: formToPayload(form, offer) });
  if (error) throw error;
  return data;
}

export async function updatePracticeProfile(form: PracticeForm, offer: PracticeOffer, country: string): Promise<void> {
  const { error } = await supabase.rpc('practice_update_profile', { p: formToPayload(form, offer, country) });
  if (error) throw error;
}

export interface TeamMember { user_id: string; email: string; display_name: string | null; role: StaffRole; created_at: string }

export async function practiceTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('practice_team');
  if (error) throw error;
  return (data ?? []).filter((m) => isRole(m.role)) as TeamMember[];
}

export interface OpenInvite { id: string; email: string; name: string; role: StaffRole; created_at: string; expires_at: string }

/** Offene Einladungen (nur Praxisleitung sieht welche, RLS). */
export async function openInvites(): Promise<OpenInvite[]> {
  const { data, error } = await supabase
    .from('practice_staff_invites')
    .select('id, email, name, role, created_at, expires_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).filter((r) => isRole(r.role)) as OpenInvite[];
}

/** Liest den Fehlercode aus der Antwort der Edge Function (z. B. {"error":"invite_exists"}). */
async function invokeInvite(body: Record<string, string>): Promise<void> {
  const { error } = await supabase.functions.invoke('practice-invite', { body });
  if (!error) return;
  let code: string | null = null;
  try {
    const ctx = (error as { context?: Response }).context;
    const j = (await ctx?.json()) as { error?: unknown } | undefined;
    if (typeof j?.error === 'string') code = j.error;
  } catch {
    code = null;
  }
  throw new Error(code ?? 'db_error');
}

export const inviteStaff = (email: string, name: string, role: StaffRole, language: string) =>
  invokeInvite({ action: 'invite', email: email.trim(), name: name.trim(), role, language });
export const resendInvite = (id: string, language: string) => invokeInvite({ action: 'resend', id, language });
export const revokeInvite = (id: string) => invokeInvite({ action: 'revoke', id });

export async function setMemberRole(userId: string, role: StaffRole): Promise<void> {
  const { error } = await supabase.rpc('practice_set_role', { p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('practice_remove_member', { p_user: userId });
  if (error) throw error;
}

export async function acceptPracticeInvite(): Promise<string> {
  const { data, error } = await supabase.rpc('practice_accept_invite');
  if (error) throw error;
  return data;
}

// ---------- Betreiber ----------

export interface StaffPracticeRow {
  id: string; name: string; postcode: string | null; city: string | null; country: string; phone: string | null; email: string | null;
  status: PracticeStatus; package: string; directory_id: string | null; members: number; lead_email: string | null; created_at: string; approved_at: string | null;
  titles: string[]; titles_verified: boolean;
}

export async function staffPractices(): Promise<StaffPracticeRow[]> {
  const { data, error } = await supabase.rpc('staff_practices', {});
  if (error) throw error;
  return (data ?? []) as StaffPracticeRow[];
}

export async function setPracticeStatus(id: string, status: 'active' | 'suspended', reason: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('staff_set_practice_status', { p_id: id, new_status: status, reason: reason.trim() });
  if (error) throw error;
  return data;
}

export async function setTitlesVerified(id: string, verified: boolean, reason: string): Promise<void> {
  const { error } = await supabase.rpc('staff_set_titles_verified', { p_id: id, verified, reason: reason.trim() });
  if (error) throw error;
}

// ---------- Nachweise für Fachtitel ----------

export const PROOF_BUCKET = 'practice-proofs';
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Datei prüfen, bevor sie hochgeladen wird. Liefert einen Fehlercode oder null. */
export function proofFileError(f: { type: string; size: number }): 'file_type' | 'file_too_big' | null {
  if (!PROOF_TYPES[f.type]) return 'file_type';
  if (f.size > PROOF_MAX_BYTES || f.size <= 0) return 'file_too_big';
  return null;
}

/** Ablageort: <praxis-id>/<nachweis-id>.<endung> (die Speicherregeln erlauben nur den eigenen Praxis-Ordner) */
export function proofPath(practiceId: string, proofId: string, mime: string): string {
  return `${practiceId}/${proofId}.${PROOF_TYPES[mime] ?? 'bin'}`;
}

export interface ProofReading { matches?: boolean; is_certificate?: boolean; title_match?: boolean; name_match?: boolean; chamber_found?: boolean; method?: string; note?: string; title_text?: string; holder_name?: string; issuer?: string; issue_date?: string }
export interface ProofRow {
  id: string; title: PracticeTitle; person_name: string; created_at: string; read_status: string; reading: ProofReading | null;
  decision: 'approved' | 'rejected' | null; decision_reason: string | null; file_deleted_at: string | null;
}

/** Status eines Nachweises für die Anzeige */
export type ProofState = 'reading' | 'review' | 'approved' | 'rejected';
export function proofState(p: Pick<ProofRow, 'decision' | 'read_status'>): ProofState {
  if (p.decision === 'approved') return 'approved';
  if (p.decision === 'rejected') return 'rejected';
  return p.read_status === 'pending' ? 'reading' : 'review';
}

export async function practiceProofs(): Promise<ProofRow[]> {
  const { data, error } = await supabase
    .from('practice_title_proofs')
    .select('id, title, person_name, created_at, read_status, reading, decision, decision_reason, file_deleted_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).filter((r) => isPracticeTitle(r.title)) as unknown as ProofRow[];
}

/** Urkunde hochladen, eintragen und vorlesen lassen. Das Vorlesen darf scheitern – dann sieht der Betreiber selbst nach. */
export async function uploadProof(practiceId: string, title: PracticeTitle, person: string, file: File): Promise<void> {
  const err = proofFileError(file);
  if (err) throw new Error(err);
  const id = crypto.randomUUID();
  const path = proofPath(practiceId, id, file.type);
  const up = await supabase.storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error('db_error');
  const { error } = await supabase.rpc('practice_add_proof', { p_id: id, p_title: title, p_person: person.trim(), p_path: path, p_mime: file.type, p_size: file.size });
  if (error) {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    throw error;
  }
  await supabase.functions.invoke('practice-proof', { body: { action: 'read', id } }).catch(() => undefined);
}

export async function removeProof(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('practice_remove_proof', { p_id: id });
  if (error) throw error;
  if (data) await supabase.storage.from(PROOF_BUCKET).remove([data]);
}

export interface StaffProofRow extends ProofRow { practice_id: string; practice_name: string; path: string; mime: string; decided_at: string | null }

export async function staffProofs(open = true): Promise<StaffProofRow[]> {
  const { data, error } = await supabase.rpc('staff_practice_proofs', { p_open: open });
  if (error) throw error;
  return (data ?? []) as unknown as StaffProofRow[];
}

/** Admin: Urkunde kurz ansehen (signierter Link, 5 Minuten) */
export async function proofUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error('storage');
  return data.signedUrl;
}

export async function rereadProof(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('practice-proof', { body: { action: 'read', id } });
  if (error) throw error;
}

/** Admin: bestätigen oder ablehnen; die Datei wird danach gelöscht */
export async function decideProof(id: string, approve: boolean, reason: string): Promise<void> {
  const { error } = await supabase.functions.invoke('practice-proof', { body: { action: 'decide', id, approve, reason: reason.trim() } });
  if (error) throw error;
}
