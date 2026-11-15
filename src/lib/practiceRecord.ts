// Patientenakte der Praxis (Etappe P3): Lesen, Eintragen, Korrigieren und Stornieren über Funktionen der Datenbank.
// Einträge werden nie endgültig gelöscht; jede Korrektur und jedes Storno braucht einen Grund.
import { supabase } from './supabase';
import type { Json } from './database.types';
import type { MessageKey } from '../i18n';
import type { StaffRole } from './practiceAccount';
import type { PatientDetail } from './practiceAccess';
import { addDays } from './schedule';
import { isIsoDate, parseKg } from './record';

// ---------- Daten ----------

export type EntryKind = 'vaccination' | 'finding' | 'medication' | 'weight';

interface Origin {
  /** Eintrag dieser Praxis (nur dann korrigier- und stornierbar) */
  mine: boolean;
  entry_id: string | null;
  by_name: string | null;
  practice_name: string | null;
  entered_at: string | null;
  changed: boolean;
}

export interface RecVaccination extends Origin {
  id: string; name: string; given_on: string | null; valid_until: string | null; source: 'owner' | 'practice'; created_at: string; confirmed: boolean;
}
export interface RecWeight { id: string; entry_id: string | null; kg: number; measured_on: string; mine: boolean; by_name: string | null; changed: boolean }
export interface RecMedication extends Origin {
  id: string; name: string; source: 'owner' | 'practice'; dosage_text: string | null; amount: number; unit: string; frequency: string; times: string[];
  intake_hint: string; note: string | null; reason: string | null; starts_on: string; ends_on: string | null; stopped_on: string | null;
}
export interface RecFinding { id: string; date: string; title: string; text: string; mine: boolean; by_name: string; practice_name: string; entered_at: string; changed: boolean }
export interface RecVoided {
  id: string; kind: EntryKind; data: Record<string, string | number | null>; confirmed: boolean; voided_at: string; voided_by_name: string | null; reason: Reason; note: string | null;
}
export type RecHistory = Partial<Record<'origin' | 'with_since' | 'neutered' | 'housing' | 'past_illness' | 'surgeries' | 'chronic' | 'allergies' | 'past_medication' | 'travel' | 'previous_practice' | 'other' | 'updated_at', string | null>>;

export interface PatientRecord {
  role: StaffRole;
  practice_name: string;
  pet: PatientDetail;
  master_changed: boolean;
  vaccinations: RecVaccination[];
  weights: RecWeight[];
  medications: RecMedication[];
  findings: RecFinding[];
  voided: RecVoided[];
  history: RecHistory | null;
  history_note: { text: string; by_name: string; at: string } | null;
}

export interface LogRow {
  action: 'create' | 'confirm' | 'correct' | 'end' | 'void' | 'restore';
  reason: Reason | null; note: string | null;
  before: Record<string, string | number | null> | null; after: Record<string, string | number | null> | null;
  actor_name: string; created_at: string;
}

// ---------- Gründe und Rechte ----------

export const REASONS = ['typo', 'wrong_pet', 'wrong_date', 'wrong_content', 'duplicate', 'other'] as const;
export type Reason = (typeof REASONS)[number];
export const REASON_LABEL: Record<Reason, MessageKey> = {
  typo: 'rcReasonTypo', wrong_pet: 'rcReasonPet', wrong_date: 'rcReasonDate', wrong_content: 'rcReasonContent', duplicate: 'rcReasonDup', other: 'rcReasonOther',
};
export const NOTE_MAX = 300;

/** Grund gewählt; bei „Sonstiges“ ist die Bemerkung Pflicht */
export function reasonError(reason: Reason | '', note: string): MessageKey | null {
  if (!reason) return 'rcErrReason';
  if (reason === 'other' && !note.trim()) return 'rcErrNote';
  return null;
}

/** Leitung und Tierärzt:innen dürfen alles; das Team: Gewicht, Stammdaten, Impfungen der Halter:in bestätigen */
export const isClinical = (role: StaffRole | null | undefined) => role === 'lead' || role === 'vet';
export const canWrite = (role: StaffRole | null | undefined, kind: EntryKind) => (kind === 'weight' ? !!role : isClinical(role));

// ---------- Impfstoffe ----------

/** Übliche Impfungen je Tierart (wie im Prototyp); andere Namen als Freitext */
export const VACCINES: Record<string, readonly string[]> = {
  dog: ['Tollwut', 'SHPPi', 'L4'],
  cat: ['RCP', 'Tollwut'],
  rabbit: ['RHD', 'Myxomatose'],
  horse: ['Tetanus', 'Influenza', 'Herpes'],
};
export const vaccinesFor = (species: string | null | undefined): readonly string[] => VACCINES[species ?? ''] ?? [];
export const VALIDITY_YEARS = [1, 3] as const;

/** „gültig bis“ = Impfdatum + n Jahre (29. Februar → 28. Februar) */
export function validUntil(givenOn: string, years: number): string {
  const [y, m, d] = givenOn.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}
/** Tollwut ist für Reisen in der EU Pflicht */
export const isRabies = (name: string) => /tollwut|rabies|rage|rabia/i.test(name);

export type VaccFilter = 'all' | 'ours' | 'owner';

/**
 * Liste nach Filter. In „Alle“ werden doppelte Einträge (gleiche Impfung, gleicher Tag) zusammengefasst –
 * der Eintrag der Praxis gewinnt gegen den der Halter:in.
 */
export function filterVaccinations(rows: readonly RecVaccination[], filter: VaccFilter): RecVaccination[] {
  if (filter === 'ours') return rows.filter((r) => r.mine);
  if (filter === 'owner') return rows.filter((r) => r.source === 'owner');
  const best = new Map<string, RecVaccination>();
  for (const r of rows) {
    const key = r.given_on ? `${r.name.trim().toLowerCase()}|${r.given_on}` : `id:${r.id}`;
    const cur = best.get(key);
    if (!cur || (cur.source === 'owner' && r.source === 'practice')) best.set(key, r);
  }
  const keep = new Set([...best.values()].map((r) => r.id));
  return rows.filter((r) => keep.has(r.id));
}

// ---------- Eingaben prüfen ----------

export interface VaccInput { name: string; given_on: string; valid_until: string }
export function vaccErrors(v: VaccInput, today: string): Partial<Record<keyof VaccInput, MessageKey>> {
  const e: Partial<Record<keyof VaccInput, MessageKey>> = {};
  if (!v.name.trim()) e.name = 'rcErrVaccName';
  if (!v.given_on) e.given_on = 'errDateRequired';
  else if (!isIsoDate(v.given_on)) e.given_on = 'errDate';
  else if (v.given_on > today) e.given_on = 'errFuture';
  if (v.valid_until && (!isIsoDate(v.valid_until) || (isIsoDate(v.given_on) && v.valid_until < v.given_on))) e.valid_until = 'rcErrValidUntil';
  return e;
}

export interface FindingInput { date: string; title: string; text: string }
export function findingErrors(v: FindingInput, today: string): Partial<Record<keyof FindingInput, MessageKey>> {
  const e: Partial<Record<keyof FindingInput, MessageKey>> = {};
  if (!v.title.trim()) e.title = 'rcErrTitle';
  if (!v.date) e.date = 'errDateRequired';
  else if (!isIsoDate(v.date)) e.date = 'errDate';
  else if (v.date > today) e.date = 'errFuture';
  return e;
}

export interface MedInput { name: string; dosage: string; reason: string; starts_on: string; ends_on: string }
export function medErrors(v: MedInput): Partial<Record<keyof MedInput, MessageKey>> {
  const e: Partial<Record<keyof MedInput, MessageKey>> = {};
  if (!v.name.trim()) e.name = 'rcErrMedName';
  if (!v.dosage.trim()) e.dosage = 'rcErrDosage';
  if (!v.starts_on || !isIsoDate(v.starts_on)) e.starts_on = 'errDate';
  if (v.ends_on && (!isIsoDate(v.ends_on) || (isIsoDate(v.starts_on) && v.ends_on < v.starts_on))) e.ends_on = 'rcErrEnds';
  return e;
}

// ---------- Zeitleiste ----------

export interface TimelineItem { key: string; kind: EntryKind; date: string; title: string; detail: string }

/** Die letzten Ereignisse (neueste zuerst): Impfungen, Befunde, Medikamente (Beginn) und Gewichte */
export function recordTimeline(r: Pick<PatientRecord, 'vaccinations' | 'findings' | 'medications' | 'weights'>, kgText: (kg: number) => string, limit = 12): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const v of r.vaccinations) if (v.given_on) out.push({ key: `v-${v.id}`, kind: 'vaccination', date: v.given_on, title: v.name, detail: '' });
  for (const f of r.findings) out.push({ key: `f-${f.id}`, kind: 'finding', date: f.date, title: f.title, detail: '' });
  for (const m of r.medications) out.push({ key: `m-${m.id}`, kind: 'medication', date: m.starts_on, title: m.name, detail: m.dosage_text ?? '' });
  for (const w of r.weights) out.push({ key: `w-${w.id}`, kind: 'weight', date: w.measured_on, title: kgText(Number(w.kg)), detail: '' });
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key)).slice(0, limit);
}

/** Tag vor heute (Ende beim „Beenden“) – nur für die Anzeige */
export const yesterday = (today: string) => addDays(today, -1);

// ---------- Fehler ----------

const ERROR_KEYS: Record<string, MessageKey> = {
  patient_not_found: 'ptNotFound', forbidden: 'pe_forbidden', practice_pending: 'pe_forbidden', practice_suspended: 'pe_forbidden',
  no_change: 'rcErrNoChange', entry_gone: 'rcErrGone', entry_voided: 'rcErrGone', entry_not_found: 'rcErrGone', already_confirmed: 'rcErrConfirmed',
  already_ended: 'rcErrEnded', no_vaccinations: 'cfErrNone', reason_required: 'rcErrReason', note_required: 'rcErrNote', date_invalid: 'errDate', valid_until_invalid: 'rcErrValidUntil',
  ends_before_start: 'rcErrEnds', kg_invalid: 'wkErrRange', name_invalid: 'rcErrName', title_invalid: 'rcErrTitle', dosage_invalid: 'rcErrDosage',
};
const CODES = Object.keys(ERROR_KEYS);

export function recordErrorKey(e: unknown): MessageKey {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = CODES.find((c) => msg.includes(c));
  return code ? ERROR_KEYS[code]! : 'pe_generic';
}

// ---------- Datenbank ----------

export async function practiceRecord(petId: string): Promise<PatientRecord> {
  const { data, error } = await supabase.rpc('practice_record', { p_pet: petId });
  if (error) throw error;
  return data as unknown as PatientRecord;
}

export async function addEntry(petId: string, kind: EntryKind, data: Record<string, string | number | null>): Promise<string> {
  const { data: id, error } = await supabase.rpc('practice_add_entry', { p_pet: petId, p_kind: kind, p_data: data as Json });
  if (error) throw error;
  return id as string;
}

export async function confirmVaccination(petId: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('practice_confirm_vaccination', { p_pet: petId, p_id: id });
  if (error) throw error;
}

export async function correctEntry(entryId: string, data: Record<string, string | number | null>, reason: Reason, note: string): Promise<void> {
  const { error } = await supabase.rpc('practice_correct_entry', { p_entry: entryId, p_data: data as Json, p_reason: reason, p_note: note.trim() });
  if (error) throw error;
}

export async function endMedication(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('practice_end_medication', { p_entry: entryId });
  if (error) throw error;
}

export async function voidEntry(entryId: string, reason: Reason, note: string): Promise<void> {
  const { error } = await supabase.rpc('practice_void_entry', { p_entry: entryId, p_reason: reason, p_note: note.trim() });
  if (error) throw error;
}

export async function restoreEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('practice_restore_entry', { p_entry: entryId });
  if (error) throw error;
}

export interface MasterInput { name: string; breed: string; sex: string; birth_date: string; chip_no: string; allergies: string }

export async function updateMaster(petId: string, v: MasterInput, reason: Reason, note: string): Promise<void> {
  const { error } = await supabase.rpc('practice_update_master', { p_pet: petId, p_data: v as unknown as Json, p_reason: reason, p_note: note.trim() });
  if (error) throw error;
}

export async function setHistoryNote(petId: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('practice_set_history_note', { p_pet: petId, p_text: text });
  if (error) throw error;
}

export async function entryLog(petId: string, entryId: string | null): Promise<LogRow[]> {
  const { data, error } = await supabase.rpc('practice_entry_log', entryId ? { p_pet: petId, p_entry: entryId } : { p_pet: petId });
  if (error) throw error;
  return (data ?? []) as unknown as LogRow[];
}

// ---------- Halter:in ----------

export interface OwnerFinding { id: string; date: string; title: string; text: string; practice_name: string; by_name: string; entered_at: string }
export interface PetPracticeEntries {
  findings: OwnerFinding[];
  history_notes: { text: string; practice_name: string; at: string }[];
  /** Zeilen-ID (Impfung, Medikament, Gewicht) → Name der Praxis */
  sources: Record<string, string>;
}
export const NO_PRACTICE_ENTRIES: PetPracticeEntries = { findings: [], history_notes: [], sources: {} };

export async function petPracticeEntries(petId: string): Promise<PetPracticeEntries> {
  const { data, error } = await supabase.rpc('pet_practice_entries', { p_pet: petId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<PetPracticeEntries>;
  return { findings: d.findings ?? [], history_notes: d.history_notes ?? [], sources: d.sources ?? {} };
}

// ---------- Formulare (Eintragen und Korrigieren teilen sich Felder und Prüfung) ----------

export type FormValues = Record<string, string>;

export const EMPTY_FORM: Record<EntryKind, (today: string) => FormValues> = {
  vaccination: (today) => ({ name: '', given_on: today, valid_until: '' }),
  finding: (today) => ({ date: today, title: '', text: '' }),
  medication: (today) => ({ name: '', dosage: '', reason: '', starts_on: today, ends_on: '' }),
  weight: (today) => ({ kg: '', measured_on: today }),
};

const KG_KEYS: Record<string, MessageKey> = { required: 'wkErrRequired', format: 'wkErrFormat', decimals: 'wkErrDecimals', range: 'wkErrRange' };

export function entryErrors(kind: EntryKind, v: FormValues, today: string): Record<string, MessageKey> {
  if (kind === 'vaccination') return vaccErrors({ name: v.name ?? '', given_on: v.given_on ?? '', valid_until: v.valid_until ?? '' }, today);
  if (kind === 'finding') return findingErrors({ date: v.date ?? '', title: v.title ?? '', text: v.text ?? '' }, today);
  if (kind === 'medication') return medErrors({ name: v.name ?? '', dosage: v.dosage ?? '', reason: v.reason ?? '', starts_on: v.starts_on ?? '', ends_on: v.ends_on ?? '' });
  const e: Record<string, MessageKey> = {};
  const kg = parseKg(v.kg ?? '');
  if (!kg.ok) e.kg = KG_KEYS[kg.error]!;
  if (!v.measured_on) e.measured_on = 'errDateRequired';
  else if (!isIsoDate(v.measured_on)) e.measured_on = 'errDate';
  else if (v.measured_on > today) e.measured_on = 'errFuture';
  return e;
}

/** Formularwerte → Daten für die Datenbank (leere Texte als null) */
export function entryData(kind: EntryKind, v: FormValues): Record<string, string | number | null> {
  const s = (k: string) => (v[k] ?? '').trim();
  const n = (k: string) => s(k) || null;
  if (kind === 'vaccination') return { name: s('name'), given_on: s('given_on'), valid_until: n('valid_until') };
  if (kind === 'finding') return { date: s('date'), title: s('title'), text: s('text') };
  if (kind === 'medication') return { name: s('name'), dosage: s('dosage'), reason: n('reason'), starts_on: s('starts_on'), ends_on: n('ends_on') };
  const kg = parseKg(v.kg ?? '');
  return { kg: kg.ok ? kg.kg : null, measured_on: s('measured_on') };
}

/** Gespeicherter Eintrag → Formularwerte (zum Korrigieren) */
export function entryForm(kind: EntryKind, d: Record<string, string | number | null | undefined>, kgText: (kg: number) => string): FormValues {
  const out = EMPTY_FORM[kind]('');
  for (const k of Object.keys(out)) {
    const x = d[k];
    out[k] = x === null || x === undefined ? '' : k === 'kg' ? kgText(Number(x)) : String(x);
  }
  return out;
}

// ---------- Digitaler Impfnachweis (Etappe P3b) ----------

export interface CertVaccination { id: string; name: string; given_on: string | null; valid_until: string | null; practice_name?: string | null; by_name?: string | null }
export interface CertIssue { practice_name: string; city: string | null; by_name: string; at: string; mine: boolean }
export interface VaccinationCertificateData {
  pet: { name: string; species: string | null; species_other: string | null; breed: string | null; sex: string | null; birth_date: string | null; chip_no: string | null };
  owner_name: string | null;
  /** je Praxis die letzte Ausstellung, neueste zuerst */
  issued: CertIssue[];
  /** von einer Praxis eingetragen oder bestätigt */
  confirmed: CertVaccination[];
  /** eigene Einträge der Halter:in (nicht bestätigt) */
  own: CertVaccination[];
}

export async function vaccinationCertificate(petId: string): Promise<VaccinationCertificateData> {
  const { data, error } = await supabase.rpc('pet_vaccination_certificate', { p_pet: petId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<VaccinationCertificateData>;
  if (!d.pet) throw new Error('patient_not_found');
  return { pet: d.pet, owner_name: d.owner_name ?? null, issued: d.issued ?? [], confirmed: d.confirmed ?? [], own: d.own ?? [] };
}

export async function issueCertificate(petId: string): Promise<void> {
  const { error } = await supabase.rpc('practice_issue_certificate', { p_pet: petId });
  if (error) throw error;
}
