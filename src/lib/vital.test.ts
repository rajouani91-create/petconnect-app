import { describe, expect, it } from 'vitest';
import { KIND_EXAMPLE, measuredAtFor, normalRange, parseVital, sortVitalsDesc, toChartRows } from './vital';

describe('Vitalwerte: Eingabe', () => {
  it('liest Komma und Punkt, höchstens 2 Nachkommastellen', () => {
    expect(parseVital('temperature', '38,4')).toEqual({ ok: true, value: 38.4 });
    expect(parseVital('temperature', ' 38.45 ')).toEqual({ ok: true, value: 38.45 });
    expect(parseVital('heart_rate', '110')).toEqual({ ok: true, value: 110 });
  });
  it('lehnt leere, falsche und unplausible Werte ab', () => {
    expect(parseVital('temperature', '')).toEqual({ ok: false, error: 'required' });
    expect(parseVital('temperature', 'abc')).toEqual({ ok: false, error: 'format' });
    expect(parseVital('temperature', '38,456')).toEqual({ ok: false, error: 'format' });
    expect(parseVital('temperature', '380')).toEqual({ ok: false, error: 'range' });
    expect(parseVital('temperature', '29,9')).toEqual({ ok: false, error: 'range' });
    expect(parseVital('heart_rate', '9')).toEqual({ ok: false, error: 'range' });
    expect(parseVital('resp_rate', '201')).toEqual({ ok: false, error: 'range' });
  });
  it('Grenzen sind eingeschlossen', () => {
    expect(parseVital('temperature', '30').ok).toBe(true);
    expect(parseVital('temperature', '45').ok).toBe(true);
    expect(parseVital('resp_rate', '2').ok).toBe(true);
  });
});

describe('Vitalwerte: Zeitpunkt und Sortierung', () => {
  it('heute = jetzt, anderer Tag = 12 Uhr Ortszeit', () => {
    const now = new Date('2026-10-30T09:15:00Z');
    expect(measuredAtFor('2026-10-30', '2026-10-30', now)).toBe(now.toISOString());
    expect(new Date(measuredAtFor('2026-10-20', '2026-10-30', now)).getHours()).toBe(12);
  });
  it('neueste zuerst, Diagrammzeilen mit Ortsdatum', () => {
    const rows = [
      { id: 'a', measured_at: '2026-10-01T10:00:00Z', value: 38, created_at: '2026-10-01T10:00:00Z' },
      { id: 'b', measured_at: '2026-10-10T10:00:00Z', value: 38.6, created_at: '2026-10-10T10:00:00Z' },
    ];
    expect(sortVitalsDesc(rows).map((r) => r.id)).toEqual(['b', 'a']);
    const c = toChartRows(sortVitalsDesc(rows));
    expect(c.map((r) => r.kg)).toEqual([38.6, 38]);
    expect(c[0]!.measured_on).toBe('2026-10-10');
  });
});

describe('Vitalwerte: Richtwerte', () => {
  it('Richtwerte je Tierart und Messwert, ohne Angabe bei Vogel/Reptil', () => {
    expect(normalRange('dog', 'temperature')).toEqual({ min: 37.5, max: 39.2 });
    expect(normalRange('cat', 'heart_rate')).toEqual({ min: 140, max: 220 });
    expect(normalRange('bird', 'heart_rate')).toBeNull();
  });
  it('jeder Messwert hat ein eigenes Beispiel (kein 38,5 bei Herzfrequenz)', () => {
    expect(KIND_EXAMPLE.heart_rate).not.toBe(KIND_EXAMPLE.temperature);
    expect(KIND_EXAMPLE.resp_rate).not.toBe(KIND_EXAMPLE.heart_rate);
  });
});
