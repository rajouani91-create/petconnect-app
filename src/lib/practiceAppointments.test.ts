import { describe, expect, it } from 'vitest';
import {
  bookErrors, bookPayload, bookingErrorKey, byDay, counts, emptyBook, endOf, filterAppointments, hasWarnings, isOpen, timeOf, toInstant, whenErrors,
  type PracticeAppointment,
} from './practiceAppointments';

const appt = (o: Partial<PracticeAppointment> = {}): PracticeAppointment => ({
  id: 'a', pet_id: 'p', has_access: true, pet_label: 'Bello', owner_label: 'Anna', phone: null, type_id: 't', type_name: 'Untersuchung',
  starts_at: '2026-11-20T09:00:00.000Z', minutes: 20, status: 'confirmed', source: 'phone', new_client: false, note: null,
  cancel_reason: null, cancel_note: null, overridden: false, created_by_name: 'Dr. X', created_at: '2026-11-10T09:00:00Z', ...o,
});
const now = new Date('2026-11-18T12:00:00Z');

describe('Zeit (Europe/Berlin)', () => {
  it('rechnet Wanduhrzeit in Zeitpunkte um – Winter und Sommer', () => {
    expect(toInstant('2026-11-20', '10:00')).toBe('2026-11-20T09:00:00.000Z');
    expect(toInstant('2026-07-01', '10:00')).toBe('2026-07-01T08:00:00.000Z');
    expect(timeOf('2026-11-20T09:00:00.000Z')).toBe('10:00');
    expect(endOf(appt())).toBe('2026-11-20T09:20:00.000Z');
  });
});

describe('Filter', () => {
  const rows = [
    appt({ id: '1' }),
    appt({ id: '2', starts_at: '2026-11-17T09:00:00Z' }),
    appt({ id: '3', status: 'cancelled_practice' }),
    appt({ id: '4', status: 'attended', starts_at: '2026-11-16T09:00:00Z' }),
    appt({ id: '5', status: 'new' }),
  ];
  it('trennt anstehend, offen, abgesagt und neu', () => {
    expect(filterAppointments(rows, 'confirmed', now).map((a) => a.id)).toEqual(['1']);
    expect(filterAppointments(rows, 'open', now).map((a) => a.id)).toEqual(['2']);
    expect(filterAppointments(rows, 'cancelled', now).map((a) => a.id)).toEqual(['3']);
    expect(filterAppointments(rows, 'new', now).map((a) => a.id)).toEqual(['5']);
    expect(counts(rows, now)).toEqual({ new: 1, confirmed: 1, open: 1, cancelled: 1, all: 5 });
    expect(isOpen(rows[0]!, now)).toBe(false);
  });
  it('gruppiert nach Berliner Kalendertag, aufsteigend', () => {
    const g = byDay([appt({ id: 'b', starts_at: '2026-11-20T23:30:00Z' }), appt({ id: 'a', starts_at: '2026-11-20T08:00:00Z' })]);
    expect(g.map((x) => x.day)).toEqual(['2026-11-20', '2026-11-21']);
  });
});

describe('Eingabe', () => {
  it('verlangt Patient bzw. Name, Terminart, Datum und Zeit', () => {
    expect(bookErrors(emptyBook('2026-11-20'), '2026-11-18', '12:00')).toEqual({ petId: 'bkErrPatient', typeId: 'bkErrType', time: 'bkErrTime' });
    expect(bookErrors({ ...emptyBook('2026-11-20', 't'), mode: 'free', time: '10:00' }, '2026-11-18', '12:00')).toEqual({ petName: 'piErrPet', ownerName: 'piErrOwner' });
  });
  it('lehnt Vergangenheit ab', () => {
    expect(whenErrors('2026-11-17', '10:00', '2026-11-18', '12:00')).toEqual({ day: 'bkErrPast' });
    expect(whenErrors('2026-11-18', '11:00', '2026-11-18', '12:00')).toEqual({ time: 'bkErrPast' });
    expect(whenErrors('2026-11-18', '13:00', '2026-11-18', '12:00')).toEqual({});
    expect(whenErrors('', '13:00', '2026-11-18', '12:00')).toEqual({ day: 'errDateRequired' });
  });
  it('baut die Nutzdaten je nach Modus', () => {
    const v = { ...emptyBook('2026-11-20', 't'), time: '10:00', petId: 'p', note: '  ' };
    expect(bookPayload(v)).toEqual({ type_id: 't', starts_at: '2026-11-20T09:00:00.000Z', new_client: false, note: null, pet_id: 'p' });
    expect(bookPayload({ ...v, mode: 'free', petName: ' Mia ', ownerName: 'Ben', phone: '' })).toMatchObject({ pet_name: 'Mia', owner_name: 'Ben', phone: null });
  });
  it('Warnungen und Fehlercodes', () => {
    expect(hasWarnings({ closed: null, absence: null, overlaps: [] })).toBe(false);
    expect(hasWarnings({ closed: 'break', absence: null, overlaps: [] })).toBe(true);
    expect(bookingErrorKey({ message: 'slot_conflict' })).toBe('bkErrConflict');
    expect(bookingErrorKey({ message: 'x' })).toBe('pe_generic');
  });
});
