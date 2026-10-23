import { describe, expect, it } from 'vitest';
import { buildTimeline, type TimelineSources } from './timeline';

const src: TimelineSources = {
  vaccinations: [{ id: 'a', name: 'Tollwut', given_on: '2026-03-10' }, { id: 'b', name: 'Offen', given_on: null }],
  documents: [{ id: 'c', title: 'Blutbild', category: 'befund', doc_date: '2026-06-01' }],
  doses: [{ id: 'd', medication_name: 'Meloxicam', scheduled_on: '2026-10-02' }],
  weights: [{ id: 'e', kg: 4.25, measured_on: '2026-09-15' }],
};

describe('buildTimeline', () => {
  it('sortiert neueste zuerst und lässt Einträge ohne Datum weg', () => {
    const t = buildTimeline(src);
    expect(t.map((e) => e.date)).toEqual(['2026-10-02', '2026-09-15', '2026-06-01', '2026-03-10']);
    expect(t.find((e) => e.title === 'Offen')).toBeUndefined();
  });

  it('formatiert Gewicht mit deutschem Dezimalkomma', () => {
    const w = buildTimeline(src).find((e) => e.kind === 'weight');
    expect(w?.title).toBe('4,25 kg');
  });

  it('filtert nach Art', () => {
    const t = buildTimeline(src, ['vaccination', 'weight']);
    expect(t.map((e) => e.kind)).toEqual(['weight', 'vaccination']);
  });

  it('liefert eine leere Liste ohne Quellen', () => {
    expect(buildTimeline({ vaccinations: [], documents: [], doses: [], weights: [] })).toEqual([]);
  });

  it('behält IDs getrennt je Art', () => {
    const ids = buildTimeline(src).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
