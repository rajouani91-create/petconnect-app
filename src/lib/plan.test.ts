import { describe, expect, it } from 'vitest';
import { doseKey } from './medication';
import { doneIds, initialPlanTimes, isEntryDone, isLegacyMed, planForDay, validatePlanTimes } from './plan';
import { nextDue, type ZonedNow } from './time';

const PET = 'pet-luna';
const DAY = '2026-10-16'; // Freitag
const FRI = 5;
const SAT = 6;

const r = (id: string, kind: string, time: string, repeat = 'daily') => ({ id, kind, time_of_day: `${time}:00`, repeat });
const m = (id: string, f: Partial<{ pet_id: string; frequency: string; times: string[]; remind: boolean; starts_on: string; ends_on: string | null; stopped_on: string | null }> = {}) => ({
  id,
  pet_id: PET,
  frequency: 'daily',
  times: ['08:00:00'],
  remind: true,
  starts_on: '2026-10-01',
  ends_on: null,
  stopped_on: null,
  ...f,
});

const routine = [r('walk1', 'walk', '07:00'), r('feed1', 'feed', '08:00'), r('walk2', 'walk', '12:30'), r('sat', 'own', '10:00', 'weekends'), r('wd', 'litter', '09:00', 'weekdays')];
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

describe('Tagesplan: Einträge und Medikamente zusammenführen', () => {
  it('sortiert nach Uhrzeit zusammen mit dem Tagesplan; je Uhrzeit ein Punkt; bei gleicher Zeit erst der Tagesplan', () => {
    const plan = planForDay(routine, [m('melox', { times: ['20:00:00', '08:00:00'] })], PET, DAY, FRI);
    expect(plan.map((e) => `${e.time_of_day.slice(0, 5)} ${e.type}`)).toEqual(['07:00 routine', '08:00 routine', '08:00 med', '09:00 routine', '12:30 routine', '20:00 med']);
    const med = plan.find((e) => e.type === 'med')!;
    expect(med.id).toBe(doseKey('melox', DAY, '08:00'));
    expect(med).toMatchObject({ type: 'med', time: '08:00', repeat: 'daily' });
  });

  it('Wiederholung: werktags nur Mo–Fr, Wochenende nur Sa/So; null = ganzer Plan (Ansicht „Alltag“)', () => {
    expect(ids(planForDay(routine, [], PET, DAY, FRI))).toEqual(['walk1', 'feed1', 'wd', 'walk2']);
    expect(ids(planForDay(routine, [], PET, '2026-10-17', SAT))).toEqual(['walk1', 'feed1', 'sat', 'walk2']);
    expect(ids(planForDay(routine, [], PET, DAY, null))).toEqual(['walk1', 'feed1', 'wd', 'sat', 'walk2']);
  });

  it('Medikamente: nur dieses Tier, im Zeitraum, nicht beendet, mit Erinnerung, nicht „bei Bedarf“', () => {
    const meds = [
      m('ok'),
      m('other-pet', { pet_id: 'pet-mio' }),
      m('future', { starts_on: '2026-10-17' }),
      m('ended', { ends_on: '2026-10-15' }),
      m('ends-today', { ends_on: DAY, times: ['09:30:00'] }),
      m('stopped', { stopped_on: DAY }),
      m('stopped-later', { stopped_on: '2026-10-20', times: ['10:30:00'] }),
      m('silent', { remind: false }),
      m('prn', { frequency: 'as_needed', times: [] }),
    ];
    const plan = planForDay([], meds, PET, DAY, FRI);
    expect(plan.map((e) => (e.type === 'med' ? e.med.id : e.id))).toEqual(['ok', 'ends-today', 'stopped-later']);
  });

  it('Status gegeben/offen: Tagesplan über routine_done, Medikamente über medication_doses', () => {
    const plan = planForDay([r('walk1', 'walk', '07:00')], [m('melox', { times: ['08:00:00', '20:00:00'] })], PET, DAY, FRI);
    const done = doneIds(new Map([['walk1', 'user-a']]), new Map([[doseKey('melox', DAY, '08:00'), { given_by: 'user-a' }]]));
    expect(plan.map((e) => isEntryDone(e, done))).toEqual([true, true, false]);
  });

  it('„Nächster Punkt“ berücksichtigt Medikamente genauso', () => {
    const plan = planForDay([r('walk1', 'walk', '07:00'), r('walk2', 'walk', '12:30')], [m('melox', { times: ['08:00:00'] })], PET, DAY, FRI);
    const at = (minutes: number): ZonedNow => ({ date: DAY, minutes, weekday: FRI });
    const next = nextDue(plan, new Set<string>(), at(7 * 60 + 40));
    expect(next).toMatchObject({ state: 'upcoming', inMin: 20, item: { type: 'med' } });
    // gegeben → weiter zum nächsten Tagesplan-Eintrag
    const given = doneIds(new Map(), new Map([[doseKey('melox', DAY, '08:00'), {}]]));
    expect(nextDue(plan, given, at(8 * 60 + 5))).toMatchObject({ state: 'upcoming', item: { id: 'walk2' } });
    // offen und bis 30 Min. danach: „Jetzt“
    expect(nextDue(plan, new Set<string>(), at(8 * 60 + 10))).toMatchObject({ state: 'now', overdueMin: 10, item: { type: 'med' } });
  });

  it('alte Tagesplan-Einträge „Medikament“ bleiben sichtbar und sind erkennbar', () => {
    const plan = planForDay([r('old', 'med', '11:00')], [], PET, DAY, FRI);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.type === 'routine' && isLegacyMed(plan[0]!.item)).toBe(true);
    expect(isLegacyMed({ kind: 'feed' })).toBe(false);
  });
});

describe('Uhrzeiten für ein Medikament aus dem Tagesplan', () => {
  it('Vorbelegung: vorhandene Zeiten (sortiert), sonst 08:00', () => {
    expect(initialPlanTimes({ times: ['20:00:00', '08:00:00'] })).toEqual(['08:00', '20:00']);
    expect(initialPlanTimes({ times: [] })).toEqual(['08:00']);
  });
  it('1–4 Uhrzeiten, gültiges Format, keine doppelten', () => {
    expect(validatePlanTimes(['08:00', '20:00'])).toBeNull();
    expect(validatePlanTimes(['08:00', '08:00'])).toEqual([undefined, 'omErrDup']);
    expect(validatePlanTimes(['', '25:00', '8:00'])).toEqual(['omErrTime', 'omErrTime', 'omErrTime']);
    expect(validatePlanTimes([])).toEqual([]);
    expect(validatePlanTimes(['07:00', '08:00', '09:00', '10:00', '11:00'])).not.toBeNull();
  });
});
