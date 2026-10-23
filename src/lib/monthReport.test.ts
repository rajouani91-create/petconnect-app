import { describe, expect, it } from 'vitest';
import { appointmentCounts, berlinDay, buildMonthReport, medicationCounts, monthRange, weightSummary, type MedInput } from './monthReport';

const base: MedInput = {
  id: 'm1',
  name: 'Meloxicam',
  frequency: 'daily',
  remind: true,
  times: ['08:00', '20:00'],
  starts_on: '2026-09-01',
  ends_on: null,
  stopped_on: null,
};

function only<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error('leer');
  return x;
}

describe('monthRange', () => {
  it.each([
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
    [2026, 10, 31],
  ])('liefert die richtige Monatslänge für %i-%i', (y, m, days) => {
    expect(monthRange(y, m).days).toBe(days);
    expect(monthRange(y, m).last.endsWith(`-${String(days).padStart(2, '0')}`)).toBe(true);
  });
});

describe('medicationCounts', () => {
  const range = monthRange(2026, 10);

  it('zählt geplante Gaben über den ganzen Monat', () => {
    const r = only(medicationCounts([base], [], range, '2026-10-01'));
    expect(r.planned).toBe(31 * 2);
    expect(r.done).toBe(0);
    expect(r.missed).toBe(0);
  });

  it('zählt erledigte und verpasste Gaben bis heute', () => {
    const doses = [
      { medication_id: 'm1', scheduled_on: '2026-10-01', scheduled_time: '08:00:00' },
      { medication_id: 'm1', scheduled_on: '2026-10-01', scheduled_time: '20:00:00' },
    ];
    const r = only(medicationCounts([base], doses, range, '2026-10-03'));
    expect(r.done).toBe(2);
    // Verpasst sind nur Gaben an Tagen vor heute: 1.10. (erledigt), 2.10. (zwei Gaben offen). Heute zählt noch nicht als verpasst.
    expect(r.missed).toBe(2);
  });

  it('begrenzt auf das Enddatum und den Monatsbeginn', () => {
    const med = { ...base, starts_on: '2026-09-20', ends_on: '2026-10-03' };
    const r = only(medicationCounts([med], [], range, '2026-10-31'));
    expect(r.planned).toBe(3 * 2);
  });

  it('zählt eine vorzeitig beendete Gabe nur bis zum Vortag des Beendens', () => {
    const med = { ...base, stopped_on: '2026-10-05' };
    const r = only(medicationCounts([med], [], range, '2026-10-31'));
    expect(r.planned).toBe(5 * 2);
  });

  it('zählt Bedarfsmedikamente nicht', () => {
    const med = { ...base, frequency: 'as_needed', remind: false };
    const r = only(medicationCounts([med], [], range, '2026-10-31'));
    expect(r.planned).toBe(0);
  });

  it('zählt keine Gaben ohne Erinnerung', () => {
    const med = { ...base, remind: false };
    const r = only(medicationCounts([med], [], range, '2026-10-31'));
    expect(r.planned).toBe(0);
  });

  it('zählt Gaben, die nur vor dem Monat liegen, nicht', () => {
    const med = { ...base, starts_on: '2026-08-01', ends_on: '2026-09-30' };
    const r = only(medicationCounts([med], [], range, '2026-10-31'));
    expect(r.planned).toBe(0);
  });

  it('akzeptiert Uhrzeiten mit Sekunden aus der Datenbank', () => {
    const doses = [{ medication_id: 'm1', scheduled_on: '2026-10-02', scheduled_time: '08:00:00' }];
    const r = only(medicationCounts([base], doses, range, '2026-10-03'));
    expect(r.done).toBe(1);
  });
});

describe('appointmentCounts', () => {
  it('zählt geplant, erledigt und abgesagt im Monat nach Berliner Datum', () => {
    const range = monthRange(2026, 10);
    const r = appointmentCounts(
      [
        { starts_at: '2026-10-05T10:00:00+02:00', status: 'planned' },
        { starts_at: '2026-10-06T10:00:00+02:00', status: 'done' },
        { starts_at: '2026-10-07T10:00:00+02:00', status: 'cancelled' },
        { starts_at: '2026-09-30T20:00:00Z', status: 'planned' },
      ],
      range,
    );
    expect(r).toEqual({ planned: 1, done: 1, cancelled: 1 });
  });

  it('rechnet Mitternacht in Europe/Berlin um', () => {
    // 2026-10-31T23:30Z ist am 1. November in Berlin
    expect(berlinDay('2026-10-31T23:30:00Z')).toBe('2026-11-01');
  });
});

describe('weightSummary', () => {
  const range = monthRange(2026, 10);

  it('meldet keine Messung, wenn im Monat nichts gemessen wurde', () => {
    const w = weightSummary([{ measured_on: '2026-09-15', kg: 4.2 }], range);
    expect(w.count).toBe(0);
    expect(w.diffKg).toBeNull();
  });

  it('liefert Anfang, Ende und Differenz', () => {
    const w = weightSummary(
      [
        { measured_on: '2026-10-20', kg: 4.4 },
        { measured_on: '2026-10-02', kg: 4.1 },
        { measured_on: '2026-10-12', kg: 4.3 },
      ],
      range,
    );
    expect(w.startDate).toBe('2026-10-02');
    expect(w.endDate).toBe('2026-10-20');
    expect(w.diffKg).toBeCloseTo(0.3, 2);
  });

  it('gibt bei nur einer Messung keine Differenz an', () => {
    const w = weightSummary([{ measured_on: '2026-10-10', kg: 4.0 }], range);
    expect(w.count).toBe(1);
    expect(w.diffKg).toBeNull();
  });
});

describe('buildMonthReport', () => {
  it('fasst alle Teile zusammen und zählt Erinnerungen', () => {
    const report = buildMonthReport(
      {
        meds: [base],
        doses: [],
        reminders: [
          { due_on: '2026-10-03', done_at: '2026-10-03T09:00:00Z' },
          { due_on: '2026-10-04', done_at: null },
          { due_on: '2026-10-25', done_at: null },
        ],
        appointments: [],
        weights: [],
      },
      2026,
      10,
      '2026-10-10',
    );
    expect(report.reminders).toEqual({ done: 1, overdue: 1, open: 1 });
    expect(report.medTotals.planned).toBe(62);
    expect(report.medTotals.missed).toBe(9 * 2);
  });
});
