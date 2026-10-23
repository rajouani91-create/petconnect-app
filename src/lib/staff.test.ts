import { describe, expect, it } from 'vitest';
import { MAX_REASON, MIN_QUERY, isSearchable, reasonError } from './staff';

describe('isSearchable', () => {
  it('verlangt mindestens drei Zeichen nach dem Trimmen', () => {
    expect(MIN_QUERY).toBe(3);
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('ab')).toBe(false);
    expect(isSearchable('  ab  ')).toBe(false);
    expect(isSearchable('abc')).toBe(true);
    expect(isSearchable('  Rex  ')).toBe(true);
  });

  it('lässt Groß- und Kleinschreibung unverändert, die Suche entscheidet darüber', () => {
    expect(isSearchable('REX')).toBe(true);
    expect(isSearchable('rex')).toBe(true);
  });
});

describe('reasonError', () => {
  it('verlangt einen Grund', () => {
    expect(reasonError('')).toBe('required');
    expect(reasonError('   ')).toBe('required');
  });

  it('akzeptiert einen Grund bis zur Obergrenze', () => {
    expect(reasonError('Zahlungsbetrug vermutet')).toBeNull();
    expect(reasonError('x'.repeat(MAX_REASON))).toBeNull();
  });

  it('lehnt einen Grund über der Obergrenze ab', () => {
    expect(reasonError('x'.repeat(MAX_REASON + 1))).toBe('too_long');
  });

  it('zählt Leerzeichen am Rand nicht mit', () => {
    expect(reasonError(`  ${'x'.repeat(MAX_REASON)}  `)).toBeNull();
  });
});
