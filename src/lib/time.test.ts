import { describe, expect, it } from 'vitest';
import { itemsForDay, nextDue, occursOn, splitMinutes, toHHMM, toMinutes, zonedNow, type ZonedNow } from './time';

const item = (id: string, time: string, repeat = 'daily') => ({ id, time_of_day: `${time}:00`, repeat });
const at = (time: string, weekday = 3, date = '2026-10-14'): ZonedNow => ({ date, minutes: toMinutes(time), weekday });

describe('toHHMM / toMinutes', () => {
  it('normalisiert Postgres-Zeiten', () => {
    expect(toHHMM('07:00:00')).toBe('07:00');
    expect(toHHMM('7:05')).toBe('07:05');
    expect(toMinutes('21:30:00')).toBe(21 * 60 + 30);
  });
  it('lehnt ungültige Zeiten ab', () => {
    expect(() => toHHMM('25:00')).toThrow('Ungültige Uhrzeit: 25:00');
    expect(() => toHHMM('abc')).toThrow('Ungültige Uhrzeit: abc');
  });
});

describe('zonedNow (Europe/Berlin)', () => {
  it('Sommerzeit: UTC+2', () => {
    const z = zonedNow(new Date('2026-07-01T22:30:00Z'));
    expect(z).toEqual({ date: '2026-07-02', minutes: 30, weekday: 4 });
  });
  it('Winterzeit: UTC+1', () => {
    const z = zonedNow(new Date('2026-12-31T23:15:00Z'));
    expect(z).toEqual({ date: '2027-01-01', minutes: 15, weekday: 5 });
  });
  it('Mitternacht ergibt 0 Minuten, nicht 24:00', () => {
    expect(zonedNow(new Date('2026-10-13T22:00:00Z')).minutes).toBe(0);
  });
});

describe('occursOn: Wochenende / Wochentag', () => {
  it('daily an jedem Tag', () => {
    for (let d = 0; d < 7; d++) expect(occursOn('daily', d)).toBe(true);
  });
  it('weekdays nur Mo–Fr', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => occursOn('weekdays', d))).toEqual([false, true, true, true, true, true, false]);
  });
  it('weekends nur Sa und So', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => occursOn('weekends', d))).toEqual([true, false, false, false, false, false, true]);
  });
  it('unbekannte Wiederholung nie', () => {
    expect(occursOn('monthly', 1)).toBe(false);
  });
});

describe('itemsForDay', () => {
  const items = [item('c', '18:00'), item('a', '07:30'), item('we', '10:00', 'weekends'), item('wd', '08:00', 'weekdays')];
  it('Mittwoch: ohne Wochenend-Eintrag, sortiert', () => {
    expect(itemsForDay(items, 3).map((i) => i.id)).toEqual(['a', 'wd', 'c']);
  });
  it('Samstag: ohne Wochentags-Eintrag', () => {
    expect(itemsForDay(items, 6).map((i) => i.id)).toEqual(['a', 'we', 'c']);
  });
});

describe('nextDue', () => {
  const plan = [item('w1', '07:00'), item('f1', '07:30'), item('w2', '12:30'), item('cage', '10:00', 'weekends')];
  const none = new Set<string>();

  it('nächster Eintrag in der Zukunft mit Minuten bis dahin', () => {
    const n = nextDue(plan, none, at('06:35'));
    expect(n).toEqual({ item: plan[0], state: 'upcoming', inMin: 25 });
  });

  it('genau zur Uhrzeit: „Jetzt“', () => {
    expect(nextDue(plan, none, at('07:00'))).toMatchObject({ item: { id: 'w1' }, state: 'now', overdueMin: 0 });
  });

  it('bis 30 Min. überfällig: weiter „Jetzt“', () => {
    expect(nextDue(plan, none, at('07:20'))).toMatchObject({ item: { id: 'w1' }, state: 'now', overdueMin: 20 });
    expect(nextDue([item('x', '09:00')], none, at('09:30'))).toMatchObject({ state: 'now', overdueMin: 30 });
  });

  it('mehr als 30 Min. überfällig: übersprungen', () => {
    expect(nextDue([item('x', '09:00')], none, at('09:31'))).toBeNull();
    // 07:00 ist 31 Min. überfällig → 07:30 ist „Jetzt“
    expect(nextDue(plan, none, at('07:31'))).toMatchObject({ item: { id: 'f1' }, state: 'now', overdueMin: 1 });
  });

  it('erledigte Einträge werden übersprungen', () => {
    expect(nextDue(plan, new Set(['w1']), at('07:05'))).toMatchObject({ item: { id: 'f1' }, state: 'upcoming', inMin: 25 });
  });

  it('Wochenend-Eintrag nur am Wochenende', () => {
    expect(nextDue(plan, none, at('09:00', 3))).toMatchObject({ item: { id: 'w2' } });
    expect(nextDue(plan, none, at('09:00', 0))).toMatchObject({ item: { id: 'cage' }, inMin: 60 });
  });

  it('nach dem letzten Eintrag oder ohne Einträge: null', () => {
    expect(nextDue(plan, none, at('23:00'))).toBeNull();
    expect(nextDue([], none, at('08:00'))).toBeNull();
  });

  it('Reihenfolge der Eingabe spielt keine Rolle', () => {
    const shuffled = [plan[2]!, plan[0]!, plan[1]!];
    expect(nextDue(shuffled, none, at('06:00'))).toMatchObject({ item: { id: 'w1' }, inMin: 60 });
  });
});

describe('splitMinutes', () => {
  it('zerlegt in Stunden und Minuten', () => {
    expect(splitMinutes(25)).toEqual({ h: 0, m: 25 });
    expect(splitMinutes(65)).toEqual({ h: 1, m: 5 });
    expect(splitMinutes(120)).toEqual({ h: 2, m: 0 });
  });
});
