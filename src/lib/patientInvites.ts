// Patient aufnehmen und einladen (Etappe P4): Die Praxis legt Tier und Halter:in an; die Halter:in willigt ein und übernimmt.
// Bis zur Einwilligung gibt es nur die Einladung mit Stammdaten – kein Tier in der Akte, keine Gesundheitseinträge.
import { supabase } from './supabase';
import type { MessageKey } from '../i18n';
import { isSpecies } from './domain';
import { isIsoDate, parseKg } from './record';
import { isEmail } from './staff';

// ---------- Eingabe ----------

export interface IntakeForm {
  ownerName: string; email: string; phone: string;
  petName: string; species: string; speciesOther: string; sex: string; breed: string; birthDate: string; chipNo: string; kg: string;
}
export const EMPTY_INTAKE: IntakeForm = { ownerName: '', email: '', phone: '', petName: '', species: 'dog', speciesOther: '', sex: '', breed: '', birthDate: '', chipNo: '', kg: '' };

export function intakeErrors(v: IntakeForm, today: string): Partial<Record<keyof IntakeForm, MessageKey>> {
  const e: Partial<Record<keyof IntakeForm, MessageKey>> = {};
  if (!v.ownerName.trim()) e.ownerName = 'piErrOwner';
  if (!isEmail(v.email)) e.email = 'piErrEmail';
  if (!v.petName.trim()) e.petName = 'piErrPet';
  if (!isSpecies(v.species)) e.species = 'piErrSpecies';
  else if (v.species === 'other' && !v.speciesOther.trim()) e.speciesOther = 'piErrSpecies';
  if (v.birthDate && (!isIsoDate(v.birthDate) || v.birthDate > today)) e.birthDate = v.birthDate > today ? 'errFuture' : 'errDate';
  if (v.kg.trim()) {
    const kg = parseKg(v.kg);
    if (!kg.ok) e.kg = kg.error === 'range' ? 'wkErrRange' : kg.error === 'decimals' ? 'wkErrDecimals' : 'wkErrFormat';
  }
  return e;
}

export function intakePayload(v: IntakeForm): { owner: Record<string, string>; pet: Record<string, string | number | null> } {
  const s = (x: string) => x.trim() || null;
  const kg = v.kg.trim() ? parseKg(v.kg) : null;
  return {
    owner: { name: v.ownerName.trim(), email: v.email.trim().toLowerCase(), phone: v.phone.trim() },
    pet: {
      name: v.petName.trim(), species: v.species, species_other: v.species === 'other' ? s(v.speciesOther) : null, sex: v.sex || null,
      breed: s(v.breed), birth_date: v.birthDate || null, chip_no: s(v.chipNo), kg: kg?.ok ? kg.kg : null,
    },
  };
}

/** Code-Eingabe vereinheitlichen: „pc 7kq3 m9xz“ → „PC-7KQ3-M9XZ“ */
export function normalizeInviteCode(v: string): string {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^PC[A-Z0-9]{8}$/.test(c) ? `PC-${c.slice(2, 6)}-${c.slice(6, 10)}` : v.trim().toUpperCase();
}
export const isInviteCode = (v: string) => /^PC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(normalizeInviteCode(v));

// ---------- Fehler ----------

const ERROR_KEYS: Record<string, MessageKey> = {
  invite_exists: 'piErrExists', mail_failed: 'piErrMail', too_many_requests: 'piErrTooMany', too_soon: 'piErrTooSoon', too_many_attempts: 'piErrAttempts', invite_not_found: 'piErrGone',
  consent_required: 'piErrConsent', forbidden: 'pe_forbidden', practice_pending: 'pe_forbidden', practice_suspended: 'pe_forbidden',
  email_invalid: 'piErrEmail', name_invalid: 'piErrOwner', pet_name_invalid: 'piErrPet', species_invalid: 'piErrSpecies', kg_invalid: 'wkErrRange', date_invalid: 'errDate',
};
const CODES = Object.keys(ERROR_KEYS).sort((a, b) => b.length - a.length);
export function inviteErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Praxis ----------

export interface CreatedInvite { id: string; code: string; email: string; pet_name: string; expires_at: string }
export interface InviteResult { invite: CreatedInvite; mailed: boolean }

async function invoke(body: Record<string, unknown>): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke('patient-invite', { body });
  if (!error) return data as InviteResult;
  let code: string | null = null;
  try {
    const j = (await (error as { context?: Response }).context?.json()) as { error?: unknown } | undefined;
    if (typeof j?.error === 'string') code = j.error;
  } catch {
    code = null;
  }
  throw new Error(code ?? 'db_error');
}

export const createPatientInvite = (v: IntakeForm, lang: string) => invoke({ action: 'create', ...intakePayload(v), lang });
export const resendPatientInvite = (id: string, lang: string) => invoke({ action: 'resend', id, lang });

export async function revokePatientInvite(id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_revoke_patient_invite', { p_id: id });
  if (error) throw error;
}

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export interface PracticeInviteRow {
  id: string; owner_name: string; email: string; pet_name: string; species: string; species_other: string | null; status: InviteStatus; code: string | null;
  created_at: string; expires_at: string; answered_at: string | null; pet_id: string | null; by_name: string;
}
export const INVITE_STATUS_LABEL: Record<InviteStatus, MessageKey> = { pending: 'piStPending', accepted: 'piStAccepted', declined: 'piStDeclined', expired: 'piStExpired' };

export async function practicePatientInvites(): Promise<PracticeInviteRow[]> {
  const { data, error } = await supabase.rpc('practice_patient_invites');
  if (error) throw error;
  return (data ?? []) as unknown as PracticeInviteRow[];
}

// ---------- Halter:in ----------

export interface OwnerInvite {
  id: string; practice_name: string; city: string | null; owner_name: string; created_at: string; expires_at: string;
  pet: { name: string; species: string; species_other: string | null; breed: string | null; sex: string | null; birth_date: string | null; chip_no: string | null };
}

export async function ownerPatientInvites(): Promise<OwnerInvite[]> {
  const { data, error } = await supabase.rpc('owner_patient_invites');
  if (error) throw error;
  return (data ?? []) as unknown as OwnerInvite[];
}

/** null = Code unbekannt, abgelaufen oder schon beantwortet */
export async function patientInviteByCode(code: string): Promise<OwnerInvite | null> {
  const { data, error } = await supabase.rpc('owner_patient_invite_by_code', { p_code: normalizeInviteCode(code) });
  if (error) throw error;
  return ((data ?? []) as unknown as OwnerInvite[])[0] ?? null;
}

/** Annehmen (mit Einwilligung) liefert die ID des neuen Tieres, Ablehnen null */
export async function answerPatientInvite(id: string, accept: boolean, consent: boolean, code?: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('owner_answer_patient_invite', { p_id: id, p_accept: accept, p_consent: consent, ...(code ? { p_code: normalizeInviteCode(code) } : {}) });
  if (error) throw error;
  return (data as string | null) ?? null;
}
