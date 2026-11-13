import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM, EMPTY_OFFER, formErrors, formFromDirectory, formFromPractice, formToPayload, offerIsEmpty, parseMe, practiceErrorKey, serviceAsked,
  setIn, splitStreet, splitZipCity, toggleSpecies, PRACTICE_TITLES,
} from './practiceAccount';
import { DICTIONARIES } from '../i18n';

describe('Adresse aus einem Feld', () => {
  it('Straße und Hausnummer', () => {
    expect(splitStreet('Mainstraße 12')).toEqual({ street: 'Mainstraße', housenumber: '12' });
    expect(splitStreet(' Am  Markt 3a ')).toEqual({ street: 'Am Markt', housenumber: '3a' });
    expect(splitStreet('Hauptstr. 10-12')).toEqual({ street: 'Hauptstr.', housenumber: '10-12' });
    expect(splitStreet('Marktplatz')).toEqual({ street: 'Marktplatz', housenumber: '' });
    expect(splitStreet('Straße des 17. Juni 5')).toEqual({ street: 'Straße des 17. Juni', housenumber: '5' });
  });
  it('PLZ und Ort', () => {
    expect(splitZipCity('65428 Rüsselsheim am Main')).toEqual({ postcode: '65428', city: 'Rüsselsheim am Main' });
    expect(splitZipCity('1010 Wien')).toEqual({ postcode: '1010', city: 'Wien' });
    expect(splitZipCity('1012 AB Amsterdam')).toEqual({ postcode: '1012 AB', city: 'Amsterdam' });
    expect(splitZipCity('Frankfurt')).toEqual({ postcode: '', city: 'Frankfurt' });
  });
});

describe('Formular', () => {
  it('Name ist Pflicht, E-Mail wird nur geprüft, wenn angegeben', () => {
    expect(formErrors(EMPTY_FORM)).toEqual({ name: 'err_required' });
    expect(formErrors({ ...EMPTY_FORM, name: 'P' })).toEqual({ name: 'pf_nameShort' });
    expect(formErrors({ ...EMPTY_FORM, name: 'Praxis', email: 'x' })).toEqual({ email: 'err_email' });
    expect(formErrors({ ...EMPTY_FORM, name: 'Praxis', email: 'a@b.de' })).toEqual({});
  });
  it('Verzeichniseintrag füllt das Formular vor', () => {
    const f = formFromDirectory({ id: '1', name: 'Praxis Ost', street: 'Mainstraße', housenumber: '12', postcode: '65428', city: 'Rüsselsheim', phone: '06142 1', website: null, email: null, opening_hours: 'Mo-Fr 08:00-18:00' });
    expect(f).toMatchObject({ name: 'Praxis Ost', streetLine: 'Mainstraße 12', zipCity: '65428 Rüsselsheim', phone: '06142 1', hours: 'Mo-Fr 08:00-18:00' });
  });
  it('Payload trennt Adresse und speichert Folgefragen nur mit passender Tierart', () => {
    const p = formToPayload(
      { ...EMPTY_FORM, name: ' Praxis ', streetLine: 'Mainstraße 12', zipCity: '65428 Rüsselsheim' },
      { species: ['dog'], services: ['surgery', 'hibernation'], titles: ['surgery'], languages: ['tr', 'de'] },
    );
    expect(p).toMatchObject({ name: 'Praxis', street: 'Mainstraße', housenumber: '12', postcode: '65428', city: 'Rüsselsheim', species: ['dog'], services: ['surgery'], languages: ['de', 'tr'] });
  });
});

describe('Fragebogen', () => {
  it('Folgefragen erscheinen nur mit passender Tierart und fallen beim Abwählen weg', () => {
    expect(serviceAsked(EMPTY_OFFER, 'hibernation')).toBe(false);
    expect(serviceAsked(EMPTY_OFFER, 'surgery')).toBe(true);
    let o = toggleSpecies(EMPTY_OFFER, 'reptile');
    expect(serviceAsked(o, 'hibernation')).toBe(true);
    o = { ...o, services: ['surgery', 'hibernation'] };
    o = toggleSpecies(o, 'dog');
    expect(o.species).toEqual(['dog', 'reptile']);
    o = toggleSpecies(o, 'reptile');
    expect(o).toMatchObject({ species: ['dog'], services: ['surgery'] });
  });
  it('setIn hält die Reihenfolge des Katalogs', () => {
    expect(setIn(PRACTICE_TITLES, ['horses'], 'small_animals', true)).toEqual(['small_animals', 'horses']);
    expect(setIn(PRACTICE_TITLES, ['horses', 'birds'], 'horses', false)).toEqual(['birds']);
    expect(offerIsEmpty(EMPTY_OFFER)).toBe(true);
  });
});

describe('practice_me', () => {
  it('Unbekanntes wird Halter-Konto', () => {
    expect(parseMe(null)).toMatchObject({ kind: 'owner', practice: null });
    expect(parseMe({ kind: 'x' }).kind).toBe('owner');
  });
  it('Praxis mit Angebot; unbekannte Werte fallen weg', () => {
    const me = parseMe({
      kind: 'practice', role: 'vet',
      practice: { id: 'p', name: 'Praxis', status: 'active', species: ['cat', 'dino', 'cat'], services: ['surgery'], titles: ['birds'], languages: ['de', 'xx'], titles_verified: true },
    });
    expect(me.role).toBe('vet');
    expect(me.practice?.offer).toEqual({ species: ['cat'], services: ['surgery'], titles: ['birds'], languages: ['de'] });
    expect(me.practice?.titles_verified).toBe(true);
    expect(formFromPractice(me.practice!).name).toBe('Praxis');
  });
  it('Einladung und Status', () => {
    const me = parseMe({ kind: 'practice', invite: { practice_name: 'Ost', role: 'team', expired: true }, practice: { id: 'p', name: 'X', status: 'weird' } });
    expect(me.invite).toEqual({ practice_name: 'Ost', role: 'team', expired: true });
    expect(me.practice?.status).toBe('pending');
  });
});

describe('Fehlermeldungen', () => {
  it('jeder Code hat einen Text in jeder Sprache', () => {
    for (const c of ['directory_taken', 'already_member', 'invite_exists', 'account_exists', 'already_confirmed', 'last_lead', 'invite_not_found', 'invite_expired', 'forbidden', 'mail_failed', 'irgendwas', null]) {
      const k = practiceErrorKey(c);
      for (const d of Object.values(DICTIONARIES)) expect(d[k], `${c}`).toBeTruthy();
    }
    expect(practiceErrorKey('irgendwas')).toBe('pe_generic');
  });
});
