// Kalender-Datei (.ics, RFC 5545) für einen Termin oder eine Erinnerung.
// Inhalt bewusst knapp: Titel, Tiername, Ort – keine weiteren persönlichen Daten.

const CRLF = '\r\n';
const PRODID = '-//PetConnect//petconnect24.com//DE';
const UID_DOMAIN = 'petconnect24.com';

/** TEXT-Wert escapen: Backslash, Semikolon, Komma, Zeilenumbruch (RFC 5545, 3.3.11) */
export function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Zeile auf höchstens 75 Oktette (UTF-8) falten; Folgezeilen beginnen mit einem Leerzeichen.
 * Mehrbyte-Zeichen werden nicht zerschnitten.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join(CRLF);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Zeitpunkt → UTC-Form 20261103T090000Z */
export function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** YYYY-MM-DD → 20261103 */
export function icsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function build(lines: (string | null | false | undefined)[]): string {
  return lines.filter((l): l is string => typeof l === 'string').map(foldLine).join(CRLF) + CRLF;
}

function alarm(trigger: string, description: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(description)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

export interface IcsAppointment {
  id: string;
  title: string;
  petName: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  status?: string;
}

/** Termin mit Erinnerung 1 Tag und 1 Stunde vorher. Zeiten in UTC (mit Z), damit jede Zeitzone stimmt. */
export function appointmentIcs(a: IcsAppointment, now: Date = new Date()): string {
  const start = new Date(a.startsAt);
  const end = a.endsAt ? new Date(a.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const summary = `${a.title} (${a.petName})`;
  return build([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}@${UID_DOMAIN}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    a.location?.trim() ? `LOCATION:${escapeText(a.location.trim())}` : null,
    a.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    ...alarm('-P1D', summary),
    ...alarm('-PT1H', summary),
    'END:VEVENT',
    'END:VCALENDAR',
  ]);
}

export interface IcsReminder {
  id: string;
  title: string;
  petName: string;
  dueOn: string;
  repeatDays: number | null;
}

/** Ganztägig am Fälligkeitstag, bei Wiederholung RRULE, Erinnerung am Morgen um 9:00 */
export function reminderIcs(r: IcsReminder, now: Date = new Date()): string {
  const summary = `${r.title} (${r.petName})`;
  return build([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:reminder-${r.id}@${UID_DOMAIN}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART;VALUE=DATE:${icsDate(r.dueOn)}`,
    // ganztägig: DTEND ist der Folgetag (exklusiv)
    `DTEND;VALUE=DATE:${icsDate(nextDay(r.dueOn))}`,
    `SUMMARY:${escapeText(summary)}`,
    r.repeatDays ? `RRULE:FREQ=DAILY;INTERVAL=${r.repeatDays}` : null,
    'TRANSP:TRANSPARENT',
    // relativ zum Tagesbeginn (00:00 lokal) → 09:00 Uhr am Fälligkeitstag
    ...alarm('PT9H', summary),
    'END:VEVENT',
    'END:VCALENDAR',
  ]);
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Sicherer Dateiname aus einem Titel */
export function icsFilename(title: string): string {
  const base = title
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  return `${base || 'termin'}.ics`;
}

/** Datei im Browser herunterladen (öffnet auf dem Handy den Kalender) */
export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
