import { describe, expect, it } from 'vitest';
import {
  addDays,
  completeErrorKey,
  daysToRepeat,
  derivedVaccReminders,
  doneOnError,
  formatDateTime,
  formatDay,
  groupReminders,
  localDate,
  localTime,
  reminderGroup,
  reminderStatus,
  repeatToDays,
  shorten,
  splitAppointments,
  toInstant,
  validateAppointment,
  validateReminder,
  type ApptFormValues,
  type RemFormValues,
} from './schedule';

// Die Tests laufen mit TZ=Europe/Berlin (siehe vite.config.ts), wie auf dem Gerät der Nutzer:innen.
const TODAY = '2026-10-16';

describe('Datum und Uhrzeit', () => {
  it('lokales Datum und Uhrzeit', () => {
    const d = new Date(2026, 10, 3, 9, 5);
    expect(localDate(d)).toBe('2026-11-03');
    expect(localTime(d)).toBe('09:05');
  });
  it('Tage addieren über Monats- und Jahresgrenzen und die Zeitumstellung', () => {
    expect(addDays('2026-10-16', 1)).toBe('2026-10-17');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('Datum + Uhrzeit → Zeitpunkt in der Zeitzone des Geräts', () => {
    expect(toInstant('2026-11-03', '10:00')).toBe('2026-11-03T09:00:00.000Z'); // Winterzeit (UTC+1)
    expect(toInstant('2026-07-01', '10:00')).toBe('2026-07-01T08:00:00.000Z'); // Sommerzeit (UTC+2)
    expect(toInstant('2026-02-30', '10:00')).toBeNull();
    expect(toInstant('2026-11-03', '24:00')).toBeNull();
    expect(toInstant('2026-11-03', '9:00')).toBeNull();
  });
  it('Anzeige „Di., 03.11.2026, 10:00“', () => {
    expect(formatDateTime('2026-11-03T09:00:00.000Z', 'de-DE')).toBe('Di., 03.11.2026, 10:00');
    expect(formatDay('2026-11-03', 'de-DE')).toBe('Di., 03.11.2026');
  });
  it('Notiz kürzen an der Wortgrenze', () => {
    expect(shorten('kurz')).toBe('kurz');
    const long = 'Bitte nüchtern kommen und den Impfpass sowie die letzten Befunde aus der Klinik mitbringen, danke!';
    const s = shorten(long, 40);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/\s…$/);
    expect(shorten('  mehrere   Leerzeichen\nund Zeilen  ')).toBe('mehrere Leerzeichen und Zeilen');
  });
});

describe('Termine', () => {
  const base: ApptFormValues = { petId: 'p1', title: 'Kontrolle', kind: 'vet', date: '2026-11-03', start: '10:00', end: '', location: '', note: '' };
  it('gültige Eingaben', () => {
    expect(validateAppointment(base)).toEqual({});
    expect(validateAppointment({ ...base, end: '10:30' })).toEqual({});
  });
  it('Pflichtfelder, Ende vor oder gleich Beginn, Längen', () => {
    expect(validateAppointment({ ...base, title: '  ' })).toEqual({ title: 'apErrTitle' });
    expect(validateAppointment({ ...base, title: 'x'.repeat(121) })).toEqual({ title: 'apErrTitleLong' });
    expect(validateAppointment({ ...base, petId: '' })).toEqual({ petId: 'apErrPet' });
    expect(validateAppointment({ ...base, date: '' })).toEqual({ date: 'errDateRequired' });
    expect(validateAppointment({ ...base, start: '' })).toEqual({ start: 'apErrStart' });
    expect(validateAppointment({ ...base, end: '09:59' })).toEqual({ end: 'apErrEnd' });
    expect(validateAppointment({ ...base, end: '10:00' })).toEqual({ end: 'apErrEnd' });
    expect(validateAppointment({ ...base, location: 'x'.repeat(201) })).toEqual({ location: 'apErrLocation' });
    expect(validateAppointment({ ...base, note: 'x'.repeat(1001) })).toEqual({ note: 'errNoteLong' });
  });
  it('Nächste (geplant, ab heute, aufsteigend) und vergangene/abgeschlossene (neueste zuerst)', () => {
    const a = (id: string, starts_at: string, status = 'planned') => ({ id, starts_at, status });
    const { upcoming, past } = splitAppointments(
      [a('later', '2026-11-20T09:00:00Z'), a('earlyToday', '2026-10-16T05:00:00Z'), a('yesterday', '2026-10-15T09:00:00Z'), a('done', '2026-11-01T09:00:00Z', 'done'), a('next', '2026-10-20T09:00:00Z'), a('cancelled', '2026-10-25T09:00:00Z', 'cancelled')],
      TODAY,
    );
    expect(upcoming.map((x) => x.id)).toEqual(['earlyToday', 'next', 'later']);
    expect(past.map((x) => x.id)).toEqual(['done', 'cancelled', 'yesterday']);
  });
});

describe('Wiederholung', () => {
  it('Auswahl → Tage', () => {
    expect(repeatToDays('once', '')).toEqual({ ok: true, days: null });
    expect(repeatToDays('weekly', '')).toEqual({ ok: true, days: 7 });
    expect(repeatToDays('monthly', '')).toEqual({ ok: true, days: 30 });
    expect(repeatToDays('quarterly', '')).toEqual({ ok: true, days: 90 });
    expect(repeatToDays('halfyear', '')).toEqual({ ok: true, days: 182 });
    expect(repeatToDays('yearly', '')).toEqual({ ok: true, days: 365 });
    expect(repeatToDays('custom', '14')).toEqual({ ok: true, days: 14 });
    expect(repeatToDays('custom', ' 3650 ')).toEqual({ ok: true, days: 3650 });
  });
  it('eigene Anzahl: nur ganze Zahlen 1–3650', () => {
    for (const bad of ['', '0', '3651', '-3', '1,5', 'zehn', '1e2']) expect(repeatToDays('custom', bad)).toEqual({ ok: false, error: 'rmErrDays' });
  });
  it('Tage → Auswahl (zum Ändern)', () => {
    expect(daysToRepeat(null)).toEqual({ choice: 'once', custom: '' });
    expect(daysToRepeat(90)).toEqual({ choice: 'quarterly', custom: '' });
    expect(daysToRepeat(14)).toEqual({ choice: 'custom', custom: '14' });
  });
});

describe('Erinnerungen: Gruppen und Status', () => {
  it('Grenzen: gestern, heute, +30, +31', () => {
    expect(reminderGroup('2026-10-15', TODAY)).toBe('overdue');
    expect(reminderGroup(TODAY, TODAY)).toBe('today');
    expect(reminderGroup('2026-10-17', TODAY)).toBe('soon');
    expect(reminderGroup('2026-11-15', TODAY)).toBe('soon'); // +30
    expect(reminderGroup('2026-11-16', TODAY)).toBe('later'); // +31
  });
  it('Status in Worten', () => {
    expect(reminderStatus('2026-10-13', TODAY)).toEqual({ key: 'rmOverdueN', n: 3 });
    expect(reminderStatus('2026-10-15', TODAY)).toEqual({ key: 'rmOverdue1', n: 1 });
    expect(reminderStatus(TODAY, TODAY)).toEqual({ key: 'rmToday', n: 0 });
    expect(reminderStatus('2026-10-17', TODAY)).toEqual({ key: 'rmIn1', n: 1 });
    expect(reminderStatus('2026-10-21', TODAY)).toEqual({ key: 'rmInN', n: 5 });
  });
  it('Gruppieren; erledigte einmalige getrennt, wiederkehrende bleiben offen', () => {
    const r = (id: string, due_on: string, repeat_days: number | null = null, done_at: string | null = null) => ({ id, due_on, repeat_days, done_at, title: id });
    const g = groupReminders(
      [r('b-over', '2026-10-10'), r('a-over', '2026-10-01', 30), r('heute', TODAY), r('bald', '2026-11-01'), r('spaet', '2027-01-01', 365), r('fertig', '2026-10-01', null, '2026-10-02T10:00:00Z'), r('fertig2', '2026-09-01', null, '2026-10-05T10:00:00Z'), r('wied', '2026-10-01', 7, null)],
      TODAY,
    );
    expect(g.overdue.map((x) => x.id)).toEqual(['a-over', 'wied', 'b-over']);
    expect(g.today.map((x) => x.id)).toEqual(['heute']);
    expect(g.soon.map((x) => x.id)).toEqual(['bald']);
    expect(g.later.map((x) => x.id)).toEqual(['spaet']);
    expect(g.done.map((x) => x.id)).toEqual(['fertig2', 'fertig']);
  });
  it('Formular und „Erledigt am“', () => {
    const base: RemFormValues = { petId: 'p', title: 'Wurmkur', kind: 'deworming', dueOn: TODAY, repeat: 'quarterly', customDays: '', note: '' };
    expect(validateReminder(base)).toEqual({});
    expect(validateReminder({ ...base, title: '' })).toEqual({ title: 'rmErrTitle' });
    expect(validateReminder({ ...base, repeat: 'custom', customDays: '0' })).toEqual({ customDays: 'rmErrDays' });
    expect(validateReminder({ ...base, dueOn: '' })).toEqual({ dueOn: 'errDateRequired' });
    // fällig am darf in der Vergangenheit liegen (z. B. vergessene Wurmkur)
    expect(validateReminder({ ...base, dueOn: '2026-01-01' })).toEqual({});
    expect(doneOnError(TODAY, TODAY)).toBeUndefined();
    expect(doneOnError('2026-10-17', TODAY)).toBe('errFuture');
    expect(doneOnError('', TODAY)).toBe('errDateRequired');
  });
  it('Fehler aus complete_reminder', () => {
    expect(completeErrorKey('reminder_future')).toBe('errFuture');
    expect(completeErrorKey('reminder_not_found')).toBe('rmErrNotFound');
    expect(completeErrorKey('reminder_not_allowed')).toBe('errRights');
    expect(completeErrorKey('was anderes')).toBe('errGeneric');
  });
});

describe('Abgeleitete Impf-Erinnerungen', () => {
  const v = (id: string, valid_until: string | null) => ({ id, pet_id: 'p', name: id, valid_until });
  it('nächste 60 Tage und abgelaufen; ohne Datum und später nicht', () => {
    const d = derivedVaccReminders([v('spaeter', '2026-12-16'), v('grenze', '2026-12-15'), v('abgelaufen', '2026-09-01'), v('ohne', null), v('heute', TODAY), v('kaputt', '2026-02-30')], TODAY);
    expect(d.map((x) => x.id)).toEqual(['abgelaufen', 'heute', 'grenze']);
    expect(d.map((x) => x.group)).toEqual(['overdue', 'today', 'later']);
  });
});
