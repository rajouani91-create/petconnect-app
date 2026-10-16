// Reine Prüf- und Umwandlungsfunktionen für Formulare (ohne UI).
import type { MessageKey, Vars } from '../i18n';
import { isSpecies, type Kind, type Repeat, type Sex, type Species } from './domain';
import type { PetInsert, PetRow } from './supabase';

export interface FieldError {
  readonly key: MessageKey;
  readonly vars?: Vars;
}
export type Errors<F extends string> = Partial<Record<F, FieldError>>;

export const PASSWORD_MIN = 8;
export const PET_NAME_MAX = 60;
export const SPECIES_OTHER_MAX = 40;
export const LABEL_MAX = 40;
export const DISPLAY_NAME_MAX = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailError(email: string): FieldError | undefined {
  const v = email.trim();
  if (!v) return { key: 'err_required' };
  if (!EMAIL_RE.test(v)) return { key: 'err_email' };
  return undefined;
}

export function passwordError(pw: string): FieldError | undefined {
  if (!pw) return { key: 'err_required' };
  if (pw.length < PASSWORD_MIN) return { key: 'err_pw' };
  return undefined;
}

export function requiredMax(value: string, max: number): FieldError | undefined {
  const v = value.trim();
  if (!v) return { key: 'err_required' };
  if (v.length > max) return { key: 'err_max', vars: { n: max } };
  return undefined;
}

export function hasErrors<F extends string>(errors: Errors<F>): boolean {
  return Object.values(errors).some(Boolean);
}

export interface PetFormValues {
  name: string;
  species: Species;
  speciesOther: string;
  breed: string;
  sex: Sex | '';
  birthDate: string;
  chipNo: string;
  catOutdoor: boolean | null;
  stable: string;
  allergies: string;
  medications: string;
  emergencyContact: string;
}

export type PetField = keyof PetFormValues;

export function emptyPetForm(): PetFormValues {
  return {
    name: '',
    species: 'dog',
    speciesOther: '',
    breed: '',
    sex: '',
    birthDate: '',
    chipNo: '',
    catOutdoor: null,
    stable: '',
    allergies: '',
    medications: '',
    emergencyContact: '',
  };
}

export function petToForm(p: PetRow): PetFormValues {
  return {
    name: p.name,
    species: isSpecies(p.species) ? p.species : 'other',
    speciesOther: p.species_other ?? '',
    breed: p.breed ?? '',
    sex: p.sex === 'female' || p.sex === 'male' ? p.sex : '',
    birthDate: p.birth_date ?? '',
    chipNo: p.chip_no ?? '',
    catOutdoor: p.cat_outdoor,
    stable: p.stable ?? '',
    allergies: p.allergies ?? '',
    medications: p.medications ?? '',
    emergencyContact: p.emergency_contact ?? '',
  };
}

/** Transpondernummer: Leerzeichen erlaubt, sonst genau 15 Ziffern (ISO 11784). */
export function normalizeChip(chip: string): string {
  return chip.replace(/\s+/g, '');
}

export function validatePet(v: PetFormValues, todayIso: string): Errors<PetField> {
  const errors: Errors<PetField> = {};
  const nameErr = requiredMax(v.name, PET_NAME_MAX);
  if (nameErr) errors.name = nameErr;
  if (v.species === 'other') {
    const e = requiredMax(v.speciesOther, SPECIES_OTHER_MAX);
    if (e) errors.speciesOther = e.key === 'err_required' ? { key: 'spOtherErr' } : e;
  }
  const chip = normalizeChip(v.chipNo);
  if (chip && !/^\d{15}$/.test(chip)) errors.chipNo = { key: 'err_chip' };
  if (v.birthDate && v.birthDate > todayIso) errors.birthDate = { key: 'err_birthFuture' };
  return errors;
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** Formular → Datenbank-Zeile. owner_id setzt die Datenbank selbst. */
export function petFormToRow(v: PetFormValues): Omit<PetInsert, 'owner_id' | 'id'> {
  return {
    name: v.name.trim(),
    species: v.species,
    species_other: v.species === 'other' ? orNull(v.speciesOther) : null,
    breed: orNull(v.breed),
    sex: v.sex || null,
    birth_date: v.birthDate || null,
    chip_no: orNull(normalizeChip(v.chipNo)),
    cat_outdoor: v.species === 'cat' ? v.catOutdoor : null,
    stable: v.species === 'horse' ? orNull(v.stable) : null,
    allergies: orNull(v.allergies),
    medications: orNull(v.medications),
    emergency_contact: orNull(v.emergencyContact),
  };
}

export interface RoutineFormValues {
  kind: Kind;
  time: string;
  repeat: Repeat;
  label: string;
}
export type RoutineField = keyof RoutineFormValues;

export function validateRoutine(v: RoutineFormValues): Errors<RoutineField> {
  const errors: Errors<RoutineField> = {};
  if (!/^\d{2}:\d{2}$/.test(v.time)) errors.time = { key: 'gpErrTime' };
  if (v.kind === 'own') {
    const e = requiredMax(v.label, LABEL_MAX);
    if (e) errors.label = e;
  } else if (v.label.trim().length > LABEL_MAX) {
    errors.label = { key: 'err_max', vars: { n: LABEL_MAX } };
  }
  return errors;
}

/**
 * Gleiche Art, Uhrzeit und Bezeichnung gibt es schon? Ergänzt den DB-Unique-Index,
 * der Einträge ohne Bezeichnung (NULL) nicht als gleich erkennt.
 */
export function isDuplicateRoutine(
  existing: readonly { kind: string; time_of_day: string; label: string | null }[],
  v: RoutineFormValues,
): boolean {
  const label = v.label.trim() || null;
  return existing.some((e) => e.kind === v.kind && e.time_of_day.slice(0, 5) === v.time && (e.label?.trim() || null) === label);
}

/** Findet eine Telefonnummer in einem Freitext, z. B. für einen tel:-Link. */
export function extractPhone(text: string): string | null {
  const m = /\+?\d[\d\s/().-]{4,}\d/.exec(text);
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, '');
  return digits.replace(/\+/g, '').length >= 6 ? digits : null;
}
