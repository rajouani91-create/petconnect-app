import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, canWrite, entryData, entryErrors, recordTimeline, vitalForm } from './practiceRecord';
import { vitalFormErrors } from '../practice/record/EntryForms';

const TODAY = '2026-11-20';

describe('Vitalwerte der Praxis', () => {
  it('Team darf Vitalwerte eintragen', () => {
    expect(canWrite('team', 'vital')).toBe(true);
    expect(canWrite(null, 'vital')).toBe(false);
  });
  it('prüft Wert, Datum und Uhrzeit', () => {
    expect(entryErrors('vital', EMPTY_FORM.vital(TODAY), TODAY)).toEqual({ value: 'vtErrRequired' });
    expect(entryErrors('vital', { vkind: 'temperature', value: '50', measured_on: TODAY, time: '' }, TODAY)).toEqual({ value: 'vtErrRange' });
    expect(entryErrors('vital', { vkind: 'heart_rate', value: '96', measured_on: '2026-11-21', time: '9:5' }, TODAY)).toEqual({ measured_on: 'errFuture', time: 'rcErrTime' });
    expect(entryErrors('vital', { vkind: 'resp_rate', value: '24', measured_on: TODAY, time: '08:15' }, TODAY)).toEqual({});
  });
  it('wandelt Formular und Akte um', () => {
    expect(entryData('vital', { vkind: 'temperature', value: '38,6', context: 'rectal', measured_on: TODAY, time: '' }))
      .toEqual({ vkind: 'temperature', value: 38.6, context: 'rectal', measured_on: TODAY, time: null });
    expect(vitalForm({ kind: 'heart_rate', value: 96, context: null, measured_at: '2026-11-20T09:06:00Z' }, String))
      .toEqual({ vkind: 'heart_rate', value: '96', context: '', measured_on: TODAY, time: '10:06' });
  });
  it('Befund mit optionaler Uhrzeit', () => {
    expect(entryErrors('finding', { date: TODAY, time: '25:00', title: 'X', text: '' }, TODAY)).toEqual({ time: 'rcErrTime' });
    expect(entryData('finding', { date: TODAY, time: '', title: 'X', text: '' })).toEqual({ date: TODAY, time: null, title: 'X', text: '' });
  });
  it('Mehrfach-Formular: mindestens ein Wert, Grenzen je Art', () => {
    const base = { kg: '', temperature: '', tempCtx: '', heart_rate: '', resp_rate: '', date: TODAY, time: '' };
    expect(vitalFormErrors(base, TODAY)).toEqual({ kg: 'rcErrNoValue' });
    expect(vitalFormErrors({ ...base, temperature: '38,4', heart_rate: '1000' }, TODAY)).toEqual({ heart_rate: 'vtErrRange' });
    expect(vitalFormErrors({ ...base, kg: '28,1', time: '10:38' }, TODAY)).toEqual({});
  });
  it('Zeitleiste mit Uhrzeit, Vitalwerte eingeordnet', () => {
    const items = recordTimeline({
      vaccinations: [], medications: [], weights: [],
      findings: [{ id: 'f', date: TODAY, time: '09:30', title: 'Ohr', text: '', mine: true, by_name: 'Lea', practice_name: 'P', entered_at: '', changed: false }],
      vitals: [{ id: 'v', entry_id: 'v', kind: 'temperature', value: 38.6, context: null, measured_at: '2026-11-20T09:06:00Z', source: 'practice', mine: true, by_name: 'Tina', changed: false }],
    }, String, 12, (v) => `${v.value} °C`);
    expect(items.map((i) => [i.kind, i.time, i.by])).toEqual([['vital', '10:06', 'Tina'], ['finding', '09:30', 'Lea']]);
  });
});
