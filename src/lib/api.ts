// Datenzugriff. owner_id wird nie mitgeschickt – die Datenbank setzt ihn, RLS schützt die Zeilen.
import type { PostgrestError } from '@supabase/supabase-js';
import type { Lang } from '../i18n';
import { supabase, type PetRow, type ProfileRow, type RoutineRow } from './supabase';
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

export async function deletePet(id: string): Promise<void> {
  checkOk(await supabase.from('pets').delete().eq('id', id));
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

/** IDs der am Tag `date` (YYYY-MM-DD, Europe/Berlin) erledigten Einträge. */
export async function listDone(itemIds: readonly string[], date: string): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const rows = check(
    await supabase.from('routine_done').select('routine_item_id').eq('done_on', date).in('routine_item_id', [...itemIds]),
  );
  return new Set(rows.map((r) => r.routine_item_id));
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
