// Tierakte: Gewicht, Impfungen, Dokumente – reine Hilfsfunktionen (ohne Supabase und React), damit sie testbar sind.
import type { MessageKey } from '../i18n';

// ---------- Datum ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Gültiges Kalenderdatum im Format YYYY-MM-DD? (2026-02-30 ist ungültig) */
export function isIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Tage von `from` bis `to` (beide YYYY-MM-DD), ohne Zeitzonen-Effekte */
export function daysBetween(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

// ---------- Gewicht ----------

export const KG_MIN_EXCLUSIVE = 0;
export const KG_MAX_EXCLUSIVE = 2000;

export type KgResult = { ok: true; kg: number } | { ok: false; error: 'required' | 'format' | 'decimals' | 'range' };

/**
 * Gewichtseingabe lesen: Komma und Punkt als Dezimaltrenner, höchstens 2 Nachkommastellen,
 * größer 0 und kleiner 2000. Leerzeichen und „kg“ am Ende werden ignoriert.
 */
export function parseKg(input: string): KgResult {
  const s = input.trim().replace(/\s*kg$/i, '').replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'required' };
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!m) return { ok: false, error: 'format' };
  if (m[2] && m[2].length > 2) return { ok: false, error: 'decimals' };
  const kg = Number(`${m[1]}.${m[2] ?? '0'}`);
  if (!Number.isFinite(kg) || kg <= KG_MIN_EXCLUSIVE || kg >= KG_MAX_EXCLUSIVE) return { ok: false, error: 'range' };
  return { ok: true, kg: Math.round(kg * 100) / 100 };
}

export const KG_ERROR: Record<Exclude<KgResult, { ok: true }>['error'], MessageKey> = {
  required: 'wkErrRequired',
  format: 'wkErrFormat',
  decimals: 'wkErrDecimals',
  range: 'wkErrRange',
};

export interface WeightLike {
  id: string;
  measured_on: string;
  kg: number;
  created_at: string;
}

/** Neueste Messung zuerst (Datum, dann Eingabezeit) */
export function sortWeightsDesc<T extends WeightLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.measured_on.localeCompare(a.measured_on) || b.created_at.localeCompare(a.created_at));
}

/**
 * Veränderung jeder Messung zur vorherigen (älteren). Liste neueste zuerst;
 * die älteste Messung hat keine Veränderung (null). Gerundet auf 2 Nachkommastellen.
 */
export function weightDeltas<T extends WeightLike>(rowsDesc: readonly T[]): (number | null)[] {
  return rowsDesc.map((r, i) => {
    const prev = rowsDesc[i + 1];
    return prev ? Math.round((Number(r.kg) - Number(prev.kg)) * 100) / 100 : null;
  });
}

export type WeightRange = '30d' | '3m' | '6m' | 'all';
export const WEIGHT_RANGES: readonly WeightRange[] = ['30d', '3m', '6m', 'all'];
const RANGE_DAYS: Record<Exclude<WeightRange, 'all'>, number> = { '30d': 30, '3m': 91, '6m': 182 };

/** Messungen im gewählten Zeitraum bis `today` (YYYY-MM-DD); „Alles“ lässt nichts weg. Reihenfolge bleibt erhalten. */
export function filterWeightsByRange<T extends WeightLike>(rows: readonly T[], range: WeightRange, today: string): T[] {
  if (range === 'all') return [...rows];
  const max = RANGE_DAYS[range];
  return rows.filter((r) => daysBetween(r.measured_on, today) <= max);
}

export interface WeightTrend {
  /** Datum der ältesten Messung im Zeitraum */
  from: string;
  /** Änderung in kg (neueste minus älteste), auf 2 Stellen gerundet */
  deltaKg: number;
  /** Änderung in Prozent, ganze Zahl */
  pct: number;
}

/** Ruhige Verlaufszahl aus der ältesten und neuesten Messung (Liste neueste zuerst); ohne zwei Werte null. Keine Bewertung. */
export function weightTrend<T extends WeightLike>(rowsDesc: readonly T[]): WeightTrend | null {
  if (rowsDesc.length < 2) return null;
  const newest = rowsDesc[0]!;
  const oldest = rowsDesc[rowsDesc.length - 1]!;
  const base = Number(oldest.kg);
  if (!(base > 0)) return null;
  const deltaKg = Math.round((Number(newest.kg) - base) * 100) / 100;
  return { from: oldest.measured_on, deltaKg, pct: Math.round((deltaKg / base) * 100) };
}

/** Zahl mit Dezimalkomma je Sprache, höchstens 2 Nachkommastellen: 12,4 */
export function formatKg(kg: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(kg);
}

/** Veränderung mit Vorzeichen: „+0,3“, „−0,5“ (echtes Minuszeichen), „±0“ */
export function formatDelta(delta: number, locale: string): string {
  if (delta === 0) return '±0';
  const abs = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Math.abs(delta));
  return `${delta > 0 ? '+' : '−'}${abs}`;
}

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Punkte für ein einfaches Liniendiagramm (älteste links). Abstand nach Datum, y nach kg,
 * mit etwas Luft oben und unten. Bei gleichem Gewicht liegt die Linie in der Mitte.
 */
export function chartPoints(rowsDesc: readonly WeightLike[], width: number, height: number, pad = 8): ChartPoint[] {
  const asc = rowsDesc.toReversed();
  if (asc.length < 2) return [];
  const first = asc[0]!.measured_on;
  const days = asc.map((r) => daysBetween(first, r.measured_on));
  const lastDay = days[days.length - 1]!;
  const kgs = asc.map((r) => Number(r.kg));
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const spanY = max - min;
  return asc.map((_, i) => ({
    // Alle am selben Tag gemessen: gleichmäßig verteilen, damit nichts übereinanderliegt
    x: pad + (lastDay === 0 ? i / (asc.length - 1) : days[i]! / lastDay) * (width - 2 * pad),
    y: spanY === 0 ? height / 2 : pad + (1 - (kgs[i]! - min) / spanY) * (height - 2 * pad),
  }));
}

// ---------- Impfungen ----------

export type VaccStatus = 'valid' | 'soon' | 'expired';
export const VACC_SOON_DAYS = 30;
export const VACC_NAME_MAX = 80;

/** gültig (> 30 Tage), läuft bald ab (0–30 Tage), abgelaufen (vorbei), ohne Datum kein Status */
export function vaccStatus(validUntil: string | null | undefined, today: string): VaccStatus | null {
  if (!validUntil || !isIsoDate(validUntil)) return null;
  const d = daysBetween(today, validUntil);
  if (d < 0) return 'expired';
  if (d <= VACC_SOON_DAYS) return 'soon';
  return 'valid';
}

/** Gesamtstatus der Impfungen eines Tiers: der ungünstigste Einzelstatus; ohne Datum bei allen null */
export function overallVaccStatus(validUntils: readonly (string | null | undefined)[], today: string): VaccStatus | null {
  const order: VaccStatus[] = ['expired', 'soon', 'valid'];
  const all = validUntils.map((v) => vaccStatus(v, today)).filter((x): x is VaccStatus => x !== null);
  return order.find((o) => all.includes(o)) ?? null;
}

export const VACC_STATUS_LABEL: Record<VaccStatus, MessageKey> = {
  valid: 'vcValid',
  soon: 'vcSoon',
  expired: 'vcExpired',
};

export interface VaccLike {
  name: string;
  valid_until: string | null;
  created_at: string;
}

/** Nächste Fälligkeit zuerst; ohne „gültig bis“ ans Ende; sonst nach Name */
export function sortVaccinations<T extends VaccLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.valid_until && b.valid_until && a.valid_until !== b.valid_until) return a.valid_until.localeCompare(b.valid_until);
    if (a.valid_until && !b.valid_until) return -1;
    if (!a.valid_until && b.valid_until) return 1;
    return a.name.localeCompare(b.name) || a.created_at.localeCompare(b.created_at);
  });
}

export interface VaccFormValues {
  name: string;
  givenOn: string;
  validUntil: string;
}
export type VaccErrors = Partial<Record<keyof VaccFormValues, MessageKey>>;

export function validateVaccination(v: VaccFormValues, today: string): VaccErrors {
  const e: VaccErrors = {};
  const name = v.name.trim();
  if (!name) e.name = 'vcErrName';
  else if (name.length > VACC_NAME_MAX) e.name = 'vcErrNameLong';
  if (v.givenOn) {
    if (!isIsoDate(v.givenOn)) e.givenOn = 'errDate';
    else if (v.givenOn > today) e.givenOn = 'errFuture';
  }
  if (v.validUntil) {
    if (!isIsoDate(v.validUntil)) e.validUntil = 'errDate';
    else if (v.givenOn && isIsoDate(v.givenOn) && v.validUntil < v.givenOn) e.validUntil = 'vcErrOrder';
  }
  return e;
}

/** Datum für ein Formularfeld prüfen, das nicht in der Zukunft liegen darf (leer = erlaubt, wenn optional) */
export function pastDateError(v: string, today: string, required: boolean): MessageKey | undefined {
  if (!v) return required ? 'errDateRequired' : undefined;
  if (!isIsoDate(v)) return 'errDate';
  if (v > today) return 'errFuture';
  return undefined;
}

// ---------- Dokumente ----------

export const DOC_CATEGORIES = ['finding', 'vaccination', 'invoice', 'insurance', 'prescription', 'other'] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_TITLE_MAX = 120;
export const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type DocMime = (typeof DOC_MIME)[number];
export const DOC_ACCEPT = DOC_MIME.join(',');

export const DOC_CATEGORY_LABEL: Record<DocCategory, MessageKey> = {
  finding: 'dcFinding',
  vaccination: 'dcVaccination',
  invoice: 'dcInvoice',
  insurance: 'dcInsurance',
  prescription: 'dcPrescription',
  other: 'dcOther',
};

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === 'string' && (DOC_CATEGORIES as readonly string[]).includes(v);
}

const EXT_TO_MIME: Record<string, DocMime> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MIME_TO_EXT: Record<DocMime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_LABEL: Record<DocMime, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

/** Typ einer Datei; manche Geräte liefern keinen MIME-Typ, dann zählt die Endung. */
export function docMime(file: { name: string; type: string }): DocMime | null {
  const t = file.type.toLowerCase();
  if ((DOC_MIME as readonly string[]).includes(t)) return t as DocMime;
  if (t && t !== 'application/octet-stream') return null;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return (ext && EXT_TO_MIME[ext]) || null;
}

export type DocFileCheck = { ok: true; mime: DocMime } | { ok: false; error: MessageKey };

/** Vor dem Hochladen: erlaubter Typ und höchstens 10 MB, Datei nicht leer */
export function checkDocFile(file: { name: string; type: string; size: number }): DocFileCheck {
  const mime = docMime(file);
  if (!mime) return { ok: false, error: 'dcErrType' };
  if (file.size <= 0) return { ok: false, error: 'dcErrEmpty' };
  if (file.size > DOC_MAX_BYTES) return { ok: false, error: 'dcErrSize' };
  return { ok: true, mime };
}

export function docExt(mime: DocMime): string {
  return MIME_TO_EXT[mime];
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

/** Titel-Vorschlag aus dem Dateinamen: ohne Endung, Unterstriche als Leerzeichen, höchstens 120 Zeichen */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.slice(0, DOC_TITLE_MAX);
}

/** „PDF, 240 KB“ bzw. „JPEG, 1,2 MB“ */
export function formatDocMeta(mime: string, bytes: number, locale: string): string {
  const label = (MIME_LABEL as Record<string, string>)[mime] ?? mime;
  return `${label}, ${formatBytes(bytes, locale)}`;
}

export function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

export interface DocLike {
  doc_date: string | null;
  created_at: string;
  category: string;
}

/** Neueste zuerst: Datum des Dokuments, sonst Datum des Hochladens */
export function sortDocs<T extends DocLike>(rows: readonly T[]): T[] {
  const key = (d: T) => d.doc_date ?? d.created_at.slice(0, 10);
  return [...rows].sort((a, b) => key(b).localeCompare(key(a)) || b.created_at.localeCompare(a.created_at));
}

export function filterDocs<T extends DocLike>(rows: readonly T[], category: DocCategory | 'all'): T[] {
  return category === 'all' ? [...rows] : rows.filter((d) => d.category === category);
}

export interface DocFormValues {
  title: string;
  category: DocCategory;
  docDate: string;
}
export type DocErrors = Partial<Record<keyof DocFormValues | 'file', MessageKey>>;

export function validateDocForm(v: DocFormValues, today: string): DocErrors {
  const e: DocErrors = {};
  const title = v.title.trim();
  if (!title) e.title = 'dcErrTitle';
  else if (title.length > DOC_TITLE_MAX) e.title = 'dcErrTitleLong';
  const d = pastDateError(v.docDate, today, false);
  if (d) e.docDate = d;
  return e;
}

// ---------- Fehler ----------

/** Datenbank-/Speicherfehler → Text: fehlende Rechte (RLS, 403, 42501) oder allgemein */
export function recordErrorKey(err: unknown): MessageKey {
  if (err && typeof err === 'object') {
    const o = err as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown };
    const code = String(o.code ?? '');
    const status = String(o.status ?? o.statusCode ?? '');
    const msg = String(o.message ?? '');
    if (code === '42501' || status === '403' || /row-level security|permission denied/i.test(msg)) return 'errRights';
  }
  return 'errGeneric';
}
