/* Eingabe prüfen, Notfall-Hinweise erkennen, Antwort prüfen. Reine Funktionen ohne Deno-Abhängigkeit (testbar mit vitest). */

export const MAX_MESSAGES = 10;
export const MAX_USER_CHARS = 1000;
export const MAX_ASSISTANT_CHARS = 4000;
export const MAX_TOTAL_CHARS = 8000;
export const MAX_BODY_BYTES = 24_000;
/** Mit Anhang (bereinigter Text oder verkleinertes JPEG als Base64) ist die Anfrage größer. */
export const MAX_ATTACH_BODY_BYTES = 2_200_000;
export const MAX_ATTACH_TEXT = 6000;
export const MAX_ATTACH_IMAGE_B64 = 1_950_000;
export const MAX_REPLY_CHARS = 5000;

export type Role = 'user' | 'assistant';
export interface ChatMessage {
  role: Role;
  content: string;
}
export type ValidationError = 'invalid_body' | 'too_many_messages' | 'message_too_long' | 'empty_message' | 'bad_order' | 'too_long_total';

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(s: string): string {
  return s.replace(CONTROL, '').replace(/\r\n/g, '\n').trim();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Nur die Rollen „user“ und „assistant“ sind erlaubt (kein „system“ vom Client), die letzte Nachricht muss vom Menschen sein. */
export function validateMessages(raw: unknown): { ok: true; messages: ChatMessage[] } | { ok: false; error: ValidationError } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'invalid_body' };
  if (raw.length > MAX_MESSAGES) return { ok: false, error: 'too_many_messages' };
  const out: ChatMessage[] = [];
  let total = 0;
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) return { ok: false, error: 'invalid_body' };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return { ok: false, error: 'invalid_body' };
    const text = cleanText(content);
    if (text.length === 0) return { ok: false, error: 'empty_message' };
    if (text.length > (role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return { ok: false, error: 'message_too_long' };
    total += text.length;
    out.push({ role, content: text });
  }
  if (total > MAX_TOTAL_CHARS) return { ok: false, error: 'too_long_total' };
  if (out[out.length - 1]!.role !== 'user') return { ok: false, error: 'bad_order' };
  return { ok: true, messages: out };
}

/* ---- Notfall-Erkennung (zusätzlich zur Einschätzung des Modells) ---- */
/* Bewusst eng gefasst: lieber ein Hinweis zu wenig bei Randfällen als ständiger Alarm bei Allgemeinfragen. */
const EMERGENCY: RegExp[] = [
  // Deutsch
  /krampf|krämpf|krampfanfall|epileptisch(er)? anfall/i,
  /atemnot|keine luft|schwer(e|er)? atm|japst|nicht (mehr )?atmen|atmet nicht/i,
  /bewusstlos|kollabiert|zusammengebrochen|reagiert nicht mehr/i,
  /vergiftet|vergiftung|giftköder|gift (gefressen|gefressen|geschluckt)|schokolade (gefressen|gegessen)|xylit|frostschutz/i,
  /blutet stark|starke blutung|blut (erbrochen|im erbrochenen)|blutiges erbrechen|blutiger durchfall/i,
  /aufgebläht|harter bauch|magendrehung|erfolglos(es)? würgen/i,
  /überfahren|unfall|biss(wunde)?|hitzschlag|kann nicht (mehr )?(pinkeln|urinieren|aufstehen)/i,
  // English
  /seizure|convuls/i,
  /(can'?t|cannot|struggling to|difficulty|trouble) breath|not breathing|gasping/i,
  /unconscious|collapsed|unresponsive/i,
  /poison|ate (chocolate|xylitol|antifreeze|rat poison)|swallowed (a )?(battery|magnet|sock)/i,
  /bleeding (heavily|badly|a lot)|vomit(ing)? blood|bloody (vomit|diarrh)/i,
  /bloat|swollen (belly|abdomen)|heat ?stroke|hit by (a )?car|can'?t (pee|urinate|stand)/i,
  // Français
  /convulsion|crise d'épilepsie|difficult[ée]s? (à|pour) respirer|ne respire (plus|pas)|inconscient|empoisonn|h[ée]morragie|coup de chaleur/i,
  // Español
  /convulsion|dificultad (para|al) respirar|no respira|inconsciente|envenen|hemorragia|golpe de calor|atropell/i,
  // Türkçe
  /n[öo]bet ge[çc]ir|nefes alam|bilin[çc]siz|zehirlen|kanama|sıcak çarpma/i,
  // Nederlands
  /stuip|ademnood|bewusteloos|vergiftig(d)?|hevig bloeden|oververhit/i,
  // Русский
  /судорог|не дышит|трудно дышать|без сознания|отравил|сильное кровотечение|тепловой удар/i,
  // العربية
  /تشنج|لا يتنفس|صعوبة في التنفس|فاقد الوعي|تسمم|نزيف/,
  // Svenska / Dansk / Norsk
  /kramper?|krampeanfall|andn[öo]d|ikke vejrtr|bevisstl[öo]s|f[öo]rgift|forgift|kraftig bl[öo]d/i,
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY.some((re) => re.test(text));
}

/* ---- Antwort des Modells prüfen ---- */
export const CANARY = 'PC-SYS-7F3A9';
export const EMERGENCY_MARK = '[[EMERGENCY]]';

export interface CleanReply {
  text: string;
  emergency: boolean;
}

/** Die Oberfläche zeigt reinen Text: Markdown-Zeichen entfernen, Sonderstriche und Leerzeichen vereinheitlichen. */
export function toPlainText(input: string): string {
  return input
    .replace(/[\u2010-\u2015\u2212]/g, '-') // geschützte/lange Bindestriche und Minuszeichen
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?![*\w])/g, '$1')
    .replace(/`+/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Wurde die Antwort wegen der Längenbegrenzung abgeschnitten, bis zum letzten vollständigen Satz bzw. Absatz kürzen. */
export function trimToLastSentence(text: string): string {
  const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('.\n'), text.lastIndexOf('?'), text.lastIndexOf('!'), text.lastIndexOf('\n'));
  const endsClean = /[.!?)]$/.test(text.trimEnd());
  if (endsClean || cut < text.length * 0.5) return text;
  return text.slice(0, cut + 1).trimEnd();
}

/** Entfernt die interne Notfall-Markierung, begrenzt die Länge und blockt Antworten, die den Systemprompt verraten. */
export function cleanReply(raw: string, truncated = false): CleanReply | null {
  let text = toPlainText(raw.replace(CONTROL, '')).trim();
  const emergency = text.includes(EMERGENCY_MARK);
  text = text.split(EMERGENCY_MARK).join('').trim();
  if (truncated) text = trimToLastSentence(text);
  if (text.length === 0) return null;
  if (text.includes(CANARY)) return null;
  if (text.length > MAX_REPLY_CHARS) text = `${text.slice(0, MAX_REPLY_CHARS - 1).trimEnd()}…`;
  return { text, emergency };
}

/* ---- Anhang: bereinigter Text oder verkleinertes JPEG, nur mit ausdrücklicher Einwilligung ---- */
export type Attachment = { kind: 'text'; text: string } | { kind: 'image'; mime: 'image/jpeg'; data: string };
export type AttachmentError = 'invalid_attachment' | 'attachment_too_long' | 'consent_required';

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function validateAttachment(raw: unknown, consent: unknown): { ok: true; attachment: Attachment | null } | { ok: false; error: AttachmentError } {
  if (raw === undefined || raw === null) return { ok: true, attachment: null };
  if (consent !== true) return { ok: false, error: 'consent_required' };
  if (typeof raw !== 'object') return { ok: false, error: 'invalid_attachment' };
  const a = raw as { kind?: unknown; text?: unknown; mime?: unknown; data?: unknown };
  if (a.kind === 'text') {
    if (typeof a.text !== 'string') return { ok: false, error: 'invalid_attachment' };
    const text = cleanText(a.text);
    if (text.length === 0) return { ok: false, error: 'invalid_attachment' };
    if (text.length > MAX_ATTACH_TEXT) return { ok: false, error: 'attachment_too_long' };
    return { ok: true, attachment: { kind: 'text', text } };
  }
  if (a.kind === 'image') {
    if (a.mime !== 'image/jpeg' || typeof a.data !== 'string') return { ok: false, error: 'invalid_attachment' };
    if (a.data.length > MAX_ATTACH_IMAGE_B64) return { ok: false, error: 'attachment_too_long' };
    // JPEG beginnt mit FF D8 FF, in Base64 „/9j/“
    if (!a.data.startsWith('/9j/') || !B64.test(a.data)) return { ok: false, error: 'invalid_attachment' };
    return { ok: true, attachment: { kind: 'image', mime: 'image/jpeg', data: a.data } };
  }
  return { ok: false, error: 'invalid_attachment' };
}
