/* Urkunde prüfen: reine Funktionen ohne Netzwerk.
   Text-PDFs werden nur hier im Code verglichen (kein KI-Dienst). Für Fotos/Scans liefert ein Bildmodell die Felder,
   der Vergleich passiert ebenfalls hier. Ergebnis ist eine Vorprüfung für den Betreiber, keine Entscheidung. */

export type Title = 'small_animals' | 'surgery' | 'reptiles' | 'birds' | 'horses';

/** Wortstämme je Fachtitel (vereinfacht geschrieben, siehe simple()) */
const TITLE_WORDS: Record<Title, string[]> = {
  small_animals: ['kleintier'],
  surgery: ['chirurg'],
  reptiles: ['reptil'],
  birds: ['vogel'],
  horses: ['pferd'],
};

/** klein, ohne Akzente, ä→a ö→o ü→u ß→ss, Leerraum vereinheitlicht */
export function simple(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nachname = letztes Wort ohne akademische Titel */
export function lastName(person: string): string {
  const words = simple(person).replace(/[.,]/g, ' ').split(' ').filter((w) => w && !['dr', 'med', 'vet', 'prof', 'phd', 'dipl', 'mag'].includes(w));
  return words[words.length - 1] ?? '';
}

export interface Reading {
  method: 'text' | 'vision';
  /** Das Dokument sieht nach einer Fachtierarzt-Anerkennung aus */
  is_certificate: boolean;
  title_match: boolean;
  name_match: boolean;
  chamber_found: boolean;
  /** alles passt – Vorschlag „bestätigen“ */
  matches: boolean;
  /** kurze Angaben aus dem Dokument (nur bei Bildmodell), höchstens 120 Zeichen je Feld */
  title_text?: string;
  holder_name?: string;
  issuer?: string;
  issue_date?: string;
}

function finish(r: Omit<Reading, 'matches'>): Reading {
  return { ...r, matches: r.is_certificate && r.title_match && r.name_match && r.chamber_found };
}

/** Text einer PDF-Urkunde gegen Titel und Namen prüfen */
export function checkText(text: string, title: Title, person: string): Reading {
  const t = simple(text);
  const ln = lastName(person);
  return finish({
    method: 'text',
    is_certificate: /fachtierarzt|fachtierarztin|fachtierarzte/.test(t),
    title_match: TITLE_WORDS[title].some((w) => t.includes(w)),
    name_match: ln.length >= 2 && t.includes(ln),
    chamber_found: /tierarztekammer|tierarztkammer|landestierarztekammer|kammer/.test(t),
  });
}

const cut = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 120) : '');

/** Antwort des Bildmodells (JSON) prüfen; Unlesbares → null */
export function checkVision(raw: string, title: Title, person: string): Reading | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const titleText = cut(j.title_text);
  const holder = cut(j.holder_name);
  const issuer = cut(j.issuer);
  const base = checkText(`${titleText} ${issuer}`, title, '');
  const ln = lastName(person);
  return finish({
    method: 'vision',
    is_certificate: j.is_certificate === true && base.is_certificate,
    title_match: base.title_match,
    name_match: ln.length >= 2 && simple(holder).includes(ln),
    chamber_found: base.chamber_found,
    title_text: titleText,
    holder_name: holder,
    issuer,
    issue_date: cut(j.issue_date),
  });
}

/** Anweisung an das Bildmodell: nur Felder auslesen, nichts bewerten */
export const VISION_PROMPT =
  'Lies dieses Dokument. Es soll eine deutsche Anerkennung als Fachtierarzt/Fachtierärztin sein. ' +
  'Antworte ausschließlich mit JSON: {"is_certificate": true|false, "title_text": "Bezeichnung wörtlich, z. B. Fachtierarzt für Chirurgie", ' +
  '"holder_name": "Name der Person", "issuer": "ausstellende Stelle", "issue_date": "Datum"}. Unbekannt = leerer Text. Keine weiteren Angaben.';
