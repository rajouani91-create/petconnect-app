import { describe, expect, it } from 'vitest';
import {
  DOC_MAX_BYTES,
  chartPoints,
  checkDocFile,
  daysBetween,
  filterDocs,
  formatBytes,
  formatDelta,
  formatDocMeta,
  formatKg,
  isIsoDate,
  parseKg,
  pastDateError,
  recordErrorKey,
  sortDocs,
  sortVaccinations,
  sortWeightsDesc,
  titleFromFilename,
  vaccStatus,
  validateDocForm,
  validateVaccination,
  weightDeltas,
  filterWeightsByRange,
  weightTrend,
  overallVaccStatus,
} from './record';

const TODAY = '2026-10-16';
const w = (id: string, measured_on: string, kg: number, created_at = `${measured_on}T08:00:00Z`) => ({ id, measured_on, kg, created_at });

describe('Datum', () => {
  it('erkennt echte Kalenderdaten', () => {
    expect(isIsoDate('2026-10-16')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('16.10.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
  it('Tage zwischen zwei Daten, auch über die Zeitumstellung', () => {
    expect(daysBetween('2026-10-16', '2026-11-15')).toBe(30);
    expect(daysBetween('2026-10-16', '2026-10-15')).toBe(-1);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
  it('Datum nicht in der Zukunft', () => {
    expect(pastDateError(TODAY, TODAY, true)).toBeUndefined();
    expect(pastDateError('2026-10-17', TODAY, true)).toBe('errFuture');
    expect(pastDateError('', TODAY, true)).toBe('errDateRequired');
    expect(pastDateError('', TODAY, false)).toBeUndefined();
    expect(pastDateError('2026-02-30', TODAY, false)).toBe('errDate');
  });
});

describe('kg-Eingabe', () => {
  it('Komma und Punkt, höchstens 2 Nachkommastellen', () => {
    expect(parseKg('12,4')).toEqual({ ok: true, kg: 12.4 });
    expect(parseKg('12.4')).toEqual({ ok: true, kg: 12.4 });
    expect(parseKg(' 0,05 ')).toEqual({ ok: true, kg: 0.05 });
    expect(parseKg('28')).toEqual({ ok: true, kg: 28 });
    expect(parseKg('12,4 kg')).toEqual({ ok: true, kg: 12.4 });
    expect(parseKg('1999,99')).toEqual({ ok: true, kg: 1999.99 });
    expect(parseKg('500')).toEqual({ ok: true, kg: 500 });
  });
  it('Grenzen: 0 und 2000 sind nicht erlaubt', () => {
    expect(parseKg('0')).toEqual({ ok: false, error: 'range' });
    expect(parseKg('0,00')).toEqual({ ok: false, error: 'range' });
    expect(parseKg('2000')).toEqual({ ok: false, error: 'range' });
    expect(parseKg('2000,01')).toEqual({ ok: false, error: 'range' });
  });
  it('ungültige Eingaben', () => {
    expect(parseKg('')).toEqual({ ok: false, error: 'required' });
    expect(parseKg('   ')).toEqual({ ok: false, error: 'required' });
    expect(parseKg('abc')).toEqual({ ok: false, error: 'format' });
    expect(parseKg('-5')).toEqual({ ok: false, error: 'format' });
    expect(parseKg('1.234,5')).toEqual({ ok: false, error: 'format' });
    expect(parseKg('12,')).toEqual({ ok: false, error: 'format' });
    expect(parseKg(',5')).toEqual({ ok: false, error: 'format' });
    expect(parseKg('1e3')).toEqual({ ok: false, error: 'format' });
    expect(parseKg('12,345')).toEqual({ ok: false, error: 'decimals' });
  });
});

describe('Gewicht: Sortierung, Veränderung, Anzeige', () => {
  const rows = [w('a', '2026-09-01', 12), w('b', '2026-10-01', 12.3), w('c', '2026-08-01', 12.8), w('d', '2026-10-01', 12.5, '2026-10-01T18:00:00Z')];

  it('neueste zuerst, am selben Tag die spätere Eingabe oben', () => {
    expect(sortWeightsDesc(rows).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
  });
  it('Veränderung zur vorherigen Messung, älteste ohne', () => {
    expect(weightDeltas(sortWeightsDesc(rows))).toEqual([0.2, 0.3, -0.8, null]);
    expect(weightDeltas([])).toEqual([]);
  });
  it('Rundungsfehler werden vermieden', () => {
    expect(weightDeltas([w('x', '2026-10-02', 0.3), w('y', '2026-10-01', 0.1)])).toEqual([0.2, null]);
  });
  it('Anzeige mit Komma und Vorzeichen', () => {
    expect(formatKg(12.4, 'de-DE')).toBe('12,4');
    expect(formatKg(28, 'de-DE')).toBe('28');
    expect(formatKg(12.4, 'en-GB')).toBe('12.4');
    expect(formatDelta(0.3, 'de-DE')).toBe('+0,3');
    expect(formatDelta(-0.5, 'de-DE')).toBe('−0,5');
    expect(formatDelta(0, 'de-DE')).toBe('±0');
    expect(formatDelta(1.25, 'de-DE')).toBe('+1,25');
  });
  it('Diagramm: ab 2 Werten, älteste links, höchster Wert oben', () => {
    expect(chartPoints([w('a', '2026-10-01', 10)], 100, 50)).toEqual([]);
    const pts = chartPoints(sortWeightsDesc([w('a', '2026-10-01', 10), w('b', '2026-10-11', 20)]), 100, 50, 0);
    expect(pts).toEqual([{ x: 0, y: 50 }, { x: 100, y: 0 }]);
    const same = chartPoints([w('a', '2026-10-01', 10), w('b', '2026-10-01', 10, '2026-10-01T09:00:00Z')], 100, 50, 0);
    expect(same.map((p) => p.y)).toEqual([25, 25]);
    expect(new Set(same.map((p) => p.x)).size).toBe(2);
  });
});

describe('Impfstatus', () => {
  it('gültig, läuft bald ab, abgelaufen, ohne Datum', () => {
    expect(vaccStatus('2027-10-16', TODAY)).toBe('valid');
    expect(vaccStatus('2026-11-16', TODAY)).toBe('valid'); // 31 Tage
    expect(vaccStatus('2026-11-15', TODAY)).toBe('soon'); // genau 30 Tage
    expect(vaccStatus('2026-10-17', TODAY)).toBe('soon');
    expect(vaccStatus(TODAY, TODAY)).toBe('soon'); // 0 Tage: heute noch gültig
    expect(vaccStatus('2026-10-15', TODAY)).toBe('expired');
    expect(vaccStatus(null, TODAY)).toBeNull();
    expect(vaccStatus('', TODAY)).toBeNull();
    expect(vaccStatus('kaputt', TODAY)).toBeNull();
  });
  it('Sortierung: nächste Fälligkeit oben, ohne Datum ans Ende', () => {
    const v = (name: string, valid_until: string | null) => ({ name, valid_until, created_at: '2026-01-01T00:00:00Z' });
    const sorted = sortVaccinations([v('Ohne B', null), v('Staupe', '2027-05-01'), v('Tollwut', '2026-11-01'), v('Ohne A', null), v('Alt', '2025-01-01')]);
    expect(sorted.map((x) => x.name)).toEqual(['Alt', 'Tollwut', 'Staupe', 'Ohne A', 'Ohne B']);
  });
  it('Formular: Name Pflicht, Daten optional, Reihenfolge und Zukunft', () => {
    expect(validateVaccination({ name: 'Tollwut', givenOn: '', validUntil: '' }, TODAY)).toEqual({});
    expect(validateVaccination({ name: '  ', givenOn: '', validUntil: '' }, TODAY)).toEqual({ name: 'vcErrName' });
    expect(validateVaccination({ name: 'x'.repeat(81), givenOn: '', validUntil: '' }, TODAY)).toEqual({ name: 'vcErrNameLong' });
    expect(validateVaccination({ name: 'x'.repeat(80), givenOn: '', validUntil: '' }, TODAY)).toEqual({});
    expect(validateVaccination({ name: 'T', givenOn: '2026-10-17', validUntil: '' }, TODAY)).toEqual({ givenOn: 'errFuture' });
    expect(validateVaccination({ name: 'T', givenOn: '2026-10-10', validUntil: '2026-10-09' }, TODAY)).toEqual({ validUntil: 'vcErrOrder' });
    expect(validateVaccination({ name: 'T', givenOn: '2026-10-10', validUntil: '2026-10-10' }, TODAY)).toEqual({});
    // gültig bis darf in der Zukunft liegen
    expect(validateVaccination({ name: 'T', givenOn: '', validUntil: '2029-01-01' }, TODAY)).toEqual({});
  });
});

describe('Dokumente', () => {
  it('Dateiprüfung: Typ und Größe', () => {
    expect(checkDocFile({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toEqual({ ok: true, mime: 'application/pdf' });
    expect(checkDocFile({ name: 'a.jpg', type: 'image/jpeg', size: DOC_MAX_BYTES })).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(checkDocFile({ name: 'a.jpg', type: 'image/jpeg', size: DOC_MAX_BYTES + 1 })).toEqual({ ok: false, error: 'dcErrSize' });
    expect(checkDocFile({ name: 'a.txt', type: 'text/plain', size: 10 })).toEqual({ ok: false, error: 'dcErrType' });
    expect(checkDocFile({ name: 'a.heic', type: 'image/heic', size: 10 })).toEqual({ ok: false, error: 'dcErrType' });
    expect(checkDocFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toEqual({ ok: false, error: 'dcErrEmpty' });
    // ohne MIME-Typ entscheidet die Endung
    expect(checkDocFile({ name: 'Befund.PDF', type: '', size: 10 })).toEqual({ ok: true, mime: 'application/pdf' });
    expect(checkDocFile({ name: 'x.exe', type: '', size: 10 })).toEqual({ ok: false, error: 'dcErrType' });
    // falsche Endung mit erlaubtem Typ: der Typ zählt
    expect(checkDocFile({ name: 'scan.txt', type: 'image/png', size: 10 })).toEqual({ ok: true, mime: 'image/png' });
  });
  it('Titel aus dem Dateinamen', () => {
    expect(titleFromFilename('Impfpass_Luna.pdf')).toBe('Impfpass Luna');
    expect(titleFromFilename('befund.2026.jpg')).toBe('befund.2026');
    expect(titleFromFilename('ohne-endung')).toBe('ohne-endung');
    expect(titleFromFilename(`${'a'.repeat(200)}.pdf`)).toHaveLength(120);
  });
  it('Typ und Größe als Text', () => {
    expect(formatDocMeta('application/pdf', 240 * 1024, 'de-DE')).toBe('PDF, 240 KB');
    expect(formatDocMeta('image/jpeg', 1.25 * 1024 * 1024, 'de-DE')).toBe('JPEG, 1,3 MB');
    expect(formatBytes(10, 'de-DE')).toBe('1 KB');
    expect(formatBytes(10 * 1024 * 1024, 'de-DE')).toBe('10 MB');
  });
  it('Sortierung: Dokumentdatum, sonst Hochladedatum; Filter', () => {
    const d = (id: string, doc_date: string | null, created_at: string, category = 'other') => ({ id, doc_date, created_at, category });
    const rows = [d('alt', '2024-01-01', '2026-10-16T10:00:00Z', 'invoice'), d('neu', null, '2026-10-15T10:00:00Z', 'finding'), d('mitte', '2025-06-01', '2026-10-01T10:00:00Z', 'finding')];
    expect(sortDocs(rows).map((x) => x.id)).toEqual(['neu', 'mitte', 'alt']);
    expect(filterDocs(rows, 'finding').map((x) => x.id)).toEqual(['neu', 'mitte']);
    expect(filterDocs(rows, 'all')).toHaveLength(3);
    expect(filterDocs(rows, 'insurance')).toEqual([]);
  });
  it('Formular: Titel Pflicht, Datum nicht in der Zukunft', () => {
    expect(validateDocForm({ title: 'Befund', category: 'finding', docDate: '' }, TODAY)).toEqual({});
    expect(validateDocForm({ title: ' ', category: 'other', docDate: '' }, TODAY)).toEqual({ title: 'dcErrTitle' });
    expect(validateDocForm({ title: 'x'.repeat(121), category: 'other', docDate: '' }, TODAY)).toEqual({ title: 'dcErrTitleLong' });
    expect(validateDocForm({ title: 'x', category: 'other', docDate: '2026-10-17' }, TODAY)).toEqual({ docDate: 'errFuture' });
  });
});

describe('Fehler-Zuordnung', () => {
  it('RLS und 403 → fehlende Rechte, sonst allgemein', () => {
    expect(recordErrorKey({ code: '42501', message: 'x' })).toBe('errRights');
    expect(recordErrorKey({ statusCode: '403', message: 'x' })).toBe('errRights');
    expect(recordErrorKey({ message: 'new row violates row-level security policy for table "weights"' })).toBe('errRights');
    expect(recordErrorKey({ code: '23514', message: 'check' })).toBe('errGeneric');
    expect(recordErrorKey(new Error('Netzwerk'))).toBe('errGeneric');
    expect(recordErrorKey(null)).toBe('errGeneric');
  });
});

describe('Gewicht: Zeiträume und Verlauf', () => {
  const rows = [w('a', '2026-10-10', 28.5), w('b', '2026-09-20', 28.8), w('c', '2026-07-01', 29.1), w('d', '2026-01-05', 30)];
  it('filtert nach Zeitraum, „Alles“ behält alle', () => {
    expect(filterWeightsByRange(rows, '30d', TODAY).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterWeightsByRange(rows, '3m', TODAY).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterWeightsByRange(rows, '6m', TODAY).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterWeightsByRange(rows, 'all', TODAY)).toHaveLength(4);
    expect(filterWeightsByRange([], '30d', TODAY)).toEqual([]);
  });
  it('Verlauf: Änderung in kg und Prozent, ohne zwei Werte keiner', () => {
    expect(weightTrend(rows.slice(0, 1))).toBeNull();
    expect(weightTrend([])).toBeNull();
    expect(weightTrend(rows)).toEqual({ from: '2026-01-05', deltaKg: -1.5, pct: -5 });
    expect(weightTrend([w('x', '2026-10-02', 10), w('y', '2026-10-01', 10)])).toEqual({ from: '2026-10-01', deltaKg: 0, pct: 0 });
  });
});

describe('Impfungen: Gesamtstatus', () => {
  it('der ungünstigste Status gewinnt, ohne Datum keiner', () => {
    expect(overallVaccStatus(['2027-10-15', '2026-10-20'], TODAY)).toBe('soon');
    expect(overallVaccStatus(['2027-10-15', '2026-10-01'], TODAY)).toBe('expired');
    expect(overallVaccStatus(['2027-10-15'], TODAY)).toBe('valid');
    expect(overallVaccStatus([null], TODAY)).toBeNull();
    expect(overallVaccStatus([], TODAY)).toBeNull();
  });
});
