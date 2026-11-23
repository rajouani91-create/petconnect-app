import { describe, expect, it } from 'vitest';
import { euro, hoursText, notifCategoryName } from './dashboard';

describe('Dashboard Praxen', () => {
  it('formatiert Euro auch aus Text', () => {
    expect(euro('661.46')).toBe('661,46 €');
    expect(euro(1234.5)).toBe('1.235 €');
    expect(euro(null)).toBe('0,00 €');
    expect(euro('abc')).toBe('0,00 €');
  });
  it('zeigt Antwortzeiten lesbar', () => {
    expect(hoursText(null)).toBe('–');
    expect(hoursText(0.25)).toBe('15 Min.');
    expect(hoursText('3.5')).toBe('3,5 Std.');
    expect(hoursText(72)).toBe('3 Tage');
  });
  it('benennt Kategorien', () => {
    expect(notifCategoryName('care')).toBe('Alltag/Pflege');
    expect(notifCategoryName('neu')).toBe('neu');
  });
});
