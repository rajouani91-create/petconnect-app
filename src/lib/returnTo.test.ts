import { afterEach, describe, expect, it } from 'vitest';
import { clearReturn, peekReturn, rememberReturn, safeReturn } from './returnTo';

// Testumgebung ohne Browser: einfacher sessionStorage
if (typeof globalThis.sessionStorage === 'undefined') {
  const m = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
  });
}

describe('Rücksprung nach der Anmeldung', () => {
  afterEach(() => clearReturn());
  it('behält Pfad, Suche und Sprungmarke', () => {
    rememberReturn('/mehr/rechnungen/abc?x=1#k');
    expect(peekReturn()).toBe('/mehr/rechnungen/abc?x=1#k');
  });
  it('lehnt fremde Ziele und Anmeldeseiten ab', () => {
    expect(safeReturn('https://evil.example')).toBeNull();
    expect(safeReturn('//evil.example')).toBeNull();
    expect(safeReturn('/\\evil')).toBeNull();
    expect(safeReturn('/login')).toBeNull();
    expect(safeReturn(5)).toBeNull();
    rememberReturn('//evil.example');
    expect(peekReturn()).toBeNull();
  });
  it('vergisst nach clearReturn', () => {
    rememberReturn('/termine?termin=1');
    clearReturn();
    expect(peekReturn()).toBeNull();
  });
});
