import { describe, expect, it } from 'vitest';
import { appointmentIcs, escapeText, foldLine, icsFilename, icsUtc, reminderIcs } from './ics';

const NOW = new Date('2026-10-16T08:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const enc = new TextEncoder();

describe('Escaping und Falten', () => {
  it('Komma, Semikolon, Backslash, Zeilenumbruch', () => {
    expect(escapeText('Kontrolle, Ohr; links')).toBe('Kontrolle\\, Ohr\\; links');
    expect(escapeText('a\\b')).toBe('a\\\\b');
    expect(escapeText('Zeile 1\nZeile 2\r\nZeile 3')).toBe('Zeile 1\\nZeile 2\\nZeile 3');
  });
  it('Zeilen höchstens 75 Oktette, Mehrbyte-Zeichen bleiben ganz', () => {
    const long = `SUMMARY:${'Ä'.repeat(60)}`;
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    expect(foldLine('KURZ:x')).toBe('KURZ:x');
  });
  it('UTC-Zeit und Dateiname', () => {
    expect(icsUtc(new Date('2026-11-03T09:00:00Z'))).toBe('20261103T090000Z');
    expect(icsFilename('Kontrolle Ohr-Luna')).toBe('kontrolle-ohr-luna.ics');
    expect(icsFilename('Ärztin / Größe')).toBe('arztin-grosse.ics');
    expect(icsFilename('###')).toBe('termin.ics');
  });
});

describe('Termin als .ics', () => {
  const ics = appointmentIcs(
    { id: 'abc-123', title: 'Kontrolle, Ohr', petName: 'Luna', startsAt: '2026-11-03T09:00:00.000Z', endsAt: '2026-11-03T09:30:00.000Z', location: 'Praxis Dr. Muster; Hauptstr. 1', status: 'planned' },
    NOW,
  );
  const flat = unfold(ics);

  it('CRLF überall, Pflichtfelder, UID mit Domain', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n|\r/);
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    for (const f of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:', 'BEGIN:VEVENT', 'DTSTAMP:20261016T080000Z', 'END:VEVENT', 'END:VCALENDAR']) expect(flat).toContain(f);
    expect(flat).toContain('UID:abc-123@petconnect24.com');
  });
  it('Zeit in UTC mit Z, Titel mit Tiername, Ort escaped', () => {
    expect(flat).toContain('DTSTART:20261103T090000Z');
    expect(flat).toContain('DTEND:20261103T093000Z');
    expect(flat).toContain('SUMMARY:Kontrolle\\, Ohr (Luna)');
    expect(flat).toContain('LOCATION:Praxis Dr. Muster\\; Hauptstr. 1');
  });
  it('zwei Alarme: 1 Tag und 1 Stunde vorher', () => {
    expect(flat.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(flat).toContain('TRIGGER:-P1D');
    expect(flat).toContain('TRIGGER:-PT1H');
    expect(flat).toContain('ACTION:DISPLAY');
  });
  it('ohne Ende eine Stunde, ohne Ort keine LOCATION, keine Notiz', () => {
    const f = unfold(appointmentIcs({ id: 'x', title: 'T', petName: 'Mio', startsAt: '2026-11-03T09:00:00.000Z', endsAt: null, location: null }, NOW));
    expect(f).toContain('DTEND:20261103T100000Z');
    expect(f).not.toContain('LOCATION');
    expect(f).not.toContain('DESCRIPTION:Notiz');
  });
  it('abgesagt → STATUS:CANCELLED', () => {
    expect(unfold(appointmentIcs({ id: 'x', title: 'T', petName: 'Mio', startsAt: '2026-11-03T09:00:00.000Z', endsAt: null, location: null, status: 'cancelled' }, NOW))).toContain('STATUS:CANCELLED');
  });
});

describe('Erinnerung als .ics', () => {
  it('ganztägig, mit RRULE bei Wiederholung, Alarm 9:00', () => {
    const f = unfold(reminderIcs({ id: 'r1', title: 'Wurmkur', petName: 'Luna', dueOn: '2026-12-31', repeatDays: 90 }, NOW));
    expect(f).toContain('DTSTART;VALUE=DATE:20261231');
    expect(f).toContain('DTEND;VALUE=DATE:20270101');
    expect(f).toContain('RRULE:FREQ=DAILY;INTERVAL=90');
    expect(f).toContain('TRIGGER:PT9H');
    expect(f).toContain('UID:reminder-r1@petconnect24.com');
    expect(f).toContain('SUMMARY:Wurmkur (Luna)');
  });
  it('einmalig ohne RRULE', () => {
    expect(unfold(reminderIcs({ id: 'r2', title: 'Kontrolle', petName: 'Mio', dueOn: '2026-11-01', repeatDays: null }, NOW))).not.toContain('RRULE');
  });
});
