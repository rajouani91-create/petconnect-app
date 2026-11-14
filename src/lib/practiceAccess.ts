// Etappe P2: Freigabe Tier → Praxis (Praxis-Code, Zugriffsanfrage, Widerruf) und Patientenliste der Praxis.
// Rechte prüft die Datenbank; hier stehen Aufrufe und reine Hilfsfunktionen.
import { supabase } from './supabase';

// ---------- reine Hilfsfunktionen ----------

/** Eingabe des Praxis-Codes vereinheitlichen: Großbuchstaben, Leerzeichen weg, Bindestriche ergänzen. */
export function normalizeCode(v: string): string {
  const c = v.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]{3}[2-9A-HJ-NP-Z]{6}$/.test(c) ? `${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}` : v.trim().toUpperCase();
}

export const isCode = (v: string) => /^[A-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/.test(normalizeCode(v));

export type DueState = 'overdue' | 'soon' | 'ok';

/** Fälligkeit wie im Prototyp: überfällig rot, in höchstens 14 Tagen gelb. today/due als JJJJ-MM-TT. */
export function dueState(due: string, today: string): DueState {
  if (due < today) return 'overdue';
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  return due <= d.toISOString().slice(0, 10) ? 'soon' : 'ok';
}

export interface PatientRow {
  pet_id: string;
  name: string;
  species: string | null;
  species_other: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  deceased: boolean | null;
  owner_name: string | null;
  next_vacc_name: string | null;
  next_vacc_due: string | null;
  source: 'code' | 'request';
  granted_at: string;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Suche „Name, Tierart oder Halter:in“ (Tierart als angezeigter Text, z. B. „Katze“) */
export function filterPatients<T extends Pick<PatientRow, 'name' | 'breed' | 'owner_name' | 'species_other'>>(rows: readonly T[], q: string, speciesText: (r: T) => string): T[] {
  const n = fold(q.trim());
  if (!n) return [...rows];
  return rows.filter((r) => [r.name, r.breed, r.owner_name, r.species_other, speciesText(r)].some((v) => v && fold(v).includes(n)));
}

/** Fehlercode aus einem Supabase-Fehler */
export function accessErrorCode(e: unknown): string | null {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && /^[a-z_]+$/.test(m) ? m : null;
}

// ---------- Halter:in ----------

export interface PracticeCode { code: string; expires_at: string }

export async function petPracticeCode(petId: string, renew = false): Promise<PracticeCode> {
  const { data, error } = await supabase.rpc('pet_practice_code', { p_pet: petId, p_renew: renew });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('db_error');
  return row;
}

export interface OwnerAccessRow { pet_id: string; pet_name: string; practice_id: string; practice_name: string; city: string | null; source: string; created_at: string }

export async function ownerPracticeAccess(): Promise<OwnerAccessRow[]> {
  const { data, error } = await supabase.rpc('owner_practice_access');
  if (error) throw error;
  return data ?? [];
}

export async function revokePracticeAccess(petId: string, practiceId: string): Promise<void> {
  const { error } = await supabase.rpc('owner_revoke_practice', { p_pet: petId, p_practice: practiceId });
  if (error) throw error;
}

export interface OwnerRequest { id: string; practice_name: string; city: string | null; note: string | null; created_at: string }

export async function ownerAccessRequests(): Promise<OwnerRequest[]> {
  const { data, error } = await supabase.rpc('owner_access_requests');
  if (error) throw error;
  return data ?? [];
}

export async function answerAccessRequest(id: string, accept: boolean, petIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('owner_answer_request', { p_id: id, p_accept: accept, p_pets: petIds });
  if (error) throw error;
  return data ?? 0;
}

// ---------- Praxis ----------

/** Liefert die Tier-ID oder null (Code unbekannt oder abgelaufen) */
export async function redeemPracticeCode(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('practice_redeem_code', { p_code: normalizeCode(code) });
  if (error) throw error;
  return data ?? null;
}

export async function requestAccess(email: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('practice_request_access', { p_email: email.trim(), p_note: note.trim() });
  if (error) throw error;
}

export interface PracticeRequestRow { id: string; email: string; note: string | null; status: 'pending' | 'accepted' | 'declined'; pets_granted: number; created_at: string; expires_at: string; answered_at: string | null }

export async function practiceRequests(): Promise<PracticeRequestRow[]> {
  const { data, error } = await supabase.rpc('practice_requests');
  if (error) throw error;
  return (data ?? []) as PracticeRequestRow[];
}

export async function practicePatients(): Promise<PatientRow[]> {
  const { data, error } = await supabase.rpc('practice_patients');
  if (error) throw error;
  return (data ?? []) as PatientRow[];
}

export interface PatientDetail {
  id: string; name: string; species: string | null; species_other: string | null; breed: string | null; sex: string | null;
  birth_date: string | null; chip_no: string | null; allergies: string | null; deceased: boolean | null;
  owner_name: string | null; owner_phone: string | null; weight: { kg: number; measured_on: string } | null;
  source: 'code' | 'request'; granted_at: string;
}

export async function practicePatient(petId: string): Promise<PatientDetail> {
  const { data, error } = await supabase.rpc('practice_patient', { p_pet: petId });
  if (error) throw error;
  return data as unknown as PatientDetail;
}
