import { describe, expect, it } from 'vitest';
import { dueState, filterPatients, isCode, normalizeCode } from './practiceAccess';

describe('Praxis-Code', () => {
  it('Eingabe wird vereinheitlicht', () => {
    expect(normalizeCode(' bel-7kq 3m9 ')).toBe('BEL-7KQ-3M9');
    expect(normalizeCode('BEL7KQ3M9')).toBe('BEL-7KQ-3M9');
    expect(isCode('bel7kq3m9')).toBe(true);
    expect(isCode('BEL-7KQ-3M0')).toBe(false); // 0 ist nicht im Alphabet
    expect(normalizeCode('zu kurz')).toBe('ZU KURZ');
    expect(isCode('zu kurz')).toBe(false);
  });
});

describe('Fälligkeit', () => {
  it('überfällig, bald (≤ 14 Tage), ok', () => {
    expect(dueState('2026-11-13', '2026-11-14')).toBe('overdue');
    expect(dueState('2026-11-14', '2026-11-14')).toBe('soon');
    expect(dueState('2026-11-28', '2026-11-14')).toBe('soon');
    expect(dueState('2026-11-29', '2026-11-14')).toBe('ok');
  });
});

describe('Patientensuche', () => {
  const rows = [
    { name: 'Bello', breed: 'Labrador', owner_name: 'Ole Müller', species_other: null, species: 'dog' },
    { name: 'Mimi', breed: null, owner_name: 'Anna', species_other: null, species: 'cat' },
    { name: 'Ziggy', breed: null, owner_name: null, species_other: 'Frettchen', species: 'other' },
  ];
  const sp = (r: (typeof rows)[number]) => (r.species === 'dog' ? 'Hund' : r.species === 'cat' ? 'Katze' : r.species_other ?? '');
  it('nach Name, Tierart, Rasse oder Halter:in; ohne Akzente', () => {
    expect(filterPatients(rows, 'katze', sp).map((r) => r.name)).toEqual(['Mimi']);
    expect(filterPatients(rows, 'muller', sp).map((r) => r.name)).toEqual(['Bello']);
    expect(filterPatients(rows, 'frett', sp).map((r) => r.name)).toEqual(['Ziggy']);
    expect(filterPatients(rows, 'labra', sp).map((r) => r.name)).toEqual(['Bello']);
    expect(filterPatients(rows, '  ', sp)).toHaveLength(3);
    expect(filterPatients(rows, 'xyz', sp)).toHaveLength(0);
  });
});
