import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { taskKey, taskOf } = await import('./taskSync');

describe('taskOf', () => {
  it('Alltag: Tag aus dem Zeitpunkt (Berliner Zeit)', () => {
    const t = taskOf({ kind: 'routine', ref_id: 'r1', slot: '2026-11-26T23:30:00Z', info: {} });
    expect(t).toEqual({ type: 'routine', ref: 'r1', day: '2026-11-27', time: null });
  });
  it('Medikament: Uhrzeit aus info, Tag aus info.on (später erinnert)', () => {
    const t = taskOf({ kind: 'medication', ref_id: 'm1', slot: '2026-11-27T07:30:00Z', info: { time: '08:00', on: '2026-11-26' } });
    expect(t).toEqual({ type: 'medication', ref: 'm1', day: '2026-11-26', time: '08:00' });
  });
  it('ohne Uhrzeit oder andere Arten: keine Aufgabe', () => {
    expect(taskOf({ kind: 'medication', ref_id: 'm1', slot: '2026-11-27T07:30:00Z', info: {} })).toBeNull();
    expect(taskOf({ kind: 'reminder', ref_id: 'x', slot: '2026-11-27T07:30:00Z', info: {} })).toBeNull();
    expect(taskOf({ kind: 'routine', ref_id: null, slot: '2026-11-27T07:30:00Z', info: {} })).toBeNull();
  });
  it('Schlüssel unterscheidet Uhrzeiten', () => {
    const a = taskKey({ type: 'medication', ref: 'm1', day: '2026-11-26', time: '08:00' });
    const b = taskKey({ type: 'medication', ref: 'm1', day: '2026-11-26', time: '20:00' });
    expect(a).not.toBe(b);
  });
});
