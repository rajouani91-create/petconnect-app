// Datenzugriff. owner_id wird nie mitgeschickt – die Datenbank setzt ihn, RLS schützt die Zeilen.
import type { PostgrestError } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import type { Database } from './database.types';
import { docExt, type DocCategory, type DocMime } from './record';
import type { ApptKind, ApptStatus, RemKind } from './schedule';
import { supabase, type PetRow, type ProfileRow, type RoutineRow } from './supabase';
import { isGrantRole, isOpenInvite, parsePreview, toRole, type GrantRole, type InvitePreview, type MemberRole, type Membership } from './sharing';
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

// ---------- Familie & Mithalter:innen ----------

export interface Member {
  petId: string;
  userId: string;
  role: MemberRole;
  name: string;
}

/** Betreuer der Tiere `petIds` (RLS: nur Tiere, die man selbst betreut). Ohne Namen. */
export async function listMemberships(petIds: readonly string[]): Promise<Membership[]> {
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
    .map((r) => ({ petId: r.pet_id, userId: r.user_id, role: toRole(r.role), name: names.get(r.user_id) ?? '' }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
}

/** Anzeigenamen zu Personen-IDs (RLS: eigenes Profil und Mitbetreuer). */
export async function profileNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = check(await supabase.from('profiles').select('id, display_name').in('id', ids));
  return new Map(rows.map((r) => [r.id, r.display_name ?? '']));
}

/** Person bei den Tieren `petIds` entfernen oder selbst gehen. Wirft, wenn RLS nichts gelöscht hat. */
export async function removeMember(petIds: readonly string[], userId: string): Promise<void> {
  if (petIds.length === 0) return;
  const rows = check(await supabase.from('pet_members').delete().in('pet_id', [...petIds]).eq('user_id', userId).select('user_id'));
  if (rows.length === 0) throw new ApiError({ message: 'Nichts gelöscht', code: '42501' });
}

/** Rechte-Stufe einer Person für alle angegebenen Tiere ändern (nur Besitzer). */
export async function setMemberRole(petIds: readonly string[], userId: string, role: GrantRole): Promise<void> {
  if (petIds.length === 0) return;
  const rows = check(
    await supabase.from('pet_members').update({ role }).in('pet_id', [...petIds]).eq('user_id', userId).select('user_id'),
  );
  if (rows.length === 0) throw new ApiError({ message: 'Nichts geändert', code: '42501' });
}

export interface OpenInvite {
  id: string;
  invitee_name: string;
  role: GrantRole;
  expires_at: string;
  /** nur für „Link teilen“; nie protokollieren */
  token: string;
  petIds: string[];
}

/** Offene Einladungen, die ich erstellt habe (RLS: nur die einladende Person). */
export async function listOpenInvites(): Promise<OpenInvite[]> {
  const rows = check(
    await supabase
      .from('pet_invites')
      .select('id, invitee_name, role, token, expires_at, accepted_at, pet_invite_pets(pet_id)')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true }),
  );
  // Zusätzlich hier prüfen, falls die Geräte-Uhr und der Server leicht abweichen.
  return rows.filter((r) => isOpenInvite(r)).map((r) => ({
    id: r.id,
    invitee_name: r.invitee_name,
    role: isGrantRole(r.role) ? r.role : 'viewer',
    expires_at: r.expires_at,
    token: r.token,
    petIds: r.pet_invite_pets.map((p) => p.pet_id),
  }));
}

/** Neue Einladung; Code und Ablauf (7 Tage) setzt die Datenbank. Fehler: ApiError mit message invite_* */
export async function createInvite(name: string, role: GrantRole, petIds: readonly string[]): Promise<{ id: string; token: string; expires_at: string }> {
  const rows = check(await supabase.rpc('create_pet_invite', { p_name: name.trim(), p_role: role, p_pet_ids: [...petIds] }));
  const row = rows[0];
  if (!row) throw new ApiError({ message: 'Keine Daten erhalten' });
  return row;
}

export async function revokeInvite(id: string): Promise<void> {
  checkOk(await supabase.from('pet_invites').delete().eq('id', id));
}

/** Vorschau einer Einladung; null, wenn es den Code nicht gibt. */
export async function invitePreview(token: string): Promise<InvitePreview | null> {
  const res = await supabase.rpc('invite_preview', { p_token: token });
  if (res.error) throw new ApiError(res.error);
  return parsePreview(res.data);
}

/** Einladung annehmen; liefert die IDs der Tiere. Fehler: ApiError mit message invite_* */
export async function acceptInvite(token: string): Promise<string[]> {
  return check(await supabase.rpc('accept_pet_invite', { p_token: token }));
}

// ---------- Tierfoto (Storage-Bucket pet-photos, Pfad <pet_id>/<datei>) ----------

const PHOTO_BUCKET = 'pet-photos';

/** Foto hochladen, `photo_path` setzen, altes Foto löschen. Liefert das aktualisierte Tier. */
export async function replacePetPhoto(pet: PetRow, jpeg: Blob): Promise<PetRow> {
  const path = `${pet.id}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new ApiError({ message: up.error.message, code: 'storage' });
  let updated: PetRow;
  try {
    updated = check(await supabase.from('pets').update({ photo_path: path }).eq('id', pet.id).select('*').single());
  } catch (e) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw e;
  }
  if (pet.photo_path && pet.photo_path !== path) await removePhotoFile(pet.photo_path);
  return updated;
}

/** Foto entfernen: Feld leeren, dann Datei löschen. */
export async function clearPetPhoto(pet: PetRow): Promise<PetRow> {
  const updated = check<PetRow>(await supabase.from('pets').update({ photo_path: null }).eq('id', pet.id).select('*').single());
  if (pet.photo_path) await removePhotoFile(pet.photo_path);
  return updated;
}

/** Datei im Speicher löschen; Fehler nur protokollieren (verwaiste Datei ist kein Datenverlust). */
export async function removePhotoFile(path: string): Promise<void> {
  const res = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (res.error) console.error('Foto konnte nicht gelöscht werden', res.error.message);
}

export async function signedPhotoUrl(path: string, seconds: number): Promise<string> {
  const res = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, seconds);
  if (res.error || !res.data) throw new ApiError({ message: res.error?.message ?? 'Keine Daten erhalten', code: 'storage' });
  return res.data.signedUrl;
}

// ---------- Tierakte: Gewicht ----------

export type WeightRow = Database['public']['Tables']['weights']['Row'];
export type VaccinationRow = Database['public']['Tables']['vaccinations']['Row'];
export type DocumentRow = Database['public']['Tables']['pet_documents']['Row'];

/** Schreibvorgang, der Zeilen zurückgibt: keine Zeile = RLS hat abgelehnt → Rechte-Fehler */
function checkChanged<T>(res: { data: T[] | null; error: PostgrestError | null }): T {
  const rows = check(res);
  const first = rows[0];
  if (first === undefined) throw new ApiError({ message: 'Keine Berechtigung', code: '42501' });
  return first;
}

export async function listWeights(petId: string): Promise<WeightRow[]> {
  return check(
    await supabase.from('weights').select('*').eq('pet_id', petId).order('measured_on', { ascending: false }).order('created_at', { ascending: false }),
  );
}

export async function addWeight(petId: string, measuredOn: string, kg: number): Promise<WeightRow> {
  return check(await supabase.from('weights').insert({ pet_id: petId, measured_on: measuredOn, kg }).select('*').single());
}

export async function updateWeight(id: string, measuredOn: string, kg: number): Promise<WeightRow> {
  return checkChanged(await supabase.from('weights').update({ measured_on: measuredOn, kg }).eq('id', id).select('*'));
}

export async function deleteWeight(id: string): Promise<void> {
  checkChanged(await supabase.from('weights').delete().eq('id', id).select('id'));
}

// ---------- Tierakte: Impfungen ----------

export interface VaccinationInput {
  name: string;
  given_on: string | null;
  valid_until: string | null;
}

export async function listVaccinations(petId: string): Promise<VaccinationRow[]> {
  return check(await supabase.from('vaccinations').select('*').eq('pet_id', petId).order('created_at', { ascending: true }));
}

/** Die App legt nur eigene Einträge an (source = 'owner', Standard der Datenbank). */
export async function addVaccination(petId: string, v: VaccinationInput): Promise<VaccinationRow> {
  return check(await supabase.from('vaccinations').insert({ pet_id: petId, ...v }).select('*').single());
}

/** Einträge der Praxis lassen sich nicht ändern (RLS); dann Rechte-Fehler. */
export async function updateVaccination(id: string, v: VaccinationInput): Promise<VaccinationRow> {
  return checkChanged(await supabase.from('vaccinations').update(v).eq('id', id).eq('source', 'owner').select('*'));
}

export async function deleteVaccination(id: string): Promise<void> {
  checkChanged(await supabase.from('vaccinations').delete().eq('id', id).eq('source', 'owner').select('id'));
}

// ---------- Tierakte: Dokumente (Bucket pet-documents, Pfad <pet_id>/<uuid>.<endung>) ----------

const DOC_BUCKET = 'pet-documents';

function storageError(err: { message: string; statusCode?: string; status?: number }): ApiError {
  const denied = err.statusCode === '403' || err.status === 403 || /row-level security|unauthorized/i.test(err.message);
  return new ApiError({ message: err.message, code: denied ? '42501' : 'storage' });
}

export async function listDocuments(petId: string): Promise<DocumentRow[]> {
  return check(await supabase.from('pet_documents').select('*').eq('pet_id', petId).order('created_at', { ascending: false }));
}

export interface DocumentInput {
  title: string;
  category: DocCategory;
  doc_date: string | null;
}

/** Erst die Datei hochladen, dann die Zeile anlegen. Scheitert die Zeile, wird die Datei wieder gelöscht. */
export async function uploadDocument(petId: string, file: Blob, mime: DocMime, meta: DocumentInput): Promise<DocumentRow> {
  const path = `${petId}/${crypto.randomUUID()}.${docExt(mime)}`;
  // Typ fest an die Datei binden: supabase-js schickt Blobs als FormData, dort zählt der Typ des Blobs, nicht contentType.
  const body = file.type === mime ? file : new Blob([file], { type: mime });
  const up = await supabase.storage.from(DOC_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (up.error) throw storageError(up.error as { message: string; statusCode?: string; status?: number });
  const res = await supabase
    .from('pet_documents')
    .insert({ pet_id: petId, storage_path: path, mime_type: mime, size_bytes: file.size, ...meta })
    .select('*')
    .single();
  if (res.error || !res.data) {
    const rm = await supabase.storage.from(DOC_BUCKET).remove([path]);
    if (rm.error) console.error('Hochgeladene Datei konnte nach einem Fehler nicht entfernt werden');
    throw new ApiError(res.error ?? { message: 'Keine Daten erhalten' });
  }
  return res.data;
}

/** Nachträglich änderbar: Titel, Kategorie, Datum */
export async function updateDocument(id: string, meta: DocumentInput): Promise<DocumentRow> {
  return checkChanged(await supabase.from('pet_documents').update(meta).eq('id', id).select('*'));
}

/**
 * Erst die Zeile löschen, dann die Datei. Scheitert nur die Datei, gilt das Löschen trotzdem als erfolgreich
 * (die Zeile ist weg); der Fehler landet ohne Pfad in der Konsole.
 */
export async function deleteDocument(doc: Pick<DocumentRow, 'id' | 'storage_path'>): Promise<void> {
  checkChanged(await supabase.from('pet_documents').delete().eq('id', doc.id).select('id'));
  try {
    const rm = await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
    if (rm.error) console.error('Dokument-Datei konnte nicht gelöscht werden');
  } catch {
    console.error('Dokument-Datei konnte nicht gelöscht werden');
  }
}

/** Signierte, kurzlebige URL zu einem Dokument (nie öffentlich) */
export async function signedDocumentUrl(path: string, seconds: number): Promise<string> {
  const res = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, seconds);
  if (res.error || !res.data) throw storageError(res.error ?? { message: 'Keine Daten erhalten' });
  return res.data.signedUrl;
}

// ---------- Termine ----------

export type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
export type ReminderRow = Database['public']['Tables']['reminders']['Row'];

export interface AppointmentInput {
  title: string;
  kind: ApptKind;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  note: string | null;
}

/** Termine aller Tiere, die ich betreue (RLS filtert) */
export async function listAppointments(petIds: readonly string[]): Promise<AppointmentRow[]> {
  if (petIds.length === 0) return [];
  return check(await supabase.from('appointments').select('*').in('pet_id', [...petIds]).order('starts_at', { ascending: true }));
}

export async function addAppointment(petId: string, v: AppointmentInput): Promise<AppointmentRow> {
  return check(await supabase.from('appointments').insert({ pet_id: petId, ...v }).select('*').single());
}

/** pet_id ist nachträglich nicht änderbar */
export async function updateAppointment(id: string, v: AppointmentInput): Promise<AppointmentRow> {
  return checkChanged(await supabase.from('appointments').update(v).eq('id', id).select('*'));
}

export async function setAppointmentStatus(id: string, status: ApptStatus): Promise<AppointmentRow> {
  return checkChanged(await supabase.from('appointments').update({ status }).eq('id', id).select('*'));
}

export async function deleteAppointment(id: string): Promise<void> {
  checkChanged(await supabase.from('appointments').delete().eq('id', id).select('id'));
}

// ---------- Erinnerungen ----------

export interface ReminderInput {
  title: string;
  kind: RemKind;
  due_on: string;
  repeat_days: number | null;
  note: string | null;
}

export async function listReminders(petIds: readonly string[]): Promise<ReminderRow[]> {
  if (petIds.length === 0) return [];
  return check(await supabase.from('reminders').select('*').in('pet_id', [...petIds]).order('due_on', { ascending: true }));
}

export async function addReminder(petId: string, v: ReminderInput): Promise<ReminderRow> {
  return check(await supabase.from('reminders').insert({ pet_id: petId, ...v }).select('*').single());
}

export async function updateReminder(id: string, v: ReminderInput): Promise<ReminderRow> {
  return checkChanged(await supabase.from('reminders').update(v).eq('id', id).select('*'));
}

export async function deleteReminder(id: string): Promise<void> {
  checkChanged(await supabase.from('reminders').delete().eq('id', id).select('id'));
}

/** Abhaken immer über die Datenbank-Funktion (rechnet die nächste Fälligkeit in einer Transaktion). */
export async function completeReminder(id: string, doneOn: string): Promise<ReminderRow> {
  return check(await supabase.rpc('complete_reminder', { p_id: id, p_done_on: doneOn }));
}

/** Impfungen mehrerer Tiere (für abgeleitete Erinnerungen) */
export async function listVaccinationsFor(petIds: readonly string[]): Promise<VaccinationRow[]> {
  if (petIds.length === 0) return [];
  return check(await supabase.from('vaccinations').select('*').in('pet_id', [...petIds]));
}
