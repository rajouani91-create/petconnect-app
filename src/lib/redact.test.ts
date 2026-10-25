import { describe, expect, it } from 'vitest';
import { fitSize, knownTerms, rectFromPoints, redactText } from './redact';

describe('knownTerms', () => {
  it('nimmt Name, Wortteile (ab 4 Zeichen) und E-Mail samt Anfang', () => {
    expect(knownTerms('Max Muster', 'max.muster@example.de').sort()).toEqual(['Max Muster', 'Muster', 'max.muster', 'max.muster@example.de'].sort());
    expect(knownTerms(null, null)).toEqual([]);
    expect(knownTerms('Al', 'a@b')).toEqual([]);
  });
  it('wird beim Schwärzen angewendet', () => {
    expect(redactText('Max Muster kam vorbei', knownTerms('Max Muster', null)).text).toBe('[…] kam vorbei');
  });
});

describe('Bildgeometrie', () => {
  it('verkleinert auf höchstens 1600 Pixel, vergrößert nie', () => {
    expect(fitSize(3200, 1600)).toEqual({ w: 1600, h: 800 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(1, 1)).toEqual({ w: 1, h: 1 });
  });
  it('Rechteck aus beliebiger Zugrichtung, begrenzt und mit Mindestgröße', () => {
    expect(rectFromPoints(50, 40, 10, 10, 100, 100)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
    expect(rectFromPoints(-20, -20, 500, 500, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(rectFromPoints(10, 10, 12, 30, 100, 100)).toBeNull();
  });
});
