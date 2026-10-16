import { describe, expect, it } from 'vitest';
import { templateFor } from './templates';
import { SPECIES, type Species } from './domain';

const plan = (s: Species) => templateFor(s).map((e) => `${e.kind} ${e.time} ${e.repeat}`);

describe('templateFor', () => {
  it('Hund: 4 Gassirunden und 2 Mahlzeiten, täglich', () => {
    expect(plan('dog')).toEqual([
      'walk 07:00 daily',
      'feed 07:30 daily',
      'walk 12:30 daily',
      'walk 18:00 daily',
      'feed 18:30 daily',
      'walk 21:30 daily',
    ]);
  });

  it('Katze', () => {
    expect(plan('cat')).toEqual(['feed 07:00 daily', 'feed 18:30 daily', 'litter 20:00 daily']);
  });

  it('Kaninchen und Meerschweinchen: Gehege am Wochenende', () => {
    const expected = ['feed 07:30 daily', 'feed 18:00 daily', 'cage 10:00 weekends'];
    expect(plan('rabbit')).toEqual(expected);
    expect(plan('guinea')).toEqual(expected);
  });

  it('Vogel', () => {
    expect(plan('bird')).toEqual(['feed 08:00 daily', 'cage 10:00 weekends']);
  });

  it('Reptil', () => {
    expect(plan('reptile')).toEqual(['terra 09:00 daily']);
  });

  it('Pferd', () => {
    expect(plan('horse')).toEqual(['feed 07:00 daily', 'muck 08:00 daily', 'feed 18:00 daily']);
  });

  it('Anderes Tier: keine Vorlage', () => {
    expect(templateFor('other')).toEqual([]);
  });

  it('liefert für jede Art eine Liste mit gültigen Uhrzeiten', () => {
    for (const s of SPECIES) {
      for (const e of templateFor(s)) expect(e.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
  });

  it('gibt Kopien zurück – Änderungen wirken sich nicht auf spätere Aufrufe aus', () => {
    const a = templateFor('rabbit');
    (a as { time: string }[])[0]!.time = '00:00';
    a.pop();
    expect(templateFor('rabbit')).toHaveLength(3);
    expect(templateFor('guinea')[0]!.time).toBe('07:30');
  });
});
