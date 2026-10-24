import { describe, expect, it } from 'vitest';
import { errorKind, parseAnswer } from './ai';

describe('errorKind', () => {
  it('ordnet Statuscodes und Fehlercodes ein', () => {
    expect(errorKind(401, { error: 'unauthenticated' })).toBe('auth');
    expect(errorKind(429, { error: 'rate_limit', reason: 'hour' })).toBe('rate_hour');
    expect(errorKind(429, { error: 'rate_limit', reason: 'day' })).toBe('rate_day');
    expect(errorKind(429, { error: 'rate_limit', reason: 'global' })).toBe('rate_global');
    expect(errorKind(429, null)).toBe('rate_day');
    expect(errorKind(400, { error: 'message_too_long' })).toBe('too_long');
    expect(errorKind(404, { error: 'pet_not_found' })).toBe('pet');
    expect(errorKind(503, { error: 'ai_busy' })).toBe('busy');
    expect(errorKind(502, { error: 'ai_unavailable' })).toBe('down');
    expect(errorKind(503, { error: 'not_configured' })).toBe('down');
    expect(errorKind(500, { error: 'internal' })).toBe('generic');
  });
});

describe('parseAnswer', () => {
  it('liest eine vollständige Antwort', () => {
    expect(parseAnswer({ reply: 'Hallo', emergency: true, sources: [{ title: 'The Dog API', url: 'https://thedogapi.com' }], used: ['profile'], dayLeft: 5 })).toEqual({
      reply: 'Hallo', emergency: true, sources: [{ title: 'The Dog API', url: 'https://thedogapi.com' }], used: ['profile'], dayLeft: 5,
    });
  });
  it('verwirft leere oder kaputte Antworten und unsichere Quellen-Links', () => {
    expect(parseAnswer(null)).toBeNull();
    expect(parseAnswer({ reply: '' })).toBeNull();
    expect(parseAnswer({ reply: 'x', sources: [{ title: 'a', url: 'javascript:alert(1)' }, { title: 'b', url: 'http://unsicher.example' }] })?.sources).toEqual([]);
    expect(parseAnswer({ reply: 'x' })).toMatchObject({ emergency: false, sources: [], used: [], dayLeft: null });
  });
});
