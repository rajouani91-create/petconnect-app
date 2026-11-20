import { describe, expect, it } from 'vitest';
import { CSV_TEMPLATE, ambiguousThousands, decodeCsv, importPayload, importSummary, needsConfirm, parseCatalogCsv, parseDate, parseNum, splitLine, splitRecords } from './billingImport';
import { addLine, addPackage, linePayload, totals, usualTaxRate, vaccineSuggestions, type CatalogItem } from './billing';

describe('CSV-Hilfen', () => {
  it('teilt Zeilen mit Anführungszeichen', () => {
    expect(splitLine('a;"b;c";"d ""x"""', ';')).toEqual(['a', 'b;c', 'd "x"']);
  });
  it('liest deutsche und englische Zahlen', () => {
    expect(parseNum('1.234,50')).toBe(1234.5);
    expect(parseNum('1,234.50')).toBe(1234.5);
    expect(parseNum('24,00 €')).toBe(24);
    expect(parseNum('abc')).toBeNaN();
    expect(parseNum('')).toBeNaN();
  });
  it('liest Datum ISO und deutsch, lehnt ungültige ab', () => {
    expect(parseDate('2026-01-05')).toBe('2026-01-05');
    expect(parseDate('5.1.2026')).toBe('2026-01-05');
    expect(parseDate('')).toBeNull();
    expect(parseDate('31.02.2026')).toBeUndefined();
    expect(parseDate('morgen')).toBeUndefined();
  });
});

describe('Zeichensatz und Datensätze', () => {
  it('erkennt UTF-8 (mit BOM) und Windows-1252 aus Excel', () => {
    const utf = new TextEncoder().encode('\uFEFFcode;name;Gebühr\nA;Untersuchung für Katzen;5');
    expect(decodeCsv(utf)).toEqual({ text: 'code;name;Gebühr\nA;Untersuchung für Katzen;5', encoding: 'utf-8' });
    // „Gebühr;Währung“ in Windows-1252: ü = 0xFC, ä = 0xE4
    const ansi = new Uint8Array([...'code;name;Geb'].map((c) => c.charCodeAt(0)).concat([0xfc], [...'hr;W'].map((c) => c.charCodeAt(0)), [0xe4], [...'hrung'].map((c) => c.charCodeAt(0))));
    const d = decodeCsv(ansi);
    expect(d.encoding).toBe('windows-1252');
    expect(d.text).toBe('code;name;Gebühr;Währung');
    const r = parseCatalogCsv(`${d.text}\nA;Test;5;EUR`);
    expect(r.items[0]).toMatchObject({ price: 5, currency: 'EUR' });
  });
  it('hält Zeilenumbrüche in Anführungszeichen zusammen und zählt Zeilen richtig', () => {
    const recs = splitRecords('a;b\r\n"x\ny";2\n\nz;3', ';');
    expect(recs).toEqual([{ fields: ['a', 'b'], line: 1 }, { fields: ['x\ny', '2'], line: 2 }, { fields: ['z', '3'], line: 5 }]);
    const r = parseCatalogCsv('code;name;price;tax_rate;currency\nA;"Zwei\nZeilen";5;19;EUR\nB;Gut;6;19;EUR');
    expect(r.items.map((i) => i.name)).toEqual(['Zwei Zeilen', 'Gut']);
  });
});

describe('Hinweise vor der Übernahme', () => {
  it('warnt bei fehlender Steuer- und Währungsspalte und bei „1.200“', () => {
    const r = parseCatalogCsv('code;name;price\nA;Op;1.200\nB;Klein;24,00');
    expect(r.warnings).toEqual([{ line: 1, key: 'blImpWarnNoTax' }, { line: 1, key: 'blImpWarnNoCurrency' }, { line: 2, key: 'blImpWarnThousands' }]);
    expect(r.items[0]!.price).toBe(1.2);
    expect(needsConfirm(r)).toBe(true);
    expect(ambiguousThousands('1.200,00')).toBe(false);
    expect(ambiguousThousands('12.50')).toBe(false);
  });
  it('braucht keine Bestätigung bei sauberer Datei und fasst zusammen', () => {
    const r = parseCatalogCsv(CSV_TEMPLATE);
    expect(needsConfirm(r)).toBe(false);
    expect(importSummary(r)).toEqual({ min: 12, max: 24, rates: [19] });
  });
});

describe('parseCatalogCsv', () => {
  it('liest die Vorlage', () => {
    const r = parseCatalogCsv(CSV_TEMPLATE);
    expect(r.fatal).toBeNull();
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ code: 'G01', price: 24, factor: 1, factor_min: 1, factor_max: 3, tax_rate: 19, valid_from: null });
    expect(r.currency).toBe('EUR');
  });
  it('erkennt Komma als Trenner und deutsche Spaltennamen, BOM', () => {
    const r = parseCatalogCsv('﻿Nr,Bezeichnung,Preis,MwSt\ng1,Untersuchung,"24,50",7\n');
    expect(r.items).toEqual([expect.objectContaining({ code: 'G1', name: 'Untersuchung', price: 24.5, tax_rate: 7, factor: 1 })]);
  });
  it('meldet fehlende Pflichtspalten und leere Dateien', () => {
    expect(parseCatalogCsv('code;name\nA;B').fatal).toBe('blImpErrCols');
    expect(parseCatalogCsv('code;name;price').fatal).toBe('blImpErrEmpty');
  });
  it('überspringt fehlerhafte Zeilen mit Zeilennummer', () => {
    const r = parseCatalogCsv('code;name;price;factor_min;factor_max;tax_rate;valid_from;valid_to\nA;Eins;10;;;19;;\n;Ohne;5;;;;;\nB;;5;;;;;\nC;Preis;x;;;;;\nA;Doppelt;5;;;;;\nD;Faktor;5;3;2;;;\nE;Steuer;5;;;40;;\nF;Datum;5;;;;2026-02-01;2026-01-01\n\nG;Gut;1.000,00;1;2,5;19;01.01.2026;\n');
    expect(r.items.map((i) => i.code)).toEqual(['A', 'G']);
    expect(r.items[1]).toMatchObject({ price: 1000, factor_max: 2.5, valid_from: '2026-01-01' });
    expect(r.errors).toEqual([
      { line: 3, key: 'blImpErrCode' }, { line: 4, key: 'blImpErrName' }, { line: 5, key: 'blImpErrPrice' }, { line: 6, key: 'blImpErrDup' },
      { line: 7, key: 'blImpErrTax' }, { line: 8, key: 'blImpErrNum' }, { line: 9, key: 'blImpErrTax' },
    ]);
    expect(r.warnings).toEqual([{ line: 1, key: 'blImpWarnNoCurrency' }]);
  });
  it('verlangt eine Währung je Katalog', () => {
    expect(parseCatalogCsv('code;name;price;currency\nA;x;1;EUR\nB;y;2;GBP').fatal).toBe('blImpErrMixed');
    const gbp = parseCatalogCsv('code;name;price;currency\nA;x;1;gbp');
    expect(gbp.currency).toBe('GBP');
    expect(importPayload(gbp, ' UK ')).toEqual({ mode: 'replace', name: 'UK', currency: 'GBP', items: [expect.not.objectContaining({ currency: expect.anything() })] });
  });
});

const item = (code: string, name: string, price = 10, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id: `id-${code}`, code, name, description: null, price, factor: 1, factor_min: 1, factor_max: 3, tax_rate: 19, valid_from: null, valid_to: null, ...extra,
});
const CAT = [item('G01', 'Allgemeine Untersuchung'), item('G03', 'Impfung (Injektion)', 12), item('G04', 'Impfstoff Tollwut', 18.5), item('G05', 'Impfstoff SHPPi', 24), item('G15', 'Diätfutter', 4.2, { tax_rate: 7 }), item('G99', 'Alt', 1, { valid_to: '2025-12-31' })];

describe('erbrachte Leistungen', () => {
  it('erhöht die Menge statt doppelt einzutragen', () => {
    let ls = addLine([], CAT[0]!);
    ls = addLine(ls, CAT[0]!, 2);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.qty).toBe(3);
    expect(linePayload(ls[0]!)).toEqual({ catalog_item_id: 'id-G01', qty: 3, factor: 1 });
  });
  it('fügt Pakete ein und überspringt fehlende oder ungültige Nummern', () => {
    const r = addPackage([], { id: 'p', name: 'Impfung', created_by_name: null, items: [{ code: 'g03', qty: 1 }, { code: 'G04', qty: 1 }, { code: 'X1', qty: 1 }, { code: 'G99', qty: 1 }] }, CAT, '2026-11-16');
    expect(r.lines.map((l) => l.code)).toEqual(['G03', 'G04']);
    expect(r.skipped).toBe(2);
  });
  it('schlägt nach einer Impfung Injektion und passenden Impfstoff vor', () => {
    expect(vaccineSuggestions('Tollwut', CAT, '2026-11-16').map((i) => i.code)).toEqual(['G03', 'G04']);
    expect(vaccineSuggestions('SHPPi', CAT, '2026-11-16').map((i) => i.code)).toEqual(['G03', 'G05']);
    expect(vaccineSuggestions('RCP', CAT, '2026-11-16').map((i) => i.code)).toEqual(['G03']);
    expect(vaccineSuggestions('Tollwut', [CAT[0]!], '2026-11-16')).toEqual([]);
  });
  it('rechnet die voraussichtliche Summe wie die Datenbank', () => {
    const ls = addLine(addLine([], CAT[1]!, 2), CAT[4]!, 3);
    expect(totals(ls, false)).toMatchObject({ net: 36.6, tax: 5.44, gross: 42.04 });
    expect(usualTaxRate(CAT)).toBe(19);
  });
});
