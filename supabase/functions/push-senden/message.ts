/* Text einer Benachrichtigung in der Sprache der Person. Keine Gesundheitsdetails über das Nötige hinaus. */
import { TEXTS } from './texts.ts';

export type Job = {
  kind: 'medication' | 'reminder' | 'appointment' | 'routine' | 'practice' | 'booking' | 'recall' | 'inquiry' | 'invoice';
  ref_id: string; slot: string; pet: string; title: string; url: string; language: string;
  info: { rkind?: string; label?: string | null; amount?: number; unit?: string; hint?: string; time?: string; overdue?: boolean; location?: string | null; event?: string; target?: string; starts_at?: string; vaccine?: string; due_on?: string; urgency?: string; number?: string; gross?: number; currency?: string };
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[];
};

const LOCALE: Record<string, string> = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', ar: 'ar-u-nu-latn', nl: 'nl-NL', es: 'es-ES', ru: 'ru-RU', tr: 'tr-TR', sv: 'sv-SE', da: 'da-DK', no: 'nb-NO' };

export function buildMessage(j: Job): { title: string; body: string; url: string; tag: string } {
  const lang = TEXTS[j.language] ? j.language : 'de';
  const T = TEXTS[lang];
  const tag = `${j.kind}-${j.ref_id}-${j.slot}`;
  if (j.kind === 'medication') {
    const a = Number(j.info.amount);
    const u = T.u[j.info.unit ?? ''] ?? [j.info.unit ?? '', j.info.unit ?? ''];
    const amount = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 }).format(a);
    const hint = j.info.hint === 'with_food' ? ` · ${T.food}` : j.info.hint === 'empty_stomach' ? ` · ${T.empty}` : '';
    return {
      title: `${j.pet}: ${j.title}`,
      body: `${T.med.replace('{t}', j.info.time ?? '')} · ${amount} ${a === 1 ? u[0] : u[1]}${hint}. ${T.ask}`,
      url: j.url, tag,
    };
  }
  if (j.kind === 'routine') {
    const what = j.info.rkind === 'own' && j.info.label ? j.info.label : (T.k[j.info.rkind ?? ''] ?? j.info.label ?? '');
    return { title: `${j.pet}: ${what}`, body: `${T.at.replace('{t}', j.info.time ?? '')}. ${T.done}`, url: j.url, tag };
  }
  if (j.kind === 'reminder') {
    return { title: `${j.pet}: ${j.title}`, body: j.info.overdue ? T.overdue : T.today, url: j.url, tag };
  }
  if (j.kind === 'practice') {
    /* Praxis hat die Tierakte ergänzt: bewusst ohne Inhalt des Eintrags (Sperrbildschirm). j.title = Name der Praxis */
    return { title: `${j.pet}: ${T.prac}`, body: T.pracBody.replace('{p}', j.title), url: j.url, tag };
  }
  if (j.kind === 'booking') {
    /* Online-Buchung: j.title = Name der Praxis, j.pet = Tiername; Zeit in Berliner Ortszeit in der Sprache der Person */
    const t = T.bk[j.info.event ?? ''];
    if (t) {
      const d = j.info.starts_at
        ? new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(j.info.starts_at))
        : '';
      const fill = (x: string) => x.replace('{pet}', j.pet).replace('{p}', j.title).replace('{d}', d);
      return { title: j.info.target === 'practice' ? fill(t[0]) : `${j.pet}: ${fill(t[0])}`, body: fill(t[1]), url: j.url, tag };
    }
  }
  if (j.kind === 'recall') {
    /* Impferinnerung der Praxis: j.title = Name der Praxis; Fälligkeit als Kalenderdatum */
    const d = j.info.due_on
      ? new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${j.info.due_on}T12:00:00Z`))
      : '';
    return { title: `${j.pet}: ${T.rc[0]}`, body: T.rc[1].replace('{p}', j.title).replace('{v}', j.info.vaccine ?? '').replace('{d}', d), url: j.url, tag };
  }
  if (j.kind === 'inquiry') {
    /* Anfrage: neu → Praxis (j.title = Halter:in, ohne Inhalt der Nachricht); Antwort/Vorschlag → Halter:in (j.title = Praxis) */
    const ev = j.info.event === 'new' && j.info.urgency === 'emergency' ? 'new_emergency' : j.info.event ?? '';
    const t = T.iq[ev];
    if (t) {
      const fill = (x: string) => x.replace('{pet}', j.pet).replace('{o}', j.title).replace('{p}', j.title);
      return { title: ev.startsWith('new') ? fill(t[0]) : `${j.pet}: ${fill(t[0])}`, body: fill(t[1]), url: j.url, tag };
    }
  }
  if (j.kind === 'invoice') {
    /* Rechnung der Praxis: j.title = Rechnungssteller, Betrag in Landeswährung, Fälligkeit als Kalenderdatum */
    const t = T.inv[j.info.event ?? ''];
    if (t) {
      const a = new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: j.info.currency || 'EUR' }).format(Math.abs(Number(j.info.gross ?? 0)));
      const d = j.info.due_on
        ? new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${j.info.due_on}T12:00:00Z`))
        : '';
      const fill = (x: string) => x.replace('{p}', j.title).replace('{no}', j.info.number ?? '').replace('{a}', a).replace('{d}', d);
      return { title: `${j.pet}: ${fill(t[0])}`, body: fill(t[1]), url: j.url, tag };
    }
  }
  if (j.kind !== 'appointment') {
    /* unbekannte Art (neuere Datenbank als Funktion): neutrale Meldung statt eines falschen Textes */
    return { title: j.pet || 'PetConnect', body: j.title ?? '', url: j.url, tag };
  }
  return {
    title: `${j.pet}: ${j.title}`,
    body: T.appt.replace('{t}', j.info.time ?? '') + (j.info.location ? ` · ${j.info.location}` : ''),
    url: j.url, tag,
  };
}
