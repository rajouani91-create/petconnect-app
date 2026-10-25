/* KI-Anbieter hinter einer kleinen Schnittstelle. Spricht das „OpenAI-kompatible“ Chat-Format (Groq, Mistral, OpenAI, …).
   Anbieter wechseln = Secrets AI_BASE_URL / AI_MODEL / AI_API_KEY ändern; Oberfläche und Handler bleiben gleich. */

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string; // z. B. https://api.groq.com/openai/v1
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
}
export type ProviderError = 'provider_auth' | 'provider_rate' | 'provider_down' | 'provider_error';
export class ProviderFailure extends Error {
  constructor(public code: ProviderError, public status?: number) {
    super(code);
  }
}
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}
export interface ProviderReply {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  /** true, wenn der Anbieter wegen der Längenbegrenzung abgebrochen hat (finish_reason „length“) */
  truncated: boolean;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function post(cfg: ProviderConfig, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    return await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ProviderFailure('provider_down');
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(cfg: ProviderConfig, messages: ProviderMessage[], fetchImpl: typeof fetch = fetch): Promise<ProviderReply> {
  const base = { model: cfg.model, messages, temperature: 0.4, max_completion_tokens: cfg.maxOutputTokens };
  // „reasoning_effort“ gibt es nur bei Denkmodellen (z. B. gpt-oss). Lehnt der Anbieter es ab, wird ohne gesendet.
  let res = await post(cfg, { ...base, reasoning_effort: 'low' }, fetchImpl);
  if (res.status === 400) {
    await res.body?.cancel();
    res = await post(cfg, base, fetchImpl);
  }
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel();
    throw new ProviderFailure('provider_auth', res.status);
  }
  if (res.status === 429) {
    await res.body?.cancel();
    throw new ProviderFailure('provider_rate', 429);
  }
  if (res.status >= 500) {
    await res.body?.cancel();
    throw new ProviderFailure('provider_down', res.status);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new ProviderFailure('provider_error', res.status);
  }
  let json: ChatResponse;
  try {
    json = (await res.json()) as ChatResponse;
  } catch {
    throw new ProviderFailure('provider_error', res.status);
  }
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim() === '') throw new ProviderFailure('provider_error', res.status);
  return {
    text,
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    truncated: json.choices?.[0]?.finish_reason === 'length',
  };
}
