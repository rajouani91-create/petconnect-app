import { describe, expect, it } from 'vitest';
import { activityName, areaPath, cumulative, fmt, growthPct, linePath, niceMax, pct, sortedActivity, sortedRecords, speciesName, sumLast, toPoints, type DayPoint, type RecordKey } from './dashboard';

const series: DayPoint[] = [
  { d: '2026-10-20', signups: 1, pets: 0, interactions: 5 },
  { d: '2026-10-21', signups: 2, pets: 1, interactions: 0 },
  { d: '2026-10-22', signups: 3, pets: 2, interactions: 10 },
];

describe('sumLast', () => {
  it('summiert die letzten n Tage', () => {
    expect(sumLast(series, 'signups', 2)).toBe(5);
    expect(sumLast(series, 'interactions', 7)).toBe(15);
  });
  it('kommt mit leeren Reihen klar', () => {
    expect(sumLast([], 'pets', 7)).toBe(0);
  });
});

describe('pct', () => {
  it('rundet und schützt vor Division durch 0', () => {
    expect(pct(11, 19)).toBe(58);
    expect(pct(1, 0)).toBe(0);
  });
});

describe('niceMax', () => {
  it('liefert schöne Obergrenzen', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(38)).toBe(50);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(7)).toBe(10);
  });
});

describe('Linien und Flächen', () => {
  const pad = { l: 10, r: 10, t: 10, b: 10 };
  it('rechnet Werte in Punkte um', () => {
    const pts = toPoints([0, 5, 10], 120, 60, pad, 10);
    expect(pts[0]).toEqual({ x: 10, y: 50 });
    expect(pts[2]).toEqual({ x: 110, y: 10 });
  });
  it('baut Pfade', () => {
    const pts = toPoints([0, 10], 120, 60, pad, 10);
    expect(linePath(pts)).toBe('M10.0 50.0 L110.0 10.0');
    expect(areaPath(pts, 50)).toBe('M10.0 50.0 L110.0 10.0 L110.0 50.0 L10.0 50.0 Z');
    expect(areaPath([], 50)).toBe('');
  });
  it('bleibt bei Höchstwert 0 auf der Grundlinie', () => {
    expect(toPoints([0, 0], 120, 60, pad, 0).every((p) => p.y === 50)).toBe(true);
  });
});

describe('Beschriftungen', () => {
  it('benennt Tierarten und kennt Unbekanntes', () => {
    expect(speciesName('dog')).toBe('Hunde');
    expect(speciesName('ufo')).toBe('ufo');
  });
  it('sortiert Inhalte absteigend', () => {
    const r = { routine_items: 5, routine_done: 50, doses_given: 1 } as Record<RecordKey, number>;
    const s = sortedRecords(r);
    expect(s[0]).toMatchObject({ key: 'routine_done', n: 50 });
    expect(s.find((x) => x.key === 'claims')?.n).toBe(0);
  });
  it('formatiert Zahlen deutsch', () => {
    expect(fmt(1234)).toBe('1.234');
  });
});

describe('Wachstum', () => {
  it('bildet die laufende Gesamtzahl mit Startwert', () => {
    expect(cumulative([2, 0, 3], 10)).toEqual([10, 12, 12, 15]);
    expect(cumulative([], 4)).toEqual([4]);
  });
  it('berechnet die Wachstumsquote', () => {
    expect(growthPct(19, 9)).toBe(111);
    expect(growthPct(10, 10)).toBe(0);
    expect(growthPct(8, 10)).toBe(-20);
    expect(growthPct(5, 0)).toBeNull();
  });
});

describe('Aktivität der letzten 24 Stunden', () => {
  it('sortiert nach Anzahl, lässt Nullen weg und zeigt Unbekanntes an', () => {
    const rows = sortedActivity({ pet: 1, routine_done: 5, signup: 0, neu_x: 2 });
    expect(rows.map((r) => r.key)).toEqual(['routine_done', 'neu_x', 'pet']);
    expect(rows[0]!.label).toBe('Routine abgehakt');
    expect(activityName('neu_x')).toBe('neu_x');
  });
});
