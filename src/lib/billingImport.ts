// Katalog-Import per CSV (Etappe P7b): Excel „Speichern unter CSV“, Semikolon oder Komma, deutsche oder englische Spaltennamen.
// Prüft jede Zeile wie die Datenbank (Preis, Faktor, Steuer, Datum), damit die Vorschau zeigt, was übernommen wird.
import type { MessageKey } from '../i18n';
import type { CatalogChange } from './billing';

const COLS = {
  code: ['code', 'nr', 'nr.', 'nummer', 'leistungsnummer', 'leistungscode', 'numero', 'numéro', 'kode'],
  name: ['name', 'bezeichnung', 'leistung', 'leistungsbezeichnung', 'libelle', 'libellé', 'service'],
  description: ['description', 'beschreibung'],
  price: ['price', 'preis', 'gebuehr', 'gebühr', 'tarif', 'betrag', 'amount'],
  currency: ['currency', 'waehrung', 'währung', 'devise'],
  factor: ['factor', 'faktor', 'facteur'],
  factor_min: ['factor_min', 'faktor_min'],
  factor_max: ['factor_max', 'faktor_max'],
  tax_rate: ['tax_rate', 'steuer', 'steuersatz', 'mwst', 'tva', 'vat'],
  valid_from: ['valid_from', 'gueltig_ab', 'gültig_ab'],
  valid_to: ['valid_to', 'gueltig_bis', 'gültig_bis'],
} as const;
type Col = keyof typeof COLS;

export const CSV_HEAD = 'code;name;description;price;currency;factor;factor_min;factor_max;tax_rate;valid_from;valid_to';
export const CSV_TEMPLATE = `${CSV_HEAD}
G01;Allgemeine Untersuchung mit Beratung;Klinische Allgemeinuntersuchung;24,00;EUR;1;1;3;19;;
G03;Impfung (Injektion);Verabreichung einer Impfung;12,00;EUR;1;1;3;19;;
G04;Impfstoff Tollwut;Material;18,50;EUR;1;1;1;19;;
`;
export const MAX_ROWS = 2000;

export interface ImportRow extends CatalogChange { currency: string }
export interface ImportError { line: number; key: MessageKey }
export interface ImportResult {
  items: ImportRow[]; errors: ImportError[]; fatal: MessageKey | null; currency: string;
  /** Hinweise, die vor der Übernahme bestätigt werden müssen (fehlende Steuer- oder Währungsspalte, „1.200“) */
  warnings: ImportError[];
}

/** Datei-Bytes als Text: UTF-8 (mit oder ohne BOM), sonst Windows-1252 (deutsches Excel „CSV (Trennzeichen-getrennt)“) */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^\uFEFF/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'windows-1252' };
  }
}

/** Eine CSV-Zeile in Felder teilen (Anführungszeichen, verdoppelte Anführungszeichen) */
export function splitLine(line: string, d: string): string[] {
  return splitRecords(line, d)[0]?.fields ?? [''];
}

/** Ganze Datei in Datensätze teilen; Zeilenumbrüche in Anführungszeichen gehören zum Feld. line = Zeilennummer des Anfangs */
export function splitRecords(text: string, d: string): { fields: string[]; line: number }[] {
  const out: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let cur = '';
  let q = false;
  let line = 1;
  let start = 1;
  const push = () => {
    fields.push(cur);
    if (fields.some((f) => f.trim() !== '')) out.push({ fields: fields.map((f) => f.trim()), line: start });
    fields = [];
    cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else {
        if (ch === '\n') line++;
        cur += ch;
      }
    } else if (ch === '"') q = true;
    else if (ch === d) { fields.push(cur); cur = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') continue;
    else if (ch === '\n' || ch === '\r') { push(); line++; start = line; }
    else cur += ch;
  }
  push();
  return out;
}

/** „1.234,50“, „1,234.50“, „24,00 €“ → Zahl; ungültig → NaN */
export function parseNum(s: string): number {
  let x = s.replace(/[\s€£$ ]/g, '');
  if (!x) return Number.NaN;
  const c = x.lastIndexOf(',');
  const p = x.lastIndexOf('.');
  if (c > -1 && p > -1) x = c > p ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (c > -1) x = x.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(x) ? Number.parseFloat(x) : Number.NaN;
}

/** „2026-01-01“ oder „01.01.2026“ → ISO; leer → null; ungültig → undefined */
export function parseDate(s: string): string | null | undefined {
  const x = s.trim();
  if (!x) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(x);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(x))) [y, mo, d] = [Number(m[3]), Number(m[2]), Number(m[1])];
  else return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString().slice(0, 10);
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** „1.200“ (Punkt, genau drei Ziffern danach): in Deutschland meist Tausenderpunkt, gelesen wird aber 1,2 */
export const ambiguousThousands = (s: string) => /^\d{1,3}\.\d{3}$/.test(s.replace(/[\s€£$\u00a0]/g, ''));

export function parseCatalogCsv(text: string): ImportResult {
  const clean = text.replace(/^\uFEFF/, '');
  const empty: ImportResult = { items: [], errors: [], warnings: [], fatal: 'blImpErrEmpty', currency: 'EUR' };
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const d = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
  const recs = splitRecords(clean, d);
  if (recs.length < 2) return empty;
  const names = recs[0]!.fields.map((x) => x.toLowerCase());
  const ix: Partial<Record<Col, number>> = {};
  for (const k of Object.keys(COLS) as Col[]) {
    const j = names.findIndex((x) => (COLS[k] as readonly string[]).includes(x));
    if (j >= 0) ix[k] = j;
  }
  if (ix.code === undefined || ix.name === undefined || ix.price === undefined) return { ...empty, fatal: 'blImpErrCols' };
  if (recs.length - 1 > MAX_ROWS) return { ...empty, fatal: 'blImpErrTooMany' };

  const items: ImportRow[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  if (ix.tax_rate === undefined) warnings.push({ line: 1, key: 'blImpWarnNoTax' });
  if (ix.currency === undefined) warnings.push({ line: 1, key: 'blImpWarnNoCurrency' });
  const seen = new Set<string>();
  for (const { fields: c, line: n } of recs.slice(1)) {
    const get = (k: Col) => (ix[k] === undefined ? '' : (c[ix[k]!] ?? ''));
    const code = get('code').toUpperCase();
    const name = get('name').replace(/\s+/g, ' ');
    const priceText = get('price');
    const price = parseNum(priceText);
    const fail = (key: MessageKey) => errors.push({ line: n, key });
    if (!code) { fail('blImpErrCode'); continue; }
    if (code.length > 20) { fail('blImpErrCodeLong'); continue; }
    if (seen.has(code)) { fail('blImpErrDup'); continue; }
    if (!name) { fail('blImpErrName'); continue; }
    if (!Number.isFinite(price) || price < 0 || price > 100000) { fail('blImpErrPrice'); continue; }
    const fa = get('factor');
    const fi = get('factor_min');
    const fx = get('factor_max');
    const ta = get('tax_rate');
    const f = fa ? parseNum(fa) : 1;
    const fMin = fi ? parseNum(fi) : fx ? 1 : f;
    const fMax = fx ? parseNum(fx) : f;
    if (ix.tax_rate !== undefined && !ta) { fail('blImpErrTax'); continue; }
    const tax = ta ? parseNum(ta.replace('%', '')) : 0;
    if ([f, fMin, fMax, tax].some((x) => !Number.isFinite(x)) || fMin <= 0 || fMin > fMax || fMax > 10 || tax < 0 || tax > 30) { fail('blImpErrNum'); continue; }
    const from = parseDate(get('valid_from'));
    const to = parseDate(get('valid_to'));
    if (from === undefined || to === undefined || (from && to && to < from)) { fail('blImpErrDate'); continue; }
    if (ambiguousThousands(priceText)) warnings.push({ line: n, key: 'blImpWarnThousands' });
    seen.add(code);
    const desc = get('description').replace(/\s+/g, ' ');
    items.push({
      code, name: name.slice(0, 120), description: desc ? desc.slice(0, 200) : null, price: r2(price),
      factor: r2(Math.min(Math.max(f, fMin), fMax)), factor_min: r2(fMin), factor_max: r2(fMax), tax_rate: r2(tax),
      valid_from: from, valid_to: to, currency: (get('currency') || 'EUR').toUpperCase(),
    });
  }
  const currency = items[0]?.currency ?? 'EUR';
  if (items.length && !/^[A-Z]{3}$/.test(currency)) return { items: [], errors, warnings, fatal: 'blImpErrCurrency', currency: 'EUR' };
  if (items.some((i) => i.currency !== currency)) return { items: [], errors, warnings, fatal: 'blImpErrMixed', currency };
  return { items, errors, warnings, fatal: items.length ? null : 'blImpErrNone', currency };
}

/** Übernahme nur nach Bestätigung, wenn Zeilen übersprungen wurden oder Hinweise offen sind */
export const needsConfirm = (r: ImportResult) => r.errors.length > 0 || r.warnings.length > 0;

/** Kennzahlen für die Vorschau: Preisspanne und Steuersätze */
export function importSummary(r: ImportResult): { min: number; max: number; rates: number[] } {
  const prices = r.items.map((i) => i.price);
  return {
    min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0,
    rates: [...new Set(r.items.map((i) => Number(i.tax_rate)))].sort((a, b) => b - a),
  };
}

/** Übergabe an practice_catalog_publish (Modus „ersetzen“) */
export function importPayload(r: ImportResult, name: string) {
  return {
    mode: 'replace' as const, name: name.trim().slice(0, 120), currency: r.currency,
    items: r.items.map(({ currency: _c, ...it }) => it),
  };
}
