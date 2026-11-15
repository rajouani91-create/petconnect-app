import { describe, expect, it } from 'vitest';
import { EMPTY_INTAKE, intakeErrors, intakePayload, inviteErrorKey, isInviteCode, normalizeInviteCode } from './patientInvites';

const TODAY = '2026-11-15';
const OK = { ...EMPTY_INTAKE, ownerName: 'Ole Becker', email: 'Ole@X.de ', petName: ' Bello ' };

describe('Patient aufnehmen', () => {
  it('Pflichtfelder: Name, E-Mail, Tiername, Tierart', () => {
    expect(intakeErrors(EMPTY_INTAKE, TODAY)).toEqual({ ownerName: 'piErrOwner', email: 'piErrEmail', petName: 'piErrPet' });
    expect(intakeErrors(OK, TODAY)).toEqual({});
    expect(intakeErrors({ ...OK, species: 'other' }, TODAY)).toEqual({ speciesOther: 'piErrSpecies' });
    expect(intakeErrors({ ...OK, species: 'dragon' }, TODAY)).toEqual({ species: 'piErrSpecies' });
  });
  it('optionale Angaben werden geprüft, wenn ausgefüllt', () => {
    expect(intakeErrors({ ...OK, birthDate: '2026-11-16' }, TODAY)).toEqual({ birthDate: 'errFuture' });
    expect(intakeErrors({ ...OK, kg: 'schwer' }, TODAY)).toEqual({ kg: 'wkErrFormat' });
    expect(intakeErrors({ ...OK, kg: '0' }, TODAY)).toEqual({ kg: 'wkErrRange' });
    expect(intakeErrors({ ...OK, kg: '28,4', birthDate: '2020-05-01' }, TODAY)).toEqual({});
  });
  it('Daten für die Datenbank: getrimmt, E-Mail klein, leere Angaben null', () => {
    expect(intakePayload({ ...OK, kg: '28,4', species: 'other', speciesOther: ' Frettchen ', phone: ' 0171 ' })).toEqual({
      owner: { name: 'Ole Becker', email: 'ole@x.de', phone: '0171' },
      pet: { name: 'Bello', species: 'other', species_other: 'Frettchen', sex: null, breed: null, birth_date: null, chip_no: null, kg: 28.4 },
    });
    expect(intakePayload({ ...OK, speciesOther: 'egal' }).pet.species_other).toBeNull();
  });
});

describe('Einladungscode', () => {
  it('Eingabe vereinheitlichen und prüfen', () => {
    expect(normalizeInviteCode(' pc 7kq3 m9xz ')).toBe('PC-7KQ3-M9XZ');
    expect(normalizeInviteCode('PC-7KQ3-M9XZ')).toBe('PC-7KQ3-M9XZ');
    expect(isInviteCode('pc7kq3m9xz')).toBe(true);
    expect(isInviteCode('PC-7KQ3-M9X')).toBe(false);
    expect(isInviteCode('PC-0KQ3-M9XZ')).toBe(false);
    expect(isInviteCode('LUN-7KQ-3M9')).toBe(false);
  });
});

describe('Fehlertexte', () => {
  it('Code → Schlüssel (längster Treffer gewinnt)', () => {
    expect(inviteErrorKey(new Error('invite_exists'))).toBe('piErrExists');
    expect(inviteErrorKey({ message: 'pet_name_invalid' })).toBe('piErrPet');
    expect(inviteErrorKey({ message: 'name_invalid' })).toBe('piErrOwner');
    expect(inviteErrorKey({ message: 'too_many_attempts' })).toBe('piErrAttempts');
    expect(inviteErrorKey(new Error('mail_failed'))).toBe('piErrMail');
    expect(inviteErrorKey(null)).toBe('pe_generic');
  });
});
