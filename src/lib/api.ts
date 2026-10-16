// Datenzugriff. owner_id wird nie mitgeschickt – die Datenbank setzt ihn, RLS schützt die Zeilen.
import type { PostgrestError } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import { supabase, type PetRow, type ProfileRow, type RoutineRow } from './supabase';
import { isOpenInvite, type MemberRole } from './sharing';
import type { TemplateEntry } from './templates';
import type { PetFormValues, RoutineFormValues } from './validate';
import { petFormToRow } from './validate';

export class ApiError extends Error {
  readonly code: string | undefined;
  constructor(err: PostgrestError | { message: string; code?: string }) {
    super(err.message);
    this.name = 'ApiError';
    this.code = err.code;
  }
}
/** Postgres: unique_violation */
export const isDuplicate = (e: unknown): boolean => e instanceof ApiError && e.code === '23505';

/** Ergebnis mit Daten: Fehler werfen, fehlende Daten ebenfalls. */
function check<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw new ApiError(res.error);
  if (res.data === null) throw new ApiError({ message: 'Keine Daten erhalten' });
  return res.data;
}

/** Ergebnis, das leer sein darf (maybeSingle). */
function checkMaybe<T>(res: { data: T | null; error: PostgrestError | null }): T | null {
  if (res.error) throw new ApiError(res.error);
  return res.data;
}

/** Schreibvorgang ohne Rückgabe. */
function checkOk(res: { error: PostgrestError | null }): void {
  if (res.error) throw new ApiError(res.error);
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  return checkMaybe(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

export async function updateLanguage(userId: string, language: Lang): Promise<void> {
  checkOk(await supabase.from('profiles').update({ language }).eq('id', userId));
}

export async function listPets(): Promise<PetRow[]> {
  return check(await supabase.from('pets').select('*').eq('deceased', false).order('created_at', { ascending: true }));
}

export async function createPet(values: PetFormValues): Promise<PetRow> {
  return check(await supabase.from('pets').insert(petFormToRow(values)).select('*').single());
}

export async function updatePet(id: string, values: PetFormValues): Promise<PetRow> {
  return check(await supabase.from('pets').update(petFormToRow(values)).eq('id', id).select('*').single());
}

/** Nur der Besitzer darf löschen; RLS löscht sonst stillschweigend nichts – dann Fehler. */
export async function deletePet(id: string): Promise<void> {
  const rows = check(await supabase.from('pets').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw new ApiError({ message: 'Nichts gelöscht', code: '42501' });
}

/** Legt ein Tier an und übernimmt optional den Tagesplan. Scheitert der Plan, wird das Tier wieder entfernt. */
export async function createPetWithTemplate(values: PetFormValues, template: readonly TemplateEntry[]): Promise<PetRow> {
  const pet = await createPet(values);
  if (template.length === 0) return pet;
  const res = await supabase
    .from('routine_items')
    .insert(template.map((e) => ({ pet_id: pet.id, kind: e.kind, time_of_day: e.time, repeat: e.repeat, label: null })));
  if (res.error) {
    await supabase.from('pets').delete().eq('id', pet.id);
    throw new ApiError(res.error);
  }
  return pet;
}

export async function listRoutine(petId: string): Promise<RoutineRow[]> {
  return check(await supabase.from('routine_items').select('*').eq('pet_id', petId).order('time_of_day', { ascending: true }));
}

export async function addRoutine(petId: string, v: RoutineFormValues): Promise<RoutineRow> {
  const label = v.label.trim() || null;
  return check(
    await supabase
      .from('routine_items')
      .insert({ pet_id: petId, kind: v.kind, time_of_day: v.time, repeat: v.repeat, label })
      .select('*')
      .single(),
  );
}

export async function deleteRoutine(id: string): Promise<void> {
  checkOk(await supabase.from('routine_items').delete().eq('id', id));
}

export async function setReminder(id: string, on: boolean): Promise<void> {
  checkOk(await supabase.from('routine_items').update({ reminder_on: on }).eq('id', id));
}

export async function setAllReminders(petId: string, on: boolean): Promise<void> {
  checkOk(await supabase.from('routine_items').update({ reminder_on: on }).eq('pet_id', petId));
}

/** Am Tag `date` (YYYY-MM-DD, Europe/Berlin) erledigte Einträge: Eintrags-ID → Person, die abgehakt hat. */
export async function listDone(itemIds: readonly string[], date: string): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  const rows = check(
    await supabase.from('routine_done').select('routine_item_id, owner_id').eq('done_on', date).in('routine_item_id', [...itemIds]),
  );
  return new Map(rows.map((r) => [r.routine_item_id, r.owner_id]));
}

export async function markDone(itemId: string, date: string): Promise<void> {
  const res = await supabase.from('routine_done').upsert(
    { routine_item_id: itemId, done_on: date },
    { onConflict: 'routine_item_id,done_on', ignoreDuplicates: true },
  );
  if (res.error) throw new ApiError(res.error);
}

export async function markUndone(itemId: string, date: string): Promise<void> {
  checkOk(await supabase.from('routine_done').delete().eq('routine_item_id', itemId).eq('done_on', date));
}

// ---------- Gemeinsam betreuen ----------

export interface Member {
  petId: string;
  userId: string;
  role: MemberRole;
  name: string;
}

/** Betreuer der Tiere `petIds` (RLS: nur Tiere, die man selbst betreut). Ohne Namen. */
export async function listMemberships(petIds: readonly string[]): Promise<{ pet_id: string; user_id: string; role: string }[]> {
  if (petIds.length === 0) return [];
  return check(await supabase.from('pet_members').select('pet_id, user_id, role').in('pet_id', [...petIds]));
}

/** Betreuer eines Tieres mit Anzeigenamen, Besitzer zuerst. */
export async function listMembers(petId: string): Promise<Member[]> {
  const rows = check(
    await supabase.from('pet_members').select('pet_id, user_id, role, created_at').eq('pet_id', petId).order('created_at', { ascending: true }),
  );
  const names = await profileNames(rows.map((r) => r.user_id));
  return rows
    .map((r) => ({ petId: r.pet_id, userId: r.user_id, role: (r.role === 'owner' ? 'owner' : 'carer') as MemberRole, name: names.get(r.user_id) ?? '' }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1));
}

/** Anzeigenamen zu Personen-IDs (RLS: eigenes Profil und Mitbetreuer). */
export async function profileNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = check(await supabase.from('profiles').select('id, display_name').in('id', ids));
  return new Map(rows.map((r) => [r.id, r.display_name ?? '']));
}

/** Mitbetreuer entfernen oder selbst gehen. Wirft, wenn RLS nichts gelöscht hat. */
export async function removeMember(petId: string, userId: string): Promise<void> {
  const rows = check(await supabase.from('pet_members').delete().eq('pet_id', petId).eq('user_id', userId).select('user_id'));
  if (rows.length === 0) throw new ApiError({ message: 'Nichts gelöscht', code: '42501' });
}

export interface OpenInvite {
  id: string;
  expires_at: string;
}

/** Offene Einladungen eines Tieres (nur für den Besitzer lesbar). Der Code wird bewusst nicht geladen. */
export async function listOpenInvites(petId: string): Promise<OpenInvite[]> {
  const rows = check(
    await supabase
      .from('pet_invites')
      .select('id, expires_at, accepted_at')
      .eq('pet_id', petId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true }),
  );
  // Zusätzlich hier prüfen, falls die Geräte-Uhr und der Server leicht abweichen.
  return rows.filter((r) => isOpenInvite(r)).map(({ id, expires_at }) => ({ id, expires_at }));
}

/** Neue Einladung; Code und Ablauf (7 Tage) setzt die Datenbank. */
export async function createInvite(petId: string): Promise<{ token: string; expires_at: string }> {
  return check(await supabase.from('pet_invites').insert({ pet_id: petId }).select('token, expires_at').single());
}

export async function revokeInvite(id: string): Promise<void> {
  checkOk(await supabase.from('pet_invites').delete().eq('id', id));
}

export interface InvitePreview {
  pet_name: string;
  species: string;
  species_other: string | null;
  inviter_name: string | null;
  status: string;
}

/** Vorschau einer Einladung; null, wenn es den Code nicht gibt. */
export async function invitePreview(token: string): Promise<InvitePreview | null> {
  const rows = check(await supabase.rpc('invite_preview', { p_token: token }));
  return rows[0] ?? null;
}

/** Einladung annehmen; liefert die ID des Tieres. Fehler: ApiError mit message invite_* */
export async function acceptInvite(token: string): Promise<string> {
  return check(await supabase.rpc('accept_pet_invite', { p_token: token }));
}
