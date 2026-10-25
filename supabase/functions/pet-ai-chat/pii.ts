/* Erkennung und Entfernung typischer personenbezogener Angaben in Text. Reine Funktionen ohne Abhängigkeiten.
   Wird im Browser VOR dem Senden benutzt (Vorschau + Schwärzen) und auf dem Server als zweite Kontrolle.
   Wichtig: Das ist eine Risikominderung, keine Garantie. Namen im Fließtext erkennt es nur über Beschriftungen („Besitzer: …“),
   Anreden und eine Liste bekannter Begriffe (z. B. Name der angemeldeten Person). */

export type PiiKind = 'email' | 'url' | 'iban' | 'chip' | 'phone' | 'address' | 'name' | 'field' | 'known';
export interface PiiSpan {
  readonly start: number;
  readonly end: number;
  readonly kind: PiiKind;
}

const CAP = '[A-ZÄÖÜ][a-zäöüßé.-]+';
const PATTERNS: readonly { kind: PiiKind; re: RegExp }[] = [
  { kind: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi },
  { kind: 'url', re: /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi },
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g },
  // Mikrochip-Nummer: 15 Ziffern, oft in Gruppen
  { kind: 'chip', re: /(?<![\d.,])\d{3}[ .-]?\d{3}[ .-]?\d{3}[ .-]?\d{3}[ .-]?\d{3}(?![\d])/g },
  // Zeilen mit Beschriftung: „Besitzer: Max Muster“, „Tel.: 0170 …“ – der ganze Wert bis Zeilenende (höchstens 80 Zeichen)
  {
    kind: 'field',
    re: /\b(?:Name|Besitzer(?:in)?|Tierhalter(?:in)?|Halter(?:in)?|Eigent(?:ü|ue)mer(?:in)?|Kund(?:e|in|ennummer|ennr\.?)|Patientenbesitzer(?:in)?|Auftraggeber(?:in)?|Rechnungsempf(?:ä|ae)nger(?:in)?|Rechnungsnr\.?|Rechnungsnummer|Patientennr\.?|Patientennummer|Geburtsdatum|Geb\.?-?Datum|geb\.|Telefon|Tel\.?|Fax|Mobil(?:telefon)?|Handy|E-?Mail|Adresse|Anschrift|Stra(?:ß|ss)e|PLZ|Wohnort|Owner|Client|Address|Phone|Mobile)\s*[:.]\s*[^\n]{0,80}/gi,
  },
  // Anrede + Name
  {
    kind: 'name',
    re: new RegExp(`\\b(?:Herrn?|Frau|Fam\\.|Familie|Dr\\.(?:\\s*med\\.(?:\\s*vet\\.)?)?|Prof\\.|Dipl\\.-Tzt\\.|Mr\\.?|Mrs\\.?|Ms\\.?)\\s+${CAP}(?:\\s+${CAP}){0,2}`, 'g'),
  },
  // Straße + Hausnummer, PLZ + Ort
  { kind: 'address', re: new RegExp(`\\b[A-ZÄÖÜ][a-zäöüß]+(?:stra(?:ß|ss)e|str\\.|weg|allee|platz|gasse|ring|damm|ufer)\\s*\\d+\\s?[a-z]?\\b`, 'g') },
  { kind: 'address', re: new RegExp(`\\b\\d{5}\\s+${CAP}(?:[- ]${CAP})?`, 'g') },
];

// Telefonnummer: mindestens 7 Ziffern, kein Datum
const PHONE = /(?:\+|00)?\d[\d\s/().-]{5,}\d/g;
const DATE_LIKE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const TIME_RANGE = /^\d{1,3}\s?[-–]\s?\d{1,3}$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phoneSpans(text: string): PiiSpan[] {
  const out: PiiSpan[] = [];
  for (const m of text.matchAll(PHONE)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    if (DATE_LIKE.test(raw.trim()) || TIME_RANGE.test(raw.trim())) continue;
    // Telefonnummern beginnen mit 0, + oder 00 (national/international) – Messwerte wie „12,5 – 25,0“ nicht
    if (!/^(?:\+|0)/.test(raw.trim())) continue;
    out.push({ start: m.index, end: m.index + raw.length, kind: 'phone' });
  }
  return out;
}

const PRIORITY: readonly PiiKind[] = ['email', 'iban', 'chip', 'phone', 'url', 'known', 'name', 'address', 'field'];
const rank = (k: PiiKind): number => PRIORITY.indexOf(k);

/** Überlappende Treffer werden zusammengefasst; die eindeutigste Art gewinnt (Telefon vor „beschriftetes Feld“). */
function merge(spans: PiiSpan[]): PiiSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PiiSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, s.end), kind: rank(s.kind) < rank(last.kind) ? s.kind : last.kind };
    } else out.push(s);
  }
  return out;
}

/** `known`: Begriffe, die garantiert entfernt werden sollen (Name, E-Mail, Adresse, Praxis der angemeldeten Person). */
export function findPii(text: string, known: readonly string[] = []): PiiSpan[] {
  const spans: PiiSpan[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) spans.push({ start: m.index, end: m.index + m[0].length, kind });
  }
  spans.push(...phoneSpans(text));
  for (const k of known) {
    const term = k.trim();
    if (term.length < 3) continue;
    for (const m of text.matchAll(new RegExp(escapeRe(term), 'gi'))) spans.push({ start: m.index, end: m.index + m[0].length, kind: 'known' });
  }
  return merge(spans);
}

export const REDACTED = '[…]';

export function redactText(text: string, known: readonly string[] = []): { text: string; count: number } {
  const spans = findPii(text, known);
  let out = '';
  let pos = 0;
  for (const s of spans) {
    out += text.slice(pos, s.start) + REDACTED;
    pos = s.end;
  }
  return { text: out + text.slice(pos), count: spans.length };
}

/** Server-Zweitkontrolle: nur Angaben, die praktisch nie ein Messwert sind. Gibt die gefundenen Arten zurück. */
export function hardPiiKinds(text: string): PiiKind[] {
  const kinds = new Set<PiiKind>();
  for (const s of findPii(text)) if (s.kind === 'email' || s.kind === 'iban' || s.kind === 'chip' || s.kind === 'phone' || s.kind === 'url') kinds.add(s.kind);
  return [...kinds];
}

/* ---- Laborzeilen: Positivliste statt Schwärzliste ---- */
const NUM = String.raw`[<>]?\d+(?:[.,]\d+)?`;
const RANGE = new RegExp(String.raw`\(?\s*${NUM}\s*[-–]\s*${NUM}\s*\)?`);
const UNIT = /(?:^|\s)(?:mg\/d?l|g\/d?l|mmol\/l|µmol\/l|umol\/l|µg\/d?l|ug\/d?l|ng\/ml|ng\/dl|pg\/ml|u\/l|iu\/l|ml\/min|fl|pg|%|g\/l|mg\/l|\/µl|\/ul|mio\.?\/µl|mio\.?\/ul|10\^\d+\/l|x10\^?\d+\/l|k\/µl|m\/µl|mosm\/kg|mval\/l|meq\/l|sec|s)(?=\s|$|\()/i;
const NUMBER_ONLY = new RegExp(`${NUM}`);

/** Zeilen, die wie ein Laborwert aussehen: Name, Zahl und (Einheit oder Referenzbereich), kurz. */
export function labLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 4 || line.length > 120) continue;
    if (!/^[A-Za-zÄÖÜäöüµ]/.test(line)) continue;
    if (!NUMBER_ONLY.test(line)) continue;
    if (RANGE.test(line) || UNIT.test(line)) out.push(line);
  }
  return out;
}
