import { describe, expect, it } from 'vitest';
import { emailError, emptyPetForm, extractPhone, isDuplicateRoutine, passwordError, petFormToRow, validatePet, validateRoutine } from './validate';
import { authErrorKey } from '../auth/authErrors';

const TODAY = '2026-10-16';

describe('Registrierung', () => {
  it('E-Mail', () => {
    expect(emailError('')).toEqual({ key: 'err_required' });
    expect(emailError('abc')).toEqual({ key: 'err_email' });
    expect(emailError(' a@b.de ')).toBeUndefined();
  });
  it('Passwort mindestens 8 Zeichen', () => {
    expect(passwordError('1234567')).toEqual({ key: 'err_pw' });
    expect(passwordError('12345678')).toBeUndefined();
  });
  it('Supabase-Fehlercodes', () => {
    expect(authErrorKey('invalid_credentials')).toBe('err_login');
    expect(authErrorKey('email_not_confirmed')).toBe('err_notConfirmed');
    expect(authErrorKey(undefined)).toBe('errGeneric');
  });
});

describe('Tier', () => {
  it('Name ist Pflicht', () => {
    expect(validatePet({ ...emptyPetForm(), name: '  ' }, TODAY).name).toEqual({ key: 'err_required' });
  });
  it('„Anderes Tier“ braucht die Tierart', () => {
    const e = validatePet({ ...emptyPetForm(), name: 'Bo', species: 'other' }, TODAY);
    expect(e.speciesOther).toEqual({ key: 'spOtherErr' });
  });
  it('Transpondernummer: 15 Ziffern, Leerzeichen erlaubt', () => {
    expect(validatePet({ ...emptyPetForm(), name: 'Bo', chipNo: '123' }, TODAY).chipNo).toEqual({ key: 'err_chip' });
    expect(validatePet({ ...emptyPetForm(), name: 'Bo', chipNo: '276 0981 0012 3456' }, TODAY).chipNo).toBeUndefined();
  });
  it('Geburtsdatum nicht in der Zukunft', () => {
    expect(validatePet({ ...emptyPetForm(), name: 'Bo', birthDate: '2026-10-17' }, TODAY).birthDate).toBeDefined();
    expect(validatePet({ ...emptyPetForm(), name: 'Bo', birthDate: TODAY }, TODAY).birthDate).toBeUndefined();
  });
  it('Zeile: artfremde Felder werden geleert, kein owner_id', () => {
    const row = petFormToRow({ ...emptyPetForm(), name: ' Luna ', species: 'dog', catOutdoor: true, stable: 'Hof', speciesOther: 'x', chipNo: '' });
    expect(row).toMatchObject({ name: 'Luna', species: 'dog', cat_outdoor: null, stable: null, species_other: null, chip_no: null, sex: null });
    expect(row).not.toHaveProperty('owner_id');
  });
});

describe('Tagesplan-Eintrag', () => {
  it('Uhrzeit Pflicht, „Eigenes“ braucht Bezeichnung', () => {
    expect(validateRoutine({ kind: 'walk', time: '', repeat: 'daily', label: '' }).time).toEqual({ key: 'gpErrTime' });
    expect(validateRoutine({ kind: 'own', time: '08:00', repeat: 'daily', label: '' }).label).toEqual({ key: 'err_required' });
    expect(validateRoutine({ kind: 'own', time: '08:00', repeat: 'daily', label: 'Fell bürsten' })).toEqual({});
  });
  it('Doppelte erkennen, auch ohne Bezeichnung', () => {
    const existing = [{ kind: 'walk', time_of_day: '07:00:00', label: null }];
    expect(isDuplicateRoutine(existing, { kind: 'walk', time: '07:00', repeat: 'weekends', label: '' })).toBe(true);
    expect(isDuplicateRoutine(existing, { kind: 'walk', time: '07:00', repeat: 'daily', label: 'kurz' })).toBe(false);
    expect(isDuplicateRoutine(existing, { kind: 'feed', time: '07:00', repeat: 'daily', label: '' })).toBe(false);
  });
});

describe('extractPhone', () => {
  it('findet Nummern im Freitext', () => {
    expect(extractPhone('Praxis Dr. Muster, 030 / 123 456-7')).toBe('0301234567');
    expect(extractPhone('+49 170 1234567 (Anna)')).toBe('+491701234567');
    expect(extractPhone('Nachbarin Anna')).toBeNull();
  });
});
