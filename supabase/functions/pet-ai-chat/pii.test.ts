import { describe, expect, it } from 'vitest';
import { findPii, hardPiiKinds, labLines, redactText, REDACTED } from './pii.ts';

const kinds = (t: string, known: string[] = []) => findPii(t, known).map((s) => s.kind);

describe('findPii / redactText', () => {
  it('erkennt E-Mail, Link, IBAN und Chip-Nummer', () => {
    const t = 'Kontakt max.muster@example.de, www.praxis.de, DE89 3704 0044 0532 0130 00, Chip 276 097 200 123 456';
    expect(kinds(t)).toEqual(expect.arrayContaining(['email', 'url', 'iban', 'chip']));
    const r = redactText(t).text;
    expect(r).not.toMatch(/example\.de|praxis\.de|DE89|276 097|0044/);
  });
  it('erkennt Telefonnummern, aber keine Datums- oder Messwerte', () => {
    expect(kinds('Tel. 06142 123456')).toContain('phone');
    expect(kinds('Mobil +49 170 1234567 ')).toContain('phone');
    expect(kinds('Datum 24.10.2026 Kreatinin 1,2 Harnstoff 45 Referenz 12,5 - 25,0 und 0,35 mg/dl')).toEqual([]);
  });
  it('entfernt beschriftete Felder bis zum Zeilenende', () => {
    const r = redactText('Besitzer: Max Muster\nKreatinin 1,2 mg/dl\nGeb.-Datum: 01.02.1980').text;
    expect(r).toBe(`${REDACTED}\nKreatinin 1,2 mg/dl\n${REDACTED}`);
  });
  it('erkennt Anrede + Name, Straße und PLZ + Ort', () => {
    expect(kinds('Frau Anna Schmidt')).toContain('name');
    expect(kinds('Dr. med. vet. Peter Beispiel')).toContain('name');
    expect(kinds('Hauptstraße 12 a')).toContain('address');
    expect(kinds('65428 Rüsselsheim am Main')).toContain('address');
  });
  it('entfernt bekannte Begriffe unabhängig von Groß-/Kleinschreibung', () => {
    const r = redactText('Gesendet an MUSTERMANN, Praxis Tierwohl', ['Mustermann', 'Praxis Tierwohl', 'ab']);
    expect(r.text).toBe(`Gesendet an ${REDACTED}, ${REDACTED}`);
    expect(r.count).toBe(2);
  });
  it('lässt reine Laborzeilen unverändert', () => {
    const t = 'Kreatinin 1,2 mg/dl (0,5 - 1,8)\nALT 45 U/l (10 - 100)';
    expect(redactText(t).text).toBe(t);
  });
  it('Text ohne Treffer: unverändert, Zahl 0', () => {
    expect(redactText('Alles in Ordnung')).toEqual({ text: 'Alles in Ordnung', count: 0 });
  });
});

describe('hardPiiKinds (Server-Zweitkontrolle)', () => {
  it('meldet nur eindeutige Arten', () => {
    expect(hardPiiKinds('Mail a@b.de und Tel. 0170 1234567').sort()).toEqual(['email', 'phone']);
    expect(hardPiiKinds('Frau Anna Schmidt, 65428 Rüsselsheim')).toEqual([]);
    expect(hardPiiKinds('Kreatinin 1,2 mg/dl (0,5 - 1,8)')).toEqual([]);
  });
});

describe('labLines', () => {
  it('behält Laborzeilen und verwirft Briefkopf', () => {
    const t = ['Tierarztpraxis Muster', 'Frau Anna Schmidt', 'Hauptstraße 12', 'Kreatinin 1,2 mg/dl (0,5 - 1,8)', 'ALT 45 U/l', 'Leukozyten 8,1 x10^9/L 5,5 - 16,9', 'Mit freundlichen Grüßen'].join('\n');
    expect(labLines(t)).toEqual(['Kreatinin 1,2 mg/dl (0,5 - 1,8)', 'ALT 45 U/l', 'Leukozyten 8,1 x10^9/L 5,5 - 16,9']);
  });
  it('lange Zeilen und Zeilen ohne Zahl fallen weg', () => {
    expect(labLines(`${'a '.repeat(80)}1 mg/dl\nBefund unauffällig`)).toEqual([]);
  });
});
