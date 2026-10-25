import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBreedCache, fetchBreed, pickBreed } from './breed.ts';

const shepherd = { name: 'German Shepherd', alt_names: 'GSD, Alsatian, Deutscher Schäferhund', origin: 'Germany', life_span: '9-13', temperament: 'Loyal', weight: { metric: '23-41' } };
const white = { name: 'White Shepherd', alt_names: null };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => clearBreedCache());

describe('pickBreed', () => {
  it('nimmt genauen Namen und Alternativnamen (auch mit Umlaut)', () => {
    expect(pickBreed([white, shepherd], 'german shepherd')?.name).toBe('German Shepherd');
    expect(pickBreed([white, shepherd], 'Deutscher Schaferhund')?.name).toBe('German Shepherd');
  });
  it('rät bei mehrdeutigen Treffern nicht', () => {
    expect(pickBreed([white, shepherd], 'Shepherd')).toBeNull();
  });
  it('ein einziger Treffer wird akzeptiert', () => {
    expect(pickBreed([shepherd], 'Shep')?.name).toBe('German Shepherd');
  });
});

describe('fetchBreed', () => {
  it('liefert Fakten und sendet den Schlüssel als Header', async () => {
    const f = vi.fn(async () => json([shepherd]));
    const r = await fetchBreed('dog', 'German Shepherd', { dogKey: 'K', fetchImpl: f as unknown as typeof fetch });
    expect(r.status).toBe('ok');
    expect(r.facts?.lifeSpan).toBe('9-13');
    const call = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(call[0]).toContain('thedogapi.com/v1/breeds/search?q=German%20Shepherd');
    expect(call[1].headers['x-api-key']).toBe('K');
  });
  it('zweite gleiche Anfrage kommt aus dem Zwischenspeicher', async () => {
    const f = vi.fn(async () => json([shepherd]));
    await fetchBreed('dog', 'German Shepherd', { fetchImpl: f as unknown as typeof fetch });
    await fetchBreed('dog', 'german shepherd', { fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('Katzen laufen über The Cat API', async () => {
    const f = vi.fn(async () => json([{ name: 'Maine Coon' }]));
    await fetchBreed('cat', 'Maine Coon', { fetchImpl: f as unknown as typeof fetch });
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('thecatapi.com');
  });
  it('andere Tierarten, keine Rasse, zu kurze Rasse: keine Anfrage', async () => {
    const f = vi.fn();
    expect((await fetchBreed('horse', 'Hannoveraner', { fetchImpl: f as unknown as typeof fetch })).status).toBe('none');
    expect((await fetchBreed('dog', null, { fetchImpl: f as unknown as typeof fetch })).status).toBe('none');
    expect((await fetchBreed('dog', 'ab', { fetchImpl: f as unknown as typeof fetch })).status).toBe('not_found');
    expect(f).not.toHaveBeenCalled();
  });
  it('unbekannte Rasse → not_found', async () => {
    const r = await fetchBreed('dog', 'Xyzzy', { fetchImpl: (async () => json([])) as unknown as typeof fetch });
    expect(r).toEqual({ status: 'not_found', facts: null });
  });
  it('API nicht erreichbar (Fehlercode, Netzwerk): unavailable, kein Absturz, nicht zwischengespeichert', async () => {
    const down = vi.fn(async () => json({}, 403));
    expect((await fetchBreed('dog', 'German Shepherd', { fetchImpl: down as unknown as typeof fetch })).status).toBe('unavailable');
    const boom = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchBreed('dog', 'German Shepherd', { fetchImpl: boom as unknown as typeof fetch })).status).toBe('unavailable');
    const up = vi.fn(async () => json([shepherd]));
    expect((await fetchBreed('dog', 'German Shepherd', { fetchImpl: up as unknown as typeof fetch })).status).toBe('ok');
  });
});
