import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_SIDE, fitSize, isImageFile } from './photo';

describe('Bildgröße berechnen', () => {
  it('Querformat: längste Seite wird 1200 px, Verhältnis bleibt', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
  });

  it('Hochformat (Handy): Höhe ist die längste Seite', () => {
    expect(fitSize(3024, 4032)).toEqual({ width: 900, height: 1200 });
  });

  it('Quadrat und genau 1200 px', () => {
    expect(fitSize(2000, 2000)).toEqual({ width: 1200, height: 1200 });
    expect(fitSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('kleine Bilder werden nicht vergrößert', () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('extrem schmale Bilder behalten mindestens 1 px', () => {
    const s = fitSize(10000, 2);
    expect(s.width).toBe(PHOTO_MAX_SIDE);
    expect(s.height).toBe(1);
  });

  it('ungültige Maße ergeben 0', () => {
    expect(fitSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitSize(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('Dateityp', () => {
  it('nur Bilder', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/heic' })).toBe(true);
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
});
