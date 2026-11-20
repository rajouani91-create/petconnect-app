import { describe, expect, it } from 'vitest';
import { closedBands, gridRange, layoutDay, timeAtY } from './practiceCalendar';
import type { PracticeAppointment } from './practiceAppointments';

const A = (id: string, iso: string, minutes: number) => ({ id, starts_at: iso, minutes, status: 'confirmed' } as unknown as PracticeAppointment);
const open = { kind: 'open' as const, opens: '08:00', closes: '18:00', breakFrom: '12:00', breakTo: '14:00' };

describe('Zeitraster', () => {
  it('Bereich aus Sprechzeiten und Terminen, volle Stunden', () => {
    expect(gridRange([open, { kind: 'closed' }], [])).toEqual({ start: 480, end: 1080 });
    // Termin 07:15 Berlin (Winter, UTC+1) erweitert nach vorn
    expect(gridRange([open], [A('a', '2026-11-20T06:15:00Z', 30)])).toEqual({ start: 420, end: 1080 });
    expect(gridRange([{ kind: 'closed' }], [])).toEqual({ start: 480, end: 1080 });
  });
  it('gleichzeitige Termine nebeneinander', () => {
    const l = layoutDay([A('a', '2026-11-20T08:00:00Z', 30), A('b', '2026-11-20T08:15:00Z', 30), A('c', '2026-11-20T08:45:00Z', 15), A('d', '2026-11-20T10:00:00Z', 20)]);
    const m = Object.fromEntries(l.map((x) => [x.a.id, [x.col, x.cols]]));
    expect(m).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1], d: [0, 1] });
  });
  it('geschlossene Bereiche und Pause', () => {
    expect(closedBands(open, 420, 1140)).toEqual([{ from: 420, to: 480, kind: 'closed' }, { from: 720, to: 840, kind: 'pause' }, { from: 1080, to: 1140, kind: 'closed' }]);
    expect(closedBands({ kind: 'absence', reason: 'Urlaub' }, 480, 1080)).toEqual([{ from: 480, to: 1080, kind: 'closed' }]);
  });
  it('Uhrzeit aus der Position, auf 15 Minuten gerundet', () => {
    expect(timeAtY(0, 480, 1080)).toBe('08:00');
    expect(timeAtY(96 + 20, 480, 1080)).toBe('09:15');
    expect(timeAtY(99999, 480, 1080, 30)).toBe('17:30');
    expect(timeAtY(-50, 480, 1080)).toBe('08:00');
  });
});
