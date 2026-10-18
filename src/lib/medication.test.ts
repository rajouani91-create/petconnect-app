import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../i18n';
import { parseSitterView } from './care';
import {
  DEFAULT_TIMES,
  berlinInstant,
  doseKey,
  doseState,
  doseText,
  dosesForDay,
  emptyMedForm,
  firstError,
  formToMed,
  medStatus,
  medToForm,
  nextOpenDose,
  parseAmount,
  recordMeds,
  splitMeds,
  timesFor,
  unitText,
  validateMed,
  type MedFormValues,
} from './medication';

const de = (k: MessageKey, v?: Record<string, string | number>) => translate('de', k, v);
const en = (k: MessageKey, v?: Record<string, string | number>) => translate('en', k, v);
const base = { name: 'Meloxicam', amount: 0.5, unit: 'ml', frequency: 'daily', times: ['19:30:00', '08:00:00'], intake_hint: 'with_food', note: null };

describe('Dosierungstext', () => {
  it('Menge, Einheit, Häufigkeit mit Uhrzeiten und Hinweis', () => {
    expect(doseText(base, de, 'de-DE')).toBe('0,5 ml · 2× täglich (08:00, 19:30 Uhr) · mit Futter');
    expect(doseText(base, en, 'en-GB')).toBe('0.5 ml · 2× daily (08:00, 19:30) · with food');
  });
  it('Einzahl nur bei genau 1, sonst Mehrzahl (auch 0,5)', () => {
    expect(unitText('tablet', 1, de)).toBe('Tablette');
    expect(unitText('tablet', 2, de)).toBe('Tabletten');
    expect(unitText('tablet', 0.5, de)).toBe('Tabletten');
    expect(unitText('drop', 3, de)).toBe('Tropfen');
    expect(unitText('puff', 2, de)).toBe('Hübe');
    expect(doseText({ ...base, amount: 1, unit: 'tablet', times: ['08:00:00'], intake_hint: 'none' }, de, 'de-DE')).toBe('1 Tablette · 1× täglich (08:00 Uhr)');
    expect(doseText({ ...base, amount: 0.25, unit: 'tablet', times: ['08:00:00'], intake_hint: 'empty_stomach' }, de, 'de-DE')).toBe('0,25 Tabletten · 1× täglich (08:00 Uhr) · nüchtern (vor dem Füttern)');
  });
  it('bei Bedarf ohne Uhrzeit; weitere Hinweise am Ende', () => {
    expect(doseText({ ...base, amount: 2, unit: 'puff', frequency: 'as_needed', times: [], intake_hint: 'none', note: 'bei Husten' }, de, 'de-DE')).toBe('2 Hübe · bei Bedarf · bei Husten');
    expect(doseText({ ...base, note: 'bei Husten' }, de, 'de-DE', false)).not.toContain('bei Husten');
  });
});

describe('Formular', () => {
  it('Uhrzeiten vorbelegt je Häufigkeit', () => {
    expect(timesFor('1')).toEqual(['08:00', '', '', '']);
    expect(timesFor('2')).toEqual(['08:00', '20:00', '', '']);
    expect(timesFor('3')).toEqual(['08:00', '14:00', '20:00', '']);
    expect(timesFor('4')).toEqual(DEFAULT_TIMES[4]);
    expect(timesFor('as_needed')).toEqual(['', '', '', '']);
  });
  it('Menge: Komma und Punkt, höchstens 2 Nachkommastellen, > 0', () => {
    expect(parseAmount('1')).toBe(1);
    expect(parseAmount('0,5')).toBe(0.5);
    expect(parseAmount('0.25')).toBe(0.25);
    expect(parseAmount(' 2 ')).toBe(2);
    expect(parseAmount('1000')).toBe(1000);
    const bad = ['0', '-1', '1,234', 'abc', '', '1001', '1,', ',5', '1e2', '0,00'];
    expect(bad.map((x) => [x, parseAmount(x)])).toEqual(bad.map((x) => [x, null]));
  });
  const ok: MedFormValues = { ...emptyMedForm('2026-10-16', 'Praxis am Ostpark'), name: 'Meloxicam', amount: '0,5', unit: 'ml', freq: '2', times: ['08:00', '19:30', '', ''], hint: 'with_food' };
  it('gültig → Spalten (HH:MM, sortiert, verordnet von vorbelegt)', () => {
    expect(validateMed(ok)).toEqual({});
    expect(formToMed({ ...ok, times: ['19:30', '08:00', '', ''] })).toMatchObject({
      name: 'Meloxicam', amount: 0.5, unit: 'ml', frequency: 'daily', times: ['08:00', '19:30'], intake_hint: 'with_food', prescribed_by: 'Praxis am Ostpark', starts_on: '2026-10-16', ends_on: null, remind: true,
    });
    expect(formToMed({ ...ok, freq: 'as_needed' })).toMatchObject({ frequency: 'as_needed', times: [] });
  });
  it('Fehler: Präparat, Menge, Uhrzeit fehlt/doppelt, Ende vor Beginn; erstes Feld', () => {
    const e = validateMed({ ...ok, name: ' ', amount: 'viel', times: ['08:00', '08:00', '', ''], endsOn: '2026-10-01' });
    expect(e).toEqual({ name: 'omErrName', amount: 'omErrAmt', times: [undefined, 'omErrDup'], endsOn: 'mdBad' });
    expect(firstError(e)).toBe('name');
    expect(firstError(validateMed({ ...ok, times: ['', '19:30', '', ''] }))).toBe('time-0');
    expect(validateMed({ ...ok, freq: 'as_needed', times: ['', '', '', ''] })).toEqual({});
    expect(de('omErrDup')).toBe('Diese Uhrzeit ist schon eingetragen.');
    expect(de('omErrAmt')).toBe('Bitte geben Sie die Menge als Zahl an, z. B. 1 oder 0,5.');
  });
  it('Zeile → Formular (Menge im Sprachformat)', () => {
    const row = { ...base, reason: null, prescribed_by: null, remind: false, starts_on: '2026-10-01', ends_on: '2026-10-20', stopped_on: null };
    expect(medToForm(row, 'de-DE')).toMatchObject({ amount: '0,5', freq: '2', times: ['08:00', '19:30', '', ''], hint: 'with_food', endsOn: '2026-10-20', remind: false });
  });
});

describe('Status', () => {
  const T = '2026-10-16';
  it('Dauermedikation / laufend / endet bald / beendet', () => {
    expect(medStatus({ starts_on: '2026-01-01', ends_on: null, stopped_on: null }, T)).toBe('longterm');
    expect(medStatus({ starts_on: '2026-10-01', ends_on: '2026-10-31', stopped_on: null }, T)).toBe('active');
    expect(medStatus({ starts_on: '2026-10-01', ends_on: '2026-10-23', stopped_on: null }, T)).toBe('ending');
    expect(medStatus({ starts_on: '2026-10-01', ends_on: '2026-10-16', stopped_on: null }, T)).toBe('ending');
    expect(medStatus({ starts_on: '2026-10-01', ends_on: '2026-10-15', stopped_on: null }, T)).toBe('ended');
    expect(medStatus({ starts_on: '2026-10-01', ends_on: null, stopped_on: T }, T)).toBe('ended');
    expect(de('mdLong')).toBe('Dauermedikation');
  });
  it('Liste: laufende nach Beginn, beendete getrennt; Akte nur beendete der letzten 12 Monate', () => {
    const rows = [
      { name: 'B', starts_on: '2026-09-01', ends_on: null, stopped_on: null },
      { name: 'A', starts_on: '2026-10-01', ends_on: null, stopped_on: null },
      { name: 'Alt', starts_on: '2025-01-01', ends_on: '2025-02-01', stopped_on: null },
      { name: 'Neu beendet', starts_on: '2026-05-01', ends_on: null, stopped_on: '2026-06-01' },
    ];
    const s = splitMeds(rows, T);
    expect(s.current.map((x) => x.name)).toEqual(['B', 'A']);
    expect(s.ended.map((x) => x.name)).toEqual(['Neu beendet', 'Alt']);
    expect(recordMeds(rows, T).ended.map((x) => x.name)).toEqual(['Neu beendet']);
  });
});

describe('Heutige Gaben', () => {
  const day = '2026-10-16';
  const at = (iso: string) => new Date(iso);
  it('Zustand: offen, jetzt fällig (bis 60 Min.), überfällig, gegeben', () => {
    expect(doseState(day, '08:00', at('2026-10-16T07:59:00+02:00'))).toEqual({ kind: 'open' });
    expect(doseState(day, '08:00', at('2026-10-16T08:00:00+02:00'))).toEqual({ kind: 'due' });
    expect(doseState(day, '08:00', at('2026-10-16T09:00:00+02:00'))).toEqual({ kind: 'due' });
    expect(doseState(day, '08:00', at('2026-10-16T09:01:00+02:00'))).toEqual({ kind: 'overdue', min: 61 });
    expect(doseState(day, '08:00', at('2026-10-16T10:00:00+02:00'), { given_by: 'u1', given_at: '2026-10-16T06:05:00Z' })).toEqual({ kind: 'given', by: 'u1', at: '2026-10-16T06:05:00Z' });
    expect(de('odOverdue', { n: 61 })).toBe('überfällig seit 61 Min.');
  });
  it('Mitternacht: 23:45 am Vortag ist nicht heute; 00:00 nach Mitternacht fällig', () => {
    expect(doseState('2026-10-16', '23:45', at('2026-10-16T23:50:00+02:00'))).toEqual({ kind: 'due' });
    expect(doseState('2026-10-17', '00:00', at('2026-10-17T00:30:00+02:00'))).toEqual({ kind: 'due' });
    expect(doseState('2026-10-17', '23:45', at('2026-10-17T00:30:00+02:00'))).toEqual({ kind: 'open' });
  });
  it('Zeitumstellung: echte Minuten zählen (März vor, Oktober zurück)', () => {
    // 29.03.2026: 02:00 → 03:00. 01:30 geplant, um 03:10 Sommerzeit sind 40 echte Minuten vergangen
    expect(doseState('2026-03-29', '01:30', at('2026-03-29T03:10:00+02:00'))).toEqual({ kind: 'due' });
    // 25.10.2026: 03:00 → 02:00. 01:30 geplant, um 03:10 Winterzeit sind 160 echte Minuten vergangen
    expect(doseState('2026-10-25', '01:30', at('2026-10-25T03:10:00+01:00'))).toEqual({ kind: 'overdue', min: 160 });
    // nicht existierende Uhrzeit 02:30 rückt auf 03:30 Sommerzeit
    expect(new Date(berlinInstant('2026-03-29', '02:30')).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(new Date(berlinInstant('2026-10-16', '08:00')).toISOString()).toBe('2026-10-16T06:00:00.000Z');
    expect(new Date(berlinInstant('2026-12-16', '08:00')).toISOString()).toBe('2026-12-16T07:00:00.000Z');
  });
  it('nur täglich, mit Erinnerung, im Zeitraum, nicht beendet – nach Uhrzeit, dann Tier', () => {
    const m = (id: string, pet: string, o: Record<string, unknown>) => ({ id, pet_id: pet, frequency: 'daily', times: ['08:00:00'], remind: true, starts_on: '2026-10-01', ends_on: null, stopped_on: null, ...o });
    const meds = [
      m('a', 'luna', { times: ['19:30:00', '08:00:00'] }),
      m('b', 'bello', {}),
      m('prn', 'luna', { frequency: 'as_needed', times: [] }),
      m('aus', 'luna', { remind: false }),
      m('stop', 'luna', { stopped_on: day }),
      m('ende', 'luna', { ends_on: '2026-10-15' }),
      m('morgen', 'luna', { starts_on: '2026-10-17' }),
    ];
    const names: Record<string, string> = { luna: 'Luna', bello: 'Bello' };
    const list = dosesForDay(meds, day, (id) => names[id] ?? '');
    expect(list.map((p) => `${p.time} ${p.med.id}`)).toEqual(['08:00 b', '08:00 a', '19:30 a']);
    const given = new Map([[doseKey('b', day, '08:00:00'), { given_by: 'u', given_at: 'x' }]]);
    expect(nextOpenDose(list, given, day)).toMatchObject({ time: '08:00', med: { id: 'a' } });
  });
});

describe('Sitter-Ansicht', () => {
  it('active_medications sicher lesen', () => {
    const v = parseSitterView({
      status: 'ok', sitter_name: 'Lea', valid_from: '2026-10-16', valid_to: '2026-10-20', pet: { name: 'Luna', species: 'dog' },
      active_medications: [{ name: 'Meloxicam', amount: 0.5, unit: 'ml', frequency: 'daily', times: ['08:00', '19:30'], intake_hint: 'with_food', note: null, ends_on: '2026-10-30' }, { name: '' }, 'kaputt'],
    });
    expect(v.status === 'ok' && v.active_medications).toEqual([{ name: 'Meloxicam', amount: 0.5, unit: 'ml', frequency: 'daily', times: ['08:00', '19:30'], intake_hint: 'with_food', note: null, ends_on: '2026-10-30' }]);
    const old = parseSitterView({ status: 'ok', sitter_name: 'Lea', valid_from: '2026-10-16', valid_to: '2026-10-20', pet: { name: 'Luna' } });
    expect(old.status === 'ok' && old.active_medications).toEqual([]);
  });
});
