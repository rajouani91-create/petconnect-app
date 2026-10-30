import { describe, expect, it } from 'vitest';
import { parsePushAction } from './pushAction';

const ID = '3f315eff-5853-43e1-ae76-d0086f534f09';

describe('Aktion aus der Benachrichtigung', () => {
  it('Medikament: Gabe mit Uhrzeit', () => {
    expect(parsePushAction(`?gegeben=${ID}&zeit=16:02`)).toEqual({ kind: 'give', medId: ID, time: '16:02' });
  });
  it('Alltag: erledigt', () => {
    expect(parsePushAction(`?erledigt=${ID}`)).toEqual({ kind: 'done', id: ID });
  });
  it('ungültige oder fehlende Angaben werden ignoriert', () => {
    expect(parsePushAction('')).toBeNull();
    expect(parsePushAction(`?gegeben=${ID}`)).toBeNull();
    expect(parsePushAction(`?gegeben=${ID}&zeit=25:00`)).toBeNull();
    expect(parsePushAction('?gegeben=abc&zeit=10:00')).toBeNull();
    expect(parsePushAction('?erledigt=\'; drop table')).toBeNull();
  });
});
