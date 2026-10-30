import { describe, expect, it } from 'vitest';
import { filterEntries, groupByMonth, labDays, sortEntries, type TimelineEntry } from './healthTimeline';

const e = (id: string, kind: TimelineEntry['kind'], date: string, at = `${date}T10:00:00Z`): TimelineEntry => ({ id, kind, date, at, title: id, detail: '', target: 'weight' });

describe('Gesundheits-Verlauf', () => {
  const all = [e('a', 'weight', '2026-09-10'), e('b', 'vaccination', '2026-10-15'), e('c', 'vital', '2026-10-28'), e('d', 'document', '2026-10-28', '2026-10-28T12:00:00Z'), e('f', 'medication', '2026-09-01')];
  it('sortiert neueste zuerst, am selben Tag nach Zeitpunkt', () => {
    expect(sortEntries(all).map((x) => x.id)).toEqual(['d', 'c', 'b', 'a', 'f']);
  });
  it('filtert nach Gruppe', () => {
    expect(filterEntries(all, 'all')).toHaveLength(5);
    expect(filterEntries(all, 'vacc').map((x) => x.id)).toEqual(['b']);
    expect(filterEntries(all, 'values').map((x) => x.id).sort()).toEqual(['a', 'c']);
    expect(filterEntries(all, 'meds').map((x) => x.id)).toEqual(['f']);
    expect(filterEntries(all, 'docs').map((x) => x.id)).toEqual(['d']);
  });
  it('bündelt nach Monat', () => {
    const g = groupByMonth(sortEntries(all));
    expect(g.map((x) => [x.month, x.entries.length])).toEqual([['2026-10', 3], ['2026-09', 2]]);
  });
  it('fasst Laborwerte eines Tages zusammen', () => {
    const d = labDays([
      { measured_on: '2026-10-09', created_at: '2026-10-09T08:00:00Z' },
      { measured_on: '2026-10-09', created_at: '2026-10-09T09:00:00Z' },
      { measured_on: '2026-09-01', created_at: '2026-09-01T09:00:00Z' },
    ]);
    expect(d).toEqual([{ date: '2026-10-09', at: '2026-10-09T09:00:00Z', count: 2 }, { date: '2026-09-01', at: '2026-09-01T09:00:00Z', count: 1 }]);
  });
});
