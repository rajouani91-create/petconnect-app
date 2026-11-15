import { describe, expect, it } from 'vitest';
import { absenceError, dayError, dayText, hoursPayload, scheduleErrorKey, weekdayName, type DayHours } from './practiceSchedule';

const day = (o: Partial<DayHours> = {}): DayHours => ({ weekday: 1, open: true, opens: '08:00', closes: '18:00', break_from: null, break_to: null, ...o });

describe('Sprechzeiten', () => {
  it('prüft Reihenfolge und Mittagspause; geschlossene Tage nicht', () => {
    expect(dayError(day())).toBeNull();
    expect(dayError(day({ opens: '18:00', closes: '08:00' }))).toBe('scErrOrder');
    expect(dayError(day({ opens: '' }))).toBe('scErrTime');
    expect(dayError(day({ break_from: '12:00', break_to: '' }))).toBe('scErrBreak');
    expect(dayError(day({ break_from: '07:00', break_to: '09:00' }))).toBe('scErrBreak');
    expect(dayError(day({ break_from: '12:00', break_to: '14:00' }))).toBeNull();
    expect(dayError(day({ open: false, opens: '', closes: '' }))).toBeNull();
  });
  it('Daten für die Datenbank: leere Pause null, geschlossene Tage mit gültigen Zeiten', () => {
    expect(hoursPayload([day({ break_from: '', break_to: '' })])[0]).toEqual(day());
    expect(hoursPayload([day({ open: false, opens: '', closes: '', break_from: '12:00', break_to: '13:00' })])[0]).toEqual(day({ open: false }));
    expect(hoursPayload([day({ open: false, opens: '09:00', closes: '12:00' })])[0]).toEqual(day({ open: false, opens: '09:00', closes: '12:00' }));
  });
  it('Kurztext und Wochentage', () => {
    expect(dayText(day(), 'geschlossen')).toBe('08:00–18:00');
    expect(dayText(day({ break_from: '12:00', break_to: '14:00' }), 'geschlossen')).toBe('08:00–12:00, 14:00–18:00');
    expect(dayText(day({ open: false }), 'geschlossen')).toBe('geschlossen');
    expect(weekdayName(1, 'de-DE')).toBe('Montag');
    expect(weekdayName(7, 'de-DE')).toBe('Sonntag');
    expect(weekdayName(6, 'en-GB', 'short')).toBe('Sat');
  });
});

describe('Abwesenheit', () => {
  it('Datum Pflicht, Ende nicht vor Beginn, nicht ganz in der Vergangenheit', () => {
    expect(absenceError('', '', '2026-11-15')).toBe('scErrAbsFrom');
    expect(absenceError('2026-12-24', '2026-12-20', '2026-11-15')).toBe('scErrAbsOrder');
    expect(absenceError('2026-11-01', '2026-11-10', '2026-11-15')).toBe('scErrAbsPast');
    expect(absenceError('2026-11-10', '2026-11-20', '2026-11-15')).toBeNull();
    expect(absenceError('2026-12-24', '', '2026-11-15')).toBeNull();
  });
});

describe('Fehlertexte', () => {
  it('Code → Schlüssel', () => {
    expect(scheduleErrorKey({ message: 'forbidden' })).toBe('scErrLead');
    expect(scheduleErrorKey({ message: 'type_exists' })).toBe('scErrTypeExists');
    expect(scheduleErrorKey({ message: 'last_type' })).toBe('scErrLastType');
    expect(scheduleErrorKey(null)).toBe('pe_generic');
  });
});
