import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('erkennt fett, kursiv und Code, lässt Rechenzeichen in Ruhe', () => {
    expect(parseInline('a **b** c *d* `e`')).toEqual([
      { t: 'text', s: 'a ' }, { t: 'bold', s: 'b' }, { t: 'text', s: ' c ' }, { t: 'italic', s: 'd' }, { t: 'text', s: ' ' }, { t: 'code', s: 'e' },
    ]);
    expect(parseInline('2 * 3 = 6')).toEqual([{ t: 'text', s: '2 * 3 = 6' }]);
  });
  it('setzt HTML und Links nicht um (bleiben Text)', () => {
    expect(parseInline('<img src=x onerror=alert(1)> [a](javascript:alert(1))')).toEqual([{ t: 'text', s: '<img src=x onerror=alert(1)> [a](javascript:alert(1))' }]);
  });
});

describe('parseMarkdown', () => {
  it('Überschriften, Absätze, Aufzählung, nummerierte Liste', () => {
    const b = parseMarkdown('### Titel\nText eins\nText zwei\n\n- a\n- b\n\n1. x\n2. y');
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'ul', 'ol']);
    expect(b[1]).toMatchObject({ k: 'p', inl: [{ t: 'text', s: 'Text eins\nText zwei' }] });
    expect(b[2]).toMatchObject({ k: 'ul' });
    expect((b[3] as { items: unknown[] }).items).toHaveLength(2);
  });
  it('Nummerierung behält den Startwert und fasst eingerückte Zeilen an', () => {
    const b = parseMarkdown('3. drei\n   weiter\n4. vier');
    expect(b[0]).toMatchObject({ k: 'ol', start: 3 });
    expect((b[0] as { items: { s: string }[][] }).items[0]!.map((i) => i.s).join('')).toBe('drei weiter');
  });
  it('Tabelle mit Kopf und Zeilen, fehlende Zellen werden aufgefüllt', () => {
    const b = parseMarkdown('| Wert | Ergebnis | Bereich |\n|---|:--:|---|\n| Kreatinin | 2,4 | 0,5 - 1,8 |\n| AP | 180 |');
    expect(b).toHaveLength(1);
    const t = b[0] as { head: unknown[]; rows: { s: string }[][][] };
    expect(t.head).toHaveLength(3);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[1]).toHaveLength(3);
    expect(t.rows[1]![2]).toEqual([]);
  });
  it('ein senkrechter Strich im Satz macht noch keine Tabelle', () => {
    expect(parseMarkdown('a | b | c')).toMatchObject([{ k: 'p' }]);
  });
  it('leerer Text ergibt keine Blöcke', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
