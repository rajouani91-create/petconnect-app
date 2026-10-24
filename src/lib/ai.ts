// Anbindung an die Edge Function „pet-ai-chat“. Der Schlüssel des KI-Anbieters liegt nur dort (Supabase-Secret), nie im Browser.

export interface AiMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
export interface AiSource {
  readonly title: string;
  readonly url: string;
}
export interface AiAnswer {
  readonly reply: string;
  readonly emergency: boolean;
  readonly sources: readonly AiSource[];
  readonly used: readonly string[];
  readonly dayLeft: number | null;
}
export type AiErrorKind = 'auth' | 'rate_hour' | 'rate_day' | 'rate_global' | 'busy' | 'down' | 'network' | 'too_long' | 'pet' | 'generic';

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind) {
    super(kind);
    this.name = 'AiError';
  }
}

export const AI_MAX_INPUT = 1000;
/** So viele frühere Nachrichten gehen mit (Kontext, aber begrenzte Kosten). */
export const AI_HISTORY = 8;

export function errorKind(status: number, body: { error?: string; reason?: string } | null): AiErrorKind {
  const e = body?.error;
  if (status === 401) return 'auth';
  if (status === 429) return body?.reason === 'hour' ? 'rate_hour' : body?.reason === 'global' ? 'rate_global' : 'rate_day';
  if (e === 'message_too_long' || e === 'too_long_total') return 'too_long';
  if (e === 'pet_not_found' || e === 'invalid_pet') return 'pet';
  if (e === 'ai_busy') return 'busy';
  if (e === 'ai_unavailable' || e === 'ai_misconfigured' || e === 'not_configured') return 'down';
  return 'generic';
}

export function parseAnswer(raw: unknown): AiAnswer | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.reply !== 'string' || r.reply === '') return null;
  const sources = Array.isArray(r.sources)
    ? r.sources.filter((s): s is AiSource => typeof s === 'object' && s !== null && typeof (s as AiSource).title === 'string' && String((s as AiSource).url).startsWith('https://'))
    : [];
  return {
    reply: r.reply,
    emergency: r.emergency === true,
    sources,
    used: Array.isArray(r.used) ? r.used.filter((u): u is string => typeof u === 'string') : [],
    dayLeft: typeof r.dayLeft === 'number' ? r.dayLeft : null,
  };
}

export async function askAssistant(messages: readonly AiMessage[], petId: string | null, lang: string, signal?: AbortSignal): Promise<AiAnswer> {
  const { supabase } = await import('./supabase'); // erst beim Senden laden (Tests brauchen keine Konfiguration)
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError('auth');
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/pet-ai-chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
      body: JSON.stringify({ messages: messages.slice(-AI_HISTORY), petId, lang }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new AiError('network');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* keine JSON-Antwort */
  }
  if (!res.ok) throw new AiError(errorKind(res.status, body as { error?: string; reason?: string } | null));
  const answer = parseAnswer(body);
  if (!answer) throw new AiError('generic');
  return answer;
}
