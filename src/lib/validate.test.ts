import { describe, expect, it } from 'vitest';
import { ageOn, birthDateError, emailError, passwordRepeatError, emptyPetForm, extractPhone, isDuplicateRoutine, passwordError, petFormToRow, validatePet, validateRoutine } from './validate';
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

describe('Registrierung: Passwort wiederholen und Mindestalter', () => {
  it('Passwort-Wiederholung muss übereinstimmen', () => {
    expect(passwordRepeatError('abcdefgh', '')).toEqual({ key: 'err_required' });
    expect(passwordRepeatError('abcdefgh', 'abcdefgi')).toEqual({ key: 'err_pwMismatch' });
    expect(passwordRepeatError('abcdefgh', 'abcdefgh')).toBeUndefined();
  });
  it('Alter in vollen Jahren am Stichtag', () => {
    expect(ageOn('2010-10-30', '2026-10-30')).toBe(16);
    expect(ageOn('2010-10-31', '2026-10-30')).toBe(15);
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
    expect(ageOn('2026-02-30', '2026-10-30')).toBeNull();
    expect(ageOn('quatsch', '2026-10-30')).toBeNull();
  });
  it('Geburtsdatum: Pflicht, gültig, mindestens 16 Jahre', () => {
    const today = '2026-10-30';
    expect(birthDateError('', today)).toEqual({ key: 'err_required' });
    expect(birthDateError('2026-11-01', today)).toEqual({ key: 'err_birthInvalid' });
    expect(birthDateError('1890-01-01', today)).toEqual({ key: 'err_birthInvalid' });
    expect(birthDateError('2010-10-31', today)).toEqual({ key: 'err_underAge' });
    expect(birthDateError('2010-10-30', today)).toBeUndefined();
    expect(birthDateError('1990-05-05', today)).toBeUndefined();
  });
});
