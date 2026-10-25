import { describe, expect, it } from 'vitest';
import { clampPos, defaultPos, isDrag, parsePos } from './fab';

const box = { width: 400, height: 800, top: 70, bottom: 90, side: 12 };

describe('clampPos', () => {
  it('lässt gültige Positionen unverändert', () => {
    expect(clampPos({ x: 100, y: 300 }, box)).toEqual({ x: 100, y: 300 });
  });
  it('hält den Button im sichtbaren Bereich', () => {
    expect(clampPos({ x: -50, y: -50 }, box)).toEqual({ x: 12, y: 70 });
    expect(clampPos({ x: 9999, y: 9999 }, box)).toEqual({ x: 400 - 56 - 12, y: 800 - 56 - 90 });
  });
  it('bleibt auch in sehr kleinen Fenstern sinnvoll', () => {
    const p = clampPos({ x: 500, y: 500 }, { width: 40, height: 50, top: 70, bottom: 90, side: 12 });
    expect(p).toEqual({ x: 12, y: 70 });
  });
});

describe('defaultPos', () => {
  it('liegt unten rechts über der Navigation', () => {
    expect(defaultPos(box)).toEqual({ x: 332, y: 654 });
  });
});

describe('parsePos', () => {
  it('liest gültige Werte', () => {
    expect(parsePos('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 });
  });
  it('lehnt Ungültiges ab', () => {
    expect(parsePos(null)).toBeNull();
    expect(parsePos('kaputt')).toBeNull();
    expect(parsePos('{"x":"a","y":1}')).toBeNull();
    expect(parsePos('{"x":null,"y":1}')).toBeNull();
  });
});

describe('isDrag', () => {
  it('unterscheidet Tippen und Ziehen', () => {
    expect(isDrag(2, 3)).toBe(false);
    expect(isDrag(10, 0)).toBe(true);
  });
});
