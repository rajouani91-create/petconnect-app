import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM, canWrite, entryData, entryErrors, entryForm, filterVaccinations, isClinical, isRabies, reasonError, recordErrorKey, recordTimeline, validUntil,
  vaccinesFor, type RecVaccination,
} from './practiceRecord';
import { doseText } from './medication';

const TODAY = '2026-11-14';
const vacc = (o: Partial<RecVaccination>): RecVaccination => ({
  id: 'v1', name: 'Tollwut', given_on: '2026-11-01', valid_until: '2027-11-01', source: 'practice', created_at: '', confirmed: false,
  mine: true, entry_id: 'v1', by_name: 'Dr. Vet', practice_name: 'Praxis', entered_at: '', changed: false, ...o,
});

describe('Rechte', () => {
  it('Leitung und Tierärzt:innen dürfen alles, das Team nur Gewicht', () => {
    expect(isClinical('lead') && isClinical('vet')).toBe(true);
    expect(isClinical('team')).toBe(false);
    expect(canWrite('team', 'weight')).toBe(true);
    expect(canWrite('team', 'vaccination')).toBe(false);
    expect(canWrite('vet', 'finding')).toBe(true);
    expect(canWrite(null, 'weight')).toBe(false);
  });
});

describe('Grund', () => {
  it('Pflicht; bei „Sonstiges“ auch die Bemerkung', () => {
    expect(reasonError('', '')).toBe('rcErrReason');
    expect(reasonError('typo', '')).toBeNull();
    expect(reasonError('other', '  ')).toBe('rcErrNote');
    expect(reasonError('other', 'Halterin rief an')).toBeNull();
  });
});

describe('Impfungen', () => {
  it('Impfstoffe je Tierart, sonst Freitext', () => {
    expect(vaccinesFor('dog')).toEqual(['Tollwut', 'SHPPi', 'L4']);
    expect(vaccinesFor('cat')).toContain('RCP');
    expect(vaccinesFor('reptile')).toEqual([]);
    expect(vaccinesFor(null)).toEqual([]);
  });
  it('Gültigkeit in Jahren, Schalttag fällt auf den 28. Februar', () => {
    expect(validUntil('2026-11-14', 1)).toBe('2027-11-14');
    expect(validUntil('2026-11-14', 3)).toBe('2029-11-14');
    expect(validUntil('2028-02-29', 1)).toBe('2029-02-28');
    expect(validUntil('2028-02-29', 4)).toBe('2032-02-29');
  });
  it('Tollwut erkennen', () => {
    expect(isRabies('Tollwut (Nobivac)')).toBe(true);
    expect(isRabies('SHPPi')).toBe(false);
  });
  it('Filter; „Alle“ fasst gleiche Impfung am gleichen Tag zusammen (Praxis gewinnt)', () => {
    const rows = [
      vacc({ id: 'a', source: 'owner', mine: false, entry_id: null }),
      vacc({ id: 'b' }),
      vacc({ id: 'c', name: 'SHPPi', source: 'owner', mine: false, entry_id: null }),
      vacc({ id: 'd', name: 'L4', given_on: null, source: 'owner', mine: false }),
      vacc({ id: 'e', name: 'L4', given_on: null, source: 'owner', mine: false }),
    ];
    expect(filterVaccinations(rows, 'all').map((r) => r.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(filterVaccinations(rows, 'ours').map((r) => r.id)).toEqual(['b']);
    expect(filterVaccinations(rows, 'owner').map((r) => r.id)).toEqual(['a', 'c', 'd', 'e']);
  });
});

describe('Formulare', () => {
  it('Impfung: Name und Datum Pflicht, nicht in der Zukunft, gültig bis nicht vor dem Impfdatum', () => {
    expect(entryErrors('vaccination', { name: ' ', given_on: '', valid_until: '' }, TODAY)).toEqual({ name: 'rcErrVaccName', given_on: 'errDateRequired' });
    expect(entryErrors('vaccination', { name: 'RCP', given_on: '2026-11-15', valid_until: '' }, TODAY)).toEqual({ given_on: 'errFuture' });
    expect(entryErrors('vaccination', { name: 'RCP', given_on: '2026-11-01', valid_until: '2026-10-01' }, TODAY)).toEqual({ valid_until: 'rcErrValidUntil' });
    expect(entryErrors('vaccination', { name: 'RCP', given_on: '2026-11-01', valid_until: '2027-11-01' }, TODAY)).toEqual({});
  });
  it('Befund: Titel Pflicht', () => {
    expect(entryErrors('finding', { date: TODAY, title: '', text: 'x' }, TODAY)).toEqual({ title: 'rcErrTitle' });
    expect(entryErrors('finding', EMPTY_FORM.finding(TODAY), TODAY)).toEqual({ title: 'rcErrTitle' });
  });
  it('Medikament: Präparat und Dosierung Pflicht, Ende nicht vor Beginn', () => {
    expect(entryErrors('medication', { name: '', dosage: '', reason: '', starts_on: TODAY, ends_on: '' }, TODAY)).toEqual({ name: 'rcErrMedName', dosage: 'rcErrDosage' });
    expect(entryErrors('medication', { name: 'A', dosage: '1x', reason: '', starts_on: TODAY, ends_on: '2026-11-13' }, TODAY)).toEqual({ ends_on: 'rcErrEnds' });
    expect(entryErrors('medication', { name: 'A', dosage: '1x', reason: '', starts_on: TODAY, ends_on: '' }, TODAY)).toEqual({});
  });
  it('Gewicht: Komma erlaubt, Bereich geprüft', () => {
    expect(entryErrors('weight', { kg: '', measured_on: TODAY }, TODAY)).toEqual({ kg: 'wkErrRequired' });
    expect(entryErrors('weight', { kg: '0', measured_on: TODAY }, TODAY)).toEqual({ kg: 'wkErrRange' });
    expect(entryErrors('weight', { kg: '28,4', measured_on: TODAY }, TODAY)).toEqual({});
    expect(entryData('weight', { kg: '28,4 kg', measured_on: TODAY })).toEqual({ kg: 28.4, measured_on: TODAY });
  });
  it('Daten für die Datenbank: getrimmt, leere Angaben als null', () => {
    expect(entryData('vaccination', { name: ' Tollwut ', given_on: TODAY, valid_until: '' })).toEqual({ name: 'Tollwut', given_on: TODAY, valid_until: null });
    expect(entryData('medication', { name: 'A', dosage: ' 1x ', reason: ' ', starts_on: TODAY, ends_on: '' })).toEqual({ name: 'A', dosage: '1x', reason: null, starts_on: TODAY, ends_on: null });
  });
  it('gespeicherter Eintrag → Formular', () => {
    expect(entryForm('weight', { kg: 28.4, measured_on: TODAY }, (n) => String(n).replace('.', ','))).toEqual({ kg: '28,4', measured_on: TODAY });
    expect(entryForm('vaccination', { name: 'RCP', given_on: TODAY, valid_until: null }, String)).toEqual({ name: 'RCP', given_on: TODAY, valid_until: '' });
  });
});

describe('Zeitleiste', () => {
  it('neueste zuerst, höchstens 12, Impfungen ohne Datum fehlen', () => {
    const items = recordTimeline({
      vaccinations: [vacc({ id: 'a', given_on: '2026-11-01' }), vacc({ id: 'b', given_on: null })],
      findings: [{ id: 'f', date: '2026-11-10', title: 'Ohr', text: '', mine: true, by_name: '', practice_name: '', entered_at: '', changed: false }],
      medications: [],
      weights: Array.from({ length: 14 }, (_, i) => ({ id: `w${i}`, entry_id: null, kg: 20 + i, measured_on: `2026-10-${String(i + 1).padStart(2, '0')}`, mine: false, by_name: null, changed: false })),
    }, (kg) => `${kg} kg`);
    expect(items).toHaveLength(12);
    expect(items[0]).toMatchObject({ kind: 'finding', title: 'Ohr' });
    expect(items[1]).toMatchObject({ kind: 'vaccination', date: '2026-11-01' });
    expect(items[2]).toMatchObject({ kind: 'weight', title: '33 kg' });
  });
});

describe('Fehlertexte', () => {
  it('Code aus der Datenbank → Schlüssel', () => {
    expect(recordErrorKey({ message: 'patient_not_found' })).toBe('ptNotFound');
    expect(recordErrorKey({ message: 'no_change' })).toBe('rcErrNoChange');
    expect(recordErrorKey({ message: 'forbidden' })).toBe('pe_forbidden');
    expect(recordErrorKey(new Error('network'))).toBe('pe_generic');
    expect(recordErrorKey(null)).toBe('pe_generic');
  });
});

describe('Dosierung als Freitext', () => {
  const t = ((k: string) => k) as never;
  it('Einträge der Praxis zeigen den Freitext statt Menge und Häufigkeit', () => {
    const base = { name: 'Surolan', amount: 1, unit: 'application', frequency: 'as_needed', times: [], intake_hint: 'none', note: '5 Tropfen ins Ohr' };
    expect(doseText({ ...base, dosage_text: '5 Tropfen ins Ohr' }, t, 'de-DE')).toBe('5 Tropfen ins Ohr');
    expect(doseText({ ...base, dosage_text: null }, t, 'de-DE')).toContain('omPrn');
  });
});
