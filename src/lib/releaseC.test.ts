import { describe, expect, it } from 'vitest';
import { slotsByDay } from './booking';
import { cancelReasonKey, dayOf } from './practiceAppointments';
import { ageMonths, ageText, nextAppointment } from './petSummary';

describe('slotsByDay', () => {
  it('gruppiert nach Tag in Berlin, sortiert', () => {
    const g = slotsByDay(['2026-11-24T09:15:00Z', '2026-11-23T08:30:00Z', '2026-11-23T23:30:00Z', '2026-11-23T08:00:00Z'], dayOf);
    expect(g.map((x) => x.day)).toEqual(['2026-11-23', '2026-11-24']);
    expect(g[0]!.slots).toEqual(['2026-11-23T08:00:00Z', '2026-11-23T08:30:00Z']);
    // 23:30 UTC ist in Berlin schon der 24.
    expect(g[1]!.slots).toEqual(['2026-11-23T23:30:00Z', '2026-11-24T09:15:00Z']);
  });
  it('leer bleibt leer', () => expect(slotsByDay([], dayOf)).toEqual([]));
});

describe('cancelReasonKey', () => {
  it('kennt Gründe von Praxis und Halter:in', () => {
    expect(cancelReasonKey('vet_ill')).toBe('bkReasonIll');
    expect(cancelReasonKey('conflict')).toBe('obRsConflict');
    expect(cancelReasonKey('other')).toBe('rcReasonOther');
  });
  it('unbekannt oder leer ergibt null', () => {
    expect(cancelReasonKey('xyz')).toBeNull();
    expect(cancelReasonKey(null)).toBeNull();
  });
});

describe('Alter', () => {
  it('rechnet ganze Monate', () => {
    expect(ageMonths('2022-11-21', '2026-11-20')).toBe(47);
    expect(ageMonths('2022-11-20', '2026-11-20')).toBe(48);
    expect(ageMonths('2026-12-01', '2026-11-20')).toBeNull();
    expect(ageMonths(null, '2026-11-20')).toBeNull();
    expect(ageMonths('20.11.2022', '2026-11-20')).toBeNull();
  });
  it('Jahre ab 2, darunter Monate', () => {
    expect(ageText('2022-05-01', '2026-11-20')).toEqual({ key: 'petAgeY', n: 4 });
    expect(ageText('2025-06-01', '2026-11-20')).toEqual({ key: 'petAge1Y', n: 1 });
    expect(ageText('2026-07-10', '2026-11-20')).toEqual({ key: 'petAgeM', n: 4 });
    expect(ageText('2026-10-15', '2026-11-20')).toEqual({ key: 'petAge1M', n: 1 });
    expect(ageText('2026-11-10', '2026-11-20')).toEqual({ key: 'petAge0', n: 0 });
  });
});

describe('nextAppointment', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('nächster geplanter ab jetzt', () => {
    const rows = [
      { id: 'a', starts_at: '2026-11-25T09:00:00Z', status: 'planned' },
      { id: 'b', starts_at: '2026-11-19T09:00:00Z', status: 'planned' },
      { id: 'c', starts_at: '2026-11-22T09:00:00Z', status: 'cancelled' },
      { id: 'd', starts_at: '2026-11-23T09:00:00Z', status: 'planned' },
    ];
    expect(nextAppointment(rows, now)?.id).toBe('d');
  });
  it('keiner', () => expect(nextAppointment([], now)).toBeNull());
});
