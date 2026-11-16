import { describe, expect, it } from 'vitest';
import type { PracticeAppointment } from './practiceAppointments';
import type { DayHours } from './practiceSchedule';
import {
  capacity, dayRows, dayStatus, inRow, isMovable, isoWeek, isoWeekday, monthGrid, nearestSlot, noShowRate, onDay, overlapGroups, rowCovered, shiftAnchor,
  stepSlot, weekDays, weekStart,
} from './practiceCalendar';

const H: DayHours[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, open: d < 7, opens: d === 6 ? '09:00' : '08:00', closes: d === 6 ? '12:00' : '18:00', break_from: d === 1 ? '12:00' : null, break_to: d === 1 ? '14:00' : null }));
const A = (o: Partial<PracticeAppointment>): PracticeAppointment => ({
  id: Math.random().toString(36), pet_id: null, has_access: false, pet_label: 'Bello', owner_label: 'Ole', phone: null, type_id: null, type_name: 'Impfung',
  starts_at: '2026-11-16T08:00:00.000Z', minutes: 30, status: 'confirmed', source: 'phone', new_client: false, note: null, cancel_reason: null, cancel_note: null,
  overridden: false, created_by_name: 'X', created_at: '2026-11-01T00:00:00Z', ...o,
});

describe('Kalender: Tage und Wochen', () => {
  it('Wochentag, Wochenbeginn, KW', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-15')).toBe(7);
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekDays('2026-11-18')[0]).toBe('2026-11-16');
    expect(isoWeek('2026-11-16')).toBe(47);
    expect(isoWeek('2027-01-01')).toBe(53);
  });
  it('Monatsblatt beginnt montags und deckt den Monat ab', () => {
    const g = monthGrid('2026-11-20');
    expect(g[0]![0]).toBe('2026-10-26');
    expect(g.flat()).toContain('2026-11-30');
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('Blättern', () => {
    expect(shiftAnchor('2026-11-16', 'day', -1)).toBe('2026-11-15');
    expect(shiftAnchor('2026-11-16', 'week', 1)).toBe('2026-11-23');
    expect(shiftAnchor('2026-01-31', 'month', 1)).toBe('2026-02-01');
  });
});

describe('Kalender: Status, Raster, Termine', () => {
  it('Abwesenheit vor Sprechzeit, Sonntag geschlossen', () => {
    expect(dayStatus('2026-11-16', H, [{ id: 'a', from: '2026-11-16', to: '2026-11-17', reason: 'Fortbildung' }])).toEqual({ kind: 'absence', reason: 'Fortbildung' });
    expect(dayStatus('2026-11-15', H, []).kind).toBe('closed');
    const rows = dayRows(dayStatus('2026-11-16', H, []));
    expect(rows[0]).toEqual({ time: '08:00', pause: false });
    expect(rows.find((r) => r.time === '12:30')!.pause).toBe(true);
    expect(rows).toHaveLength(20);
  });
  it('Zeilen, belegte Zeilen, Gruppen gleichzeitiger Termine', () => {
    const a = A({ starts_at: '2026-11-16T08:00:00.000Z', minutes: 60 }); // 09:00–10:00 Berlin
    const b = A({ starts_at: '2026-11-16T08:15:00.000Z', minutes: 15 });
    const c = A({ starts_at: '2026-11-16T10:00:00.000Z' });
    const x = A({ starts_at: '2026-11-16T09:00:00.000Z', status: 'cancelled_practice' });
    const day = onDay([a, b, c, x], '2026-11-16');
    expect(day).toHaveLength(3);
    expect(inRow(day, '09:00')).toHaveLength(2);
    expect(rowCovered(day, '09:30')).toBe(true);
    expect(overlapGroups(day).map((g) => g.length)).toEqual([2, 1]);
  });
  it('Auslastung und Ausfallquote', () => {
    const s = dayStatus('2026-11-17', H, []); // Di 08–18 = 600 min
    expect(capacity('2026-11-17', s, [A({ starts_at: '2026-11-17T08:00:00.000Z', minutes: 300 })])).toBe(0.5);
    expect(capacity('2026-11-15', dayStatus('2026-11-15', H, []), [])).toBeNull();
    const now = new Date('2026-11-16T12:00:00Z');
    const r = noShowRate([A({ status: 'attended', starts_at: '2026-11-10T08:00:00Z' }), A({ status: 'no_show', starts_at: '2026-11-11T08:00:00Z' }), A({ status: 'no_show', starts_at: '2026-09-01T08:00:00Z' })], now);
    expect(r).toEqual({ rate: 0.5, noShow: 1, total: 2 });
  });
  it('Verschieben: nur künftige offene Termine; nächstliegende und nächste freie Zeit', () => {
    const now = new Date('2026-11-16T07:00:00Z');
    expect(isMovable(A({}), now)).toBe(true);
    expect(isMovable(A({ status: 'attended' }), now)).toBe(false);
    expect(isMovable(A({ starts_at: '2026-11-16T06:00:00Z' }), now)).toBe(false);
    const slots = ['2026-11-17T07:00:00.000Z', '2026-11-17T09:15:00.000Z', '2026-11-17T13:00:00.000Z'];
    expect(nearestSlot(slots, '10:00')).toBe('2026-11-17T09:15:00.000Z');
    expect(nearestSlot([], '10:00')).toBeNull();
    expect(stepSlot(slots, '2026-11-17T09:15:00.000Z', 1)).toBe('2026-11-17T13:00:00.000Z');
    expect(stepSlot(slots, '2026-11-17T09:15:00.000Z', -1)).toBe('2026-11-17T07:00:00.000Z');
    expect(stepSlot(slots, '2026-11-17T07:00:00.000Z', -1)).toBeNull();
  });
});
