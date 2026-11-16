import { describe, expect, it } from 'vitest';
import { addDays, bookingFormErrors, bookingOwnerErrorKey, bookingPayload, emptyBookingForm, practiceAddress } from './booking';

describe('Online-Buchung (Halter:in)', () => {
  it('Tage weiterzählen über Monats- und Zeitumstellung', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('Adresse ohne leere Teile', () => {
    expect(practiceAddress({ street: 'Mainstraße', housenumber: '12', postcode: '65428', city: 'Rüsselsheim' })).toBe('Mainstraße 12, 65428 Rüsselsheim');
    expect(practiceAddress({ street: null, housenumber: null, postcode: null, city: 'Mainz' })).toBe('Mainz');
  });
  it('Pflichtangaben: Tier, Terminart, Zeit', () => {
    expect(bookingFormErrors(emptyBookingForm('2026-11-20'))).toEqual({ petId: 'obErrPet', typeId: 'bkErrType', slot: 'obErrSlot' });
    expect(bookingFormErrors({ ...emptyBookingForm('2026-11-20'), petId: 'p', typeId: 't', slot: 'x', note: 'a'.repeat(301) })).toEqual({ note: 'obErrLong' });
  });
  it('Freigabe nur, wenn angekreuzt und noch keine besteht', () => {
    const v = { ...emptyBookingForm('2026-11-20'), petId: 'p', typeId: 't', slot: '2026-11-20T08:00:00.000Z', note: '  ', phone: ' 0171 ', share: true };
    expect(bookingPayload('pr', v, false)).toEqual({ practice_id: 'pr', pet_id: 'p', type_id: 't', starts_at: '2026-11-20T08:00:00.000Z', note: null, phone: '0171', share: true });
    expect(bookingPayload('pr', v, true).share).toBe(false);
    expect(bookingPayload('pr', { ...v, share: false }, false).share).toBe(false);
  });
  it('Fehlercodes', () => {
    expect(bookingOwnerErrorKey({ message: 'slot_taken' })).toBe('obErrTaken');
    expect(bookingOwnerErrorKey({ message: 'too_many_open' })).toBe('obErrTooManyOpen');
    expect(bookingOwnerErrorKey({ message: 'too_late' })).toBe('obErrTooLate');
    expect(bookingOwnerErrorKey({ message: 'booking_unavailable' })).toBe('obErrUnavailable');
    expect(bookingOwnerErrorKey(new Error('x'))).toBe('pe_generic');
  });
});
