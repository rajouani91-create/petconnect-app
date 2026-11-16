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
export interface ImportResult { items: ImportRow[]; errors: ImportError[]; fatal: MessageKey | null; currency: string }

/** Eine CSV-Zeile in Felder teilen (Anführungszeichen, verdoppelte Anführungszeichen) */
export function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
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

export function parseCatalogCsv(text: string): ImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const used = lines.map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.trim());
  const empty: ImportResult = { items: [], errors: [], fatal: 'blImpErrEmpty', currency: 'EUR' };
  if (used.length < 2) return empty;
  const head = used[0]!.l;
  const d = head.split(';').length >= head.split(',').length ? ';' : ',';
  const names = splitLine(head, d).map((x) => x.toLowerCase());
  const ix: Partial<Record<Col, number>> = {};
  for (const k of Object.keys(COLS) as Col[]) {
    const j = names.findIndex((x) => (COLS[k] as readonly string[]).includes(x));
    if (j >= 0) ix[k] = j;
  }
  if (ix.code === undefined || ix.name === undefined || ix.price === undefined) return { ...empty, fatal: 'blImpErrCols' };
  if (used.length - 1 > MAX_ROWS) return { ...empty, fatal: 'blImpErrTooMany' };

  const items: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  for (const { l, n } of used.slice(1)) {
    const c = splitLine(l, d);
    const get = (k: Col) => (ix[k] === undefined ? '' : (c[ix[k]!] ?? ''));
    const code = get('code').toUpperCase();
    const name = get('name');
    const price = parseNum(get('price'));
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
    const tax = ta ? parseNum(ta.replace('%', '')) : 0;
    if ([f, fMin, fMax, tax].some((x) => !Number.isFinite(x)) || fMin <= 0 || fMin > fMax || fMax > 10 || tax < 0 || tax > 30) { fail('blImpErrNum'); continue; }
    const from = parseDate(get('valid_from'));
    const to = parseDate(get('valid_to'));
    if (from === undefined || to === undefined || (from && to && to < from)) { fail('blImpErrDate'); continue; }
    seen.add(code);
    const desc = get('description');
    items.push({
      code, name: name.slice(0, 120), description: desc ? desc.slice(0, 200) : null, price: r2(price),
      factor: r2(Math.min(Math.max(f, fMin), fMax)), factor_min: r2(fMin), factor_max: r2(fMax), tax_rate: r2(tax),
      valid_from: from, valid_to: to, currency: (get('currency') || 'EUR').toUpperCase(),
    });
  }
  const currency = items[0]?.currency ?? 'EUR';
  if (items.length && !/^[A-Z]{3}$/.test(currency)) return { items: [], errors, fatal: 'blImpErrCurrency', currency: 'EUR' };
  if (items.some((i) => i.currency !== currency)) return { items: [], errors, fatal: 'blImpErrMixed', currency };
  return { items, errors, fatal: items.length ? null : 'blImpErrNone', currency };
}

/** Übergabe an practice_catalog_publish (Modus „ersetzen“) */
export function importPayload(r: ImportResult, name: string) {
  return {
    mode: 'replace' as const, name: name.trim().slice(0, 120), currency: r.currency,
    items: r.items.map(({ currency: _c, ...it }) => it),
  };
}
