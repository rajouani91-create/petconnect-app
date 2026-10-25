import { describe, expect, it, vi } from 'vitest';
import { chat, ProviderFailure, type ProviderConfig } from './provider.ts';

const cfg: ProviderConfig = { apiKey: 'sk-test', baseUrl: 'https://api.example.test/v1/', model: 'm', maxOutputTokens: 100, timeoutMs: 1000 };
const msgs = [{ role: 'user' as const, content: 'hi' }];
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
const code = async (p: Promise<unknown>) => p.then(() => 'no error', (e: unknown) => (e instanceof ProviderFailure ? e.code : 'other'));

describe('chat', () => {
  it('sendet Anfrage mit Schlüssel an /chat/completions und liefert Text und Tokenzahlen', async () => {
    const f = vi.fn(async () => ok('Hallo'));
    const r = await chat(cfg, msgs, f as unknown as typeof fetch);
    expect(r).toEqual({ text: 'Hallo', promptTokens: 10, completionTokens: 5, truncated: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'm', max_completion_tokens: 100, reasoning_effort: 'low' });
  });
  it('Fehler 400 → zweiter Versuch ohne „reasoning_effort“', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('bad', { status: 400 })).mockResolvedValueOnce(ok('ok'));
    expect((await chat(cfg, msgs, f as unknown as typeof fetch)).text).toBe('ok');
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, { body: string }])[1].body)).not.toHaveProperty('reasoning_effort');
  });
  it('ordnet Fehler ein: 401/403 Schlüssel, 429 Limit, 5xx und Netzwerk nicht erreichbar, sonst allgemeiner Fehler', async () => {
    const r = (s: number) => (async () => new Response('x', { status: s })) as unknown as typeof fetch;
    expect(await code(chat(cfg, msgs, r(401)))).toBe('provider_auth');
    expect(await code(chat(cfg, msgs, r(403)))).toBe('provider_auth');
    expect(await code(chat(cfg, msgs, r(429)))).toBe('provider_rate');
    expect(await code(chat(cfg, msgs, r(503)))).toBe('provider_down');
    expect(await code(chat(cfg, msgs, r(418)))).toBe('provider_error');
    expect(await code(chat(cfg, msgs, (async () => { throw new Error('offline'); }) as unknown as typeof fetch))).toBe('provider_down');
  });
  it('leere oder kaputte Antwort → provider_error', async () => {
    expect(await code(chat(cfg, msgs, (async () => ok('  ')) as unknown as typeof fetch))).toBe('provider_error');
    expect(await code(chat(cfg, msgs, (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch))).toBe('provider_error');
  });
});

describe('Abbruch wegen Längenbegrenzung', () => {
  it('meldet truncated, wenn finish_reason „length“ ist', async () => {
    const f = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Halb' }, finish_reason: 'length' }] }), { status: 200 })) as unknown as typeof fetch;
    expect((await chat(cfg, [{ role: 'user', content: 'x' }], f)).truncated).toBe(true);
  });
});
